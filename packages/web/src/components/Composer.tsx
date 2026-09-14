import { generateRandomSlug, isValidSlug } from '@cli/page';
import { Check, Copy, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { pageMetadataFromListed, type ListedPage, type Retention } from '~/api/pages';
import { BoxBubble } from '~/components/BoxBubble';
import { ConfirmAlertDialog } from '~/components/AlertDialog';
import { Tooltip } from '~/components/Tooltip';
import { UploadBoxIcon } from '~/components/UploadBoxIcon';
import { usePagesApi, userMessage } from '~/hooks/usePagesApi';
import {
  collectUploadFilesFromFileList,
  collectUploadFilesFromPathEntries,
  type UploadFileEntry,
} from '~/lib/collect-upload-files';
import { formatUrlForWrap } from '~/lib/format-url-for-wrap';
import { messages } from '~/lib/messages';
import { collectFilesFromDataTransfer } from '~/lib/read-data-transfer';
import { validateUploadFiles } from '~/lib/validate-upload';

/** 一覧の操作をフォームへ伝えるための合図。同じ slug が続けて来ても分かるよう nonce を持つ */
export type ComposerSignal = { slug: string; nonce: number } | null;

interface ComposerProps {
  initialSlug?: string;
  /** 既存 slug の確認と、差し替え時に引き継ぐメタデータの取得元 */
  pages: readonly ListedPage[];
  /** 一覧の「再アップロード」。slug を入れてフォーカスする */
  seed: ComposerSignal;
  /** 消えたページ。フォームに残っていれば外す */
  retired: ComposerSignal;
  /** ページの削除中（ルート側のトランジション） */
  deleting: boolean;
  onUploaded: (slug: string) => void;
  onDelete: (slug: string) => void;
}

type UploadPhase = 'idle' | 'uploading' | 'success' | 'error';

type BubbleState =
  | { kind: 'error'; message: string; persist?: boolean }
  | { kind: 'confirm'; message: string; targetSlug: string }
  | { kind: 'success'; message: string };

const DEFAULT_RETENTION: Retention = 'temporary';
const DRAG_STALE_MS = 2000;
const COPY_FEEDBACK_MS = 2000;

function validationBubbleMessage(errors: readonly { code: string; message: string }[]): string {
  const missingIndex = errors.find((error) => error.code === 'missing_index_html');
  if (missingIndex) {
    return missingIndex.message;
  }
  return errors[0]?.message ?? messages.uploadFailed;
}

export function Composer({
  initialSlug,
  pages,
  seed,
  retired,
  deleting,
  onUploaded,
  onDelete,
}: ComposerProps) {
  const api = usePagesApi();
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
    existing: ListedPage;
  } | null>(null);
  const [overwriteSlug, setOverwriteSlug] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ slug: string; viewUrl: string } | null>(
    null,
  );
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [slugTooltipOpen, setSlugTooltipOpen] = useState(false);
  const slugJustFocusedRef = useRef(false);
  // window のイベントリスナーは登録し直さずに最新の phase を読む必要があるため ref に映す
  const phaseRef = useRef<UploadPhase>('idle');
  phaseRef.current = phase;

  const slugAriaLabel = api.userPath ? `公開URL ${api.urlOrigin}${api.userPath}${slug}` : '公開URL';
  const busy = phase === 'uploading';

  const dismissBubble = useCallback(() => {
    setBubble(null);
    setPendingOverwrite(null);
    setOverwriteSlug(null);
  }, []);

  const resetToIdle = useCallback(() => {
    setPhase('idle');
    setSuccessResult(null);
    setCopyMessage(null);
    setDeleteConfirmOpen(false);
    dismissBubble();
  }, [dismissBubble]);

  // 一覧からの合図に合わせて状態を直す。描画中の setState は React の
  // 「prop の変化に合わせて state を直す」書き方で、effect より一手早く整う
  const [appliedSeed, setAppliedSeed] = useState(0);
  if (seed && seed.nonce !== appliedSeed) {
    setAppliedSeed(seed.nonce);
    setSlug(seed.slug);
    lockedRef.current = false;
    resetToIdle();
  }

  const [appliedRetired, setAppliedRetired] = useState(0);
  if (retired && retired.nonce !== appliedRetired) {
    setAppliedRetired(retired.nonce);
    if (slug === retired.slug) {
      setSlug(generateRandomSlug());
    }
    if (successResult?.slug === retired.slug || pendingOverwrite?.targetSlug === retired.slug) {
      lockedRef.current = false;
      resetToIdle();
    }
  }

  // seed が変わった描画では slug 入力が必ず出ているので、そのままフォーカスを移せる
  useEffect(() => {
    if (!seed) {
      return;
    }
    slugInputRef.current?.focus();
  }, [seed]);

  useEffect(() => {
    if (phase !== 'idle' || bubble) {
      setSlugTooltipOpen(false);
    }
  }, [phase, bubble]);

  useEffect(() => {
    if (!copyMessage) {
      return;
    }
    const id = window.setTimeout(() => setCopyMessage(null), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(id);
  }, [copyMessage]);

  const showError = useCallback((message: string, options?: { persist?: boolean }) => {
    lockedRef.current = false;
    setBubble({ kind: 'error', message, persist: options?.persist });
    setPhase('error');
    setSuccessResult(null);
    setCopyMessage(null);
  }, []);

  const executeUpload = useCallback(
    async (files: UploadFileEntry[], targetSlug: string, existing?: ListedPage | null) => {
      setOverwriteSlug(targetSlug);
      setPhase('uploading');
      setProgress({ completed: 0, total: files.length });

      try {
        const result = await api.upload({
          slug: targetSlug,
          files,
          retention,
          existing: existing ? pageMetadataFromListed(existing) : null,
          onProgress: (completed, total) => setProgress({ completed, total }),
        });

        setSlug(generateRandomSlug());
        setSuccessResult(result);
        setPhase('success');
        setBubble({ kind: 'success', message: messages.uploaded });
        onUploaded(result.slug);
      } catch (error) {
        showError(userMessage(error));
      } finally {
        lockedRef.current = false;
        setOverwriteSlug(null);
        setPendingOverwrite(null);
      }
    },
    [api, onUploaded, retention, showError],
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
        showError(messages.invalidSlug, { persist: true });
        return;
      }

      // 既存 slug かどうかは一覧から分かる。S3 へメタデータを読みに行く必要はない
      const existing = pages.find((page) => page.slug === targetSlug);
      if (existing) {
        setPhase('idle');
        setPendingOverwrite({ files, targetSlug, existing });
        setOverwriteSlug(targetSlug);
        setBubble({
          kind: 'confirm',
          message: messages.confirmOverwrite(targetSlug),
          targetSlug,
        });
        return;
      }

      await executeUpload(files, targetSlug);
    },
    [dismissBubble, executeUpload, pages, phase, showError, slug],
  );

  const handleCollectedFiles = useCallback(
    (result: ReturnType<typeof collectUploadFilesFromFileList>) => {
      if (result.singleFileNotHtml) {
        showError(messages.notHtml);
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
    if (lockedRef.current || phase === 'success') {
      event.preventDefault();
      event.target.value = '';
      return;
    }
    dismissBubble();
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    handleCollectedFiles(collectUploadFilesFromFileList(selected));
  };

  const openPicker = (input: HTMLInputElement | null) => {
    if (phase === 'success') {
      return;
    }
    if (bubble?.kind === 'confirm' || pendingOverwrite) {
      lockedRef.current = false;
    }
    dismissBubble();
    input?.click();
  };

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (lockedRef.current || phaseRef.current === 'success') {
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
    let staleTimer: number | null = null;

    const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

    const clearStaleTimer = () => {
      if (staleTimer != null) {
        window.clearTimeout(staleTimer);
        staleTimer = null;
      }
    };

    const resetDragging = () => {
      dragDepth = 0;
      clearStaleTimer();
      setIsDragging(false);
    };

    const armStaleTimer = () => {
      clearStaleTimer();
      staleTimer = window.setTimeout(() => {
        resetDragging();
      }, DRAG_STALE_MS);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      if (phaseRef.current === 'success') {
        return;
      }
      dragDepth += 1;
      setIsDragging(true);
      armStaleTimer();
    };

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      if (event.relatedTarget == null) {
        resetDragging();
        return;
      }
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
      if (phaseRef.current === 'success') {
        return;
      }
      armStaleTimer();
    };

    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      resetDragging();
      if (phaseRef.current === 'success') {
        return;
      }
      void handleDrop(event);
    };

    const onDragEnd = () => {
      resetDragging();
    };

    const onBlur = () => {
      resetDragging();
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', onDragEnd);
    window.addEventListener('blur', onBlur);

    return () => {
      clearStaleTimer();
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('blur', onBlur);
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
    if (lockedRef.current || phase === 'uploading' || phase === 'success') {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleUploadAnother = () => {
    setSlug(generateRandomSlug());
    setRetention(DEFAULT_RETENTION);
    resetToIdle();
  };

  const handleReplace = () => {
    if (!pendingOverwrite || bubble?.kind !== 'confirm') {
      return;
    }
    const { files, targetSlug, existing } = pendingOverwrite;
    dismissBubble();
    void executeUpload(files, targetSlug, existing);
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
      setCopyMessage(messages.copied);
    } catch {
      setCopyMessage(messages.copyFailed);
    }
  };

  const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;

    if (bubble?.kind === 'confirm' || pendingOverwrite) {
      lockedRef.current = false;
      dismissBubble();
    } else if (bubble?.kind === 'error' && bubble.message !== messages.invalidSlug) {
      dismissBubble();
    }

    setSlug(nextValue);

    const trimmed = nextValue.trim();
    if (!trimmed) {
      if (bubble?.kind === 'error' && bubble.message === messages.invalidSlug) {
        dismissBubble();
      }
      return;
    }

    if (!isValidSlug(trimmed)) {
      setBubble({ kind: 'error', message: messages.invalidSlug, persist: true });
      return;
    }

    if (bubble?.kind === 'error' && bubble.message === messages.invalidSlug) {
      dismissBubble();
    }
  };

  const handleSlugFocus = (event: FocusEvent<HTMLInputElement>) => {
    slugFocusValueRef.current = slug;
    event.currentTarget.select();
    slugJustFocusedRef.current = true;
    setSlugTooltipOpen(false);
  };

  const handleSlugMouseUp = (event: ReactMouseEvent<HTMLInputElement>) => {
    if (slugJustFocusedRef.current) {
      event.preventDefault();
      slugJustFocusedRef.current = false;
    }
  };

  const handleSlugKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') {
      return;
    }

    const restored = slugFocusValueRef.current;
    setSlug(restored);

    const trimmed = restored.trim();
    if (!trimmed || isValidSlug(trimmed)) {
      if (bubble?.kind === 'error' && bubble.message === messages.invalidSlug) {
        dismissBubble();
      }
    }
  };

  const copied = copyMessage === messages.copied;
  const copyButtonLabel = copyMessage ?? messages.copyUrl;
  const progressLabel = progress.total <= 1 ? '1件' : `${progress.completed}/${progress.total}`;

  return (
    <div className="upload-panel">
      {isDragging ? (
        <div className="drag-overlay" aria-hidden="true">
          {!composerVisible ? (
            <p className="drag-overlay__fallback">{messages.dragOverlayFallback}</p>
          ) : null}
        </div>
      ) : null}

      <ConfirmAlertDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={messages.deleteDialogTitle}
        description={successResult ? messages.deleteDialogDescription(successResult.slug) : ''}
        confirmLabel={messages.remove}
        danger
        onConfirm={() => {
          if (successResult) {
            onDelete(successResult.slug);
          }
        }}
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
            kind={bubble?.kind ?? 'error'}
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
                  className={`button button--copy${copied ? ' button--copy-success' : ''}`}
                  onClick={() => void handleCopyUrl()}
                >
                  {copied ? (
                    <Check size={16} strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Copy size={16} strokeWidth={1.75} aria-hidden />
                  )}
                  <span>{copyButtonLabel}</span>
                </button>
                <Tooltip label={messages.remove}>
                  <button
                    type="button"
                    className="icon-button upload-result__delete"
                    aria-label={messages.remove}
                    disabled={deleting}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                </Tooltip>
              </div>
              <button
                type="button"
                className="button button--ghost upload-result__another"
                onClick={handleUploadAnother}
              >
                {messages.uploadAnother}
              </button>
            </div>
          ) : (
            <>
              <p className="composer-lead">
                {busy ? (
                  <span className="composer-progress">{progressLabel}</span>
                ) : (
                  messages.dropLead
                )}
              </p>
              <div className="composer-pick-links">
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => openPicker(fileInputRef.current)}
                >
                  {messages.pickFiles}
                </button>
                <span className="composer-pick-links__sep" aria-hidden="true">
                  {' '}
                  ·{' '}
                </span>
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => openPicker(directoryInputRef.current)}
                >
                  {messages.pickDirectory}
                </button>
              </div>
            </>
          )}
        </div>

        {!successResult ? (
          <>
            <div className="url-field">
              <label className="field-label visually-hidden" htmlFor="public-url-slug">
                公開URL
              </label>
              <div
                className={`url-input${overwriteSlug ? ' url-input--overwrite' : ''}`}
                tabIndex={-1}
              >
                {api.userPath ? (
                  <span className="url-input__prefix" aria-hidden="true">
                    <span className="url-input__host">{api.urlOrigin}</span>
                    <span className="url-input__user">{api.userPath}</span>
                  </span>
                ) : null}
                <Tooltip label={messages.slugTooltip} side="top" open={slugTooltipOpen}>
                  <input
                    ref={slugInputRef}
                    id="public-url-slug"
                    type="text"
                    value={slug}
                    onChange={handleSlugChange}
                    onFocus={handleSlugFocus}
                    onMouseUp={handleSlugMouseUp}
                    onPointerEnter={() => setSlugTooltipOpen(true)}
                    onPointerLeave={() => setSlugTooltipOpen(false)}
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
          </>
        ) : null}

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
}
