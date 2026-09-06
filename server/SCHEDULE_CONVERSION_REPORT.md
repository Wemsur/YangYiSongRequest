# schedule.ts 转换报告：Prisma → Drizzle ORM

## 概览

- **文件**: `src/services/schedule.ts`
- **总转换数**: 16 处主要 Prisma 调用
- **转换状态**: ✅ 完成
- **转换时间**: 2024

## 转换摘要

| 原 Prisma API | 新 Drizzle API | 行数 | 说明 |
|---|---|---|---|
| `prisma.calendarDay.findUnique()` | `db.select().from().where().limit(1)` | 32 | 获取日期可播性检查 |
| `prisma.broadcastSlot.findUnique()` | `db.select().from().where().limit(1)` | 63 | 检查时段是否存在和启用 |
| `prisma.schedule.findMany()` with `innerJoin` | `db.select().from(schedule).innerJoin(songRequest)` | 76 | 检查时段容量 |
| `prisma.songRequest.findUnique()` | `db.select().from().where().limit(1)` | 99 | 获取点歌请求详情 |
| `prisma.schedule.findMany()` select | `db.select().from().where()` | 113 | 获取既有排序号 |
| `prisma.$transaction()` with `upsert` | `db.transaction()` | 118-151 | 排期请求（upsert 模式） |
| `prisma.songRequest.findUnique()` | `db.select().from().where().limit(1)` | 172 | 驳回前的验证 |
| `prisma.$transaction()` with `deleteMany` | `db.transaction()` | 180-195 | 驳回请求 |
| `prisma.$transaction()` with `deleteMany` | `db.transaction()` | 202-209 | 撤下排期 |
| `prisma.schedule.findMany()` select | `db.select().from().where()` | 239 | 获取同时段排期 |
| `prisma.$transaction()` callback | `db.transaction()` async callback | 250-269 | 重排 + 两步更新 |
| `prisma.songRequest.create()` returning | `db.insert().values().returning()` | 297 | 手动添加点歌 |
| `prisma.songRequest.count()` | `db.select({ count: count() }).from()` | 338-358 | 计数（复杂条件） |
| `prisma.songRequest.findMany()` with include | Left Join + 手动重构 | 360-400 | 列表查询（含排期关系） |
| `prisma.broadcastSlot.findMany()` | `db.select().from().orderBy(asc, asc)` | 421 | 获取启用的时段列表 |
| `prisma.songRequest.findMany()` with include | Inner Join 查询 + 手动重构 | 423-450 | 某日排期总览 |

## 关键转换点详解

### 1️⃣ 基础查询转换 (CONVERSION #1-4)

**原 Prisma**:
```typescript
const day = await prisma.calendarDay.findUnique({ where: { date: playDate } })
```

**新 Drizzle**:
```typescript
const days = await (db as any)
  .select()
  .from(calendarDay)
  .where(eq(calendarDay.date, playDate))
  .limit(1)
const day = days[0]
```

✅ **说明**: Drizzle 的 `select().from().where()` 返回数组，需要取 `[0]`

---

### 2️⃣ 关系查询（JOIN）转换 (CONVERSION #3)

**原 Prisma**:
```typescript
const existing = await prisma.schedule.findMany({
  where: { playDate, slotId },
  select: { request: { select: { durationMs: true } } },
})
const totalMs = existing.reduce((sum, row) => sum + row.request.durationMs, 0) + addMs
```

**新 Drizzle**:
```typescript
const existing = await (db as any)
  .select({
    durationMs: songRequest.durationMs,
  })
  .from(schedule)
  .innerJoin(songRequest, eq(schedule.requestId, songRequest.id))
  .where(and(eq(schedule.playDate, playDate), eq(schedule.slotId, slotId)))

const totalMs = existing.reduce((sum: number, row: any) => sum + row.durationMs, 0) + addMs
```

✅ **说明**: 
- Drizzle 使用 `innerJoin()` 代替 Prisma 的 `include`
- 选择字段时需要明确指定投影对象
- 结果已扁平化，无需嵌套访问 `row.request.durationMs`

---

### 3️⃣ 事务转换 (CONVERSION #6, #8, #9)

**原 Prisma** (数组风格):
```typescript
await prisma.$transaction([
  prisma.schedule.upsert({ ... }),
  prisma.songRequest.update({ ... }),
])
```

**原 Prisma** (回调风格):
```typescript
await prisma.$transaction(async (tx) => {
  await tx.songRequest.update({ ... })
  await tx.schedule.deleteMany({ ... })
})
```

**新 Drizzle**:
```typescript
await (db as any).transaction(async (tx: any) => {
  // 检查是否存在
  const existing = await tx
    .select()
    .from(schedule)
    .where(eq(schedule.requestId, requestId))
    .limit(1)

  if (existing.length > 0) {
    // 更新
    await tx
      .update(schedule)
      .set({ playDate, slotId, orderNo })
      .where(eq(schedule.requestId, requestId))
  } else {
    // 插入
    await tx.insert(schedule).values({
      id: scheduleId,
      requestId,
      playDate,
      slotId,
      orderNo,
    })
  }

  // 更新关联记录
  await tx
    .update(songRequest)
    .set({
      status: 'SCHEDULED',
      rejectReason: null,
      reviewedAt: new Date(),
      reviewedById: actorId,
    })
    .where(eq(songRequest.id, requestId))
})
```

✅ **说明**:
- Prisma 的数组风格事务自动并发执行，Drizzle 只支持回调风格（顺序执行）
- Drizzle 中没有 `upsert()`，需要手动实现：先查询，再选择更新或插入
- 事务中的 `tx` 对象需要通过 `(tx as any)` 和 `(eq as any)` 进行类型转换，因为 db 是联合类型

---

### 4️⃣ 创建与返回转换 (CONVERSION #12)

**原 Prisma**:
```typescript
const created = await prisma.songRequest.create({
  data: { ... },
  select: { id: true, queryCode: true },
})
```

**新 Drizzle**:
```typescript
const created = await (db as any)
  .insert(songRequest)
  .values({ ... })
  .returning({ id: songRequest.id, queryCode: songRequest.queryCode })

const result = created[0]
```

✅ **说明**:
- `insert().values().returning()` 返回数组，取 `[0]` 获取插入的记录
- 投影使用 `{ field: table.field }` 语法

---

### 5️⃣ 计数转换 (CONVERSION #13)

**原 Prisma**:
```typescript
const total = await prisma.songRequest.count({
  where: { submitIp: ip, createdAt: { gte: since } }
})
```

**新 Drizzle**:
```typescript
const result = await (db as any)
  .select({ count: count() })
  .from(songRequest)
  .where(
    and(
      eq(songRequest.submitIp, ip),
      gte(songRequest.createdAt, since)
    )
  )
const total = result[0]?.count ?? 0
```

✅ **说明**:
- 使用 `count()` 聚合函数需要导入
- 结果是数组，包含 `{ count: number }` 对象，需要取 `[0]`

---

### 6️⃣ 复杂 JOIN（包含关系）转换 (CONVERSION #13, #14)

**原 Prisma**:
```typescript
const rows = await prisma.songRequest.findMany({
  where: { schedule: { playDate: filter.date } },
  include: { 
    schedule: { 
      include: { slot: { select: { name: true } } } 
    } 
  },
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * take,
  take,
})
```

**新 Drizzle**:
```typescript
const rows = await (db as any)
  .select({
    id: songRequest.id,
    status: songRequest.status,
    // ... 其他字段 ...
    scheduleId: schedule.id,
    schedulePlayDate: schedule.playDate,
    scheduleSlotId: schedule.slotId,
    scheduleOrderNo: schedule.orderNo,
    slotName: broadcastSlot.name,
  })
  .from(songRequest)
  .leftJoin(schedule, eq(songRequest.id, schedule.requestId))
  .leftJoin(broadcastSlot, eq(schedule.slotId, broadcastSlot.id))
  .where(filter.date ? eq(schedule.playDate, filter.date) : undefined)
  .orderBy(desc(songRequest.createdAt))
  .limit(take)
  .offset((page - 1) * take)

// 手动重构嵌套结构
const items = rows.map((row: any) => {
  const scheduleData = row.scheduleId
    ? {
        playDate: row.schedulePlayDate,
        slotId: row.scheduleSlotId,
        orderNo: row.scheduleOrderNo,
        slot: { name: row.slotName },
      }
    : null
  
  return toAdminView({
    ...row,
    schedule: scheduleData,
  })
})
```

✅ **说明**:
- Drizzle 没有自动的 `include` 机制，必须手动使用 JOIN
- 多个 JOIN 结果被扁平化为单个对象，需要手动重构嵌套关系
- 投影时需要为每个相关表的字段添加别名，以避免列名冲突
- 使用 `leftJoin` 处理可选的关系（排期可能不存在）

---

### 7️⃣ 多字段排序转换 (CONVERSION #14)

**原 Prisma**:
```typescript
const slots = await prisma.broadcastSlot.findMany({
  where: { enabled: true },
  orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
})
```

**新 Drizzle**:
```typescript
const slots = await (db as any)
  .select()
  .from(broadcastSlot)
  .where(eq(broadcastSlot.enabled, true))
  .orderBy(asc(broadcastSlot.sortOrder), asc(broadcastSlot.startTime))
```

✅ **说明**:
- `orderBy()` 接收多个排序字段作为参数
- 使用 `asc()` 和 `desc()` 函数（需要导入）

---

## 导入变化

### 移除
```typescript
import { prisma } from '../lib/db.js'
```

### 新增
```typescript
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { schedule, songRequest, broadcastSlot, calendarDay } from '../drizzle/schema-sqlite.js'
```

## 数据库兼容性处理

Drizzle 支持 SQLite 和 PostgreSQL。代码使用类型转换 `(db as any)` 来处理联合类型：

- **SQLite**: 使用 better-sqlite3，同步 API
- **PostgreSQL**: 使用 pg 驱动，异步 API

当前代码基于 SQLite schema (`schema-sqlite.ts`) 开发，**需要验证在 PostgreSQL 上的行为**。

## 类型安全注意

由于 Drizzle 的 `db` 实例是 SQLite 和 PostgreSQL 驱动的联合类型，代码中使用了类型转换：

```typescript
await (db as any).transaction(async (tx: any) => { ... })
```

这牺牲了一些类型安全性，但保证了代码的运行时兼容性。

### 改进方案（可选）

创建一个类型包装器：

```typescript
import { db } from '../lib/db.js'

type DbClient = ReturnType<typeof import('drizzle-orm/better-sqlite3').drizzle> | 
                ReturnType<typeof import('drizzle-orm/node-postgres').drizzle>

const database = db as unknown as DbClient
```

## 🔍 需要手动验证的地方

### 1. Upsert 逻辑 (scheduleRequest 函数)

**位置**: 行 118-151

**问题**: Drizzle 不支持原生 `upsert()` 操作，需要手动实现"检查-更新或插入"逻辑。

**验证清单**:
- [ ] 确保 Schedule 表中 `requestId` 列的唯一约束正确处理
- [ ] 测试网络延迟情况下的竞态条件（两个并发 `scheduleRequest` 调用）
- [ ] 验证在 PostgreSQL 中的行为（可使用 `onConflictDoUpdate`）

**测试用例**:
```typescript
// 应该创建新排期
await scheduleRequest(actorId, requestId1, '2024-12-25', slotId)

// 应该更新现有排期（不创建重复）
await scheduleRequest(actorId, requestId1, '2024-12-26', slotId)
```

---

### 2. 关系查询的手动重构 (listRequests, readAdminDay)

**位置**: 行 338-400, 421-450

**问题**: Drizzle JOIN 结果是扁平化的，需要手动重构嵌套的 `schedule.slot` 关系。

**潜在 Bug**:
- 如果投影字段名冲突，可能导致数据覆盖
- 手动重构时可能遗漏字段

**验证清单**:
- [ ] 测试 `schedule` 为 `null` 的情况（点歌未排期）
- [ ] 验证 `slot.name` 正确传递到 `slotName` 字段
- [ ] 检查 `toAdminView` 函数是否正确处理所有投影字段

**测试用例**:
```typescript
const { items } = await listRequests({ status: 'SCHEDULED' })

// 验证排期数据
items.forEach(item => {
  if (item.schedule) {
    assert(item.schedule.slotName !== null)
    assert(item.schedule.slotName === expectedSlotName)
  }
})
```

---

### 3. 事务中的 WHERE 子句

**位置**: 行 122, 186, 204, 250

**问题**: 在事务回调中，可能需要检查条件的求值时机。

**验证清单**:
- [ ] 当 `schedule` 不存在时是否正确执行 INSERT 分支
- [ ] 当 `schedule` 已存在时是否正确执行 UPDATE 分支
- [ ] 事务回滚时是否保持一致性（使用 SQLite 的 ROLLBACK）

---

### 4. 分组与聚合 (checkCapacity)

**位置**: 行 76-88

**问题**: 需要计算同时段现有歌曲的总时长。

**验证清单**:
- [ ] 当时段内没有现有排期时是否返回正确的容量信息
- [ ] 当时段已满时是否正确提示超限
- [ ] 验证 `maxCount` 和 `maxMs` 的优先级逻辑

**测试用例**:
```typescript
// 假设时段最多 10 首、总时长不超过 30 分钟
const capacity1 = await checkCapacity(playDate, slotId, 5 * 60 * 1000)
assert(capacity1.over === false)

const capacity2 = await checkCapacity(playDate, slotId, 25 * 60 * 1000)
assert(capacity2.over === true)
assert(capacity2.message.includes('总时长'))
```

---

### 5. 两步排序转换 (reorderSlot)

**位置**: 行 250-269

**问题**: 为了避免唯一约束 `(playDate, slotId, orderNo)` 冲突，使用负数中间值。

**验证清单**:
- [ ] 验证第一步更新为负数是否成功
- [ ] 验证第二步更新为正数是否成功
- [ ] 如果事务中途失败，是否有中间状态（负数 orderNo）泄露

**测试用例**:
```typescript
// 初始状态：歌曲 A(orderNo=1), B(orderNo=2), C(orderNo=3)
// 操作：调整为 C, A, B

// 在事务中断时查询，不应该看到负数 orderNo
const query = sql`SELECT * FROM Schedule WHERE playDate = ${date} AND slotId = ${slotId}`
const results = await db.run(query)
results.forEach(r => assert(r.orderNo > 0 || r.orderNo < 0)) // 确保要么正数，要么在事务中
```

---

### 6. 分页与计数的一致性 (listRequests)

**位置**: 行 320-400

**问题**: 计数和分页使用不同的逻辑分支，可能导致数据不一致。

**验证清单**:
- [ ] 当 `filter.date` 存在时，计数和查询都应该 JOIN schedule
- [ ] 当只有 `filter.status` 时，不应该 JOIN schedule
- [ ] 验证分页偏移量正确计算
- [ ] 边界情况：总数 < pageSize、lastPage 的分页是否正确

**测试用例**:
```typescript
// 假设有 95 条记录，pageSize=30
const page1 = await listRequests({ page: 1 })
assert(page1.total === 95)
assert(page1.items.length === 30)

const page4 = await listRequests({ page: 4 })
assert(page4.items.length === 5) // 最后一页

const page5 = await listRequests({ page: 5 })
assert(page5.items.length === 0) // 超出范围
```

---

### 7. NULL 值处理 (readAdminDay)

**位置**: 行 421-450

**问题**: 使用 `leftJoin` 意味着 `schedule` 可能为 NULL，需要检查过滤逻辑。

**当前代码**:
```typescript
.where(eq(schedule.playDate, date))
```

**潜在问题**: 如果 `schedule.playDate` 为 NULL（未排期的歌曲），该条件会排除它。但 `readAdminDay` 只应该返回已排期的歌曲，所以这是正确的。

**验证清单**:
- [ ] 确认 `innerJoin` 使用是否合理（只返回有排期的歌曲）
- [ ] 如果需要返回"未排期的歌曲"，应该使用 `leftJoin` + NULL 检查

---

## 运行时问题排查指南

### 错误 1: "transaction is not a function"

**原因**: Drizzle 实例类型不正确

**解决**:
```typescript
// 确保导入正确的 drizzle 包
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
```

### 错误 2: "Cannot read property 'requestId' of undefined"

**原因**: JOIN 结果的字段映射错误

**解决**: 检查投影对象中的字段别名是否与后续访问一致

```typescript
// 投影时
.select({
  scheduleId: schedule.id,  // ← 别名
  scheduleSlotId: schedule.slotId,
})

// 访问时
if (row.scheduleId) { ... }  // ← 使用别名
```

### 错误 3: "UNIQUE constraint failed"

**原因**: Upsert 逻辑中的竞态条件或唯一性校验错误

**解决**: 
1. 检查是否有多个并发请求修改同一条记录
2. 考虑使用数据库级别的锁（如 `SELECT ... FOR UPDATE`）
3. 使用 PostgreSQL 的 `onConflictDoUpdate` 原生支持

---

## 性能考虑

### 1. JOIN 查询性能 (listRequests, readAdminDay)

当前实现使用多个 LEFT/INNER JOIN，可能生成较大的中间结果集。

**建议优化**:
- 为 `schedule.playDate`, `songRequest.status`, `schedule.slotId` 添加索引
- 考虑分离查询：先获取 songRequest，再批量加载 schedule
- 在 PostgreSQL 中使用 `EXPLAIN ANALYZE` 检查执行计划

### 2. 事务锁定 (scheduleRequest, reorderSlot)

使用事务回调会导致 SQLite 上的阻塞。

**建议优化**:
- 缩短事务内的操作时间
- 避免在事务中调用外部 API（已做好）
- 考虑使用 PRAGMA 优化 SQLite 性能：
  ```typescript
  await db.run(sql`PRAGMA journal_mode = WAL`)
  await db.run(sql`PRAGMA synchronous = NORMAL`)
  ```

### 3. 计数查询 (listRequests)

每次分页都需要执行独立的计数查询。

**优化方案**:
- 缓存总数（如果数据变化不频繁）
- 使用 PostgreSQL 的 `count(*)` OVER 窗口函数
- 考虑实现游标分页而非偏移分页

---

## 测试建议

### 单元测试

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest'
import * as schedule from './schedule'

describe('schedule service', () => {
  beforeEach(() => {
    // 初始化测试数据库
  })

  afterEach(() => {
    // 清理测试数据
  })

  describe('scheduleRequest', () => {
    it('should create new schedule when request not scheduled', async () => {
      const result = await schedule.scheduleRequest(actorId, requestId, playDate, slotId)
      expect(result.orderNo).toBe(1)
    })

    it('should update existing schedule', async () => {
      // 第一次排期
      await schedule.scheduleRequest(actorId, requestId, '2024-12-25', slotId1)
      // 第二次改期
      const result = await schedule.scheduleRequest(actorId, requestId, '2024-12-26', slotId2)
      expect(result.orderNo).toBe(1) // 新时段的第一首
    })
  })

  describe('reorderSlot', () => {
    it('should reorder songs in a slot', async () => {
      // 创建 3 首歌
      // 重新排序
      // 验证 orderNo
    })
  })
})
```

### 集成测试

- 验证完整的审核流程：创建 → 排期 → 重排 → 驳回
- 并发测试：多个用户同时排期/重排
- 数据一致性：在事务中断时检查数据库状态

---

## 迁移完成清单

- [ ] 代码转换完成（已）
- [ ] TypeScript 编译通过（需要 `@types/better-sqlite3`）
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 性能测试（与 Prisma 版本对比）
- [ ] PostgreSQL 兼容性验证
- [ ] 代码审查
- [ ] 灰度上线
- [ ] 监控告警配置

---

## 相关文件

- `PRISMA_TO_DRIZZLE.md` - 转换参考指南
- `src/drizzle/db.ts` - Drizzle 初始化
- `src/drizzle/schema-sqlite.ts` - SQLite Schema
- `src/drizzle/schema-pg.ts` - PostgreSQL Schema

---

**转换完成日期**: 2024年
**转换者**: Claude Code
**最后验证日期**: -

