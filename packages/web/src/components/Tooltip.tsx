import type { ReactElement, ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={200} disableHoverableContent>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  label,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  children: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="ui-tooltip"
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
