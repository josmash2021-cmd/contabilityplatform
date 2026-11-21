// The prototype's small pieces for Cobrar, Clientes and Productos y servicios:
// .head, .seg-tabs, .note, .kpi, .money-in, .dst, the "…" menu.
import type { ReactNode } from "react";
import { MoreHorizontal, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MONEY_INPUT, btn } from "./ui";

/** `.head`: page title, sub line and the actions at the right. */
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

/** `.seg-tabs`: underlined tabs with a count; on phones they scroll sideways. */
export function SegTabs<T extends string>({ label, items, value, onChange }: {
  label: string;
  items: ReadonlyArray<{ value: T; label: string; count: number }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-[18px] border-b border-slate-200">
      <div className="-mb-px flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={label}>
        {items.map((t) => {
          const on = t.value === value;
          return (
            <button
              key={t.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.value)}
              className={cn(
                "relative inline-flex min-h-11 flex-none items-center gap-[7px] whitespace-nowrap border-b-2 pb-3 pt-2.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
                on ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900",
              )}
            >
              {t.label}
              <span className={cn("min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-bold tabular-nums", on ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>{t.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** `.note`: a tip in the accent's soft color, with the sparkle. */
export function Note({ children, action, icon: Icon = Sparkles, className }: { children: ReactNode; action?: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start gap-2.5 rounded-[10px] bg-blue-50 px-3 py-2.5 text-[13px] text-slate-900 sm:flex-nowrap sm:items-center", className)}>
      <Icon className="mt-px h-[18px] w-[18px] flex-none text-blue-600 sm:mt-0" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
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

/** `.money-in`: a money box with "$" inside. */
export function MoneyIn({ id, value, onChange, placeholder, label, className, autoFocus, onEnter }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; label?: string; className?: string; autoFocus?: boolean; onEnter?: () => void;
}) {
  return (
    <span className={cn("relative block w-full max-w-[220px]", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500" aria-hidden>$</span>
      <input
        id={id} inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder} aria-label={label} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
        onKeyDown={onEnter ? (e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } } : undefined}
        className={MONEY_INPUT}
      />
    </span>
  );
}

export type Tone = "good" | "bad" | "warn" | "open" | "muted";
const DST: Record<Tone, string> = { good: "text-emerald-600", bad: "text-red-600", warn: "text-amber-700", open: "text-blue-600", muted: "text-slate-500" };

/** `.dst`: a status with its colored dot (the word always says it; the color only helps). */
export function Dst({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold", DST[tone])}>
      <i className="h-[7px] w-[7px] flex-none rounded-full bg-current" aria-hidden />{label}
    </span>
  );
}

export type MenuItem = { key: string; label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean } | "sep";

/** The "…" menu (`.pop-menu`). */
export function PopMenu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const clean = items.filter((x, i) => x !== "sep" || (i > 0 && i < items.length - 1 && items[i - 1] !== "sep"));
  if (clean.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(btn("icon"), "data-[state=open]:border-blue-600")} aria-label={label} title={label}>
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[236px] rounded-[14px] border-slate-200 bg-white p-1.5 shadow-[0_20px_44px_-16px_rgba(15,23,42,0.30),0_2px_6px_rgba(15,23,42,0.05)]">
        {clean.map((x, i) => x === "sep" ? (
          <DropdownMenuSeparator key={`sep${i}`} className="mx-1.5 my-1 bg-slate-200" />
        ) : (
          <DropdownMenuItem
            key={x.key} onSelect={x.onSelect}
            className={cn(
              "min-h-11 gap-2.5 rounded-[9px] px-2.5 py-[9px] text-sm font-medium focus:bg-slate-100 sm:min-h-0",
              x.danger ? "text-red-600 focus:text-red-600 [&_svg]:!text-red-600" : "text-slate-900 [&_svg]:!text-slate-500",
            )}
          >
            <x.icon className="h-4 w-4" aria-hidden />{x.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
