import { emailLocalPart, generateRandomSlug, isValidSlug, type PageMetadata } from '@cli/page';
import { Trash2 } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';

import { useAuth } from '~/auth/auth-context';
import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { BoxBubble } from '~/components/BoxBubble';
import { Tooltip } from '~/components/Tooltip';
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
import { formatUrlForWrap } from '~/lib/format-url-for-wrap';
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
  | { kind: 'error'; message: string; persist?: boolean }
  | { kind: 'confirm'; message: string; targetSlug: string };

const DEFAULT_RETENTION: Retention = 'temporary';
const INVALID_SLUG_MESSAGE = '使えるのは小文字の英数字と - _ だけ';

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
  const slugInputRef = useRef<HTMLInputElement>(null);
  const slugFocusValueRef = useRef('');
  const lockedRef = useRef(false);
  const composerRef = useRef<HTMLDivElement>(null);

  const [slug, setSlug] = useState(() => initialSlug ?? generateRandomSlug());
  const [retention, setRetention] = useState<Retention>(DEFAULT_RETENTION);
  const [isDragging, setIsDragging] = useState(false);
  const [composerVisible, setComposerVisible] = useState(true);
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [slugTooltipOpen, setSlugTooltipOpen] = useState(false);
  const [slugInputFocused, setSlugInputFocused] = useState(false);
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
        setPhase('idle');
        setSuccessResult(null);
        setCopyMessage(null);
        setDeleteConfirmOpen(false);
        dismissBubble();
        window.setTimeout(() => {
          slugInputRef.current?.focus();
        }, 0);
      },
    }),
    [dismissBubble],
  );

  const showError = useCallback((message: string, options?: { persist?: boolean }) => {
    lockedRef.current = false;
    setBubble({ kind: 'error', message, persist: options?.persist });
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
        const metadata = existingMetadata ?? null;

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
        setSlug(generateRandomSlug());
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
    [auth.email, auth.idToken, config, onUploaded, retention, showError],
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
        showError(INVALID_SLUG_MESSAGE, { persist: true });
        return;
      }

      if (!auth.idToken || !auth.email) {
        showError('ログインが必要です');
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
    [auth.email, auth.idToken, config, dismissBubble, executeUpload, phase, showError, slug],
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

  const handleFilePick = () => {
    if (bubble?.kind === 'confirm' || pendingOverwrite) {
      lockedRef.current = false;
    }
    dismissBubble();
    fileInputRef.current?.click();
  };

  const handleDirectoryPick = () => {
    if (bubble?.kind === 'confirm' || pendingOverwrite) {
      lockedRef.current = false;
    }
    dismissBubble();
    directoryInputRef.current?.click();
  };

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (lockedRef.current) {
        return;
      }
      dismissBubble();

      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) {
        return;
      }

      const entries = await collectFilesFromDataTransfer(dataTransfer);
      handleCollectedFiles(collectUploadFilesFromPathEntries(entries));
    },
    [dismissBubble, handleCollectedFiles],
  );

  useEffect(() => {
    let dragDepth = 0;

    const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

    const resetDragging = () => {
      dragDepth = 0;
      setIsDragging(false);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragDepth += 1;
      setIsDragging(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragDepth -= 1;
      if (dragDepth <= 0) {
        resetDragging();
      }
    };

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
    };

    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      resetDragging();
      void handleDrop(event);
    };

    const onDragEnd = () => {
      resetDragging();
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', onDragEnd);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', onDragEnd);
    };
  }, [handleDrop]);

  useEffect(() => {
    const element = composerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) {
          return;
        }
        setComposerVisible(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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

  const handleDeleteConfirm = async () => {
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
      setDeleteConfirmOpen(false);
      onDeleted?.(deletedSlug);
    } catch (error) {
      showError(formatUploadError(error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const busy = phase === 'uploading';

  const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;

    if (bubble?.kind === 'confirm' || pendingOverwrite) {
      lockedRef.current = false;
      dismissBubble();
    } else if (bubble?.kind === 'error' && bubble.message !== INVALID_SLUG_MESSAGE) {
      dismissBubble();
    }

    setSlug(nextValue);

    const trimmed = nextValue.trim();
    if (!trimmed) {
      if (bubble?.kind === 'error' && bubble.message === INVALID_SLUG_MESSAGE) {
        dismissBubble();
      }
      return;
    }

    if (!isValidSlug(trimmed)) {
      setBubble({ kind: 'error', message: INVALID_SLUG_MESSAGE, persist: true });
      return;
    }

    if (bubble?.kind === 'error' && bubble.message === INVALID_SLUG_MESSAGE) {
      dismissBubble();
    }
  };

  const handleSlugFocus = (event: FocusEvent<HTMLInputElement>) => {
    slugFocusValueRef.current = slug;
    event.currentTarget.select();
    setSlugInputFocused(true);
    setSlugTooltipOpen(false);
  };

  const handleSlugBlur = () => {
    setSlugInputFocused(false);
  };

  const handleSlugKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') {
      return;
    }

    const restored = slugFocusValueRef.current;
    setSlug(restored);

    const trimmed = restored.trim();
    if (!trimmed || isValidSlug(trimmed)) {
      if (bubble?.kind === 'error' && bubble.message === INVALID_SLUG_MESSAGE) {
        dismissBubble();
      }
    }
  };

  const copyButtonLabel =
    copyMessage === 'コピーしました'
      ? 'コピーしました'
      : copyMessage === 'コピーに失敗しました'
        ? 'コピーに失敗しました'
        : 'URLをコピー';
  const progressLabel = progress.total <= 1 ? '1件' : `${progress.completed}/${progress.total}`;

  return (
    <div className="upload-panel">
      {isDragging ? (
        <div className="drag-overlay" aria-hidden="true">
          {!composerVisible ? (
            <p className="drag-overlay__fallback">上のフォームにドロップ</p>
          ) : null}
        </div>
      ) : null}

      <ConfirmAlertDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="このページを削除する"
        description={
          successResult ? `「${successResult.slug}」を削除しますか？この操作は取り消せません。` : ''
        }
        confirmLabel="削除"
        danger
        onConfirm={() => void handleDeleteConfirm()}
      />

      <div
        ref={composerRef}
        className={`composer${isDragging ? ' composer--active' : ''}`}
        onDragOver={(event) => {
          if (event.dataTransfer?.types.includes('Files')) {
            event.preventDefault();
          }
        }}
      >
        <div className="composer-drop">
          <BoxBubble
            kind={bubble?.kind === 'confirm' ? 'confirm' : 'error'}
            open={bubble !== null}
            message={bubble?.message ?? ''}
            persist={bubble?.kind === 'error' ? bubble.persist : false}
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
                target="_blank"
                rel="noreferrer"
              >
                {formatUrlForWrap(successResult.viewUrl)}
              </a>
              <div className="upload-result__actions">
                <button
                  type="button"
                  className="button button--copy"
                  onClick={() => void handleCopyUrl()}
                >
                  {copyButtonLabel}
                </button>
                <Tooltip label="削除">
                  <button
                    type="button"
                    className="icon-button upload-result__delete"
                    aria-label="削除"
                    disabled={isDeleting}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                </Tooltip>
              </div>
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
          <div className="composer-pick-links">
            <button type="button" className="text-link" disabled={busy} onClick={handleFilePick}>
              ファイルを選ぶ
            </button>
            <span className="composer-pick-links__sep" aria-hidden="true">
              {' '}
              ·{' '}
            </span>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={handleDirectoryPick}
            >
              フォルダを選ぶ
            </button>
          </div>
        </div>

        <div className="url-field">
          <label className="field-label visually-hidden" htmlFor="public-url-slug">
            公開URL
          </label>
          <div className={`url-input${highlightSlug ? ' url-input--overwrite' : ''}`} tabIndex={-1}>
            {auth.email ? (
              <span className="url-input__prefix" aria-hidden="true">
                <span className="url-input__host">{urlOrigin}</span>
                <span className="url-input__user">{userPath}</span>
              </span>
            ) : null}
            <Tooltip
              label="クリックして名前を付け直せる"
              side="top"
              align="end"
              avoidCollisions={false}
              open={slugInputFocused ? false : slugTooltipOpen}
              onOpenChange={(next) => {
                if (!slugInputFocused) {
                  setSlugTooltipOpen(next);
                }
              }}
            >
              <input
                ref={slugInputRef}
                id="public-url-slug"
                type="text"
                value={slug}
                onChange={handleSlugChange}
                onFocus={handleSlugFocus}
                onBlur={handleSlugBlur}
                onKeyDown={handleSlugKeyDown}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                aria-label={slugAriaLabel}
              />
            </Tooltip>
          </div>
        </div>

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
