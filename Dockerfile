# 多阶段构建：生产镜像最小化
FROM node:20-alpine AS deps
WORKDIR /app
# 安装构建原生模块所需的工具（better-sqlite3 / pg）
RUN apk add --no-cache python3 make g++ git
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY . .
# 构建前端 + 后端（Prisma generate 在 server build 中执行）
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# 仅复制生产依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
# 复制构建产物
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/src/generated ./server/src/generated
COPY --from=builder /app/server/prisma ./server/prisma
COPY server/package.json ./server/
COPY package.json ./
# 非 root 用户
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["npm", "run", "start:prod", "--workspace", "server"]
