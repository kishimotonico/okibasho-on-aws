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
      // ../cli の @cli/page を読むためワークスペースルートまで許可する。
      // packages/cli だけを指すと、dev サーバーで web 自身のルートファイル
      // (tsr-split 由来の動的 import) が allow list の外扱いになって動かない
      allow: [path.resolve(rootDir, '..', '..')],
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
