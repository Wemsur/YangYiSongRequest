# CONTEXT — 杨村一中校园广播电视台在线点歌系统

> 本文件是项目的长期记忆。新会话开始前先读它。改动技术栈、数据模型、设计 token 或关键约定时，必须同步更新本文件。
>
> 姊妹文档：[REQUIREMENTS.md](REQUIREMENTS.md) 功能需求与验收 · [PROGRESS.md](PROGRESS.md) 进度与待办 · [API.md](API.md) 接口契约 · [DEPLOY.md](DEPLOY.md) 部署与环境变量

## 1. 项目是什么

杨村一中校园广播电视台的在线点歌系统。学生免登录提交点歌，管理员在后台试听审核、排进播出时段；审核通过并排好期的歌曲才会出现在前台「最近歌单」。管理员可单曲下载，或按天打包下载当天要播的音频。

- 使用者：全校学生（点歌，手机为主）+ 广播台管理员（审核排期，桌面为主）
- 单一目标：把纸质点歌条搬到线上，并让台里当天要播的歌能一键拿到手。
- 部署目标：Render 免费档 Web Service + Neon Postgres，绑定自有域名（阿里云注册，未备案）。
- 仓库：https://github.com/Wemsur/YangYiSongRequest.git

## 2. 技术栈（已定，含理由）

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 运行时 | Node 20 + TypeScript | 单语言全栈；三家音源的成熟开源实现以 Node 居多 |
| 后端框架 | Fastify | 轻量、启动快（免费档冷启动敏感）、流式响应友好（试听代理 / zip 打包） |
| ORM | Prisma | 迁移可控、类型安全 |
| 数据库 | Neon 免费 Postgres | 免费额度长期有效且独立于部署平台；Render 免费 Postgres 有有效期限制 |
| 前端 | Vue 3 + Vite + TypeScript | |
| 样式 | Tailwind CSS + 自定义 token | 设计系统集中在 token 层，前台与后台共用 |
| 前台组件 | 自写 | 视觉高度定制，组件库会拖累风格 |
| 后台组件 | Naive UI | 表格、弹窗、日期选择器不自己造 |
| 鉴权 | JWT（httpOnly cookie）+ argon2id | |
| 测试 | Vitest | 重点覆盖音源适配器与排期冲突逻辑 |
| 部署形态 | 单服务，Fastify 同时托管前端 dist | 免费档只占一个服务 |

不使用 Docker：校内没有服务器，Render 直接用 Node 构建。

## 3. 音源

统一适配层 `server/src/sources/`，每个音源实现同一接口：`search / detail / streamUrl / downloadUrl / lyric`。任一音源抛错只影响自己的搜索 tab，前端该 tab 显示「此音源暂时不可用」，其余照常。

| 音源 | 候选实现 | 会员 Cookie |
| --- | --- | --- |
| 网易云音乐 | NeteaseCloudMusicApi 的活跃续作（api-enhanced 系） | 有，管理员提供，可取高音质 |
| QQ 音乐 | Rain120/qq-music-api，或自写薄适配器 | 无 |
| 酷狗音乐 | MakcRe/KuGouMusicApi | 无 |

约定：

- 不做跨源匹配下载。学生从 QQ/酷狗点的歌就用该源自己的地址下载；拿不到高音质就在后台标注实际码率，由管理员决定是否驳回。
- Cookie 由管理员在后台「音源账号」页配置，AES-256-GCM 加密存库，绝不写进代码或提交到仓库。
- 网易云走官方扫码登录接口拿 Cookie（后台显示二维码，用网易云 App 扫码）。内嵌官方登录页不可行，对方站点有 X-Frame-Options 限制。
- 这些都是第三方非公开接口，随时可能失效。适配层必须可单独替换，并提供可用性自检端点供后台查看。

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

首页顶部不是大标题 hero，而是「今天的播出单」纸卡：当前时段高亮 + ON AIR 状态，紧接其下是搜索框。移动优先，桌面为左歌单、右搜索结果的双列。后台共用同一套 token，但装饰密度降低，橙色只承担状态与主操作。

站点标识：文字标识「杨一之声」（霞鹜文楷 Bold）+ 一条调频刻度下划线 + ON AIR 小灯，副行 `YANGYI CAMPUS RADIO`。台里若有正式简称或校徽，直接替换。

## 5. 目录结构（规划）

```
YangYiSongRequest/
├─ server/
│  ├─ prisma/
│  │  ├─ schema.prisma    数据模型的唯一准绳
│  │  ├─ migrations/      迁移 SQL，随代码提交
│  │  └─ seed.ts          种子：超管、时段、班数、站点开关
│  ├─ prisma.config.ts    Prisma 7 的 CLI 配置（连接串、迁移目录、seed 命令）
│  └─ src/
│     ├─ app.ts          Fastify 实例与插件注册
│     ├─ routes/         public/ 与 admin/ 两组路由
│     ├─ sources/        netease.ts / qq.ts / kugou.ts + index.ts 聚合
│     ├─ services/       排期、审核、下载打包、敏感词、限流
│     ├─ lib/            db、crypto、时区、日志、zip 流
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

- 时区：库内存 UTC，展示与排期一律 Asia/Shanghai，统一用 date-fns-tz，不依赖服务器本地时区。
- 点歌人信息（年级 + 班级 + 姓名）仅管理员可见，前台歌单与查询码结果页都不展示。
- 前台永不暴露平台真实音频直链，试听与下载都经后端代理。
- 提交点歌后返回 6 位查询码，是学生查询自己那条记录的唯一凭据。
- 所有管理操作写入 AuditLog（谁、何时、对哪条、做了什么）。
- 密码 argon2id；音源 Cookie 用 AES-256-GCM 加密存库，密钥取自环境变量 `CREDENTIAL_KEY`。
- 提交与查询接口带 IP 限流，具体阈值见 REQUIREMENTS.md。
- 数据模型只以 `server/prisma/schema.prisma` 为准，API.md 里那份是约束摘要，改 schema 要顺手更新它。
- Prisma 7 的三处与旧版不同：`datasource` 块里不写 `url`（迁移连接串在 `server/prisma.config.ts`，运行时靠 `@prisma/adapter-pg` driver adapter）；生成的 client 必须指定 `output`，本项目在 `server/src/generated/prisma`，不进版本库；`prisma migrate diff` 的参数是 `--to-schema` 而不是旧的 `--to-schema-datamodel`。
- `prisma.config.ts` 里用 `process.env.DATABASE_URL ?? ''` 而不是 prisma 的 `env()`：CLI 每次调用都会加载该文件，而 `prisma generate`、typecheck 并不需要连库，`env()` 缺变量时会直接抛错。
- 服务端类型检查走 `tsconfig.typecheck.json`（把 `prisma/*.ts` 和 `prisma.config.ts` 一起收进来），构建仍走 `tsconfig.json`，因为它的 `rootDir` 必须锁在 `src`。
- TypeScript 由根 `overrides` 压在 6.0.3：vue-tsc 3.x 仍然 require `typescript/lib/tsc`，而 TS 7 的原生版本不再导出这个入口。想升到 7 之前先确认 vue-tsc 已支持。
- 组件的 scoped 样式属于「无层」CSS，按层叠层规则会压过 Tailwind 在 `@layer utilities` 里的工具类，特异性再低也一样（`:where()` 也救不了）。所以组件根元素不要写 display 之类会被调用方覆盖的属性，显隐一律交给外层元素控制，见 `web/src/components/Wordmark.vue` 的注释。

## 7. 已知风险

- Render 免费档 15 分钟无请求即休眠，需外部定时 ping 保活，方案见 DEPLOY.md。
- 三家音源都是逆向的非公开接口，随时可能变更或封禁，适配层必须保持可替换。
- QQ 与酷狗没有会员账号，可下载音质可能不足以直接播出，这是已确认的取舍。
- 域名未备案：指向境外 Render 可正常访问，但用不了国内 CDN。
- 站内需有一页使用声明，说明音频来源与「仅用于校内广播」的用途限制。

