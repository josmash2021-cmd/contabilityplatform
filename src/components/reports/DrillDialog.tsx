import { Link } from "react-router";
import { AlertCircle } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import type { DateRange } from "../../../api/lib/reportBooks";
import { Panel } from "./Panel";
import { BTN, money, shortDay } from "./ui";

export type DrillTarget = {
  kind: "category" | "income" | "service" | "client" | "bank" | "recorded";
  key: string;
  label: string;
  /** For a category: only what the books record (the income statement's lines). */
  only?: "booked";
};

/**
 * The movements behind one line (the prototype's drillHTML): what was spent in a category (expenses and business
 * bank charges, as Gastos counts them), the bank charges not recorded yet, or the sales behind income.
 */
export function DrillDialog({ target, onClose, range, tzOffsetHours, periodLabel, locale, catLabel, c }: {
  target: DrillTarget | null;
  onClose: () => void;
  range: DateRange;
  tzOffsetHours: number;
  periodLabel: string;
  locale: string;
  /** A spending category in words. */
  catLabel: (category: string) => string;
  c: ReportesCopy;
}) {
  const q = trpc.reports.drill.useQuery(
    { kind: target?.kind ?? "income", key: target?.key, only: target?.only, range, tzOffsetHours },
    { enabled: !!target, staleTime: 30_000, retry: 1 },
  );
  const d = q.data;
  const expenses = target?.kind === "category" || target?.kind === "bank" || target?.kind === "recorded";
  const lines = target?.kind === "service";

  let body;
  if (q.isLoading) {
    body = <div className="space-y-2" role="status" aria-label={c.export.loading}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
  } else if (q.error || !d) {
    body = (
      <div className="grid justify-items-center gap-2 py-6 text-center">
        <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
        <p className="text-sm text-slate-900" role="alert">{c.drill.error}</p>
        <button type="button" className={BTN} onClick={() => void q.refetch()}>{c.drill.retry}</button>
      </div>
    );
  } else {
    const head = expenses ? c.drill.expenses(periodLabel, d.count, money(d.total))
      : lines ? c.drill.lines(periodLabel, d.count, money(d.total))
      : c.drill.sales(periodLabel, d.count, money(d.total));
    body = (
      <>
        <p className="mb-2.5 text-[13px] text-slate-500 tabular-nums">{head}</p>
        {d.methods && d.methods.length > 0 && (
          <p className="mb-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-slate-500">
            <span className="font-semibold text-slate-900">{c.drill.methods}:</span>
            {d.methods.map((m) => <span key={m.method} className="tabular-nums">{c.methods[m.method] ?? m.method} {money(m.total)}</span>)}
          </p>
        )}
        {d.rows.length === 0 ? (
          <p className="rounded-[14px] border border-slate-200 p-4 text-sm text-slate-500">{c.drill.empty}</p>
        ) : (
          <ul className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
            {d.rows.map((r) => {
              const spend = "source" in r ? (r as { source: string; category: string; account: string | null; receipt: boolean }) : null;
              // A bank charge has no receipt to ask for; an expense shows whether it has its photo.
              const receipt = spend && spend.source !== "bank" ? spend.receipt : null;
              const qty = "quantity" in r ? (r as { quantity: number; unitPrice: number }) : null;
              const paid = spend ? (spend.account ?? (r.method ? c.methods[r.method] ?? r.method : null)) : r.method ? c.methods[r.method] ?? r.method : null;
              return (
                <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-t border-slate-200 px-4 py-3 text-sm first:border-t-0 sm:grid-cols-[64px_minmax(0,1fr)_120px_auto]">
                  <span className="order-3 text-xs text-slate-500 sm:order-none sm:text-sm">{shortDay(r.date, locale)}</span>
                  <div className="flex min-w-0 items-center gap-2.5">
                    {expenses && <MerchantLogo name={r.title} logoUrl={r.logoUrl} size={32} />}
                    <div className="min-w-0">
                      <b className="block truncate font-[650] text-slate-900">{r.title}</b>
                      <span className="block truncate text-xs text-slate-500">
                        {[spend ? catLabel(spend.category) : r.sub, spend ? r.sub : null, qty ? c.drill.qty(qty.quantity, money(qty.unitPrice)) : null, paid, !spend && r.ref !== r.title ? r.ref : null].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </div>
                  <b className="text-right tabular-nums text-slate-900">{expenses ? money(-r.amount) : money(r.amount)}</b>
                  <span className="order-4 justify-self-end sm:order-none">
                    {receipt !== null && (
                      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold ${receipt ? "text-emerald-600" : "text-amber-700"}`}>
                        <i className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />{receipt ? c.drill.receipt : c.drill.noReceipt}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {d.truncated && <p className="mt-2 text-xs text-slate-500">{c.drill.truncated(d.rows.length)}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link to={expenses ? "/expenses" : "/invoices"} className={BTN}>{expenses ? c.drill.goExpenses : c.drill.goSales}</Link>
        </div>
      </>
    );
  }

  return (
    <Panel open={!!target} onOpenChange={(o) => { if (!o) onClose(); }} title={target?.label ?? ""} closeLabel={c.drill.close} wide="wide">
      {body}
    </Panel>
  );
}
