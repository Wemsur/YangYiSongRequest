import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(path.join(here, '..', 'package.json'), 'utf8'),
) as { version: string }

/**
 * S1 只需要跑起服务所必需的几项。数据库、JWT、音源密钥等在对应阶段加进来，
 * 一律在这里集中读取和校验，不在业务代码里散着读 process.env。
 */
export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  version: pkg.version,
  /** 生产环境下前端构建产物的位置，由本服务直接托管 */
  webDist: path.resolve(here, '..', '..', 'web', 'dist'),
} as const
