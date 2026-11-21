import { useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import { buildAging, daysBetween, type BalanceLine, type CashFlow, type DateRange } from "../../../api/lib/reportBooks";
import { statementRows } from "./export/model";
import type { Overview } from "./SimpleView";
import type { DrillTarget } from "./DrillDialog";
import { BTN, CARD, H3, SUB, TD, TH, dayLabel, money, shortDay } from "./ui";

export type ProTab = "pl" | "bs" | "cf" | "ar" | "ap" | "tax" | "journal";
const PRO_TABS: ProTab[] = ["pl", "bs", "cf", "ar", "ap", "tax", "journal"];

export type ProData = {
  balance: {
    asOf: string | null; assets: BalanceLine[]; liabilities: BalanceLine[]; equity: BalanceLine[]; unclosedEarnings: number;
    totalAssets: number; totalLiabilities: number; totalEquity: number; totalLiabilitiesAndEquity: number; balanced: boolean; difference: number;
  };
  cashFlow: CashFlow;
  contractors: { year: number; threshold: number; vendors: Array<{ vendorId: number; name: string; total: number; count: number; logoUrl: string | null }> };
  banks: { total: number; count: number };
};
export type ArItem = { ref: string; number: string; client: string; issued: string | null; due: string | null; balance: number };
export type ApItem = { id: number; vendor: string; what: string; due: string; amount: number };

type Line = { c: ReactNode[]; strong?: boolean; total?: boolean; onClick?: () => void; label?: string };

/** The prototype's rpTable (.stmt): first column left, the rest right; a total row; lines can open their movements. */
function Stmt({ head, rows }: { head: string[]; rows: Line[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope="col" className={cn(TH, i > 0 && "text-right")}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={cn(r.onClick && "hover:bg-slate-50")}>
              {r.c.map((x, i) => (
                <td key={i} className={cn(TD, i > 0 && "text-right tabular-nums", (r.strong || r.total) && "font-bold", r.total && "border-b-0 font-[750]", i === 0 && "pr-3")}>
                  {i === 0 && r.onClick ? (
                    <button type="button" className="inline-flex min-h-11 items-center gap-1 text-left text-slate-900 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0" aria-label={r.label} onClick={r.onClick}>
                      {x}<ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    </button>
                  ) : x}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Loading() {
  return <div className={CARD}><Skeleton className="h-5 w-48" /><div className="mt-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div></div>;
}

export function ProView({ tab, onTab, overview, pro, proLoading, ar, arLoading, ap, apLoading, range, labels, today, locale, onDrill, catLabel, c }: {
  tab: ProTab;
  onTab: (t: ProTab) => void;
  overview: Overview | undefined;
  pro: ProData | undefined;
  proLoading: boolean;
  ar: ArItem[] | undefined;
  arLoading: boolean;
  ap: ApItem[] | undefined;
  apLoading: boolean;
  range: DateRange;
  labels: { label: string; vs: string; curCol: string; prevCol: string; asOf: string; opening: string };
  today: string;
  locale: string;
  onDrill: (t: DrillTarget) => void;
  catLabel: (category: string) => string;
  c: ReportesCopy;
}) {
  const P = c.pro;
  let body: ReactNode = null;

  if (tab === "pl") {
    if (!overview) body = <Loading />;
    else {
      const st = overview.statement;
      const s = statementRows({
        moneyIn: overview.current.moneyIn, prevIn: overview.previous.moneyIn, moneyOut: overview.current.moneyOut, prevOut: overview.previous.moneyOut,
        booked: st.booked.map((x) => ({ name: catLabel(x.category), total: x.total, prev: x.prevTotal })),
        unbookedBank: { total: st.unbookedBank.total, prev: st.unbookedBank.prevTotal },
      }, c);
      const rows: Line[] = [
        ...s.income.map((x) => ({ c: [x.label, money(x.cur), money(x.prev)], onClick: () => onDrill({ kind: "income", key: "", label: c.drill.allSales }), label: x.label })),
        { strong: true, c: [P.pl.totalIn, money(s.totalIn), money(s.prevTotalIn)] },
        ...s.expenses.map((x, i) => {
          const b = st.booked[i];
          const onClick = x.bank
            ? (x.cur > 0 ? () => onDrill({ kind: "bank", key: "", label: P.pl.unbookedBank }) : undefined)
            : b && b.total > 0 ? () => onDrill({ kind: "category", key: b.category, only: "booked", label: catLabel(b.category) }) : undefined;
          return { c: [x.label, money(-x.cur), money(-x.prev)], onClick, label: x.label };
        }),
        { strong: true, c: [P.pl.totalOut, money(-s.totalOut), money(-s.prevTotalOut)] },
        { total: true, c: [s.net < 0 ? P.pl.netLoss : P.pl.net, money(s.net), money(s.prevNet)] },
      ];
      body = (
        <section className={CARD}>
          <h3 className={H3}>{P.pl.title}</h3>
          <p className={SUB}>{P.pl.sub}</p>
          <Stmt head={[P.account, labels.curCol, labels.prevCol]} rows={rows} />
          {(st.unbookedBank.total !== 0 || st.unbookedBank.prevTotal !== 0) && <p className="mt-2 text-xs text-slate-500">{P.pl.unbookedNote}</p>}
        </section>
      );
    }
  } else if (tab === "bs" || tab === "cf" || tab === "tax") {
    if (proLoading || !pro) body = <Loading />;
    else if (tab === "bs") {
      const b = pro.balance;
      const acct = (a: BalanceLine): Line => ({ c: [`${a.code ? a.code + " " : ""}${a.name}`, money(a.balance)] });
      const none: Line = { c: [<span key="n" className="text-slate-500">{P.bs.nothing}</span>, money(0)] };
      const rows: Line[] = [
        { strong: true, c: [P.bs.have, ""] }, ...(b.assets.length ? b.assets.map(acct) : [none]), { strong: true, c: [P.bs.total, money(b.totalAssets)] },
        { strong: true, c: [P.bs.owe, ""] }, ...(b.liabilities.length ? b.liabilities.map(acct) : [none]), { strong: true, c: [P.bs.total, money(b.totalLiabilities)] },
        { strong: true, c: [P.bs.equity, ""] }, ...b.equity.map(acct),
        ...(b.unclosedEarnings !== 0 || b.equity.length === 0 ? [{ c: [b.unclosedEarnings < 0 ? P.bs.unclosedLoss : P.bs.unclosed, money(b.unclosedEarnings)] }] : []),
        { strong: true, c: [P.bs.total, money(b.totalEquity)] },
        { total: true, c: [`${P.bs.owe} + ${c.file.capital}`, money(b.totalLiabilitiesAndEquity)] },
      ];
      const empty = b.assets.length + b.liabilities.length + b.equity.length === 0 && b.unclosedEarnings === 0;
      body = (
        <section className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className={H3}>{P.bs.title(labels.asOf)}</h3>
              <p className={SUB}>{P.bs.sub}</p>
            </div>
            {!empty && (b.balanced
              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{P.bs.ok}</span>
              : <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{money(b.difference)}</span>)}
          </div>
          {empty ? <p className="mt-3 text-sm text-slate-500">{P.bs.empty}</p> : <Stmt head={[P.account, P.amount]} rows={rows} />}
          {b.unclosedEarnings !== 0 && <p className="mt-2 text-xs text-slate-500">{P.bs.unclosedNote}</p>}
          {!b.balanced && <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{P.bs.off(money(b.difference))}</p>}
          {pro.banks.count > 0 && <p className="mt-2 text-xs text-slate-500">{P.bs.bankMemo(money(pro.banks.total), pro.banks.count)}</p>}
        </section>
      );
    } else if (tab === "cf") {
      const f = pro.cashFlow;
      const rows: Line[] = [
        { c: [P.cf.opening(labels.opening), money(f.opening)] },
        { c: [P.cf.sales, money(f.fromSales)], onClick: () => onDrill({ kind: "income", key: "", label: c.drill.allSales }), label: P.cf.sales },
        { c: [P.cf.expenses, money(-f.expensesPaid)] },
        ...(f.otherIn ? [{ c: [P.cf.otherIn, money(f.otherIn)] }] : []),
        ...(f.otherOut ? [{ c: [P.cf.otherOut, money(-f.otherOut)] }] : []),
        { total: true, c: [P.cf.closing(labels.asOf), money(f.closing)] },
      ];
      body = (
        <section className={CARD}>
          <h3 className={H3}>{P.cf.title(labels.label)}</h3>
          <p className={SUB}>{P.cf.sub}</p>
          <Stmt head={[P.concept, P.amount]} rows={rows} />
          <p className="mt-2 text-xs text-slate-500">{P.cf.note}</p>
        </section>
      );
    } else {
      const k = pro.contractors;
      const over = k.vendors.filter((v) => v.total >= k.threshold);
      const under = k.vendors.length - over.length;
      body = (
        <section className={CARD}>
          <h3 className={H3}>{P.tax.contractors(k.year)}</h3>
          <p className={SUB}>{P.tax.contractorsSub(money(k.threshold).replace(".00", ""))}</p>
          {over.length === 0 ? <p className="mt-3 text-sm text-slate-500">{P.tax.none}</p> : (
            <ul className="mt-2.5 grid gap-2">
              {over.map((v) => (
                <li key={v.vendorId} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5">
                  <MerchantLogo name={v.name} logoUrl={v.logoUrl} size={32} />
                  <div className="min-w-0">
                    <b className="block truncate text-sm font-[650] text-slate-900">{v.name}</b>
                    <span className="block text-xs text-slate-500 tabular-nums">{P.tax.paid(money(v.total), v.count)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {under > 0 && <p className="mt-2 text-xs text-slate-500">{P.tax.under(under)}</p>}
          <p className="mt-2.5 text-[13px] text-slate-500">{P.tax.note}</p>
        </section>
      );
    }
  } else if (tab === "ar") {
    if (arLoading || !ar) body = <Loading />;
    else {
      const aging = buildAging(ar.map((a) => ({ client: a.client, balance: a.balance, dueDate: a.due })), today);
      const b = P.ar.buckets;
      body = (
        <section className={CARD}>
          <h3 className={H3}>{P.ar.title}</h3>
          <p className={SUB}>{P.ar.sub}</p>
          {aging.rows.length === 0 ? <p className="mt-3 text-sm text-slate-500">{P.ar.empty}</p> : (
            <>
              <div className="hidden md:block">
                <Stmt
                  head={[P.ar.client, ...b, P.ar.total]}
                  rows={[
                    ...aging.rows.map((r) => ({ c: [r.client, ...r.buckets.map((v) => (v ? money(v) : "—")), money(r.total)] })),
                    { total: true, c: [P.ar.total, ...aging.totals.map((v) => (v ? money(v) : "—")), money(aging.total)] },
                  ]}
                />
              </div>
              <ul className="mt-2 grid gap-2 md:hidden">
                {aging.rows.map((r) => (
                  <li key={r.client} className="rounded-xl border border-slate-200 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2"><b className="truncate text-sm font-[650]">{r.client}</b><b className="text-sm tabular-nums">{money(r.total)}</b></div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {r.buckets.map((v, i) => (v ? <span key={i} className={cn("tabular-nums", i > 0 && "font-semibold text-red-600")}>{b[i]}: {money(v)}</span> : null))}
                    </div>
                  </li>
                ))}
                <li className="flex justify-between px-1 pt-1 text-sm font-[750]"><span>{P.ar.total}</span><span className="tabular-nums">{money(aging.total)}</span></li>
              </ul>
            </>
          )}
        </section>
      );
    }
  } else if (tab === "ap") {
    if (apLoading || !ap) body = <Loading />;
    else {
      const total = Math.round(ap.reduce((s, x) => s + Math.round(x.amount * 100), 0)) / 100;
      body = (
        <section className={CARD}>
          <h3 className={H3}>{P.ap.title}</h3>
          {ap.length === 0 ? <p className="mt-3 text-sm text-slate-500">{P.ap.empty}</p> : (
            <Stmt
              head={[P.ap.vendor, P.ap.due, P.ap.amount]}
              rows={[
                ...ap.map((x) => {
                  const late = daysBetween(x.due, today) > 0;
                  return {
                    c: [
                      <span key="v" className="flex min-w-0 items-center gap-2.5"><MerchantLogo name={x.vendor} size={28} /><span className="min-w-0"><span className="block truncate">{x.vendor}</span><span className="block truncate text-xs text-slate-500">{x.what}</span></span></span>,
                      late ? <span key="d" className="font-semibold text-red-600">{shortDay(x.due, locale)} · {P.ap.overdue}</span> : shortDay(x.due, locale),
                      money(x.amount),
                    ],
                  };
                }),
                { total: true, c: [P.ap.total, "", money(total)] },
              ]}
            />
          )}
        </section>
      );
    }
  } else {
    body = <Journal range={range} locale={locale} c={c} />;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200">
        <div role="tablist" aria-label={c.views.pro} className="flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PRO_TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => onTab(k)}
              className="relative inline-flex min-h-11 items-center whitespace-nowrap border-0 bg-transparent pb-3 pt-2.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 aria-selected:text-slate-900 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:scale-x-0 after:rounded-sm after:bg-blue-600 after:transition-transform aria-selected:after:scale-x-100"
            >
              {P.tabs[k]}
            </button>
          ))}
        </div>
        <span className="hidden shrink-0 pb-1 text-[13px] text-slate-500 lg:inline">{P.compared(labels.label, labels.vs)}</span>
      </div>
      {body}
    </>
  );
}

/** Libro diario: the period's entries with their lines (limit counts entries). */
function Journal({ range, locale, c }: { range: DateRange; locale: string; c: ReportesCopy }) {
  const [limit, setLimit] = useState(50);
  const q = trpc.reports.journalEntries.useQuery({ limit, offset: 0, startDate: range.startDate, endDate: range.endDate }, { placeholderData: (p) => p, staleTime: 30_000 });
  const J = c.pro.journal;
  const entries = q.data ?? [];
  return (
    <section className={CARD}>
      <h3 className={H3}>{J.title}</h3>
      <p className={SUB}>{J.sub(entries.length)}</p>
      {q.isLoading ? <div className="mt-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        : entries.length === 0 ? <p className="mt-3 text-sm text-slate-500">{J.empty}</p> : (
          <ul className="mt-2 divide-y divide-slate-200">
            {entries.map((e) => (
              <li key={e.id} className="py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <b className="min-w-0 font-[650] text-slate-900">{e.description}</b>
                  <span className="text-xs text-slate-500">{dayLabel(String(e.date).slice(0, 10), locale)} · {e.entryNumber}</span>
                </div>
                <table className="mt-1 w-full text-xs">
                  <thead className="sr-only"><tr><th>{c.pro.account}</th><th>{J.debit}</th><th>{J.credit}</th></tr></thead>
                  <tbody>
                    {e.lines.map((l) => (
                      <tr key={l.id} className="text-slate-600">
                        <td className="py-0.5 pr-2">{l.accountCode} {l.accountName}</td>
                        <td className="w-24 py-0.5 text-right tabular-nums">{Number(l.debit) ? money(Number(l.debit)) : ""}</td>
                        <td className="w-24 py-0.5 text-right tabular-nums">{Number(l.credit) ? money(Number(l.credit)) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
        )}
      {entries.length >= limit && limit < 500 && (
        <button type="button" className={cn(BTN, "mt-3")} disabled={q.isFetching} onClick={() => setLimit((l) => Math.min(500, l + 50))}>{J.more}</button>
      )}
    </section>
  );
}
