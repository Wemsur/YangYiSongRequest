# CONTEXT — 杨村一中校园广播电视台在线点歌系统

> 本文件是项目的长期记忆。新会话开始前先读它。改动技术栈、数据模型、设计 token 或关键约定时，必须同步更新本文件。
>
> 姊妹文档：[REQUIREMENTS.md](REQUIREMENTS.md) 功能需求与验收 · [PROGRESS.md](PROGRESS.md) 进度与待办 · [API.md](API.md) 接口契约 · [DEPLOY.md](DEPLOY.md) 部署与环境变量

## 1. 项目是什么

杨村一中校园广播电视台的在线点歌系统。学生免登录提交点歌，管理员在后台试听审核、排进播出时段；审核通过并排好期的歌曲才会出现在前台「最近歌单」。管理员可单曲下载，或按天打包下载当天要播的音频。

- 使用者：全校学生（点歌，手机为主）+ 广播台管理员（审核排期，桌面为主）
- 单一目标：把纸质点歌条搬到线上，并让台里当天要播的歌能一键拿到手。
- 部署目标：台里自有服务器，自托管。原计划的 Render 免费档 + Neon Postgres 已作废（2026-09-04）。
- 仓库：https://github.com/Wemsur/YangYiSongRequest.git

## 2. 技术栈（已定，含理由）

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 运行时 | Node 20+ + TypeScript | 单语言全栈；三家音源的成熟开源实现以 Node 居多 |
| 后端框架 | Fastify | 轻量、启动快、流式响应友好（试听代理 / zip 打包） |
| ORM | Prisma 7 | 迁移可控、类型安全 |
| 数据库 | SQLite（`@prisma/adapter-better-sqlite3`） | 自托管有持久磁盘；一天几十到几百条写入，单文件零运维，备份就是拷一个文件 |
| 前端 | Vue 3 + Vite + TypeScript | |
| 样式 | Tailwind CSS + 自定义 token | 设计系统集中在 token 层，前台与后台共用 |
| 前台组件 | 自写 | 视觉高度定制，组件库会拖累风格 |
| 后台组件 | 也自写 | 原计划用 Naive UI，实际做 S6 时发现需要的只有列表、`input[type=date]`、原生 select 和一个上下移动的排序列表，引一整套组件库再改样式反而更费事，还要多背 1MB 依赖。将来做复杂表格时再评估 |
| 鉴权 | JWT（httpOnly cookie）+ argon2id | |
| 测试 | Vitest | 重点覆盖音源适配器与排期冲突逻辑 |
| 部署形态 | 单进程，Fastify 同时提供 API 与前端 dist | 少一个要维护的东西 |

数据库不需要 Docker，也不需要数据库服务器。若采纳上游音源项目做 sidecar，那两个服务用 Docker 起最省事，届时再定。

## 3. 音源

统一适配层 `server/src/sources/`，每个音源实现同一接口：`search / detail / streamTarget / downloadTarget / lyric / health`（见 `types.ts` 的 `MusicSource`）。任一音源抛错只影响自己的搜索 tab，前端该 tab 显示「此音源暂时不可用」，其余照常。

选定实现与实测结论（2026-09-04 用 `npm run smoke:sources --workspace server` 跑通）：

| 音源 | 实现方式 | 无会员时能拿到什么 |
| --- | --- | --- |
| 网易云音乐 | `NeteaseCloudMusicApi` npm 包（2026-05 仍在发布），封装了加密协议和扫码登录 | 免费歌能到 320k；付费歌只有约 35 秒试听片段 |
| QQ 音乐 | 自写适配器，走 `u.y.qq.com/cgi-bin/musicu.fcg` 的 POST 协议 | 免费歌 128k（M500）或 m4a（C400）；付费歌只有 RS02 试听片段 |
| 酷狗音乐 | 搜索走自写适配器（`songsearch.kugou.com`）；取址走上游 `kugoumusicapi` sidecar，连不上时回落到 `m.kugou.com/app/i/getSongInfo.php` | 免费歌 128k 完整曲；Privilege 10 的付费歌一个地址都没有 |

酷狗为什么是「自写搜索 + 上游取址」这种混搭（2026-09-05 实测）：上游 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)（926 star，仍在更新）已作为 git 依赖装进 server，用 `npm run kugou-api --workspace server` 起在 3300 端口。它的 `/song/url` 带请求签名，配上会员 Cookie 能出 320k 与无损，还带 `/login/qr/*` 扫码登录，所以取址和将来拿 Cookie 都交给它。但它的 `/search` 对匿名请求一律返回 `error_code 152 Parameter Error`（模块直调和起服务两种方式都试过），所以搜索仍用自写实现。取址失败会静默回落直连，并在一分钟内不再重试上游，避免每次都白等一次超时。

QQ 为什么没换成上游：[Rain120/qq-music-api](https://github.com/Rain120/qq-music-api)（1067 star，2026-09-04 还在推）没有扫码登录，Cookie 要手写进它的 `config/user-info.js`，和「后台配置、加密存库」的设计冲突；它也不在 npm 上，启动依赖 ts-node，得先 clone 再装。自写适配器已经覆盖搜索、取址、歌词，换过去只增加进程数，不增加能力。等它哪天失效再换。

踩过的坑，换实现前先看这几条：

- QQ 的 `c.y.qq.com/soso/fcgi-bin/client_search_cgi` 已经 404，别再用。musicu 的返回是两层 code，子请求 code 为 2001 时数据结构照样在但全空，那是风控或要求登录，必须显式报错而不是当成「没搜到」。同 IP 连续请求几十次就会触发。
- QQ 取址要 `media_mid` 而不是 `mid`，得先调 `music.pf_song_detail_svr/get_song_detail_yqq` 拿到。文件名前缀决定音质：F000 flac、M800 320k、M500 128k、C400 m4a、RS02 试听片段。
- 酷狗 `mobilecdn` / `msearchcdn` 的 TLS 证书 altname 不匹配，HTTPS 直接连不上；`songsearch.kugou.com` 正常。`play/getdata` 和老的 trackercdn 都要签名，已经不通。
- 酷狗付费歌的 `getSongInfo` 把时长和码率一律返回 0，需要回搜一次补时长。

约定：

- 不做跨源匹配下载。学生从 QQ/酷狗点的歌就用该源自己的地址下载；拿不到高音质就在后台标注实际码率，由管理员决定是否驳回。
- 音源 Cookie 由管理员在后台「音源」页配置，AES-256-GCM 加密存库（`lib/crypto.ts`，密钥取自 `CREDENTIAL_KEY`，用 sha256 派生成 32 字节），绝不写进代码或提交到仓库。适配层通过注入的 `CookieProvider` 取 Cookie，自己不碰数据库；`server.ts` 启动时把 `services/credentials.ts` 的 `readCookie` 注进去。
- `CREDENTIAL_KEY` 是按需读取而不是启动时校验：没配也能把服务跑起来，只是存不了 Cookie，后台页面会明确提示。这跟 `JWT_SECRET`（启动即校验）不一样，因为登录是必需功能，音源会员不是。
- 网易云走官方扫码登录接口拿 Cookie（后台显示二维码，用网易云 App 扫码）。内嵌官方登录页不可行，对方站点有 X-Frame-Options 限制。
- 这些都是第三方非公开接口，随时可能失效。`npm test` 只测归一化逻辑（mock 掉 fetch），真实连通性靠 `smoke:sources` 手动跑。

## 4. 设计系统

方向：校园油印 / 丝网印刷的点歌条。灵感来自学校油印小报、纸质点歌条、调音台刻度与 ON AIR 灯箱，不是通用的「暖色 SaaS」。明确避开三种一眼可辨的 AI 默认外观：奶油底 + 高对比衬线 + 陶土色、近黑底 + 单一荧光色、报纸式零圆角栏格。

### 色板

| Token | 值 | 用途 |
| --- | --- | --- |
| `paper` | `#F5E9D4` | 页面底色，暖麻纸 |
| `paper-hi` | `#FFF8EC` | 卡片底、深色按钮上的文字 |
| `ink` | `#2B1D14` | 正文、深咖主按钮底 |
| `ink-soft` | `#6B5445` | 次级文字、说明 |
| `riso-orange` | `#FF5B24` | 主强调：CTA 底、当前时段、ON AIR |
| `riso-yellow` | `#E8A33D` | 次强调：徽章、网点纹理 |
| `indigo` | `#26356B` | 冷色平衡，仅用于焦点环与链接 |
| `night` | `#1A120C` | 深色模式底 |

对比度硬约定：`riso-orange` 对纸底仅约 2.9:1，禁止作正文色，只用于大字号、边框、装饰。主 CTA 是「橙底 + `ink` 文字」（约 5.6:1）。焦点环 2px `indigo`，offset 2px，键盘可见。

### 字体

- Display（拉丁与数字）：Fraunces variable，开 WONK 轴，用于大标题与 ON AIR 标识
- 正文：Archivo variable + 系统中文栈（PingFang SC / HarmonyOS Sans SC / Microsoft YaHei）
- 数据与时刻表：DM Mono，启用 tabular numbers
- 站点标识：霞鹜文楷，但不加载字体文件

三个拉丁字体用 @fontsource 自托管（Fraunces wonk 37KB、Archivo wght 35KB、DM Mono 两档 30KB），不引用 Google Fonts CDN（国内不可靠）。

中文不加载 web font。霞鹜文楷按 unicode-range 切成 582 个分片，最小粒度约 50KB/片，光「杨一之声」四个字就要拉 6 个分片共 557KB，为几个字付这个代价不值。标识因此改成构建期取字形路径：`web/scripts/build-wordmark.mjs` 用 wawoff2 解压相关分片、opentype.js 取路径，生成 `src/assets/wordmark-mark.svg`（4.6KB）与 `wordmark-full.svg`（20KB），内联进 JS，运行时零字体开销。改标识文案后重跑 `npm run wordmark --workspace web`。其余中文一律走系统栈，靠字号、字重与字距拉开层次。

### 形与质感

- 圆角：卡片 12px，按钮与输入 10px，徽章 8px。不用胶囊形全圆角。
- 纹理：极轻纸纹噪点（opacity ≤ 0.05）与半调网点分区底，用 CSS/SVG 生成，禁止大图。
- 唯一的强装饰：点歌确认弹窗做成一张油印点歌条（撕边、套印偏移、编号章），提交成功时查询码以盖章动效出现。其余页面保持安静。
- 动效只有三处：盖章、ON AIR 呼吸灯、试听时的 VU 条。无视差滚动，无整屏 reveal。全部尊重 `prefers-reduced-motion`。
- 播出序号是真实信息，可以显式编号；不做纯装饰性的 01 / 02 / 03。

### 布局

首页顶部不是大标题 hero，而是一叠播出单纸卡（`PlaylistDeck.vue`）：默认停在今天那张，左边是昨天，右边是往后已排期的日期。手机左右滑动切换，桌面两侧有翻页按钮、也能拖，键盘左右方向键同样能翻；上方一排日期标签既是导航也指示当前位置。卡片绝对定位堆叠，容器高度跟当前那张走并带过渡；后面那几张裁到同高，否则更长的卡片会溢出压住下方内容。紧接其下是搜索框。移动优先，后台共用同一套 token，但装饰密度降低，橙色只承担状态与主操作。

站点标识：文字标识「扬中之声」（霞鹜文楷 Bold）+ 一条调频刻度下划线 + ON AIR 小灯，副行 `YANGZHONG CAMPUS RADIO`。官方简称是「扬中」，不要写成「杨一」。台里若有校徽，直接替换。

## 5. 目录结构（规划）

```
YangYiSongRequest/
├─ server/
│  ├─ data/               SQLite 数据库文件，不进版本库
│  ├─ prisma/
│  │  ├─ schema.prisma    数据模型的唯一准绳
│  │  ├─ migrations/      迁移 SQL，随代码提交
│  │  └─ seed.ts          种子：超管、时段、班数、站点开关
│  ├─ prisma.config.ts    Prisma 7 的 CLI 配置（数据库路径、迁移目录、seed 命令）
│  ├─ scripts/            smoke-sources.ts 真实联调音源
│  └─ src/
│     ├─ app.ts          Fastify 实例与插件注册
│     ├─ routes/         public/ 与 admin/ 两组路由
│     ├─ sources/        netease.ts / qq.ts / kugou.ts + index.ts 注册表
│     ├─ services/       排期、审核、下载打包、敏感词、限流
│     ├─ lib/            db、domain（取值与压平字段编解码）、crypto、时区、zip 流
│     └─ generated/      Prisma client，不进版本库
├─ web/
│  ├─ scripts/           build-wordmark.mjs 构建期生成标识 SVG
│  ├─ src/
│  │  ├─ pages/          前台页面
│  │  ├─ admin/          后台页面
│  │  ├─ components/
│  │  ├─ stores/         Pinia
│  │  ├─ assets/         wordmark-*.svg（由脚本生成）
│  │  ├─ styles/app.css  设计 token 单一来源
│  │  └─ lib/            api、时区、主题、时段
│  └─ public/            favicon
├─ .claude/launch.json   本地预览配置
└─ *.md                  本组文档
```

## 6. 关键约定

- 时区：库内存 UTC，展示与排期一律 Asia/Shanghai。东八区没有夏令时、偏移恒定 +08:00，所以没引 date-fns-tz，服务端统一走 `server/src/lib/time.ts`，前端走 `web/src/lib/time.ts` 的 `Intl` 格式化，两边都不看服务器和浏览器的本地时区。
- 前端所有请求都走 `web/src/lib/api.ts`（管理端走 `lib/adminApi.ts`，复用同一个 `apiFetch`），后端错误统一是 `{ error: { code, message } }`，`message` 可以直接显示给学生；接口层把它包成 `ApiError`，组件只管展示 `error.message`。
- 管理端登录态是 httpOnly cookie 里的 JWT，前端不碰 token，只缓存 `/api/admin/me` 的结果。JWT 里只放用户 id，角色和停用状态每次请求都回库核对，所以停用账号立刻失效。
- 判断 `YYYY-MM-DD` 是星期几，必须按 `T00:00:00.000Z` 解析。写成 `+08:00` 会退到前一天，星期差一位——S6 的排期默认日期就踩过这个坑，前后端各有一份 `isWeekend`。
- 排期只追加到时段末尾，顺序调整走单独的 reorder 接口，并且在事务里先把 `orderNo` 挪到负数区再落正式值：`(playDate, slotId, orderNo)` 有唯一约束，一步到位会在中途撞上。
- 点歌人信息（年级 + 班级 + 姓名）仅管理员可见，前台歌单与查询码结果页都不展示。
- 前台永不暴露平台真实音频直链，试听与下载都经后端代理。
- 提交点歌后返回 6 位查询码，是学生查询自己那条记录的唯一凭据。
- 所有管理操作写入 AuditLog（谁、何时、对哪条、做了什么）。
- 密码 argon2id；音源 Cookie 用 AES-256-GCM 加密存库，密钥取自环境变量 `CREDENTIAL_KEY`。
- 提交与查询接口带 IP 限流，具体阈值见 REQUIREMENTS.md。
- 数据模型只以 `server/prisma/schema.prisma` 为准，API.md 里那份是约束摘要，改 schema 要顺手更新它。
- SQLite 存不了原生 enum、数组和 Json，所以：5 组取值全部存字符串，唯一来源是 `server/src/lib/domain.ts`（联合类型管编译期，`is*` 函数管运行期）；`flaggedWords` 与 `AuditLog.detail` 存 JSON 字符串，用 domain.ts 里的 encode/decode；日期一律存 `YYYY-MM-DD` 字符串按 Asia/Shanghai 解读，绕开时区偏移。
- SQLite 相对路径有两套解析基准（CLI 按 schema 目录、运行时 adapter 按进程 cwd），所以 `DATABASE_URL` 里的相对路径在三处都统一解析成以 server 包目录为基准的绝对路径：`prisma.config.ts`、`src/config.ts`、`prisma/seed.ts`。改一处要改三处。
- Prisma 7 的两处与旧版不同：`datasource` 块里不写 `url`（迁移路径在 `prisma.config.ts`，运行时靠 driver adapter）；生成的 client 必须指定 `output`，本项目在 `server/src/generated/prisma`，不进版本库。`prisma migrate diff` 的参数是 `--to-schema` 而不是旧的 `--to-schema-datamodel`。
- 服务端类型检查走 `tsconfig.typecheck.json`（把 `prisma/*.ts`、`prisma.config.ts`、`scripts/*.ts` 和测试一起收进来），构建仍走 `tsconfig.json`，因为它的 `rootDir` 必须锁在 `src`，且要排掉 `*.test.ts` 不进 dist。
- `NeteaseCloudMusicApi` 是 CJS，导出在运行时动态拼出来，cjs-module-lexer 认不出来，具名 ESM import 会在加载时报 `does not provide an export named`。只能 `createRequire` 取整个 `module.exports` 再套它自带的 `interface.d.ts` 类型，见 `sources/netease.ts` 顶部注释。它把搜索类型和音质等级声明成 `const enum`，运行时没有对应对象，传值时要按字面量断言。
- TypeScript 由根 `overrides` 压在 6.0.3：vue-tsc 3.x 仍然 require `typescript/lib/tsc`，而 TS 7 的原生版本不再导出这个入口。想升到 7 之前先确认 vue-tsc 已支持。
- 组件的 scoped 样式属于「无层」CSS，按层叠层规则会压过 Tailwind 在 `@layer utilities` 里的工具类，特异性再低也一样（`:where()` 也救不了）。所以组件根元素不要写 display 之类会被调用方覆盖的属性，显隐一律交给外层元素控制，见 `web/src/components/Wordmark.vue` 的注释。

## 7. 已知风险

- 三家音源都是逆向的非公开接口，随时可能变更或封禁，适配层必须保持可替换。
- QQ 与酷狗没有会员账号，可下载音质可能不足以直接播出，这是已确认的取舍。付费歌在 QQ 只有试听片段，在酷狗一个地址都没有；网易云配上会员 Cookie 后可取完整曲。
- SQLite 单文件的代价是备份要靠自己：升级或迁移前先拷 `server/data/app.db` 及其 `-wal`、`-shm`。
- 站内需有一页使用声明，说明音频来源与「仅用于校内广播」的用途限制。

