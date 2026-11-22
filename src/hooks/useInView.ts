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

/** A ref to attach, and whether that element is (at least a quarter) on screen. */
export function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}
