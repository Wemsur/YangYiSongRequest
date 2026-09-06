// 下载类接口单独一个插件：它们回的是文件流，和 JSON 接口的错误处理路径不太一样。
// 都要登录（审核员也能下载，见 REQUIREMENTS.md 第 0 节）。
import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '../lib/auth.js'
import { db, schema } from '../lib/db.js'
import { badRequest } from '../lib/errors.js'
import { contentDisposition } from '../lib/format.js'
import { DAY_DOWNLOAD_RATE_LIMIT, SONG_DOWNLOAD_RATE_LIMIT } from '../lib/rate-limits.js'
import { buildDayCsv, buildTrack, createDayArchive, dayZipName } from '../services/download.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export const adminDownloadRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin)

  app.get<{ Params: { id: string } }>(
    '/api/admin/download/song/:id',
    { config: { rateLimit: SONG_DOWNLOAD_RATE_LIMIT } },
    async (request, reply) => {
      const track = await buildTrack(request.params.id)
      reply.header('content-type', 'application/octet-stream')
      reply.header('content-disposition', contentDisposition(track.filename))
      reply.header('content-length', track.buffer.byteLength)
      return reply.send(track.buffer)
    },
  )

  app.get<{ Params: { date: string }; Querystring: { slotId?: string } }>(
    '/api/admin/download/day/:date',
    { config: { rateLimit: DAY_DOWNLOAD_RATE_LIMIT } },
    async (request, reply) => {
      const { date } = request.params
      if (!DATE.test(date)) throw badRequest('BAD_DATE', '日期格式不对')

      const slotId = request.query.slotId?.trim() || undefined
       let slotName: string | undefined
       if (slotId) {
         const slots = await db.select({ name: schema.broadcastSlot.name })
           .from(schema.broadcastSlot)
           .where(eq(schema.broadcastSlot.id, slotId))
         const slot = slots[0]
         if (!slot) throw badRequest('BAD_SLOT', '时段不对')
         slotName = slot.name
       }

      reply.header('content-type', 'application/zip')
      reply.header('content-disposition', contentDisposition(dayZipName(date, slotName)))
      // 边取边压，不落盘：Render 那会儿的约束没了，但这仍然是对的做法
      return reply.send(createDayArchive(date, slotId))
    },
  )

  app.get<{ Params: { date: string } }>('/api/admin/export/day/:date', async (request, reply) => {
    if (!DATE.test(request.params.date)) throw badRequest('BAD_DATE', '日期格式不对')
    const csv = await buildDayCsv(request.params.date)
    reply.header('content-type', 'text/csv; charset=utf-8')
    reply.header('content-disposition', contentDisposition(`${request.params.date}_播出单.csv`))
    return reply.send(csv)
  })
}
