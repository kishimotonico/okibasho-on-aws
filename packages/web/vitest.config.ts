import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(rootDir, 'src'),
      '@cli/page': path.resolve(rootDir, '../cli/src/page/index.ts'),
    },
    tsconfigPaths: true,
  },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['./test/setup-dom.ts'],
  },
});
