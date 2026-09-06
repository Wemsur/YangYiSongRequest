# Prisma ↔ Drizzle 代码转换对照表

## 快速索引

- [导入与连接](#导入与连接)
- [基础查询](#基础查询)
- [条件查询](#条件查询)
- [排序与分页](#排序与分页)
- [创建与更新](#创建与更新)
- [删除](#删除)
- [计数与聚合](#计数与聚合)
- [事务](#事务)
- [关系查询](#关系查询)
- [复杂查询](#复杂查询)

---

## 导入与连接

### Prisma

```typescript
import { prisma } from '../lib/db.js';

// 在 src/lib/db.ts 中：
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const adapter = config.sqliteFile
  ? new PrismaBetterSqlite3({ url: config.databaseUrl })
  : new PrismaPg({ connectionString: config.databaseUrl });

export const prisma = new PrismaClient({ adapter });
```

### Drizzle

```typescript
import { db } from '../lib/db.js';
import { songRequest, adminUser, /* ... */ } from '../lib/db.js';

// 在 drizzle/db.ts 中：
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';

let db;
if (config.sqliteFile) {
  const sqlite = new Database(config.sqliteFile);
  db = drizzleSqlite(sqlite, { schema: schemaSqlite });
} else {
  const pool = new Pool({ connectionString: config.databaseUrl });
  db = drizzlePg(pool, { schema: schemaPg });
}
export { db };
```

---

## 基础查询

### 查找唯一记录

#### Prisma

```typescript
// 按主键查询
const user = await prisma.adminUser.findUnique({
  where: { id: 'user123' }
});

// 按唯一字段查询
const user = await prisma.adminUser.findUnique({
  where: { username: 'admin' }
});
```

#### Drizzle

```typescript
import { eq } from 'drizzle-orm';

// 按主键查询
const user = await db
  .select()
  .from(adminUser)
  .where(eq(adminUser.id, 'user123'))
  .limit(1)
  .then(rows => rows[0]);

// 或使用便捷方法（如果可用）
const user = await db.query.adminUser.findFirst({
  where: eq(adminUser.username, 'admin'),
});

// 方式 3：简洁写法（推荐用于单条查询）
const [user] = await db
  .select()
  .from(adminUser)
  .where(eq(adminUser.username, 'admin'))
  .limit(1);
```

### 查找多条记录

#### Prisma

```typescript
// 查所有
const all = await prisma.broadcastSlot.findMany();

// 带排序
const slots = await prisma.broadcastSlot.findMany({
  orderBy: { sortOrder: 'asc' }
});

// 多字段排序
const slots = await prisma.broadcastSlot.findMany({
  orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }]
});
```

#### Drizzle

```typescript
import { asc, desc } from 'drizzle-orm';

// 查所有
const all = await db.select().from(broadcastSlot);

// 带排序
const slots = await db
  .select()
  .from(broadcastSlot)
  .orderBy(asc(broadcastSlot.sortOrder));

// 多字段排序
const slots = await db
  .select()
  .from(broadcastSlot)
  .orderBy(
    asc(broadcastSlot.sortOrder),
    asc(broadcastSlot.startTime)
  );
```

---

## 条件查询

### 单个条件

#### Prisma

```typescript
const requests = await prisma.songRequest.findMany({
  where: {
    status: 'PENDING'
  }
});

const requests = await prisma.songRequest.findMany({
  where: {
    submitIp: '192.168.1.1'
  }
});
```

#### Drizzle

```typescript
import { eq } from 'drizzle-orm';

const requests = await db
  .select()
  .from(songRequest)
  .where(eq(songRequest.status, 'PENDING'));

const requests = await db
  .select()
  .from(songRequest)
  .where(eq(songRequest.submitIp, '192.168.1.1'));
```

### 多个条件（AND）

#### Prisma

```typescript
const requests = await prisma.songRequest.findMany({
  where: {
    submitIp: ip,
    createdAt: { gte: since }
  }
});
```

#### Drizzle

```typescript
import { and, eq, gte } from 'drizzle-orm';

const requests = await db
  .select()
  .from(songRequest)
  .where(
    and(
      eq(songRequest.submitIp, ip),
      gte(songRequest.createdAt, since)
    )
  );
```

### 多个条件（OR）

#### Prisma

```typescript
const requests = await prisma.songRequest.findMany({
  where: {
    OR: [
      { status: 'PENDING' },
      { status: 'SCHEDULED' }
    ]
  }
});
```

#### Drizzle

```typescript
import { or, eq } from 'drizzle-orm';

const requests = await db
  .select()
  .from(songRequest)
  .where(
    or(
      eq(songRequest.status, 'PENDING'),
      eq(songRequest.status, 'SCHEDULED')
    )
  );
```

### 比较操作

#### Prisma

```typescript
const old = await prisma.songRequest.findMany({
  where: {
    createdAt: { gte: since, lte: until }  // >= 和 <=
  }
});

const newer = await prisma.songRequest.findMany({
  where: {
    createdAt: { gt: since, lt: until }    // > 和 <
  }
});

const notEqual = await prisma.songRequest.findMany({
  where: {
    status: { not: 'REJECTED' }
  }
});
```

#### Drizzle

```typescript
import { gte, lte, gt, lt, ne } from 'drizzle-orm';

const old = await db
  .select()
  .from(songRequest)
  .where(
    and(
      gte(songRequest.createdAt, since),
      lte(songRequest.createdAt, until)
    )
  );

const newer = await db
  .select()
  .from(songRequest)
  .where(
    and(
      gt(songRequest.createdAt, since),
      lt(songRequest.createdAt, until)
    )
  );

const notEqual = await db
  .select()
  .from(songRequest)
  .where(ne(songRequest.status, 'REJECTED'));
```

### IN 和 NOT IN

#### Prisma

```typescript
const requests = await prisma.songRequest.findMany({
  where: {
    status: { in: ['PENDING', 'SCHEDULED'] }
  }
});

const requests = await prisma.songRequest.findMany({
  where: {
    id: { notIn: [id1, id2] }
  }
});
```

#### Drizzle

```typescript
import { inArray, notInArray } from 'drizzle-orm';

const requests = await db
  .select()
  .from(songRequest)
  .where(inArray(songRequest.status, ['PENDING', 'SCHEDULED']));

const requests = await db
  .select()
  .from(songRequest)
  .where(notInArray(songRequest.id, [id1, id2]));
```

### LIKE / 字符串匹配

#### Prisma

```typescript
const requests = await prisma.songRequest.findMany({
  where: {
    title: { contains: 'love' }
  }
});

const requests = await prisma.songRequest.findMany({
  where: {
    title: { startsWith: 'The' }
  }
});
```

#### Drizzle

```typescript
import { like, ilike } from 'drizzle-orm';

// 区分大小写（某些数据库）
const requests = await db
  .select()
  .from(songRequest)
  .where(like(songRequest.title, '%love%'));

// 不区分大小写（PostgreSQL）
const requests = await db
  .select()
  .from(songRequest)
  .where(ilike(songRequest.title, 'the%'));
```

### NULL 检查

#### Prisma

```typescript
const withoutReview = await prisma.songRequest.findMany({
  where: {
    reviewedById: null
  }
});

const reviewed = await prisma.songRequest.findMany({
  where: {
    reviewedById: { not: null }
  }
});
```

#### Drizzle

```typescript
import { isNull, isNotNull } from 'drizzle-orm';

const withoutReview = await db
  .select()
  .from(songRequest)
  .where(isNull(songRequest.reviewedById));

const reviewed = await db
  .select()
  .from(songRequest)
  .where(isNotNull(songRequest.reviewedById));
```

---

## 排序与分页

### 排序

#### Prisma

```typescript
// 单字段
const slots = await prisma.broadcastSlot.findMany({
  orderBy: { sortOrder: 'asc' }
});

// 多字段
const slots = await prisma.broadcastSlot.findMany({
  orderBy: [
    { sortOrder: 'asc' },
    { startTime: 'asc' }
  ]
});

// 降序
const slots = await prisma.broadcastSlot.findMany({
  orderBy: { sortOrder: 'desc' }
});
```

#### Drizzle

```typescript
import { asc, desc } from 'drizzle-orm';

// 单字段
const slots = await db
  .select()
  .from(broadcastSlot)
  .orderBy(asc(broadcastSlot.sortOrder));

// 多字段
const slots = await db
  .select()
  .from(broadcastSlot)
  .orderBy(
    asc(broadcastSlot.sortOrder),
    asc(broadcastSlot.startTime)
  );

// 降序
const slots = await db
  .select()
  .from(broadcastSlot)
  .orderBy(desc(broadcastSlot.sortOrder));
```

### 分页

#### Prisma

```typescript
const page = 2;
const pageSize = 10;

const requests = await prisma.songRequest.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: 'desc' }
});
```

#### Drizzle

```typescript
const page = 2;
const pageSize = 10;

const requests = await db
  .select()
  .from(songRequest)
  .orderBy(desc(songRequest.createdAt))
  .limit(pageSize)
  .offset((page - 1) * pageSize);
```

---

## 创建与更新

### 创建单条记录

#### Prisma

```typescript
const user = await prisma.adminUser.create({
  data: {
    id: 'user123',
    username: 'newadmin',
    passwordHash: hash,
    role: 'REVIEWER'
  }
});
```

#### Drizzle

```typescript
const result = await db
  .insert(adminUser)
  .values({
    id: 'user123',
    username: 'newadmin',
    passwordHash: hash,
    role: 'REVIEWER'
  })
  .returning();

const user = result[0];
```

### 创建多条记录

#### Prisma

```typescript
const created = await prisma.bannedWord.createMany({
  data: words.map(word => ({ word }))
});
```

#### Drizzle

```typescript
await db
  .insert(bannedWord)
  .values(words.map(word => ({ word })));

// 或返回插入的记录
const created = await db
  .insert(bannedWord)
  .values(words.map(word => ({ word })))
  .returning();
```

### 更新单条记录

#### Prisma

```typescript
const updated = await prisma.adminUser.update({
  where: { id: userId },
  data: { lastLoginAt: new Date() }
});
```

#### Drizzle

```typescript
import { eq } from 'drizzle-orm';

const result = await db
  .update(adminUser)
  .set({ lastLoginAt: new Date() })
  .where(eq(adminUser.id, userId))
  .returning();

const updated = result[0];
```

### 更新多条记录

#### Prisma

```typescript
await prisma.songRequest.updateMany({
  where: { status: 'PLAYED' },
  data: { playedAt: new Date() }
});
```

#### Drizzle

```typescript
import { eq } from 'drizzle-orm';

await db
  .update(songRequest)
  .set({ playedAt: new Date() })
  .where(eq(songRequest.status, 'PLAYED'));
```

### Upsert（插入或更新）

#### Prisma

```typescript
const result = await prisma.gradeConfig.upsert({
  where: { grade: 'G1' },
  update: { classCount: 5 },
  create: { grade: 'G1', classCount: 5 }
});
```

#### Drizzle - 方案 A（通用，SQLite/PostgreSQL）

```typescript
import { eq } from 'drizzle-orm';

// 先查询
const existing = await db
  .select()
  .from(gradeConfig)
  .where(eq(gradeConfig.grade, 'G1'))
  .limit(1);

if (existing.length > 0) {
  // 更新
  await db
    .update(gradeConfig)
    .set({ classCount: 5 })
    .where(eq(gradeConfig.grade, 'G1'));
} else {
  // 插入
  await db
    .insert(gradeConfig)
    .values({ grade: 'G1', classCount: 5 });
}
```

#### Drizzle - 方案 B（PostgreSQL 专用）

```typescript
import { eq, onConflict } from 'drizzle-orm/pg-core';

const result = await db
  .insert(gradeConfig)
  .values({ grade: 'G1', classCount: 5 })
  .onConflictDoUpdate({
    target: gradeConfig.grade,
    set: { classCount: 5 }
  })
  .returning();
```

#### Drizzle - 方案 C（SQLite 专用）

```typescript
import { eq, onConflict } from 'drizzle-orm/sqlite-core';

const result = await db
  .insert(gradeConfig)
  .values({ grade: 'G1', classCount: 5 })
  .onConflictDoUpdate({
    target: gradeConfig.grade,
    set: { classCount: 5 }
  })
  .returning();
```

---

## 删除

### 删除单条

#### Prisma

```typescript
await prisma.broadcastSlot.delete({
  where: { id: slotId }
});
```

#### Drizzle

```typescript
import { eq } from 'drizzle-orm';

await db
  .delete(broadcastSlot)
  .where(eq(broadcastSlot.id, slotId));
```

### 删除多条

#### Prisma

```typescript
await prisma.bannedWord.deleteMany({
  where: {
    word: { in: ['word1', 'word2'] }
  }
});

// 删除所有
await prisma.bannedWord.deleteMany({});
```

#### Drizzle

```typescript
import { inArray, eq } from 'drizzle-orm';

// 删除指定记录
await db
  .delete(bannedWord)
  .where(inArray(bannedWord.word, ['word1', 'word2']));

// 删除所有
await db.delete(bannedWord);
```

---

## 计数与聚合

### 计数

#### Prisma

```typescript
const count = await prisma.songRequest.count({
  where: { submitIp: ip, createdAt: { gte: since } }
});

const total = await prisma.songRequest.count();
```

#### Drizzle

```typescript
import { count, and, eq, gte } from 'drizzle-orm';

const countResult = await db
  .select({ count: count() })
  .from(songRequest)
  .where(
    and(
      eq(songRequest.submitIp, ip),
      gte(songRequest.createdAt, since)
    )
  );
const count = countResult[0].count;

// 或简洁写法
const [{ count }] = await db
  .select({ count: count() })
  .from(songRequest)
  .where(
    and(
      eq(songRequest.submitIp, ip),
      gte(songRequest.createdAt, since)
    )
  );
```

### 求和

#### Prisma

```typescript
const total = await prisma.schedule.aggregate({
  _sum: { durationMs: true },
  where: { playDate: '2024-01-01' }
});
```

#### Drizzle

```typescript
import { sum } from 'drizzle-orm';

const result = await db
  .select({ total: sum(songRequest.durationMs) })
  .from(schedule)
  .innerJoin(songRequest, eq(schedule.requestId, songRequest.id))
  .where(eq(schedule.playDate, '2024-01-01'));

const total = result[0].total;
```

### 分组

#### Prisma

```typescript
const byStatus = await prisma.songRequest.groupBy({
  by: ['status'],
  _count: true,
  orderBy: { status: 'asc' }
});
```

#### Drizzle

```typescript
import { count } from 'drizzle-orm';

const byStatus = await db
  .select({
    status: songRequest.status,
    count: count()
  })
  .from(songRequest)
  .groupBy(songRequest.status)
  .orderBy(asc(songRequest.status));
```

---

## 事务

### 基本事务

#### Prisma

```typescript
await prisma.$transaction([
  prisma.songRequest.update({ where: { id }, data: { status: 'PLAYED' } }),
  prisma.auditLog.create({ data: { /* ... */ } })
]);

// 或callback 风格
await prisma.$transaction(async (tx) => {
  await tx.songRequest.update({ where: { id }, data: { status: 'PLAYED' } });
  await tx.auditLog.create({ data: { /* ... */ } });
});
```

#### Drizzle

```typescript
await db.transaction(async (tx) => {
  await tx
    .update(songRequest)
    .set({ status: 'PLAYED' })
    .where(eq(songRequest.id, id));
  
  await tx.insert(auditLog).values({ /* ... */ });
});
```

### 事务中的错误处理

#### Prisma

```typescript
try {
  await prisma.$transaction(async (tx) => {
    // ...
  });
} catch (error) {
  if (error instanceof Prisma.PrismaClientValidationError) {
    // 验证错误
  }
}
```

#### Drizzle

```typescript
try {
  await db.transaction(async (tx) => {
    // ...
  });
} catch (error) {
  if (error instanceof Error && error.message.includes('UNIQUE')) {
    // 唯一键冲突
  }
}
```

---

## 关系查询

### Include（包含关系）

#### Prisma

```typescript
const request = await prisma.songRequest.findUnique({
  where: { id: requestId },
  include: {
    reviewedBy: true,
    schedule: true
  }
});
```

#### Drizzle

```typescript
import { eq } from 'drizzle-orm';

const data = await db
  .select({
    request: songRequest,
    reviewedBy: adminUser,
    schedule: schedule
  })
  .from(songRequest)
  .leftJoin(
    adminUser,
    eq(songRequest.reviewedById, adminUser.id)
  )
  .leftJoin(
    schedule,
    eq(songRequest.id, schedule.requestId)
  )
  .where(eq(songRequest.id, requestId))
  .limit(1)
  .then(rows => rows[0]);
```

### Select（选择字段）

#### Prisma

```typescript
const words = await prisma.bannedWord.findMany({
  select: { word: true }
});
```

#### Drizzle

```typescript
const words = await db
  .select({ word: bannedWord.word })
  .from(bannedWord);
```

### 关系的关系

#### Prisma

```typescript
const request = await prisma.songRequest.findUnique({
  where: { id: requestId },
  include: {
    schedule: {
      include: { slot: true }
    }
  }
});
```

#### Drizzle

```typescript
const data = await db
  .select({
    request: songRequest,
    schedule: schedule,
    slot: broadcastSlot
  })
  .from(songRequest)
  .leftJoin(schedule, eq(songRequest.id, schedule.requestId))
  .leftJoin(broadcastSlot, eq(schedule.slotId, broadcastSlot.id))
  .where(eq(songRequest.id, requestId))
  .limit(1);
```

---

## 复杂查询

### DISTINCT

#### Prisma

```typescript
const ips = await prisma.songRequest.findMany({
  where: { createdAt: { gte: since } },
  distinct: ['submitIp'],
  select: { submitIp: true }
});
```

#### Drizzle

```typescript
import { distinct } from 'drizzle-orm';

const ips = await db
  .selectDistinct({ ip: songRequest.submitIp })
  .from(songRequest)
  .where(gte(songRequest.createdAt, since));
```

### 子查询

#### Prisma

```typescript
// Prisma 不直接支持子查询，通常需要分步
const ids = await prisma.schedule.findMany({
  where: { playDate: '2024-01-01' },
  select: { requestId: true }
});

const requests = await prisma.songRequest.findMany({
  where: { id: { in: ids.map(x => x.requestId) } }
});
```

#### Drizzle

```typescript
import { inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// 方式 1：原始 SQL
const requests = await db
  .select()
  .from(songRequest)
  .where(
    inArray(
      songRequest.id,
      db
        .select({ id: schedule.requestId })
        .from(schedule)
        .where(eq(schedule.playDate, '2024-01-01'))
    )
  );

// 方式 2：分步查询（通常更清晰）
const schedules = await db
  .select({ id: schedule.requestId })
  .from(schedule)
  .where(eq(schedule.playDate, '2024-01-01'));

const requests = await db
  .select()
  .from(songRequest)
  .where(inArray(songRequest.id, schedules.map(x => x.id)));
```

### 批量操作

#### Prisma

```typescript
// createMany
await prisma.bannedWord.createMany({
  data: words.map(word => ({ word }))
});

// updateMany
await prisma.songRequest.updateMany({
  where: { status: 'PENDING' },
  data: { flagged: true }
});
```

#### Drizzle

```typescript
// 批量插入
await db
  .insert(bannedWord)
  .values(words.map(word => ({ word })));

// 批量更新
await db
  .update(songRequest)
  .set({ flagged: true })
  .where(eq(songRequest.status, 'PENDING'));
```

---

## 数据库特定操作

### SQLite 特异性

#### Prisma

```typescript
// Pragma 语句需要通过原生查询
await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
```

#### Drizzle

```typescript
import { sql } from 'drizzle-orm';

// SQLite
if (config.sqliteFile) {
  await db.run(sql`PRAGMA foreign_keys = ON`);
}
```

### PostgreSQL 特异性

#### Drizzle

```typescript
import { sql } from 'drizzle-orm';

// 使用 RETURNING 获取自增 ID
const result = await db
  .insert(songRequest)
  .values({ /* ... */ })
  .returning({ id: songRequest.id });

// 使用 onConflictDoUpdate (PostgreSQL)
import { onConflict } from 'drizzle-orm/pg-core';

await db
  .insert(gradeConfig)
  .values({ grade: 'G1', classCount: 5 })
  .onConflictDoUpdate({
    target: gradeConfig.grade,
    set: { classCount: 5 }
  });
```

---

## 错误处理

### 唯一键冲突

#### Prisma

```typescript
try {
  await prisma.songRequest.create({ data: { queryCode, /* ... */ } });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      // 唯一键冲突
    }
  }
}
```

#### Drizzle

```typescript
// SQLite
try {
  await db.insert(songRequest).values({ queryCode, /* ... */ });
} catch (error) {
  if (error instanceof Error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    // 唯一键冲突
  }
}

// PostgreSQL
try {
  await db.insert(songRequest).values({ queryCode, /* ... */ });
} catch (error) {
  if (error instanceof Error && error.code === '23505') {
    // 唯一键冲突
  }
}
```

### 外键约束

#### Prisma

```typescript
try {
  await prisma.broadcastSlot.delete({ where: { id } });
} catch (error) {
  if (error.code === 'P2014') {
    // 外键约束冲突
  }
}
```

#### Drizzle

```typescript
try {
  await db.delete(broadcastSlot).where(eq(broadcastSlot.id, id));
} catch (error) {
  if (error instanceof Error && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    // SQLite 外键冲突
  }
  if (error instanceof Error && error.code === '23503') {
    // PostgreSQL 外键冲突
  }
}
```

---

## 性能优化建议

### 选择性投影（减少数据传输）

#### Prisma

```typescript
const items = await prisma.bannedWord.findMany({
  select: { word: true }  // 不选 id 等其他字段
});
```

#### Drizzle

```typescript
// Drizzle 默认这样做
const items = await db
  .select({ word: bannedWord.word })
  .from(bannedWord);
```

### 批量操作（减少往返）

```typescript
// ❌ 慢
for (const word of words) {
  await db.insert(bannedWord).values({ word });
}

// ✅ 快
await db
  .insert(bannedWord)
  .values(words.map(word => ({ word })));
```

### 预加载 vs 延迟加载

```typescript
// ❌ N+1 问题
const requests = await db.select().from(songRequest);
for (const req of requests) {
  const schedule = await db.select().from(schedule).where(...);
}

// ✅ Join 查询
const data = await db
  .select()
  .from(songRequest)
  .leftJoin(schedule, eq(songRequest.id, schedule.requestId));
```

---

## 完整示例对比

### 场景：批量审核点歌并排期

#### Prisma

```typescript
export async function scheduleMultipleRequests(
  actorId: string,
  requestIds: string[],
  playDate: string,
  slotId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const requestId of requestIds) {
      const request = await tx.songRequest.findUnique({
        where: { id: requestId },
        include: { schedule: true }
      });
      
      if (!request) continue;
      
      const orderNo = await getNextOrderNo(tx, playDate, slotId);
      
      await tx.schedule.upsert({
        where: { requestId },
        update: { playDate, slotId, orderNo },
        create: { requestId, playDate, slotId, orderNo, id: generateId() }
      });
      
      await tx.songRequest.update({
        where: { id: requestId },
        data: {
          status: 'SCHEDULED',
          reviewedAt: new Date(),
          reviewedById: actorId
        }
      });
      
      await tx.auditLog.create({
        data: {
          id: generateId(),
          actorId,
          action: 'SCHEDULE',
          targetId: requestId
        }
      });
    }
  });
}
```

#### Drizzle

```typescript
export async function scheduleMultipleRequests(
  actorId: string,
  requestIds: string[],
  playDate: string,
  slotId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const requestId of requestIds) {
      // 查询请求和排期
      const [request] = await tx
        .select({
          request: songRequest,
          schedule: schedule
        })
        .from(songRequest)
        .leftJoin(schedule, eq(songRequest.id, schedule.requestId))
        .where(eq(songRequest.id, requestId));
      
      if (!request?.request) continue;
      
      // 获取下一个排序号
      const existing = await tx
        .select({ orderNo: schedule.orderNo })
        .from(schedule)
        .where(
          and(
            eq(schedule.playDate, playDate),
            eq(schedule.slotId, slotId)
          )
        );
      const orderNo = Math.max(0, ...existing.map(x => x.orderNo)) + 1;
      
      // Upsert 排期
      if (request.schedule) {
        await tx
          .update(schedule)
          .set({ playDate, slotId, orderNo })
          .where(eq(schedule.id, request.schedule.id));
      } else {
        await tx.insert(schedule).values({
          id: generateId(),
          requestId,
          playDate,
          slotId,
          orderNo
        });
      }
      
      // 更新请求状态
      await tx
        .update(songRequest)
        .set({
          status: 'SCHEDULED',
          reviewedAt: new Date(),
          reviewedById: actorId
        })
        .where(eq(songRequest.id, requestId));
      
      // 记录审计
      await tx.insert(auditLog).values({
        id: generateId(),
        actorId,
        action: 'SCHEDULE',
        targetId: requestId
      });
    }
  });
}
```

---

## 快速参考速查表

| 功能 | Prisma | Drizzle |
|------|--------|---------|
| 导入数据库实例 | `import { prisma }` | `import { db }` |
| 查单个 | `findUnique()` | `select().where().limit(1)` |
| 查多个 | `findMany()` | `select().from()` |
| 计数 | `count()` | `select({ count: count() })` |
| 排序 | `orderBy: { field: 'asc' }` | `orderBy(asc(field))` |
| 分页 | `skip/take` | `offset/limit` |
| 创建 | `create()` | `insert().values()` |
| 更新 | `update()` | `update().set().where()` |
| 删除 | `delete()` | `delete().where()` |
| 事务 | `$transaction()` | `db.transaction()` |
| Upsert | `upsert()` | `insert().onConflictDoUpdate()` |
| AND 条件 | `{ where: { a, b } }` | `where(and(eq(a), eq(b)))` |
| OR 条件 | `{ OR: [...] }` | `where(or(...))` |
| IN 条件 | `{ in: [...] }` | `inArray(field, [...])` |
| NULL 检查 | `null` | `isNull(field)` |
| 关系 | `include/select` | `join` 或 query builder |

---

## 最后的提醒

1. **始终使用参数化查询** - Drizzle 的 builder 会自动处理
2. **测试边界情况** - 特别是 NULL、空数组、日期边界
3. **监控性能** - Drizzle 生成的 SQL 有时比预期更复杂
4. **保持一致性** - 选一种查询风格并坚持
5. **查阅官方文档** - Drizzle 经常更新，确保使用最新 API

祝你的迁移顺利！
