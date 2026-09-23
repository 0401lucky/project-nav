import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发时后端跑在 3000，前端 5173，这些路径统一代理过去
// /wallpapers 也代理，保证"上传的自定义壁纸"在开发环境同样可用
const API_TARGET = 'http://localhost:3000'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': API_TARGET,
      '/icons': API_TARGET,
      '/wallpapers': API_TARGET,
      '/add': API_TARGET,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // 拆出 vendor 让哈希资源能长期缓存，app 代码变更不会让框架包失效
        // Vite 8 只接受函数形式，不再支持对象映射
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
