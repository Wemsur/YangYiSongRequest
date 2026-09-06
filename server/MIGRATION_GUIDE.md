# Prisma to Drizzle ORM 迁移指南

## 目录
1. [安装步骤](#安装步骤)
2. [代码迁移对照表](#代码迁移对照表)
3. [关键 API 转换](#关键-api-转换)
4. [文件修改清单](#文件修改清单)
5. [测试检查清单](#测试检查清单)

---

## 安装步骤

### 步骤 1：安装 Drizzle ORM 及数据库驱动

```bash
npm install drizzle-orm
npm install -D drizzle-kit

# 数据库驱动（已有，保留）
npm install better-sqlite3 pg
```

### 步骤 2：更新 package.json scripts

将旧的 Prisma 脚本替换为 Drizzle 脚本：

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "build": "drizzle-kit generate && tsc -p tsconfig.json",
    "start": "node dist/server.js"
  }
}
```

### 步骤 3：创建 drizzle.config.ts

在项目根目录创建 `drizzle.config.ts`：

```typescript
import { defineConfig } from 'drizzle-kit';
import { config } from './src/config.js';

export default defineConfig({
  out: './drizzle/migrations',
  schema: config.sqliteFile 
    ? './drizzle/schema-sqlite.ts' 
    : './drizzle/schema-pg.ts',
  driver: config.sqliteFile ? 'better-sqlite3' : 'pg',
  dbCredentials: config.sqliteFile
    ? { url: config.databaseUrl }
    : { connectionString: config.databaseUrl },
  tablesFilter: ['*'],
});
```

---

## 代码迁移对照表

### 基础导入变更

```typescript
// ❌ Prisma
import { prisma } from '../lib/db.js';

// ✅ Drizzle
import { db } from '../lib/db.js';
import { songRequest, adminUser, schedule, /* ... */ } from '../lib/db.js';
// 或
import { db, schema } from '../lib/db.js';
```

### CRUD 操作对照

#### 1. 查找单个记录

```typescript
// ❌ Prisma
const user = await prisma.adminUser.findUnique({ 
  where: { username: 'admin' } 
});

// ✅ Drizzle
import { eq } from 'drizzle-orm';
const user = await db.query.adminUser.findFirst({
  where: eq(schema.adminUser.username, 'admin'),
});
// 或更简洁的：
import { adminUser } from '../lib/db.js';
const user = await db
  .select()
  .from(adminUser)
  .where(eq(adminUser.username, 'admin'))
  .limit(1)
  .then(rows => rows[0]);
```

#### 2. 查找多个记录

```typescript
// ❌ Prisma
const slots = await prisma.broadcastSlot.findMany({
  orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
});

// ✅ Drizzle
import { asc } from 'drizzle-orm';
import { broadcastSlot } from '../lib/db.js';
const slots = await db
  .select()
  .from(broadcastSlot)
  .orderBy(asc(broadcastSlot.sortOrder), asc(broadcastSlot.startTime));
```

#### 3. 带条件查询

```typescript
// ❌ Prisma
const requests = await prisma.songRequest.findMany({
  where: { 
    submitIp: ip, 
    createdAt: { gte: since } 
  },
});

// ✅ Drizzle
import { and, gte } from 'drizzle-orm';
import { songRequest } from '../lib/db.js';
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

#### 4. 计数操作

```typescript
// ❌ Prisma
const count = await prisma.songRequest.count({
  where: { submitIp: ip, createdAt: { gte: since } },
});

// ✅ Drizzle
import { and, gte, count as countFn } from 'drizzle-orm';
const countResult = await db
  .select({ count: countFn() })
  .from(songRequest)
  .where(
    and(
      eq(songRequest.submitIp, ip),
      gte(songRequest.createdAt, since)
    )
  );
const count = countResult[0].count;
```

#### 5. 创建记录

```typescript
// ❌ Prisma
const user = await prisma.adminUser.create({
  data: {
    username: 'newuser',
    passwordHash: hash,
    role: 'REVIEWER',
  },
});

// ✅ Drizzle
import { adminUser } from '../lib/db.js';
const result = await db
  .insert(adminUser)
  .values({
    id: generateId(),
    username: 'newuser',
    passwordHash: hash,
    role: 'REVIEWER',
  })
  .returning();
const user = result[0];
```

#### 6. 更新记录

```typescript
// ❌ Prisma
const updated = await prisma.adminUser.update({
  where: { id: userId },
  data: { lastLoginAt: new Date() },
});

// ✅ Drizzle
import { eq } from 'drizzle-orm';
const result = await db
  .update(adminUser)
  .set({ lastLoginAt: new Date() })
  .where(eq(adminUser.id, userId))
  .returning();
const updated = result[0];
```

#### 7. 删除记录

```typescript
// ❌ Prisma
await prisma.broadcastSlot.delete({ where: { id: slotId } });

// ✅ Drizzle
import { eq } from 'drizzle-orm';
await db
  .delete(broadcastSlot)
  .where(eq(broadcastSlot.id, slotId));
```

#### 8. Upsert 操作

```typescript
// ❌ Prisma
const result = await prisma.gradeConfig.upsert({
  where: { grade: 'G1' },
  update: { classCount: 5 },
  create: { grade: 'G1', classCount: 5 },
});

// ✅ Drizzle
// 方案 A：分别处理 insert/update
const existing = await db
  .select()
  .from(gradeConfig)
  .where(eq(gradeConfig.grade, 'G1'));

if (existing.length > 0) {
  const result = await db
    .update(gradeConfig)
    .set({ classCount: 5 })
    .where(eq(gradeConfig.grade, 'G1'))
    .returning();
} else {
  const result = await db
    .insert(gradeConfig)
    .values({ grade: 'G1', classCount: 5 })
    .returning();
}

// 方案 B：使用 onConflict（仅 PostgreSQL）
import { onConflict } from 'drizzle-orm/pg-core';
const result = await db
  .insert(gradeConfig)
  .values({ grade: 'G1', classCount: 5 })
  .onConflictDoUpdate({
    target: gradeConfig.grade,
    set: { classCount: 5 },
  })
  .returning();
```

#### 9. 删除多个记录

```typescript
// ❌ Prisma
await prisma.bannedWord.deleteMany({});

// ✅ Drizzle
await db.delete(bannedWord);  // 删除所有
// 或带条件
await db.delete(bannedWord).where(eq(bannedWord.word, 'badword'));
```

---

## 关键 API 转换

### 事务处理

```typescript
// ❌ Prisma
await prisma.$transaction([
  prisma.bannedWord.deleteMany({}),
  ...cleaned.map((word) => prisma.bannedWord.create({ data: { word } })),
]);

// ✅ Drizzle
await db.transaction(async (tx) => {
  await tx.delete(bannedWord);
  for (const word of cleaned) {
    await tx.insert(bannedWord).values({ word });
  }
});
```

### 关系查询

```typescript
// ❌ Prisma
const schedule = await prisma.schedule.findUnique({
  where: { id },
  include: {
    request: true,
    slot: true,
  },
});

// ✅ Drizzle
import { songRequest, broadcastSlot } from '../lib/db.js';
const scheduleData = await db
  .select({
    schedule: schema.schedule,
    request: songRequest,
    slot: broadcastSlot,
  })
  .from(schedule)
  .leftJoin(
    songRequest,
    eq(schedule.requestId, songRequest.id)
  )
  .leftJoin(
    broadcastSlot,
    eq(schedule.slotId, broadcastSlot.id)
  )
  .where(eq(schedule.id, id))
  .limit(1)
  .then(rows => rows[0]);
```

### 选择特定字段

```typescript
// ❌ Prisma
const items = await prisma.bannedWord.findMany({
  select: { word: true },
});

// ✅ Drizzle
const items = await db
  .select({ word: bannedWord.word })
  .from(bannedWord);
```

### 分组与聚合

```typescript
// ❌ Prisma（假设）
const grouped = await prisma.schedule.groupBy({
  by: ['playDate'],
  _count: true,
});

// ✅ Drizzle
import { count, sql } from 'drizzle-orm';
const grouped = await db
  .select({
    playDate: schedule.playDate,
    count: count(),
  })
  .from(schedule)
  .groupBy(schedule.playDate);
```

---

## 文件修改清单

### 已创建的新文件

- ✅ `drizzle/schema-sqlite.ts` - SQLite 数据模型
- ✅ `drizzle/schema-pg.ts` - PostgreSQL 数据模型  
- ✅ `drizzle/db.ts` - 数据库连接（临时位置）
- ✅ `drizzle.config.ts` - Drizzle 配置文件
- ✅ `MIGRATION_GUIDE.md` - 本文件

### 需要修改的文件

#### 1. `package.json`
- [ ] 删除 Prisma 相关依赖：`@prisma/client`, `@prisma/adapter-*`, `prisma`
- [ ] 添加 Drizzle 依赖：`drizzle-orm`, `drizzle-kit`
- [ ] 更新 scripts（生成、迁移等）

#### 2. `src/lib/db.ts`
- [ ] 替换整个文件，改用 Drizzle ORM
- [ ] 引入新的 schema

#### 3. `src/lib/auth.ts` (6 处修改)
```typescript
// 第 4 行
- import { prisma } from './db.js';
+ import { db } from './db.js';
+ import { adminUser } from './db.js';
+ import { eq } from 'drizzle-orm';

// findUnique -> db.query
// update -> db.update
```

#### 4. `src/routes/admin-config.ts` (需要多处修改)
- [ ] 更新所有 `prisma.<table>.findMany()` 为 Drizzle query
- [ ] 更新所有 `prisma.<table>.create()` 为 insert
- [ ] 更新所有 `prisma.<table>.update()` 为 update

#### 5. `src/routes/admin-download.ts` 
- [ ] 替换 Prisma 查询

#### 6. `src/routes/admin.ts`
- [ ] 替换 Prisma 查询和事务

#### 7. `src/routes/public.ts`
- [ ] 如果有 Prisma 调用，替换之

#### 8. `src/services/audit.ts` (3 处修改)
- [ ] 更新审计日志相关查询

#### 9. `src/services/banned-words.ts` (5 处修改)
- [ ] 替换 bannedWord 相关查询

#### 10. `src/services/config.ts` (30+ 处修改)
- [ ] 这是最大的文件，需要全面替换
- [ ] 重点：事务操作、upsert、多表查询

#### 11. `src/services/credentials.ts` (6 处修改)
- [ ] 替换 sourceCredential 查询

#### 12. `src/services/download.ts`
- [ ] 检查是否有 Prisma 调用

#### 13. `src/services/playback.ts`
- [ ] 替换 Prisma 调用

#### 14. `src/services/playlist.ts`
- [ ] 替换 Prisma 调用

#### 15. `src/services/requests.ts` (20+ 处修改)
- [ ] 大量 songRequest 查询需要替换
- [ ] 重点：条件查询、count、update

#### 16. `src/services/schedule.ts` (40+ 处修改)
- [ ] 最复杂的服务，大量多表操作
- [ ] 重点：join 查询、事务、复杂条件

#### 17. `src/services/site.ts`
- [ ] 替换 siteSetting 查询

#### 18. `prisma/schema.prisma` 和 `prisma/schema.postgresql.prisma`
- [ ] 删除（可选，保留以供参考）

#### 19. `tsconfig.json`
- [ ] 如需要，更新 TypeScript 编译配置

---

## 常见坑点与解决方案

### 1. 日期/时间处理

Prisma 自动处理 DateTime，Drizzle 需要显式转换。

```typescript
// ❌ 不对
const result = await db
  .select()
  .from(songRequest)
  .where(gte(songRequest.createdAt, new Date()));

// ✅ 正确
const since = new Date();
const result = await db
  .select()
  .from(songRequest)
  .where(gte(songRequest.createdAt, since));
```

### 2. 布尔值（SQLite）

SQLite 没有原生布尔，Drizzle 会转为 0/1。

```typescript
// 使用 mode: 'boolean' 在 schema 中已处理
const disabled = adminUser.disabled === 1; // SQLite
const disabled = adminUser.disabled;      // PostgreSQL
```

### 3. JSON 存储

项目中 flaggedWords、detail 都存为 JSON 字符串。

```typescript
// 手动序列化/反序列化
const flagged = JSON.parse(songRequest.flaggedWords);
const updated = await db.update(songRequest)
  .set({ flaggedWords: JSON.stringify([...flagged, newWord]) })
  .where(eq(songRequest.id, id));
```

### 4. 默认值

Drizzle 的 `.default()` 只在 schema 层生效，不会在 JS 中填充。

```typescript
// ❌ 错误假设
const id = Math.random(); // Drizzle 不会自动生成 id

// ✅ 正确
import { cuid } from 'crypto'; // 使用生成函数
const id = generateId(); // 自己生成
await db.insert(songRequest).values({
  id,
  // ...
});
```

### 5. 唯一违反检测

```typescript
// ❌ Prisma 的 P2002
if (error.code === 'P2002') { /* ... */ }

// ✅ Drizzle：捕获 SQLiteError 或 PG 错误
try {
  await db.insert(adminUser).values({ username, passwordHash });
} catch (error) {
  if (
    (error instanceof SQLiteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') ||
    (error instanceof PgError && error.code === '23505')
  ) {
    // 唯一键冲突
  }
}
```

---

## 测试检查清单

### 基础功能测试

- [ ] 点歌提交（POST /api/public/requests）
- [ ] 点歌查询（GET /api/public/requests/:queryCode）
- [ ] 管理后台登录
- [ ] 查看待审歌曲列表
- [ ] 审核与排期
- [ ] 管理广播时段
- [ ] 管理日历
- [ ] 管理敏感词
- [ ] 修改密码
- [ ] 权限检查

### 数据库特定测试

- [ ] SQLite 数据库文件检查
- [ ] PostgreSQL 连接字符串验证
- [ ] 事务回滚测试
- [ ] 唯一键约束测试
- [ ] 外键约束测试
- [ ] 日期时间精度验证

### 性能测试

- [ ] 大批量查询性能
- [ ] 事务执行性能
- [ ] 索引有效性验证

---

## 迁移完成验收标准

- [ ] 所有 623 处 Prisma 调用已替换为 Drizzle
- [ ] 生成的 JS 代码能正常编译
- [ ] 所有服务启动正常
- [ ] 现有数据不丢失
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 没有 TypeScript 错误
- [ ] 删除 prisma 文件夹（可选）
- [ ] 更新 .gitignore（删除 prisma 相关规则）

---

## 快速参考：常用 SQL 操作

| 操作 | Prisma | Drizzle |
|------|--------|---------|
| 查一个 | findUnique | select().from().where().limit(1) |
| 查多个 | findMany | select().from() |
| 计数 | count() | select({ count: count() }).from() |
| 创建 | create() | insert().values() |
| 更新 | update() | update().set().where() |
| 删除 | delete() | delete().where() |
| 删全表 | deleteMany({}) | delete() |
| 事务 | $transaction() | db.transaction() |
| Upsert | upsert() | insert().onConflictDoUpdate() |
| 排序 | orderBy | orderBy(asc/desc) |
| 分页 | skip/take | offset().limit() |
| 多条件 | { where: { a, b } } | where(and(eq(a), eq(b))) |

---

## 问题排查

### 编译错误：Cannot find module

确保已运行：
```bash
npm install drizzle-orm drizzle-kit better-sqlite3 pg
```

### 运行时错误：prisma is not defined

检查所有 import 是否已替换：
```bash
grep -r "from.*prisma\|import.*prisma" src/
```

### 数据库连接失败

检查 `config.ts` 中的 DATABASE_PROVIDER 和 DATABASE_URL 环境变量。

### 时间精度问题

Drizzle SQLite 使用 INTEGER 存 ms，PostgreSQL 使用 timestamp(3)。确保转换一致。

---

## 下一步

1. 按照 [文件修改清单](#文件修改清单) 逐个修改源文件
2. 运行 `npm install && npm run build`
3. 运行单元测试：`npm test`
4. 启动本地开发：`npm run dev`
5. 手动测试关键功能
6. 部署到生产环境

祝迁移顺利！
