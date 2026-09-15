import { queryOptions } from '@tanstack/react-query';

import type { PagesApi } from '~/hooks/usePagesApi';
import type { ListedPage } from '~/lib/listed-page';

/** queryKey にログイン中の email を含める。ユーザーが切り替われば別のキャッシュになる */
export function pagesQueryKey(email: string) {
  return ['pages', email] as const;
}

/**
 * loader（prefetch）とコンポーネント（useQuery / useSuspenseQuery）の両方で使う一覧クエリ定義。
 * queryFn はキャッシュにある前回の一覧を、ETag による差分取得の材料として list に渡す
 * （persist から復元した直後や、フォーカス再取得のときも同じ経路で差分になる）
 */
export function pagesListQueryOptions(api: PagesApi, email: string) {
  return queryOptions<ListedPage[]>({
    queryKey: pagesQueryKey(email),
    queryFn: ({ client }) => api.list(client.getQueryData<ListedPage[]>(pagesQueryKey(email))),
  });
}
