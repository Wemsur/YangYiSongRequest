import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { config } from '../config.js';

if (config.sqliteFile) mkdirSync(path.dirname(config.sqliteFile), { recursive: true });

const adapter = config.sqliteFile
  ? new PrismaBetterSqlite3({ url: config.databaseUrl })
  : new PrismaPg({ connectionString: config.databaseUrl });

export const prisma = new PrismaClient({
  adapter,
  log: ['warn', 'error'],
});
