import {
  isValidSlug,
  retentionChangeExpiresAt,
  type PageShare,
  type Retention,
} from '@okibasho/core';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, useTransition } from 'react';

import { useAuth } from '~/auth/auth-context';
import { loadAuthSession } from '~/auth/user-manager';
import { Composer, type BoxSpinSignal, type ComposerSignal } from '~/components/Composer';
import { PagesSection } from '~/components/PagesSection';
import { ShareDialog } from '~/components/ShareDialog';
import { getWebConfig } from '~/config/env';
import { createPagesApi, usePagesApi, userMessage } from '~/hooks/usePagesApi';
import type { ListedPage } from '~/lib/listed-page';
import { PAGE_HIGHLIGHT_MS, sortPagesByCreatedAt } from '~/lib/page-list-highlight';
import { pagesListQueryOptions, pagesQueryKey } from '~/lib/pages-queries';
import { queryClient } from '~/lib/query-client';
import { pagesRestored } from '~/lib/query-persistence';
import { preloadPagesSdk } from '~/lib/s3-client';

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { slug?: string } => ({
    slug: typeof search.slug === 'string' && isValidSlug(search.slug) ? search.slug : undefined,
  }),
  loader: prefetchPages,
  component: HomePage,
});

/**
 * 一覧は loader では await しない。prefetch を始めるだけにして、
 * Composer はすぐ表示し、一覧セクションだけが後から追いつく。
 * localStorage からの復元（pagesRestored）だけは待つ。待たずに prefetchQuery すると
 * 前回の一覧（ETag 差分取得の材料）が間に合わず、復元後の結果を毎回捨てて
 * 全件取り直すことになる
 */
async function prefetchPages(): Promise<void> {
  if (import.meta.env.SSR) {
    // SPA シェルの生成時は認証も S3 も触らない
    return;
  }

  // 一覧取得（下の await たち）を待たず、S3・Cognito の SDK チャンクの読み込みだけ並行して始める
  preloadPagesSdk();

  const session = await loadAuthSession();
  if (!session) {
    // 未ログインなら AuthGate がログインへ送るため、ここでは何もしなくてよい
    return;
  }

  await pagesRestored;

  const config = getWebConfig();
  const api = createPagesApi(config, session);
  // ここだけ staleTime を 0 にし、リロードのたびに裏で取り直す（ETag 差分なので安い）。
  // コンポーネント側の useQuery は既定の staleTime のままにして、マウントで二重に取りに行かせない
  void queryClient.prefetchQuery({
    ...pagesListQueryOptions(api, session.email),
    staleTime: 0,
  });
}

type PagesAction =
  | { type: 'remove'; slug: string }
  | { type: 'retention'; slug: string; retention: Retention }
  /** 書き込み成功後、その内容で一覧の該当行を差し替える（無ければ足す） */
  | { type: 'upsert'; page: ListedPage };

/**
 * クエリキャッシュへの反映。'remove' / 'retention' は通信の結果を待たずに使う楽観更新で、
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
              expiresAt: retentionChangeExpiresAt(action.retention),
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

/** ページ地のダブルクリック（イースターエッグ）を composer・一覧・操作できる要素の上では発火させない */
const BOX_SPIN_IGNORE_SELECTOR =
  'button, a, input, textarea, select, label, [role], [contenteditable="true"], [tabindex], .composer, .pages-section';

function isBoxSpinBackground(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(BOX_SPIN_IGNORE_SELECTOR) === null;
}

function HomePage() {
  const api = usePagesApi();
  const { session } = useAuth();
  const email = session?.email ?? '';
  const { slug: initialSlug } = Route.useSearch();
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  // 一覧はクエリのキャッシュを唯一の情報源にする。suspend しない読み方なので、
  // まだ読み込まれていない間は undefined（Composer 側もそれを前提に動く）
  const { data: pages } = useQuery(pagesListQueryOptions(api, email));

  const [isMutating, startMutation] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [composerSeed, setComposerSeed] = useState<ComposerSignal>(null);
  const [retiredSlug, setRetiredSlug] = useState<ComposerSignal>(null);
  const [highlight, setHighlight] = useState<ComposerSignal>(null);
  const [boxSpin, setBoxSpin] = useState<BoxSpinSignal>(null);
  // ShareDialog の開閉は一覧・成功結果ブロックのどちらから開いても同じ経路になるよう、ここで一元管理する
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  // アップロード直後の自動オープン（今回新しく外部公開したとき）だけ、ShareDialog に
  // 「発行直後」だと伝える。一覧の「外部共有…」から開いたときは null にして伝えない
  const [justIssuedSlug, setJustIssuedSlug] = useState<string | null>(null);
  // pages から都度探すことで、保存後に一覧が更新されるとダイアログの表示（共有URLなど）も追随する
  const sharePage = shareSlug ? (pages?.find((page) => page.slug === shareSlug) ?? null) : null;

  // ハイライトは行が一覧に現れてから数秒。一覧の読み込みが遅れても見えないまま終わらせない
  const highlightVisible =
    highlight != null && (pages?.some((page) => page.slug === highlight.slug) ?? false);
  useEffect(() => {
    if (!highlight || !highlightVisible) {
      return;
    }

    const id = window.setTimeout(() => setHighlight(null), PAGE_HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [highlight, highlightVisible]);

  // イースターエッグ: 何もないページ地をダブルクリックすると箱がくるっと1回転する
  useEffect(() => {
    const onDblClick = (event: MouseEvent) => {
      if (!isBoxSpinBackground(event.target)) {
        return;
      }
      setBoxSpin((current) => ({ nonce: (current?.nonce ?? 0) + 1 }));
    };
    document.addEventListener('dblclick', onDblClick);
    return () => document.removeEventListener('dblclick', onDblClick);
  }, []);

  const queryKey = pagesQueryKey(email);

  /**
   * 書き込みが成功したあと、その内容で一覧の該当行を差し替える。
   * キャッシュがまだ無い（一覧が読み込まれる前）ときは、無いところへ新しい一覧を
   * 作ってしまうと直後に in-flight の一覧取得（初回 fetch やフォーカス再取得）の結果で
   * 上書きされて消える恐れがあるので setQueryData せず、取得を取り直すだけにする
   */
  function upsertPage(page: ListedPage) {
    if (queryClient.getQueryData<ListedPage[]>(queryKey) === undefined) {
      void queryClient.invalidateQueries({ queryKey });
      return;
    }
    queryClient.setQueryData<ListedPage[]>(queryKey, (current) =>
      applyPagesAction(current ?? [], { type: 'upsert', page }),
    );
  }

  /**
   * 先にキャッシュへ反映し、失敗したら元に戻して actionError を出す
   * （TanStack Query の楽観更新の定石）。成功したら書き込んだ内容で該当行を差し替える。
   * キャッシュがまだ無いときは upsertPage と同じ理由で楽観更新をせず、成功後に取り直す。
   * キャッシュがあるときも、in-flight の取得（フォーカス再取得など）が楽観更新を
   * 古い結果で上書きしないよう、書き換える前に cancelQueries で止める
   */
  function mutate(action: PagesAction, run: () => Promise<ListedPage | void>) {
    startMutation(async () => {
      setActionError(null);

      if (queryClient.getQueryData<ListedPage[]>(queryKey) === undefined) {
        try {
          await run();
          void queryClient.invalidateQueries({ queryKey });
        } catch (error) {
          setActionError(userMessage(error));
        }
        return;
      }

      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ListedPage[]>(queryKey) ?? [];
      queryClient.setQueryData<ListedPage[]>(queryKey, applyPagesAction(previous, action));
      try {
        const result = await run();
        if (result) {
          queryClient.setQueryData<ListedPage[]>(queryKey, (current) =>
            applyPagesAction(current ?? previous, { type: 'upsert', page: result }),
          );
        }
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        setActionError(userMessage(error));
      }
    });
  }

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
   * 外部共有の保存/再発行/停止。ShareDialog がエラーを自前で表示するので、楽観更新は使わない。
   * 保存できた内容で一覧の該当行を直接差し替え、ダイアログはその一覧から自分の対象ページを引き直す
   * （一覧を取り直さなくても表示が食い違わない）
   */
  const handleShareChange = async (page: ListedPage, share: PageShare | null) => {
    const updated = await api.updateShare(page.slug, share);
    upsertPage(updated);
  };

  const handleUploaded = (page: ListedPage, openShare: boolean) => {
    setHighlight((current) => nextSignal(current, page.slug));
    upsertPage(page);
    if (openShare) {
      setShareSlug(page.slug);
      setJustIssuedSlug(page.slug);
    }
  };

  const handleReupload = (slug: string) => {
    setComposerSeed((current) => nextSignal(current, slug));
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleShare = (slug: string) => {
    setShareSlug(slug);
    setJustIssuedSlug(null);
  };

  return (
    <div className="page">
      <div ref={uploadSectionRef} className="upload-section">
        <Composer
          initialSlug={initialSlug}
          pages={pages}
          seed={composerSeed}
          retired={retiredSlug}
          spinSignal={boxSpin}
          deleting={isMutating}
          onUploaded={handleUploaded}
          onDelete={handleDelete}
          onShare={handleShare}
        />
      </div>

      <PagesSection
        api={api}
        email={email}
        highlightSlug={highlight?.slug ?? null}
        error={actionError}
        onReupload={handleReupload}
        onRetentionChange={handleRetentionChange}
        onDelete={(page) => handleDelete(page.slug)}
        onShare={handleShare}
      />

      {sharePage ? (
        <ShareDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setShareSlug(null);
              setJustIssuedSlug(null);
            }
          }}
          page={sharePage}
          pagesBaseUrl={api.urlOrigin}
          onSave={(share) => handleShareChange(sharePage, share)}
          justIssued={shareSlug === justIssuedSlug}
        />
      ) : null}
    </div>
  );
}
