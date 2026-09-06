/**
 * Drizzle ORM 数据库连接
 * 支持 SQLite 和 PostgreSQL 两种数据库
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { config } from '../config.js';
import * as schemaSqlite from './schema-sqlite.js';
import * as schemaPg from './schema-pg.js';

// 初始化数据库连接
let db: any;

if (config.sqliteFile) {
  // SQLite 连接
  mkdirSync(path.dirname(config.sqliteFile), { recursive: true });
  const sqlite = new Database(config.sqliteFile);
  db = drizzleSqlite(sqlite, { schema: schemaSqlite });
} else {
  // PostgreSQL 连接
  const pool = new Pool({
    connectionString: config.databaseUrl,
  });
  db = drizzlePg(pool, { schema: schemaPg });
}

export { db };

/**
 * 获取当前使用的 schema
 * 用于类型安全的 schema 访问
 */
export const schema = config.sqliteFile ? schemaSqlite : schemaPg;
