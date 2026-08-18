import { createFileRoute } from '@tanstack/react-router';
import { DEFAULT_RETENTION, isValidSlug, type Retention } from '@page-share/shared';
import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { useAuth } from '~/auth/auth-context';
import { getWebConfig } from '~/config/env';
import { extractApiErrorMessages } from '~/lib/api-errors';
import {
  collectUploadFilesFromFileList,
  collectUploadFilesFromPathEntries,
  type UploadFileEntry,
} from '~/lib/collect-upload-files';
import { collectFilesFromDataTransfer } from '~/lib/read-data-transfer';
import { createPage, uploadFilesWithConcurrency } from '~/lib/upload-client';
import { validateUploadRequest } from '~/lib/validate-upload';

export const Route = createFileRoute('/upload')({
  component: UploadPage,
});

type UploadPhase = 'idle' | 'uploading' | 'success' | 'error';

function UploadPage() {
  const auth = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadFileEntry[]>([]);
  const [skippedInvalidPath, setSkippedInvalidPath] = useState(0);
  const [slug, setSlug] = useState('');
  const [retention, setRetention] = useState<Retention>(DEFAULT_RETENTION);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const slugError = useMemo(() => {
    if (!slug.trim()) {
      return null;
    }
    if (!isValidSlug(slug.trim())) {
      return 'slug は英小文字・数字・ハイフンのみ、先頭は英数字、1〜64文字で指定してください';
    }
    return null;
  }, [slug]);

  const applyCollectedFiles = useCallback(
    (result: ReturnType<typeof collectUploadFilesFromFileList>) => {
      if (result.singleFileNotHtml) {
        setSelectionError('単一ファイルをアップロードする場合は .html / .htm を指定してください');
        setFiles([]);
        setSkippedInvalidPath(0);
        return;
      }

      setSelectionError(null);
      setFiles(result.files);
      setSkippedInvalidPath(result.skippedInvalidPath);
      setValidationErrors([]);
      setUploadError(null);
      setViewUrl(null);
      setPhase('idle');
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
    const errors = validateUploadRequest(files, slug, retention).map((error) => error.message);
    if (slugError) {
      errors.unshift(slugError);
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    if (!auth.idToken) {
      setValidationErrors(['ログインが必要です']);
      return;
    }

    setValidationErrors([]);
    setUploadError(null);
    setPhase('uploading');
    setProgress({ completed: 0, total: files.length });

    const request = {
      ...(slug.trim() ? { slug: slug.trim() } : {}),
      retention,
      files: files.map((file) => ({ path: file.path, size: file.file.size })),
    };

    const createResult = await createPage(fetch, getWebConfig().apiBaseUrl, auth.idToken, request);
    if (!createResult.ok) {
      setPhase('error');
      setUploadError(extractApiErrorMessages(createResult.body).join('\n'));
      return;
    }

    const uploads = createResult.body.uploads.map((upload) => {
      const file = files.find((entry) => entry.path === upload.path);
      if (!file) {
        throw new Error(`アップロード対象が見つかりません: ${upload.path}`);
      }
      return {
        path: upload.path,
        url: upload.url,
        headers: upload.headers,
        file: file.file,
      };
    });

    const failure = await uploadFilesWithConcurrency(fetch, uploads, {
      onProgress: setProgress,
    });

    if (failure) {
      setPhase('error');
      setUploadError(
        `${failure.path} のアップロードに失敗しました (${failure.error.status} ${failure.error.statusText})。\n` +
          '同じ名前では再実行できないため、別の slug でやり直してください。',
      );
      return;
    }

    setViewUrl(createResult.body.viewUrl);
    setPhase('success');
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

  if (auth.isLoading) {
    return (
      <div className="page">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="page">
        <h1>アップロード</h1>
        <p>アップロードするにはログインが必要です。</p>
        <button type="button" className="button" onClick={() => void auth.login('/upload')}>
          ログイン
        </button>
      </div>
    );
  }

  return (
    <div className="page upload-page">
      <h1>アップロード</h1>

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
          <span className="field-label">slug（任意）</span>
          <input
            type="text"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="空欄なら自動生成"
            autoComplete="off"
          />
        </label>
        {slugError ? <p className="message message--error">{slugError}</p> : null}

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
}
