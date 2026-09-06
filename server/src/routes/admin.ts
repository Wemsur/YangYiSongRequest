// 管理端接口。/api/admin/* 一律要登录，改配置与看日志要超管（REQUIREMENTS.md 第 0 节）。
import { hash } from '@node-rs/argon2'
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import {
  checkPassword,
  clearSession,
  issueSession,
  readSession,
  requireAdmin,
  requireSuper,
} from '../lib/auth.js'
import { db, schema } from '../lib/db.js'
import { decodeDetail } from '../lib/domain.js'
import { badRequest } from '../lib/errors.js'
import { LOGIN_RATE_LIMIT } from '../lib/rate-limits.js'
import { writeAudit } from '../services/audit.js'
import {
  listRequests,
  manualAdd,
  readAdminDay,
  rejectRequest,
  reorderSlot,
  scheduleRequest,
  unschedule,
} from '../services/schedule.js'

interface LoginBody {
  username?: string
  password?: string
}

interface BatchBody {
  ids?: string[]
  action?: 'schedule' | 'reject'
  playDate?: string
  slotId?: string
  reason?: string
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: LoginBody }>(
    '/api/admin/login',
    { config: { rateLimit: LOGIN_RATE_LIMIT } },
    async (request, reply) => {
      const { username, password } = request.body ?? {}
      if (!username || !password) throw badRequest('MISSING_FIELDS', '账号和密码都要填')
      const user = await checkPassword(username, password)
      issueSession(reply, user.id)
      await writeAudit(user.id, 'login', null, { username: user.username })
      return { username: user.username, role: user.role, mustChangePassword: user.mustChangePassword }
    },
  )

  app.post('/api/admin/logout', async (_request, reply) => {
    clearSession(reply)
    return { ok: true }
  })

  /** 前端启动时问一次：null 表示没登录 */
  app.get('/api/admin/me', async (request) => {
    const user = await readSession(request)
    if (!user) return null
    return { username: user.username, role: user.role, mustChangePassword: user.mustChangePassword }
  })

  await app.register(async (scoped) => {
    scoped.addHook('preHandler', requireAdmin)

    scoped.post<{ Body: { current?: string; next?: string } }>(
      '/api/admin/password',
      async (request) => {
        const { current, next } = request.body ?? {}
        const me = request.admin
        if (!me || !current || !next) throw badRequest('MISSING_FIELDS', '两个密码都要填')
        if (next.length < 8) throw badRequest('WEAK_PASSWORD', '新密码至少 8 位')
        await checkPassword(me.username, current)
        
        // CONVERSION #1: prisma.adminUser.update -> db.update().set().where()
        await (db as any)
          .update(schema.adminUser)
          .set({ passwordHash: await hash(next), mustChangePassword: false })
          .where(eq(schema.adminUser.id, me.id))
        
        await writeAudit(me.id, 'password.change', me.id)
        return { ok: true }
      },
    )

    scoped.get<{ Querystring: { status?: string; date?: string; page?: string } }>(
      '/api/admin/requests',
      async (request) =>
        listRequests({
          status: request.query.status,
          date: request.query.date,
          page: Number(request.query.page ?? 1) || 1,
        }),
    )

    scoped.get<{ Params: { date: string } }>('/api/admin/schedule/:date', async (request) =>
      readAdminDay(request.params.date),
    )

    scoped.post<{ Params: { id: string }; Body: { playDate?: string; slotId?: string } }>(
      '/api/admin/requests/:id/schedule',
      async (request) => {
        const { playDate, slotId } = request.body ?? {}
        if (!playDate || !slotId) throw badRequest('MISSING_FIELDS', '日期和时段都要给')
        return scheduleRequest(request.admin!.id, request.params.id, playDate, slotId)
      },
    )

    scoped.post<{ Params: { id: string }; Body: { reason?: string } }>(
      '/api/admin/requests/:id/reject',
      async (request) => {
        await rejectRequest(request.admin!.id, request.params.id, request.body?.reason ?? '')
        return { ok: true }
      },
    )

    scoped.post<{ Params: { id: string } }>(
      '/api/admin/requests/:id/unschedule',
      async (request) => {
        await unschedule(request.admin!.id, request.params.id)
        return { ok: true }
      },
    )

    /** 批量：整批里有个别失败不影响其他，逐条回报结果 */
    scoped.post<{ Body: BatchBody }>('/api/admin/requests/batch', async (request) => {
      const { ids = [], action, playDate, slotId, reason } = request.body ?? {}
      if (ids.length === 0) throw badRequest('EMPTY_BATCH', '一条都没选')
      if (ids.length > 50) throw badRequest('BATCH_TOO_BIG', '一次最多 50 条')
      const actorId = request.admin!.id

      const failed: Array<{ id: string; message: string }> = []
      let done = 0
      for (const id of ids) {
        try {
          if (action === 'reject') {
            await rejectRequest(actorId, id, reason ?? '')
          } else {
            if (!playDate || !slotId) throw badRequest('MISSING_FIELDS', '日期和时段都要给')
            await scheduleRequest(actorId, id, playDate, slotId)
          }
          done += 1
        } catch (error) {
          failed.push({ id, message: error instanceof Error ? error.message : '失败' })
        }
      }
      await writeAudit(actorId, 'request.batch', null, { action, count: done, failed: failed.length })
      return { done, failed }
    })

    scoped.post<{ Body: { playDate?: string; slotId?: string; orderedIds?: string[] } }>(
      '/api/admin/schedule/reorder',
      async (request) => {
        const { playDate, slotId, orderedIds } = request.body ?? {}
        if (!playDate || !slotId || !Array.isArray(orderedIds)) {
          throw badRequest('MISSING_FIELDS', '日期、时段和顺序都要给')
        }
        await reorderSlot(request.admin!.id, playDate, slotId, orderedIds)
        return { ok: true }
      },
    )

    scoped.post<{
      Body: { source?: string; platformId?: string; playDate?: string; slotId?: string }
    }>('/api/admin/requests/manual', async (request) => {
      const { source, platformId, playDate, slotId } = request.body ?? {}
      if (!source || !platformId) throw badRequest('MISSING_FIELDS', '音源和歌曲都要给')
      return manualAdd(request.admin!.id, { source, platformId, playDate, slotId })
    })

    scoped.get<{ Querystring: { page?: string } }>(
      '/api/admin/audit',
      { preHandler: requireSuper },
      async (request) => {
        const page = Math.max(1, Number(request.query.page ?? 1) || 1)
        const take = 50
        
        // CONVERSION #2-3: prisma.auditLog.count() and findMany()
        // 获取总数
        const countResult = await (db as any).select().from(schema.auditLog)
        const total = countResult.length
        
        // 获取分页数据，使用 leftJoin 获取关联的用户名
        const rows = await (db as any)
          .select({
            id: schema.auditLog.id,
            action: schema.auditLog.action,
            targetId: schema.auditLog.targetId,
            detail: schema.auditLog.detail,
            ip: schema.auditLog.ip,
            userAgent: schema.auditLog.userAgent,
            createdAt: schema.auditLog.createdAt,
            actorUsername: schema.adminUser.username,
          })
          .from(schema.auditLog)
          .leftJoin(schema.adminUser, eq(schema.auditLog.actorId, schema.adminUser.id))
          .orderBy(desc(schema.auditLog.createdAt))
          .limit(take)
          .offset((page - 1) * take) as Array<{
            id: string
            action: string
            targetId: string | null
            detail: string | null
            ip: string | null
            userAgent: string | null
            createdAt: Date | number
            actorUsername: string | null
          }>
        
        return {
          total,
          page,
          items: rows.map((row) => ({
            id: row.id,
            actor: row.actorUsername ?? '(已删除)',
            action: row.action,
            targetId: row.targetId,
            detail: decodeDetail(row.detail),
            ip: row.ip,
            userAgent: row.userAgent,
            createdAt: row.createdAt instanceof Date 
              ? row.createdAt.toISOString() 
              : new Date(row.createdAt).toISOString(),
          })),
        }
      },
    )
  })
}
