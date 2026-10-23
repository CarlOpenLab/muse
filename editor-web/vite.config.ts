import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5273, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
