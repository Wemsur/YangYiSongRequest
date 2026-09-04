import path from 'node:path'
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// SQLite 的相对路径有两套解析基准：Prisma CLI 按 schema 文件所在目录算，
// 运行时的 driver adapter 按进程 cwd 算。为了两边永远指向同一个文件，
// 这里统一把 DATABASE_URL 里的相对路径解析成绝对路径（基准是 server 包目录）。
// src/config.ts 里有同样的逻辑，两处要一起改。
const relative = (process.env.DATABASE_URL ?? 'file:./data/app.db').replace(/^file:/, '')
const absolute = path.resolve(import.meta.dirname, relative)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: `file:${absolute}`,
  },
})
