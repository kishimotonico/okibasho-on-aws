import { QueryClient } from '@tanstack/react-query';

/** 一覧クエリを localStorage に残す最大期間。query-persistence.ts の persist 設定と揃える */
export const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * アプリで唯一の QueryClient。書き込みのあとはキャッシュを直接直すので staleTime は短めでよいが、
 * CLI からのアップロードを拾えるようウィンドウフォーカスでの再取得は残す。
 * gcTime は一覧クエリの localStorage 保存期間（PERSIST_MAX_AGE_MS）以上にし、
 * 保存分より先にメモリ上のキャッシュが GC されて復元時の差分取得の材料が失われないようにする。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: PERSIST_MAX_AGE_MS,
      retry: 1,
    },
  },
});
