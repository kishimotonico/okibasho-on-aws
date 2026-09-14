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
  side = 'bottom',
  align = 'center',
  avoidCollisions = true,
}: {
  label: string;
  children: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  avoidCollisions?: boolean;
}) {
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="ui-tooltip"
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          avoidCollisions={avoidCollisions}
        >
          <span className="ui-tooltip__arrow" aria-hidden="true" />
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
