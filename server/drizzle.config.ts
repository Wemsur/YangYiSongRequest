/**
 * Drizzle Kit 配置文件
 * 用于生成迁移文件和类型
 */
import { defineConfig } from 'drizzle-kit';

const databaseProvider = process.env.DATABASE_PROVIDER ?? 'sqlite';
const databaseUrl = process.env.DATABASE_URL ?? 'file:./data/app.db';

export default defineConfig({
  out: './src/drizzle/migrations',
  schema:
    databaseProvider === 'sqlite'
      ? './src/drizzle/schema-sqlite.ts'
      : './src/drizzle/schema-pg.ts',
  driver: databaseProvider === 'sqlite' ? 'better-sqlite3' : 'pg',
  dbCredentials:
    databaseProvider === 'sqlite'
      ? { url: databaseUrl }
      : { connectionString: databaseUrl },
  tablesFilter: ['*'],
  introspect: {
    casing: 'camel',
  },
});
