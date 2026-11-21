import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The prototype's overlay panel: centered near the top on a computer, a sheet from the bottom on a phone.
 * Radix handles focus, Escape and the scroll lock.
 */
export function Panel({ open, onOpenChange, title, closeLabel, wide, children, description }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  closeLabel: string;
  /** "wide" (620px) for lists, "xwide" (880px) for the export preview. */
  wide?: "wide" | "xwide";
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(7,11,20,0.45)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[18px] border border-slate-200 bg-white p-4 pb-[calc(18px+env(safe-area-inset-bottom,0px))] shadow-[0_20px_44px_-16px_rgba(15,23,42,0.3)] outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-6 data-[state=open]:fade-in-0 motion-reduce:animate-none",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[70px] sm:max-h-[min(86vh,720px)] sm:w-[calc(100%-32px)] sm:-translate-x-1/2 sm:rounded-2xl sm:pb-4 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95",
            wide === "xwide" ? "sm:max-w-[880px]" : wide === "wide" ? "sm:max-w-[620px]" : "sm:max-w-[460px]",
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <DialogPrimitive.Title className="min-w-0 text-[17px] font-[750] text-slate-900">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9 sm:w-9">
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{closeLabel}</span>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">{description ?? title}</DialogPrimitive.Description>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
