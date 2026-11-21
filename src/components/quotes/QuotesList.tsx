import { Check, ClipboardList, Plus, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { quotesCopy, type QuoteView } from "@/i18n/copy/quotes";
import { Dst, SegTabs } from "@/components/invoices/proto";
import { btn } from "@/components/invoices/ui";
import { fmtDay } from "@/components/invoices/shared";
import type { QuoteListItem } from "./shared";
import { createdDayOf, quoteTone, quoteView, validityView } from "./view";

export type QuoteFilter = QuoteView | "all";
const MAIN_TABS: QuoteFilter[] = ["all", "sent", "accepted", "expired", "converted"];

/** The prototype's `.srow.qt` grid: client, amount, validity, status, actions. Phones and tablets (and next to the sidebar until xl): two columns. */
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-4 py-3 text-sm xl:grid-cols-[minmax(0,1fr)_120px_190px_170px_240px]";

export function QuotesListView({ items, loading, today, locale, filter, onFilter, canChange, onNew, onOpen, onRemind, onSend, onConvert, onSeeInvoice }: {
  items: readonly QuoteListItem[];
  loading: boolean;
  today: string;
  locale: string;
  filter: QuoteFilter;
  onFilter: (f: QuoteFilter) => void;
  canChange: boolean;
  onNew: () => void;
  onOpen: (id: number) => void;
  onRemind: (id: number) => void;
  onSend: (id: number) => void;
  onConvert: (id: number) => void;
  onSeeInvoice: (saleId: number) => void;
}) {
  const t = useCopy(quotesCopy);
  const views = items.map((q) => ({ q, v: quoteView(q, today) }));
  const count = (f: QuoteFilter) => (f === "all" ? views.length : views.filter((x) => x.v === f).length);
  // Drafts and rejected ones get their tab only when there are some (the prototype has neither).
  const tabs: QuoteFilter[] = [...MAIN_TABS.slice(0, 1), ...(count("draft") > 0 ? ["draft" as const] : []), ...MAIN_TABS.slice(1), ...(count("rejected") > 0 ? ["rejected" as const] : [])];
  const shown = views.filter((x) => filter === "all" || x.v === filter);

  // .qstats — all real: answered quotes accepted, and what's waiting for an answer.
  const answered = views.filter((x) => x.q.status === "accepted" || x.q.status === "converted" || x.q.status === "rejected").length;
  const won = views.filter((x) => x.q.status === "accepted" || x.q.status === "converted").length;
  const waiting = views.filter((x) => x.v === "sent").reduce((s, x) => s + Math.round(x.q.total * 100), 0) / 100;

  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-blue-600" aria-hidden="true" />
          {answered > 0 ? <>{t.stats.rateLabel} <b className="font-bold text-slate-900">{t.stats.rate(Math.round((won / answered) * 10))}</b></> : t.stats.noAnswers}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ClipboardList className="h-4 w-4 text-blue-600" aria-hidden="true" />
          {t.stats.waiting} <b className="font-bold tabular-nums text-slate-900">{formatCurrency(waiting)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-4 w-4 text-blue-600" aria-hidden="true" />{t.stats.how}
        </span>
      </div>

      <SegTabs label={t.tabs.label} value={filter} onChange={onFilter} items={tabs.map((f) => ({ value: f, label: t.tabs[f], count: loading ? null : count(f) }))} />

      <div className="mt-1.5 overflow-hidden rounded-[14px] border border-slate-200 bg-white">
        <div className={cn(ROW, "hidden bg-slate-100 py-[9px] text-xs font-semibold text-slate-500 xl:grid")} aria-hidden="true">
          <span>{t.cols.client}</span><span className="text-right">{t.cols.amount}</span><span>{t.cols.validity}</span><span>{t.cols.status}</span><span />
        </div>
        {loading ? (
          <div role="status" aria-label={t.loading}>
            {[0, 1, 2].map((k) => <div key={k} className="border-t border-slate-200 px-4 py-3 first:border-t-0 xl:first:border-t"><Skeleton className="h-9 w-full" /></div>)}
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-10 text-center xl:border-t xl:border-slate-200">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600" aria-hidden="true"><ClipboardList className="h-6 w-6" /></span>
            <h2 className="mt-3 font-semibold text-slate-900">{t.emptyTitle}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t.emptyText}</p>
            {canChange && <button type="button" className={btn("primary", "mt-4")} onClick={onNew}><Plus className="h-4 w-4" aria-hidden="true" />{t.newQuote}</button>}
          </div>
        ) : shown.length === 0 ? (
          <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500 first:border-t-0 xl:first:border-t">{t.empty}</div>
        ) : (
          <ul>
            {shown.map(({ q, v }) => {
              const client = q.customerName || t.noCustomer;
              const valid = validityView(q, today, t);
              const actions = !canChange ? (q.status === "converted" && q.saleId ? [
                <button key="inv" type="button" className={btn("sm")} onClick={(e) => { e.stopPropagation(); onSeeInvoice(q.saleId as number); }}>{t.actions.seeInvoice}</button>,
              ] : []) : v === "accepted" ? [
                <button key="cv" type="button" className={btn("sm", "primary")} onClick={(e) => { e.stopPropagation(); onConvert(q.id); }}>{t.actions.convert}</button>,
              ] : v === "sent" ? [
                <button key="view" type="button" className={btn("sm")} onClick={(e) => { e.stopPropagation(); onOpen(q.id); }}>{t.actions.view}</button>,
                <button key="rem" type="button" className={btn("sm")} onClick={(e) => { e.stopPropagation(); onRemind(q.id); }}>{t.actions.remind}</button>,
              ] : v === "expired" ? [
                <button key="re" type="button" className={btn("sm")} onClick={(e) => { e.stopPropagation(); onSend(q.id); }}>{t.actions.resend}</button>,
              ] : v === "draft" ? [
                <button key="send" type="button" className={btn("sm", "primary")} onClick={(e) => { e.stopPropagation(); onSend(q.id); }}>{t.actions.send}</button>,
              ] : v === "converted" && q.saleId ? [
                <button key="inv" type="button" className={btn("sm")} onClick={(e) => { e.stopPropagation(); onSeeInvoice(q.saleId as number); }}>{t.actions.seeInvoice}</button>,
              ] : [];
              return (
                <li key={q.id} onClick={() => onOpen(q.id)} className={cn(ROW, "cursor-pointer border-t border-slate-200 transition-colors first:border-t-0 hover:bg-slate-100 xl:first:border-t")}>
                  <div className="col-start-1 row-start-1 min-w-0 xl:col-start-auto xl:row-start-auto">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpen(q.id); }}
                      aria-label={t.openAria(q.number, client)}
                      className="block max-w-full truncate rounded text-left font-[650] text-slate-900 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {client}
                    </button>
                    <span className="block truncate text-xs text-slate-500">{t.rowSub(q.number, fmtDay(createdDayOf(q.createdAt), locale, today))}</span>
                  </div>
                  <span className="col-start-2 row-start-1 text-right xl:col-start-auto xl:row-start-auto">
                    <b className="font-bold tabular-nums text-slate-900">{formatCurrency(q.total)}</b>
                  </span>
                  <span className={cn("col-start-1 row-start-2 text-xs xl:col-start-auto xl:row-start-auto xl:text-[13px]", valid.tone === "bad" ? "text-red-600" : valid.tone === "warn" ? "text-amber-700" : "text-slate-900")}>
                    {valid.text}
                  </span>
                  <span className="col-start-2 row-start-2 justify-self-end xl:col-start-auto xl:row-start-auto xl:justify-self-start"><Dst label={t.state[v]} tone={quoteTone(v)} /></span>
                  <span className={cn("col-span-2 flex flex-wrap justify-start gap-1.5 xl:col-span-1 xl:justify-end", actions.length === 0 && "hidden xl:flex")}>{actions}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
