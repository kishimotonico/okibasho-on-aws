import { generateRandomSlug, isValidSlug } from '@cli/page';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';

import { useAuth } from '~/auth/auth-context';
import { UploadBoxIcon } from '~/components/UploadBoxIcon';
import { getWebConfig } from '~/config/env';
import {
  collectUploadFilesFromFileList,
  collectUploadFilesFromPathEntries,
  type UploadFileEntry,
} from '~/lib/collect-upload-files';
import { describeUploadSelection } from '~/lib/describe-upload-selection';
import { formatBytes } from '~/lib/format-bytes';
import { formatUploadError, type FormattedUploadError } from '~/lib/format-upload-error';
import {
  buildViewUrl,
  buildViewUrlPrefix,
  getPageMetadata,
  type Retention,
  uploadPage,
} from '~/lib/pages-s3';
import { collectFilesFromDataTransfer } from '~/lib/read-data-transfer';
import { createPagesS3Client } from '~/lib/s3-client';
import { validateUploadFiles } from '~/lib/validate-upload';

export interface UploadPanelHandle {
  /** 一覧の「再アップロード」から呼ばれ、フォームの slug を差し替える */
  setSlug: (slug: string) => void;
}

export type UploadedPageInfo = {
  slug: string;
  viewUrl: string;
  isReupload: boolean;
};

interface UploadPanelProps {
  initialSlug?: string;
  onUploaded: (info: UploadedPageInfo) => void;
}

type UploadPhase = 'idle' | 'uploading' | 'success' | 'error';

const DEFAULT_RETENTION: Retention = 'temporary';

export const UploadPanel = forwardRef<UploadPanelHandle, UploadPanelProps>(function UploadPanel(
  { initialSlug, onUploaded },
  ref,
) {
  const auth = useAuth();
  const config = useMemo(() => getWebConfig(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const [slug, setSlug] = useState(initialSlug ?? '');
  const [reuploadMode, setReuploadMode] = useState(Boolean(initialSlug));
  const [files, setFiles] = useState<UploadFileEntry[]>([]);
  const [skippedInvalidPath, setSkippedInvalidPath] = useState(0);
  const [retention, setRetention] = useState<Retention>(DEFAULT_RETENTION);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [uploadError, setUploadError] = useState<FormattedUploadError | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const urlPrefix = auth.email ? buildViewUrlPrefix(config.pagesBaseUrl, auth.email) : '';

  useImperativeHandle(
    ref,
    () => ({
      setSlug: (value: string) => {
        setSlug(value);
        setReuploadMode(true);
        setPhase('idle');
        setViewUrl(null);
        setCopyMessage(null);
        setValidationErrors([]);
        setUploadError(null);
      },
    }),
    [],
  );

  const applyCollectedFiles = useCallback(
    (result: ReturnType<typeof collectUploadFilesFromFileList>) => {
      if (result.singleFileNotHtml) {
        setSelectionError('単一ファイル選択では HTML ファイルのみアップロードできます');
        setFiles([]);
        setSkippedInvalidPath(0);
        setPhase('error');
        return;
      }

      setSelectionError(null);
      setFiles(result.files);
      setSkippedInvalidPath(result.skippedInvalidPath);
      setValidationErrors([]);
      setUploadError(null);
      setPhase('idle');
      setViewUrl(null);
      setCopyMessage(null);
    },
    [],
  );

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    applyCollectedFiles(collectUploadFilesFromFileList(selected));
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const entries = await collectFilesFromDataTransfer(event.dataTransfer);
    applyCollectedFiles(collectUploadFilesFromPathEntries(entries));
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setIsDragging(false);
  };

  const handleSubmit = async () => {
    if (phase === 'uploading') {
      return;
    }

    const trimmedSlug = slug.trim();
    const targetSlug = trimmedSlug || generateRandomSlug();
    const errors = validateUploadFiles(files).map((error) => error.message);

    if (trimmedSlug && !isValidSlug(trimmedSlug)) {
      errors.push('slug は小文字英数字・ハイフン・アンダースコアのみ使用できます');
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      setPhase('error');
      return;
    }

    if (!auth.idToken || !auth.email) {
      setValidationErrors(['ログインが必要です']);
      setPhase('error');
      return;
    }

    setValidationErrors([]);
    setUploadError(null);
    setPhase('uploading');
    setProgress({ completed: 0, total: files.length + 1 });

    try {
      const client = createPagesS3Client(config, auth.idToken);
      const existingMetadata = await getPageMetadata(
        client,
        config.pagesBucket,
        auth.email,
        targetSlug,
      );

      if (
        existingMetadata &&
        !window.confirm(`「${targetSlug}」は既存のページです。内容を上書きしますか？`)
      ) {
        setPhase('idle');
        return;
      }

      await uploadPage(
        client,
        config.pagesBucket,
        auth.email,
        targetSlug,
        files,
        {
          retention,
          existingMetadata,
        },
        (completed, total) => setProgress({ completed, total }),
      );

      const nextViewUrl = buildViewUrl(config.pagesBaseUrl, auth.email, targetSlug);
      setFiles([]);
      setSkippedInvalidPath(0);
      if (!reuploadMode) {
        setSlug('');
      }
      setViewUrl(nextViewUrl);
      setPhase('success');
      onUploaded({
        slug: targetSlug,
        viewUrl: nextViewUrl,
        isReupload: Boolean(existingMetadata),
      });
    } catch (error) {
      setPhase('error');
      setUploadError(formatUploadError(error));
    }
  };

  const handleCopyUrl = async () => {
    if (!viewUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(viewUrl);
      setCopyMessage('コピーしました');
    } catch {
      setCopyMessage('コピーに失敗しました');
    }
  };

  const remappedOriginalName =
    files.length === 1 && files[0]!.path === 'index.html' && files[0]!.file.name !== 'index.html'
      ? files[0]!.file.name
      : null;

  const busy = phase === 'uploading';

  return (
    <div className="upload-panel">
      {reuploadMode ? (
        <p className="reupload-note">
          ページ <code>{slug}</code> の内容を差し替えます。保存期間は変わりません。
        </p>
      ) : null}

      <div
        className={`composer${isDragging ? ' composer--active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDragLeave={handleDragLeave}
        onDrop={(event) => void handleDrop(event)}
      >
        <div className="composer-drop">
          <UploadBoxIcon phase={phase} dragging={isDragging} size={96} />
          <p className="composer-brand">okibasho</p>
          <p className="composer-lead">
            {files.length > 0 ? (
              describeUploadSelection(files)
            ) : (
              <>
                <span className="composer-lead__drop">ファイルまたはフォルダをドロップ</span>
                <span className="composer-lead__pick">ファイルまたはフォルダを選択</span>
              </>
            )}
          </p>
          {files.length > 0 ? (
            <ul className="file-list">
              {files.map((file) => (
                <li key={file.path} className="file-chip">
                  {file.path}
                  <span>{formatBytes(file.file.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="composer-actions">
            <button
              type="button"
              className="button button--ghost"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              ファイルを選択
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy}
              onClick={() => directoryInputRef.current?.click()}
            >
              フォルダを選択
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFileInputChange}
          />
          <input
            ref={directoryInputRef}
            type="file"
            multiple
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            // @ts-expect-error webkitdirectory は非標準属性
            webkitdirectory=""
            onChange={handleFileInputChange}
          />
        </div>

        {remappedOriginalName ? (
          <p className="message">
            共有ページでは index.html として保存されます（元: {remappedOriginalName}）
          </p>
        ) : null}

        {selectionError ? <p className="message message--error">{selectionError}</p> : null}
        {skippedInvalidPath > 0 ? (
          <p className="message message--warning">
            無効なパスのため {skippedInvalidPath} 件をスキップしました（dotfile など）
          </p>
        ) : null}

        <div className="composer-settings">
          <div className="url-field">
            <label className="field-label" htmlFor="public-url-slug">
              公開URL
            </label>
            <div className="url-input">
              {urlPrefix ? (
                <span className="url-input__prefix" id="public-url-prefix" title={urlPrefix}>
                  {urlPrefix}
                </span>
              ) : null}
              <input
                id="public-url-slug"
                type="text"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="my-page"
                readOnly={reuploadMode}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={
                  urlPrefix ? 'public-url-hint public-url-prefix' : 'public-url-hint'
                }
              />
            </div>
            <p className="field-hint" id="public-url-hint">
              {reuploadMode
                ? '再アップロードでは URL は変わりません。'
                : '空欄なら自動生成します。小文字英数字・ハイフン・アンダースコア、最大 64 文字です。'}
            </p>
          </div>

          {reuploadMode ? null : (
            <div className="retention-field">
              <span className="field-label" id="retention-label">
                保存期間
              </span>
              <div className="seg" role="group" aria-labelledby="retention-label">
                <button
                  type="button"
                  className={retention === 'temporary' ? 'on' : undefined}
                  aria-pressed={retention === 'temporary'}
                  disabled={busy}
                  onClick={() => setRetention('temporary')}
                >
                  30日
                </button>
                <button
                  type="button"
                  className={retention === 'permanent' ? 'on' : undefined}
                  aria-pressed={retention === 'permanent'}
                  disabled={busy}
                  onClick={() => setRetention('permanent')}
                >
                  無期限
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="button composer-submit"
            disabled={files.length === 0}
            aria-busy={busy}
            onClick={() => {
              if (busy) {
                return;
              }
              void handleSubmit();
            }}
          >
            {busy
              ? `アップロード中… ${progress.completed}/${progress.total}`
              : reuploadMode
                ? '再アップロード'
                : 'アップロード'}
          </button>
        </div>

        {validationErrors.length > 0 ? (
          <div className="message message--error">
            <p>送信前の検証エラー:</p>
            <ul>
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {uploadError ? (
          <div className="message message--error">
            <p>{uploadError.message}</p>
            {uploadError.detail ? <p className="message__detail">{uploadError.detail}</p> : null}
          </div>
        ) : null}

        {phase === 'success' && viewUrl ? (
          <div className="upload-result" role="status">
            <p className="upload-result__title">アップロードしました</p>
            <a className="upload-result__url" href={viewUrl}>
              {viewUrl}
            </a>
            {copyMessage ? <p className="copy-feedback">{copyMessage}</p> : null}
            <div className="upload-result__actions">
              <button
                type="button"
                className="button button--copy"
                onClick={() => void handleCopyUrl()}
              >
                URLをコピー
              </button>
              <a
                className="button button--ghost"
                href={viewUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="ページを開く"
              >
                開く
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
