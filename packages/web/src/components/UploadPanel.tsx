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
import { getWebConfig } from '~/config/env';
import {
  collectUploadFilesFromFileList,
  collectUploadFilesFromPathEntries,
  type UploadFileEntry,
} from '~/lib/collect-upload-files';
import { formatBytes } from '~/lib/format-bytes';
import { buildViewUrl, getPageMetadata, type Retention, uploadPage } from '~/lib/pages-s3';
import { collectFilesFromDataTransfer } from '~/lib/read-data-transfer';
import { createPagesS3Client } from '~/lib/s3-client';
import { validateUploadFiles } from '~/lib/validate-upload';

export interface UploadPanelHandle {
  /** My Pages 一覧の「再アップロード」から呼ばれ、フォームの slug を差し替える */
  setSlug: (slug: string) => void;
}

interface UploadPanelProps {
  initialSlug?: string;
  onUploaded: () => void;
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [slugDetailsOpen, setSlugDetailsOpen] = useState(Boolean(initialSlug));

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
        setSlugDetailsOpen(true);
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

  const handleSubmit = async () => {
    const trimmedSlug = slug.trim();
    const targetSlug = trimmedSlug || generateRandomSlug();
    const errors = validateUploadFiles(files).map((error) => error.message);

    if (trimmedSlug && !isValidSlug(trimmedSlug)) {
      errors.push('slug は小文字英数字・ハイフン・アンダースコアのみ使用できます');
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    if (!auth.idToken || !auth.email) {
      setValidationErrors(['ログインが必要です']);
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

      setSlug(targetSlug);
      setViewUrl(buildViewUrl(config.pagesBaseUrl, auth.email, targetSlug));
      setPhase('success');
      onUploaded();
    } catch (error) {
      setPhase('error');
      setUploadError(error instanceof Error ? error.message : 'アップロードに失敗しました');
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
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => void handleDrop(event)}
      >
        <p>
          {files.length > 0
            ? `${files.length} 件を置いています`
            : 'ファイルまたはディレクトリをドロップ'}
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
            onClick={() => fileInputRef.current?.click()}
          >
            ファイルを選択
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => directoryInputRef.current?.click()}
          >
            ディレクトリを選択
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="visually-hidden"
          onChange={handleFileInputChange}
        />
        <input
          ref={directoryInputRef}
          type="file"
          multiple
          className="visually-hidden"
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

      <details
        className="field--details"
        open={slugDetailsOpen}
        onToggle={(event) => setSlugDetailsOpen(event.currentTarget.open)}
      >
        <summary>URL を指定する（任意）</summary>
        <label className="field">
          <span className="visually-hidden">slug</span>
          <input
            type="text"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="例: q3-report"
            readOnly={reuploadMode}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="field-hint">
          {reuploadMode
            ? '再アップロードでは URL は変わりません。'
            : '空欄なら自動生成します。小文字英数字・ハイフン・アンダースコア、最大 64 文字です。'}
        </p>
      </details>

      <div className="toolbar">
        {reuploadMode ? null : (
          <div className="seg" role="group" aria-label="保存期間">
            <button
              type="button"
              className={retention === 'temporary' ? 'on' : undefined}
              aria-pressed={retention === 'temporary'}
              onClick={() => setRetention('temporary')}
            >
              30日
            </button>
            <button
              type="button"
              className={retention === 'permanent' ? 'on' : undefined}
              aria-pressed={retention === 'permanent'}
              onClick={() => setRetention('permanent')}
            >
              無期限
            </button>
          </div>
        )}
        <button
          type="button"
          className="button"
          disabled={files.length === 0 || phase === 'uploading'}
          onClick={() => void handleSubmit()}
        >
          {reuploadMode ? '再アップロード' : 'アップロード'}
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

      {phase === 'uploading' ? (
        <p className="message">
          アップロード中: {progress.completed} / {progress.total}
        </p>
      ) : null}

      {uploadError ? <pre className="message message--error">{uploadError}</pre> : null}

      {phase === 'success' && viewUrl ? (
        <article className="unfurl">
          <h3>{slug || 'アップロード完了'}</h3>
          <a className="url" href={viewUrl}>
            {viewUrl}
          </a>
          {copyMessage ? <p className="copy-feedback">{copyMessage}</p> : null}
          <div>
            <button
              type="button"
              className="button button--copy"
              onClick={() => void handleCopyUrl()}
            >
              URL をコピー
            </button>
          </div>
        </article>
      ) : null}
    </div>
  );
});
