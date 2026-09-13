import { useState, type ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';

import { Tooltip } from '~/components/Tooltip';

export function Menu({
  label,
  tooltip,
  align = 'end',
  trigger,
  children,
  onCloseAutoFocus,
}: {
  label: string;
  tooltip?: string;
  align?: 'start' | 'center' | 'end';
  trigger: ReactNode;
  children: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const button = (
    <DropdownMenu.Trigger asChild>
      <button type="button" className="icon-button" aria-label={label}>
        {trigger}
      </button>
    </DropdownMenu.Trigger>
  );

  return (
    <DropdownMenu.Root
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTooltipOpen(false);
        }
      }}
    >
      {tooltip ? (
        <Tooltip
          label={tooltip}
          open={open ? false : tooltipOpen}
          onOpenChange={(next) => {
            if (!open) {
              setTooltipOpen(next);
            }
          }}
        >
          {button}
        </Tooltip>
      ) : (
        button
      )}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="ui-menu"
          align={align}
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
          loop
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  onSelect,
  danger = false,
  disabled = false,
  children,
}: {
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Item
      className={danger ? 'ui-menu__item ui-menu__item--danger' : 'ui-menu__item'}
      disabled={disabled}
      onSelect={onSelect}
    >
      {children}
    </DropdownMenu.Item>
  );
}
