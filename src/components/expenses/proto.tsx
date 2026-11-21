// The prototype's components for Gastos and Proveedores: .head, .kpi, .dst, .seg-tabs, .progress, .note, .src, .back.
import type { ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { btn } from "./ui";

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";

/** `.head`: page title, sub line and the actions at the right (wrapping under on phones). */
export function PageHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-[750] leading-tight tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export type Tone = "good" | "bad" | "open" | "warn" | "muted";
const DST_TONE: Record<Tone, string> = {
  good: "text-emerald-600",
  bad: "text-red-600",
  open: "text-blue-600",
  warn: "text-amber-700",
  muted: "text-slate-500",
};

/** `.dst`: a status with its colored dot (the word says it; the color only helps). */
export function Dst({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold", DST_TONE[tone])}>
      <i className="h-[7px] w-[7px] flex-none rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

/** `.kpi` */
export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-slate-200 bg-white px-4 py-3.5">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-[23px] font-[750] tabular-nums tracking-[-0.02em] text-slate-900">{value}</div>
      <div className={cn("mt-[3px] truncate text-xs", tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-500")}>{sub}</div>
    </div>
  );
}

/** `.seg-tabs`: underlined tabs with a count; they scroll sideways on phones. `right` sits at the end of the bar. */
export function SegTabs<T extends string>({ label, items, value, onChange, right }: {
  label: string;
  items: ReadonlyArray<{ value: T; label: string; count: number | null }>;
  value: T;
  onChange: (v: T) => void;
  right?: ReactNode;
}) {
  return (
    <div className="mb-1 mt-[18px] flex flex-wrap items-end justify-between gap-x-3 border-b border-slate-200">
      <div className="-mb-px flex min-w-0 gap-5 overflow-x-auto [scrollbar-width:none] sm:gap-6 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={label}>
        {items.map((t) => {
          const on = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.value)}
              className={cn(
                "relative inline-flex min-h-11 shrink-0 items-center gap-[7px] whitespace-nowrap border-b-2 pb-3 pt-2.5 text-sm font-semibold transition-colors sm:min-h-0",
                on ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900",
                focus,
              )}
            >
              {t.label}
              {t.count !== null && (
                <span className={cn("min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-bold tabular-nums", on ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
      {right}
    </div>
  );
}

/** `.back`: "← Proveedores". */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("mb-2 inline-flex min-h-11 items-center gap-1.5 rounded py-1 text-[13px] font-semibold text-slate-500 hover:text-slate-900 sm:min-h-0", focus)}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />{label}
    </button>
  );
}

/** `.progress`: a thin bar (green by default). The number next to it says the same in words. */
export function ProgressBar({ pct, tone = "good", label }: { pct: number; tone?: "good" | "warn" | "bad" | "accent"; label: string }) {
  const color = tone === "bad" ? "bg-red-600" : tone === "warn" ? "bg-amber-700" : tone === "accent" ? "bg-blue-600" : "bg-emerald-600";
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)}>
      <div className={cn("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${w}%` }} />
    </div>
  );
}

/** `.note`: a soft blue hint with an icon. */
export function Note({ icon: Icon, children, className }: { icon: typeof FileText; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-[10px] bg-blue-50 px-3 py-2.5 text-[13px] text-slate-900", className)}>
      <Icon className="mt-px h-4 w-4 flex-none text-blue-600" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** `.src`: "De dónde sale:" and its links. */
export function SrcLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-500">
      <FileText className="h-[13px] w-[13px] text-slate-500" aria-hidden="true" />
      <span>{label}</span>
      {children}
    </div>
  );
}

/** "‹ noviembre 2026 ›": the month shown. */
export function MonthNav({ groupLabel, label, prevLabel, nextLabel, currentLabel, canPrev, canNext, isCurrent, onPrev, onNext, onCurrent }: {
  groupLabel: string; label: string; prevLabel: string; nextLabel: string; currentLabel: string;
  canPrev: boolean; canNext: boolean; isCurrent: boolean; onPrev: () => void; onNext: () => void; onCurrent: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 pb-1.5" role="group" aria-label={groupLabel}>
      {!isCurrent && (
        <button type="button" onClick={onCurrent} className={btn("ghost", "sm", "text-blue-700")}>{currentLabel}</button>
      )}
      <button type="button" aria-label={prevLabel} disabled={!canPrev} onClick={onPrev} className={btn("ghost", "sm", "icon", "w-11 sm:w-auto")}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-semibold text-slate-900" aria-live="polite">{label}</span>
      <button type="button" aria-label={nextLabel} disabled={!canNext} onClick={onNext} className={btn("ghost", "sm", "icon", "w-11 sm:w-auto")}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
