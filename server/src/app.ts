import { existsSync } from 'node:fs'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { config } from './config.js'

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.isProd ? 'info' : 'debug' },
    // Render 把服务放在反向代理后面，不开这个拿不到真实客户端 IP，限流会失效
    trustProxy: true,
    bodyLimit: 64 * 1024,
  })

  await app.register(cookie)
  // 粗粒度兜底限流；点歌提交等接口在 S4 单独设更严的阈值
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' })

  // 保活探针：必须极轻，不查数据库（见 DEPLOY.md）
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({
    ok: true,
    version: config.version,
  }))

  app.get('/api/version', async () => ({
    version: config.version,
    serverTime: new Date().toISOString(),
  }))

  const hasWebDist = existsSync(config.webDist)
  if (hasWebDist) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: '/',
      index: ['index.html'],
    })
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || !hasWebDist) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
    }
    // 前端是 SPA，非接口路径一律交给 index.html 处理路由
    return reply.sendFile('index.html')
  })

  return app
}
