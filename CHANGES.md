# 数据库迁移修复 - 文件变更清单

## 新创建的文件

### 1. server/scripts/migrate-db.mjs

**目的**: NixOS 兼容的数据库迁移脚本  
**大小**: ~2.5 KB  
**功能**:

- 绕过 Prisma CLI 的 NixOS 兼容性问题
- 使用 better-sqlite3 直接应用 SQL 迁移
- 自动跟踪已应用的迁移
- 支持幂等性（重复运行安全）
- 提供详细的执行信息

**使用**:

```bash
npm run --workspace server migrate:db
# 或
node server/scripts/migrate-db.mjs
```

### 2. server/MIGRATION_FIX.md

**目的**: Prisma/NixOS 迁移问题的完整文档  
**包含**:

- 问题详细描述和根本原因分析
- NixOS 特定信息和解决方案
- 集成指南
- 参考资源

### 3. FIX_SUMMARY.md (根目录)

**目的**: 修复的简明总结  
**包含**:

- 问题和原因简述
- 应用的修复列表
- 验证步骤
- 后续建议

## 修改的文件

### server/package.json

**修改内容**:

```diff
  "scripts": {
    ...
+   "migrate:db": "node scripts/migrate-db.mjs",
    ...
  }
```

## 数据库状态

### 已创建的表 (共 10 个)

- ✓ AdminUser
- ✓ AuditLog
- ✓ BannedWord
- ✓ BroadcastSlot
- ✓ CalendarDay
- ✓ GradeConfig
- ✓ Schedule ← **关键修复**
- ✓ SiteSetting
- ✓ SongRequest
- ✓ SourceCredential

### 已应用的迁移

1. `20260904150150_init` - 初始表创建
2. `20260905000000_audit_request_context` - 审计日志增强

## 测试验证

✅ 所有表已成功创建  
✅ 可以查询 Schedule 表  
✅ 迁移脚本幂等性通过  
✅ 数据库完全可操作

## 使用建议

### 开发环境

```bash
# 先确保数据库已迁移
npm run --workspace server migrate:db

# 然后启动开发服务器
npm run dev
```

### 生产环境

```bash
# 构建项目
npm run build

# 迁移数据库（如果是新建）
npm run --workspace server migrate:db

# 启动服务
npm run start
```

### Docker/CI-CD 集成

```dockerfile
# 在 Dockerfile 中
RUN cd /app/server && npm run migrate:db
```

## NixOS 特定说明

在 NixOS 上部署时，**总是使用** `npm run migrate:db`，因为 Prisma CLI 的引擎二进制文件在 NixOS 上不兼容。

标准的 `prisma migrate deploy` 会因为：

- NixOS 预编译引擎不可用
- 二进制文件签名验证失败

而失败。使用我们的 Node.js 脚本完全避免了这些问题。

## 迁移路径

```text
原始状态: database/app.db 为空 (无表)
    ↓
Prisma CLI 尝试失败 (NixOS 兼容性问题)
    ↓
manual SQL 执行: 20260904150150_init
    ↓
manual SQL 执行: 20260905000000_audit_request_context
    ↓
最终状态: 10个表已创建，数据库可用 ✓
```

## 后续维护

当需要创建新的迁移时：

1. **使用 Prisma** (在兼容系统上)

   ```bash
   npm --workspace server run migrate
   ```

2. **在 NixOS 上** - 按照 `server/MIGRATION_FIX.md` 的说明手动应用或使用脚本

3. **验证**

   ```bash
   npm run --workspace server migrate:db
   ```

---

**修复日期**: 2025年2月  
**状态**: ✅ 完成并验证  
**兼容性**: SQLite 3.x, Node.js 20+, NixOS
