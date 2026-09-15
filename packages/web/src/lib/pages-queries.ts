import { queryOptions } from '@tanstack/react-query';

import type { PagesApi } from '~/hooks/usePagesApi';
import type { ListedPage } from '~/lib/listed-page';

/** queryKey にログイン中の email を含める。ユーザーが切り替われば別のキャッシュになる */
export function pagesQueryKey(email: string) {
  return ['pages', email] as const;
}

/** loader（prefetch）とコンポーネント（useQuery / useSuspenseQuery）の両方で使う一覧クエリ定義 */
export function pagesListQueryOptions(api: PagesApi, email: string) {
  return queryOptions<ListedPage[]>({
    queryKey: pagesQueryKey(email),
    queryFn: () => api.list(),
  });
}
