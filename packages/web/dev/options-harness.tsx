import type { Retention } from '@okibasho/core';
import { useState } from 'react';

import { PasswordToggle } from '~/components/PasswordToggle';
import { ShareDialog } from '~/components/ShareDialog';
import { TooltipProvider } from '~/components/Tooltip';
import { UploadOptions, type PageVisibility } from '~/components/UploadOptions';

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

  return (
    <TooltipProvider>
      <main className="harness">
        <h1>オプションチップ ハーネス</h1>
        <p className="harness__note">
          Vite の serve 専用。本番 dist には含まれない。AuthGate は通らない。
        </p>

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
      </main>
    </TooltipProvider>
  );
}
