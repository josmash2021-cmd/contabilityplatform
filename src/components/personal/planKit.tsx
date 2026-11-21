// Small pieces the prototype's Presupuestos, Metas and Suscripciones screens share: the page head, the
// status chip with a dot (.dst), the KPI card, the progress bar and the muted footnote. Tailwind versions
// of the prototype's classes (see brief-proto.md).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Prototype card (.card). */
export const pcard = "rounded-[14px] border border-slate-200 bg-white p-4";
/** Prototype buttons (.btn, .btn.sm, .btn.primary). */
export const pbtn =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 sm:min-h-10";
export const pbtnPrimary =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:min-h-10";
export const pbtnSm =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 sm:min-h-9";
export const pbtnSmPrimary =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 sm:min-h-9";
export const pinput =
  "min-h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 tabular-nums focus-visible:border-blue-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-50 sm:min-h-10 sm:text-sm";
export const plabel = "mb-1.5 block text-[13px] font-semibold text-slate-700";
export const linkBtn = "inline-flex min-h-10 items-center gap-1.5 rounded-md text-[13px] font-semibold text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0";

/** Title, sub line and the actions on the right (they wrap under on phones). */
export function PageHead({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
      <div className="min-w-0 flex-[1_1_260px]">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">{title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{sub}</p>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

export type Tone = "good" | "bad" | "warn" | "open" | "muted";
const TONE: Record<Tone, string> = { good: "text-emerald-600", bad: "text-red-600", warn: "text-amber-700", open: "text-blue-600", muted: "text-slate-500" };

/** Status with a dot (.dst): "● Cuidado". */
export function Dst({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold", TONE[tone], className)}>
      <i className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" aria-hidden="true" />{children}
    </span>
  );
}

/** KPI card (.kpi): label, big value, small line. */
export function Kpi({ k, v, s }: { k: string; v: string; s?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-[13px] text-slate-500">{k}</p>
      <p className="mt-0.5 text-[23px] font-bold tabular-nums tracking-tight text-slate-900">{v}</p>
      {s && <p className="mt-0.5 text-xs text-slate-500">{s}</p>}
    </div>
  );
}

/** 8px progress bar (.progress); green unless told otherwise. */
export function Bar({ pct, tone = "good", label, className }: { pct: number; tone?: "good" | "blue" | "muted"; label: string; className?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} className={cn("mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-300", tone === "good" ? "bg-emerald-600" : tone === "blue" ? "bg-blue-600" : "bg-slate-400")} style={{ width: `${p}%` }} />
    </div>
  );
}

/** The muted footnote with an icon (.g-note). */
export function Note({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-3.5 flex items-start gap-2 text-xs text-slate-500", className)}>
      <span className="mt-px shrink-0" aria-hidden="true">{icon}</span><span>{children}</span>
    </p>
  );
}
