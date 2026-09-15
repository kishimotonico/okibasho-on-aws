import { QueryClient } from '@tanstack/react-query';

/**
 * アプリで唯一の QueryClient。書き込みのあとはキャッシュを直接直すので staleTime は短めでよいが、
 * CLI からのアップロードを拾えるようウィンドウフォーカスでの再取得は残す。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});
