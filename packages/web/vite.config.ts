import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const apiBaseUrl = env.VITE_API_BASE_URL?.trim();

  let proxyTarget: string | undefined;
  if (apiBaseUrl) {
    try {
      proxyTarget = new URL(apiBaseUrl).origin;
    } catch {
      console.warn(`VITE_API_BASE_URL が不正なため proxy を無効にします: ${apiBaseUrl}`);
    }
  }

  return {
    server: {
      port: 3000,
      // 開発サーバーには API が無い。/api を VITE_API_BASE_URL の origin へ転送し、
      // ブラウザから見て常に同一 origin に保つ。これで API Gateway に CORS を足さずに済む。
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    resolve: {
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
  };
});
