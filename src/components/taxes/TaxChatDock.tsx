import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useExit } from "@/hooks/useTaxLive";

export type Peek = { kind: "typing" } | { kind: "text"; text: string };

/**
 * "Contactar preparador": the floating bubble (phones always; computers while the chat is folded away). A message
 * that arrives while the chat is closed comes out of the avatar like a speech bubble (first "…" while they type),
 * with the number of new ones on the bubble. Tapping either opens the chat; it never opens by itself.
 */
export function ChatBubble({ show, label, title, initials, online, unread, unreadLabel, peek, onOpen, className }: {
  show: boolean; label: string; title: string; initials: string; online: boolean; unread: number; unreadLabel: string;
  peek: Peek | null; onOpen: () => void; className?: string;
}) {
  // Comes back once the chat has finished going away (the sheet slid down, the column folded).
  const fab = useExit(show, 360, 520);
  const bubble = useExit(show && !!peek, 420);
  // The words stay while the speech bubble goes away.
  const [lastPeek, setLastPeek] = useState<Peek | null>(peek);
  useEffect(() => {
    if (!peek) return;
    const id = setTimeout(() => setLastPeek(peek), 0);
    return () => clearTimeout(id);
  }, [peek]);
  const content = peek ?? lastPeek;
  if (!fab.mounted) return null;
  return createPortal(
    <div data-tax-dock="" className={cn("fixed z-40 flex w-max flex-col items-start gap-3.5", className)}>
      {bubble.mounted && content && (
        <button type="button" onClick={onOpen} data-leaving={bubble.leaving}
          className="tx-peek relative grid w-0 min-w-full gap-0.5 rounded-[20px] rounded-bl-md border border-slate-200 bg-white px-4 pb-3 pt-2.5 text-left shadow-[0_20px_42px_-18px_rgba(15,23,42,0.45)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <b className="text-[11.5px] font-bold text-slate-500">{title}</b>
          {content.kind === "typing"
            ? <span className="tx-dots flex gap-1 py-1.5" aria-hidden="true"><span /><span /><span /></span>
            : <span key={content.text} className="tx-focus line-clamp-3 text-[13.5px] leading-[1.45] text-slate-900">{content.text}</span>}
        </button>
      )}
      <button type="button" onClick={onOpen} data-leaving={fab.leaving} data-on={online}
        className="tx-fab relative flex items-center gap-2.5 rounded-full bg-slate-900 py-1.5 pl-1.5 pr-4 text-[13.5px] font-semibold text-white shadow-[0_18px_36px_-14px_rgba(2,6,23,0.55)] transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-bold" aria-hidden="true">
          {initials}
          <span className="tx-ondot absolute -bottom-px -right-px h-3 w-3 rounded-full border-2 border-slate-900 bg-green-500" />
        </span>
        {label}
        {unread > 0 && (
          <span className="absolute -top-1 left-6 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[10.5px] font-extrabold leading-none" aria-hidden="true">{unread}</span>
        )}
        {unread > 0 && <span className="sr-only">: {unreadLabel}</span>}
      </button>
    </div>,
    document.body,
  );
}

/** Mounted while open and while it animates away; `shown` flips two frames after it's in the page, so it slides. */
function useSlide(open: boolean, ms: number) {
  const life = useExit(open, ms);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!life.mounted) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(open)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [open, life.mounted]);
  return { mounted: life.mounted, shown };
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
}

/** Phones: the chat as a solid sheet that slides up from the bottom and back down; the page behind dims a little. */
export function ChatSheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const { mounted, shown } = useSlide(open, 700);
  useEscape(open, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div className="tx-scrim absolute inset-0 bg-slate-900/30" data-open={shown} onClick={onClose} aria-hidden="true" />
      <div className="tx-sheet absolute inset-0 flex flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] shadow-[0_-14px_40px_-18px_rgba(2,6,23,0.4)]" data-open={shown}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Computers, before sending: the chat as a window that rises out of the bubble, bottom right. */
export function ChatWindow({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const { mounted, shown } = useSlide(open, 700);
  useEscape(open, onClose);
  if (!mounted) return null;
  return createPortal(
    <div role="dialog" aria-label={label} data-open={shown}
      className="tx-window fixed bottom-6 right-6 z-50 flex h-[min(640px,calc(100dvh-3rem))] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_30px_70px_-24px_rgba(15,23,42,0.45)]">
      {children}
    </div>,
    document.body,
  );
}
