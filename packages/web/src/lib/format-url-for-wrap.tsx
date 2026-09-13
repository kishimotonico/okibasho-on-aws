import { Fragment, type ReactNode } from 'react';

/** 公開 URL を `/` の直後で折り返せるよう <wbr> を挿入する */
export function formatUrlForWrap(url: string): ReactNode {
  const parts = url.split('/');

  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? (
        <>
          /<wbr />
        </>
      ) : null}
      {part}
    </Fragment>
  ));
}
