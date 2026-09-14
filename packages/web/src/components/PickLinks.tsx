import { useRef, type ChangeEvent, type RefObject } from 'react';

import { messages } from '~/lib/messages';

interface PickLinksProps {
  /** 箱アイコンのクリックからも同じダイアログを開くので、ファイル input の ref は親と共有する */
  fileInputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  /** ダイアログを開く直前。吹き出しを引っ込めるなど */
  onBeforePick: () => void;
  onPick: (files: File[]) => void;
}

/**
 * 「ファイルを選ぶ · フォルダを選ぶ」と、その実体である隠しファイル input。
 * 同じ選択結果を扱うので、input はこのコンポーネントの中に閉じる。
 */
export function PickLinks({ fileInputRef, disabled, onBeforePick, onPick }: PickLinksProps) {
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    // 同じファイルを選び直しても change が出るように、毎回空にする
    event.target.value = '';
    onPick(selected);
  };

  const open = (input: HTMLInputElement | null) => {
    onBeforePick();
    input?.click();
  };

  return (
    <>
      <div className="composer-pick-links">
        <button
          type="button"
          className="text-link"
          disabled={disabled}
          onClick={() => open(fileInputRef.current)}
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
          disabled={disabled}
          onClick={() => open(directoryInputRef.current)}
        >
          {messages.pickDirectory}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
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
        onChange={handleChange}
      />
    </>
  );
}
