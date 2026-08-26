import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    port: 3000,
    fs: {
      allow: [path.resolve(rootDir, '..', 'cli')],
    },
  },
  resolve: {
    alias: {
      '@cli/page': path.resolve(rootDir, '../cli/src/page/index.ts'),
    },
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    // Start の Vite プラグインより後に置く（公式ドキュメントの推奨）
    viteReact(),
  ],
});
