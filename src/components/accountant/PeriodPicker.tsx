import { useId } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopy } from "@/i18n/useI18n";
import { accountantCopy } from "@/i18n/copy/accountant";
import { PERIOD_PRESETS, type DateRange, type PeriodPreset, type RangeProblem } from "../../../api/lib/accountant";

/** Period buttons (este mes, mes pasado, trimestre, año, rango) and, for "rango", two dates. */
export function PeriodPicker({
  preset,
  onPreset,
  custom,
  onCustom,
  problem,
}: {
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  custom: DateRange;
  onCustom: (r: DateRange) => void;
  problem: RangeProblem | null;
}) {
  const c = useCopy(accountantCopy);
  const fromId = useId();
  const toId = useId();
  const errorId = useId();

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={c.periodLabel}
        className="flex w-full gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1 sm:w-fit [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preset === p}
            onClick={() => onPreset(p)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30",
              preset === p ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700",
            )}
          >
            {c.presets[p]}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={fromId} className="text-xs text-neutral-500">{c.from}</Label>
              <Input
                id={fromId}
                type="date"
                value={custom.startDate}
                max={custom.endDate || undefined}
                onChange={(e) => onCustom({ ...custom, startDate: e.target.value })}
                aria-invalid={problem !== null}
                aria-describedby={problem ? errorId : undefined}
                className="h-10 rounded-xl border-neutral-200 text-sm sm:w-44"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor={toId} className="text-xs text-neutral-500">{c.to}</Label>
              <Input
                id={toId}
                type="date"
                value={custom.endDate}
                min={custom.startDate || undefined}
                onChange={(e) => onCustom({ ...custom, endDate: e.target.value })}
                aria-invalid={problem !== null}
                aria-describedby={problem ? errorId : undefined}
                className="h-10 rounded-xl border-neutral-200 text-sm sm:w-44"
              />
            </div>
          </div>
          {problem && (
            <p id={errorId} role="alert" className="text-xs text-red-600">{c.rangeErrors[problem]}</p>
          )}
        </div>
      )}
    </div>
  );
}
