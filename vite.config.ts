import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, host: 'localhost' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  // 单测只收 tests/unit：tests/e2e 是 Playwright 用例，不能被 vitest 收集
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
