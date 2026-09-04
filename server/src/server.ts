// 必须在 config 之前：本地开发从 server/.env 读取变量，
// 生产环境（Render）由平台注入，届时没有 .env 文件，dotenv 静默跳过。
import 'dotenv/config'
import { buildApp } from './app.js'
import { config } from './config.js'

const app = await buildApp()

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
