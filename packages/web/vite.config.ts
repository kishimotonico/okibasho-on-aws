import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function isHarnessUrl(url: string | undefined, harnessUrl: string): boolean {
  const pathOnly = url?.split('?')[0]?.split('#')[0];
  return (
    pathOnly === harnessUrl || pathOnly === `${harnessUrl}/` || pathOnly === `${harnessUrl}.html`
  );
}

/** Vite serve のときだけ確認用 HTML を返す dev 専用ハーネス。build には載せない */
function devHarness(name: string, harnessUrl: string, htmlFile: string): Plugin {
  const harnessHtml = path.resolve(rootDir, 'dev', htmlFile);
  return {
    name,
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (!isHarnessUrl(req.url, harnessUrl)) {
          next();
          return;
        }
        void (async () => {
          try {
            const raw = await fs.readFile(harnessHtml, 'utf8');
            const html = await server.transformIndexHtml(harnessUrl, raw);
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
    // dev はルート直下の認証ゲートからトップページまで数十の未バンドル ESM を配信するため、
    // その経路のファイルを起動時に先読み変換させ、最初のアクセスでの変換待ちを減らす
    warmup: {
      clientFiles: [
        './src/router.tsx',
        './src/routeTree.gen.ts',
        './src/routes/**/*.tsx',
        './src/components/**/*.tsx',
        './src/auth/**/*.{ts,tsx}',
        './src/hooks/**/*.ts',
        './src/lib/**/*.ts',
        './src/config/**/*.ts',
      ],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    devHarness('upload-box-icon-harness', '/dev/upload-box-icon', 'upload-box-icon.html'),
    devHarness('options-harness', '/dev/options', 'options.html'),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    // Start の Vite プラグインより後に置く（公式ドキュメントの推奨）
    viteReact(),
  ],
});
