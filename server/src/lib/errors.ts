/**
 * 可预期的业务错误。路由层统一转成 { error: { code, message } }，
 * message 是给学生看的中文，code 给前端做分支。
 *
 * detail 字段说明（可选）：
 * - badRequest: { field?: string; reason?: string; value?: unknown }
 * - tooMany: { limit?: number; window?: string; retryAfterSeconds?: number }
 * - forbidden: { resource?: string; requiredRole?: string }
 * - notFound: { resource?: string; id?: string }
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (code: string, message: string, detail?: Record<string, unknown>) =>
  new AppError(code, 400, message, detail)

export const notFound = (code: string, message: string, detail?: Record<string, unknown>) =>
  new AppError(code, 404, message, detail)

export const tooMany = (code: string, message: string, detail?: Record<string, unknown>) =>
  new AppError(code, 429, message, detail)

export const forbidden = (code: string, message: string, detail?: Record<string, unknown>) =>
  new AppError(code, 403, message, detail)
