import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  server: { port: 5273, strictPort: true },
  build: {
    // 产物直接落在 Go 侧的 embed 目录（nativeui/web/dist），go build 即带前端。
    outDir: resolve(__dirname, '../native/nativeui/web/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'index.html'),
        poc: resolve(__dirname, 'poc.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
