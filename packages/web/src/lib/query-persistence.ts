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
 * 一覧のクエリ（queryKey: ['pages', email]）だけを localStorage に残す。外部共有の
 * 平文パスワードを含む metadata も置くが、ユーザーと合意済み。
 *
 * loader の prefetchQuery より先に復元を終える必要がある（前回の一覧が ETag 差分取得の
 * 材料になるため）ので、React の副作用ではなくこのモジュールの読み込み時点で復元を始める。
 * loader はこの Promise を待ってから prefetchQuery する
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
