import { queryOptions } from '@tanstack/react-query';

import type { PagesApi } from '~/hooks/usePagesApi';
import type { ListedPage } from '~/lib/listed-page';

/** queryKey にログイン中の email を含める。ユーザーが切り替われば別のキャッシュになる */
export function pagesQueryKey(email: string) {
  return ['pages', email] as const;
}

export function pagesListQueryOptions(api: PagesApi, email: string) {
  return queryOptions<ListedPage[]>({
    queryKey: pagesQueryKey(email),
    // キャッシュにある前回の一覧を ETag 差分取得の材料として渡す
    queryFn: ({ client }) => api.list(client.getQueryData<ListedPage[]>(pagesQueryKey(email))),
  });
}
