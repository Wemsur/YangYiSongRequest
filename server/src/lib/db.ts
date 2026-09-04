import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client.js'
import { config } from '../config.js'

// 首次启动时数据目录可能还不存在，better-sqlite3 不会自己建目录
mkdirSync(path.dirname(config.sqliteFile), { recursive: true })

const adapter = new PrismaBetterSqlite3({ url: `file:${config.sqliteFile}` })

export const prisma = new PrismaClient({
  adapter,
  log: ['warn', 'error'],
})
