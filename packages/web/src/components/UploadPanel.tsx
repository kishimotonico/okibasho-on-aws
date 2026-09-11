import { isValidSlug } from '@cli/page';
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

  useImperativeHandle(
    ref,
    () => ({
      setSlug: (value: string) => {
        setSlug(value);
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
    const targetSlug = slug.trim();
    const errors = validateUploadFiles(files).map((error) => error.message);

    if (!targetSlug) {
      errors.push('slug を入力してください');
    } else if (!isValidSlug(targetSlug)) {
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

  return (
    <div className="upload-page">
      <div
        className={`drop-zone${isDragging ? ' drop-zone--active' : ''}`}
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
        <p>ファイルまたはディレクトリをドラッグ &amp; ドロップ</p>
        <div className="button-row">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            ファイルを選択
          </button>
          <button
            type="button"
            className="button button--secondary"
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

      {selectionError ? <p className="message message--error">{selectionError}</p> : null}
      {skippedInvalidPath > 0 ? (
        <p className="message message--warning">
          無効なパスのため {skippedInvalidPath} 件をスキップしました（dotfile など）
        </p>
      ) : null}

      {files.length > 0 ? (
        <section className="panel">
          <h2>選択中のファイル ({files.length} 件)</h2>
          <ul className="file-list">
            {files.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code> ({file.file.size.toLocaleString()} bytes)
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <label className="field">
          <span className="field-label">slug</span>
          <input
            type="text"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="例: q3-report"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <fieldset className="field">
          <legend className="field-label">保存期間</legend>
          <label className="radio">
            <input
              type="radio"
              name="retention"
              value="temporary"
              checked={retention === 'temporary'}
              onChange={() => setRetention('temporary')}
            />
            30日
          </label>
          <label className="radio">
            <input
              type="radio"
              name="retention"
              value="permanent"
              checked={retention === 'permanent'}
              onChange={() => setRetention('permanent')}
            />
            無期限
          </label>
        </fieldset>
      </section>

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
        <section className="panel panel--success">
          <h2>アップロード完了</h2>
          <p>
            閲覧 URL: <a href={viewUrl}>{viewUrl}</a>
          </p>
          <button type="button" className="button" onClick={() => void handleCopyUrl()}>
            URL をコピー
          </button>
          {copyMessage ? <p className="message">{copyMessage}</p> : null}
        </section>
      ) : null}

      <button
        type="button"
        className="button"
        disabled={files.length === 0 || phase === 'uploading'}
        onClick={() => void handleSubmit()}
      >
        アップロード
      </button>
    </div>
  );
});
