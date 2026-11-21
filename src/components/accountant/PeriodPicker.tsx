import { useId } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopy } from "@/i18n/useI18n";
import { accountantCopy } from "@/i18n/copy/accountant";
import { SEG, SEG_BTN } from "@/components/reports/ui";
import { FIELD, LABEL } from "./ui";
import { PERIOD_PRESETS, type DateRange, type PeriodPreset, type RangeProblem } from "../../../api/lib/accountant";

/** Period buttons as the prototype's segmented control (este mes, mes pasado, trimestre, año, rango) and, for "rango", two dates. */
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
      <div role="group" aria-label={c.periodLabel} className={cn(SEG, "w-full sm:w-auto")}>
        {PERIOD_PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={preset === p} onClick={() => onPreset(p)} className={cn(SEG_BTN, "px-2 min-[480px]:px-3.5")}>
            {c.presets[p]}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={fromId} className={LABEL}>{c.from}</Label>
              <Input
                id={fromId}
                type="date"
                value={custom.startDate}
                max={custom.endDate || undefined}
                onChange={(e) => onCustom({ ...custom, startDate: e.target.value })}
                aria-invalid={problem !== null}
                aria-describedby={problem ? errorId : undefined}
                className={cn(FIELD, "sm:w-44")}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor={toId} className={LABEL}>{c.to}</Label>
              <Input
                id={toId}
                type="date"
                value={custom.endDate}
                min={custom.startDate || undefined}
                onChange={(e) => onCustom({ ...custom, endDate: e.target.value })}
                aria-invalid={problem !== null}
                aria-describedby={problem ? errorId : undefined}
                className={cn(FIELD, "sm:w-44")}
              />
            </div>
          </div>
          {problem && (
            <p id={errorId} role="alert" className="text-sm text-red-700">{c.rangeErrors[problem]}</p>
          )}
        </div>
      )}
    </div>
  );
}
