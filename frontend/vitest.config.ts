import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    maxWorkers: 2,
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 30000,
    restoreMocks: true,
  },
});
