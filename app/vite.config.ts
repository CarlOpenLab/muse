import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import { AntdvNextResolver } from '@antdv-next/auto-import-resolver'

// 前端构建。入口为本包 index.html + src/，输出到 ../native/embed/dist，
// 由 Go 端 go:embed 内嵌进单二进制（go:embed 不能用 ..，产物必须物理位于 native/ 内）。
// 开发时本包 `pnpm dev`（根目录 `pnpm dev:web`）起 vite dev server :5173，
// Go 应用经 MYGO_DEV_URL 加载。
export default defineConfig({
  base: './',
  plugins: [UnoCSS(), vue(), Components({ resolvers: [AntdvNextResolver()], dts: 'src/components.d.ts' })],
  build: {
    outDir: '../native/embed/dist',
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