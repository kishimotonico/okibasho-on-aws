import { emailLocalPart, generateRandomSlug, isValidSlug, type PageMetadata } from '@cli/page';
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
import { BoxBubble } from '~/components/BoxBubble';
import { UploadBoxIcon } from '~/components/UploadBoxIcon';
import { getWebConfig } from '~/config/env';
import {
  collectUploadFilesFromFileList,
  collectUploadFilesFromPathEntries,
  type UploadFileEntry,
} from '~/lib/collect-upload-files';
import { formatUploadError } from '~/lib/format-upload-error';
import {
  buildViewUrl,
  deletePage,
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
  onDeleted?: (slug: string) => void;
}

type UploadPhase = 'idle' | 'uploading' | 'success' | 'error';

type BubbleState =
  { kind: 'error'; message: string } | { kind: 'confirm'; message: string; targetSlug: string };

const DEFAULT_RETENTION: Retention = 'temporary';
const INVALID_SLUG_MESSAGE = 'slug は小文字英数字とハイフン、アンダースコアだけです';

function validationBubbleMessage(errors: readonly { code: string; message: string }[]): string {
  const missingIndex = errors.find((error) => error.code === 'missing_index_html');
  if (missingIndex) {
    return missingIndex.message;
  }
  return errors[0]?.message ?? '送れませんでした。もう一度どうぞ。';
}

export const UploadPanel = forwardRef<UploadPanelHandle, UploadPanelProps>(function UploadPanel(
  { initialSlug, onUploaded, onDeleted },
  ref,
) {
  const auth = useAuth();
  const config = useMemo(() => getWebConfig(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const lockedRef = useRef(false);

  const [slug, setSlug] = useState(() => initialSlug ?? generateRandomSlug());
  const [reuploadMode, setReuploadMode] = useState(Boolean(initialSlug));
  const [retention, setRetention] = useState<Retention>(DEFAULT_RETENTION);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    files: UploadFileEntry[];
    targetSlug: string;
    existingMetadata: PageMetadata;
  } | null>(null);
  const [highlightSlug, setHighlightSlug] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ slug: string; viewUrl: string } | null>(
    null,
  );
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const urlOrigin = config.pagesBaseUrl.replace(/\/$/, '');
  const userPath = auth.email ? `/${emailLocalPart(auth.email)}/` : '';
  const urlPrefix = auth.email ? `${urlOrigin}${userPath}` : '';
  const slugAriaLabel = urlPrefix ? `公開URL ${urlPrefix}${slug}` : '公開URL';

  const dismissBubble = useCallback(() => {
    setBubble(null);
    setPendingOverwrite(null);
    setHighlightSlug(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setSlug: (value: string) => {
        setSlug(value);
        setReuploadMode(true);
        setPhase('idle');
        setSuccessResult(null);
        setCopyMessage(null);
        dismissBubble();
      },
    }),
    [dismissBubble],
  );

  const showError = useCallback((message: string) => {
    lockedRef.current = false;
    setBubble({ kind: 'error', message });
    setPhase('error');
    setSuccessResult(null);
    setCopyMessage(null);
  }, []);

  const executeUpload = useCallback(
    async (
      files: UploadFileEntry[],
      targetSlug: string,
      existingMetadata?: PageMetadata | null,
    ) => {
      if (!auth.idToken || !auth.email) {
        showError('ログインが必要です');
        return;
      }

      setHighlightSlug(targetSlug);
      setPhase('uploading');
      setProgress({ completed: 0, total: files.length });

      try {
        const client = createPagesS3Client(config, auth.idToken);
        const metadata =
          existingMetadata ??
          (reuploadMode
            ? await getPageMetadata(client, config.pagesBucket, auth.email, targetSlug)
            : null);

        await uploadPage(
          client,
          config.pagesBucket,
          auth.email,
          targetSlug,
          files,
          {
            retention,
            existingMetadata: metadata,
          },
          (completed, total) => setProgress({ completed, total }),
        );

        const nextViewUrl = buildViewUrl(config.pagesBaseUrl, auth.email, targetSlug);
        if (!reuploadMode) {
          setSlug(generateRandomSlug());
        }
        setSuccessResult({ slug: targetSlug, viewUrl: nextViewUrl });
        setPhase('success');
        onUploaded({
          slug: targetSlug,
          viewUrl: nextViewUrl,
          isReupload: Boolean(metadata),
        });
      } catch (error) {
        showError(formatUploadError(error).message);
      } finally {
        lockedRef.current = false;
        setHighlightSlug(null);
        setPendingOverwrite(null);
      }
    },
    [auth.email, auth.idToken, config, onUploaded, reuploadMode, retention, showError],
  );

  const beginUpload = useCallback(
    async (files: UploadFileEntry[]) => {
      if (lockedRef.current || phase === 'uploading') {
        return;
      }
      lockedRef.current = true;

      dismissBubble();
      setSuccessResult(null);
      setCopyMessage(null);

      const validationErrors = validateUploadFiles(files);
      if (validationErrors.length > 0) {
        showError(validationBubbleMessage(validationErrors));
        return;
      }

      let targetSlug = slug.trim();
      if (!targetSlug) {
        targetSlug = generateRandomSlug();
        setSlug(targetSlug);
      }

      if (!isValidSlug(targetSlug)) {
        showError(INVALID_SLUG_MESSAGE);
        return;
      }

      if (!auth.idToken || !auth.email) {
        showError('ログインが必要です');
        return;
      }

      if (reuploadMode) {
        await executeUpload(files, targetSlug);
        return;
      }

      try {
        const client = createPagesS3Client(config, auth.idToken);
        const existingMetadata = await getPageMetadata(
          client,
          config.pagesBucket,
          auth.email,
          targetSlug,
        );

        if (existingMetadata) {
          setPhase('idle');
          setPendingOverwrite({ files, targetSlug, existingMetadata });
          setHighlightSlug(targetSlug);
          setBubble({
            kind: 'confirm',
            message: `${targetSlug} はもうあるよ。差し替える？ 保存期間はそのまま`,
            targetSlug,
          });
          return;
        }

        await executeUpload(files, targetSlug);
      } catch (error) {
        showError(formatUploadError(error).message);
      }
    },
    [
      auth.email,
      auth.idToken,
      config,
      dismissBubble,
      executeUpload,
      phase,
      reuploadMode,
      showError,
      slug,
    ],
  );

  const handleCollectedFiles = useCallback(
    (result: ReturnType<typeof collectUploadFilesFromFileList>) => {
      if (result.singleFileNotHtml) {
        showError('HTML 以外は置けません');
        return;
      }

      if (result.files.length === 0) {
        return;
      }

      void beginUpload(result.files);
    },
    [beginUpload, showError],
  );

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (lockedRef.current) {
      event.preventDefault();
      event.target.value = '';
      return;
    }
    dismissBubble();
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    handleCollectedFiles(collectUploadFilesFromFileList(selected));
  };

  const handleDirectoryPick = () => {
    if (bubble?.kind === 'confirm' || pendingOverwrite) {
      lockedRef.current = false;
    }
    dismissBubble();
    directoryInputRef.current?.click();
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (lockedRef.current) {
      return;
    }
    dismissBubble();

    const entries = await collectFilesFromDataTransfer(event.dataTransfer);
    handleCollectedFiles(collectUploadFilesFromPathEntries(entries));
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setIsDragging(false);
  };

  const handleBoxActivate = () => {
    if (lockedRef.current || phase === 'uploading') {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleReplace = () => {
    if (!pendingOverwrite || bubble?.kind !== 'confirm') {
      return;
    }
    const { files, targetSlug, existingMetadata } = pendingOverwrite;
    dismissBubble();
    void executeUpload(files, targetSlug, existingMetadata);
  };

  const handleConfirmCancel = () => {
    lockedRef.current = false;
    dismissBubble();
    setPhase('idle');
  };

  const handleBubbleClose = () => {
    if (bubble?.kind === 'confirm') {
      handleConfirmCancel();
      return;
    }
    dismissBubble();
  };

  const handleCopyUrl = async () => {
    if (!successResult?.viewUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(successResult.viewUrl);
      setCopyMessage('コピーしました');
    } catch {
      setCopyMessage('コピーに失敗しました');
    }
  };

  const handleDeleteResult = async () => {
    if (!successResult || !auth.idToken || !auth.email || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      const client = createPagesS3Client(config, auth.idToken);
      await deletePage(client, config.pagesBucket, auth.email, successResult.slug);
      const deletedSlug = successResult.slug;
      setSuccessResult(null);
      setCopyMessage(null);
      setPhase('idle');
      onDeleted?.(deletedSlug);
    } catch (error) {
      showError(formatUploadError(error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const busy = phase === 'uploading';
  const progressLabel = progress.total <= 1 ? '1件' : `${progress.completed}/${progress.total}`;

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
          <BoxBubble
            kind={bubble?.kind === 'confirm' ? 'confirm' : 'error'}
            open={bubble !== null}
            message={bubble?.message ?? ''}
            onClose={handleBubbleClose}
            onReplace={bubble?.kind === 'confirm' ? handleReplace : undefined}
            onCancel={bubble?.kind === 'confirm' ? handleConfirmCancel : undefined}
          >
            <UploadBoxIcon
              phase={phase}
              dragging={isDragging}
              size={96}
              onActivate={handleBoxActivate}
            />
          </BoxBubble>
          <p className="composer-brand">okibasho</p>
          {successResult ? (
            <div className="upload-result" role="status">
              <a
                className="upload-result__url upload-result__url--primary"
                href={successResult.viewUrl}
              >
                {successResult.viewUrl}
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
                  href={successResult.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="ページを開く"
                >
                  開く
                </a>
              </div>
              <button
                type="button"
                className="text-button text-button--danger upload-result__delete"
                disabled={isDeleting}
                onClick={() => void handleDeleteResult()}
              >
                このページを消す
              </button>
            </div>
          ) : (
            <p className="composer-lead">
              {busy ? (
                <span className="composer-progress">{progressLabel}</span>
              ) : (
                'ここにドロップして公開'
              )}
            </p>
          )}
        </div>

        <div className="url-field">
          <label className="field-label visually-hidden" htmlFor="public-url-slug">
            公開URL
          </label>
          <div
            className={`url-input${highlightSlug ? ' url-input--overwrite' : ''}`}
            title={urlPrefix || undefined}
          >
            {auth.email ? (
              <>
                <span className="url-input__host" aria-hidden="true">
                  {urlOrigin}
                </span>
                <span className="url-input__user">{userPath}</span>
              </>
            ) : null}
            <input
              id="public-url-slug"
              type="text"
              value={slug}
              onChange={(event) => {
                if (bubble?.kind === 'confirm' || pendingOverwrite) {
                  lockedRef.current = false;
                }
                dismissBubble();
                setSlug(event.target.value);
              }}
              readOnly={reuploadMode}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              aria-label={slugAriaLabel}
            />
          </div>
        </div>

        {reuploadMode ? null : (
          <div className="retention-field">
            <span className="field-label visually-hidden" id="retention-label">
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

        <div className="composer-foot">
          <button type="button" className="text-link" disabled={busy} onClick={handleDirectoryPick}>
            フォルダを選ぶ
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
    </div>
  );
});
