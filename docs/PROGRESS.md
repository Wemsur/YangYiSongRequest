# PROGRESS — 开发进度

> 每完成一步就更新这里。新会话靠它判断做到哪了。

当前阶段：**S8 完成，下载与打包已实测跑通，只剩 S9 部署**

## 阶段计划

| # | 阶段 | 状态 |
| --- | --- | --- |
| S0 | 需求确认 + 五份文档 | ✅ 完成 2026-08-31 |
| S1 | 项目骨架：monorepo、TS 配置、Fastify 起服务、Vite 起前端、Tailwind token 落地 | ✅ 完成 2026-08-31 |
| S2 | 数据模型：Prisma schema + 首次迁移 + 种子数据（超管、时段、班数） | ✅ 完成 2026-09-04 |
| S3 | 音源适配层：三家 search/detail/streamUrl/downloadUrl/lyric + Vitest + 可用性自检 | ✅ 完成 2026-09-04 |
| S4 | 前台：搜索 tab、试听代理、点歌弹窗与提交、查询码查询 | ✅ 完成 2026-09-05 |
| S5 | 前台：最近歌单与过往歌单 | ✅ 完成 2026-09-05 |
| S6 | 后台：登录鉴权、分权、审核排期、拖拽调序、AuditLog | ✅ 完成 2026-09-05 |
| S7 | 后台：配置页（时段、行政历、班数、敏感词、音源扫码登录、账号） | ✅ 完成 2026-09-05 |
| S8 | 下载：单曲代理 + 按天流式 zip + ID3 + 歌词 | ✅ 完成 2026-09-05 |
| S9 | 部署：自有服务器 + systemd + 反向代理，验收清单跑一遍 | ⬜ |

## 待办与悬而未决

- [ ] 服务器信息：系统、部署路径、域名待定，DEPLOY.md 里现在是占位值
- [ ] 网易云会员 Cookie：待 S7 完成后由管理员在后台扫码登录写入，不经聊天传递
- [ ] 酷狗设备标识：`server/.env` 里那四项现在是每次启动临时生成，上生产前固定下来
- [ ] 台标 / 校徽：暂无，先用文字标识「杨一之声」，拿到素材再替换
- [ ] 法定假日数据：S7 先做手工标记，后续可考虑接节假日数据源

## 变更记录

- 2026-09-05 S8 下载与打包完成，实测都跑通了。
  - 单曲下载：实时取流、写入 ID3 与封面再回给浏览器，服务器不落盘。实测下来的文件头三字节是 `ID3`，标签写进去了。
  - 按天打包：`ZipArchive` 流式输出，整天按时段分子目录（`午间档/01_起风了 - 冯沁苑.mp3`），每首附一份同名 `.lrc`，另附「播出单.txt」。实测三首歌 33.8MB，7 个条目齐全。
  - 付费歌拿不到地址时整包不失败，改为在包里放「缺失清单.txt」附失败原因。实测补录一首付费酷狗歌只打包该时段，包里就是「播出单.txt + 缺失清单.txt」两个文件。
  - 播出单导出选了带 BOM 的 CSV 而不是 xlsx：Excel 双击直接打开，省掉一个 1MB 级依赖。实测首三字节 `efbbbf`，中文不乱码。
  - 中文文件名必须走 `Content-Disposition` 的 `filename*=UTF-8''`，只写 `filename` 会存成乱码；zip 用 store 不压缩，音频再压没收益。两条都写进 API.md。
  - archiver 8 起不再默认导出工厂函数，改成 `new ZipArchive(...)`。
  - 排期页加了整天打包、只打包某时段、单曲下载、导出播出单、复制播出单文本五个入口。新增 4 个单测（时长与文件名头），共 38 个。
  - 开发服务器默认端口改 5175（`vite.config.ts` 与 `.claude/launch.json`）。

- 2026-09-05 S7 后台配置页六块全部落地：站点开关、播出时段、年级班数、敏感词、行政历、音源账号、管理员账号。全部只对超管开放，整个插件挂一个 `requireSuper` 钩子（审核员实测 403）。
  - 音源 Cookie 用 AES-256-GCM 加密存库，密钥来自 `CREDENTIAL_KEY`（按需读取，没配也能启动，只是存不了 Cookie）。读的时候带 30 秒缓存；换过密钥导致解不开会给出「重新登录一次」的明确提示，不会让整个音源挂掉。
  - 网易云扫码登录接通：后台点一下出二维码（实测拿到真实 PNG），前端每 2 秒轮询一次，803 就把 Cookie 落库。QQ 与酷狗没有扫码接口，留手工粘贴 Cookie 的口子。
  - 行政历做成月历格子，点一下在「默认 → 上 → 休 → 考」之间转。没标记的日子按「工作日可播、周末不播」处理，只有例外才需要标。标了考试的日子实测拒绝排期（`DATE_NO_BROADCAST`）。
  - 播出时段整表提交，被排期引用的时段不许删，会告诉你还排着几首。
  - 账号管理：建审核员、改角色、停用、重置密码；不能停用或降级自己，避免把自己锁在门外（实测 `SELF_LOCKOUT`）。
  - 站点开关改完立刻生效：后端清 `SiteSetting` 缓存，前端顺手重新拉 `/api/site`。
  - 新增 4 个加解密单测（含换密钥、截断密文），共 34 个。

- 2026-09-05 S5 + S6：前台歌单与后台审核排期一起做完，前后台数据实时同步。
  - 前台：`PlaylistCard.vue` 一个组件同时服务首页与过往页；首页的今天卡片按后台时段铺满、有歌填进去，下面依次是昨天与未来已排期的日子；`/playlist` 按月列出前天及更早的有歌日期。歌单接口只露出 `SCHEDULED` 与 `PLAYED`，返回体里没有任何点歌人字段（curl 验过）。
  - 后台鉴权：argon2 校验 + JWT 存 httpOnly cookie（`@fastify/jwt`）。JWT 里只放 id，角色与停用状态每次回库核对；登录限流 10 次/10 分钟；账号不存在时也走一次 verify，避免用响应快慢猜用户名。`JWT_SECRET` 少于 32 字符直接启动失败。
  - 审核页：状态筛选、全选、单条与批量「排到某天某时段」、驳回（理由必填，学生凭查询码能看到）、撤下回待审核。批量里个别失败不影响其他，逐条回报原因。
  - 排期页：按天看各时段，↑ ↓ 或拖拽调序，改完立刻落库。排期只追加到末尾，重排走单独接口并在事务里先挪到负数区，避开 `(playDate, slotId, orderNo)` 唯一约束。
  - 「已播出」由 `services/playback.ts` 按时段结束时间自动判定，启动时跑一次、之后每 5 分钟一次，管理员不用手点。
  - 所有审核与排期操作写 AuditLog，超管可在 `/api/admin/audit` 看到。
  - 修了一个真实缺陷：判断某天是否周末时用 `T00:00:00+08:00` 解析会退到前一天，星期差一位，导致默认排期日落在周六。前后端统一改成按 UTC 解析日期字符串。
  - 决策变更：后台不引 Naive UI，理由写进 CONTEXT.md 第 2 节。新增 3 个单测（自动判定已播出），共 30 个。
  - 实测链路：登录 → 审核页通过并排期 → 排期页上移调序 → 前台首页与 `/api/playlist/date` 顺序同步；未登录访问管理接口返回 401；驳回不写理由被拒；排到周六被拒。

- 2026-09-05 S4 前台四件事接通：三音源 tab 并行搜索、后端试听代理（转发 Range，浏览器实测拿到 206）、油印点歌条弹窗与盖章出码、`/lookup` 凭码查状态。
  - 后端新增 `routes/public.ts` 七个接口、`services/{site,requests,banned-words}.ts`、`lib/{time,errors}.ts`；错误统一收敛成 `{ error: { code, message } }`，Fastify 自己抛的 4xx 照原状态码回，不再一律算 500。
  - 提交时歌曲信息以音源返回的为准，不采信前端传的字段；限流按东八区当天计数（同 IP 10 次、同一身份 2 首），身份填写关闭时后者自动失效。
  - 查询码取 6 位，字母表去掉了 0 O 1 I L；碰撞就换一个重试。查询结果刻意不含任何点歌人信息。
  - 前端新增 `stores/{site,player}.ts`、`components/{SongRow,RequestSlip}.vue`、`pages/LookupPage.vue`；全站共用一个 audio 元素保证同时只放一首。
  - 时区约定修正：东八区偏移恒定，没引 date-fns-tz，服务端走 `lib/time.ts`，已改写进 CONTEXT.md 第 6 节。
  - 新增 27 个单测（含时区换算与压平字段编解码）。浏览器里实测走通了搜索 → 试听 → 点歌 → 盖章出码 → 凭码查询整条链。

- 2026-09-05 酷狗取址改走上游 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)：作为 git 依赖装进 server，用 `npm run kugou-api --workspace server` 起在 3300，`npm run dev` 会一起拉起来。取址失败自动回落自写直连并静默一分钟。理由是它带请求签名和 `/login/qr/*`，台里将来开会员就能直接出高音质。
  - 上游的 `/search` 对匿名请求一律 `error_code 152`（模块直调和起独立服务都试过），所以搜索仍用自写实现，混搭的原因写进了 CONTEXT.md 第 3 节。
  - QQ 没换上游：Rain120/qq-music-api 没有扫码登录、Cookie 要写进它自己的配置文件、不在 npm 上且启动依赖 ts-node，换过去只多一个进程不多一份能力。
  - 新增 `README.md` 写清本地怎么跑；`smoke:sources` 实测基线也记在那里。

- 2026-09-04 部署方案换成台里自有服务器，数据库从 Neon Postgres 换成 SQLite（`@prisma/adapter-better-sqlite3`）。理由：自托管有持久磁盘，当初选 Postgres 就是为了绕开 Render 免费档磁盘不持久，这个约束消失了；一天几十到几百条写入用单文件足够，备份就是拷一个文件，不用 Docker 也不用数据库服务器。
  - 代价与处理：Prisma 的 SQLite 连接器不支持原生 enum、数组和 Json，于是 5 组取值改存字符串并把唯一来源收进 `server/src/lib/domain.ts`（联合类型 + `is*` 校验 + 标签），`flaggedWords` 与 `AuditLog.detail` 改存 JSON 字符串，日期改存 `YYYY-MM-DD` 字符串。趁迁移一次都还没跑过时改，成本最低。
  - SQLite 相对路径在 CLI 与运行时有两套解析基准，已在 `prisma.config.ts`、`src/config.ts`、`prisma/seed.ts` 三处统一解析成绝对路径，改一处要改三处。
  - 迁移与种子已真实执行：`server/data/app.db` 建好，超管 yadmin、午间档与晚间档、每年级 23 班、四个站点开关都已落库并读回验证。DEPLOY.md 重写为自托管版（systemd + Nginx + SQLite 备份）。
- 2026-09-05 增加 PostgreSQL 可选后端。默认仍为 SQLite；通过 `DATABASE_PROVIDER=postgresql` 使用 `@prisma/adapter-pg`、独立 schema 和独立迁移目录。两种数据库保持相同字段表示，不自动迁移既有数据。
- 2026-09-05 增加 Docker 支持与 GHCR 镜像自动构建：多阶段 Dockerfile、非 root、健康检查；GitHub Actions 多架构构建并推送到 GHCR。DEPLOY.md 新增 Docker 部署章节与 compose 示例。

- 2026-09-04 S3 音源适配层完成：统一 `MusicSource` 契约 + 三家实现 + 注册表 + 体检接口，18 个单测（mock fetch，只测归一化与音质挑选逻辑），外加 `npm run smoke:sources --workspace server` 做真实联调。实测三家的搜索、详情、试听、下载、歌词、封面全部通，具体能拿到什么音质见 CONTEXT.md 第 3 节。
  - 定稿：网易云用 `NeteaseCloudMusicApi` npm 包；QQ 与酷狗自写适配器（对应的开源项目都没发 npm 包，且它们本身是独立服务，塞进免费档实例不划算）。
  - 四个踩坑点已写进 CONTEXT.md 第 3 节：QQ 老搜索接口 404、QQ 风控返回 code 2001 且数据全空、酷狗 CDN 证书 altname 不匹配、酷狗付费歌时长返回 0。
  - 网易云那个包是 CJS 且导出动态拼装，只能 createRequire 引入，已记进 CONTEXT.md 第 6 节。

- 2026-08-31 S2 数据模型落地：10 个模型（点歌、排期、时段、行政历、管理员、操作日志、班数、敏感词、音源凭据、站点开关）、初始迁移 SQL、幂等种子脚本（超管 yadmin、午间档 12:00–12:30 与晚间档 17:40–18:00、每年级 23 班、四个站点开关）。`prisma validate`、`prisma generate`、`npm run typecheck`、`npm run build` 均通过，tsx 也能解析生成的 client；迁移与种子的实际执行等数据库连接串。
  - Prisma 7 的三处差异已写进 CONTEXT.md 第 6 节：datasource 不写 url、生成目录必须显式指定、`migrate diff` 参数改名。

- 2026-08-31 追加需求：身份填写（年级 / 班级 / 姓名）改为超管可开关，默认要求填写；关闭后点歌完全匿名，「同姓名每天 2 首」限流随之失效，只剩 IP 维度。`SongRequest` 的这三个字段因此可空。
- 2026-08-31 S1 骨架完成：npm workspaces（server / web）、Fastify 起服务并托管前端 dist、`/healthz` 与 `/api/version`、Vue 3 + Vite + Tailwind v4 设计 token、深浅色跟随系统、标识 SVG 生成脚本、首页播出单骨架。`npm run typecheck` 与 `npm run build` 均通过，生产模式实测 `/healthz`、静态托管、SPA 回退、未知接口 404 均正常。
  - 期间两处踩坑已写进 CONTEXT.md 第 6 节：TypeScript 需压在 6.0.3（vue-tsc 不兼容 TS 7）；组件 scoped 样式会压过 Tailwind 工具类（层叠层规则）。
  - 中文 web font 方案改为「标识走构建期 SVG 字形，其余走系统栈」，理由见 CONTEXT.md 第 4 节。
- 2026-08-31 完成需求访谈，确定技术栈（Node/TS 单服务 + Neon Postgres）、排期粒度（日期 + 时段 + 序号）、不做跨源匹配、不缓存音频、视觉方向（校园油印点歌条），产出五份文档。
