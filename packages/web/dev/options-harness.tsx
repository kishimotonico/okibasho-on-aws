import { generateRandomSlug, type Retention } from '@okibasho/core';
import { useRef, useState } from 'react';

import { PagesList } from '~/components/PagesList';
import { PasswordToggle } from '~/components/PasswordToggle';
import { ShareDialog } from '~/components/ShareDialog';
import { isSlugInvalid, SlugField } from '~/components/SlugField';
import { TooltipProvider } from '~/components/Tooltip';
import { UploadOptions, type PageVisibility } from '~/components/UploadOptions';
import type { ListedPage } from '~/lib/listed-page';

const MOCK_PAGES: ListedPage[] = [
  {
    slug: 'q3-report',
    owner: 'nico@example.com',
    createdAt: '2026-09-01T03:00:00.000Z',
    expiresAt: '2026-10-15T12:00:00.000Z',
    retention: 'temporary',
    viewUrl: 'https://pages.okibasho.example/p/nico/q3-report/',
    shareTag: 'aaaaaaaaaaa',
    share: { id: 'b'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' },
  },
  {
    slug: 'design-mock',
    owner: 'nico@example.com',
    createdAt: '2026-08-20T03:00:00.000Z',
    expiresAt: null,
    retention: 'permanent',
    viewUrl: 'https://pages.okibasho.example/p/nico/design-mock/',
    shareTag: 'bbbbbbbbbbb',
  },
  {
    slug: 'expired-sample',
    owner: 'nico@example.com',
    createdAt: '2026-01-01T03:00:00.000Z',
    expiresAt: '2026-01-31T12:00:00.000Z',
    retention: 'temporary',
    viewUrl: 'https://pages.okibasho.example/p/nico/expired-sample/',
    shareTag: 'ccccccccccc',
  },
];

/**
 * UploadOptions（チップ列）と PasswordToggle、ShareDialog を props だけで描画する
 * dev 専用ハーネス。Composer 本体は Cognito ログインが必要で開けないため、見た目と
 * ポップオーバーの位置を実機（agent-browser）で確認するのに使う。build には含まれない
 */
export function OptionsHarness() {
  const [retention, setRetention] = useState<Retention>('temporary');
  const [visibility, setVisibility] = useState<PageVisibility>('internal');
  const [withPassword, setWithPassword] = useState(false);
  const [passwordOn, setPasswordOn] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareIssued, setShareIssued] = useState(false);
  const [slug, setSlug] = useState(() => generateRandomSlug());
  const [slugOverwrite, setSlugOverwrite] = useState(false);
  const slugInputRef = useRef<HTMLInputElement>(null);

  return (
    <TooltipProvider>
      <main className="harness">
        <h1>オプションチップ ハーネス</h1>
        <p className="harness__note">
          Vite の serve 専用。本番 dist には含まれない。`_authed` の beforeLoad は通らない。
        </p>

        <h2>SlugField（公開URL）</h2>
        <p className="harness__note">
          slug を「q3-report」に変えると、一覧の既存ページと一致した状態 （再アップロードのラベルと
          × ）を再現できる。フォーカスして墨のリングが
          固定部分を囲わず入力だけに出ることも確認できる。
        </p>
        <div className="harness__stage">
          <SlugField
            inputRef={slugInputRef}
            value={slug}
            onChange={setSlug}
            invalid={isSlugInvalid(slug)}
            overwrite={slugOverwrite}
            disabled={false}
            hintable
            urlOrigin="https://pages.okibasho.example"
            userPath="/nico/"
            isReupload={slug.trim() === 'q3-report'}
            onResetToNew={() => {
              setSlug(generateRandomSlug());
              slugInputRef.current?.focus();
            }}
          />
          <label className="harness__row" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={slugOverwrite}
              onChange={(event) => setSlugOverwrite(event.target.checked)}
            />
            上書き確認中（url-input--overwrite）と併用したときの見た目を確認する
          </label>
        </div>

        <h2>UploadOptions（新規アップロード）</h2>
        <div className="harness__stage">
          <UploadOptions
            retention={retention}
            onRetentionChange={setRetention}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            locked={false}
            withPassword={withPassword}
            onPasswordToggle={() => setWithPassword((current) => !current)}
            disabled={false}
          />
        </div>

        <h2>UploadOptions（対象 slug が既に外部共有中）</h2>
        <div className="harness__stage">
          <UploadOptions
            retention={retention}
            onRetentionChange={setRetention}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            locked
            withPassword={withPassword}
            onPasswordToggle={() => setWithPassword((current) => !current)}
            disabled={false}
          />
        </div>

        <h2>PasswordToggle（単体）</h2>
        <div className="harness__stage">
          <PasswordToggle pressed={passwordOn} onToggle={() => setPasswordOn((v) => !v)} />
        </div>

        <h2>ShareDialog</h2>
        <fieldset>
          <legend>対象ページ</legend>
          <div className="harness__row">
            <button type="button" aria-pressed={!shareIssued} onClick={() => setShareIssued(false)}>
              未発行
            </button>
            <button type="button" aria-pressed={shareIssued} onClick={() => setShareIssued(true)}>
              発行済み（パスワードあり）
            </button>
          </div>
        </fieldset>
        <div className="harness__stage">
          <button type="button" onClick={() => setShareOpen(true)}>
            ShareDialog を開く
          </button>
        </div>
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          page={{
            slug: 'q3-report',
            expiresAt: '2026-10-15T12:00:00.000Z',
            shareTag: 'aaaaaaaaaaa',
            share: shareIssued
              ? { id: 'b'.repeat(22), password: 'k7mq-3xwp-9rtd-h2vn' }
              : undefined,
          }}
          pagesBaseUrl="https://pages.okibasho.example"
          onSave={async () => {
            /* ハーネスでは実際には保存しない */
          }}
        />

        <h2>アップロード済みページ（PagesList / PageRow）</h2>
        <p className="harness__note">
          実際の一覧と同じく `.page` の中に置く（`.page p` の margin が効いた状態で確かめるため）。
        </p>
        <div className="page" style={{ background: 'var(--well)', borderRadius: 'var(--radius)' }}>
          <section className="pages-section" aria-labelledby="uploaded-pages-heading">
            <h2 id="uploaded-pages-heading">アップロード済みページ</h2>
            <PagesList
              pages={MOCK_PAGES}
              highlightSlug={null}
              error={null}
              onReupload={() => {}}
              onRetentionChange={() => {}}
              onDelete={() => {}}
              onShare={() => {}}
            />
          </section>
        </div>
      </main>
    </TooltipProvider>
  );
}
