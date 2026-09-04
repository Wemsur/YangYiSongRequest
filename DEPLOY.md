# DEPLOY — Render 部署与运维

> 部署形态：单个 Render Web Service（Node），Fastify 同时提供 API 与前端静态文件；数据库用外部 Neon Postgres。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | Neon 连接串，带 `?sslmode=require` |
| `JWT_SECRET` | 随机 32 字节以上 |
| `CREDENTIAL_KEY` | AES-256-GCM 密钥，32 字节 hex，用于加密音源 Cookie |
| `SEED_ADMIN_USER` | 初始超管用户名，`yadmin` |
| `SEED_ADMIN_PASSWORD` | 初始密码，首次登录后强制修改 |
| `PUBLIC_BASE_URL` | 站点对外地址，用于生成绝对链接 |
| `TZ` | `Asia/Shanghai`（展示层仍以代码内的时区转换为准） |

密钥生成：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 数据库准备（Neon）

1. 在 [neon.com](https://neon.com) 建一个免费项目，区域选新加坡或美西，和 Render 服务同侧可少几十毫秒。
2. 复制 pooled 连接串（形如 `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`），填进 Render 的 `DATABASE_URL`。
3. 本地开发把同一串写进 `server/.env`（从 `server/.env.example` 复制），或者自己起一个本地 Postgres。
4. 迁移不需要手动执行：`npm run start:prod` 会先跑 `prisma migrate deploy`。种子数据要显式跑一次：

```bash
npm run seed --workspace server
```

`prisma` 是 devDependency，Render 的构建阶段会装上，所以 `start` 里调用 `prisma migrate deploy` 是可用的。若将来把 Render 的 `NODE_ENV` 设成 `production` 并跳过 devDependencies，需要把 prisma 挪到 dependencies。

## 构建与启动

Render 服务设置：

- Build Command：`npm run build`（先把 web 构建到 `web/dist`，再编译 server）
- Start Command：`npm run start:prod`（当前只启动 Fastify；S2 接入 Prisma 后会先跑 `prisma migrate deploy`）
- Health Check Path：`/healthz`

## 免费档的四个限制与应对

1. **15 分钟无请求即休眠**，冷启动数十秒。用 [cron-job.org](https://cron-job.org) 定时 ping `/healthz`，间隔 10 分钟，只在 06:00–23:00（Asia/Shanghai）执行。不要全天 ping：免费档有月度实例运行时长额度，整天保活会顶到上限边缘。不用 GitHub Actions cron，其延迟常达十几分钟。
2. **无持久磁盘**。所以音频一律实时代理，不落盘缓存。
3. **无平台级 cron**。「已播出」等状态由时间自动判定 + 进程内定时器处理，配合上面的保活即可。
4. **月度出网流量有额度**。校园规模的试听与下载用不完，但要避免在前台做整曲预加载。

`/healthz` 必须极轻：只返回 200 和版本号，不查数据库。

## 域名与备案

域名在阿里云注册、未备案，指向境外的 Render：可以正常解析访问，**不需要备案**。备案约束的是服务器在中国大陆境内的情形。

唯一受影响的是国内 CDN——阿里云、腾讯云 CDN 都强制要求备案，未备案用不了。上线后先直连实测速度，校园网通常可接受。若确实慢，两条路：套 Cloudflare 免费版（不需备案，但国内节点质量不稳定，有时更慢），或备案后接国内 CDN。

## 上线检查

- [ ] Neon 实例已创建，连接串已填入 Render
- [ ] 首次部署后用 `SEED_ADMIN_PASSWORD` 登录并立即改密
- [ ] 播出时段与行政历已配置到未来两周
- [ ] 网易云已扫码登录，`/api/admin/sources/health` 三项状态正常
- [ ] cron-job.org 保活任务已启用并验证命中 `/healthz`
- [ ] 自定义域名已在 Render 绑定并签发证书
- [ ] REQUIREMENTS.md 的验收清单全部走通

## 待核对

Render 免费档的具体额度数字（实例小时数、出网流量）以控制台实际条款为准，上线时核对并回填本节。

