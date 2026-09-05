import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 监听所有 IPv4 地址：内网穿透和局域网手机调试都要求这个，
    // 默认的 localhost 只绑回环地址，穿透工具连不上。
    host: '0.0.0.0',
    // 端口可被 PORT 覆盖，方便预览工具在 5175 被占用时换端口
    port: Number(process.env.PORT) || 5175,
    // Vite 会按 Host 头拦掉不认识的域名（防 DNS rebinding）。
    // 穿透域名是变的，逐个列不现实，所以放开——这只影响开发服务器，
    // 生产是 Fastify 直接托管 dist，不经过 Vite。
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/healthz': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
