# API — 接口契约

> 前缀统一 `/api`。前台接口免登录但带限流；`/api/admin/*` 需登录，配置类接口需超管。
> 时间字段一律 ISO 8601 带时区偏移，前端按 Asia/Shanghai 展示。

## 数据模型

```prisma
model SongRequest {
  id            String   @id @default(cuid())
  queryCode     String   @unique           // 6 位查询码
  source        Source                     // NETEASE | QQ | KUGOU
  platformId    String                     // 平台歌曲 ID
  title         String
  artist        String
  album         String?
  durationMs    Int
  coverUrl      String?
  grade         Grade?                     // G1 | G2 | G3，关闭身份填写时为空
  classNo       Int?
  requesterName String?
  status        Status                     // PENDING | SCHEDULED | PLAYED | REJECTED
  rejectReason  String?
  flaggedWords  String[]                   // 敏感词命中
  isManual      Boolean  @default(false)   // 管理员补录
  submitIp      String
  createdAt     DateTime @default(now())
  schedule      Schedule?
}
```

```prisma
model Schedule {
  id        String        @id @default(cuid())
  requestId String        @unique
  request   SongRequest   @relation(fields: [requestId], references: [id])
  playDate  DateTime      @db.Date
  slotId    String
  slot      BroadcastSlot @relation(fields: [slotId], references: [id])
  orderNo   Int

  @@unique([playDate, slotId, orderNo])
}

model BroadcastSlot {
  id        String  @id @default(cuid())
  name      String            // 午间档
  startTime String            // "12:00"
  endTime   String            // "12:30"
  maxCount  Int?              // 首数上限
  maxMs     Int?              // 总时长上限
  enabled   Boolean @default(true)
}

model CalendarDay {
  date DateTime @id @db.Date
  kind DayKind            // SCHOOL | OFF | EXAM_NO_BROADCAST
  note String?
}
```

其余模型：`AdminUser`（username, passwordHash, role, mustChangePassword, disabled）、`AuditLog`（actorId, action, targetId, detail, createdAt）、`GradeConfig`（grade, classCount）、`BannedWord`、`SourceCredential`（source, encryptedCookie, updatedAt, lastCheckOk）、`SiteSetting`（key, value，存点歌开关与公告）。

## 前台接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/search?q=&source=&page=` | 单音源搜索。前端对三个 tab 各发一次，互不阻塞 |
| GET | `/api/song/:source/:platformId` | 歌曲详情（时长、封面、可用音质） |
| GET | `/api/stream/:source/:platformId` | 试听代理，支持 Range，返回 `audio/*` |
| GET | `/api/lyric/:source/:platformId` | 歌词 |
| POST | `/api/requests` | 提交点歌，body：source, platformId, grade?, classNo?, requesterName? |
| GET | `/api/requests/:queryCode` | 凭查询码查状态，不返回提交人信息 |
| GET | `/api/playlist/recent` | 最近歌单：昨天 + 今天 + 未来已排期 |
| GET | `/api/playlist/months` | 有歌单的月份列表 |
| GET | `/api/playlist/date/:date` | 指定日期歌单 |
| GET | `/api/site` | 站点状态：点歌开关、身份填写开关、公告、时段配置、年级班数 |

`POST /api/requests` 成功返回 `{ queryCode }`。触发限流返回 429 并带 `reason`，说明是 IP 维度还是姓名维度。身份三项在「要求填写身份」开启时必填、关闭时必须缺省；不匹配返回 400。

## 管理接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/admin/login` | — | 成功后下发 httpOnly cookie |
| POST | `/api/admin/logout` | 登录 | |
| POST | `/api/admin/password` | 登录 | 修改自己的密码 |
| GET | `/api/admin/requests?status=&date=` | 审核员 | 点歌列表，含提交人与敏感词标记 |
| POST | `/api/admin/requests/:id/schedule` | 审核员 | 通过并排期，body：playDate, slotId, orderNo |
| POST | `/api/admin/requests/:id/reject` | 审核员 | body：reason |
| POST | `/api/admin/requests/batch` | 审核员 | 批量通过、批量排到某天 |
| POST | `/api/admin/schedule/reorder` | 审核员 | 同时段重排，body：playDate, slotId, orderedIds |
| POST | `/api/admin/requests/manual` | 审核员 | 补录歌曲 |
| GET | `/api/admin/download/song/:id` | 审核员 | 单曲下载 |
| GET | `/api/admin/download/day/:date?slotId=` | 审核员 | 流式 zip |
| GET | `/api/admin/export/day/:date` | 审核员 | 播出单 Excel |
| GET / PUT | `/api/admin/config/slots` | 超管 | 播出时段 |
| GET / PUT | `/api/admin/config/calendar` | 超管 | 行政历 |
| GET / PUT | `/api/admin/config/grades` | 超管 | 年级班数 |
| GET / PUT | `/api/admin/config/words` | 超管 | 敏感词 |
| GET / PUT | `/api/admin/config/site` | 超管 | 点歌开关、身份填写开关、公告 |
| POST | `/api/admin/sources/netease/qrcode` | 超管 | 生成扫码登录二维码 |
| GET | `/api/admin/sources/netease/qrcode/check` | 超管 | 轮询扫码状态，成功即写入 Cookie |
| GET | `/api/admin/sources/health` | 超管 | 三家音源可用性自检 |
| GET / POST / PATCH | `/api/admin/users` | 超管 | 账号管理 |
| GET | `/api/admin/audit?page=` | 超管 | 操作日志 |

错误响应统一 `{ error: { code, message } }`。403 表示权限不足，429 表示触发限流。

