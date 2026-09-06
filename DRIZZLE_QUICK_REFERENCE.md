# Drizzle ORM 快速参考 - config.ts

## 🎯 核心转换规则

### 1️⃣ 查询 (SELECT)

**Prisma:**
```typescript
const data = await prisma.table.findMany({ where: {...}, orderBy: {...} })
```

**Drizzle:**
```typescript
const data = await (db as any).select().from(table).where(...).orderBy(...)
```

---

### 2️⃣ 计数 (COUNT)

**Prisma:**
```typescript
const count = await prisma.table.count({ where: {...} })
```

**Drizzle:**
```typescript
const result = await (db as any).select({ count: count() }).from(table).where(...)
const cnt = result[0]?.count ?? 0
```

---

### 3️⃣ 插入 (INSERT)

**Prisma:**
```typescript
const record = await prisma.table.create({ data: {...} })
```

**Drizzle:**
```typescript
await (db as any).insert(table).values({...})
```

**批量插入:**
```typescript
await (db as any).insert(table).values([...])
```

---

### 4️⃣ 更新 (UPDATE)

**Prisma:**
```typescript
await prisma.table.update({ where: {...}, data: {...} })
```

**Drizzle:**
```typescript
await (db as any).update(table).set({...}).where(...)
```

---

### 5️⃣ 删除 (DELETE)

**Prisma:**
```typescript
await prisma.table.delete({ where: {...} })
await prisma.table.deleteMany({ where: {...} })
```

**Drizzle:**
```typescript
await (db as any).delete(table).where(...)
```

**批量删除:**
```typescript
await (db as any).delete(table).where(inArray(table.id, ids))
```

---

### 6️⃣ Upsert (插入或更新)

**Prisma:**
```typescript
await prisma.table.upsert({
  where: {...},
  update: {...},
  create: {...}
})
```

**Drizzle (手动实现):**
```typescript
const existing = await (db as any).select().from(table).where(eq(table.id, id))

if (existing.length > 0) {
  await (db as any).update(table).set({...}).where(eq(table.id, id))
} else {
  await (db as any).insert(table).values({id, ...})
}
```

---

### 7️⃣ 事务 (TRANSACTION)

**Prisma:**
```typescript
await prisma.$transaction([
  prisma.table1.create({...}),
  prisma.table2.update({...}),
])
```

**Drizzle:**
```typescript
await (db as any).transaction(async (tx: any) => {
  await tx.insert(table1).values({...})
  await tx.update(table2).set({...}).where(...)
})
```

---

## 📊 Drizzle 操作符快速查表

| 操作 | 操作符 | 示例 |
|-----|--------|------|
| 等于 | `eq()` | `eq(table.id, 1)` |
| 大于 | `gt()` | `gt(table.age, 18)` |
| 大于等于 | `gte()` | `gte(table.date, "2024-01-01")` |
| 小于 | `lt()` | `lt(table.price, 100)` |
| 小于等于 | `lte()` | `lte(table.date, "2024-12-31")` |
| 不等于 | `ne()` | `ne(table.status, "deleted")` |
| IN 查询 | `inArray()` | `inArray(table.id, [1,2,3])` |
| 为空 | `isNull()` | `isNull(table.deletedAt)` |
| 非空 | `isNotNull()` | `isNotNull(table.email)` |
| LIKE | `like()` | `like(table.name, "%john%")` |
| BETWEEN | `between()` | `between(table.age, 18, 65)` |
| AND | `and()` | `and(eq(...), gt(...))` |
| OR | `or()` | `or(eq(...), eq(...))` |
| NOT | `not()` | `not(eq(...))` |

---

## 🔍 config.ts 中的实际使用

### saveSlots() - 复杂事务示例

```typescript
await (db as any).transaction(async (tx: any) => {
  // 1. 批量删除
  if (removed.length > 0) {
    await tx
      .delete(broadcastSlot)
      .where(inArray(broadcastSlot.id, removed.map((r: any) => r.id)))
  }

  // 2. 循环更新或插入
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index]!
    const data = { ... }

    if (slot.id) {
      // 更新
      await tx.update(broadcastSlot).set(data).where(eq(broadcastSlot.id, slot.id))
    } else {
      // 插入
      await tx.insert(broadcastSlot).values({
        id: crypto.randomUUID(),
        ...data,
      })
    }
  }
})
```

### readCalendar() - 范围查询示例

```typescript
await (db as any)
  .select()
  .from(calendarDay)
  .where(
    and(
      gte(calendarDay.date, `${month}-01`),
      lte(calendarDay.date, `${month}-31`),
    ),
  )
  .orderBy(asc(calendarDay.date))
```

### saveBannedWords() - 全量替换示例

```typescript
await (db as any).transaction(async (tx: any) => {
  // 删除所有
  await tx.delete(bannedWord)
  
  // 插入新数据
  if (cleaned.length > 0) {
    await tx.insert(bannedWord).values(
      cleaned.map((word) => ({ word })),
    )
  }
})
```

---

## ⚠️ 常见陷阱与解决方案

### 1. 计数操作
❌ **错误:**
```typescript
const count = await (db as any).select().from(schedule).where(...)
// 返回数组，不是数字
```

✅ **正确:**
```typescript
const result = await (db as any).select({ count: count() }).from(schedule).where(...)
const count = result[0]?.count ?? 0
```

---

### 2. 空值处理
❌ **错误:**
```typescript
await (db as any).insert(table).values({
  note: day.note?.trim() || null  // 可能为空字符串
})
```

✅ **正确:**
```typescript
const noteValue = day.note?.trim() || null
await (db as any).insert(table).values({
  note: noteValue
})
```

---

### 3. 批量操作中的类型错误
❌ **错误:**
```typescript
await (db as any).delete(table).where(table.id in ids)  // 语法错误
```

✅ **正确:**
```typescript
await (db as any).delete(table).where(inArray(table.id, ids))
```

---

### 4. 条件组合
❌ **错误:**
```typescript
.where(eq(table.a, 1), eq(table.b, 2))  // 错误的参数形式
```

✅ **正确:**
```typescript
.where(and(eq(table.a, 1), eq(table.b, 2)))
```

---

### 5. 新记录创建时的 ID
❌ **错误:**
```typescript
await tx.insert(broadcastSlot).values({
  name: slot.name,
  // 缺少 id
})
```

✅ **正确:**
```typescript
await tx.insert(broadcastSlot).values({
  id: crypto.randomUUID(),
  name: slot.name,
})
```

---

## 🧪 测试用例模板

### 测试 Upsert 功能

```typescript
async function testUpsert() {
  const id = crypto.randomUUID()
  
  // 第一次：应该插入
  await (db as any).transaction(async (tx: any) => {
    const existing = await tx.select().from(table).where(eq(table.id, id))
    if (existing.length > 0) {
      await tx.update(table).set({...}).where(eq(table.id, id))
    } else {
      await tx.insert(table).values({id, ...})
    }
  })
  
  // 验证插入成功
  const first = await (db as any).select().from(table).where(eq(table.id, id))
  assert(first.length === 1)
  
  // 第二次：应该更新
  await (db as any).transaction(async (tx: any) => {
    const existing = await tx.select().from(table).where(eq(table.id, id))
    if (existing.length > 0) {
      await tx.update(table).set({updated: true}).where(eq(table.id, id))
    } else {
      await tx.insert(table).values({id, ...})
    }
  })
  
  // 验证更新成功
  const second = await (db as any).select().from(table).where(eq(table.id, id))
  assert(second[0].updated === true)
}
```

---

## 📚 导入必需的操作符

```typescript
// config.ts 第 2 行已更新为：
import { and, asc, count, desc, eq, gte, lte, isNull, inArray } from 'drizzle-orm'

// 完整的操作符列表（供参考）
import {
  // 逻辑操作
  and, or, not,
  // 比较操作
  eq, ne, gt, gte, lt, lte,
  // 集合操作
  inArray, notInArray,
  // 字符串操作
  like, ilike, notLike, notIlike,
  // NULL 检查
  isNull, isNotNull,
  // 范围操作
  between, notBetween,
  // 聚合函数
  count, sum, avg, min, max,
  // 排序
  asc, desc,
} from 'drizzle-orm'
```

---

## 🔗 关键资源

- **Drizzle 选择文档**: https://orm.drizzle.team/docs/select
- **Drizzle 过滤器**: https://orm.drizzle.team/docs/select#filters
- **Drizzle 事务**: https://orm.drizzle.team/docs/transactions
- **类型安全**: 使用 `as any` 临时解决 union 类型问题

---

## ✅ 转换验证清单

在部署到生产环境前，确保：

- [ ] 所有 `prisma.` 调用已替换为 Drizzle
- [ ] 所有 `await` 表达式都正确使用
- [ ] 所有 `where()` 条件都使用了正确的操作符
- [ ] 所有事务操作都在 `.transaction()` 内
- [ ] 所有新插入的记录都有完整的字段值
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 性能测试通过（至少 100 条记录）

---

**最后更新**: 2024 年 12 月
**文件版本**: 259 行，100% Drizzle ORM
