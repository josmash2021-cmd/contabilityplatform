import { Link } from "react-router";
import { ArrowRight, Landmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { reportesCopy } from "@/i18n/copy/reportes";
import { CARD, money, num, type BalanceSheet as BalanceData, type BankAccountRow } from "./format";

type Row = BalanceData["assets"][number];

/** Balance: what you have, what you owe and what's yours, as of today (journal entries + the bank). */
export function BalanceSheet({ data, loading, error }: { data: BalanceData | undefined; loading: boolean; error: boolean }) {
  const all = useCopy(reportesCopy);
  const t = all.balance;
  const assets = num(data?.totalAssets);
  const liabilities = num(data?.totalLiabilities);
  const equity = num(data?.totalEquity);
  // Revenue and expense accounts stay open until a period is closed, so the books only balance
  // once that profit is counted as part of what's yours. Shown as its own, labeled line.
  const unclosed = assets - liabilities - equity;
  const empty = !!data && data.assets.length === 0 && data.liabilities.length === 0 && data.equity.length === 0;

  return (
    <section className={CARD} aria-labelledby="rep-balance-title">
      <h2 id="rep-balance-title" className="font-semibold text-slate-900">{t.title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t.sub}</p>

      {loading ? (
        <div className="mt-4 space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full bg-slate-100" />)}</div>
      ) : error || !data ? (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{all.error.title}</p>
      ) : empty ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{t.empty}</p>
      ) : (
        <>
          <Group plain={t.assets} formal={t.assetsFormal} rows={data.assets} total={assets} none={t.none} totalLabel={t.totalOf(t.assets)} />
          <Group plain={t.liabilities} formal={t.liabilitiesFormal} rows={data.liabilities} total={liabilities} none={t.none} totalLabel={t.totalOf(t.liabilities)} />
          <Group
            plain={t.equity}
            formal={t.equityFormal}
            rows={data.equity}
            extra={Math.abs(unclosed) > 0.004 ? { name: t.unclosed, hint: t.unclosedHint, amount: unclosed } : undefined}
            total={equity + unclosed}
            none={t.none}
            totalLabel={t.totalOf(t.equity)}
          />
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            {t.check}: <span className="font-semibold tabular-nums text-slate-900">{money(assets)} = {money(liabilities)} + {money(equity + unclosed)}</span>
          </p>
          <p className="mt-2 text-xs text-slate-500">{t.asOfToday}</p>
        </>
      )}
    </section>
  );
}

function Group({ plain, formal, rows, extra, total, none, totalLabel }: {
  plain: string;
  formal: string;
  rows: Row[];
  extra?: { name: string; hint: string; amount: number };
  total: number;
  none: string;
  totalLabel: string;
}) {
  return (
    <div className="mt-4">
      <h3 className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-1.5">
        <span className="text-sm font-semibold text-slate-900">{plain}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{formal}</span>
      </h3>
      <ul className="divide-y divide-slate-100">
        {rows.length === 0 && !extra && <li className="py-2.5 text-sm text-slate-500">{none}</li>}
        {rows.map((r) => (
          <li key={`${r.code}-${r.name}`} className="flex items-start justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm text-slate-800">{r.name}</span>
              <span className="block text-xs tabular-nums text-slate-500">{r.code}</span>
            </span>
            <span className="shrink-0 text-sm tabular-nums text-slate-900">{money(num(r.balance))}</span>
          </li>
        ))}
        {extra && (
          <li className="flex items-start justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm text-slate-800">{extra.name}</span>
              <span className="block text-xs text-slate-500">{extra.hint}</span>
            </span>
            <span className="shrink-0 text-sm tabular-nums text-slate-900">{money(extra.amount)}</span>
          </li>
        )}
        <li className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-sm font-semibold text-slate-900">{totalLabel}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(total)}</span>
        </li>
      </ul>
    </div>
  );
}

/** Tu banco: today's balance per account and this month's movement (everything in the bank, personal too). */
export function BankCard({ connected, loading, accounts, total, monthLabel, monthIn, monthOut, moves, monthLoading }: {
  connected: boolean;
  loading: boolean;
  accounts: BankAccountRow[];
  total: number;
  monthLabel: string;
  monthIn: number;
  monthOut: number;
  moves: number;
  monthLoading: boolean;
}) {
  const t = useCopy(reportesCopy).bank;
  return (
    <section className={cn(CARD, "lg:self-start")} aria-labelledby="rep-bank-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="rep-bank-title" className="font-semibold text-slate-900">{t.title}</h2>
        {connected && (
          <Link to="/bank" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-blue-600 hover:underline sm:min-h-0">
            {t.open}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      {loading ? (
        <div className="mt-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full bg-slate-100" />)}</div>
      ) : !connected ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center">
          <Landmark className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm text-slate-500">{t.none}</p>
          <Link to="/bank" className="mt-3 inline-flex h-11 items-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 sm:h-10">{t.connect}</Link>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs font-medium text-slate-500">{t.total}</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">{money(total)}</p>
          {accounts.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {accounts.map((a) => (
                <li key={`${a.id}-${a.plaidAccountId ?? ""}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800">{a.bankName ?? "—"}</span>
                    {(a.accountType || a.accountNumber) && (
                      <span className="block truncate text-xs text-slate-500">{[a.accountType ? (t.types[a.accountType.toLowerCase()] ?? a.accountType) : "", a.accountNumber ? `••${String(a.accountNumber).slice(-4)}` : ""].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                  <span className={cn("shrink-0 text-sm font-semibold tabular-nums", num(a.currentBalance) < 0 ? "text-red-700" : "text-slate-900")}>{money(num(a.currentBalance))}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">{t.month(monthLabel)}</p>
            {monthLoading ? (
              <Skeleton className="mt-2 h-5 w-40 bg-slate-200" />
            ) : (
              <>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-sm">
                  <p className="text-slate-600">{t.in} <b className="tabular-nums text-emerald-700">+{money(monthIn)}</b></p>
                  <p className="text-slate-600">{t.out} <b className="tabular-nums text-red-700">{money(-monthOut)}</b></p>
                </div>
                <p className="mt-1 text-xs text-slate-500">{t.moves(moves)} · {t.note}</p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
