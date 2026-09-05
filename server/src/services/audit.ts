// 操作日志：谁、何时、从哪里、对哪条、做了什么（CONTEXT.md 第 6 节）。
// 写日志失败不能让主流程回滚，所以这里自己吞掉异常只记 warn。
import { AsyncLocalStorage } from 'node:async_hooks'
import { prisma } from '../lib/db.js'
import { encodeDetail } from '../lib/domain.js'

export type AuditAction =
  | 'login'
  | 'password.change'
  | 'request.schedule'
  | 'request.reject'
  | 'request.manual'
  | 'schedule.reorder'
  | 'schedule.remove'
  | 'request.batch'
  | 'config.site'
  | 'config.slots'
  | 'config.calendar'
  | 'config.grades'
  | 'config.words'
  | 'source.login'
  | 'source.cookie'
  | 'source.clear'
  | 'user.create'
  | 'user.update'

export interface AuditContext {
  ip?: string
  userAgent?: string
}

const auditContext = new AsyncLocalStorage<AuditContext>()

export function runWithAuditContext<T>(context: AuditContext, callback: () => T): T {
  return auditContext.run(context, callback)
}

export async function writeAudit(
  actorId: string | null,
  action: AuditAction,
  targetId: string | null,
  detail?: unknown,
): Promise<void> {
  try {
    const context = auditContext.getStore()
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetId,
        detail: encodeDetail(detail),
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      },
    })
  } catch {
    // 日志写不进去不该影响业务，调用方也不需要知道
  }
}
