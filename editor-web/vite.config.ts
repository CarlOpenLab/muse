import { fileURLToPath as _f } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  server: { port: 5273, strictPort: true },
  build: {
    // 产物直接落在 Go 侧的 embed 目录（nativeui/web/dist），go build 即带前端。
    outDir: resolve(here, '../native/nativeui/web/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        editor: resolve(here, 'index.html'),
        poc: resolve(here, 'poc.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
