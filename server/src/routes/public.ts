// 前台接口。全部免登录，但都在 app.ts 的全局限流下，提交与试听另有更严的阈值。
// 契约见 API.md，改这里要同步那份。
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import type { FastifyPluginAsync } from 'fastify'
import { AppError, badRequest, notFound } from '../lib/errors.js'
import { lookupByCode, submitRequest } from '../services/requests.js'
import type { SubmitInput } from '../services/requests.js'
import { listPastMonths, readDate, readRecent } from '../services/playlist.js'
import { readSite } from '../services/site.js'
import { UA_DESKTOP } from '../sources/http.js'
import { getSource } from '../sources/index.js'

const PAGE_SIZE = 20
const MAX_PAGE = 20

/** 音源 id + 平台歌曲 id 是好几个接口共用的入参 */
interface SongParams {
  source: string
  platformId: string
}

function requireSource(id: string) {
  const source = getSource(id)
  if (!source) throw badRequest('BAD_SOURCE', '音源不对')
  return source
}

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/site', async () => readSite())

  app.get<{ Querystring: { q?: string; source?: string; page?: string } }>(
    '/api/search',
    async (request) => {
      const keyword = (request.query.q ?? '').trim()
      if (!keyword) throw badRequest('EMPTY_KEYWORD', '先输个关键词')
      if (keyword.length > 60) throw badRequest('LONG_KEYWORD', '关键词太长了')
      const source = requireSource(request.query.source ?? '')
      const page = Math.min(Math.max(Number(request.query.page ?? 1) || 1, 1), MAX_PAGE)
      return source.search(keyword, page, PAGE_SIZE)
    },
  )

  app.get<{ Params: SongParams }>('/api/song/:source/:platformId', async (request) => {
    const song = await requireSource(request.params.source).detail(request.params.platformId)
    if (!song) throw notFound('SONG_NOT_FOUND', '这首歌查不到了')
    return song
  })

  app.get<{ Params: SongParams }>('/api/lyric/:source/:platformId', async (request) => {
    const text = await requireSource(request.params.source).lyric(request.params.platformId)
    return { lyric: text }
  })

  // 试听代理：前台永不接触平台真实直链（见 CONTEXT.md 第 6 节）。
  // Range 原样转发，这样进度条能拖动；防盗链所需的 referer 由音源层给出。
  app.get<{ Params: SongParams }>(
    '/api/stream/:source/:platformId',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const source = requireSource(request.params.source)
      const target = await source.streamTarget(request.params.platformId)
      if (!target) throw notFound('NO_AUDIO', '这首歌拿不到试听地址')

      const range = request.headers.range
      const upstream = await fetch(target.url, {
        headers: {
          'user-agent': UA_DESKTOP,
          ...(target.headers ?? {}),
          ...(range ? { range } : {}),
        },
      })
      if (!upstream.body || (!upstream.ok && upstream.status !== 206)) {
        throw new AppError('UPSTREAM_FAILED', 502, '音源那边没给音频')
      }

      reply.code(upstream.status)
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(name)
        if (value) reply.header(name, value)
      }
      if (!upstream.headers.get('content-type')) {
        reply.header('content-type', target.format === 'flac' ? 'audio/flac' : 'audio/mpeg')
      }
      if (!upstream.headers.get('accept-ranges')) reply.header('accept-ranges', 'bytes')
      // 直链有时效，不能让浏览器或中间层缓存
      reply.header('cache-control', 'private, no-store')
      return reply.send(Readable.fromWeb(upstream.body as WebReadableStream))
    },
  )

  app.post<{ Body: SubmitInput }>(
    '/api/requests',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const result = await submitRequest(request.body ?? ({} as SubmitInput), request.ip)
      return reply.code(201).send(result)
    },
  )

  app.get<{ Params: { code: string } }>('/api/requests/:code', async (request) =>
    lookupByCode(request.params.code),
  )

  // 歌单：只露出已排期与已播出的歌，不含任何点歌人信息
  app.get('/api/playlist/recent', async () => readRecent())

  app.get('/api/playlist/months', async () => listPastMonths())

  app.get<{ Params: { date: string } }>('/api/playlist/date/:date', async (request) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.params.date)) {
      throw badRequest('BAD_DATE', '日期格式不对')
    }
    return readDate(request.params.date)
  })
}
