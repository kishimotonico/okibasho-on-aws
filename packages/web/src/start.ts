import { createStart } from '@tanstack/react-start';

// vite preview（vite dev は SSR 自体をしない）は prerender した _shell.html を挟まず
// 各ルートを実際に SSR してしまい、本番（CloudFront + S3）と挙動が食い違う。
// defaultSsr: false で初回サーバーリクエストの SSR を止め、常にクライアントで実行させる
export const startInstance = createStart(() => ({
  defaultSsr: false,
}));
