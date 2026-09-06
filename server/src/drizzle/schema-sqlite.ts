/**
 * Drizzle ORM Schema for SQLite
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable as table, text, unique } from 'drizzle-orm/sqlite-core';

// SongRequest table
export const songRequest = table('SongRequest', {
  id: text('id').primaryKey(),
  queryCode: text('queryCode').notNull().unique(),
  source: text('source').notNull(),
  platformId: text('platformId').notNull(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  album: text('album'),
  durationMs: integer('durationMs').notNull(),
  coverUrl: text('coverUrl'),
  grade: text('grade'),
  classNo: integer('classNo'),
  requesterName: text('requesterName'),
  status: text('status').notNull().default('PENDING'),
  rejectReason: text('rejectReason'),
  flaggedWords: text('flaggedWords').notNull().default('[]'),
  isManual: integer('isManual').notNull().default(0),
  submitIp: text('submitIp').notNull(),
  createdAt: integer('createdAt').notNull().default(sql`(unixepoch())`),
  reviewedAt: integer('reviewedAt'),
  reviewedById: text('reviewedById'),
});

// Schedule table
export const schedule = table('Schedule', {
  id: text('id').primaryKey(),
  requestId: text('requestId').notNull().unique(),
  playDate: text('playDate').notNull(),
  slotId: text('slotId').notNull(),
  orderNo: integer('orderNo').notNull(),
  createdAt: integer('createdAt').notNull().default(sql`(unixepoch())`),
}, (t) => [
  unique('Schedule_playDate_slotId_orderNo').on(t.playDate, t.slotId, t.orderNo),
]);

// BroadcastSlot table
export const broadcastSlot = table('BroadcastSlot', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  startTime: text('startTime').notNull(),
  endTime: text('endTime').notNull(),
  maxCount: integer('maxCount'),
  maxMs: integer('maxMs'),
  sortOrder: integer('sortOrder').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
});

// CalendarDay table
export const calendarDay = table('CalendarDay', {
  date: text('date').primaryKey(),
  kind: text('kind').notNull(),
  note: text('note'),
});

// AdminUser table
export const adminUser = table('AdminUser', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: text('role').notNull().default('REVIEWER'),
  mustChangePassword: integer('mustChangePassword').notNull().default(0),
  disabled: integer('disabled').notNull().default(0),
  lastLoginAt: integer('lastLoginAt'),
  createdAt: integer('createdAt').notNull().default(sql`(unixepoch())`),
});

// AuditLog table
export const auditLog = table('AuditLog', {
  id: text('id').primaryKey(),
  actorId: text('actorId'),
  action: text('action').notNull(),
  targetId: text('targetId'),
  detail: text('detail'),
  ip: text('ip'),
  userAgent: text('userAgent'),
  createdAt: integer('createdAt').notNull().default(sql`(unixepoch())`),
});

// GradeConfig table
export const gradeConfig = table('GradeConfig', {
  grade: text('grade').primaryKey(),
  classCount: integer('classCount').notNull(),
});

// BannedWord table
export const bannedWord = table('BannedWord', {
  word: text('word').primaryKey(),
  createdAt: integer('createdAt').notNull().default(sql`(unixepoch())`),
});

// SourceCredential table
export const sourceCredential = table('SourceCredential', {
  source: text('source').primaryKey(),
  encryptedData: text('encryptedData').notNull(),
  updatedAt: integer('updatedAt').notNull(),
  lastCheckAt: integer('lastCheckAt'),
  lastCheckOk: integer('lastCheckOk'),
  note: text('note'),
});

// SiteSetting table
export const siteSetting = table('SiteSetting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
