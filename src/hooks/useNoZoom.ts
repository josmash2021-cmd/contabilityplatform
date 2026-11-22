// The public site and the sign-in pages don't zoom; the app does (the owner asked for it this way).
// While a page that calls this is open, the zoom gestures and keys do nothing: pinch and double tap on phones,
// Ctrl/⌘ + wheel and trackpad pinch on computers, Ctrl/⌘ + plus, minus and zero. Scrolling, taps, typing and
// selecting text work as always. Leaving the page (into the app) puts everything back.
// Note: on computers the browser remembers its zoom per site, so a zoom made inside the app can carry over.
import { useEffect } from "react";

const LOCKED = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
const ZOOM_KEYS = new Set(["+", "-", "=", "_", "0"]);
const ZOOM_CODES = new Set(["NumpadAdd", "NumpadSubtract", "Numpad0"]);

export function useNoZoom(): void {
  useEffect(() => {
    // Phones: the page can't scale.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", LOCKED);
    // Pinch and double tap don't zoom; one finger still scrolls both ways.
    const root = document.documentElement;
    const touchBefore = root.style.touchAction;
    root.style.touchAction = "pan-x pan-y";

    const block = (e: Event) => e.preventDefault();
    // Two fingers moving = a pinch (Safari doesn't always honor the viewport above).
    const onTouchMove = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    // Ctrl/⌘ + wheel, and a trackpad pinch (it arrives as a wheel with Ctrl).
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (ZOOM_KEYS.has(e.key) || ZOOM_CODES.has(e.code))) e.preventDefault();
    };
    const opts = { passive: false } as const;
    document.addEventListener("touchmove", onTouchMove, opts);
    // Safari's own pinch events (iPhone, iPad and Mac).
    document.addEventListener("gesturestart", block, opts);
    document.addEventListener("gesturechange", block, opts);
    window.addEventListener("wheel", onWheel, opts);
    window.addEventListener("keydown", onKey);
    return () => {
      if (meta && before !== null) meta.setAttribute("content", before);
      root.style.touchAction = touchBefore;
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}
