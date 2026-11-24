import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Banknote, Check, CircleCheckBig, FileText, Inbox, ScanSearch, Send, Signature, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy } from "@/i18n/copy/taxes";
import { taxLiveCopy } from "@/i18n/copy/taxLive";
import { TAX_STEP_COUNT } from "@contracts/taxRules";

const ICONS: LucideIcon[] = [Inbox, ScanSearch, FileText, Signature, Send, BadgeCheck, Banknote, CircleCheckBig];
const LAST = TAX_STEP_COUNT - 1;

/**
 * Where the return is, after sending, live: the step now in big, then the 8 steps on a line. When the preparer moves
 * it forward, the current step turns green with its check, the line runs to the next one and the new one lights up
 * (a soft pulse that breathes), while the title changes coming out of a blur. Finished steps can be tapped to see
 * what happened at them (TaxStepPanel below).
 */
export function TaxStatusCard({ year, step, stepDates, selected, onSelect }: {
  year: number; step: number; stepDates: ReadonlyArray<string | null> | null | undefined; selected: number; onSelect: (i: number) => void;
}) {
  const t = useCopy(taxLiveCopy).status;
  const tt = useCopy(taxesCopy);
  const locale = intlLocale(useLang().lang);
  const [view, setView] = useState({ done: step, fill: step, now: step, arrive: false, swap: 0 });
  const prev = useRef(step);

  useEffect(() => {
    const from = prev.current;
    prev.current = step;
    if (step === from) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (step < from) {
      timers.push(setTimeout(() => setView((v) => ({ done: step, fill: step, now: step, arrive: false, swap: v.swap + 1 })), 0));
    } else {
      timers.push(setTimeout(() => setView((v) => ({ ...v, done: step, arrive: false })), 0));
      timers.push(setTimeout(() => setView((v) => ({ ...v, fill: step })), 300));
      timers.push(setTimeout(() => setView((v) => ({ ...v, now: step, arrive: true, swap: v.swap + 1 })), 1350));
      timers.push(setTimeout(() => setView((v) => ({ ...v, arrive: false })), 2600));
    }
    return () => timers.forEach(clearTimeout);
  }, [step]);

  const finished = view.now >= LAST && view.done >= LAST;
  const when = (i: number) => {
    const iso = stepDates?.[i];
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    return d.toDateString() === now.toDateString()
      ? t.today(d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }))
      : d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  };
  const short = (i: number) => {
    const iso = stepDates?.[i];
    return iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "";
  };
  const Icon = ICONS[view.now] ?? FileText;
  const next = view.now < LAST ? tt.steps[view.now + 1]?.[0] : null;
  const hint = t.hints[view.now];
  const fill = Math.max(0, Math.min(view.fill, LAST)) / LAST;

  return (
    <section className="rounded-[16px] border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="tax-status-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tax-status-h" className="text-[13px] font-semibold text-slate-500">{tt.p.track.title(year)}</h2>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <i className="tx-ping relative h-[7px] w-[7px] rounded-full bg-emerald-600" aria-hidden="true" />{finished ? t.finished : t.live}
        </span>
      </div>

      <div key={view.swap} className={cn("mt-3.5 flex items-start gap-3.5", view.swap > 0 && "tx-focus")} aria-live="polite">
        <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-[14px] transition-colors duration-700", view.now >= 5 ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600")} aria-hidden="true">
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-slate-500">{t.stepOf(view.now + 1, when(view.now))}</p>
          <h3 className="mt-0.5 text-[21px] font-bold leading-tight tracking-[-0.02em] text-slate-900 [text-wrap:balance]">{tt.steps[view.now]?.[0]}</h3>
          <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-slate-500">{tt.steps[view.now]?.[1]}</p>
        </div>
      </div>

      <ol className="relative mt-5 grid grid-cols-8" aria-label={t.listAria}>
        <span aria-hidden="true" className="absolute left-[6.25%] right-[6.25%] top-[13px] h-[3px] rounded-full bg-slate-200" />
        <span aria-hidden="true" className="tx-fill absolute left-[6.25%] top-[13px] h-[3px] rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `calc(87.5% * ${fill})` }} />
        {Array.from({ length: TAX_STEP_COUNT }, (_, i) => {
          const done = i < view.done || (finished && i <= LAST);
          const now = !finished && i === view.now && i >= view.done;
          const state = done ? t.stateDone : now ? t.stateNow : t.stateNext;
          const canTap = i <= step;
          return (
            <li key={i} className={cn("relative z-[1] min-w-0", done && "tx-done", now && "tx-now", now && view.arrive && "tx-arrive")}>
              <button type="button" disabled={!canTap} onClick={() => onSelect(i)} aria-current={now ? "step" : undefined} aria-pressed={canTap ? selected === i : undefined}
                aria-label={t.stepAria(i + 1, tt.steps[i]?.[0] ?? "", state)}
                className={cn("flex w-full flex-col items-center gap-1.5 rounded-xl px-0.5 pb-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default",
                  canTap && "hover:bg-slate-50", selected === i && i !== step && "bg-blue-50 hover:bg-blue-50")}>
                <span className={cn("tx-dot relative grid h-[29px] w-[29px] place-items-center rounded-full border-2 bg-white text-white",
                  done ? "border-emerald-600 bg-emerald-600" : now ? "border-blue-600" : "border-slate-200")}>
                  <Check className="tx-check h-4 w-4" strokeWidth={3} aria-hidden="true" />
                </span>
                <b className={cn("hidden text-xs font-semibold leading-tight [overflow-wrap:anywhere] sm:block", done || now ? "text-slate-900" : "text-slate-500")}>{tt.p.short[i]}</b>
                <small className={cn("hidden whitespace-nowrap text-[11px] sm:block", now ? "font-bold text-blue-600" : "text-slate-400")}>{now ? t.now : done ? short(i) || " " : " "}</small>
              </button>
            </li>
          );
        })}
      </ol>

      {next ? (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-slate-200 pt-3.5 text-[13.5px] text-slate-500">
          <span>{t.next}</span><b className="font-semibold text-slate-900">{next}</b>{hint && <span>{hint}</span>}
        </p>
      ) : null}
    </section>
  );
}
