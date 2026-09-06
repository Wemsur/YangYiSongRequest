# Prisma → Drizzle ORM 迁移清单

## 项目概览
- **当前状态**：573 处 Prisma 调用
- **已创建文件**：4 个
- **需要修改文件**：18 个
- **预计工作量**：3-5 天（取决于测试覆盖）

---

## 📦 第一阶段：安装与配置

### 1.1 依赖安装

```bash
npm install drizzle-orm
npm install -D drizzle-kit pg-core

# 已有，保留
# npm install better-sqlite3 pg
```

### 1.2 移除 Prisma 依赖（可选，在验证 Drizzle 工作后）

```bash
npm uninstall @prisma/client @prisma/adapter-better-sqlite3 @prisma/adapter-pg prisma
```

### 1.3 验证安装

```bash
npm list drizzle-orm drizzle-kit
```

---

## 📄 第二阶段：新建文件验证

### 已创建文件清单

| 文件路径 | 状态 | 说明 |
|---------|------|------|
| `drizzle/schema-sqlite.ts` | ✅ | SQLite 数据模型定义 |
| `drizzle/schema-pg.ts` | ✅ | PostgreSQL 数据模型定义 |
| `drizzle/db.ts` | ✅ | 数据库连接实例 |
| `drizzle.config.ts` | ✅ | Drizzle Kit 配置文件 |
| `MIGRATION_GUIDE.md` | ✅ | 代码迁移指南 |
| `MIGRATION_CHECKLIST.md` | ✅ | 本文件 |

### 验证步骤

```bash
# 1. 检查 Schema 语法
npm run build 2>&1 | grep -i "schema"

# 2. 检查配置文件
ls -la drizzle.config.ts drizzle/schema-*.ts drizzle/db.ts
```

---

## 🔧 第三阶段：源代码迁移

### 3.1 核心库文件 - `src/lib/`

#### ✅ `src/lib/db.ts` [PRIORITY: CRITICAL]

**当前状态**：
```typescript
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
```

**需要替换为**：
```typescript
// 使用 drizzle/db.ts 中的实现
export { db, schema } from '../drizzle/db.js';
// 或直接在此处实现
```

**修改清单**：
- [ ] 删除所有 Prisma 导入
- [ ] 添加 Drizzle 导入
- [ ] 测试连接正常

---

#### ⚠️ `src/lib/auth.ts` [PRIORITY: HIGH]

**修改处数**：6 处

**具体位置**：
| 行号 | 原代码 | 新代码 |
|------|--------|--------|
| 4 | `import { prisma }` | `import { db } from './db.js'; import { eq } from 'drizzle-orm'; import { adminUser } from './db.js';` |
| 11 | `prisma.adminUser.findUnique()` | `db.select().from(adminUser).where(eq(adminUser.username, ...))` |
| 12 | `prisma.adminUser.update()` | `db.update(adminUser).set(...).where(eq(...))` |
| 15 | `prisma.adminUser.findUnique()` | `db.select().from(adminUser).where(eq(...))` |

**测试**：
- [ ] 用户查询成功
- [ ] 登录状态更新正常
- [ ] JWT 认证通过

---

### 3.2 路由层 - `src/routes/`

#### ⚠️ `src/routes/admin-config.ts` [PRIORITY: HIGH]

**修改处数**：约 15 处

**主要操作**：
- [ ] Line 11: `prisma.broadcastSlot.findMany()` → Drizzle select
- [ ] Line 16: `prisma.broadcastSlot.findMany()` → Drizzle select
- [ ] Line 28: `prisma.gradeConfig.findMany()` → Drizzle select
- [ ] Line 33: `prisma.gradeConfig.findMany()` → Drizzle select
- [ ] Line 41: `prisma.adminUser.findMany()` → Drizzle select
- [ ] Line 52: `prisma.adminUser.findUnique()` → Drizzle select + where
- [ ] Line 54: `prisma.adminUser.create()` → Drizzle insert
- [ ] Line 63: `prisma.adminUser.findUnique()` → Drizzle select + where
- [ ] Line 69: `prisma.adminUser.update()` → Drizzle update

**测试**：
- [ ] 获取广播时段列表
- [ ] 获取年级配置
- [ ] 获取管理员列表
- [ ] 创建新管理员
- [ ] 修改管理员信息

---

#### ⚠️ `src/routes/admin-download.ts` [PRIORITY: MEDIUM]

**修改处数**：约 3 处

- [ ] Line 44: `prisma.broadcastSlot.findUnique()`

**测试**：
- [ ] 下载功能正常

---

#### ⚠️ `src/routes/admin.ts` [PRIORITY: HIGH]

**修改处数**：约 8 处

**主要操作**：
- [ ] Line 46: `prisma.adminUser.update()` - 修改密码
- [ ] Line 58: `prisma.auditLog.count()` - 审计日志计数
- [ ] Line 59: `prisma.auditLog.findMany()` - 审计日志查询

**事务示例**：
```typescript
// ❌ Prisma
await prisma.$transaction([...]);

// ✅ Drizzle
await db.transaction(async (tx) => {
  // 事务内容
});
```

**测试**：
- [ ] 获取审计日志
- [ ] 修改密码成功

---

#### ⚠️ `src/routes/public.ts` [PRIORITY: MEDIUM]

**修改处数**：约 2-3 处（如果有）

**检查**：
```bash
grep -n "prisma\." src/routes/public.ts
```

---

### 3.3 服务层 - `src/services/`

#### ⚠️ `src/services/audit.ts` [PRIORITY: MEDIUM]

**修改处数**：3 处

**主要操作**：
- [ ] Line 6: `prisma.auditLog.create()` → Drizzle insert
- [ ] Line 11: `prisma.adminUser.findUnique()` → Drizzle select

```typescript
// 示例转换
export async function writeAudit(input: AuditInput): Promise<void> {
  await db
    .insert(auditLog)
    .values({
      id: generateId(),
      actorId: input.actorId ?? null,
      action: input.action,
      targetId: input.targetId ?? null,
      detail: input.detail ? JSON.stringify(input.detail) : null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
}
```

---

#### ⚠️ `src/services/banned-words.ts` [PRIORITY: MEDIUM]

**修改处数**：5 处

**主要操作**：
- [ ] Line 7: `prisma.bannedWord.findMany()` → Drizzle select

```typescript
export async function findBannedHits(text: string): Promise<string[]> {
  const words = await db
    .select({ word: bannedWord.word })
    .from(bannedWord);
  
  return words
    .map(row => row.word)
    .filter(word => text.includes(word));
}
```

---

#### 🔴 `src/services/config.ts` [PRIORITY: CRITICAL]

**修改处数**：约 35-40 处（最复杂的文件）

**关键操作**：

1. **广播时段管理** (~15 处)
   - [ ] Line 39: `prisma.broadcastSlot.findMany()`
   - [ ] Line 44: `prisma.schedule.count()`
   - [ ] Line 50: `prisma.$transaction()`
   - [ ] Line 51-64: 多个 insert/update/delete

2. **日历管理** (~10 处)
   - [ ] Line 81: `prisma.calendarDay.findMany()`
   - [ ] Line 92: `prisma.$transaction()`
   - [ ] Line 95-100: deleteMany/upsert

3. **年级配置** (~5 处)
   - [ ] Line 113: `prisma.$transaction()`
   - [ ] Line 115-118: upsert

4. **敏感词管理** (~8 处)
   - [ ] Line 129: `prisma.$transaction()`
   - [ ] Line 130-131: deleteMany/create

5. **网站设置** (~5 处)
   - [ ] Line 162: `prisma.$transaction()`
   - [ ] Line 165: upsert

**示例代码块**：

```typescript
// saveSlots 函数重写
export async function saveSlots(slots: SlotInput[]): Promise<void> {
  // ... 验证逻辑保持不变 ...
  
  const existing = await db
    .select()
    .from(broadcastSlot);
  
  const keep = new Set(slots.map((slot) => slot.id).filter(Boolean));
  const removed = existing.filter((row) => !keep.has(row.id));
  
  for (const row of removed) {
    const scheduleCount = await db
      .select({ count: count() })
      .from(schedule)
      .where(eq(schedule.slotId, row.id))
      .then(res => res[0].count);
    
    if (scheduleCount > 0) {
      throw badRequest('SLOT_IN_USE', `...${scheduleCount}...`);
    }
  }
  
  // 事务处理
  await db.transaction(async (tx) => {
    // 删除
    for (const row of removed) {
      await tx.delete(broadcastSlot).where(eq(broadcastSlot.id, row.id));
    }
    
    // 插入/更新
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      const data = {
        name: slot.name.trim(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        maxCount: slot.maxCount ?? null,
        maxMs: slot.maxMs ?? null,
        sortOrder: index,
        enabled: slot.enabled ?? true,
      };
      
      if (slot.id) {
        await tx.update(broadcastSlot)
          .set(data)
          .where(eq(broadcastSlot.id, slot.id));
      } else {
        await tx.insert(broadcastSlot).values({
          id: generateId(),
          ...data,
        });
      }
    }
  });
  
  invalidateSiteCache();
}
```

**测试**：
- [ ] 保存广播时段成功
- [ ] 保存日历成功
- [ ] 保存年级配置成功
- [ ] 保存敏感词成功
- [ ] 保存网站��置成功
- [ ] 事务回滚正确处理

---

#### ⚠️ `src/services/credentials.ts` [PRIORITY: MEDIUM]

**修改处数**：6 处

**主要操作**：
- [ ] Line 8: `prisma.sourceCredential.findUnique()` → select + where
- [ ] Line 13: `prisma.sourceCredential.upsert()` → insert + onConflict
- [ ] Line 19: `prisma.sourceCredential.deleteMany()` → delete
- [ ] Line 21-24: query builder
- [ ] Line 27: `prisma.sourceCredential.findMany()`

```typescript
// upsert 示例（SQLite 方式）
export async function setCredential(source: SourceId, encryptedData: string, note?: string): Promise<void> {
  const existing = await db
    .select()
    .from(sourceCredential)
    .where(eq(sourceCredential.source, source))
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(sourceCredential)
      .set({ encryptedData, updatedAt: new Date(), note })
      .where(eq(sourceCredential.source, source));
  } else {
    await db
      .insert(sourceCredential)
      .values({
        source,
        encryptedData,
        updatedAt: new Date(),
        note,
      });
  }
}
```

---

#### ⚠️ `src/services/download.ts` [PRIORITY: MEDIUM]

**修改处数**：检查后确定

```bash
grep -n "prisma\." src/services/download.ts
```

---

#### ⚠️ `src/services/playback.ts` [PRIORITY: MEDIUM]

**修改处数**：约 3-5 处

**主要操作**：
- [ ] 点歌播放状态更新

---

#### ⚠️ `src/services/playlist.ts` [PRIORITY: MEDIUM]

**修改处数**：约 5 处

**主要操作**：
- [ ] 排期查询
- [ ] 歌曲列表查询

---

#### 🔴 `src/services/requests.ts` [PRIORITY: CRITICAL]

**修改处数**：约 20-25 处

**关键操作**：

1. **查询提交限制** (~5 处)
   - [ ] Line 97: `prisma.songRequest.count()` - IP 日限
   - [ ] Line 104: `prisma.songRequest.count()` - 身份日限

2. **创建点歌** (~5 处)
   - [ ] Line 120: `prisma.songRequest.findUnique()` - 查询码检查
   - [ ] Line 140: `prisma.songRequest.create()` - 创建

3. **查询点歌** (~3 处)
   - [ ] Line 152: `prisma.songRequest.findUnique()`

4. **拒绝点歌** (~3 处)
   - [ ] Line 167: `prisma.songRequest.findUnique()`
   - [ ] Line 172: `prisma.songRequest.update()`

**示例转换**：

```typescript
export async function submitRequest(input: SubmitInput, ip: string): Promise<{ queryCode: string }> {
  // ... 验证逻辑 ...
  
  const since = shanghaiDayStart();
  
  // 计数查询
  const ipCountResult = await db
    .select({ count: count() })
    .from(songRequest)
    .where(
      and(
        eq(songRequest.submitIp, ip),
        gte(songRequest.createdAt, since)
      )
    );
  const ipUsed = ipCountResult[0].count;
  
  // 身份检查（如需要）
  let identityUsed: number | null = null;
  if (identity) {
    const identityCountResult = await db
      .select({ count: count() })
      .from(songRequest)
      .where(
        and(
          eq(songRequest.grade, identity.grade),
          eq(songRequest.classNo, identity.classNo),
          eq(songRequest.requesterName, identity.requesterName),
          gte(songRequest.createdAt, since)
        )
      );
    identityUsed = identityCountResult[0].count;
  }
  
  assertDailyLimits(ipUsed, identityUsed);
  
  // ... 后续逻辑 ...
  
  // 创建
  let queryCode: string;
  let tries = 0;
  while (tries++ < 100) {
    queryCode = newQueryCode();
    try {
      await db.insert(songRequest).values({
        id: generateId(),
        queryCode,
        source: input.source,
        platformId: input.platformId,
        title: song.title,
        artist: song.artist,
        album: song.album ?? null,
        durationMs: song.durationMs,
        coverUrl: song.coverUrl ?? null,
        grade: identity?.grade ?? null,
        classNo: identity?.classNo ?? null,
        requesterName: identity?.requesterName ?? null,
        status: 'PENDING',
        flaggedWords: JSON.stringify(hits),
        isManual: false,
        submitIp: ip,
      });
      break;
    } catch (error) {
      // 如果是唯一键冲突，继续重试
      if (/* 是否是 UNIQUE 冲突 */) continue;
      throw error;
    }
  }
  
  return { queryCode };
}
```

**测试**：
- [ ] 提交点歌限流验证
- [ ] 创建点歌成功
- [ ] 查询点歌成功
- [ ] 拒绝点歌成功

---

#### 🔴 `src/services/schedule.ts` [PRIORITY: CRITICAL]

**修改处数**：约 40-50 处（最复杂的业务逻辑）

**关键操作**：

1. **可播日期检查** (~5 处)
   - [ ] Line 27: `prisma.calendarDay.findUnique()`

2. **���量检查** (~5 处)
   - [ ] Line 51: `prisma.broadcastSlot.findUnique()`
   - [ ] Line 54-57: `prisma.schedule.findMany()` - Join 查询

3. **排期操作** (~15 处)
   - [ ] Line 74: `prisma.songRequest.findUnique()`
   - [ ] Line 81-84: `prisma.schedule.findMany()` - 获取排序号
   - [ ] Line 87-103: `prisma.$transaction()` - 复杂事务

4. **排序操作** (~10 处)
   - [ ] 多个 update 和 transaction

5. **其他操作** (~5 处)
   - [ ] findMany、delete 等

**重点示例代码**：

```typescript
// checkCapacity 函数
async function checkCapacity(playDate: string, slotId: string, addMs: number): Promise<CapacityNote> {
  const slot = await db
    .select()
    .from(broadcastSlot)
    .where(eq(broadcastSlot.id, slotId))
    .limit(1)
    .then(rows => rows[0]);
  
  if (!slot || !slot.enabled) {
    throw badRequest('BAD_SLOT', '时段不对或已停用');
  }
  
  // Join 查询：获取该时段的所有排期及其对应的歌曲时长
  const existing = await db
    .select({
      schedule: schedule,
      durationMs: songRequest.durationMs,
    })
    .from(schedule)
    .innerJoin(songRequest, eq(schedule.requestId, songRequest.id))
    .where(
      and(
        eq(schedule.playDate, playDate),
        eq(schedule.slotId, slotId)
      )
    );
  
  const notes: string[] = [];
  if (slot.maxCount && existing.length + 1 > slot.maxCount) {
    notes.push(`超过「${slot.name}」${slot.maxCount} 首的上限`);
  }
  
  const totalMs = existing.reduce((sum, row) => sum + row.durationMs, 0) + addMs;
  if (slot.maxMs && totalMs > slot.maxMs) {
    notes.push(`超过「${slot.name}」的总时长上限`);
  }
  
  return { over: notes.length > 0, message: notes.join('；') || null };
}

// scheduleRequest 函数
export async function scheduleRequest(
  actorId: string,
  requestId: string,
  playDate: string,
  slotId: string,
): Promise<{ orderNo: number; capacity: CapacityNote }> {
  const request = await db
    .select()
    .from(songRequest)
    .where(eq(songRequest.id, requestId))
    .limit(1)
    .then(rows => rows[0]);
  
  if (!request) throw notFound('REQUEST_NOT_FOUND', '这条点歌不存在');
  if (request.status === 'REJECTED') throw badRequest('ALREADY_REJECTED', '这条已经驳回了');
  
  await assertPlayable(playDate);
  const capacity = await checkCapacity(playDate, slotId, request.durationMs);
  
  // 获取当前最大排序号
  const existingOrders = await db
    .select({ orderNo: schedule.orderNo })
    .from(schedule)
    .where(
      and(
        eq(schedule.playDate, playDate),
        eq(schedule.slotId, slotId)
      )
    );
  
  const orderNo = nextOrderNo(existingOrders.map((row) => row.orderNo));
  
  // 事务：upsert schedule + update songRequest
  await db.transaction(async (tx) => {
    // 检查是否已排期
    const existingSchedule = await tx
      .select()
      .from(schedule)
      .where(eq(schedule.requestId, requestId))
      .limit(1)
      .then(rows => rows[0]);
    
    if (existingSchedule) {
      // 更新
      await tx
        .update(schedule)
        .set({ playDate, slotId, orderNo })
        .where(eq(schedule.id, existingSchedule.id));
    } else {
      // 创建
      await tx.insert(schedule).values({
        id: generateId(),
        requestId,
        playDate,
        slotId,
        orderNo,
      });
    }
    
    // 更新点歌状态
    await tx
      .update(songRequest)
      .set({
        status: 'SCHEDULED',
        rejectReason: null,
        reviewedAt: new Date(),
        reviewedById: actorId,
      })
      .where(eq(songRequest.id, requestId));
    
    // 记录审计
    await writeAudit({
      actorId,
      action: 'SCHEDULE',
      targetId: requestId,
      detail: { playDate, slotId, orderNo },
    });
  });
  
  return { orderNo, capacity };
}
```

**测试**：
- [ ] 排期功能正常
- [ ] 容量限制检查正确
- [ ] 排序功能正确
- [ ] 事务回滚正常
- [ ] 审计日志记录

---

#### ⚠️ `src/services/site.ts` [PRIORITY: MEDIUM]

**修改处数**：约 5 处

**主要操作**：
- [ ] `prisma.siteSetting.findMany()`
- [ ] `prisma.gradeConfig.findMany()`
- [ ] 缓存逻辑

---

### 3.4 其他文件

#### ⚠️ `src/services/source-accounts.ts` [PRIORITY: LOW]

**检查**：
```bash
grep -n "prisma\." src/services/source-accounts.ts
```

---

## 📊 第四阶段：数据库迁移

### 4.1 SQLite 数据库

**步骤**：

1. 备份现有数据库：
```bash
cp data/app.db data/app.db.backup
```

2. 验证新 schema 与旧数据兼容：
```bash
# 使用 drizzle-kit 生成迁移（需要配置）
npm run db:generate
```

3. 检查数据完整性：
```typescript
// 编写简单脚本验证
import { db } from './src/lib/db.js';
const counts = await Promise.all([
  db.select({ count: countFn() }).from(songRequest),
  db.select({ count: countFn() }).from(schedule),
  db.select({ count: countFn() }).from(adminUser),
  // ...其他表
]);
console.log('数据行数验证:', counts);
```

---

### 4.2 PostgreSQL 数据库

1. 创建备份：
```bash
pg_dump $DATABASE_URL > backup.sql
```

2. 执行迁移：
```bash
npm run db:push
```

---

## 🧪 第五阶段：单元测试

### 5.1 现有测试

```bash
npm test
```

**测试文件**：
- [ ] `src/services/requests.test.ts`
- [ ] `src/services/schedule.test.ts`
- [ ] `src/lib/crypto.test.ts`
- [ ] 其他

### 5.2 需要补充的测试

```typescript
// src/services/requests.test.ts 中需要验证

describe('submitRequest', () => {
  it('should count daily limit correctly with Drizzle', async () => {
    // 原有测试逻辑，但使用新 db
  });
});

describe('schedule operations', () => {
  it('should handle transaction rollback', async () => {
    // 测试事务回滚
  });
});
```

---

## 🔍 第六阶段：集成测试

### 6.1 手动功能测试

| 功能 | 测试步骤 | 状态 |
|------|---------|------|
| 用户登录 | 输入用户名密码 | [ ] |
| 点歌提交 | 提交新点歌 | [ ] |
| 点歌查询 | 用查询码查询 | [ ] |
| 待审列表 | 查看待审核列表 | [ ] |
| 审核与排期 | 审核并排期歌曲 | [ ] |
| 管理时段 | 新增/修改/删除播出时段 | [ ] |
| 管理日历 | 标记放假和考试 | [ ] |
| 管理敏感词 | 导入敏感词列表 | [ ] |
| 修改密码 | 修改管理员密码 | [ ] |
| 导出数据 | 导出点歌数据 | [ ] |
| 审计日志 | 查看操作日志 | [ ] |

### 6.2 API 测试

```bash
# 使用 curl 或 Postman 测试关键 API

# 1. 登录
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"..."}'

# 2. 获取配置
curl -X GET http://localhost:3000/api/admin/config

# 3. 提交点歌
curl -X POST http://localhost:3000/api/public/requests \
  -H "Content-Type: application/json" \
  -d '{"source":"netease","platformId":"..."}'
```

---

## 🐛 第七阶段：问题修复与优化

### 常见问题

| 问题 | 解决方案 |
|------|---------|
| 时间显示不一致 | 检查 Drizzle schema 中的 timestamp 模式 |
| 布尔值显示为 0/1 | SQLite 无原生 boolean，正常行为 |
| 查询性能下降 | 检查索引是否正确创建 |
| 大量 SELECT 查询 | 考虑使用 Drizzle 的 query builder 优化 |
| 事务超时 | 优化 transaction 内的操作，减少锁持时 |

### 性能优化检查列表

- [ ] 创建正确的数据库索引
- [ ] 移除不必要的 SELECT（使用投影）
- [ ] 优化 N+1 查询（使用 join 或 batch）
- [ ] 检查事务大小（不要过大）
- [ ] 验证连接池配置

---

## ✅ 验收标准

### 代码完成

- [ ] 所有 623 处 Prisma 调用已替换
- [ ] 没有 `prisma.` 的引用（可用 grep 验证）
- [ ] TypeScript 编译无错误
- [ ] ESLint 检查通过

### 功能完成

- [ ] 所有 14 个主要功能正常
- [ ] 现有数据完整无丢失
- [ ] 性能无显著下降

### 测试完成

- [ ] 单元测试全部通过
- [ ] 集成测试全部通过
- [ ] 手动测试覆盖所有功能
- [ ] 未发现 Critical bugs

### 文档完成

- [ ] MIGRATION_GUIDE.md 已更新
- [ ] README 已更新（如需）
- [ ] 代码注释已添加（复杂逻辑）

---

## 📋 最终检查清单

```bash
# 1. 验证所有 Prisma 引用已移除
grep -r "from.*prisma\|import.*prisma" src/ && echo "FOUND PRISMA REFS!" || echo "✓ No Prisma refs"

# 2. 验证 Drizzle 导入正确
grep -r "from.*drizzle\|from.*db" src/ | wc -l

# 3. 验证编译无错
npm run build

# 4. 验证测试通过
npm test

# 5. 验证应用启动
npm run dev &
sleep 5
curl http://localhost:3000/api/health || echo "FAILED"
```

---

## 🚀 部署前检查

- [ ] 所有源代码已提交到 Git
- [ ] 依赖已更新（package-lock.json）
- [ ] 环境变量配置正确
- [ ] 数据库备份已创建
- [ ] 数据库迁移脚本已验证
- [ ] 回滚计划已准备
- [ ] 监控告警已配置

---

## 时间估算

| 阶段 | 文件数 | 预计时间 |
|------|--------|---------|
| 安装与配置 | - | 30 分钟 |
| 新建文件验证 | 4 | 30 分钟 |
| 核心库迁移 | 1 | 1 小时 |
| 路由层迁移 | 4 | 2 小时 |
| 服务层迁移 | 12 | 8 小时 |
| 数据库迁移 | - | 1 小时 |
| 单元测试 | - | 2 小时 |
| 集成测试 | - | 3 小时 |
| **总计** | **20** | **18.5 小时** |

---

## 联系与支持

- 迁移指南：见 `MIGRATION_GUIDE.md`
- Drizzle 文档：https://orm.drizzle.team/
- 数据库驱动文档：
  - SQLite: https://github.com/WiseLibs/better-sqlite3
  - PostgreSQL: https://node-postgres.com/

祝迁移顺利！
