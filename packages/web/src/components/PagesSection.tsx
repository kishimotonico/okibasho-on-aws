import type { Retention } from '@okibasho/core';
import { QueryErrorResetBoundary, useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { PagesList } from '~/components/PagesList';
import type { PagesApi } from '~/hooks/usePagesApi';
import { pagesListQueryOptions } from '~/lib/pages-queries';
import type { ListedPage } from '~/lib/listed-page';
import { messages } from '~/lib/messages';

interface PagesSectionProps {
  api: PagesApi;
  email: string;
  highlightSlug: string | null;
  error: string | null;
  onReupload: (slug: string) => void;
  onRetentionChange: (page: ListedPage, retention: Retention) => void;
  onDelete: (page: ListedPage) => void;
  onShare: (slug: string) => void;
}

/** 見出しはすぐ出し、中身（PagesList）だけを Suspense で待つ */
export function PagesSection({ api, email, ...listProps }: PagesSectionProps) {
  return (
    <section className="pages-section" aria-labelledby="uploaded-pages-heading">
      <h2 id="uploaded-pages-heading">{messages.listHeading}</h2>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            fallbackRender={({ resetErrorBoundary }) => (
              <div className="message message--error">
                <p>{messages.listLoadFailed}</p>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={resetErrorBoundary}
                >
                  {messages.listReload}
                </button>
              </div>
            )}
          >
            <Suspense fallback={<PagesListSkeleton />}>
              <PagesListContent api={api} email={email} {...listProps} />
            </Suspense>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </section>
  );
}

function PagesListContent({
  api,
  email,
  highlightSlug,
  error,
  onReupload,
  onRetentionChange,
  onDelete,
  onShare,
}: PagesSectionProps) {
  const { data: pages } = useSuspenseQuery(pagesListQueryOptions(api, email));

  return (
    <PagesList
      pages={pages}
      highlightSlug={highlightSlug}
      error={error}
      onReupload={onReupload}
      onRetentionChange={onRetentionChange}
      onDelete={onDelete}
      onShare={onShare}
    />
  );
}

/** 下線だけのフラットな行を数本。muted で控えめに、アニメーションは付けない */
function PagesListSkeleton() {
  return (
    <ul className="page-stack" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="page-row page-row--skeleton">
          <div className="page-row__skeleton-bar" />
        </li>
      ))}
    </ul>
  );
}
