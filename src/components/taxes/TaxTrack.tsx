import { Check } from "lucide-react";
import { Dst } from "@/components/personal/planKit";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy } from "@/i18n/copy/taxes";
import { DRAFT_STEP, TAX_STEP_COUNT } from "@contracts/taxRules";
import { shortDate } from "./taxView";

/**
 * The prototype's 8-step track (taxTrackPre / taxTrack / the past year's): one row of steps with their dates.
 * Before sending, step 1 is "now". After, the steps already done (and the current one) can be tapped to see
 * them below. On phones the labels hide and one line says which step it is.
 */
export function TaxTrack({ title, step, stepDates, selected, onSelect, ready, past }: {
  title: string;
  /** DRAFT_STEP (-1) before sending. */
  step: number;
  stepDates: ReadonlyArray<string | null> | null | undefined;
  selected?: number;
  onSelect?: (i: number) => void;
  /** Before sending: everything needed is there. */
  ready?: boolean;
  /** A finished past year: every step done, nothing to tap. */
  past?: boolean;
}) {
  const t = useCopy(taxesCopy);
  const tr = t.p.track;
  const locale = intlLocale(useLang().lang);
  const thisYear = new Date().getFullYear();
  const draft = step === DRAFT_STEP;
  const cur = draft ? 0 : step;
  const sel = selected ?? cur;
  const finished = !draft && step >= TAX_STEP_COUNT - 1;
  const tag = draft
    ? <Dst tone={ready ? "good" : "muted"}>{ready ? tr.ready : tr.notSent}</Dst>
    : <Dst tone={step >= 5 ? "good" : "open"}>{finished ? tr.done : step >= 5 ? tr.accepted : tr.inProcess}</Dst>;
  const [a, b] = tr.stepOf(sel + 1, draft ? tr.preNow : t.steps[sel]?.[0] ?? "");

  return (
    <section className="rounded-[14px] border border-slate-200 bg-white p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>{tag}
      </div>
      <ol className="mt-2 grid grid-cols-8" aria-label={tr.listAria}>
        {Array.from({ length: TAX_STEP_COUNT }, (_, i) => {
          const done = past || (!draft && (i < step || finished));
          const now = !past && i === cur && !finished;
          const next = !done && !now;
          const date = !draft && stepDates?.[i] ? shortDate(stepDates[i], locale, thisYear) : "";
          const state = done ? (finished && i === cur ? tr.stateFinished : tr.stateDone) : now ? tr.stateNow : tr.stateNext;
          const inner = (
            <>
              <span className={cn("relative z-[1] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 bg-white text-white",
                done ? "border-emerald-600 bg-emerald-600" : now ? "border-blue-600 shadow-[0_0_0_4px_theme(colors.blue.50)]" : "border-slate-200")}>
                {done ? <Check className="h-[13px] w-[13px]" strokeWidth={3} aria-hidden="true" /> : now ? <i className="h-2 w-2 rounded-full bg-blue-600" /> : null}
              </span>
              <b className={cn("hidden text-xs leading-tight [overflow-wrap:anywhere] sm:block", next ? "font-semibold text-slate-500" : "font-[650] text-slate-900")}>{t.p.short[i]}</b>
              <small className="hidden whitespace-nowrap text-[11px] text-slate-500 sm:block">{draft ? (i === 0 ? tr.now : " ") : date || " "}</small>
            </>
          );
          const clickable = !!onSelect && !draft && !past && i <= step;
          return (
            <li key={i} className={cn("relative min-w-0", i > 0 && "before:absolute before:left-[calc(-50%+13px)] before:right-[calc(50%+13px)] before:top-5 before:h-0.5 before:rounded-sm",
              i > 0 && (done || now ? "before:bg-emerald-600" : "before:bg-slate-200"))}>
              {clickable ? (
                <button type="button" onClick={() => onSelect(i)} aria-pressed={i === sel} aria-current={now ? "step" : undefined} aria-label={tr.stepAria(i + 1, t.steps[i]?.[0] ?? "", state)}
                  className={cn("flex min-h-11 w-full flex-col items-center gap-1.5 rounded-[10px] px-0 pb-1.5 pt-2.5 text-center hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-1 sm:pb-2", i === sel && "bg-blue-50 hover:bg-blue-50")}>
                  {inner}
                </button>
              ) : (
                <span className="flex flex-col items-center gap-1.5 px-0 pb-1.5 pt-2.5 text-center sm:px-1 sm:pb-2" aria-current={now ? "step" : undefined}>
                  {inner}<span className="sr-only">{tr.stepAria(i + 1, t.steps[i]?.[0] ?? "", state)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-center text-[13px] text-slate-500 sm:hidden">{a}<b className="text-slate-900">{b}</b></p>
    </section>
  );
}
