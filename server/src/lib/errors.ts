/**
 * 可预期的业务错误。路由层统一转成 { error: { code, message } }，
 * message 是给学生看的中文，code 给前端做分支。
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

export const notFound = (code: string, message: string) => new AppError(code, 404, message)

export const tooMany = (code: string, message: string) => new AppError(code, 429, message)

export const forbidden = (code: string, message: string) => new AppError(code, 403, message)
