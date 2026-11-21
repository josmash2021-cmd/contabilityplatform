import { Link } from "react-router";
import { ChevronRight, Inbox, Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { reportesCopy } from "@/i18n/copy/reportes";
import { bankCopy } from "@/i18n/copy/bank";
import { CARD, money, num, type MonthTotals, type SaleRow } from "./format";

/** Cada venta in the period (Hoy / Semana / Mes). */
export function SalesList({ sales, periodLabel, capped, loading, stale, locale }: {
  sales: SaleRow[];
  periodLabel: string;
  /** How many the server sends at most per month, when it hit that limit. */
  capped: number | null;
  loading: boolean;
  stale: boolean;
  locale: string;
}) {
  const t = useCopy(reportesCopy).sales;
  const methods = useCopy(bankCopy).reports.payment;
  return (
    <section className={cn(CARD, "transition-opacity", stale && "opacity-60")} aria-labelledby="rep-sales-title">
      <h2 id="rep-sales-title" className="font-semibold text-slate-900">{t.title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t.sub(periodLabel, sales.length)}</p>
      {loading ? (
        <div className="mt-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full bg-slate-100" />)}</div>
      ) : sales.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <Receipt className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm text-slate-500">{t.empty}</p>
          <Link to="/pos" className="mt-3 inline-flex h-11 items-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 sm:h-10">{t.emptyCta}</Link>
        </div>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-slate-100">
            {sales.map((sale) => {
              const when = new Date(sale.createdAt);
              const names = sale.items?.map((i) => i.serviceName).filter(Boolean).join(", ");
              const voided = sale.status === "cancelled" || sale.status === "refunded";
              return (
                <li key={sale.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><Inbox className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{names || sale.customerName || sale.invoiceNumber || t.sale}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {when.toLocaleDateString(locale, { day: "numeric", month: "short" })} · {when.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })} · {methods[sale.paymentMethod] || sale.paymentMethod}
                      {sale.customerName && names ? ` · ${sale.customerName}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn("block text-sm font-semibold tabular-nums", voided ? "text-slate-400 line-through" : "text-slate-900")}>
                      {sale.status === "completed" ? "+" : ""}{money(num(sale.total))}
                    </span>
                    {sale.status !== "completed" && (
                      <span className={cn("block text-xs font-medium", sale.status === "pending" ? "text-amber-700" : "text-slate-500")}>{t.status[sale.status] ?? sale.status}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {capped != null && <p className="mt-2 text-xs text-slate-500">{t.capped(capped)}</p>}
        </>
      )}
    </section>
  );
}

/** In Año the sales list would be too long: pick a month first. */
export function SalesByMonth({ months, onPick, loading }: { months: MonthTotals[]; onPick: (month: number) => void; loading: boolean }) {
  const t = useCopy(reportesCopy).sales;
  return (
    <section className={CARD} aria-labelledby="rep-sales-title">
      <h2 id="rep-sales-title" className="font-semibold text-slate-900">{t.title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t.pickMonth}</p>
      {loading ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full bg-slate-100" />)}</div>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((m) => (
            <li key={m.month}>
              <button
                type="button"
                onClick={() => onPick(m.month)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold capitalize text-slate-900">{m.long}</span>
                  <span className="block text-xs tabular-nums text-slate-500">{t.monthIn(money(m.in))}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-blue-600">{t.seeMonth}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
