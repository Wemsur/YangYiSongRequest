// 下载：单曲实时代理、按天流式打包，服务器上不留文件（CONTEXT.md 第 6 节）。
// 打包时每首歌整曲读进内存、写完 ID3 再塞进 zip。一首几 MB，顺序处理峰值就一首；
// 换成纯流式转发就没法补标签和封面了，这个取舍是有意的。
// archiver 8 起不再默认导出工厂函数，改成导出 ZipArchive 这些类
import { ZipArchive } from 'archiver'
import type { Archiver } from 'archiver'
import NodeID3 from 'node-id3'
import { prisma } from '../lib/db.js'
import { notFound } from '../lib/errors.js'
import { UA_DESKTOP } from '../sources/http.js'
import { getSource } from '../sources/index.js'
import type { AudioTarget } from '../sources/types.js'
import { duration } from '../lib/format.js'

/** Windows 与 Linux 都不接受的字符，直接删掉 */
const sanitize = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || '未命名'

const pad2 = (value: number): string => String(value).padStart(2, '0')

export interface TrackFile {
  filename: string
  buffer: Buffer
  lyric: string | null
}

async function fetchBinary(target: AudioTarget): Promise<Buffer> {
  const response = await fetch(target.url, {
    headers: { 'user-agent': UA_DESKTOP, ...(target.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`音源返回 HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function fetchCover(url: string | null): Promise<Buffer | null> {
  if (!url) return null
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': UA_DESKTOP, referer: 'https://music.163.com/' },
    })
    if (!response.ok) return null
    return Buffer.from(await response.arrayBuffer())
  } catch {
    return null
  }
}

/** 只有 mp3 写 ID3；flac 要的是 Vorbis comment，不在这次范围内 */
function writeTags(
  buffer: Buffer,
  format: string,
  meta: { title: string; artist: string; album: string | null; trackNumber?: number },
  cover: Buffer | null,
): Buffer {
  if (format !== 'mp3') return buffer
  try {
    const tagged = NodeID3.write(
      {
        title: meta.title,
        artist: meta.artist,
        ...(meta.album ? { album: meta.album } : {}),
        ...(meta.trackNumber ? { trackNumber: String(meta.trackNumber) } : {}),
        ...(cover
          ? { image: { mime: 'image/jpeg', type: { id: 3 }, description: 'cover', imageBuffer: cover } }
          : {}),
      },
      buffer,
    )
    return Buffer.isBuffer(tagged) ? tagged : buffer
  } catch {
    // 标签写失败不该让整首歌下不下来
    return buffer
  }
}

/** 取一首歌的完整文件。orderNo 给了就作为文件名前缀（播出顺序） */
export async function buildTrack(requestId: string, orderNo?: number): Promise<TrackFile> {
  const request = await prisma.songRequest.findUnique({ where: { id: requestId } })
  if (!request) throw notFound('REQUEST_NOT_FOUND', '这条点歌不存在')

  const source = getSource(request.source)
  if (!source) throw notFound('BAD_SOURCE', '音源不对')

  const target = await source.downloadTarget(request.platformId)
  if (!target) {
    throw notFound('NO_AUDIO', `《${request.title}》拿不到可下载的地址，多半是付费歌`)
  }

  const format = target.format ?? 'mp3'
  const [audio, cover, lyric] = await Promise.all([
    fetchBinary(target),
    fetchCover(request.coverUrl),
    source.lyric(request.platformId).catch(() => null),
  ])

  const prefix = orderNo ? `${pad2(orderNo)}_` : ''
  return {
    filename: `${prefix}${sanitize(request.title)} - ${sanitize(request.artist)}.${format}`,
    buffer: writeTags(
      audio,
      format,
      {
        title: request.title,
        artist: request.artist,
        album: request.album,
        trackNumber: orderNo,
      },
      cover,
    ),
    lyric,
  }
}

interface DayRow {
  requestId: string
  orderNo: number
  slotName: string
  title: string
  artist: string
  durationMs: number
  requester: string
}

async function readDayRows(date: string, slotId?: string): Promise<DayRow[]> {
  const rows = await prisma.schedule.findMany({
    where: { playDate: date, ...(slotId ? { slotId } : {}) },
    include: {
      slot: { select: { name: true, sortOrder: true } },
      request: {
        select: {
          id: true,
          title: true,
          artist: true,
          durationMs: true,
          grade: true,
          classNo: true,
          requesterName: true,
          isManual: true,
        },
      },
    },
    orderBy: [{ slot: { sortOrder: 'asc' } }, { orderNo: 'asc' }],
  })

  const gradeText: Record<string, string> = { G1: '高一', G2: '高二', G3: '高三' }
  return rows.map((row) => ({
    requestId: row.request.id,
    orderNo: row.orderNo,
    slotName: row.slot.name,
    title: row.request.title,
    artist: row.request.artist,
    durationMs: row.request.durationMs,
    requester: row.request.requesterName
      ? `${gradeText[row.request.grade ?? ''] ?? ''}${row.request.classNo ?? ''}班 ${row.request.requesterName}`
      : row.request.isManual
        ? '管理员补录'
        : '匿名',
  }))
}

export function dayZipName(date: string, slotName?: string): string {
  return `${date}_${sanitize(slotName ?? '全天')}.zip`
}

/**
 * 按天打包。返回 archiver 流，路由直接 pipe 给 reply。
 * 单曲失败只记进「缺失清单.txt」，不让整包失败——台里宁可少一首也不要一个都拿不到。
 * 音频本身已经是压缩格式，zip 再压没收益，所以 level 0，纯打包更快。
 */
export function createDayArchive(date: string, slotId?: string): Archiver {
  const archive = new ZipArchive({ zlib: { level: 0 } })

  void (async () => {
    try {
      const rows = await readDayRows(date, slotId)
      if (rows.length === 0) {
        archive.append(`${date} 这天没有排歌。\n`, { name: '空的.txt' })
        await archive.finalize()
        return
      }

      const missing: string[] = []
      // 整天打包时按时段分子目录，单时段就平铺
      const grouped = slotId === undefined
      for (const row of rows) {
        const folder = grouped ? `${sanitize(row.slotName)}/` : ''
        try {
          const track = await buildTrack(row.requestId, row.orderNo)
          archive.append(track.buffer, { name: `${folder}${track.filename}` })
          if (track.lyric) {
            const base = track.filename.replace(/\.[^.]+$/, '')
            archive.append(track.lyric, { name: `${folder}${base}.lrc` })
          }
        } catch (error) {
          missing.push(
            `${row.slotName} 第 ${row.orderNo} 首  ${row.title} - ${row.artist}` +
              `  原因：${error instanceof Error ? error.message : '未知'}`,
          )
        }
      }

      archive.append(buildPlaylistText(date, rows), { name: '播出单.txt' })
      if (missing.length > 0) {
        archive.append(
          `以下歌曲没能下载，需要台里手动处理：\n\n${missing.join('\n')}\n`,
          { name: '缺失清单.txt' },
        )
      }
      await archive.finalize()
    } catch (error) {
      archive.emit('error', error instanceof Error ? error : new Error('打包失败'))
    }
  })()

  return archive
}

/** 给主播念的稿子 */
function buildPlaylistText(date: string, rows: DayRow[]): string {
  const lines = [`${date} 播出单`, '']
  let slot = ''
  for (const row of rows) {
    if (row.slotName !== slot) {
      slot = row.slotName
      lines.push(`【${slot}】`)
    }
    lines.push(
      `${pad2(row.orderNo)}. ${row.title} — ${row.artist}  (${duration(row.durationMs)})  点歌人：${row.requester}`,
    )
  }
  return `${lines.join('\n')}\n`
}

/** 导出成 Excel 能直接打开的 CSV：加 BOM，免得中文乱码 */
export async function buildDayCsv(date: string): Promise<string> {
  const rows = await readDayRows(date)
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines = ['时段,序号,歌名,歌手,时长,点歌人'].concat(
    rows.map((row) =>
      [
        escape(row.slotName),
        String(row.orderNo),
        escape(row.title),
        escape(row.artist),
        duration(row.durationMs),
        escape(row.requester),
      ].join(','),
    ),
  )
  return `﻿${lines.join('\r\n')}\r\n`
}

export { readDayRows }
