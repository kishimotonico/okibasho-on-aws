import { CopyButton } from '~/components/CopyButton';

interface UrlFieldProps {
  /** 表示・コピー対象の URL（新しいタブで開くリンクとして表示） */
  url: string;
  /** フィールドラベル。省略時は表示しない */
  label?: string;
  /** ラベルを視覚的に隠す（意味は保つ） */
  hideLabel?: boolean;
  onCopyError?: () => void;
  onCopySuccess?: () => void;
}

/**
 * URL とコピーをひとつの枠に統合した表示部品。
 * `.url-input` と同じ枠（罫・角丸・背景）を使い、内側に新しいタブで開くリンクと
 * 一体化したコピーのアイコンボタンを置く。長い URL は末尾（slug / share-id 側）が
 * 見えるよう先頭側を省略する。
 */
export function UrlField({
  url,
  label,
  hideLabel = false,
  onCopyError,
  onCopySuccess,
}: UrlFieldProps) {
  return (
    <div className="url-field">
      {label ? (
        <span className={hideLabel ? 'field-label visually-hidden' : 'field-label'}>{label}</span>
      ) : null}
      <div className="url-display">
        <a className="url-display__link" href={url} target="_blank" rel="noreferrer" title={url}>
          {/*
           * リンク本体は先頭省略のため direction: rtl。中身は dir="ltr" +
           * unicode-bidi: isolate で独立した LTR ランにし、文字順と末尾の
           * `/` がずれないようにする。
           */}
          <span className="url-display__text" dir="ltr">
            {url}
          </span>
        </a>
        <CopyButton value={url} variant="icon" onError={onCopyError} onCopied={onCopySuccess} />
      </div>
    </div>
  );
}
