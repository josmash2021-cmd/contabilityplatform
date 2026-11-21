// The prototype's building blocks for Facturas and Cotizaciones, in Tailwind:
// .head, .kpi, .dst, .seg-tabs, .btn, .pop-menu, .tline, .card, .lock, .money-in.
// Phones get 44px tap targets; from `sm` up, buttons keep the prototype's 40px / 34px.
import { useId, type ReactNode } from "react";
import { ArrowLeft, Lock, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { btn, FIELD } from "./ui";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** `.head`: page title, sub line and the main action at the right. */
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

/** `.back`: "← Facturas". */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-2 inline-flex min-h-11 items-center gap-1.5 rounded py-1 text-[13px] font-semibold text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />{label}
    </button>
  );
}

/** `.dst`: a status with its colored dot (the word always says it; the color only helps). */
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
      <div className={cn("mt-[3px] text-xs", tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-500")}>{sub}</div>
    </div>
  );
}

/** `.seg-tabs`: underlined tabs with a count; on phones they scroll sideways. */
export function SegTabs<T extends string>({ label, items, value, onChange }: {
  label: string;
  items: ReadonlyArray<{ value: T; label: string; count: number | null }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-1 mt-[18px] border-b border-slate-200">
      <div className="-mb-px flex gap-5 overflow-x-auto [scrollbar-width:none] sm:gap-6 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={label}>
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
                "relative inline-flex min-h-11 flex-none items-center gap-[7px] whitespace-nowrap border-b-2 pb-3 pt-2.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
                on ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900",
              )}
            >
              <span>{t.label}</span>
              {t.count !== null && (
                <span className={cn("min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-bold tabular-nums", on ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type MenuItem = { key: string; label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean } | "sep";

/** `.pop-dd` / `.pop-menu`: the "…" menu. */
export function PopMenu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const clean = items.filter((x, i) => x !== "sep" || (i > 0 && i < items.length - 1 && items[i - 1] !== "sep"));
  if (clean.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(btn("icon"), "w-11 sm:w-10 data-[state=open]:border-blue-600 data-[state=open]:shadow-[0_0_0_3px_#EFF6FF]")} aria-label={label} title={label}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[236px] rounded-[14px] border-slate-200 bg-white p-1.5 shadow-[0_20px_44px_-16px_rgba(15,23,42,0.30),0_2px_6px_rgba(15,23,42,0.05)]">
        {clean.map((x, i) => x === "sep" ? (
          <DropdownMenuSeparator key={`sep${i}`} className="mx-1.5 my-1 bg-slate-200" />
        ) : (
          <DropdownMenuItem
            key={x.key}
            onSelect={x.onSelect}
            className={cn(
              "min-h-11 gap-2.5 rounded-[9px] px-2.5 py-[9px] text-sm font-medium focus:bg-slate-100 sm:min-h-0",
              x.danger ? "text-red-600 focus:text-red-600 [&_svg]:!text-red-600" : "text-slate-900 [&_svg]:!text-slate-500",
            )}
          >
            <x.icon className="h-4 w-4" aria-hidden="true" />
            {x.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** `.btn.locked`: a feature the plan doesn't include. */
export function LockedButton({ label, title, icon: Icon = Lock, onClick, className }: { label: string; title: string; icon?: LucideIcon; onClick?: () => void; className?: string }) {
  return (
    <button type="button" className={cn(btn("sm", "locked"), className)} title={title} aria-label={`${label} · ${title}`} onClick={onClick}>
      <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
      {label}
    </button>
  );
}

export type TimelineItem = { id: string; day: string; text: string; tone?: "good" | "bad" };

/** `.tline`: date, dot and text. */
export function Timeline({ items }: { items: readonly TimelineItem[] }) {
  return (
    <ul className="mt-3">
      {items.map((e, i) => (
        <li key={e.id} className="relative grid grid-cols-[50px_minmax(0,1fr)] gap-2.5 pb-3.5 text-[13px] last:pb-0">
          <span className="text-xs text-slate-500">{e.day}</span>
          <span className="pl-[18px] text-slate-900">{e.text}</span>
          <span
            className={cn("absolute left-[60px] top-[5px] h-2 w-2 rounded-full", e.tone === "good" ? "bg-emerald-600" : e.tone === "bad" ? "bg-red-600" : "bg-blue-600")}
            aria-hidden="true"
          />
          {i < items.length - 1 && <span className="absolute bottom-0 left-[63.5px] top-[15px] w-px bg-slate-200" aria-hidden="true" />}
        </li>
      ))}
    </ul>
  );
}

/** `.money-in`: a dollar amount field. */
export function MoneyInput({ label, value, onChange, invalid, describedBy, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; invalid?: boolean; describedBy?: string; autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid w-full gap-1 text-xs font-semibold text-slate-500 sm:w-auto">
      {label}
      <span className="relative block w-full sm:w-40">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(FIELD, "pl-6 tabular-nums font-semibold", invalid && "border-red-400")}
        />
      </span>
    </label>
  );
}
