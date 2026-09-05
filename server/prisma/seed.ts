// 种子数据：初始超管、两个播出时段、三个年级的班数、站点开关。
// 全部幂等，可重复执行：`npm run seed --workspace server`
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const provider = process.env.DATABASE_PROVIDER ?? 'sqlite';
if (provider !== 'sqlite' && provider !== 'postgresql') {
  throw new Error('DATABASE_PROVIDER 只能是 sqlite 或 postgresql');
}

const rawUrl = process.env.DATABASE_URL ?? 'file:./data/app.db';
const sqliteFile =
  provider === 'sqlite'
    ? path.resolve(import.meta.dirname, '..', rawUrl.replace(/^file:/, ''))
    : null;
if (sqliteFile) mkdirSync(path.dirname(sqliteFile), { recursive: true });

const prisma = new PrismaClient({
  adapter: sqliteFile
    ? new PrismaBetterSqlite3({ url: `file:${sqliteFile}` })
    : new PrismaPg({ connectionString: rawUrl }),
});

/** 台里现行时段；上限按每首约 4 分钟估，管理员可在后台调整 */
const SLOTS = [
  { name: '午间档', startTime: '12:00', endTime: '12:30', sortOrder: 0, maxCount: 6 },
  { name: '晚间档', startTime: '17:40', endTime: '18:00', sortOrder: 1, maxCount: 4 },
];

const SITE_DEFAULTS: Record<string, string> = {
  requestsOpen: 'true',
  requireIdentity: 'true',
  announcement: '',
  maxScheduleDays: '14',
};

async function seedAdmin() {
  const username = process.env.SEED_ADMIN_USER?.trim() || 'yadmin';
  if (await prisma.adminUser.findUnique({ where: { username } })) {
    console.log(`超管 ${username} 已存在，跳过`);
    return;
  }
  const provided = process.env.SEED_ADMIN_PASSWORD?.trim();
  const password = provided || randomBytes(9).toString('base64url');
  await prisma.adminUser.create({
    data: {
      username,
      passwordHash: await hash(password),
      role: 'SUPER',
      mustChangePassword: true,
    },
  });
  console.log(
    provided
      ? `已创建超管 ${username}，首次登录会要求改密`
      : `已创建超管 ${username}，随机初始密码：${password}\n  这串只打印这一次，登录后立即修改`
  );
}

async function seedSlots() {
  for (const slot of SLOTS) {
    await prisma.broadcastSlot.upsert({
      where: { name: slot.name },
      update: {},
      create: slot,
    });
  }
  console.log(`播出时段：${SLOTS.map((s) => `${s.name} ${s.startTime}-${s.endTime}`).join('，')}`);
}

async function seedGrades() {
  for (const grade of ['G1', 'G2', 'G3'] as const) {
    await prisma.gradeConfig.upsert({
      where: { grade },
      update: {},
      create: { grade, classCount: 23 },
    });
  }
  console.log('年级班数：高一 / 高二 / 高三 各 23 个班');
}

async function seedSiteSettings() {
  for (const [key, value] of Object.entries(SITE_DEFAULTS)) {
    await prisma.siteSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log(`站点开关：${Object.keys(SITE_DEFAULTS).join('、')}`);
}

try {
  await seedAdmin();
  await seedSlots();
  await seedGrades();
  await seedSiteSettings();
  console.log('种子数据写入完成');
} finally {
  await prisma.$disconnect();
}
