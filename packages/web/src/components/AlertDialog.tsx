import type { ReactNode } from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';

import { messages } from '~/lib/messages';

export function ConfirmAlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = messages.cancel,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="ui-alert__overlay" />
        <AlertDialogPrimitive.Content className="ui-alert">
          <AlertDialogPrimitive.Title className="ui-alert__title">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="ui-alert__description">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="ui-alert__actions">
            <AlertDialogPrimitive.Cancel asChild>
              <button type="button" className="button button--ghost">
                {cancelLabel}
              </button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <button
                type="button"
                className={danger ? 'button button--danger' : 'button'}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
