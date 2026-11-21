import { useRef, type KeyboardEvent, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  children: ReactNode;
  /** Pinned under the scrolling body (the main button goes here). */
  footer?: ReactNode;
  /** Wider on desktop (the receipt). */
  wide?: boolean;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Focus the sheet itself on open, not its first field (no phone keyboard over a keypad or a short list). */
  focusSheet?: boolean;
};

/** A bottom sheet on the phone, a centered card on bigger screens. */
export function PosSheet({ open, onOpenChange, title, description, closeLabel, children, footer, wide, className, onKeyDown, focusSheet }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <DialogPrimitive.Content
            ref={ref}
            onKeyDown={onKeyDown}
            onOpenAutoFocus={focusSheet ? (e) => { e.preventDefault(); ref.current?.focus(); } : undefined}
            className={cn(
              "pointer-events-auto flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none",
              "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200",
              "sm:max-h-[88vh] sm:rounded-2xl sm:data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:fade-out-0 sm:data-[state=closed]:slide-out-to-bottom-4",
              wide ? "sm:max-w-lg" : "sm:max-w-md",
              className,
            )}
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden />
            <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-slate-900">{title}</DialogPrimitive.Title>
                {description
                  ? <DialogPrimitive.Description className="mt-0.5 text-sm text-slate-500">{description}</DialogPrimitive.Description>
                  : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
              </div>
              <DialogPrimitive.Close
                aria-label={closeLabel}
                className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="h-5 w-5" aria-hidden />
              </DialogPrimitive.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
            {footer && (
              <footer className="shrink-0 border-t border-slate-100 px-5 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3 sm:pb-5">{footer}</footer>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
