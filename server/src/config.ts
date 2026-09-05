import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(path.join(here, '..', 'package.json'), 'utf8'),
) as { version: string }

const databaseProvider = process.env.DATABASE_PROVIDER ?? 'sqlite'
if (databaseProvider !== 'sqlite' && databaseProvider !== 'postgresql') {
  throw new Error('DATABASE_PROVIDER 只能是 sqlite 或 postgresql')
}

const rawDatabaseUrl = process.env.DATABASE_URL ?? 'file:./data/app.db'
if (databaseProvider === 'postgresql' && !/^postgres(ql)?:\/\//.test(rawDatabaseUrl)) {
  throw new Error('使用 PostgreSQL 时必须提供 postgres:// 或 postgresql:// 格式的 DATABASE_URL')
}

const sqliteFile =
  databaseProvider === 'sqlite'
    ? path.resolve(here, '..', rawDatabaseUrl.replace(/^file:/, ''))
    : null

/**
 * 跑起服务所必需的几项集中在这里读取和校验，不在业务代码里散着读 process.env。
 * JWT、音源密钥等在对应阶段（S6 / S7）加进来。
 */
export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  version: pkg.version,
  /** 生产环境下前端构建产物的位置，由本服务直接托管 */
  webDist: path.resolve(here, '..', '..', 'web', 'dist'),
  databaseProvider,
  databaseUrl: databaseProvider === 'sqlite' ? `file:${sqliteFile}` : rawDatabaseUrl,
  /** SQLite 数据库文件的绝对路径；使用 PostgreSQL 时为空 */
  sqliteFile,
  /** 全站统一时区：库里存 UTC，展示与排期按这个时区换算 */
  timezone: 'Asia/Shanghai',
  /** 管理端 JWT 签名密钥。生产必须给，缺了直接启动失败，不允许用默认值 */
  jwtSecret: process.env.JWT_SECRET ?? '',
  /** 登录态有效期 */
  sessionMaxAgeSec: 12 * 60 * 60,
  /**
   * 酷狗上游 sidecar（kugoumusicapi）的地址，取址与将来的扫码登录走它。
   * 置空则只用直连实现；连不上会自动回落，不会让酷狗整源不可用。
   */
  kugouApiUrl: (process.env.KUGOU_API_URL ?? 'http://127.0.0.1:3300').replace(/\/+$/, ''),
} as const
