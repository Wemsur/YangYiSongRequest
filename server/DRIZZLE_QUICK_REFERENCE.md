# 🚀 Drizzle ORM 快速参考指南

## 📌 auth.ts 转换快速对照表

### 转换一览

| 操作 | Prisma | Drizzle |
|------|--------|---------|
| **导入** | `import { prisma } from './db'` | `import { db } from './db'; import { adminUser } from '../drizzle/schema-sqlite'` |
| **查询** | `prisma.table.findUnique({where:{}})` | `db.select().from(table).where(eq(...))` |
| **更新** | `prisma.table.update({where:{},data:{}})` | `db.update(table).set({}).where(eq(...))` |
| **条件** | 对象字面量 `{username: value}` | `eq(table.field, value)` |
| **返回** | 单个对象或 null | 数组，取 `[0]` |

---

## 🔍 代码片段

### 查询模板

```typescript
// ✅ 按字段查找
const users = await withDb(db)
  .select()
  .from(adminUser)
  .where(eq(adminUser.username, 'john'));
const user = users[0];  // AdminUser | undefined

// ✅ 按多个条件查询（AND）
const users = await withDb(db)
  .select()
  .from(adminUser)
  .where(
    and(
      eq(adminUser.role, 'SUPER'),
      eq(adminUser.disabled, false)
    )
  );

// ✅ 按多个条件查询（OR）
const users = await withDb(db)
  .select()
  .from(adminUser)
  .where(
    or(
      eq(adminUser.id, '1'),
      eq(adminUser.id, '2')
    )
  );
```

### 更新模板

```typescript
// ✅ 更新单个字段
await withDb(db)
  .update(adminUser)
  .set({ lastLoginAt: new Date() })
  .where(eq(adminUser.id, userId));

// ✅ 更新多个字段
await withDb(db)
  .update(adminUser)
  .set({ 
    lastLoginAt: new Date(),
    role: 'REVIEWER'
  })
  .where(eq(adminUser.id, userId));
```

### 插入模板

```typescript
// ✅ 插入单条记录
await withDb(db)
  .insert(adminUser)
  .values({
    id: 'id123',
    username: 'john',
    passwordHash: 'hash...',
    role: 'REVIEWER',
    mustChangePassword: true,
    disabled: false,
    createdAt: new Date()
  });

// ✅ 插入多条记录
await withDb(db)
  .insert(adminUser)
  .values([
    { id: '1', username: 'user1', ... },
    { id: '2', username: 'user2', ... }
  ]);
```

---

## 📚 常用操作速查

### SELECT 查询

```typescript
// 基础查询
db.select().from(table)

// 带条件
db.select().from(table).where(eq(table.field, value))

// 多条件 AND
db.select().from(table).where(and(eq(...), eq(...)))

// 多条件 OR  
db.select().from(table).where(or(eq(...), eq(...)))

// 排序
db.select().from(table).orderBy(table.createdAt)

// 降序
db.select().from(table).orderBy(desc(table.createdAt))

// 限制数量
db.select().from(table).limit(10)

// 分页
db.select().from(table).limit(10).offset(20)
```

### UPDATE 更新

```typescript
// 基础更新
db.update(table).set({field: value}).where(eq(...))

// 多字段
db.update(table).set({
  field1: value1,
  field2: value2
}).where(eq(...))

// 自增
db.update(table).set({
  count: sql`count + 1`
}).where(eq(...))
```

### INSERT 插入

```typescript
// 单条
db.insert(table).values({...})

// 多条
db.insert(table).values([{...}, {...}])

// 返回插入的 ID
db.insert(table).values({...}).returning()
```

### DELETE 删除

```typescript
// 基础删除
db.delete(table).where(eq(table.id, id))

// 删除所有（需谨慎）
db.delete(table)
```

---

## 🛡️ 类型安全

### withDb 辅助函数

```typescript
// 用途: 处理 SQLite/PostgreSQL 的联合类型
const withDb = (db: any) => db;

// 使用
const users = await withDb(db).select().from(table)...
```

### 类型推断

```typescript
// Drizzle 自动推断字段类型
const adminUser = table('AdminUser', {
  id: text('id').primaryKey(),
  username: text('username'),
  // ...
});

// 使用时获得类型提示
const user = users[0];  // 类型: typeof adminUser.$inferSelect | undefined
```

---

## 📊 schema 字段参考 (adminUser)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `text` | 主键 |
| `username` | `text` | 用户名（唯一） |
| `passwordHash` | `text` | 密码哈希 |
| `role` | `text` | 角色：SUPER \| REVIEWER |
| `mustChangePassword` | `boolean` | 必须改密 |
| `disabled` | `boolean` | 是否禁用 |
| `lastLoginAt` | `timestamp` | 最后登录时间 |
| `createdAt` | `timestamp` | 创建时间 |

---

## ⚠️ 常见错误

### ❌ 错误 1: 忘记 withDb
```typescript
// ❌ 类型错误
const users = await db.select().from(table)...

// ✅ 正确
const users = await withDb(db).select().from(table)...
```

### ❌ 错误 2: 忘记取数组
```typescript
// ❌ 返回数组却当对象用
const user = await db.select().from(table).where(...)
console.log(user.id)  // ❌ 错误！user 是数组

// ✅ 正确
const users = await db.select().from(table).where(...)
const user = users[0]
console.log(user?.id)  // ✅ 正确
```

### ❌ 错误 3: 条件写法
```typescript
// ❌ Prisma 的写法
.where({username: value})

// ✅ Drizzle 的写法
.where(eq(table.username, value))
```

### ❌ 错误 4: 更新数据
```typescript
// ❌ 使用 data
.update(table).data({field: value})

// ✅ 使用 set
.update(table).set({field: value})
```

---

## 🔗 导入参考

### 条件操作符

```typescript
import { eq, ne, gt, lt, gte, lte, like, between, inArray } from 'drizzle-orm';

// 使用
eq(table.field, value)      // 相等
ne(table.field, value)      // 不相等
gt(table.field, value)      // 大于
lt(table.field, value)      // 小于
gte(table.field, value)     // 大于等于
lte(table.field, value)     // 小于等于
like(table.field, pattern)  // 模糊匹配
between(table.field, min, max)  // 范围
inArray(table.field, [1, 2, 3])  // 在数组中
```

### 逻辑操作符

```typescript
import { and, or, not } from 'drizzle-orm';

// 使用
and(condition1, condition2)   // 且
or(condition1, condition2)    // 或
not(condition)                // 非
```

### 排序函数

```typescript
import { asc, desc } from 'drizzle-orm';

// 使用
orderBy(asc(table.field))    // 升序
orderBy(desc(table.field))   // 降序
```

---

## 📖 完整示例

### 登录函数（auth.ts）

```typescript
export async function checkPassword(username: string, password: string): Promise<SessionUser> {
  // 1. 查询用户
  const users = await withDb(db)
    .select()
    .from(adminUser)
    .where(eq(adminUser.username, username.trim()));
  const user = users[0];

  // 2. 验证密码
  const hash = user?.passwordHash ?? '...';
  const ok = await verify(hash, password).catch(() => false);
  
  // 3. 检查有效性
  if (!user || !ok || user.disabled) {
    throw new AppError('BAD_CREDENTIALS', 401, '账号或密码不对');
  }

  // 4. 更新登录时间
  await withDb(db)
    .update(adminUser)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUser.id, user.id));

  // 5. 返回会话
  return {
    id: user.id,
    username: user.username,
    role: isAdminRole(user.role) ? user.role : 'REVIEWER',
    mustChangePassword: user.mustChangePassword,
  };
}
```

---

## 🧪 测试示例

```typescript
// 测试: 查找不存在的用户
const users = await withDb(db)
  .select()
  .from(adminUser)
  .where(eq(adminUser.username, 'nonexistent'));
console.log(users.length);  // 0
console.log(users[0]);      // undefined ✅

// 测试: 查找存在的用户
const users = await withDb(db)
  .select()
  .from(adminUser)
  .where(eq(adminUser.username, 'admin'));
console.log(users.length);  // 1
console.log(users[0].id);   // 用户 ID ✅

// 测试: 更新用户
await withDb(db)
  .update(adminUser)
  .set({ lastLoginAt: new Date() })
  .where(eq(adminUser.id, 'user123'));
// ✅ 成功更新

// 验证更新
const updated = await withDb(db)
  .select()
  .from(adminUser)
  .where(eq(adminUser.id, 'user123'));
console.log(updated[0].lastLoginAt);  // 新的时间戳 ✅
```

---

## 💡 提示和技巧

### 1️⃣ 使用类型推断

```typescript
// Drizzle 自动推断类型，无需额外的 as 转换
const user = users[0];  // TypeScript 知道所有字段类型
```

### 2️⃣ 链式 API

```typescript
// 清晰的链式调用
db.update(table)
  .set({ field: value })
  .where(eq(table.id, id))
  // 自动格式化，易于阅读
```

### 3️⃣ 可选链

```typescript
// 安全处理可能的 undefined
const user = users[0];
user?.id        // ✅ 安全
user?.username  // ✅ 安全
```

### 4️⃣ null coalescing

```typescript
// 提供默认值
const user = users[0] ?? defaultUser;
const role = user?.role ?? 'REVIEWER';
```

---

## 🔄 迁移检查清单

转换时检查以下项目：

- [ ] 导入 Drizzle 工具 (`eq`, `and`, `or` 等)
- [ ] 导入 schema 表定义
- [ ] 删除 Prisma 导入
- [ ] 使用 `withDb()` 包装数据库调用
- [ ] SELECT 查询取 `[0]` 获取单条
- [ ] UPDATE 使用 `.set()` 代替 `.data()`
- [ ] 条件使用 `eq()` 等操作符
- [ ] 处理数组返回值的 undefined
- [ ] 添加转换注释 `// CONVERSION #X`
- [ ] 测试业务逻辑完全相同

---

## 📞 获取帮助

### 相关文件

- 📄 `/src/lib/auth.ts` - 转换完成的文件
- 📋 `/DRIZZLE_CONVERSION_REPORT.md` - 详细转换报告
- 📝 `/CONVERSION_CODE_COMPARISON.md` - 代码对比
- 📖 `/DRIZZLE_CONVERSION_COMPLETE.md` - 完整转换指南

### 参考资源

- [Drizzle ORM 官方文档](https://orm.drizzle.team/)
- [SQLite 驱动](https://orm.drizzle.team/docs/get-started-sqlite)
- [PostgreSQL 驱动](https://orm.drizzle.team/docs/get-started-postgresql)

---

**✅ 快速参考指南完成！**

使用此指南加速 Drizzle ORM 的学习和应用。

