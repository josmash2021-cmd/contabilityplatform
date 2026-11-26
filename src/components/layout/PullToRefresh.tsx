// ── Pull down to refresh (owner, 2026-11-26) ──
// On a touch screen, at the very top of a page (Inicio, Banco), pull the page down and let go: a small circle comes
// down from under the top bar, its blue arc fills while pulling, it turns while the page asks again, and goes with a
// check when it's done. Only a downward pull that starts at the top counts (a sideways swipe, a sheet, a dialog or
// a field never start it). The page itself doesn't move: nothing jumps. Reduced motion: no turning, just the arc.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useInView";

/** How far (after the resistance) the pull must go to refresh. */
export const PULL_AT = 64;
const MAX = 96;
const MIN_SPIN_MS = 700;
const MAX_WAIT_MS = 15_000;

type Phase = "idle" | "pull" | "spin" | "done";

export function PullToRefresh({ onRefresh, label }: { onRefresh: () => Promise<unknown>; label: { pulling: string; refreshing: string; done: string } }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dist, setDist] = useState(0);
  const [top, setTop] = useState(0);
  const reduce = useReducedMotion();
  const run = useRef(onRefresh);
  useEffect(() => { run.current = onRefresh; }, [onRefresh]);
  const busy = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches) return;
    // the app's own scrolling <main> (AppLayout), not a page's inner one: its scrollTop says if we're at the top
    const main = document.querySelector<HTMLElement>("main[data-app-main]") ?? document.querySelector<HTMLElement>("main");
    if (!main) return;
    let startX = 0, startY = 0, tracking = false, pulling = false, d = 0;
    const blocked = (t: EventTarget | null) => t instanceof Element && !!t.closest("[role='dialog'], [data-ab-panel], [data-no-pull], input, textarea, select, [contenteditable='true']");
    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || main.scrollTop > 0 || blocked(e.target)) { tracking = false; return; }
      tracking = true; pulling = false; d = 0;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
      if (!pulling) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { tracking = false; return; } // a sideways swipe
        if (dy < 0 || main.scrollTop > 0) { tracking = false; return; } // scrolling down the page
        if (dy < 8) return;
        pulling = true;
        setTop(main.getBoundingClientRect().top);
        setPhase("pull");
      }
      if (e.cancelable) e.preventDefault(); // the browser's own bounce stays out of it
      d = Math.min(MAX, Math.max(0, (dy - 8) * 0.45));
      setDist(d);
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!pulling) return;
      pulling = false;
      if (d < PULL_AT) { setPhase("idle"); setDist(0); return; }
      busy.current = true;
      setPhase("spin"); setDist(PULL_AT);
      const started = Date.now();
      const timeout = new Promise((r) => setTimeout(r, MAX_WAIT_MS));
      void Promise.race([run.current().catch(() => undefined), timeout]).then(async () => {
        const left = MIN_SPIN_MS - (Date.now() - started);
        if (left > 0) await new Promise((r) => setTimeout(r, left));
        setPhase("done");
        setTimeout(() => { setPhase("idle"); setDist(0); busy.current = false; }, 650);
      });
    };
    main.addEventListener("touchstart", onStart, { passive: true });
    main.addEventListener("touchmove", onMove, { passive: false });
    main.addEventListener("touchend", onEnd);
    main.addEventListener("touchcancel", onEnd);
    return () => {
      main.removeEventListener("touchstart", onStart);
      main.removeEventListener("touchmove", onMove);
      main.removeEventListener("touchend", onEnd);
      main.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const shown = phase !== "idle";
  const fill = phase === "pull" ? Math.min(1, dist / PULL_AT) : 1;
  const C = 2 * Math.PI * 9;
  // On <body>: the page sits in an animated wrapper (.page-fx) that would carry a fixed element along with it
  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-40 flex justify-center" style={{ top }} data-pull={phase}>
      <span className="sr-only">{phase === "spin" ? label.refreshing : phase === "done" ? label.done : phase === "pull" ? label.pulling : ""}</span>
      <span
        aria-hidden="true"
        className={cn("grid h-9 w-9 place-items-center rounded-full bg-white shadow-[0_6px_18px_-6px_rgba(15,23,42,.35),0_0_0_1px_rgba(15,23,42,.05)]",
          phase === "pull" ? "" : "[transition:transform_.35s_cubic-bezier(.33,0,.15,1),opacity_.3s_ease]")}
        // it comes down into the empty middle beside the greeting (56 px under the top bar), never over words or numbers
        style={{ opacity: shown ? (phase === "pull" ? Math.min(1, dist / 24) : phase === "done" ? 0 : 1) : 0, transform: `translateY(${shown ? -40 + dist * 1.5 : -40}px) scale(${phase === "done" ? 0.85 : 1})` }}
      >
        {phase === "done" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" className={cn(phase === "spin" && !reduce && "animate-spin [animation-duration:.9s]")} style={{ transform: phase === "pull" ? `rotate(${fill * 270 - 90}deg)` : undefined }}>
            <circle cx="12" cy="12" r="9" fill="none" stroke="#e2e8f0" strokeWidth="2.4" />
            <circle cx="12" cy="12" r="9" fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round"
              strokeDasharray={`${(phase === "spin" ? 0.72 : fill * 0.86) * C} ${C}`} transform="rotate(-90 12 12)" />
          </svg>
        )}
      </span>
    </div>,
    document.body,
  );
}
