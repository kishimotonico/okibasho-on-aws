import { createStart } from '@tanstack/react-start';

// vite preview（vite dev は SSR 自体をしない）では、prerender した _shell.html
// を挟まずに各ルートを実際に SSR してしまい、本番（CloudFront + S3）の配信と
// 挙動が食い違う。defaultSsr: false でアプリ全体の初回サーバーリクエスト時の
// SSR を止め、常にクライアントで loader・component を実行させる
export const startInstance = createStart(() => ({
  defaultSsr: false,
}));
