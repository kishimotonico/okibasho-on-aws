import { isValidSlug } from '@cli/page';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { startTransition, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';

import { loadAuthSession } from '~/auth/user-manager';
import { computeExpiresAt, listPages, type ListedPage, type Retention } from '~/api/pages';
import { Composer, type ComposerSignal } from '~/components/Composer';
import { PagesList } from '~/components/PagesList';
import { getWebConfig } from '~/config/env';
import { usePagesApi, userMessage } from '~/hooks/usePagesApi';
import { messages } from '~/lib/messages';
import { PAGE_HIGHLIGHT_MS, sortPagesByCreatedAt } from '~/lib/page-list-highlight';
import { getPagesS3Client } from '~/lib/s3-client';

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { slug?: string } => ({
    slug: typeof search.slug === 'string' && isValidSlug(search.slug) ? search.slug : undefined,
  }),
  loader: loadPages,
  component: HomePage,
  pendingComponent: PagesPending,
  errorComponent: PagesLoadError,
});

/**
 * 一覧は route の loader で取る。
 * ログイン情報は AuthProvider ではなく UserManager から直に読む。
 * loader は React の外で走るので context を辿れず、
 * 未ログインなら AuthGate がログインへ送るためここでは空の一覧でよい。
 */
async function loadPages(): Promise<ListedPage[]> {
  if (import.meta.env.SSR) {
    // SPA シェルの生成時は認証も S3 も触らない
    return [];
  }

  const session = await loadAuthSession();
  if (!session) {
    return [];
  }

  const config = getWebConfig();
  const client = getPagesS3Client(config, session.idToken);
  const pages = await listPages(client, config.pagesBucket, session.email, config.pagesBaseUrl);
  return sortPagesByCreatedAt(pages);
}

function PagesPending() {
  return (
    <div className="page">
      <p className="loading-note">{messages.listLoading}</p>
    </div>
  );
}

function PagesLoadError() {
  const router = useRouter();

  return (
    <div className="page">
      <div className="message message--error">
        <p>{messages.listLoadFailed}</p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void router.invalidate()}
        >
          {messages.listReload}
        </button>
      </div>
    </div>
  );
}

type PagesAction =
  { type: 'remove'; slug: string } | { type: 'retention'; slug: string; retention: Retention };

/** 通信の結果を待たずに一覧へ反映する。expiresAt は S3 側と同じ計算で出す */
function applyPagesAction(pages: readonly ListedPage[], action: PagesAction): ListedPage[] {
  switch (action.type) {
    case 'remove':
      return pages.filter((page) => page.slug !== action.slug);
    case 'retention':
      return pages.map((page) =>
        page.slug === action.slug
          ? {
              ...page,
              retention: action.retention,
              expiresAt: computeExpiresAt(action.retention, page.createdAt),
            }
          : page,
      );
  }
}

/** 同じ slug が続けて来ても変化が分かるよう、合図には番号を振る */
function nextSignal(current: ComposerSignal, slug: string): ComposerSignal {
  return { slug, nonce: (current?.nonce ?? 0) + 1 };
}

function HomePage() {
  const router = useRouter();
  const api = usePagesApi();
  const loadedPages = Route.useLoaderData();
  const { slug: initialSlug } = Route.useSearch();
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  const [pages, applyOptimistic] = useOptimistic(loadedPages, applyPagesAction);
  const [isMutating, startMutation] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [composerSeed, setComposerSeed] = useState<ComposerSignal>(null);
  const [retiredSlug, setRetiredSlug] = useState<ComposerSignal>(null);
  const [highlight, setHighlight] = useState<ComposerSignal>(null);

  // ハイライトは行が一覧に現れてから数秒。再取得が遅れても見えないまま終わらせない
  const highlightVisible = highlight != null && pages.some((page) => page.slug === highlight.slug);
  useEffect(() => {
    if (!highlight || !highlightVisible) {
      return;
    }

    const id = window.setTimeout(() => setHighlight(null), PAGE_HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [highlight, highlightVisible]);

  /**
   * 先に画面へ反映し、通信が終わったら loader を呼び直す。
   * useOptimistic の仮の状態はトランジションが終わるまで残るので、
   * invalidate を待って本物の一覧と入れ替える。
   */
  const mutate = (action: PagesAction, run: () => Promise<void>) => {
    startMutation(async () => {
      applyOptimistic(action);
      setActionError(null);
      try {
        await run();
      } catch (error) {
        setActionError(userMessage(error));
      }
      await router.invalidate();
    });
  };

  const handleDelete = (slug: string) => {
    mutate({ type: 'remove', slug }, async () => {
      await api.remove(slug);
      setRetiredSlug((current) => nextSignal(current, slug));
    });
  };

  const handleRetentionChange = (page: ListedPage, retention: Retention) => {
    if (page.retention === retention) {
      return;
    }
    mutate({ type: 'retention', slug: page.slug, retention }, () =>
      api.setRetention(page.slug, retention),
    );
  };

  const handleUploaded = (slug: string) => {
    setHighlight((current) => nextSignal(current, slug));
    startTransition(async () => {
      await router.invalidate();
    });
  };

  const handleReupload = (slug: string) => {
    setComposerSeed((current) => nextSignal(current, slug));
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="page">
      <div ref={uploadSectionRef} className="upload-section">
        <Composer
          initialSlug={initialSlug}
          pages={pages}
          seed={composerSeed}
          retired={retiredSlug}
          deleting={isMutating}
          onUploaded={handleUploaded}
          onDelete={handleDelete}
        />
      </div>

      <section className="pages-section" aria-labelledby="uploaded-pages-heading">
        <h2 id="uploaded-pages-heading">{messages.listHeading}</h2>
        <PagesList
          pages={pages}
          highlightSlug={highlight?.slug ?? null}
          error={actionError}
          onReupload={handleReupload}
          onRetentionChange={handleRetentionChange}
          onDelete={(page) => handleDelete(page.slug)}
        />
      </section>
    </div>
  );
}
