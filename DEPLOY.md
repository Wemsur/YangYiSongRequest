# DEPLOY — 自托管部署与运维

> 部署形态：一个 Node 进程。Fastify 同时提供 API 和前端静态文件，数据库是同目录下的一个 SQLite 文件。
> 不需要数据库服务器，不需要 Docker（若日后采纳上游音源项目做 sidecar，那两个服务再单独考虑）。

## 环境变量

放在 `server/.env`，模板见 [server/.env.example](server/.env.example)。

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | SQLite 文件，默认 `file:./data/app.db`，相对路径以 `server/` 为基准 |
| `SEED_ADMIN_USER` | 初始超管用户名，默认 `yadmin`，只在跑种子时读取 |
| `SEED_ADMIN_PASSWORD` | 初始密码，留空则随机生成并在终端打印一次 |
| `PORT` | 监听端口，默认 3000 |
| `HOST` | 监听地址，默认 `0.0.0.0` |
| `PUBLIC_BASE_URL` | 站点对外地址，用于生成绝对链接 |
| `JWT_SECRET` | S6 鉴权启用后必填，随机 32 字节以上 |
| `CREDENTIAL_KEY` | S7 音源凭据加密用，32 字节 hex |

后两个的生成方式：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 首次部署

服务器上要有 Node 20 以上。`better-sqlite3` 是原生模块，Linux x64 有官方预编译包，直接装即可；架构冷门（比如 armv7）时需要先备好 `python3`、`make`、`g++`。

```bash
git clone https://github.com/Wemsur/YangYiSongRequest.git
cd YangYiSongRequest
npm ci
cp server/.env.example server/.env   # 然后按上表改一遍
npm run build
npm run start:prod
```

`npm ci` 不要加 `--omit=dev`：`prisma` 是 devDependency，启动脚本要用它跑迁移。

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

整个数据库就是一个文件，连带 WAL 一起拷走就行。停服拷最稳，不停服则用 SQLite 自己的备份命令：

```bash
sqlite3 server/data/app.db ".backup '/var/backups/yysong-$(date +%F).db'"
```

排一条 crontab 每天跑一次、保留一两周即可。恢复就是把文件拷回 `server/data/app.db`（先停服，并清掉同名的 `-wal`、`-shm`）。

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


