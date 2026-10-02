import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import { AntdvNextResolver } from '@antdv-next/auto-import-resolver'

// 前端构建（输入为根 index.html + src/），输出到 muse-go/frontend/dist，
// 由 Go 端 go:embed 内嵌进单二进制。
// 开发时 `pnpm dev:web` 起 vite dev server，Go 应用经 MYGO_DEV_URL 加载。
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  plugins: [UnoCSS(), vue(), Components({ resolvers: [AntdvNextResolver()], dts: 'src/components.d.ts' })],
  build: {
    outDir: 'muse-go/frontend/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(__dirname, 'index.html') }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
