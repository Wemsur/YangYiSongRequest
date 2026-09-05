// 超管专属：站点开关、播出时段、行政历、班数、敏感词、音源账号、管理员账号。
// 整个插件挂一个 requireSuper 钩子，审核员访问一律 403（REQUIREMENTS.md 第 7 节）。
import { hash } from '@node-rs/argon2'
import type { FastifyPluginAsync } from 'fastify'
import { requireSuper } from '../lib/auth.js'
import { prisma } from '../lib/db.js'
import { isAdminRole, isSource } from '../lib/domain.js'
import type { SourceId } from '../lib/domain.js'
import { badRequest, notFound } from '../lib/errors.js'
import { writeAudit } from '../services/audit.js'
import {
  readBannedWords,
  readCalendar,
  saveBannedWords,
  saveCalendar,
  saveGradeCounts,
  saveSiteSettings,
  saveSlots,
} from '../services/config.js'
import type { CalendarInput, SiteInput, SlotInput } from '../services/config.js'
import { clearCookie, listCredentials, recordCheck, saveCookie } from '../services/credentials.js'
import { readSite } from '../services/site.js'
import { neteaseQrCheck, neteaseQrStart } from '../services/source-accounts.js'
import { checkAll } from '../sources/index.js'

function requireSourceId(value: string): SourceId {
  if (!isSource(value)) throw badRequest('BAD_SOURCE', '音源不对')
  return value
}

export const adminConfigRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireSuper)

  app.get('/api/admin/config/site', async () => readSite())

  app.put<{ Body: SiteInput }>('/api/admin/config/site', async (request) => {
    await saveSiteSettings(request.body ?? {})
    await writeAudit(request.admin!.id, 'config.site', null, request.body)
    return readSite()
  })

  app.get('/api/admin/config/slots', async () =>
    prisma.broadcastSlot.findMany({ orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }] }),
  )

  app.put<{ Body: { slots?: SlotInput[] } }>('/api/admin/config/slots', async (request) => {
    const slots = request.body?.slots
    if (!Array.isArray(slots)) throw badRequest('MISSING_FIELDS', '没收到时段列表')
    await saveSlots(slots)
    await writeAudit(request.admin!.id, 'config.slots', null, { count: slots.length })
    return prisma.broadcastSlot.findMany({ orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }] })
  })

  app.get<{ Querystring: { month?: string } }>('/api/admin/config/calendar', async (request) =>
    readCalendar(request.query.month ?? ''),
  )

  app.put<{ Body: { days?: CalendarInput[] } }>('/api/admin/config/calendar', async (request) => {
    const days = request.body?.days
    if (!Array.isArray(days)) throw badRequest('MISSING_FIELDS', '没收到日期列表')
    await saveCalendar(days)
    await writeAudit(request.admin!.id, 'config.calendar', null, { count: days.length })
    return { ok: true }
  })

  app.get('/api/admin/config/grades', async () =>
    prisma.gradeConfig.findMany({ orderBy: { grade: 'asc' } }),
  )

  app.put<{ Body: { counts?: Record<string, number> } }>(
    '/api/admin/config/grades',
    async (request) => {
      const counts = request.body?.counts
      if (!counts) throw badRequest('MISSING_FIELDS', '没收到班数')
      await saveGradeCounts(counts)
      await writeAudit(request.admin!.id, 'config.grades', null, counts)
      return prisma.gradeConfig.findMany({ orderBy: { grade: 'asc' } })
    },
  )

  app.get('/api/admin/config/words', async () => ({ words: await readBannedWords() }))

  app.put<{ Body: { words?: string[] } }>('/api/admin/config/words', async (request) => {
    const words = request.body?.words
    if (!Array.isArray(words)) throw badRequest('MISSING_FIELDS', '没收到词表')
    const count = await saveBannedWords(words)
    await writeAudit(request.admin!.id, 'config.words', null, { count })
    return { words: await readBannedWords() }
  })

  /** 音源账号总览：有没有配 Cookie、上次体检结果 */
  app.get('/api/admin/sources', async () => listCredentials())

  /** 三家并行体检；配了 Cookie 的顺手把结果记下来 */
  app.get('/api/admin/sources/health', async () => {
    const results = await checkAll()
    await Promise.all(
      results.filter((item) => item.hasCredential).map((item) => recordCheck(item.source, item.ok)),
    )
    return results
  })

  app.post('/api/admin/sources/netease/qrcode', async (request) => {
    const started = await neteaseQrStart()
    await writeAudit(request.admin!.id, 'source.login', 'netease', { step: 'qrcode' })
    return started
  })

  app.get<{ Querystring: { key?: string } }>(
    '/api/admin/sources/netease/qrcode/check',
    async (request) => {
      const key = request.query.key
      if (!key) throw badRequest('MISSING_FIELDS', '缺少二维码 key')
      const result = await neteaseQrCheck(key)
      if (result.status === 'ok') {
        await writeAudit(request.admin!.id, 'source.cookie', 'netease', { via: '扫码' })
      }
      return result
    },
  )

  /** QQ 与酷狗没有扫码登录，只能手工粘贴 Cookie */
  app.put<{ Params: { source: string }; Body: { cookie?: string; note?: string } }>(
    '/api/admin/sources/:source/cookie',
    async (request) => {
      const source = requireSourceId(request.params.source)
      const cookie = request.body?.cookie?.trim()
      if (!cookie) throw badRequest('MISSING_FIELDS', 'Cookie 是空的')
      await saveCookie(source, cookie, request.body?.note ?? '手工粘贴')
      await writeAudit(request.admin!.id, 'source.cookie', source, { via: '手工粘贴' })
      return listCredentials()
    },
  )

  app.delete<{ Params: { source: string } }>(
    '/api/admin/sources/:source/cookie',
    async (request) => {
      const source = requireSourceId(request.params.source)
      await clearCookie(source)
      await writeAudit(request.admin!.id, 'source.clear', source)
      return listCredentials()
    },
  )

  app.get('/api/admin/users', async () =>
    prisma.adminUser.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        disabled: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  )

  app.post<{ Body: { username?: string; password?: string; role?: string } }>(
    '/api/admin/users',
    async (request) => {
      const username = request.body?.username?.trim() ?? ''
      const password = request.body?.password ?? ''
      const role = request.body?.role ?? 'REVIEWER'
      if (username.length < 3 || username.length > 20) {
        throw badRequest('BAD_USERNAME', '账号名 3 到 20 个字符')
      }
      if (password.length < 8) throw badRequest('WEAK_PASSWORD', '密码至少 8 位')
      if (!isAdminRole(role)) throw badRequest('BAD_ROLE', '角色不对')
      if (await prisma.adminUser.findUnique({ where: { username } })) {
        throw badRequest('DUP_USERNAME', '这个账号名已经有了')
      }

      const created = await prisma.adminUser.create({
        data: { username, passwordHash: await hash(password), role, mustChangePassword: true },
        select: { id: true, username: true, role: true },
      })
      await writeAudit(request.admin!.id, 'user.create', created.id, { username, role })
      return created
    },
  )

  app.patch<{
    Params: { id: string }
    Body: { disabled?: boolean; role?: string; password?: string }
  }>('/api/admin/users/:id', async (request) => {
    const target = await prisma.adminUser.findUnique({ where: { id: request.params.id } })
    if (!target) throw notFound('USER_NOT_FOUND', '账号不存在')

    const { disabled, role, password } = request.body ?? {}
    // 别把自己锁在门外：不能停用自己，也不能把自己降成审核员
    if (target.id === request.admin!.id && (disabled === true || (role && role !== 'SUPER'))) {
      throw badRequest('SELF_LOCKOUT', '不能停用或降级自己的账号')
    }
    if (role !== undefined && !isAdminRole(role)) throw badRequest('BAD_ROLE', '角色不对')
    if (password !== undefined && password.length < 8) {
      throw badRequest('WEAK_PASSWORD', '密码至少 8 位')
    }

    await prisma.adminUser.update({
      where: { id: target.id },
      data: {
        ...(disabled === undefined ? {} : { disabled }),
        ...(role === undefined ? {} : { role }),
        ...(password === undefined
          ? {}
          : { passwordHash: await hash(password), mustChangePassword: true }),
      },
    })
    await writeAudit(request.admin!.id, 'user.update', target.id, {
      disabled,
      role,
      passwordReset: password !== undefined,
    })
    return { ok: true }
  })
}
