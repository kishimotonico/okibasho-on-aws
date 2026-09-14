import type { Retention } from '@okibasho/core';
import { EllipsisVertical, Globe, GlobeLock, SquareArrowOutUpRight } from 'lucide-react';
import { useRef } from 'react';

import { CopyButton } from '~/components/CopyButton';
import { Menu, MenuItem } from '~/components/Menu';
import { Tooltip } from '~/components/Tooltip';
import { getExpirationStatus } from '~/lib/expiration-status';
import type { ListedPage } from '~/lib/listed-page';
import { messages } from '~/lib/messages';

interface PageRowProps {
  page: ListedPage;
  highlighted: boolean;
  onReupload: (page: ListedPage) => void;
  onRetentionChange: (page: ListedPage, retention: Retention) => void;
  onDelete: (page: ListedPage) => void;
  onShare: (page: ListedPage) => void;
  /** コピーの失敗/成功を一覧の共通エラー表示へ伝える */
  onCopyError?: () => void;
  onCopySuccess?: () => void;
}

/** 一覧の1行。表示だけを受け持ち、操作はすべてコールバックで上へ渡す */
export function PageRow({
  page,
  highlighted,
  onReupload,
  onRetentionChange,
  onDelete,
  onShare,
  onCopyError,
  onCopySuccess,
}: PageRowProps) {
  // 「再アップロード」を選んだかどうか。メニューが閉じたあとに知る必要があるので ref で持つ
  const reuploadSelectedRef = useRef(false);

  const expiration = getExpirationStatus(page.expiresAt);
  const rowClass = [
    'page-row',
    expiration.kind === 'expired' ? 'page-row--expired' : '',
    highlighted ? 'page-row--highlight' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={rowClass} data-highlighted={highlighted ? 'true' : undefined}>
      <div className="page-row__info">
        <div className="page-row__title">
          <h3>{page.slug}</h3>
          {page.share ? (
            <Tooltip
              label={page.share.password ? messages.shareActive : messages.shareActiveNoPassword}
            >
              <button
                type="button"
                className="page-row__share-button"
                aria-label={
                  page.share.password ? messages.shareActive : messages.shareActiveNoPassword
                }
                onClick={() => onShare(page)}
              >
                {page.share.password ? (
                  <GlobeLock size={13} strokeWidth={1.75} aria-hidden />
                ) : (
                  <Globe size={13} strokeWidth={1.75} aria-hidden />
                )}
              </button>
            </Tooltip>
          ) : null}
        </div>
        <p className="page-row__url" title={page.viewUrl}>
          {/*
           * 長い URL は先頭側を省略し、slug 側（末尾）を見せる。UrlField と同じ扱い:
           * 外側を direction: rtl にし、中身は dir="ltr" + unicode-bidi: isolate で
           * 独立した LTR ランにして文字順と末尾の `/` がずれないようにする
           */}
          <span className="page-row__url-text" dir="ltr">
            {page.viewUrl}
          </span>
        </p>
        <p
          className={
            expiration.kind === 'expired'
              ? 'page-row__meta page-row__meta--expired'
              : 'page-row__meta'
          }
        >
          {expiration.label}
        </p>
      </div>
      <div className="page-row__actions">
        <Tooltip label={messages.openPage}>
          <a
            className="icon-button"
            href={page.viewUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={messages.openPage}
          >
            <SquareArrowOutUpRight size={16} strokeWidth={1.75} aria-hidden />
          </a>
        </Tooltip>
        <CopyButton
          value={page.viewUrl}
          variant="icon"
          onError={onCopyError}
          onCopied={onCopySuccess}
        />
        <Menu
          label={messages.rowActions(page.slug)}
          tooltip={messages.moreActions}
          trigger={<EllipsisVertical size={16} strokeWidth={1.75} aria-hidden />}
          onCloseAutoFocus={(event) => {
            if (!reuploadSelectedRef.current) {
              return;
            }
            reuploadSelectedRef.current = false;
            // 再アップロードはフォームの slug 入力へフォーカスを移す。
            // メニューが開いている間はフォーカストラップに引き戻されるので、
            // 閉じきったこの瞬間に伝える。トリガーへの復帰は止める
            event.preventDefault();
            onReupload(page);
          }}
        >
          <MenuItem
            onSelect={() => {
              reuploadSelectedRef.current = true;
            }}
          >
            {messages.reupload}
          </MenuItem>
          {page.retention === 'temporary' ? (
            <MenuItem onSelect={() => onRetentionChange(page, 'permanent')}>
              {messages.toPermanent}
            </MenuItem>
          ) : (
            <MenuItem onSelect={() => onRetentionChange(page, 'temporary')}>
              {messages.toTemporary}
            </MenuItem>
          )}
          <MenuItem onSelect={() => onShare(page)}>{messages.share}</MenuItem>
          <MenuItem danger onSelect={() => onDelete(page)}>
            {messages.remove}
          </MenuItem>
        </Menu>
      </div>
    </li>
  );
}
