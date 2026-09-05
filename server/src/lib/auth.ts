// 管理端鉴权：argon2 校验密码，JWT 放在 httpOnly cookie 里。
// 分权只有两级：SUPER 能改配置和账号，REVIEWER 只能审核排期下载（REQUIREMENTS.md 第 0 节）。
import { verify } from '@node-rs/argon2'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.js'
import { prisma } from './db.js'
import { isAdminRole } from './domain.js'
import type { AdminRole } from './domain.js'
import { AppError, forbidden } from './errors.js'

export const SESSION_COOKIE = 'yy_admin'

export interface SessionUser {
  id: string
  username: string
  role: AdminRole
  mustChangePassword: boolean
}

/** JWT 里只放这些，权限每次请求都回库核对，避免停用账号还能用旧 token */
interface TokenPayload {
  sub: string
}

export function assertAuthConfigured(): void {
  if (config.jwtSecret.length < 32) {
    throw new Error('缺少 JWT_SECRET（至少 32 字符），生成方法见 DEPLOY.md')
  }
}

export async function checkPassword(username: string, password: string): Promise<SessionUser> {
  const user = await prisma.adminUser.findUnique({ where: { username: username.trim() } })
  // 找不到账号也走一次 verify，避免用响应快慢猜出用户名是否存在
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000'
  const ok = await verify(hash, password).catch(() => false)
  if (!user || !ok || user.disabled) {
    throw new AppError('BAD_CREDENTIALS', 401, '账号或密码不对')
  }
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  return {
    id: user.id,
    username: user.username,
    role: isAdminRole(user.role) ? user.role : 'REVIEWER',
    mustChangePassword: user.mustChangePassword,
  }
}

export function issueSession(reply: FastifyReply, userId: string): void {
  const token = reply.server.jwt.sign({ sub: userId } satisfies TokenPayload, {
    expiresIn: config.sessionMaxAgeSec,
  })
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.sessionMaxAgeSec,
  })
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** 从 cookie 里的 token 还原当前用户；每次都回库核对，停用即刻生效 */
async function currentUser(request: FastifyRequest): Promise<SessionUser | null> {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null
  let payload: TokenPayload
  try {
    payload = request.server.jwt.verify<TokenPayload>(token)
  } catch {
    return null
  }
  const user = await prisma.adminUser.findUnique({ where: { id: payload.sub } })
  if (!user || user.disabled) return null
  return {
    id: user.id,
    username: user.username,
    role: isAdminRole(user.role) ? user.role : 'REVIEWER',
    mustChangePassword: user.mustChangePassword,
  }
}

export async function readSession(request: FastifyRequest): Promise<SessionUser | null> {
  return currentUser(request)
}

/** 挂在管理端路由上的前置钩子：任何角色都行，但必须登录 */
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  const user = await currentUser(request)
  if (!user) throw new AppError('UNAUTHENTICATED', 401, '请先登录')
  request.admin = user
}

/** 只有超管能过：改配置、管账号都走这个 */
export async function requireSuper(request: FastifyRequest): Promise<void> {
  await requireAdmin(request)
  if (request.admin?.role !== 'SUPER') throw forbidden('FORBIDDEN', '这项只有超级管理员能做')
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: SessionUser
  }
}
