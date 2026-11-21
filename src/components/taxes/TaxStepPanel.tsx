import { useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileText, Loader2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { Dst, pbtnPrimary, pbtnSm } from "@/components/personal/planKit";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy } from "@/i18n/copy/taxes";
import { TAX_STEP, TAX_STEP_COUNT, shownDocKinds, type TaxMode } from "@contracts/taxRules";
import { TaxLink } from "./TaxSide";
import { shortDate, taxMoney, type Doc, type Ret, type TaxResult } from "./taxView";

function Row({ icon, tone, title, meta }: { icon: ReactNode; tone: "info" | "good" | "warn"; title: ReactNode; meta: ReactNode }) {
  return (
    <li className="flex items-start gap-3 border-t border-slate-200 py-2.5 first:border-t-0">
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", tone === "good" ? "bg-emerald-50 text-emerald-600" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-600")} aria-hidden="true">{icon}</span>
      <div className="min-w-0"><b className="block text-sm text-slate-900">{title}</b><span className="block text-[13px] text-slate-500">{meta}</span></div>
    </li>
  );
}

/**
 * What's happening at one step of a sent return (taxStepPanel / taxStepBody), from the real return: the
 * files sent, the preparer's review, the results and documents the preparer sent, the client's approval
 * at "Revisa y firma" (tax.approve), the e-file and acceptance dates, and where to follow the refund.
 */
export function TaxStepPanel({ i, ret, mode, docs, onOpen, onSeeNow }: {
  i: number; ret: Ret; mode: TaxMode; docs: readonly Doc[]; onOpen: (d: Doc) => void; onSeeNow: () => void;
}) {
  const t = useCopy(taxesCopy);
  const p = t.p.panel;
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const [checked, setChecked] = useState(false);
  const approve = trpc.tax.approve.useMutation({
    onSuccess: () => { toast.success(p.approvedToast); void utils.tax.current.invalidate(); },
    onError: (e) => toast.error(e.message || t.errors.generic),
  });
  const thisYear = new Date().getFullYear();
  const st = ret.step;
  const now = i === st;
  const date = (k: number) => shortDate(ret.stepDates?.[k], locale, thisYear);
  const mine = docs.filter((d) => d.source === "client");
  const prep = (kind: string) => docs.filter((d) => d.source === "preparer" && d.kind === kind);
  const titleOf = (k: string) => t.docs[mode][k]?.title ?? k;
  const finalFed = prep("final_fed")[0], finalState = prep("final_state")[0], f8879 = prep("f8879")[0];

  const result = (label: string, r: TaxResult, word: string) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-slate-500">{r ? `${label} · ${r.kind === "refund" ? p.refundWord : p.oweWord}${word}` : label}</dt>
      <dd className={cn("font-bold tabular-nums", r?.kind === "refund" ? "text-emerald-600" : "text-slate-900")}>{r ? `${r.kind === "owe" ? "−" : ""}${taxMoney(r.amount)}` : "—"}</dd>
    </div>
  );
  const results = (word: string) => (ret.fedResult || ret.stateResult) ? (
    <dl className="mt-2.5 divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm">
      {result(p.fed, ret.fedResult, word)}
      {result(p.state, ret.stateResult, word)}
      {ret.filingStatus && <div className="flex items-center justify-between gap-3 px-3 py-2.5"><dt className="text-slate-500">{p.filing}</dt><dd className="font-medium text-slate-900">{ret.filingStatus}</dd></div>}
    </dl>
  ) : <p className="mt-2.5 rounded-[10px] bg-slate-100 px-3 py-2.5 text-sm text-slate-700">{p.resultsPending}</p>;

  let body: ReactNode;
  if (i === TAX_STEP.received) {
    body = (
      <ul className="mt-2.5">
        <Row icon={<FileText className="h-[18px] w-[18px]" />} tone="info" title={p.sentFiles(mine.length)} meta={p.sentOn(date(0))} />
        <Row icon={<User className="h-[18px] w-[18px]" />} tone="info" title={p.receives} meta={p.receivesText} />
      </ul>
    );
  } else if (i === TAX_STEP.reviewing) {
    const redo = mine.filter((d) => d.status === "redo");
    const ok = mine.filter((d) => d.status === "ok").length;
    const needsW2 = mode === "personal" && shownDocKinds(mode, ret.answers ?? {}).some((k) => k.id === "w2") && !mine.some((d) => d.kind === "w2");
    body = (
      <ul className="mt-2.5">
        {redo.length ? <Row icon={<AlertTriangle className="h-[18px] w-[18px]" />} tone="warn" title={p.redo([...new Set(redo.map((d) => titleOf(d.kind)))].join(", "))} meta={p.redoText} />
          : ok === mine.length && mine.length > 0 ? <Row icon={<CheckCircle2 className="h-[18px] w-[18px]" />} tone="good" title={p.allOk} meta={p.allOkText} />
          : <Row icon={<FileText className="h-[18px] w-[18px]" />} tone="info" title={p.reviewing} meta={p.reviewingText(ok, mine.length)} />}
        {needsW2 && <Row icon={<CalendarDays className="h-[18px] w-[18px]" />} tone="info" title={p.w2Missing} meta={p.w2MissingText} />}
      </ul>
    );
  } else if (i === TAX_STEP.preparing) {
    const income = shownDocKinds(mode, ret.answers ?? {}).filter((k) => k.need === "income" && mine.some((d) => d.kind === k.id)).map((k) => titleOf(k.id));
    const used = income.length ? income : [...new Set(mine.map((d) => titleOf(d.kind)))];
    body = (
      <ul className="mt-2.5">
        <Row icon={<FileText className="h-[18px] w-[18px]" />} tone="info" title={p.uses} meta={used.join(", ")} />
        {st === TAX_STEP.preparing && <Row icon={<CalendarDays className="h-[18px] w-[18px]" />} tone="info" title={p.other} meta={p.otherText} />}
      </ul>
    );
  } else if (i === TAX_STEP.sign) {
    const approvedOn = ret.approvedAt ? shortDate(ret.approvedAt, locale, thisYear) : "";
    body = (
      <>
        {results(st > TAX_STEP.sign ? "" : p.estimated)}
        {(finalFed || finalState || f8879) && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(finalFed ?? finalState) && <button type="button" onClick={() => onOpen((finalFed ?? finalState)!)} className={pbtnSm}><FileText className="h-[15px] w-[15px]" aria-hidden="true" />{p.seeFull}</button>}
            {f8879 && <button type="button" onClick={() => onOpen(f8879)} className={pbtnSm}><FileText className="h-[15px] w-[15px]" aria-hidden="true" />{p.see8879}</button>}
          </div>
        )}
        {st > TAX_STEP.sign ? (
          <p className="mt-2.5 text-sm text-slate-500">{p.approvedPast(approvedOn || date(TAX_STEP.sign))}</p>
        ) : ret.approvedAt ? (
          <p className="mt-2.5 flex items-start gap-2 rounded-[10px] bg-emerald-50 px-3 py-2.5 text-sm text-slate-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{p.approved(approvedOn)}</p>
        ) : (
          <>
            <p className="mt-2.5 text-[13px] text-slate-500">{p.signNote}</p>
            <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-slate-800">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />{p.check}
            </label>
            <div className="mt-2">
              <button type="button" onClick={() => approve.mutate()} disabled={!checked || approve.isPending} className={pbtnPrimary}>
                {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{approve.isPending ? p.approving : p.approve}
              </button>
            </div>
          </>
        )}
      </>
    );
  } else if (i === TAX_STEP.filed) {
    const ok = st >= TAX_STEP.accepted;
    const meta = ok ? p.acceptedOn(date(TAX_STEP.accepted)) : p.sentWaiting(date(TAX_STEP.filed));
    const icon = ok ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <Upload className="h-[18px] w-[18px]" />;
    body = (
      <>
        <ul className="mt-2.5">
          <Row icon={icon} tone={ok ? "good" : "info"} title={p.irs} meta={meta} />
          <Row icon={icon} tone={ok ? "good" : "info"} title={p.alabama} meta={meta} />
        </ul>
        {!ok && <p className="mt-2 text-sm text-slate-500">{p.confirmSoon}</p>}
      </>
    );
  } else if (i === TAX_STEP.accepted) {
    const copy = finalFed ?? finalState;
    body = (
      <>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5"><Dst tone="good">{p.irsAccepted(date(TAX_STEP.accepted))}</Dst><Dst tone="good">{p.alAccepted(date(TAX_STEP.accepted))}</Dst></span>
        {copy && <div className="mt-3"><button type="button" onClick={() => onOpen(copy)} className={pbtnSm}><Download className="h-[15px] w-[15px]" aria-hidden="true" />{p.copy}</button></div>}
        <p className="mt-2 text-sm text-slate-500">{p.keep3}</p>
      </>
    );
  } else if (i === TAX_STEP.refundSent) {
    body = (
      <>
        {results("")}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <TaxLink href="https://www.irs.gov/refunds">{p.whereRefund}</TaxLink>
          <TaxLink href="https://myalabamataxes.alabama.gov/">{p.myAlabama}</TaxLink>
        </div>
      </>
    );
  } else {
    const line = (label: string, r: TaxResult) => r && (
      <Row icon={<CheckCircle2 className="h-[18px] w-[18px]" />} tone="good" title={`${label}: ${taxMoney(r.amount)}`}
        meta={r.kind === "refund" ? p.arrivedText(date(TAX_STEP.deposited)) : p.paidText(date(TAX_STEP.deposited))} />
    );
    body = (
      <>
        <ul className="mt-2.5">{line("IRS", ret.fedResult)}{line(p.alabama, ret.stateResult)}</ul>
        <p className="mt-2 text-sm text-slate-500">{p.finished(ret.taxYear)}</p>
      </>
    );
  }

  const tag = !now ? <Dst tone="good">{p.doneOn(date(i))}</Dst> : st >= TAX_STEP_COUNT - 1 ? <Dst tone="good">{t.p.track.done}</Dst> : <Dst tone="open">{t.p.track.now}</Dst>;
  return (
    <section className="rounded-[14px] border border-slate-200 bg-white p-4" aria-live="polite" aria-labelledby="tax-panel-h">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="mb-0.5 block text-xs text-slate-500">{p.k(i + 1, date(i))}</span>
          <h2 id="tax-panel-h" className="font-semibold text-slate-900">{t.steps[i]?.[0]}</h2>
        </div>
        {tag}
      </div>
      <p className="mt-1 text-sm text-slate-500">{t.steps[i]?.[1]}</p>
      {body}
      {now && st < TAX_STEP_COUNT - 1 && <p className="mt-3 text-[13px] text-slate-500">{p.next}<b className="text-slate-900">{t.steps[st + 1]?.[0]}</b></p>}
      {!now && <div className="mt-3"><button type="button" onClick={onSeeNow} className={pbtnSm}>{p.seeNow}</button></div>}
    </section>
  );
}
