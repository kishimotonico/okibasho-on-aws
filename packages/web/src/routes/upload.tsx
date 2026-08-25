import { createFileRoute } from '@tanstack/react-router';
import {
  DEFAULT_RETENTION,
  DEFAULT_VISIBILITY,
  isValidSlug,
  type Retention,
  type Visibility,
} from '@page-share/shared';
import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { useAuth } from '~/auth/auth-context';
import { getWebConfig } from '~/config/env';
import { extractApiErrorMessages } from '~/lib/api-errors';
import {
  collectUploadFilesFromFileList,
  collectUploadFilesFromPathEntries,
  type UploadFileEntry,
} from '~/lib/collect-upload-files';
import { extractTitleFromHtml } from '~/lib/extract-title-from-html';
import { collectFilesFromDataTransfer } from '~/lib/read-data-transfer';
import {
  completePage,
  createPage,
  redeclarePage,
  uploadFilesWithConcurrency,
} from '~/lib/upload-client';
import { validateRedeclareRequest, validateUploadRequest } from '~/lib/validate-upload';

export const Route = createFileRoute('/upload')({
  validateSearch: (search: Record<string, unknown>): { slug?: string } => ({
    slug:
      typeof search.slug === 'string' && isValidSlug(search.slug) ? search.slug : undefined,
  }),
  component: UploadPage,
});

type UploadPhase = 'idle' | 'uploading' | 'success' | 'error';

function visibilityLabel(visibility: Visibility): string {
  return visibility === 'internal' ? '社内限定' : 'URL共有';
}

function UploadPage() {
  const auth = useAuth();
  const { slug: reuploadSlug } = Route.useSearch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadFileEntry[]>([]);
  const [skippedInvalidPath, setSkippedInvalidPath] = useState(0);
  const [title, setTitle] = useState('');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [retention, setRetention] = useState<Retention>(DEFAULT_RETENTION);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const seedTitleFromFiles = useCallback(async (nextFiles: UploadFileEntry[]) => {
    const indexFile = nextFiles.find((file) => file.path === 'index.html');
    if (!indexFile) {
      return;
    }

    const extracted = await extractTitleFromHtml(indexFile.file);
    if (extracted) {
      setTitle(extracted);
    }
  }, []);

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

      if (!titleManuallyEdited) {
        void seedTitleFromFiles(result.files);
      }
    },
    [seedTitleFromFiles, titleManuallyEdited],
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
    const declaredFiles = files.map((file) => ({ path: file.path, size: file.file.size }));
    const errors = reuploadSlug
      ? validateRedeclareRequest(files).map((error) => error.message)
      : validateUploadRequest(files, { title, visibility, retention }).map((error) => error.message);

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    if (!reuploadSlug && visibility === 'shared') {
      if (
        !window.confirm(
          'URLを知っている人なら誰でも閲覧できます。本当に「URL共有」で公開しますか？',
        )
      ) {
        return;
      }
    }

    if (!auth.idToken) {
      setValidationErrors(['ログインが必要です']);
      return;
    }

    setValidationErrors([]);
    setUploadError(null);
    setPhase('uploading');
    setProgress({ completed: 0, total: files.length });

    const declareResult = reuploadSlug
      ? await redeclarePage(fetch, getWebConfig().apiBaseUrl, auth.idToken, reuploadSlug, {
          files: declaredFiles,
        })
      : await createPage(fetch, getWebConfig().apiBaseUrl, auth.idToken, {
          title: title.trim() || undefined,
          visibility,
          retention,
          files: declaredFiles,
        });

    if (!declareResult.ok) {
      setPhase('error');
      setUploadError(extractApiErrorMessages(declareResult.body).join('\n'));
      return;
    }

    const uploads = declareResult.body.uploads.map((upload) => {
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
          'もう一度最初からやり直してください。',
      );
      return;
    }

    const completeResult = await completePage(
      fetch,
      getWebConfig().apiBaseUrl,
      auth.idToken,
      declareResult.body.slug,
      {
        versionId: declareResult.body.versionId,
        files: declaredFiles,
        ...(reuploadSlug ? {} : { title: title.trim() }),
      },
    );

    if (!completeResult.ok) {
      setPhase('error');
      setUploadError(extractApiErrorMessages(completeResult.body).join('\n'));
      return;
    }

    setViewUrl(completeResult.body.viewUrl);
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
        <h1>{reuploadSlug ? '再アップロード' : 'アップロード'}</h1>
        <p>アップロードするにはログインが必要です。</p>
        <button type="button" className="button" onClick={() => void auth.login('/upload')}>
          ログイン
        </button>
      </div>
    );
  }

  return (
    <div className="page upload-page">
      <h1>{reuploadSlug ? '再アップロード' : 'アップロード'}</h1>
      {reuploadSlug ? (
        <p>
          ページ <code>{reuploadSlug}</code> の内容を差し替えます。公開範囲とタイトルは変わりません。
        </p>
      ) : null}

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

      {!reuploadSlug ? (
        <section className="panel">
          <label className="field">
            <span className="field-label">タイトル</span>
            <input
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleManuallyEdited(true);
              }}
              placeholder="空欄なら無題"
              autoComplete="off"
            />
          </label>

          <fieldset className="field">
            <legend className="field-label">公開範囲</legend>
            <label className="radio">
              <input
                type="radio"
                name="visibility"
                value="internal"
                checked={visibility === 'internal'}
                onChange={() => setVisibility('internal')}
              />
              {visibilityLabel('internal')}
            </label>
            <label className="radio">
              <input
                type="radio"
                name="visibility"
                value="shared"
                checked={visibility === 'shared'}
                onChange={() => setVisibility('shared')}
              />
              {visibilityLabel('shared')}
            </label>
          </fieldset>

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
      ) : null}

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
          <h2>{reuploadSlug ? '再アップロード完了' : 'アップロード完了'}</h2>
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
        {reuploadSlug ? '再アップロード' : 'アップロード'}
      </button>
    </div>
  );
}

