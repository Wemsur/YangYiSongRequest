# DEPLOY — 自托管部署与运维

> 部署形态：一个 Node 进程。Fastify 同时提供 API 和前端静态文件。
> 数据库默认使用 SQLite，也可连接 PostgreSQL；两种模式使用相同业务模型和独立迁移目录。

## 环境变量

放在 `server/.env`，模板见 [server/.env.example](../server/.env.example)。

| 变量 | 说明 |
| --- | --- |
| `DATABASE_PROVIDER` | `sqlite`（默认）或 `postgresql` |
| `DATABASE_URL` | SQLite 文件路径，或 PostgreSQL 连接串 |
| `SEED_ADMIN_USER` | 初始超管用户名，默认 `yadmin`，只在跑种子时读取 |
| `SEED_ADMIN_PASSWORD` | 初始密码，留空则随机生成并在终端打印一次 |
| `PORT` | 监听端口，默认 3000 |
| `HOST` | 监听地址，默认 `0.0.0.0` |
| `PUBLIC_BASE_URL` | 站点对外地址，用于生成绝对链接 |
| `JWT_SECRET` | S6 鉴权启用后必填，随机 32 字节以上 |
| `CREDENTIAL_KEY` | 音源 Cookie 的加密密钥，任意 ≥32 字符的随机串（内部用 sha256 派生成 32 字节）。没配也能启动，只是后台存不了音源 Cookie。**换掉它等于让已存的 Cookie 全部失效**，需要重新扫码 |

后两个的生成方式：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker 部署（推荐）

项目提供多阶段 Dockerfile，支持 SQLite 和 PostgreSQL。

```bash
docker build -t ghcr.io/wemsur/yangyisongrequest:latest .
docker run -d --name yysong \
  -p 3000:3000 \
  -e DATABASE_PROVIDER=sqlite \
  -e DATABASE_URL=file:/data/app.db \
  -v /opt/yysong/data:/data \
  ghcr.io/wemsur/yangyisongrequest:latest
```

PostgreSQL 示例：

```bash
docker run -d --name yysong \
  -p 3000:3000 \
  -e DATABASE_PROVIDER=postgresql \
  -e DATABASE_URL=postgresql://user:pass@db:5432/yysong \
  ghcr.io/wemsur/yangyisongrequest:latest
```

镜像已自动发布到 GHCR：`ghcr.io/wemsur/yangyisongrequest:latest`（或具体 tag）。

## 首次部署（原生 Node）

服务器上要有 Node 20 以上。SQLite 模式使用 `better-sqlite3`；Linux x64 有官方预编译包，冷门架构需要 `python3`、`make`、`g++`。PostgreSQL 模式需要预先创建空数据库和可建表用户。

```bash
git clone https://github.com/Wemsur/YangYiSongRequest.git
cd YangYiSongRequest
npm ci
cp server/.env.example server/.env   # 然后按上表改一遍
npm run build
npm run start:prod
```

`npm ci` 不要加 `--omit=dev`：`prisma` 是 devDependency，启动脚本要用它跑迁移。

SQLite 配置：

```dotenv
DATABASE_PROVIDER="sqlite"
DATABASE_URL="file:./data/app.db"
```

PostgreSQL 配置：

```dotenv
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://yysong:password@127.0.0.1:5432/yysong"
```

切换数据库类型后必须重新运行 `npm run build`，因为 Prisma Client 会按当前 provider 生成。SQLite 与 PostgreSQL 不自动搬运既有数据。

`npm run start:prod` 会先 `prisma migrate deploy` 把迁移补齐，再启动服务。种子数据只需显式跑一次：

```bash
npm run seed --workspace server
```

跑完会打印超管账号，如果没设 `SEED_ADMIN_PASSWORD` 还会打印一次随机密码。首次登录会强制改密。

## 进程守护

systemd 是最省事的做法。`/etc/systemd/system/yysong.service`：

```ini
[Unit]
Description=杨一之声在线点歌系统
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/YangYiSongRequest
ExecStart=/usr/bin/npm run start:prod
Restart=always
RestartSec=5
Environment=NODE_ENV=production
User=yysong

[Install]
WantedBy=multi-user.target
```

然后 `systemctl enable --now yysong`。用 pm2 也可以，效果一样，只是多一个要维护的东西。

酷狗取址服务是第二个进程，同样给它一个 unit，`/etc/systemd/system/yysong-kugou.service`：

```ini
[Unit]
Description=杨一之声 · 酷狗上游取址服务
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/YangYiSongRequest/server
ExecStart=/usr/bin/npm run kugou-api
Restart=always
RestartSec=5
User=yysong

[Install]
WantedBy=multi-user.target
```

它只监听本机的 3300，不要暴露到公网——那上面的接口没有任何鉴权。主服务通过 `KUGOU_API_URL` 找它；这个服务挂了酷狗不会整源不可用，取址会自动回落到直连实现，只是付费歌的高音质拿不到。

设备标识（`KUGOU_API_GUID` 等四项）建议写死在 `server/.env` 里。酷狗对频繁变化的设备指纹会加限制，每次重启换一套等于每次都是新设备。首次启动时日志会打印临时生成的那套，抄下来即可。

## 反向代理与 HTTPS

服务本身只监听 HTTP。要绑域名和证书，前面挂一层 Nginx：

```nginx
server {
    listen 443 ssl;
    server_name 你的域名;

    # 音频下载会走大文件流式响应，这两项别漏
    proxy_buffering off;
    client_max_body_size 8m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

证书用 certbot 签发即可。服务端已经开了 `trustProxy`，所以限流拿到的是 `X-Forwarded-For` 里的真实客户端 IP——反向代理必须设置上面那两个转发头，否则全校会被当成同一个 IP 限流。

## 备份

### SQLite

整个数据库就是一个文件，连带 WAL 一起拷走就行。停服拷最稳，不停服则用 SQLite 自己的备份命令：

```bash
sqlite3 server/data/app.db ".backup '/var/backups/yysong-$(date +%F).db'"
```

排一条 crontab 每天跑一次、保留一两周即可。恢复就是把文件拷回 `server/data/app.db`（先停服，并清掉同名的 `-wal`、`-shm`）。

### PostgreSQL

```bash
pg_dump --format=custom --file=/var/backups/yysong-$(date +%F).dump "$DATABASE_URL"
```

恢复前创建空数据库，再使用 `pg_restore --clean --if-exists --dbname="$DATABASE_URL" backup.dump`。生产环境应同时使用数据库服务自身的定期备份与保留策略。

## 升级

```bash
cd /opt/YangYiSongRequest
git pull
npm ci
npm run build
systemctl restart yysong
```

迁移由启动脚本自动执行。升级前先按上一节备份。

## 待补

服务器的系统、部署路径、域名还没定下来，上面的 `/opt/YangYiSongRequest`、`yysong` 用户名都是占位，实际部署时替换并回填本文件。

