import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
  type Persister,
} from '@tanstack/react-query-persist-client';
import type { Query } from '@tanstack/react-query';

import { PERSIST_MAX_AGE_MS, queryClient } from '~/lib/query-client';

/** 保存するクエリのスキーマを変えたら上げる。合わない保存分は自動的に捨てられる */
const PERSIST_BUSTER = 'pages-v1';

function isPagesQuery(query: Query): boolean {
  return query.queryKey[0] === 'pages';
}

/** prerender（SSR）では localStorage に触らないので null にする */
const persister: Persister | null = import.meta.env.SSR
  ? null
  : createAsyncStoragePersister({ storage: window.localStorage });

/**
 * 一覧のクエリ（queryKey: ['pages', email]）だけを localStorage に残す。metadata には
 * 外部共有の平文パスワードも入るが、localStorage に置くのはユーザーと合意済み。
 *
 * PersistQueryClientProvider（React の副作用）で復元すると、route の loader が始める
 * prefetchQuery のほうが先に走ってしまい、前回の一覧（差分取得の材料）が間に合わない。
 * このモジュールが読み込まれた時点で復元を始め、loader はこの Promise を待ってから
 * prefetchQuery する（lib/pages-queries.ts の queryFn 内 await ではなく、prefetch の前に待つ）
 */
export const pagesRestored: Promise<void> = persister
  ? persistQueryClientRestore({
      queryClient,
      persister,
      maxAge: PERSIST_MAX_AGE_MS,
      buster: PERSIST_BUSTER,
    })
  : Promise.resolve();

// 復元が終わってから、以降の変更を保存し続ける（復元前に保存が走って上書きしないように）
if (persister) {
  void pagesRestored.then(() => {
    persistQueryClientSubscribe({
      queryClient,
      persister,
      buster: PERSIST_BUSTER,
      dehydrateOptions: { shouldDehydrateQuery: isPagesQuery },
    });
  });
}

/** ログアウト時、一覧のメモリ上のキャッシュと localStorage の保存分をまとめて消す */
export async function clearPersistedPages(): Promise<void> {
  queryClient.removeQueries({ predicate: isPagesQuery });
  await persister?.removeClient();
}
