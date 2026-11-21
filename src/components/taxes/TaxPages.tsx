import { ArrowLeft, FileText, Lock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Kpi, pbtn, pbtnSm } from "@/components/personal/planKit";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy } from "@/i18n/copy/taxes";
import { TAX_STEP, TAX_STEP_COUNT, type TaxMode } from "@contracts/taxRules";
import { TaxTrack } from "./TaxTrack";
import { TaxLink } from "./TaxSide";
import { TaxThumb } from "./TaxDocs";
import { fileSize, shortDate, taxMoney, type Doc, type TaxResult } from "./taxView";

const card = "rounded-[14px] border border-slate-200 bg-white p-4";

function Back({ label, onBack, end }: { label: string; onBack: () => void; end?: boolean }) {
  return (
    <div className={end ? "mt-5 flex justify-center" : "mb-2.5"}>
      <button type="button" onClick={onBack} className={end ? pbtn : pbtnSm}><ArrowLeft className="h-[15px] w-[15px]" aria-hidden="true" />{label}</button>
    </div>
  );
}

/**
 * "Cómo cuidamos tus documentos" (taxCarePage): how files are protected, who we are and aren't, the federal
 * and Alabama rules and the person's rights, with the official sites. Only what the app really does: files
 * are encrypted and open only for their owner and the preparer; prep is free; state returns are Alabama only.
 */
export function TaxCare({ onBack }: { onBack: () => void }) {
  const t = useCopy(taxesCopy).p.care;
  return (
    <div className="mx-auto max-w-6xl">
      <Back label={t.back} onBack={onBack} />
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">{t.title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t.sub}</p>
      </header>
      <div className={cn(card, "max-w-[820px]")}>
        {t.sections.map(([title, items], i) => (
          <section key={title} className={cn(i > 0 && "mt-[18px] border-t border-slate-200 pt-4", i === 0 && "mt-4")}>
            <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900">{i === 0 && <Lock className="h-[17px] w-[17px] text-blue-600" aria-hidden="true" />}{title}</h2>
            <ul className="grid gap-1.5 text-sm text-slate-700">{items.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        ))}
        <div className="mt-4 flex flex-wrap gap-2">
          <TaxLink href="https://www.irs.gov/">irs.gov</TaxLink>
          <TaxLink href="https://www.revenue.alabama.gov/">revenue.alabama.gov</TaxLink>
          <TaxLink href="https://myalabamataxes.alabama.gov/">My Alabama Taxes</TaxLink>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className={pbtnSm}>{t.privacy}</a>
        </div>
      </div>
      <Back label={t.back} onBack={onBack} end />
    </div>
  );
}

/**
 * A past year's return (taxPastPage): its 8 steps with their dates, what came back from the IRS and from
 * Alabama, the return's details and every document of that year to open or download.
 */
export function TaxPast({ id, mode, onBack, onOpen }: { id: number; mode: TaxMode; onBack: () => void; onOpen: (d: Doc) => void }) {
  const T = useCopy(taxesCopy);
  const t = T.p.past;
  const locale = intlLocale(useLang().lang);
  const thisYear = new Date().getFullYear();
  const q = trpc.tax.pastYear.useQuery({ returnId: id });

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-3.5" role="status" aria-label={T.loading}>
        <Skeleton className="h-10 w-48 rounded-[10px]" /><Skeleton className="h-8 w-72 max-w-full" /><Skeleton className="h-28 rounded-[14px]" />
        <div className="grid gap-3.5 sm:grid-cols-3"><Skeleton className="h-24 rounded-[14px]" /><Skeleton className="h-24 rounded-[14px]" /><Skeleton className="h-24 rounded-[14px]" /></div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Back label={t.back} onBack={onBack} />
        <div className={cn(card, "text-center")} role="alert">
          <p className="text-sm text-slate-700">{T.errors.generic}</p>
          <button type="button" onClick={() => void q.refetch()} className={cn(pbtn, "mt-3")}><RefreshCw className="h-4 w-4" aria-hidden="true" />{T.retry}</button>
        </div>
      </div>
    );
  }
  const { ret, docs } = q.data;
  const date = (k: number) => shortDate(ret.stepDates?.[k], locale, thisYear);
  const done = ret.step >= TAX_STEP_COUNT - 1;
  const filed = ret.step >= TAX_STEP.filed;
  const sentYear = ret.stepDates?.[TAX_STEP.filed] ? new Date(ret.stepDates[TAX_STEP.filed]!).getFullYear() : ret.taxYear + 1;
  const kpi = (r: TaxResult, refundLabel: string, oweLabel: string) => (
    <Kpi k={r?.kind === "owe" ? oweLabel : refundLabel} v={r ? taxMoney(r.amount) : t.noResult}
      s={r?.kind === "refund" && ret.stepDates?.[TAX_STEP.deposited] ? t.deposited(date(TAX_STEP.deposited)) : undefined} />
  );
  const net = (r: TaxResult) => (r ? (r.kind === "refund" ? r.amount : -r.amount) : 0);
  const total = net(ret.fedResult) + net(ret.stateResult);
  const titleOf = (d: Doc) => (d.source === "preparer" ? T.preparerDocs[d.kind] ?? d.fileName : T.docs[mode][d.kind]?.title ?? d.kind);
  const info: Array<[string, string]> = [
    ...(ret.filingStatus ? [[t.filing, ret.filingStatus] as [string, string]] : []),
    ...(ret.approvedAt || ret.stepDates?.[TAX_STEP.sign] ? [[t.approved, shortDate(ret.approvedAt ?? ret.stepDates?.[TAX_STEP.sign], locale, thisYear)] as [string, string]] : []),
    ...(ret.stepDates?.[TAX_STEP.filed] ? [[t.sent, t.sentVal(date(TAX_STEP.filed))] as [string, string]] : []),
    ...(ret.stepDates?.[TAX_STEP.accepted] ? [[t.accepted, date(TAX_STEP.accepted)] as [string, string]] : []),
    ...(ret.stepDates?.[TAX_STEP.deposited] ? [[t.depositedK, date(TAX_STEP.deposited)] as [string, string]] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Back label={t.back} onBack={onBack} />
      <header className="mb-3.5">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">{t.title(ret.taxYear)}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{filed ? t.filed(sentYear) : t.notFiled(ret.step >= 0 ? T.steps[ret.step]?.[0] ?? "" : T.draftStep)}</p>
      </header>
      <TaxTrack title={t.trackTitle} step={ret.step} stepDates={ret.stepDates} past={done} />
      {done && <p className="mt-1.5 text-center text-[13px] text-slate-500">{t.allDone(date(TAX_STEP.deposited))}</p>}
      {(ret.fedResult || ret.stateResult) && (
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-3">
          {kpi(ret.fedResult, t.fedRefund, t.fedOwe)}
          {kpi(ret.stateResult, t.stateRefund, t.stateOwe)}
          <Kpi k={t.total} v={`${total < 0 ? "−" : ""}${taxMoney(Math.abs(total))}`} />
        </div>
      )}
      <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className={card} aria-labelledby="tax-past-docs">
          <div className="flex items-center justify-between gap-3">
            <h2 id="tax-past-docs" className="font-semibold text-slate-900">{t.docs(ret.taxYear)}</h2>
            <span className="text-xs text-slate-500">{T.p.docs.files(docs.length)}</span>
          </div>
          {docs.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t.noDocs}</p> : (
            <ul className="mt-2.5 grid gap-1.5">
              {docs.map((d) => (
                <li key={d.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] bg-slate-100 px-2 py-1.5">
                  <TaxThumb file={d} kind={d.kind} mini />
                  <span className="grid min-w-0 gap-px"><b className="truncate text-xs text-slate-900">{titleOf(d)}</b><small className="truncate text-[11px] text-slate-500">{d.fileName} · {fileSize(d.size)}</small></span>
                  <button type="button" onClick={() => onOpen(d)} className={pbtnSm}><FileText className="h-[15px] w-[15px]" aria-hidden="true" />{T.p.docs.view}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={card} aria-labelledby="tax-past-info">
          <h2 id="tax-past-info" className="font-semibold text-slate-900">{t.info}</h2>
          {info.length > 0 && (
            <dl className="mt-2 divide-y divide-slate-200 text-sm">
              {info.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-900">{v}</dd></div>)}
            </dl>
          )}
          <div className="mt-3.5"><TaxLink href="https://www.irs.gov/individuals/get-transcript">{t.transcript}</TaxLink></div>
        </section>
      </div>
      <Back label={t.back} onBack={onBack} end />
    </div>
  );
}
