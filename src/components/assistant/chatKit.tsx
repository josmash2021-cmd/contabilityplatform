// Pieces of the Asistente chat: the answer that writes itself in, the "writing" dots and the file chips.
// Files: chatFiles.ts. Dictation: useDictation.ts.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The answer appearing as if typed: word by word, smoothly, finishing in about two seconds however long it is
 * (short answers go at a calm pace). `after` (the sources) shows once it's all there. Screen readers get the
 * whole text at once; with "reduce motion" on, it's shown complete.
 */
export function Typewriter({ text, onTick, after }: { text: string; onTick?: () => void; after?: ReactNode }) {
  const [reduce] = useState(prefersReducedMotion);
  const [shown, setShown] = useState(0);
  const tick = useRef(onTick);
  useEffect(() => { tick.current = onTick; });
  useEffect(() => {
    if (reduce) return;
    const cps = Math.min(420, Math.max(48, text.length / 2.1));
    const t0 = performance.now();
    let raf = 0;
    let lastTick = 0;
    const step = (now: number) => {
      let k = Math.min(text.length, Math.floor(((now - t0) / 1000) * cps));
      // Whole words only: never half a word on screen.
      if (k < text.length) {
        const next = text.slice(k).search(/\s/);
        k = next < 0 ? text.length : k + next;
      }
      setShown(k);
      if (now - lastTick > 90) { lastTick = now; tick.current?.(); }
      if (k < text.length) raf = requestAnimationFrame(step);
      else tick.current?.();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, reduce]);
  const done = reduce || shown >= text.length;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {done ? text : text.slice(0, shown)}
        {!done && <span className="typing-caret" />}
      </span>
      {done && after && <div className="animate-fade-in">{after}</div>}
    </>
  );
}

/** Three dots that bounce while the assistant works on the answer. */
export function TypingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-slate-500" role="status" aria-label={label}>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        <i className="typing-dot" /><i className="typing-dot [animation-delay:160ms]" /><i className="typing-dot [animation-delay:320ms]" />
      </span>
      <span className="text-[14px]">{label}</span>
    </span>
  );
}

/** A file going with a question: its name and kind, with a remove button while it's still in the box. */
export function FileChip({ name, mime, onRemove, removeLabel, light }: { name: string; mime: string; onRemove?: () => void; removeLabel?: string; light?: boolean }) {
  const Icon = mime === "application/pdf" ? FileText : ImageIcon;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2.5 text-[12px] font-medium",
      onRemove ? "pr-1" : "pr-2.5", light ? "bg-white/20 text-white" : "border border-slate-200 bg-slate-50 text-slate-700")}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  );
}
