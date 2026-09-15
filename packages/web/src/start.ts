import { createStart } from '@tanstack/react-start';

// vite preview でも本番（_shell.html を返すだけ）と同じく、描画をクライアントだけにする
export const startInstance = createStart(() => ({
  defaultSsr: false,
}));
