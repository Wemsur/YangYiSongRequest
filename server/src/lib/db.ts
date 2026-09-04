import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { config } from '../config.js'

if (!config.databaseUrl) {
  throw new Error('缺少环境变量 DATABASE_URL，配置方法见 DEPLOY.md 与 server/.env.example')
}

const adapter = new PrismaPg({ connectionString: config.databaseUrl })

export const prisma = new PrismaClient({
  adapter,
  log: ['warn', 'error'],
})
