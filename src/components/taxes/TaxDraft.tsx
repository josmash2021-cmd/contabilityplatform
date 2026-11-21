import { AlertTriangle, CalendarDays, FileText, Landmark, ListChecks, Loader2, Send } from "lucide-react";
import { Dst, pbtnSm } from "@/components/personal/planKit";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy } from "@/i18n/copy/taxes";
import { TAX_QUESTIONS, filingDeadline, type Answers, type TaxMode } from "@contracts/taxRules";
import { TaxPick, type PickFn } from "./TaxDocs";
import { daysUntil, longDay, resultText, todoItems, type Doc, type Ret } from "./taxView";

const card = "rounded-[14px] border border-slate-200 bg-white p-4";

/** "Te faltan N cosas" (taxTodo): what's still needed, each with its upload menu or "Contestar". */
export function TaxTodo({ mode, answers, docs, unanswered, onPick, busyKind, onGoQuestions }: {
  mode: TaxMode; answers: Answers; docs: readonly Doc[]; unanswered: number; onPick: PickFn; busyKind: string | null; onGoQuestions: () => void;
}) {
  const t = useCopy(taxesCopy);
  const td = t.p.todo;
  const items = todoItems(mode, answers, docs, unanswered);
  const n = items.length;
  return (
    <section className={card} aria-labelledby="tax-todo-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tax-todo-h" className="font-semibold text-slate-900">{n ? (n === 1 ? td.one : td.many(n)) : td.none}</h2>
        {!n && <Dst tone="good">{td.ready}</Dst>}
      </div>
      {n ? (
        <ul className="mt-1">
          {items.map((x) => {
            const Icon = x.text === "questions" ? ListChecks : x.tone === "warn" ? AlertTriangle : x.text === "becauseYes" ? FileText : CalendarDays;
            const title = x.kind ? t.docs[mode][x.kind.id]?.title ?? x.kind.id : td.questions(x.n ?? 0);
            const meta = x.text === "questions" ? td.questionsText : td[x.text];
            return (
              <li key={x.kind?.id ?? "q"} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-200 py-2.5 first:border-t-0">
                <span className={cn("grid h-8 w-8 place-items-center rounded-[9px]", x.tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-600")}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0"><b className="block text-sm text-slate-900">{title}</b><span className="block text-xs text-slate-500">{meta}</span></div>
                <div className="flex justify-end">
                  {x.kind ? <TaxPick kind={x.kind.id} title={title} has={docs.some((d) => d.source === "client" && d.kind === x.kind!.id)} onPick={onPick} busy={busyKind === x.kind.id} />
                    : <button type="button" onClick={onGoQuestions} className={pbtnSm}>{td.answer}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-1 text-sm text-slate-500">{td.noneText}</p>}
    </section>
  );
}

/**
 * "Tu reembolso" (adapts the prototype's "Reembolso estimado"): we don't estimate a refund we can't know.
 * It says the preparer works it out, shows last year's real result when there is one, and the real deadline.
 */
export function TaxRefund({ year, last }: { year: number; last: Ret | null }) {
  const t = useCopy(taxesCopy).p.refund;
  const locale = intlLocale(useLang().lang);
  const deadline = filingDeadline(year);
  const days = daysUntil(deadline, new Date());
  const parts = last ? [resultText(last.fedResult, t) && `${t.fed}: ${resultText(last.fedResult, t)}`, resultText(last.stateResult, t) && `${t.state}: ${resultText(last.stateResult, t)}`].filter(Boolean) : [];
  return (
    <section className={card} aria-labelledby="tax-refund-h">
      <h2 id="tax-refund-h" className="font-semibold text-slate-900">{t.title}</h2>
      <p className="mt-1.5 text-sm text-slate-700">{t.pending}</p>
      {last && parts.length > 0 && <p className="mt-1.5 text-[13px] text-slate-500">{t.lastYear(last.taxYear, parts.join(" · "))}</p>}
      <div className="mt-3 grid gap-1.5 border-t border-slate-200 pt-3 text-[13px] text-slate-500">
        <span className="flex items-center gap-2"><CalendarDays className="h-[15px] w-[15px] shrink-0 text-blue-600" aria-hidden="true" /><span>{t.deadline}<b className="text-slate-900">{longDay(deadline, locale)}</b>{days > 0 ? t.daysLeft(days) : ""}</span></span>
        <span className="flex items-center gap-2"><Landmark className="h-[15px] w-[15px] shrink-0 text-blue-600" aria-hidden="true" />{t.opens}</span>
      </div>
    </section>
  );
}

/** "Tu situación en 2026" (taxQuestions): Sí / No for each question; tapping the chosen answer again clears it. */
export function TaxQuestions({ mode, year, answers, busy, onAnswer, id }: {
  mode: TaxMode; year: number; answers: Answers; busy: boolean; onAnswer: (q: string, v: boolean | null) => void; id: string;
}) {
  const t = useCopy(taxesCopy);
  return (
    <section id={id} className={cn(card, "scroll-mt-4")} aria-labelledby="tax-q-h">
      <h2 id="tax-q-h" className="font-semibold text-slate-900">{t.p.q.title(year)}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t.p.q.text}</p>
      <ul className="mt-1.5">
        {TAX_QUESTIONS[mode].map((q) => {
          const [label, hint] = t.questions[mode][q] ?? [q, ""];
          const v = answers[q];
          return (
            <li key={q} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-2.5 first:border-t-0">
              <span className="min-w-0 flex-[1_1_200px]"><b id={`tq-${q}`} className="block text-sm font-semibold text-slate-900">{label}</b><small className="block text-xs text-slate-500">{hint}</small></span>
              <span className="inline-grid shrink-0 grid-flow-col gap-0 rounded-xl border border-slate-200 bg-slate-100 p-[3px]" role="group" aria-labelledby={`tq-${q}`}>
                {([true, false] as const).map((val) => (
                  <button key={String(val)} type="button" aria-pressed={v === val} disabled={busy} onClick={() => onAnswer(q, v === val ? null : val)}
                    className={cn("min-h-10 min-w-[56px] rounded-[9px] px-3.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-9",
                      v === val ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(11,18,32,0.14)]" : "text-slate-500 hover:text-slate-900")}>
                    {val ? t.situation.yes : t.situation.no}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Autoriza el envío" (taxConsentCard). */
export function TaxConsent({ consent, terms, onConsent, onTerms, onCare, id }: {
  consent: boolean; terms: boolean; onConsent: (v: boolean) => void; onTerms: (v: boolean) => void; onCare: () => void; id: string;
}) {
  const t = useCopy(taxesCopy).p.consent;
  const [a, link, b] = t.terms;
  return (
    <section id={id} className={cn(card, "mt-3.5")} aria-labelledby="tax-consent-h">
      <h2 id="tax-consent-h" className="font-semibold text-slate-900">{t.title}</h2>
      <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-slate-800">
        <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />
        <span>{t.consent}</span>
      </label>
      <label className="mt-1 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-slate-800">
        <input type="checkbox" checked={terms} onChange={(e) => onTerms(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />
        <span>{a}<button type="button" onClick={(e) => { e.preventDefault(); onCare(); }} className="font-semibold text-blue-600 underline-offset-2 hover:underline">{link}</button>{b}</span>
      </label>
    </section>
  );
}

/**
 * The send bar (taxSendBar), stuck to the bottom of the screen while scrolling (above the phone tab bar):
 * what's missing, or "ya casi", or "todo listo", and Enviar.
 */
export function TaxSendBar({ missing, consentOk, hasW2, sending, onSend, onGoConsent }: {
  missing: string[]; consentOk: boolean; hasW2: boolean | null; sending: boolean; onSend: () => void; onGoConsent: () => void;
}) {
  const t = useCopy(taxesCopy).p.send;
  const ok = missing.length === 0 && consentOk;
  return (
    <div role="region" aria-label={t.region}
      className={cn("sticky bottom-[-14px] z-10 mt-3.5 flex items-center justify-between gap-3 rounded-[14px] border bg-white px-3 py-2.5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] sm:px-3.5 sm:py-3 lg:bottom-3",
        ok ? "border-emerald-600" : "border-slate-200")}>
      <p className="min-w-0 text-[13px] text-slate-500">
        {missing.length > 0 ? (
          <><b className="block text-[13px] text-slate-900 sm:text-sm">{t.missing}</b><span className="hidden sm:block">{missing.join(", ")}</span></>
        ) : !consentOk ? (
          <><b className="block text-[13px] text-slate-900 sm:text-sm">{t.almost} <button type="button" onClick={onGoConsent} className="ml-1 font-semibold text-blue-600 hover:underline">{t.go}</button></b><span className="hidden sm:block">{t.almostText}</span></>
        ) : (
          <><b className="block text-[13px] text-slate-900 sm:text-sm">{t.ready}</b><span className="hidden sm:block">{hasW2 === false ? t.readyNoW2 : t.readyText}</span></>
        )}
      </p>
      <button type="button" onClick={onSend} disabled={!ok || sending}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 sm:min-h-10">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
        <span>{sending ? t.sending : <>{t.button}<span className="hidden sm:inline">{t.buttonLong}</span></>}</span>
      </button>
    </div>
  );
}
