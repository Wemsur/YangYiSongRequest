import path from 'node:path';
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const provider = process.env.DATABASE_PROVIDER ?? 'sqlite';
if (provider !== 'sqlite' && provider !== 'postgresql') {
  throw new Error('DATABASE_PROVIDER 只能是 sqlite 或 postgresql');
}

const rawUrl = process.env.DATABASE_URL ?? 'file:./data/app.db';
if (provider === 'postgresql' && !/^postgres(ql)?:\/\//.test(rawUrl)) {
  throw new Error('使用 PostgreSQL 时必须提供 postgres:// 或 postgresql:// 格式的 DATABASE_URL');
}
const url =
  provider === 'sqlite'
    ? `file:${path.resolve(import.meta.dirname, rawUrl.replace(/^file:/, ''))}`
    : rawUrl;

export default defineConfig({
  schema: provider === 'sqlite' ? 'prisma/schema.prisma' : 'prisma/schema.postgresql.prisma',
  migrations: {
    path: provider === 'sqlite' ? 'prisma/migrations' : 'prisma/migrations-postgresql',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url,
  },
});
