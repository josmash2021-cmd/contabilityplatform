// Motion helpers for the site's moving pictures: they play only while on screen, and stay still for
// people who turn motion off.
import { useEffect, useRef, useState } from "react";

/** True when the person asked their device for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    const onChange = () => setReduced(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * A ref to attach, and whether that element is (at least a quarter) on screen.
 * With `once`, it stays true after the first time (for entrances that shouldn't play again).
 */
export function useInView<T extends Element>(opts: { once?: boolean; threshold?: number } = {}) {
  const { once = false, threshold = 0.25 } = opts;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (!once) { setInView(e.isIntersecting); return; }
      if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold]);
  return [ref, inView] as const;
}
