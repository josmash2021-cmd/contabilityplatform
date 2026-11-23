// The sign-up / sign-in side panel's showcase: the real app (screenshots of demo accounts, in public/auth-showcase/
// <lang>/) on a computer and on a phone, straight on, changing screens by themselves: Inicio, Bancos, Reportes,
// Impuestos for a business; Inicio, Presupuestos, Metas, Impuestos for personal. The frames stay still; only the
// screen inside changes, by "fade through" (the old one fades away, then the new one fades in rising a little), so
// nothing jumps or cuts. Negocio / Personal and the language change the same way.
// Retake the pictures with pbs-dev: mysqltest/demo-seed.ts, then browser/cdp-realshots-body.mjs.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { marketingCopy } from "@/i18n/copy/marketing";
import { PhoneCase, PhoneChrome, PhoneStatusBar } from "./PhoneKit";

type Mode = "business" | "personal";
type Lang = "es" | "en";

/** The screens, in order (each has a computer and a phone picture). */
const SCENES: Record<Mode, string[]> = {
  business: ["biz-home", "biz-bank", "biz-reports", "biz-taxes"],
  personal: ["per-home", "per-budgets", "per-goals", "per-taxes"],
};
const HOLD_MS = 4600;
// The devices' own sizes: the browser window (its bar + the 1280 × 890 picture at 620 wide), the phone with its case.
const PC_W = 620, BAR_H = 40, PC_IMG_H = Math.round(PC_W * 890 / 1280), PC_H = BAR_H + PC_IMG_H;
const PHONE_W = 316, SCREEN_W = 286, STATUS_H = 46, SCREEN_IMG_H = Math.round(SCREEN_W * 844 / 390), PHONE_H = STATUS_H + SCREEN_IMG_H + 28;
const PHONE_OF_PC = 0.62;
const src = (lang: Lang, key: string, dev: "pc" | "tel") => `/auth-showcase/${lang}/${key}-${dev}.webp`;
const id = (l: Lang, m: Mode, i: number) => `${l}|${m}|${i}`;

/**
 * A screen's layer, changing by "fade through": the old screen fades away first, then the new one fades in
 * rising a little, so two screens never pile up. Written as the CSS properties themselves ("duration-[…]" and
 * "ease-[…]" also match tailwindcss-animate, so Tailwind would skip them).
 */
function layer(state: "on" | "gone" | "next") {
  return cn("absolute inset-0 transition-[opacity,transform] will-change-[opacity,transform] [transition-timing-function:cubic-bezier(0.37,0,0.63,1)] motion-reduce:transition-none",
    state === "on" ? "translate-y-0 scale-100 opacity-100 [transition-delay:360ms] [transition-duration:820ms]"
      : state === "gone" ? "-translate-y-1 scale-[0.99] opacity-0 [transition-duration:460ms]"
        : "translate-y-3 scale-[0.985] opacity-0 [transition-duration:460ms]");
}

export function AuthShowcase({ mode }: { mode: Mode }) {
  const { previews } = useCopy(marketingCopy);
  const lang: Lang = useLang().lang === "en" ? "en" : "es";
  const still = useReducedMotion();
  const [view, setView] = useState<{ cur: string; prev: string | null }>(() => ({ cur: id(lang, mode, 0), prev: null }));

  // The size: as big as the space allows, measured before the first paint so nothing resizes on screen.
  const boxRef = useRef<HTMLDivElement>(null);
  const [pc, setPc] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const k = Math.min((width - 4) / (PC_W + PHONE_W * PHONE_OF_PC * 0.55), (height - 8) / (PC_H * 1.12), 0.84);
      setPc(Math.max(0.3, Math.round(k * 1000) / 1000));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ph = pc * PHONE_OF_PC;

  // Negocio / Personal or the language changed: the new set mounts hidden ("next") and is switched on two frames
  // later, so its first screen fades in after the old one fades away, like every other change (on timers, never
  // straight from the effect).
  const setRef = useRef(`${lang}|${mode}`);
  const [armed, setArmed] = useState(true);
  useEffect(() => {
    let raf = 0;
    const t = window.setTimeout(() => {
      const key = `${lang}|${mode}`;
      if (setRef.current === key) return;
      setRef.current = key;
      setArmed(false);
      setView((v) => ({ prev: v.cur, cur: id(lang, mode, 0) }));
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setArmed(true)); });
    }, 0);
    return () => { window.clearTimeout(t); cancelAnimationFrame(raf); };
  }, [mode, lang]);

  // The screens take turns, each one long enough to look at.
  useEffect(() => {
    if (still) return;
    const t = window.setInterval(() => {
      setView((v) => {
        const [l, m, i] = v.cur.split("|") as [Lang, Mode, string];
        return { prev: v.cur, cur: id(l, m, (Number(i) + 1) % SCENES[m].length) };
      });
    }, HOLD_MS);
    return () => window.clearInterval(t);
  }, [still, mode, lang]);

  // The layers: the current set, plus the one fading out when the set itself changed.
  const sets = [view.cur, view.prev].filter((x): x is string => !!x).map((x) => x.split("|").slice(0, 2).join("|"));
  const layers = [...new Set(sets)].flatMap((set) => {
    const [l, m] = set.split("|") as [Lang, Mode];
    return SCENES[m].map((key, i) => ({ key: id(l, m, i), l, shot: key }));
  });
  const state = (x: string) => (x === view.cur ? (armed ? "on" : "next") : x === view.prev ? "gone" : "next");

  return (
    <div ref={boxRef} className="relative h-full min-h-0 w-full">
      <div role="img" aria-label={previews.show.aria} data-showcase={view.cur}
        className={cn("absolute left-0 top-1/2 -translate-y-1/2", pc ? "" : "invisible")}
        style={{ height: PC_H * pc * 1.12, width: PC_W * pc + PHONE_W * ph * 0.55 }}>
        {/* The computer: a browser window with the app in it */}
        <div aria-hidden className="absolute left-0 top-0 animate-[show-in_1.7s_cubic-bezier(0.33,0,0.15,1)_both] [animation-delay:560ms] motion-reduce:animate-none">
          <div className="animate-soft-float [animation-duration:7s]">
            <div style={{ width: PC_W * pc, height: PC_H * pc }}>
              <div className="origin-top-left overflow-hidden rounded-2xl bg-white shadow-[0_40px_80px_-32px_rgba(30,58,138,0.55)] ring-1 ring-slate-900/5" style={{ width: PC_W, transform: `scale(${pc})` }}>
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4" style={{ height: BAR_H }}>
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="ml-3 truncate rounded-md bg-white px-3 py-1 text-[11px] text-slate-400 ring-1 ring-slate-200">aethelaccountingplatform.com</span>
                  <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-[10.5px] font-medium text-slate-500">{previews.sample}</span>
                </div>
                <div className="relative bg-white" style={{ height: PC_IMG_H }}>
                  {layers.map((x) => (
                    <div key={x.key} data-layer={state(x.key)} className={layer(state(x.key))}>
                      <img src={src(x.l, x.shot, "pc")} alt="" width={1040} height={723} decoding="async" draggable={false} className="block h-full w-full object-cover object-top" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The phone, in front */}
        <div aria-hidden className="absolute bottom-0 right-0 animate-[show-side_1.7s_cubic-bezier(0.33,0,0.15,1)_both] [animation-delay:820ms] motion-reduce:animate-none">
          <div className="animate-soft-float [animation-delay:1.2s] [animation-duration:7s]">
            <div style={{ width: PHONE_W * ph, height: PHONE_H * ph }}>
              <div className="origin-top-left" style={{ width: PHONE_W, transform: `scale(${ph})` }}>
                <PhoneCase label="">
                  <div className="relative overflow-hidden rounded-[2.6rem] bg-white [contain:paint]" style={{ height: STATUS_H + SCREEN_IMG_H }}>
                    <PhoneChrome />
                    <PhoneStatusBar />
                    <div className="absolute inset-x-0 bottom-0" style={{ top: STATUS_H }}>
                      {layers.map((x) => (
                        <div key={x.key} data-layer={state(x.key)} className={layer(state(x.key))}>
                          <img src={src(x.l, x.shot, "tel")} alt="" width={390} height={844} decoding="async" draggable={false} className="block h-full w-full object-cover object-top" />
                        </div>
                      ))}
                    </div>
                  </div>
                </PhoneCase>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
