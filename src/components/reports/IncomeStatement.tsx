import { Activity, CreditCard, Receipt, Wallet, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { reportesCopy } from "@/i18n/copy/reportes";
import { bankCopy } from "@/i18n/copy/bank";
import { CARD, CHART, money, num, percent, type IncomeStatement as IncomeData, type PaymentRow } from "./format";

/** Estado de resultados with plain words next to the accounting ones. */
export function IncomeStatement({ data, loading, stale, periodLabel, locale }: {
  data: IncomeData | undefined;
  loading: boolean;
  stale: boolean;
  periodLabel: string;
  locale: string;
}) {
  const t = useCopy(reportesCopy).income;
  const sales = num(data?.breakdown.salesRevenue);
  const expenses = num(data?.businessExpenses);
  const net = sales - expenses;
  const loss = net < -0.004;
  const keptShare = sales > 0 ? Math.max(0, net) / sales : 0;

  return (
    <section className={cn(CARD, "transition-opacity", stale && "opacity-60")} aria-labelledby="rep-income-title" aria-busy={stale || undefined}>
      <h2 id="rep-income-title" className="font-semibold text-slate-900">{t.title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{periodLabel} · {t.sub}</p>

      {loading || !data ? (
        <div className="mt-4 space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full bg-slate-100" />)}</div>
      ) : (
        <>
          <div className="mt-4">
            <SectionHead label={t.inHeader} />
            <Line plain={t.sales} formal={t.salesFormal} value={money(sales)} />
            <Line plain={t.totalIn} formal={t.totalInFormal} value={money(sales)} strong />

            <SectionHead label={t.outHeader} />
            <Line plain={t.expenses} formal={t.expensesFormal} value={money(-expenses)} />
            <Line plain={t.totalOut} formal={t.totalOutFormal} value={money(-expenses)} strong />

            <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-900">{loss ? t.netLoss : t.net}</p>
                <p className="text-xs text-slate-500">
                  {t.netFormal}{sales > 0 && <> · {t.margin(percent(net / sales, locale))}</>}
                </p>
              </div>
              <p className={cn("text-lg font-bold tabular-nums", loss ? "text-red-700" : sales > 0 ? "text-emerald-700" : "text-slate-900")}>{money(net)}</p>
            </div>
          </div>

          {sales > 0 && (
            <div className="mt-4">
              <p className="text-sm text-slate-700">{loss ? t.lossLine(money(Math.abs(net))) : t.per100(money(keptShare * 100))}</p>
              {!loss && (
                <>
                  <div className="mt-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${t.splitLabel}: ${t.splitKept} ${percent(keptShare, locale)}, ${t.splitSpent} ${percent(1 - keptShare, locale)}`}>
                    {keptShare > 0 && <span className="h-full rounded-full" style={{ width: `${keptShare * 100}%`, backgroundColor: CHART.in }} />}
                    {keptShare < 1 && <span className="h-full flex-1 rounded-full" style={{ backgroundColor: CHART.out }} />}
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-hidden="true">
                    <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: CHART.in }} />{t.splitKept} {percent(keptShare, locale)}</li>
                    <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: CHART.out }} />{t.splitSpent} {percent(1 - keptShare, locale)}</li>
                  </ul>
                </>
              )}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">{t.completedOnly} {t.personalExcluded}</p>
        </>
      )}
    </section>
  );
}

function SectionHead({ label }: { label: string }) {
  return <p className="mt-3 border-b border-slate-200 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 first:mt-0">{label}</p>;
}

function Line({ plain, formal, value, strong }: { plain: string; formal: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-slate-100 py-2.5", strong && "bg-white")}>
      <div className="min-w-0">
        <p className={cn("text-sm text-slate-800", strong && "font-semibold text-slate-900")}>{plain}</p>
        <p className="text-xs text-slate-500">{formal}</p>
      </div>
      <p className={cn("shrink-0 text-sm tabular-nums text-slate-900", strong && "font-semibold")}>{value}</p>
    </div>
  );
}

const METHOD_ICON: Record<string, LucideIcon> = { cash: Wallet, zelle: CreditCard, card: Receipt, mixed: Activity };

/** Cómo te pagaron: the month's completed sales by payment method. */
export function PaymentMethods({ rows, monthLabel, loading, stale, locale }: {
  rows: PaymentRow[];
  monthLabel: string;
  loading: boolean;
  stale: boolean;
  locale: string;
}) {
  const t = useCopy(reportesCopy).payments;
  const labels = useCopy(bankCopy).reports.payment;
  const total = rows.reduce((s, r) => s + num(r.total), 0);
  const sorted = [...rows].sort((a, b) => num(b.total) - num(a.total));
  return (
    <section className={cn(CARD, "transition-opacity lg:self-start", stale && "opacity-60")} aria-labelledby="rep-pay-title">
      <h2 id="rep-pay-title" className="font-semibold text-slate-900">{t.title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t.sub(monthLabel)}</p>
      {loading ? (
        <div className="mt-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full bg-slate-100" />)}</div>
      ) : sorted.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">{t.none}</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {sorted.map((r) => {
            const Icon = METHOD_ICON[r.method] ?? Activity;
            const share = total > 0 ? num(r.total) / total : 0;
            return (
              <li key={r.method}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-700">
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="truncate">{labels[r.method] || r.method}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(num(r.total))}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-blue-100" aria-hidden="true">
                  <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{t.count(num(r.count))} · {t.ofTotal(percent(share, locale))}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
