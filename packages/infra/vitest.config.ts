import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // CDKのsynthは重いのでタイムアウトを長めに取る
    testTimeout: 30_000,
  },
});
