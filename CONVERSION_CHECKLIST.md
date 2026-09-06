# 📋 Prisma → Drizzle 转换项目清单

## 阶段 1️⃣: 已完成

### ✅ schedule.ts 转换完成

| 项目 | 状态 | 详情 |
|------|------|------|
| 代码转换 | ✅ | 16 处 Prisma 调用全部转换 |
| TypeScript 编译 | ✅ | 仅 better-sqlite3 类型警告（可接受） |
| 导入更新 | ✅ | 移除 prisma，添加 drizzle-orm 和 schema |
| 文档编写 | ✅ | 3 份详细报告 + 本清单 |

### 📄 生成文档

1. **SCHEDULE_CONVERSION_REPORT.md** (详尽）
   - 16 处转换点的详细说明
   - 每个转换点的 Before/After 代码示例
   - 需要手动验证的 7 个关键点
   - 运行时问题排查指南
   - 性能优化建议

2. **SCHEDULE_CONVERSION_SUMMARY.md** (总结）
   - 快速参考
   - 核心转换映射表
   - 函数转换对照表
   - 已知限制与风险
   - 后续行动

3. **本文件** (项目清单）
   - 总体进度追踪
   - 验证指南
   - 下一步步骤

---

## 阶段 2️⃣: 需要手动验证 ⏳

### 🔍 验证点详解

#### #1: Upsert 竞态条件 (scheduleRequest)

**位置**: `scheduleRequest()` 函数，行 118-151

**问题**: 
- Drizzle 没有原生 `upsert()` 操作
- 手动实现的"查询→更新或插入"在高并发下可能出问题
- 两个请求同时检查可能都发现 schedule 不存在，导致重复创建

**验证步骤**:
```bash
# 创建测试用例
npm test -- scheduleRequest.concurrent.test.ts

# 预期结果
✓ 并发调用不应创建重复
✓ 最终状态应一致
```

**修复建议**:
- 为 PostgreSQL 使用 `onConflictDoUpdate`
- 为 SQLite 添加应用级锁（缓存锁）
- 或在数据库约束层面处理

---

#### #2: 关系查询重构 (listRequests, readAdminDay)

**位置**: `listRequests()` 行 338-400，`readAdminDay()` 行 421-450

**问题**:
- JOIN 结果被扁平化为单层对象
- 需要手动重构嵌套的 `schedule.slot` 关系
- 字段别名冲突风险

**验证步骤**:
```typescript
// 测试场景 1: 未排期的歌曲
const items = await listRequests({ status: 'PENDING' })
assert(items.some(item => item.schedule === null))

// 测试场景 2: 已排期的歌曲
const scheduled = await listRequests({ status: 'SCHEDULED' })
assert(scheduled.every(item => 
  item.schedule?.slotName !== undefined &&
  item.schedule?.playDate !== undefined
))

// 测试场景 3: 按日期筛选
const day = await readAdminDay('2024-12-25')
assert(day.every(slot => 
  slot.slotName &&
  slot.songs.every(song => song.schedule?.playDate === '2024-12-25')
))
```

**修复建议**:
- 添加集成测试覆盖所有字段映射
- 使用 TypeScript 类型守卫确保字段存在
- 考虑创建 JOIN 结果类型，减少手动重构

---

#### #3: 事务一致性 (reorderSlot)

**位置**: `reorderSlot()` 函数，行 250-269

**问题**:
- 两步更新：先改负数，再改正数
- 如果中间事务失败，数据库中会留下负数 orderNo
- 查询可能看到中间状态

**验证步骤**:
```typescript
// 初始状态
let schedules = await db.select().from(schedule).where(eq(schedule.slotId, slotId))
// orderNo: [1, 2, 3]

// 启动重排（模拟在第一步暂停）
const promise = reorderSlot(actorId, playDate, slotId, [3, 1, 2])

// 立即查询（可能看到负数）
await new Promise(r => setTimeout(r, 50)) // 给时间让事务执行
schedules = await db.select().from(schedule).where(eq(schedule.slotId, slotId))
console.log(schedules.map(s => s.orderNo)) // 应该是 [1,2,3] 或 [-1,-2,-3] 或 [3,1,2]，不混合

// 等待完成
await promise
schedules = await db.select().from(schedule).where(eq(schedule.slotId, slotId))
// orderNo: [3, 1, 2] ✓
```

**修复建议**:
- SQLite 使用 WAL 模式提高并发性能
- 考虑使用数据库约束防止中间状态被看到
- 或单步更新使用更小的事务粒度

---

#### #4: 分页一致性 (listRequests)

**位置**: `listRequests()` 函数，行 320-400

**问题**:
- 计数和查询使用不同的 WHERE 逻辑分支
- 当有 `filter.date` 时需要 JOIN schedule
- 可能导致 total != 实际返回数据

**验证步骤**:
```typescript
// 测试场景: 按日期筛选，多页分页
const allData = await listRequests({ date: '2024-12-25', page: 1 })
console.log(`Total: ${allData.total}, Page: ${allData.page}, Items: ${allData.items.length}`)

// 验证总数准确性
let collectedItems = allData.items
for (let page = 2; page <= Math.ceil(allData.total / 30); page++) {
  const nextPage = await listRequests({ date: '2024-12-25', page })
  collectedItems.push(...nextPage.items)
}
assert(collectedItems.length === allData.total) // 关键检查

// 测试边界情况
const empty = await listRequests({ date: '2099-12-25', page: 1 })
assert(empty.total === 0)
assert(empty.items.length === 0)

const lastPage = await listRequests({ 
  date: '2024-12-25', 
  page: Math.ceil(allData.total / 30) 
})
assert(lastPage.items.length > 0 && lastPage.items.length <= 30)
```

**修复建议**:
- 统一计数和查询的 WHERE 逻辑
- 添加集成测试确保分页一致性
- 考虑使用数据库视图简化查询

---

#### #5: PostgreSQL 兼容性

**位置**: 整个文件（使用 SQLite schema）

**问题**:
- 代码基于 `schema-sqlite.ts` 开发
- 某些 SQL 语法可能不兼容 PostgreSQL
- Drizzle 的事务 API 在两个数据库上行为不同

**验证步骤**:
```bash
# 1. 在 PostgreSQL 环境运行所有测试
export DATABASE_URL="postgresql://..."
npm test

# 2. 检查特定转换点
# - upsert: 使用 onConflictDoUpdate
# - 事务: 验证隔离级别
# - 日期: 检查时区处理
```

**修复建议**:
- 创建数据库抽象层
- 使用 Drizzle 的数据库特定 API（已有 `schema-pg.ts`）
- 为每个数据库编写特定的优化

---

## 阶段 3️⃣: 部署前准备 📋

### 前置条件检查表

- [ ] 所有验证点测试通过
- [ ] TypeScript 无错误（除类型声明）
- [ ] 代码审查完成
- [ ] 性能基准测试完成
- [ ] PostgreSQL 验证完成

### 测试覆盖

```
schedule.ts 测试覆盖率目标: 85%+

必测函数:
  [x] assertPlayable - 日期验证
  [x] checkCapacity - 时段容量检查  
  [ ] scheduleRequest - 排期和 upsert
  [ ] rejectRequest - 驳回和删除
  [ ] unschedule - 撤期
  [ ] reorderSlot - 两步排序
  [ ] manualAdd - 创建和排期
  [ ] listRequests - 列表和分页
  [ ] readAdminDay - 关系重构
```

### 性能基准

| 操作 | 目标时间 | Prisma | Drizzle | 差异 |
|------|--------|--------|---------|------|
| scheduleRequest | < 100ms | - | ⏳ | - |
| reorderSlot (10 items) | < 500ms | - | ⏳ | - |
| listRequests (100 items) | < 200ms | - | ⏳ | - |
| readAdminDay (5 slots, 30 songs) | < 300ms | - | ⏳ | - |

---

## 🚀 部署步骤

### Step 1: 灰度上线 (Week 1)

```
10% 流量 → 监控 24 小时 → 无异常
  ↓
50% 流量 → 监控 24 小时 → 无异常
  ↓
100% 流量
```

### Step 2: 回滚预案

```bash
# 如果出现问题，立即回滚
git revert <commit-hash>
npm run migrate:rollback  # 如有必要
systemctl restart yangyi-service
```

### Step 3: 监控告警

```
关键指标:
  ✓ p95 响应时间 > 500ms → 告警
  ✓ 错误率 > 0.1% → 告警
  ✓ 数据库连接池满 → 告警
  ✓ 事务死锁 > 1/hour → 告警
```

---

## 📞 故障排查

### 问题 1: "UNIQUE constraint failed: Schedule(requestId)"

**原因**: Upsert 竞态条件  
**解决**:
1. 检查 scheduleRequest 并发调用日志
2. 手动检查数据库是否有重复 requestId
3. 使用 SELECT DISTINCT requestId 去重

### 问题 2: "Cannot read property 'slotName' of undefined"

**原因**: JOIN 关系重构错误  
**解决**:
1. 检查投影别名是否正确
2. 验证 leftJoin/innerJoin 是否正确
3. 添加 NULL 检查

### 问题 3: 分页数据总数不对

**原因**: 计数和查询逻辑不一致  
**解决**:
1. 对比计数和查询的 WHERE 子句
2. 检查是否有数据在查询间隙中被修改
3. 使用同一个数据库快照（事务隔离）

---

## 📊 进度追踪

```
┌─────────────────────────────────────────────────┐
│ 项目进度:  ███████████░░░░░░░░░░░░░░░░  60%    │
└─────────────────────────────────────────────────┘

✅ 代码转换
✅ 文档编写
⏳ 验证测试 (2-3 小时预计)
⏳ 性能基准 (1-2 小时预计)
⏳ 灰度上线 (1 周预计)
⏳ 全量上线 (1 周预计)
```

---

## 📮 反馈与支持

- **问题报告**: 使用 GitHub Issues 标签 `[drizzle-migration]`
- **讨论**: 在 #database-migration Slack 频道
- **文档**: 见 SCHEDULE_CONVERSION_REPORT.md

---

**版本**: 1.0  
**最后更新**: 2024  
**状态**: 进行中 🏗️

