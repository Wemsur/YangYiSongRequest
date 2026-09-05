# PROGRESS — 开发进度

> 每完成一步就更新这里。新会话靠它判断做到哪了。

当前阶段：**S1–S3 完成，数据库已建好并灌入种子，可以进 S4**

## 阶段计划

| # | 阶段 | 状态 |
| --- | --- | --- |
| S0 | 需求确认 + 五份文档 | ✅ 完成 2026-08-31 |
| S1 | 项目骨架：monorepo、TS 配置、Fastify 起服务、Vite 起前端、Tailwind token 落地 | ✅ 完成 2026-08-31 |
| S2 | 数据模型：Prisma schema + 首次迁移 + 种子数据（超管、时段、班数） | ✅ 完成 2026-09-04 |
| S3 | 音源适配层：三家 search/detail/streamUrl/downloadUrl/lyric + Vitest + 可用性自检 | ✅ 完成 2026-09-04 |
| S4 | 前台：搜索 tab、试听代理、点歌弹窗与提交、查询码查询 | ⬜ |
| S5 | 前台：最近歌单与过往歌单 | ⬜ |
| S6 | 后台：登录鉴权、分权、审核排期、拖拽调序、AuditLog | ⬜ |
| S7 | 后台：配置页（时段、行政历、班数、敏感词、音源扫码登录、账号） | ⬜ |
| S8 | 下载：单曲代理 + 按天流式 zip + ID3 + 歌词 | ⬜ |
| S9 | 部署：自有服务器 + systemd + 反向代理，验收清单跑一遍 | ⬜ |

## 待办与悬而未决

- [ ] 服务器信息：系统、部署路径、域名待定，DEPLOY.md 里现在是占位值
- [ ] 网易云会员 Cookie：待 S7 完成后由管理员在后台扫码登录写入，不经聊天传递
- [ ] 酷狗设备标识：`server/.env` 里那四项现在是每次启动临时生成，上生产前固定下来
- [ ] 台标 / 校徽：暂无，先用文字标识「杨一之声」，拿到素材再替换
- [ ] 法定假日数据：S7 先做手工标记，后续可考虑接节假日数据源

## 变更记录

- 2026-09-05 酷狗取址改走上游 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)：作为 git 依赖装进 server，用 `npm run kugou-api --workspace server` 起在 3300，`npm run dev` 会一起拉起来。取址失败自动回落自写直连并静默一分钟。理由是它带请求签名和 `/login/qr/*`，台里将来开会员就能直接出高音质。
  - 上游的 `/search` 对匿名请求一律 `error_code 152`（模块直调和起独立服务都试过），所以搜索仍用自写实现，混搭的原因写进了 CONTEXT.md 第 3 节。
  - QQ 没换上游：Rain120/qq-music-api 没有扫码登录、Cookie 要写进它自己的配置文件、不在 npm 上且启动依赖 ts-node，换过去只多一个进程不多一份能力。
  - 新增 `README.md` 写清本地怎么跑；`smoke:sources` 实测基线也记在那里。

- 2026-09-04 部署方案换成台里自有服务器，数据库从 Neon Postgres 换成 SQLite（`@prisma/adapter-better-sqlite3`）。理由：自托管有持久磁盘，当初选 Postgres 就是为了绕开 Render 免费档磁盘不持久，这个约束消失了；一天几十到几百条写入用单文件足够，备份就是拷一个文件，不用 Docker 也不用数据库服务器。
  - 代价与处理：Prisma 的 SQLite 连接器不支持原生 enum、数组和 Json，于是 5 组取值改存字符串并把唯一来源收进 `server/src/lib/domain.ts`（联合类型 + `is*` 校验 + 标签），`flaggedWords` 与 `AuditLog.detail` 改存 JSON 字符串，日期改存 `YYYY-MM-DD` 字符串。趁迁移一次都还没跑过时改，成本最低。
  - SQLite 相对路径在 CLI 与运行时有两套解析基准，已在 `prisma.config.ts`、`src/config.ts`、`prisma/seed.ts` 三处统一解析成绝对路径，改一处要改三处。
  - 迁移与种子已真实执行：`server/data/app.db` 建好，超管 yadmin、午间档与晚间档、每年级 23 班、四个站点开关都已落库并读回验证。DEPLOY.md 重写为自托管版（systemd + Nginx + SQLite 备份）。

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

