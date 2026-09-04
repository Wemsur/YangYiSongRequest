import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // 用 process.env 而不是 prisma 的 env()：CLI 每次调用都会加载本文件，
    // 而 prisma generate / typecheck 并不需要连库，env() 缺变量时会直接抛错。
    url: process.env.DATABASE_URL ?? '',
  },
})
