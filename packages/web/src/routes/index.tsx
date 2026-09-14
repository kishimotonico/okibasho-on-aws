import {
  isValidSlug,
  retentionChangeExpiresAt,
  type PageShare,
  type Retention,
} from '@okibasho/core';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';

import { loadAuthSession } from '~/auth/user-manager';
import { Composer, type ComposerSignal } from '~/components/Composer';
import { PagesList } from '~/components/PagesList';
import { ShareDialog } from '~/components/ShareDialog';
import { getWebConfig } from '~/config/env';
import { usePagesApi, userMessage } from '~/hooks/usePagesApi';
import { listPages, type ListedPage } from '~/lib/listed-page';
import { messages } from '~/lib/messages';
import { PAGE_HIGHLIGHT_MS, sortPagesByCreatedAt } from '~/lib/page-list-highlight';
import { getPageStore } from '~/lib/s3-client';

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
  const pages = await listPages(getPageStore(config, session), session.email, config.pagesBaseUrl);
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
  | { type: 'remove'; slug: string }
  | { type: 'retention'; slug: string; retention: Retention }
  /** 書き込み成功後、その内容で一覧の該当行を差し替える（無ければ足す） */
  | { type: 'upsert'; page: ListedPage };

/**
 * 一覧への反映。'remove' / 'retention' は通信の結果を待たずに使う楽観更新で、
 * expiresAt は S3 側と同じ計算で出す。'upsert' は通信が成功したあと、
 * 書き込んだ内容で該当行を差し替える（S3 を読み直さない）
 */
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
              expiresAt: retentionChangeExpiresAt(action.retention, page.createdAt),
            }
          : page,
      );
    case 'upsert': {
      const exists = pages.some((page) => page.slug === action.page.slug);
      const next = exists
        ? pages.map((page) => (page.slug === action.page.slug ? action.page : page))
        : [...pages, action.page];
      return sortPagesByCreatedAt(next);
    }
  }
}

/** 同じ slug が続けて来ても変化が分かるよう、合図には番号を振る */
function nextSignal(current: ComposerSignal, slug: string): ComposerSignal {
  return { slug, nonce: (current?.nonce ?? 0) + 1 };
}

function HomePage() {
  const api = usePagesApi();
  const loadedPages = Route.useLoaderData();
  const { slug: initialSlug } = Route.useSearch();
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  // 一覧の本体は route のローカル state で持つ。loader は初期表示と手動再読み込み
  // （PagesLoadError の「再読み込み」）のときだけ走るので、loader が再実行されたら
  // ここへ同期する。それ以外の書き込み（削除・保存期間変更・共有変更・アップロード）は
  // 一覧全体を取り直さず、書き込んだ内容でこの state の該当行だけを直接差し替える
  const [basePages, setBasePages] = useState(loadedPages);
  useEffect(() => {
    setBasePages(loadedPages);
  }, [loadedPages]);

  const [pages, applyOptimistic] = useOptimistic(basePages, applyPagesAction);
  const [isMutating, startMutation] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [composerSeed, setComposerSeed] = useState<ComposerSignal>(null);
  const [retiredSlug, setRetiredSlug] = useState<ComposerSignal>(null);
  const [highlight, setHighlight] = useState<ComposerSignal>(null);
  // ShareDialog の開閉は一覧・成功結果ブロックのどちらから開いても同じ経路になるよう、ここで一元管理する
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  // Composer で今回新しく外部公開したときだけ入る。値があれば ShareDialog を完了画面から開く
  const [shareIssuedCredentials, setShareIssuedCredentials] = useState<
    { username: string; password: string } | null | undefined
  >(undefined);
  // pages から都度探すことで、保存後に一覧が更新されるとダイアログの表示（共有URLなど）も追随する
  const sharePage = shareSlug ? (pages.find((page) => page.slug === shareSlug) ?? null) : null;

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
   * 先に画面へ反映し、通信が終わったら結果で一覧の本体（basePages）を直す。
   * useOptimistic の仮の状態はトランジションが終わると basePages に戻るので、
   * run が返す「書き込んだ内容」を先に basePages へ入れておくことで一覧を取り直さずに済む。
   * run が何も返さない（削除など）場合は、楽観更新と同じ action を basePages にも適用する。
   */
  const mutate = (action: PagesAction, run: () => Promise<ListedPage | void>) => {
    startMutation(async () => {
      applyOptimistic(action);
      setActionError(null);
      try {
        const result = await run();
        setBasePages((current) =>
          applyPagesAction(current, result ? { type: 'upsert', page: result } : action),
        );
      } catch (error) {
        setActionError(userMessage(error));
      }
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

  /**
   * 外部共有の保存/再発行/停止。ShareDialog がエラーを自前で表示するので、
   * 一覧の楽観更新（useOptimistic）は使わない。保存できた内容で一覧の該当行を直接差し替え、
   * ダイアログはその一覧から自分の対象ページを引き直す（一覧を取り直さなくても表示が食い違わない）。
   */
  const handleShareChange = async (page: ListedPage, share: PageShare | null) => {
    const updated = await api.updateShare(page.slug, share);
    setBasePages((current) => applyPagesAction(current, { type: 'upsert', page: updated }));
  };

  const handleUploaded = (
    page: ListedPage,
    sharedCredentials?: { username: string; password: string } | null,
  ) => {
    setHighlight((current) => nextSignal(current, page.slug));
    setBasePages((current) => applyPagesAction(current, { type: 'upsert', page }));
    if (sharedCredentials !== undefined) {
      setShareIssuedCredentials(sharedCredentials);
      setShareSlug(page.slug);
    }
  };

  const handleReupload = (slug: string) => {
    setComposerSeed((current) => nextSignal(current, slug));
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleShare = (slug: string) => {
    setShareIssuedCredentials(undefined);
    setShareSlug(slug);
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
          onShare={handleShare}
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
          onShare={handleShare}
        />
      </section>

      {sharePage ? (
        <ShareDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setShareSlug(null);
              setShareIssuedCredentials(undefined);
            }
          }}
          page={sharePage}
          pagesBaseUrl={api.urlOrigin}
          onSave={(share) => handleShareChange(sharePage, share)}
          openIssuedCredentials={shareIssuedCredentials}
        />
      ) : null}
    </div>
  );
}
