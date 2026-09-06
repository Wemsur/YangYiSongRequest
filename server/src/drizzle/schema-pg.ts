/**
 * Drizzle ORM Schema for PostgreSQL
 * 数据模型说明见 docs/API.md，修改需同步 schema-sqlite.ts 和迁移文件
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, integer, pgTable as table, text, timestamp, unique, index } from 'drizzle-orm/pg-core';

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
    isManual: boolean('isManual').default(false).notNull(),
    submitIp: text('submitIp').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date', precision: 3 })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    reviewedAt: timestamp('reviewedAt', { mode: 'date', precision: 3 }),
    reviewedById: text('reviewedById'),
  },
  (table) => ({
    statusCreatedAtIdx: index('SongRequest_status_createdAt_idx').on(table.status, table.createdAt),
    gradeClassNoRequesterNameIdx: index('SongRequest_grade_classNo_requesterName_createdAt_idx').on(
      table.grade,
      table.classNo,
      table.requesterName,
      table.createdAt,
    ),
    submitIpCreatedAtIdx: index('SongRequest_submitIp_createdAt_idx').on(table.submitIp, table.createdAt),
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
    createdAt: timestamp('createdAt', { mode: 'date', precision: 3 })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    uniquePlayDateSlotOrderNo: unique('Schedule_playDate_slotId_orderNo_unique').on(
      table.playDate,
      table.slotId,
      table.orderNo,
    ),
    playDateIdx: index('Schedule_playDate_idx').on(table.playDate),
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
  enabled: boolean('enabled').default(true).notNull(),
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
  mustChangePassword: boolean('mustChangePassword').default(false).notNull(),
  disabled: boolean('disabled').default(false).notNull(),
  lastLoginAt: timestamp('lastLoginAt', { mode: 'date', precision: 3 }),
  createdAt: timestamp('createdAt', { mode: 'date', precision: 3 })
    .default(sql`CURRENT_TIMESTAMP`)
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
    createdAt: timestamp('createdAt', { mode: 'date', precision: 3 })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    createdAtIdx: index('AuditLog_createdAt_idx').on(table.createdAt),
    actorIdCreatedAtIdx: index('AuditLog_actorId_createdAt_idx').on(table.actorId, table.createdAt),
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
  createdAt: timestamp('createdAt', { mode: 'date', precision: 3 })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// ==================== SourceCredential ====================
export const sourceCredential = table('SourceCredential', {
  source: text('source').primaryKey(), // netease | qq | kugou
  encryptedData: text('encryptedData').notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date', precision: 3 })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
  lastCheckAt: timestamp('lastCheckAt', { mode: 'date', precision: 3 }),
  lastCheckOk: boolean('lastCheckOk'),
  note: text('note'),
});

// ==================== SiteSetting ====================
export const siteSetting = table('SiteSetting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ==================== Relations ====================
export const songRequestRelations = relations(songRequest, ({ one, many }) => ({
  reviewedBy: one(adminUser, {
    fields: [songRequest.reviewedById],
    references: [adminUser.id],
  }),
  schedule: one(schedule, {
    fields: [songRequest.id],
    references: [schedule.requestId],
  }),
}));

export const scheduleRelations = relations(schedule, ({ one }) => ({
  request: one(songRequest, {
    fields: [schedule.requestId],
    references: [songRequest.id],
  }),
  slot: one(broadcastSlot, {
    fields: [schedule.slotId],
    references: [broadcastSlot.id],
  }),
}));

export const broadcastSlotRelations = relations(broadcastSlot, ({ many }) => ({
  schedules: many(schedule),
}));

export const adminUserRelations = relations(adminUser, ({ many }) => ({
  reviewed: many(songRequest),
  auditLogs: many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(adminUser, {
    fields: [auditLog.actorId],
    references: [adminUser.id],
  }),
}));

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
