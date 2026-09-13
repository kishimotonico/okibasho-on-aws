import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = '/dev/upload-box-icon';
const HARNESS_HTML = path.resolve(rootDir, 'dev/upload-box-icon.html');

function isHarnessUrl(url: string | undefined): boolean {
  const pathOnly = url?.split('?')[0]?.split('#')[0];
  return (
    pathOnly === HARNESS_URL || pathOnly === `${HARNESS_URL}/` || pathOnly === `${HARNESS_URL}.html`
  );
}

/** Vite serve のときだけ箱アイコン確認用 HTML を返す。build には載せない。 */
function uploadBoxIconHarness(): Plugin {
  return {
    name: 'upload-box-icon-harness',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (!isHarnessUrl(req.url)) {
          next();
          return;
        }
        void (async () => {
          try {
            const raw = await fs.readFile(HARNESS_HTML, 'utf8');
            const html = await server.transformIndexHtml(HARNESS_URL, raw);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
          } catch (err) {
            next(err);
          }
        })();
      });
    },
  };
}

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
    uploadBoxIconHarness(),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    // Start の Vite プラグインより後に置く（公式ドキュメントの推奨）
    viteReact(),
  ],
});
