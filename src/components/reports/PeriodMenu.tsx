import { useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import { reportPeriod, type PeriodKey } from "../../../api/lib/reportBooks";
import { BTN, periodWords } from "./ui";

export type PeriodSel = { key: PeriodKey; year?: number; month?: number };

const MENU_ITEM = "flex min-h-11 w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm font-medium text-slate-900 transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:min-h-0";

/** The period button ("📅 Noviembre 2026 ⌄") and its menu, like the prototype's popMenuBtn. */
export function PeriodMenu({ sel, onSel, today, c, className }: {
  sel: PeriodSel;
  onSel: (s: PeriodSel) => void;
  today: string;
  c: ReportesCopy;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));
  const [pickYear, setPickYear] = useState<number>(sel.year ?? thisYear);
  const [pickMonth, setPickMonth] = useState<number>(sel.month ?? thisMonth);
  const label = periodWords(reportPeriod(sel, today), c).label;
  const presets: PeriodKey[] = ["month", "last", "quarter", "year"];
  const quick: PeriodKey[] = ["today", "week"];
  const pick = (s: PeriodSel) => { onSel(s); setOpen(false); };
  const item = (key: PeriodKey) => {
    const on = sel.key === key;
    return (
      <button key={key} type="button" role="menuitemradio" aria-checked={on} className={MENU_ITEM} onClick={() => pick({ key })}>
        {on ? <Check className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" /> : <Calendar className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />}
        {periodWords(reportPeriod({ key }, today), c).label}
      </button>
    );
  };
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  const showOther = () => {
    if (pickMonth === 0) pick(pickYear === thisYear ? { key: "year" } : { key: "pickYear", year: pickYear });
    else pick({ key: "pickMonth", year: pickYear, month: pickMonth });
  };
  const SELECT = "h-11 w-full rounded-[9px] border border-slate-200 bg-white px-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${c.period.label}: ${label}`} className={cn(BTN, "gap-2 data-[state=open]:border-blue-600 data-[state=open]:shadow-[0_0_0_3px_#EFF6FF]", className)}>
          <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" aria-hidden="true" />{label}</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[272px] rounded-[14px] border-slate-200 bg-white p-1.5 shadow-[0_20px_44px_-16px_rgba(15,23,42,0.30),0_2px_6px_rgba(15,23,42,0.05)]">
        <div role="menu" aria-label={c.period.label}>
          {presets.map(item)}
          <div className="mx-1.5 my-1 h-px bg-slate-200" role="separator" />
          {quick.map(item)}
          <div className="mx-1.5 my-1 h-px bg-slate-200" role="separator" />
          <div className="grid gap-2 px-2.5 pb-1.5 pt-1">
            <p className="text-xs font-semibold text-slate-500">{c.period.other}</p>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                {c.period.pickMonth}
                <select className={SELECT} value={pickMonth} onChange={(e) => setPickMonth(Number(e.target.value))}>
                  <option value={0}>{c.period.wholeYear(pickYear)}</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1)
                    .filter((m) => pickYear < thisYear || m <= thisMonth)
                    .map((m) => <option key={m} value={m}>{c.monthName(m).replace(/^./, (x) => x.toUpperCase())}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                {c.period.pickYear}
                <select className={SELECT} value={pickYear} onChange={(e) => { const y = Number(e.target.value); setPickYear(y); if (y === thisYear && pickMonth > thisMonth) setPickMonth(thisMonth); }}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            </div>
            <button type="button" className={cn(BTN, "w-full")} onClick={showOther}>{c.period.show}</button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
