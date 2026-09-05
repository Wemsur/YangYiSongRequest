# 杨村一中校园广播电视台 · 在线点歌

学生免登录点歌，管理员试听审核、排进播出时段，按天打包下载当天要播的音频。

文档：[CONTEXT.md](docs/CONTEXT.md) 架构与长期约定 · [REQUIREMENTS.md](REQUIREMENTS.md) 需求与验收 · [PROGRESS.md](PROGRESS.md) 进度 · [API.md](docs/API.md) 接口 · [DEPLOY.md](docs/DEPLOY.md) 部署

## 本地跑起来

需要 Node 20 以上（本机实测 24.16）。默认使用 SQLite，也可连接 PostgreSQL，配置见部署文档。

安装依赖。这一步会顺带从 GitHub 拉酷狗上游服务，所以要有 git、并且网络能连上 GitHub：

```bash
npm install
```

生成本地配置文件：

```bash
cp server/.env.example server/.env
```

建库并写入种子数据（超管账号、午间档与晚间档、每年级 23 个班、站点开关）：

```bash
npm run migrate:deploy --workspace server && npm run seed --workspace server
```

种子脚本会打印超管的初始密码，只打印这一次。想自己指定就先把 `SEED_ADMIN_PASSWORD` 写进 `server/.env`。

起服务：

```bash
npm run dev
```

这一条会同时起三个进程：

| 名字 | 是什么 | 地址 |
| --- | --- | --- |
| `kugou` | 酷狗上游取址服务（kugoumusicapi） | 127.0.0.1:3300 |
| `server` | 后端 API | 127.0.0.1:3000 |
| `web` | 前端开发服务器 | 0.0.0.0:5175 ← **浏览器开这个** |

只想起其中一个的话：`npm run dev:web`、`npm run dev:server`、`npm run dev:kugou`。

## 验证音源真的能用

```bash
npm run smoke:sources --workspace server
```

它走的是我们自己的适配层，会实测三家的搜索、试听、下载、歌词。2026-09-05 的实测基线：

- 网易云：搜索正常，不登录也能出 320k 完整地址
- QQ 音乐：搜索正常，付费歌只给 30 秒试听片段（`RS02` 开头的地址）
- 酷狗：搜索正常，免费歌出 128k，付费歌拿不到地址——台里没有酷狗会员，属预期

以后台里开了会员，在管理后台配上 Cookie（S7）就能出更高音质，不用改代码。

## 其他常用命令

```bash
npm test                              # 单测，不联网
npm run typecheck                     # 前后端一起查类型
npm run build                         # 构建前端 dist + 编译后端
npm run studio --workspace server     # Prisma Studio，浏览器里看库
```

SQLite 备份可拷 `server/data/app.db`（连同 `-wal`、`-shm`）；PostgreSQL 使用 `pg_dump`。

## 管理后台

浏览器开 `/admin`。本地开发用的超管账号是 `yadmin`，初始密码由种子脚本打印；忘了就重置一个：

```bash
npm run reset-password --workspace server -- 你的新密码
```

登录后左上角是导航。审核员只看到「审核 / 排期 / 改密码」；超管还多四页：

- 配置：点歌开关、身份填写开关、公告、最远可排天数、播出时段、年级班数、敏感词
- 行政历：月历格子，点一下在「默认 → 上 → 休 → 考」之间转。没标记的按「工作日可播、周末不播」处理，只有例外才需要标
- 音源：网易云扫码登录拿 Cookie（会员音质就靠它），QQ 与酷狗手工粘贴；还能给三家做一次体检
- 账号：建审核员、改角色、停用、重置密码

改完前台立刻生效。

## 拿当天要播的歌

排期页顶上三个入口：

- 打包下载整天：一个 zip，按时段分子目录，文件名带播出序号（`午间档/01_起风了 - 冯沁苑.mp3`），每首附一份 `.lrc`，另附「播出单.txt」
- 导出播出单：CSV，Excel 双击直接打开
- 复制播出单文本：给主播的稿子，直接进剪贴板

每个时段有「只打包这个时段」，每首歌有「下载」。下载会自动写入 ID3 标签和封面。

付费歌拿不到地址时整包不会失败，压缩包里会多一份「缺失清单.txt」写清哪几首要手动处理——台里目前只有网易云会员，QQ 与酷狗的付费歌基本都会落到这份清单里。

## 目前做到哪

S1 到 S8 都已完成：前台能搜三家音源、试听、点歌出查询码、看最近与过往歌单；后台能登录分权、审核排期、拖拽调序、改全部配置、扫码拿网易云 Cookie，并且能单曲下载、按天打包、导出播出单。只剩 S9 部署到台里的服务器，进度看 [PROGRESS.md](PROGRESS.md)。
