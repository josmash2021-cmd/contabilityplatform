import { useId } from "react";
import { Link } from "react-router";
import { AlertCircle, ArrowDownLeft, ArrowRight, ArrowUpRight, ChevronRight, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { bankCopy } from "@/i18n/copy/bank";
import { bancoNegocioCopy } from "@/i18n/copy/bancoNegocio";
import { money, txDay, type BankAccountView, type MonthTx } from "./bankUtils";

type YearData = { income: string; expense: string; transactionCount: number; monthly?: { monthNum: number; income: string; expense: string; transactionCount: number }[] };

type Props = {
  accounts: BankAccountView[];
  accountId: number | undefined;
  onAccount: (id: number) => void;
  month: number;
  year: number;
  onMonth: (m: number) => void;
  onYear: (y: number) => void;
  /** Today's month and year, so future months aren't offered. */
  now: { month: number; year: number };
  data: { income: string; expense: string; transactions: MonthTx[] } | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  yearData: YearData | undefined;
  className?: string;
};

type Cat = { key: string; total: number; count: number };

/** The chosen month for one account: what came in and went out, by category, the latest movements, and the way to /transactions. */
export function BankMonthCard({ accounts, accountId, onAccount, month, year, onMonth, onYear, now, data, loading, error, onRetry, yearData, className = "" }: Props) {
  const t = useCopy(bancoNegocioCopy).month;
  const bank = useCopy(bankCopy);
  const locale = intlLocale(useLang().lang);
  const id = useId();

  const months = bank.months.map((label, i) => ({ value: i + 1, label })).filter((m) => year < now.year || m.value <= now.month);
  const years = [now.year, now.year - 1];
  const period = `${bank.months[month - 1]} ${year}`;
  const catLabel = (key: string) => bank.categories[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const txs = data?.transactions ?? [];
  const inc = Number(data?.income ?? 0);
  const out = Number(data?.expense ?? 0);
  const net = inc - out;

  // Categories from the month's transactions (the server doesn't group them).
  const byCat = new Map<string, Cat & { type: string }>();
  for (const tx of txs) {
    const key = tx.category || "other";
    const type = tx.type === "income" ? "income" : "expense";
    const k = `${type}:${key}`;
    const c = byCat.get(k) ?? { key, total: 0, count: 0, type };
    c.total += Number(tx.amount ?? 0);
    c.count += 1;
    byCat.set(k, c);
  }
  const cats = [...byCat.values()].sort((a, b) => b.total - a.total);
  const inCats = cats.filter((c) => c.type === "income");
  const outCats = cats.filter((c) => c.type === "expense");

  const selectCls = "h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:h-10 sm:text-sm";
  const pickable = accounts.filter((a) => a.dbId !== null);

  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-title`} className="font-semibold text-slate-900">{t.title}</h2>
        {!loading && !error && <span className="text-xs text-slate-500">{t.count(txs.length)}</span>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1.6fr_1fr_0.8fr]">
        {pickable.length > 0 && (
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${id}-acc`} className="mb-1 block text-xs font-medium text-slate-600">{t.account}</label>
            <select id={`${id}-acc`} value={accountId ?? ""} onChange={(e) => onAccount(Number(e.target.value))} className={selectCls}>
              {pickable.map((a) => <option key={a.key} value={a.dbId ?? ""}>{a.name}{a.mask ? ` ··${a.mask}` : ""}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-month`} className="mb-1 block text-xs font-medium text-slate-600">{t.month}</label>
          <select id={`${id}-month`} value={month} onChange={(e) => onMonth(Number(e.target.value))} className={selectCls}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-year`} className="mb-1 block text-xs font-medium text-slate-600">{t.year}</label>
          <select id={`${id}-year`} value={year} onChange={(e) => onYear(Number(e.target.value))} className={selectCls}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /></div>
      ) : error ? (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-center">
          <AlertCircle className="mx-auto h-5 w-5 text-red-600" />
          <p className="mt-1 text-sm text-red-800">{t.error}</p>
          <button onClick={onRetry} className="mt-2 inline-flex h-11 items-center rounded-[10px] border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 sm:h-10">{t.retry}</button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label={t.in} value={`+${money(inc)}`} tone="text-emerald-700" bg="bg-emerald-50" />
            <Stat label={t.out} value={`−${money(out)}`} tone="text-red-700" bg="bg-red-50" />
            <Stat label={t.net} value={net >= 0 ? `+${money(net)}` : money(net)} tone={net >= 0 ? "text-slate-900" : "text-red-700"} bg="bg-slate-50" />
          </div>

          {txs.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-center">
              <p className="text-sm font-medium text-slate-700">{t.empty(period)}</p>
              <p className="mt-1 text-xs text-slate-500">{t.emptyHint}</p>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <CatList title={t.inCats} cats={inCats} sign="+" tone="text-emerald-700" month={month} year={year} label={catLabel} openLabel={t.openCategory} countLabel={t.count} />
                <CatList title={t.outCats} cats={outCats} sign="−" tone="text-red-700" month={month} year={year} label={catLabel} openLabel={t.openCategory} countLabel={t.count} />
              </div>

              <h3 className="mt-5 text-xs font-medium text-slate-500">{t.latest}</h3>
              <ul className="mt-1 divide-y divide-slate-100">
                {txs.slice(0, 3).map((tx, i) => {
                  const income = tx.type === "income";
                  const day = txDay(tx.transactionDate);
                  return (
                    <li key={tx.id ?? tx.plaidTransactionId ?? i} className={`flex items-center gap-3 py-2.5 ${tx.isReversed ? "opacity-60" : ""}`}>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tx.isReversed ? "bg-slate-100 text-slate-500" : income ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                        {tx.isReversed ? <RotateCcw className="h-4 w-4" /> : income ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-medium ${tx.isReversed ? "text-slate-500 line-through" : "text-slate-900"}`}>{tx.description}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {catLabel(tx.category || "other")}{day ? ` · ${day.toLocaleDateString(locale, { day: "numeric", month: "short" })}` : ""}{tx.isReversed ? ` · ${t.reversed}` : ""}
                        </span>
                      </span>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${tx.isReversed ? "text-slate-400 line-through" : income ? "text-emerald-700" : "text-slate-900"}`}>
                        {income ? "+" : "−"}{money(Number(tx.amount ?? 0))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <Link to="/transactions" className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            {t.seeAll}<ArrowRight className="h-4 w-4" />
          </Link>

          {yearData && Number(yearData.transactionCount) > 0 && (
            <details className="group mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
              <summary className="flex min-h-[28px] cursor-pointer list-none items-center justify-between gap-2 text-slate-700 [&::-webkit-details-marker]:hidden">
                <span>{t.yearLine(String(year), money(Number(yearData.income)), money(Number(yearData.expense)))}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700">{t.byMonth}<ChevronRight className="h-3.5 w-3.5 transition group-open:rotate-90" /></span>
              </summary>
              <ul className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                {(yearData.monthly ?? []).filter((m) => m.transactionCount > 0).map((m) => (
                  <li key={m.monthNum} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">{bank.months[m.monthNum - 1]}</span>
                    <span className="tabular-nums"><span className="text-emerald-700">+{money(Number(m.income))}</span> <span className="text-red-700">−{money(Number(m.expense))}</span></span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, tone, bg }: { label: string; value: string; tone: string; bg: string }) {
  return (
    <div className={`min-w-0 rounded-xl px-3 py-2.5 ${bg}`}>
      <p className="text-xs text-slate-600">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold tabular-nums sm:text-base ${tone}`}>{value}</p>
    </div>
  );
}

function CatList({ title, cats, sign, tone, month, year, label, openLabel, countLabel }: {
  title: string; cats: Cat[]; sign: string; tone: string; month: number; year: number;
  label: (k: string) => string; openLabel: (name: string) => string; countLabel: (n: number) => string;
}) {
  if (cats.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-medium text-slate-500">{title}</h3>
      <ul className="mt-1">
        {cats.map((c) => {
          const name = label(c.key);
          return (
            <li key={c.key}>
              <Link to={`/bank/category/${c.key}?month=${month}&year=${year}`} aria-label={`${openLabel(name)}: ${sign}${money(c.total)}`}
                className="-mx-2 flex min-h-[44px] items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">{name}</span>
                  <span className="block text-[11px] text-slate-500">{countLabel(c.count)}</span>
                </span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${tone}`}>{sign}{money(c.total)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
