import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(path.join(here, '..', 'package.json'), 'utf8'),
) as { version: string }

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
  /** Postgres 连接串；缺失时 src/lib/db.ts 会给出明确报错 */
  databaseUrl: process.env.DATABASE_URL ?? '',
  /** 全站统一时区：库里存 UTC，展示与排期按这个时区换算 */
  timezone: 'Asia/Shanghai',
} as const
