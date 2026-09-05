import { afterEach, describe, expect, it, vi } from 'vitest'
import { createKugouSource } from './kugou.js'

const noCookie = async () => null
/** 单测只验归一化逻辑，关掉上游 sidecar 这条路 */
const kugou = () => createKugouSource(noCookie, { upstreamUrl: '' })

/** 用返回体工厂替掉全局 fetch，只测归一化逻辑，不碰真实接口 */
function stubFetch(reply: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => new Response(JSON.stringify(reply(String(input))))),
  )
}

const searchItem = {
  FileHash: 'abc123def456',
  SongName: '起风了<em>现场</em>',
  SingerName: '买辣椒也用券',
  AlbumName: '起风了 (旧版)',
  Duration: 312,
  Privilege: 10,
  Image: 'http://imge.kugou.com/stdmusic/{size}/a.jpg',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('酷狗搜索归一化', () => {
  it('去掉高亮标签、补全封面尺寸、秒转毫秒、标出付费', async () => {
    stubFetch(() => ({ status: 1, data: { total: 480, lists: [searchItem] } }))
    const page = await kugou().search('起风了', 1, 20)

    expect(page.total).toBe(480)
    expect(page.songs).toHaveLength(1)
    expect(page.songs[0]).toMatchObject({
      source: 'kugou',
      platformId: 'ABC123DEF456',
      title: '起风了现场',
      artist: '买辣椒也用券',
      album: '起风了 (旧版)',
      durationMs: 312_000,
      coverUrl: 'http://imge.kugou.com/stdmusic/240/a.jpg',
      vip: true,
    })
  })
})

describe('酷狗取址', () => {
  it('付费歌拿不到地址时返回 null', async () => {
    stubFetch(() => ({ status: 0, errcode: 0, songName: '海阔天空', url: '' }))
    const target = await kugou().streamTarget('ABC')
    expect(target).toBeNull()
  })

  it('免费歌返回 128k 完整地址，并带上防盗链 referer', async () => {
    stubFetch(() => ({
      status: 1,
      errcode: 0,
      songName: '卡农',
      url: 'https://sharefs.kugou.com/x.mp3',
      bitRate: 128,
      extName: 'mp3',
      fileSize: 5_000_000,
    }))
    const target = await kugou().streamTarget('ABC')
    expect(target).toMatchObject({
      url: 'https://sharefs.kugou.com/x.mp3',
      bitrateKbps: 128,
      format: 'mp3',
      sizeBytes: 5_000_000,
      preview: false,
    })
    expect(target?.headers?.referer).toBe('https://m.kugou.com/')
  })

  it('付费歌详情时长为 0，会回搜一次把时长补上', async () => {
    stubFetch((url) =>
      url.includes('getSongInfo')
        ? { status: 0, errcode: 0, songName: '海阔天空', choricSinger: 'BEYOND', timeLength: 0, url: '' }
        : { status: 1, data: { total: 1, lists: [{ ...searchItem, FileHash: 'ABC', Duration: 324 }] } },
    )
    const summary = await kugou().detail('ABC')
    expect(summary).toMatchObject({ title: '海阔天空', artist: 'BEYOND', durationMs: 324_000, vip: true })
  })
})

