// 必须在 config 之前：本地开发从 server/.env 读取变量，
// 生产环境（Render）由平台注入，届时没有 .env 文件，dotenv 静默跳过。
import 'dotenv/config'
import { buildApp } from './app.js'
import { config } from './config.js'
import { readCookie } from './services/credentials.js'
import { startPlaybackWatcher } from './services/playback.js'
import { useCookieProvider } from './sources/index.js'

// 音源适配层从这里拿会员 Cookie（加密存库，S7 的后台页面负责写入）
useCookieProvider(readCookie)

const app = await buildApp()

// 「已播出」由时间自动判定，启动跑一次，之后每 5 分钟一次
startPlaybackWatcher((count) => app.log.info(`自动标记 ${count} 首为已播出`))

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info(`收到 ${signal}，正在关闭服务`)
    void app.close().then(() => process.exit(0))
  })
}

try {
  await app.listen({ port: config.port, host: config.host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
