import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { assertAuthConfigured } from './lib/auth.js';
import { AppError } from './lib/errors.js';
import { GLOBAL_RATE_LIMIT } from './lib/rate-limits.js';
import { adminRoutes } from './routes/admin.js';
import { adminConfigRoutes } from './routes/admin-config.js';
import { adminDownloadRoutes } from './routes/admin-download.js';
import { publicRoutes } from './routes/public.js';
import { SourceError } from './sources/types.js';
import { runWithAuditContext } from './services/audit.js';

export async function buildApp() {
  assertAuthConfigured();

  const app = Fastify({
    logger: { level: config.isProd ? 'info' : 'debug' },
    // Render 把服务放在反向代理后面，不开这个拿不到真实客户端 IP，限流会失效
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret });
  // 粗粒度兜底限流；点歌提交等接口在 S4 单独设更严的阈值
  await app.register(rateLimit, GLOBAL_RATE_LIMIT);
  app.addHook('onRequest', (request, _reply, done) => {
    runWithAuditContext({ ip: request.ip, userAgent: request.headers['user-agent'] }, done);
  });

  // 保活探针：必须极轻，不查数据库（见 DEPLOY.md）
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({
    ok: true,
    version: config.version,
  }));

  app.get('/api/version', async () => ({
    version: config.version,
    serverTime: new Date().toISOString(),
  }));

  // 错误一律收敛成 { error: { code, message } }，message 是给学生看的中文
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.detail ? { detail: error.detail } : {}),
        },
      });
    }
    if (error instanceof SourceError) {
      request.log.warn({ err: error, source: error.source }, '音源请求失败');
      return reply.code(502).send({
        error: { code: 'SOURCE_UNAVAILABLE', message: `音源暂时不可用：${error.message}` },
      });
    }
    if (error.statusCode === 429) {
      return reply
        .code(429)
        .send({ error: { code: 'TOO_MANY_REQUESTS', message: '操作太频繁了，歇一会儿再试' } });
    }
    if ('validation' in error && error.validation) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '请求参数不对' } });
    }
    // Fastify 自己抛的 4xx（请求体坏了、Content-Length 不符之类）照原状态码回，别一律算成 500
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      request.log.warn({ err: error }, '客户端请求有问题');
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code ?? 'BAD_REQUEST', message: '请求不合法' } });
    }
    request.log.error({ err: error }, '未预期的错误');
    return reply.code(500).send({ error: { code: 'INTERNAL', message: '服务器出了点问题' } });
  });

  await app.register(publicRoutes);
  await app.register(adminRoutes);
  await app.register(adminConfigRoutes);
  await app.register(adminDownloadRoutes);

  const hasWebDist = existsSync(config.webDist);
  if (hasWebDist) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: '/',
      index: ['index.html'],
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || !hasWebDist) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } });
    }
    // 前端是 SPA，非接口路径一律交给 index.html 处理路由
    return reply.sendFile('index.html');
  });

  return app;
}
