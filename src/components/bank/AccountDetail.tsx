import { useId, useState } from "react";
import { Link } from "react-router";
import { AlertCircle, ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { BankLogo } from "@/components/brand/BankLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { bancosCopy } from "@/i18n/copy/bancos";
import { bankCopy } from "@/i18n/copy/bank";
import { StatusPill } from "./AccountCard";
import {
  BTN_SM, BTN_SM_PRIMARY, accountTitle, categoryLabel, money, money0, relTime, reviewLink, shortDay, typeLabel,
  type AccountMonth, type BankInfo, type MonthMovement, type OverviewAccount,
} from "./bankView";

type Props = {
  account: OverviewAccount;
  bank: BankInfo;
  now: number;
  canManage: boolean;
  syncing: boolean;
  reconnecting: boolean;
  month: number;
  year: number;
  /** Today's month and year, so future months aren't offered. */
  current: { month: number; year: number };
  onPeriod: (month: number, year: number) => void;
  onBack: () => void;
  onReconnect: () => void;
};

type Filter = "all" | "in" | "out";

/**
 * "Ver movimientos": one account, like the prototype's bankDetail(): the balance, what's left to review and
 * the month's money in and out, then the month's movements (all / in / out) with their review state. The
 * month picker, the categories and the year line are the old month view, moved here.
 */
export function AccountDetail({ account: a, bank, now, canManage, syncing, reconnecting, month, year, current, onPeriod, onBack, onReconnect }: Props) {
  const c = useCopy(bancosCopy);
  const t = c.detail;
  const legacy = useCopy(bankCopy);
  const { lang } = useLang();
  const id = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const q = trpc.banks.accountMonth.useQuery({ accountId: a.id, year, month }, { staleTime: 60_000 });
  const card = a.kind !== "cash";
  const needs = bank.needsReconnect;
  const updated = relTime(a.lastSyncedAt, now, c.rel);
  const monthName = legacy.months[month - 1] ?? "";
  const cat = (k: string) => categoryLabel(k, c.categories, legacy.categories);

  const rows = q.data?.transactions ?? [];
  const ins = rows.filter((r) => r.direction === "in");
  const outs = rows.filter((r) => r.direction === "out");
  const shown = filter === "in" ? ins : filter === "out" ? outs : rows;

  const months = legacy.months.map((label, i) => ({ value: i + 1, label })).filter((m) => year < current.year || m.value <= current.month);
  const years = [current.year, current.year - 1, current.year - 2];
  const select = "h-11 rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus-visible:border-blue-500 focus-visible:ring-[3px] focus-visible:ring-blue-50 sm:h-9 sm:text-sm";

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onBack} className="mb-2 inline-flex min-h-11 items-center gap-1.5 py-1 text-[13px] font-semibold text-slate-500 hover:text-slate-900 sm:min-h-0">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t.back}
        </button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-[22px] font-[750] tracking-tight text-slate-900">
              <BankLogo name={bank.name} logo={bank.logo} color={bank.color} size={32} />
              <span className="min-w-0 truncate">{accountTitle(a)}</span>
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.sub(typeLabel(a, c.accounts.types), bank.name, updated ? c.accounts.updated(updated) : c.accounts.never)}</p>
          </div>
          <div className="flex items-center gap-2">
            {needs && canManage && <button type="button" onClick={onReconnect} disabled={reconnecting} className={BTN_SM_PRIMARY}>{c.alert.button}</button>}
            <StatusPill state={syncing ? "sync" : needs ? "needs" : "ok"} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
        {card ? (
          <Kpi label={t.owed} value={money(a.balance)}
            sub={a.creditLimit ? c.accounts.usage(money0(a.balance), money0(a.creditLimit)) : t.balanceSub} />
        ) : (
          <Kpi label={t.balance} value={money(a.balance)} sub={needs ? t.lastBalanceSub : t.balanceSub} />
        )}
        <Kpi label={t.toReview} value={String(a.unreviewed)} good={a.unreviewed === 0}
          sub={a.unreviewed > 0
            ? <>{t.toReviewSub(a.unreviewed)} · <Link to={reviewLink(a.id)} className="font-semibold text-blue-600 underline underline-offset-2">{t.reviewAll}</Link></>
            : t.toReviewSub(0)} />
        <Kpi label={t.thisMonth(monthName.toLowerCase())}
          value={q.data ? <><span className="text-emerald-600">+{money0(q.data.income)}</span> · −{money0(q.data.expense)}</> : "—"}
          sub={card ? t.payCharge : t.inOut} />
      </div>

      <div className="flex flex-col gap-2.5 border-slate-200 sm:flex-row sm:items-end sm:justify-between sm:border-b">
        <div role="tablist" aria-label={t.filter} className="flex gap-6 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] sm:border-b-0">
          {([["all", t.all, rows.length], ["in", card ? t.inCard : t.in, ins.length], ["out", card ? t.outCard : t.out, outs.length]] as const).map(([key, label, n]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
              className={cn("relative inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap pb-3 pt-2.5 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-sm after:bg-blue-600 after:transition-transform",
                filter === key ? "text-slate-900 after:scale-x-100" : "text-slate-500 after:scale-x-0 hover:text-slate-900")}>
              <span>{label}</span>
              <span className={cn("min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-bold", filter === key ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>{n}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 pb-2">
          <label htmlFor={`${id}-m`} className="sr-only">{t.month}</label>
          <select id={`${id}-m`} value={month} onChange={(e) => onPeriod(Number(e.target.value), year)} className={cn(select, "flex-1 sm:flex-none")}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <label htmlFor={`${id}-y`} className="sr-only">{t.year}</label>
          <select id={`${id}-y`} value={year} onChange={(e) => { const y = Number(e.target.value); onPeriod(y === current.year ? Math.min(month, current.month) : month, y); }} className={select}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 rounded-[14px] border border-slate-200 bg-white p-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
      ) : q.isError ? (
        <div className="rounded-[14px] border border-red-200 bg-white p-5 text-center">
          <AlertCircle className="mx-auto h-5 w-5 text-red-600" aria-hidden="true" />
          <p className="mt-1 text-sm text-slate-800">{t.error}</p>
          <button type="button" onClick={() => void q.refetch()} className={cn(BTN_SM, "mt-3")}>{c.retry}</button>
        </div>
      ) : (
        <div className="rounded-[14px] border border-slate-200 bg-white px-3.5 py-1 motion-safe:animate-fade-up">
          {shown.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-slate-500">
              <p>{t.empty}</p>
              {rows.length === 0 && <p className="mt-1">{t.emptyMonth}</p>}
            </div>
          ) : (
            <ul>
              {shown.map((r) => <MovementRow key={r.id} r={r} reviewFrom={q.data?.reviewFrom ?? ""} accountId={a.id} cat={cat} lang={lang} monthsShort={legacy.monthsShort} />)}
            </ul>
          )}
        </div>
      )}

      {q.data && rows.length > 0 && <Categories data={q.data} month={month} year={year} cat={cat} />}
      {q.data && q.data.year.some((m) => m.count > 0) && <YearLine data={q.data} year={year} months={legacy.months} />}

      <Link to="/transactions" className="flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white text-sm font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {t.seeAll}<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function Kpi({ label, value, sub, good }: { label: string; value: React.ReactNode; sub: React.ReactNode; good?: boolean }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-slate-200 bg-white px-4 py-3.5">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-[23px] font-[750] tracking-[-0.02em] text-slate-900 tabular-nums">{value}</div>
      <div className={cn("mt-[3px] text-xs", good ? "text-emerald-600" : "text-slate-500")}>{sub}</div>
    </div>
  );
}

function MovementRow({ r, reviewFrom, accountId, cat, lang, monthsShort }: {
  r: MonthMovement; reviewFrom: string; accountId: number; cat: (k: string) => string; lang: "es" | "en"; monthsShort: readonly string[];
}) {
  const t = useCopy(bancosCopy).detail;
  const pending = !r.reviewed && r.date >= reviewFrom;
  const state = r.reviewed ? "ok" : pending ? "pend" : "old";
  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 py-[11px] last:border-b-0">
      <span className="text-xs text-slate-500">{shortDay(r.date, lang, monthsShort)}</span>
      <div className="min-w-0">
        <b className="block truncate text-sm font-semibold text-slate-900">{r.description}</b>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <i className={cn("h-1.5 w-1.5 shrink-0 rounded-full", state === "ok" ? "bg-emerald-600" : state === "pend" ? "bg-amber-600" : "bg-slate-400")} aria-hidden="true" />
          <span className="truncate">{state === "ok" ? t.reviewed(cat(r.category)) : state === "pend" ? t.pending : cat(r.category)}{r.importedFrom === "csv" ? ` · ${t.csv}` : ""}</span>
        </span>
      </div>
      <div className="grid justify-items-end">
        <span className={cn("whitespace-nowrap text-[15px] font-[750] tabular-nums", r.direction === "in" ? "text-emerald-600" : "text-slate-900")}>
          {r.direction === "in" ? "+" : "−"}{money(r.amount)}
        </span>
        {pending && <Link to={reviewLink(accountId)} className="text-[13px] font-semibold text-blue-600 underline underline-offset-2">{t.reviewOne}</Link>}
      </div>
    </li>
  );
}

/** The month by category, linking to the category drill-down (/bank/category/:key), as the old month view did. */
function Categories({ data, month, year, cat }: { data: AccountMonth; month: number; year: number; cat: (k: string) => string }) {
  const t = useCopy(bancosCopy).detail;
  const groups = { in: new Map<string, { total: number; count: number }>(), out: new Map<string, { total: number; count: number }>() };
  for (const r of data.transactions) {
    const g = groups[r.direction];
    const cur = g.get(r.category) ?? { total: 0, count: 0 };
    g.set(r.category, { total: cur.total + r.amount, count: cur.count + 1 });
  }
  const list = (dir: "in" | "out") => [...groups[dir].entries()].sort((a, b) => b[1].total - a[1].total);
  return (
    <details className="group rounded-[14px] border border-slate-200 bg-white px-4 py-3">
      <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        {t.byCategory}<ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {(["in", "out"] as const).map((dir) => list(dir).length > 0 && (
          <div key={dir}>
            <h3 className="text-xs font-medium text-slate-500">{dir === "in" ? t.inCats : t.outCats}</h3>
            <ul className="mt-1">
              {list(dir).map(([key, v]) => (
                <li key={key}>
                  <Link to={`/bank/category/${encodeURIComponent(key)}?month=${month}&year=${year}`} aria-label={`${t.openCategory(cat(key))}: ${dir === "in" ? "+" : "−"}${money(v.total)}`}
                    className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">{cat(key)}</span>
                      <span className="block text-[11px] text-slate-500">{t.count(v.count)}</span>
                    </span>
                    <span className={cn("shrink-0 text-sm font-semibold tabular-nums", dir === "in" ? "text-emerald-600" : "text-slate-900")}>{dir === "in" ? "+" : "−"}{money(v.total)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function YearLine({ data, year, months }: { data: AccountMonth; year: number; months: readonly string[] }) {
  const t = useCopy(bancosCopy).detail;
  const inc = data.year.reduce((s, m) => s + m.income, 0);
  const out = data.year.reduce((s, m) => s + m.expense, 0);
  return (
    <details className="group rounded-[14px] bg-slate-100 px-4 py-3 text-sm">
      <summary className="flex min-h-7 cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-slate-700 [&::-webkit-details-marker]:hidden">
        <span>{t.yearLine(String(year), money(inc), money(out))}</span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">{t.byMonth}<ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden="true" /></span>
      </summary>
      <ul className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
        {data.year.filter((m) => m.count > 0).map((m) => (
          <li key={m.month} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">{months[m.month - 1]}</span>
            <span className="tabular-nums"><span className="text-emerald-600">+{money(m.income)}</span> <span className="text-slate-700">−{money(m.expense)}</span></span>
          </li>
        ))}
      </ul>
    </details>
  );
}
