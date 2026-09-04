# API — 接口契约

> 前缀统一 `/api`。前台接口免登录但带限流；`/api/admin/*` 需登录，配置类接口需超管。
> 时间字段一律 ISO 8601 带时区偏移，前端按 Asia/Shanghai 展示。

## 数据模型

结构以 [server/prisma/schema.prisma](server/prisma/schema.prisma) 为唯一准绳，本节只记录约束与意图，改 schema 时同步这里。

| 模型 | 作用 | 关键约束 |
| --- | --- | --- |
| `SongRequest` | 一条点歌 | `queryCode` 唯一（6 位）；`grade` / `classNo` / `requesterName` 可空，对应关闭身份填写；`flaggedWords` 存敏感词命中；`isManual` 标记管理员补录 |
| `Schedule` | 排期 | `(playDate, slotId, orderNo)` 唯一；`requestId` 唯一，一条点歌最多一个排期；删点歌级联删排期 |
| `BroadcastSlot` | 播出时段 | `name` 唯一；`startTime` / `endTime` 是 `HH:mm` 字符串，按 Asia/Shanghai 解读；`maxCount` / `maxMs` 空表示不限；被排期引用时禁止删除 |
| `CalendarDay` | 行政历 | 主键即日期；`kind` 为 `SCHOOL` / `OFF` / `EXAM_NO_BROADCAST`，只有 `SCHOOL` 可排期 |
| `AdminUser` | 管理员 | `username` 唯一；`role` 为 `SUPER` / `REVIEWER`；`mustChangePassword` 用于强制首次改密 |
| `AuditLog` | 操作日志 | `actorId` 可空（账号删除后仍保留记录）；`detail` 为 JSON |
| `GradeConfig` | 年级班数 | 主键即年级，默认 23 |
| `BannedWord` | 敏感词 | 主键即词本身 |
| `SourceCredential` | 音源凭据 | 主键即音源；`encryptedData` 为 AES-256-GCM 密文，iv 与 authTag 一并编码在内 |
| `SiteSetting` | 站点开关 | 键值表，见下 |

`SiteSetting` 已用的键：

| 键 | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `requestsOpen` | 布尔 | `true` | 点歌通道是否开放 |
| `requireIdentity` | 布尔 | `true` | 是否要求填写年级 / 班级 / 姓名 |
| `announcement` | 文本 | 空 | 首页公告 |
| `maxScheduleDays` | 整数 | `14` | 最远可排多少天 |

Prisma 7 的两处约定：`datasource` 块里不再写 `url`，迁移用的连接串来自 `server/prisma.config.ts`，运行时的来自 driver adapter（`server/src/lib/db.ts`）；生成的 client 落在 `server/src/generated/prisma`，不进版本库。

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

