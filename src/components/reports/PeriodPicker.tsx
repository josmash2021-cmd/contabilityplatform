import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCopy } from "@/i18n/useI18n";
import { reportesCopy } from "@/i18n/copy/reportes";
import type { Period } from "./format";

const PERIODS: Period[] = ["today", "week", "month", "year"];

/** One row above everything it scopes: Hoy / Semana / Mes / Año, plus the month and year pickers. */
export function PeriodPicker({
  period, onPeriod, month, onMonth, year, onYear, months, years, coverage,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  month: number;
  onMonth: (m: number) => void;
  year: number;
  onYear: (y: number) => void;
  months: Array<{ value: number; label: string }>;
  years: number[];
  /** What dates the numbers cover, in words. */
  coverage: string;
}) {
  const t = useCopy(reportesCopy).period;
  return (
    <section aria-label={t.label} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p id="rep-period-label" className="mb-1.5 text-xs font-medium text-slate-500">{t.label}</p>
          <div role="group" aria-labelledby="rep-period-label" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 md:inline-grid md:w-auto">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => onPeriod(p)}
                className={cn(
                  "h-11 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:h-9 md:px-5",
                  period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                )}
              >
                {t.options[p]}
              </button>
            ))}
          </div>
        </div>

        {(period === "month" || period === "year") && (
          <div className="flex gap-2">
            {period === "month" && (
              <div className="min-w-0 flex-1 md:w-44 md:flex-none">
                <label htmlFor="rep-month" className="mb-1.5 block text-xs font-medium text-slate-500">{t.month}</label>
                <Select value={String(month)} onValueChange={(v) => onMonth(Number(v))}>
                  <SelectTrigger id="rep-month" className="h-11 w-full rounded-[10px] border-slate-200 text-sm md:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (<SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-28 shrink-0">
              <label htmlFor="rep-year" className="mb-1.5 block text-xs font-medium text-slate-500">{t.year}</label>
              <Select value={String(year)} onValueChange={(v) => onYear(Number(v))}>
                <SelectTrigger id="rep-year" className="h-11 w-full rounded-[10px] border-slate-200 text-sm tabular-nums md:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2.5 text-sm text-slate-500" aria-live="polite">{coverage}</p>
    </section>
  );
}
