import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromMonthIndex, monthIndex, monthLabel, type YearMonth } from "./personalUtils";

type Props = {
  value: YearMonth;
  /** First and last months you can pick. */
  min: YearMonth;
  max: YearMonth;
  onChange: (p: YearMonth) => void;
  locale: string;
  labels: { month: string; prev: string; next: string };
  /** A dropdown to jump to any month (for short ranges); otherwise the month shows as text. */
  picker?: boolean;
  /** Show the "Month" label above (inside toolbars). */
  showLabel?: boolean;
  className?: string;
};

/** ‹ Noviembre de 2026 ›: steps one month at a time, never past `max`. */
export function MonthNav({ value, min, max, onChange, locale, labels, picker = false, showLabel = false, className }: Props) {
  const id = useId();
  const i = monthIndex(value);
  const canPrev = i > monthIndex(min);
  const canNext = i < monthIndex(max);
  const arrow =
    "grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 sm:h-10 sm:w-10";
  const options: YearMonth[] = [];
  if (picker) for (let k = monthIndex(max); k >= monthIndex(min); k--) options.push(fromMonthIndex(k));

  return (
    <div className={className}>
      {showLabel && <label htmlFor={`${id}-m`} className="mb-1.5 block text-xs font-medium text-slate-600">{labels.month}</label>}
      <div className="flex items-center gap-1.5" role="group" aria-label={labels.month}>
        <button type="button" className={arrow} aria-label={labels.prev} disabled={!canPrev} onClick={() => onChange(fromMonthIndex(i - 1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {picker ? (
          <select id={`${id}-m`} value={i} aria-label={showLabel ? undefined : labels.month}
            onChange={(e) => onChange(fromMonthIndex(Number(e.target.value)))}
            className="h-11 min-w-0 flex-1 rounded-[10px] border border-slate-200 bg-white px-3 text-base font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10 sm:text-sm">
            {options.map((p) => <option key={monthIndex(p)} value={monthIndex(p)}>{monthLabel(p, locale)}</option>)}
          </select>
        ) : (
          <p id={`${id}-m`} className={cn("min-w-[10rem] flex-1 text-center text-sm font-semibold text-slate-900")} aria-live="polite">{monthLabel(value, locale)}</p>
        )}
        <button type="button" className={arrow} aria-label={labels.next} disabled={!canNext} onClick={() => onChange(fromMonthIndex(i + 1))}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
