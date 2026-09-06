# API — 接口契约

> 前缀统一 `/api`。前台接口免登录但带限流；`/api/admin/*` 需登录，配置类接口需超管。
> 时间字段一律 ISO 8601 带时区偏移，前端按 Asia/Shanghai 展示。

## 数据模型

结构以 SQLite 的 [schema.prisma](../server/prisma/schema.prisma) 和 PostgreSQL 的 [schema.postgresql.prisma](../server/prisma/schema.postgresql.prisma) 为准，本节只记录约束与意图。

| 模型               | 作用     | 关键约束                                                                                                                                             |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SongRequest`      | 一条点歌 | `queryCode` 唯一（6 位）；`grade` / `classNo` / `requesterName` 可空，对应关闭身份填写；`flaggedWords` 是 JSON 数组字符串；`isManual` 标记管理员补录 |
| `Schedule`         | 排期     | `(playDate, slotId, orderNo)` 唯一；`playDate` 是 `YYYY-MM-DD` 字符串；`requestId` 唯一，一条点歌最多一个排期；删点歌级联删排期                      |
| `BroadcastSlot`    | 播出时段 | `name` 唯一；`startTime` / `endTime` 是 `HH:mm` 字符串，按 Asia/Shanghai 解读；`maxCount` / `maxMs` 空表示不限；被排期引用时禁止删除                 |
| `CalendarDay`      | 行政历   | 主键就是 `YYYY-MM-DD` 字符串；`kind` 为 `SCHOOL` / `OFF` / `EXAM_NO_BROADCAST`，只有 `SCHOOL` 可排期                                                 |
| `AdminUser`        | 管理员   | `username` 唯一；`role` 为 `SUPER` / `REVIEWER`；`mustChangePassword` 用于强制首次改密                                                               |
| `AuditLog`         | 操作日志 | `actorId` 可空（账号删除后仍保留记录）；记录请求 IP 与 User-Agent；`detail` 是 JSON 字符串                                                           |
| `GradeConfig`      | 年级班数 | 主键即年级，默认 23                                                                                                                                  |
| `BannedWord`       | 敏感词   | 主键即词本身                                                                                                                                         |
| `SourceCredential` | 音源凭据 | 主键即音源；`encryptedData` 为 AES-256-GCM 密文，iv 与 authTag 一并编码在内                                                                          |
| `SiteSetting`      | 站点开关 | 键值表，见下                                                                                                                                         |

`SiteSetting` 已用的键：

| 键                | 类型 | 默认   | 含义                           |
| ----------------- | ---- | ------ | ------------------------------ |
| `requestsOpen`    | 布尔 | `true` | 点歌通道是否开放               |
| `requireIdentity` | 布尔 | `true` | 是否要求填写年级 / 班级 / 姓名 |
| `announcement`    | 文本 | 空     | 首页公告                       |
| `maxScheduleDays` | 整数 | `14`   | 最远可排多少天                 |

为保持 SQLite 与 PostgreSQL 行为一致，上面所有「取值型」字段（`source`、`grade`、`status`、`kind`、`role`）都是字符串，合法取值与中文标签的唯一来源是 `server/src/lib/domain.ts`；`flaggedWords`、`detail` 是 JSON 字符串，用同一个文件里的 encode/decode 函数处理。

Prisma 7 的两处约定：`datasource` 块里不写 `url`，连接信息来自 `server/prisma.config.ts` 和 driver adapter；生成的 client 落在 `server/src/generated/prisma`。`DATABASE_PROVIDER` 决定使用对应 schema、adapter 与迁移目录。

## 前台接口

已实现（S4 + S5）。歌单只露出 `SCHEDULED` 与 `PLAYED` 的歌，且返回体里没有任何点歌人字段。

| 方法 | 路径                              | 说明                                                                        |
| ---- | --------------------------------- | --------------------------------------------------------------------------- |
| GET  | `/api/site`                       | 站点状态：点歌开关、身份填写开关、公告、时段列表、各年级班数                |
| GET  | `/api/search?source=&q=&page=`    | 单音源搜索。每页固定 20 条，page 上限 20。前端对三个 tab 各发一次，互不阻塞 |
| GET  | `/api/song/:source/:platformId`   | 歌曲详情，字段同搜索结果的单条                                              |
| GET  | `/api/stream/:source/:platformId` | 试听代理，转发 Range 与防盗链请求头，返回 200 或 206                        |
| GET  | `/api/lyric/:source/:platformId`  | 返回 `{ lyric: string \| null }`                                            |
| POST | `/api/requests`                   | 提交点歌，body：source, platformId, grade?, classNo?, requesterName?        |
| GET  | `/api/requests/:code`             | 凭查询码查状态，不返回任何提交人信息                                        |
| GET  | `/api/playlist/recent`            | 最近歌单：昨天 + 今天 + 未来所有已排期日期                                  |
| GET  | `/api/playlist/months`            | 过往（前天及更早）有歌的日期，按月分组倒序                                  |
| GET  | `/api/playlist/date/:date`        | 指定日期歌单                                                                |

`POST /api/requests` 成功返回 201 与 `{ queryCode }`。身份三项在「要求填写身份」开启时必填、关闭时必须缺省，不匹配返回 400。歌曲信息一律以音源返回的为准，不采信前端传的时长与标题。

限流：全局 240 次/分钟；`/api/stream` 120 次/分钟；`POST /api/requests` 20 次/10 分钟，之上还有按天的库内计数（同 IP 10 次、同一身份 2 首）。触发返回 429，`code` 为 `RATE_LIMIT_IP` 或 `RATE_LIMIT_IDENTITY`。

## 管理接口

S6 已实现的部分标了「已」，其余是 S7 / S8 的坑位。

| 方法         | 路径                                           | 权限   | 说明                                                                                   |
| ------------ | ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| POST         | `/api/admin/login`                             | —      | 已。成功后下发 httpOnly cookie，限流 10 次/10 分钟                                     |
| POST         | `/api/admin/logout`                            | 登录   | 已                                                                                     |
| GET          | `/api/admin/me`                                | —      | 已。未登录返回 `null`，前端据此决定跳不跳登录页                                        |
| POST         | `/api/admin/password`                          | 登录   | 已。body：current, next（至少 8 位）                                                   |
| GET          | `/api/admin/requests?status=&date=&page=`      | 审核员 | 已。含提交人、敏感词命中、排期信息                                                     |
| GET          | `/api/admin/schedule/:date`                    | 审核员 | 已。某天各时段的排期总览，带容量与总时长                                               |
| POST         | `/api/admin/requests/:id/schedule`             | 审核员 | 已。body：playDate, slotId；一律追加到该时段末尾                                       |
| POST         | `/api/admin/requests/:id/reject`               | 审核员 | 已。body：reason（必填）                                                               |
| POST         | `/api/admin/requests/:id/unschedule`           | 审核员 | 已。撤下排期，回到待审核                                                               |
| POST         | `/api/admin/requests/batch`                    | 审核员 | 已。body：ids, action(schedule\|reject), playDate?, slotId?, reason?；逐条回报失败原因 |
| POST         | `/api/admin/schedule/reorder`                  | 审核员 | 已。body：playDate, slotId, orderedIds（必须是该时段的全部歌）                         |
| POST         | `/api/admin/requests/manual`                   | 审核员 | 已。补录歌曲，给了 playDate + slotId 就直接排上                                        |
| GET          | `/api/admin/audit?page=`                       | 超管   | 已。操作日志                                                                           |
| GET          | `/api/admin/download/song/:id`                 | 审核员 | 单曲下载，实时取流并写入 ID3 与封面                                                    |
| GET          | `/api/admin/download/day/:date?slotId=`        | 审核员 | 流式 zip。不给 slotId 就是整天，按时段分子目录                                         |
| GET          | `/api/admin/export/day/:date`                  | 审核员 | 播出单 CSV，带 BOM，Excel 能直接打开                                                   |
| GET / PUT    | `/api/admin/config/slots`                      | 超管   | 已。PUT 整表提交，被排期引用的时段不许删                                               |
| GET / PUT    | `/api/admin/config/calendar`                   | 超管   | 已。GET 带 ?month=YYYY-MM；PUT 的 kind 传 null 表示清掉标记                            |
| GET / PUT    | `/api/admin/config/grades`                     | 超管   | 已。body：counts                                                                       |
| GET / PUT    | `/api/admin/config/words`                      | 超管   | 已。PUT 整表替换                                                                       |
| GET / PUT    | `/api/admin/config/site`                       | 超管   | 已。点歌开关、身份填写开关、公告、最远可排天数                                         |
| POST         | `/api/admin/sources/netease/qrcode`            | 超管   | 已。返回 key 与 data:image/png 的二维码                                                |
| GET          | `/api/admin/sources/netease/qrcode/check?key=` | 超管   | 已。状态 waiting/scanned/expired/ok，ok 时写入 Cookie                                  |
| GET          | `/api/admin/sources`                           | 超管   | 已。三家的 Cookie 配置情况与上次体检结果                                               |
| GET          | `/api/admin/sources/health`                    | 超管   | 已。三家并行体检，顺手记录结果                                                         |
| PUT / DELETE | `/api/admin/sources/:source/cookie`            | 超管   | 已。手工粘贴或清除 Cookie                                                              |
| GET / POST   | `/api/admin/users`                             | 超管   | 已。建账号：username 3–20、password ≥8、role                                           |
| PATCH        | `/api/admin/users/:id`                         | 超管   | 已。disabled / role / password；不能停用或降级自己                                     |

错误响应统一 `{ error: { code, message, detail? } }`。`detail` 仅承载可安全返回的结构化上下文，例如字段名、限额和重试时间；401 未登录，403 权限不足，429 触发限流。限流阈值集中定义在 `server/src/lib/rate-limits.ts`。

排期的校验顺序：日期格式 → 不能排到过去 → 不超过 `maxScheduleDays` → 行政历标记（`SCHOOL` 才行，没标记的工作日按可播）→ 周末拦截 → 时段存在且启用。容量超了只在响应里带 `capacity.message` 提示，不拒绝请求。

下载类接口的三点约定：文件名走 `Content-Disposition` 的 `filename*=UTF-8''`，纯 `filename` 里的中文会被浏览器存成乱码；zip 用 store 不压缩，音频本身已是压缩格式，再压没收益只费时间；单曲取不到地址时整包不失败，改为在压缩包里放一份「缺失清单.txt」，附上失败原因。
