import type { Retention } from '@okibasho/core';
import { Check, ChevronDown, Clock, Globe, Users } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';

import { PasswordToggle } from '~/components/PasswordToggle';
import { Tooltip } from '~/components/Tooltip';
import { messages } from '~/lib/messages';

export type PageVisibility = 'internal' | 'external';

interface UploadOptionsProps {
  retention: Retention;
  onRetentionChange: (value: Retention) => void;
  visibility: PageVisibility;
  onVisibilityChange: (value: PageVisibility) => void;
  /**
   * 対象 slug が既に外部共有中のとき true。公開範囲チップを選択肢を出さない
   * disabled 表示（外部共有中）に固定し、パスワードチップも出さない
   */
  locked: boolean;
  withPassword: boolean;
  onPasswordToggle: () => void;
  disabled: boolean;
}

const retentionLabel: Record<Retention, string> = {
  temporary: messages.retentionTemporaryOption,
  permanent: messages.retentionPermanentOption,
};

const visibilityLabel: Record<PageVisibility, string> = {
  internal: messages.shareVisibilityInternalOption,
  external: messages.shareVisibilityExternalOption,
};

/**
 * 保存期間・公開範囲・（外部かつ未ロック時のみ）パスワードをチップの列で見せる。
 * slug 入力の直下に置く（Composer から使う）。チップはクリックでポップオーバー
 * （radix-ui DropdownMenu の RadioGroup）から選ぶ。ポップオーバーはチップの
 * 左端・直下に揃える（align="start"）
 */
export function UploadOptions({
  retention,
  onRetentionChange,
  visibility,
  onVisibilityChange,
  locked,
  withPassword,
  onPasswordToggle,
  disabled,
}: UploadOptionsProps) {
  return (
    <div className="toolbar-row">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="chip"
            disabled={disabled}
            aria-label={`${messages.retentionLabel} ${retentionLabel[retention]}`}
          >
            <Clock size={14} strokeWidth={1.75} aria-hidden className="chip__icon" />
            {retentionLabel[retention]}
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="chip__chev" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="ui-menu" align="start" sideOffset={4}>
            <DropdownMenu.RadioGroup
              value={retention}
              onValueChange={(value) => onRetentionChange(value as Retention)}
            >
              <DropdownMenu.RadioItem
                className="ui-menu__item ui-menu__item--radio"
                value="temporary"
              >
                <span className="ui-menu__item-check">
                  <DropdownMenu.ItemIndicator>
                    <Check size={14} strokeWidth={2} aria-hidden />
                  </DropdownMenu.ItemIndicator>
                </span>
                {messages.retentionTemporaryOption}
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem
                className="ui-menu__item ui-menu__item--radio"
                value="permanent"
              >
                <span className="ui-menu__item-check">
                  <DropdownMenu.ItemIndicator>
                    <Check size={14} strokeWidth={2} aria-hidden />
                  </DropdownMenu.ItemIndicator>
                </span>
                {messages.retentionPermanentOption}
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {locked ? (
        <Tooltip label={messages.shareVisibilityLockedHint}>
          {/*
           * disabled 属性の要素は pointer イベントを出さず Tooltip が開けないため、
           * aria-disabled + tabIndex で見た目と操作不可はそのままに、hover / focus は通す
           */}
          <button
            type="button"
            className="chip"
            aria-disabled="true"
            tabIndex={0}
            aria-label={messages.shareVisibilityLocked}
            onClick={(event) => event.preventDefault()}
          >
            <Globe size={14} strokeWidth={1.75} aria-hidden className="chip__icon" />
            {messages.shareVisibilityLocked}
          </button>
        </Tooltip>
      ) : (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="chip"
              disabled={disabled}
              aria-label={`${messages.shareVisibilityLabel} ${visibilityLabel[visibility]}`}
            >
              {visibility === 'internal' ? (
                <Users size={14} strokeWidth={1.75} aria-hidden className="chip__icon" />
              ) : (
                <Globe size={14} strokeWidth={1.75} aria-hidden className="chip__icon" />
              )}
              {visibilityLabel[visibility]}
              <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="chip__chev" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="ui-menu" align="start" sideOffset={4}>
              <DropdownMenu.RadioGroup
                value={visibility}
                onValueChange={(value) => onVisibilityChange(value as PageVisibility)}
              >
                <DropdownMenu.RadioItem
                  className="ui-menu__item ui-menu__item--radio"
                  value="internal"
                >
                  <span className="ui-menu__item-check">
                    <DropdownMenu.ItemIndicator>
                      <Check size={14} strokeWidth={2} aria-hidden />
                    </DropdownMenu.ItemIndicator>
                  </span>
                  <Users size={14} strokeWidth={1.75} aria-hidden className="chip__icon" />
                  {messages.shareVisibilityInternalOption}
                </DropdownMenu.RadioItem>
                <DropdownMenu.RadioItem
                  className="ui-menu__item ui-menu__item--radio"
                  value="external"
                >
                  <span className="ui-menu__item-check">
                    <DropdownMenu.ItemIndicator>
                      <Check size={14} strokeWidth={2} aria-hidden />
                    </DropdownMenu.ItemIndicator>
                  </span>
                  <Globe size={14} strokeWidth={1.75} aria-hidden className="chip__icon" />
                  {messages.shareVisibilityExternalOption}
                </DropdownMenu.RadioItem>
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}

      {!locked && visibility === 'external' ? (
        <PasswordToggle pressed={withPassword} disabled={disabled} onToggle={onPasswordToggle} />
      ) : null}
    </div>
  );
}
