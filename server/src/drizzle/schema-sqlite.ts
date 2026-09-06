/**
 * Drizzle ORM Schema for SQLite
 * 数据模型说明见 docs/API.md，修改需同步 schema-pg.ts 和迁移文件
 */
import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable as table, text } from 'drizzle-orm/sqlite-core';

// ==================== SongRequest ====================
export const songRequest = table(
  'SongRequest',
  {
    id: text('id').primaryKey(),
    queryCode: text('queryCode').unique().notNull(),
    source: text('source').notNull(), // netease | qq | kugou
    platformId: text('platformId').notNull(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    album: text('album'),
    durationMs: integer('durationMs').notNull(),
    coverUrl: text('coverUrl'),
    grade: text('grade'), // G1 | G2 | G3
    classNo: integer('classNo'),
    requesterName: text('requesterName'),
    status: text('status').default('PENDING').notNull(), // PENDING | SCHEDULED | PLAYED | REJECTED
    rejectReason: text('rejectReason'),
    flaggedWords: text('flaggedWords').default('[]').notNull(), // JSON array string
    isManual: integer('isManual', { mode: 'boolean' }).default(false).notNull(),
    submitIp: text('submitIp').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .default(sql`(datetime('now'))`)
      .notNull(),
    reviewedAt: integer('reviewedAt', { mode: 'timestamp_ms' }),
    reviewedById: text('reviewedById'),
  },
  (table) => ({
    statusCreatedAtIdx: sql`CREATE INDEX IF NOT EXISTS "SongRequest_status_createdAt_idx" ON ${table}("status", "createdAt")`,
    gradeClassNoRequesterNameIdx: sql`CREATE INDEX IF NOT EXISTS "SongRequest_grade_classNo_requesterName_createdAt_idx" ON ${table}("grade", "classNo", "requesterName", "createdAt")`,
    submitIpCreatedAtIdx: sql`CREATE INDEX IF NOT EXISTS "SongRequest_submitIp_createdAt_idx" ON ${table}("submitIp", "createdAt")`,
    reviewedByFk: sql`FOREIGN KEY (reviewedById) REFERENCES AdminUser(id) ON DELETE SET NULL`,
  }),
);

// ==================== Schedule ====================
export const schedule = table(
  'Schedule',
  {
    id: text('id').primaryKey(),
    requestId: text('requestId').unique().notNull(),
    playDate: text('playDate').notNull(), // YYYY-MM-DD
    slotId: text('slotId').notNull(),
    orderNo: integer('orderNo').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (table) => ({
    uniquePlayDateSlotOrderNo: sql`UNIQUE(playDate, slotId, orderNo)`,
    playDateIdx: sql`CREATE INDEX IF NOT EXISTS "Schedule_playDate_idx" ON ${table}("playDate")`,
    requestIdFk: sql`FOREIGN KEY (requestId) REFERENCES SongRequest(id) ON DELETE CASCADE`,
    slotIdFk: sql`FOREIGN KEY (slotId) REFERENCES BroadcastSlot(id) ON DELETE RESTRICT`,
  }),
);

// ==================== BroadcastSlot ====================
export const broadcastSlot = table('BroadcastSlot', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  startTime: text('startTime').notNull(), // HH:mm
  endTime: text('endTime').notNull(), // HH:mm
  maxCount: integer('maxCount'),
  maxMs: integer('maxMs'),
  sortOrder: integer('sortOrder').default(0).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
});

// ==================== CalendarDay ====================
export const calendarDay = table('CalendarDay', {
  date: text('date').primaryKey(), // YYYY-MM-DD
  kind: text('kind').notNull(), // SCHOOL | OFF | EXAM_NO_BROADCAST
  note: text('note'),
});

// ==================== AdminUser ====================
export const adminUser = table('AdminUser', {
  id: text('id').primaryKey(),
  username: text('username').unique().notNull(),
  passwordHash: text('passwordHash').notNull(),
  role: text('role').default('REVIEWER').notNull(), // SUPER | REVIEWER
  mustChangePassword: integer('mustChangePassword', { mode: 'boolean' }).default(false).notNull(),
  disabled: integer('disabled', { mode: 'boolean' }).default(false).notNull(),
  lastLoginAt: integer('lastLoginAt', { mode: 'timestamp_ms' }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .default(sql`(datetime('now'))`)
    .notNull(),
});

// ==================== AuditLog ====================
export const auditLog = table(
  'AuditLog',
  {
    id: text('id').primaryKey(),
    actorId: text('actorId'),
    action: text('action').notNull(),
    targetId: text('targetId'),
    detail: text('detail'), // JSON string
    ip: text('ip'),
    userAgent: text('userAgent'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (table) => ({
    createdAtIdx: sql`CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON ${table}("createdAt")`,
    actorIdCreatedAtIdx: sql`CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON ${table}("actorId", "createdAt")`,
    actorIdFk: sql`FOREIGN KEY (actorId) REFERENCES AdminUser(id) ON DELETE SET NULL`,
  }),
);

// ==================== GradeConfig ====================
export const gradeConfig = table('GradeConfig', {
  grade: text('grade').primaryKey(), // G1 | G2 | G3
  classCount: integer('classCount').notNull(),
});

// ==================== BannedWord ====================
export const bannedWord = table('BannedWord', {
  word: text('word').primaryKey(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .default(sql`(datetime('now'))`)
    .notNull(),
});

// ==================== SourceCredential ====================
export const sourceCredential = table('SourceCredential', {
  source: text('source').primaryKey(), // netease | qq | kugou
  encryptedData: text('encryptedData').notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .$onUpdateFn(() => new Date()),
  lastCheckAt: integer('lastCheckAt', { mode: 'timestamp_ms' }),
  lastCheckOk: integer('lastCheckOk', { mode: 'boolean' }),
  note: text('note'),
});

// ==================== SiteSetting ====================
export const siteSetting = table('SiteSetting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Export all tables as a single schema object for easier reference
export const schema = {
  songRequest,
  schedule,
  broadcastSlot,
  calendarDay,
  adminUser,
  auditLog,
  gradeConfig,
  bannedWord,
  sourceCredential,
  siteSetting,
};
