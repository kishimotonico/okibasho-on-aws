import { QueryClient } from '@tanstack/react-query';

/** 一覧クエリを localStorage に残す最大期間 */
export const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

/** アプリで唯一の QueryClient */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 書き込みのあとはキャッシュを直接直すので短めでよい
      staleTime: 60_000,
      // 保存期間より先にメモリ上のキャッシュが GC され、復元時の差分取得の材料が失われないように
      gcTime: PERSIST_MAX_AGE_MS,
      retry: 1,
    },
  },
});
