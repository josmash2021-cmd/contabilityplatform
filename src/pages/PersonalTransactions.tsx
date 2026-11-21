import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Loader2, Plus, Receipt, RefreshCw, Search, SearchX } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/personal/CategoryIcon";
import { ConnectBankHero } from "@/components/personal/ConnectBankHero";
import { ManualTxDialog } from "@/components/personal/ManualTxDialog";
import { MonthNav } from "@/components/personal/MonthNav";
import {
  accountName, dayKey, isDebt, localTodayKey, money, monthIndex, monthOnly, num, signed, txDay, ui, upperFirst,
  type BankTx, type ManualTx, type PersonalAccount, type YearMonth,
} from "@/components/personal/personalUtils";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalCopy } from "@/i18n/copy/personal";
import { budgetCategoryLabel } from "@/i18n/copy/budgets";
import { personalPagesCopy } from "@/i18n/copy/personalPages";

// ─── Filters (the same rules as before; a chip only shows when the month has movements for it) ───
type FilterKey = "all" | "income" | "expense" | "devoluciones" | "zelle_in" | "zelle_out" | "cash_deposit" | "cash_withdrawal" | "gasolina" | "streaming" | "p2p";
type Matchable = { category: string; description: string; type: string };

const P2P_KEYWORDS = ["paypal", "cash app", "venmo", "square", "clover", "facebook pay"];
const GAS_BRANDS = [
  // Major brands
  "shell", "exxon", "chevron", "bp", "mobil", "texaco", "marathon", "speedway",
  "valero", "citgo", "phillips 66", "sinclair", "gulf", "esso", "arco",
  // Regional chains
  "76", "union 76", "kum & go", "kum and go", "quik trip", "quiktrip", "race trac",
  "racetrac", "sheetz", "wawa", "pilot", "flying j", "love's", "maverik", "thorntons",
  "stripes", "murphy usa", "casey's", "caseys", "holiday", "cumberland farms",
  "royal farms", "getgo", "parkers", "parker's", "quick chek", "quickchek",
  "stewart's", "stewarts", "oncue", "p66", "kennedy",
  // Warehouse/club gas
  "costco gas", "walmart gas", "sam's club gas", "buc-ee's", "bucees",
  "7-eleven gas", "7 eleven gas",
  // Generic keywords
  "gasoline", "petrol", "fuel", "gas station", "gas sta", "gasoline station",
];
const GAS_RES = GAS_BRANDS.map((b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
// Streaming services: Netflix, Spotify, Disney, HBO, etc.
const STREAMING_SERVICES = [
  "netflix", "spotify", "disney", "hulu", "hbo", "max", "paramount", "peacock",
  "prime video", "youtube premium", "youtube tv", "crunchyroll", "twitch",
  "starz", "showtime", "amc+", "apple tv", "apple music", "apple arcade",
  "amazon prime", "netflix.com", "disneyplus", "hbomax",
];

const lower = (t: Matchable) => t.description.toLowerCase();
const isDevolucion = (t: Matchable) => {
  const n = lower(t);
  return t.category === "refund" || n.includes("refund") || n.includes("devolucion") || n.includes("reembolso");
};
const isP2P = (t: Matchable) => t.category === "transfer" || P2P_KEYWORDS.some((k) => lower(t).includes(k));
const isGas = (t: Matchable) => {
  const n = lower(t);
  // Zelle transactions are never gas, even if the backend mis-categorized them.
  if (n.includes("zelle")) return false;
  if (t.category === "gasolina") return true;
  return GAS_RES.some((re) => re.test(n));
};
const isStreaming = (t: Matchable) => t.category === "subscription" || t.category === "membership" || STREAMING_SERVICES.some((s) => lower(t).includes(s));

const FILTERS: Record<Exclude<FilterKey, "all">, (t: Matchable) => boolean> = {
  income: (t) => t.type === "income",
  expense: (t) => t.type === "expense",
  devoluciones: isDevolucion,
  zelle_in: (t) => t.category === "zelle_income",
  zelle_out: (t) => t.category === "zelle_sent",
  cash_deposit: (t) => t.category === "cash_deposit",
  cash_withdrawal: (t) => t.category === "cash_withdrawal",
  gasolina: isGas,
  streaming: isStreaming,
  p2p: isP2P,
};
const FILTER_ORDER = Object.keys(FILTERS) as Exclude<FilterKey, "all">[];

/** One line in the list: a bank movement or one the person added by hand. */
type Row = Matchable & { key: string; amount: number; date: unknown; bankName: string | null; manual: ManualTx | null };

/**
 * 2.0 personal movements: the month's bank movements (all accounts or one), plus the ones the person adds by hand,
 * with month navigation, account, search, the category filters, and a manual "Refresh" from the bank.
 */
export default function PersonalTransactions() {
  const all = useCopy(personalPagesCopy);
  const t = all.tx;
  const { categories } = useCopy(personalCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const uid = useId();
  const utils = trpc.useUtils();

  // This month, the oldest month to pick (January two years back, as the old year list), today and yesterday.
  const calendar = useMemo(() => {
    const now = new Date();
    const current: YearMonth = { y: now.getFullYear(), m: now.getMonth() + 1 };
    return {
      current,
      min: { y: current.y - 2, m: 1 },
      today: localTodayKey(now),
      yesterday: localTodayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)),
    };
  }, []);
  const [picked, setPicked] = useState<YearMonth | null>(null);
  const period = picked ?? calendar.current;
  const [filterType, setFilterType] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [showPlaidOverlay, setShowPlaidOverlay] = useState(false);
  const [dialog, setDialog] = useState<{ editing: ManualTx | null; defaultDate: string } | null>(null);

  trpc.bank.checkConnection.useQuery(undefined, { staleTime: 60000, refetchOnMount: true });
  // Accounts: live from Plaid with the saved balance (and the saved id, which movements point to); the saved ones when Plaid can't answer.
  const { data: plaidAccountsData } = trpc.bank.getAllPlaidAccounts.useQuery(undefined, { staleTime: 60000 });
  const { data: dbAccounts, isLoading: loadingAccounts } = trpc.bank.listAccounts.useQuery(undefined, { staleTime: 30000 });
  const accounts: PersonalAccount[] = useMemo(() => {
    const saved = (dbAccounts ?? []) as PersonalAccount[];
    const live = (plaidAccountsData?.accounts ?? []) as PersonalAccount[];
    if (live.length === 0) return saved;
    return live.map((pa) => {
      const match = saved.find((s) => s.id === pa.id || s.plaidAccountId === pa.plaidAccountId);
      return match ? { ...pa, id: match.id, currentBalance: match.currentBalance } : pa;
    });
  }, [dbAccounts, plaidAccountsData]);
  const hasAccounts = accounts.length > 0;
  const accountId = selectedAccountId ? parseInt(selectedAccountId) : undefined;

  const monthQ = trpc.bank.getMonthData.useQuery({ year: period.y, month: period.m, accountId });
  const manualQ = trpc.personal.listTransactions.useQuery({ year: period.y, month: period.m });

  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) toast.success(t.synced(data.added));
      void utils.bank.getMonthData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const catLabel = (cat: string, type: string) =>
    (type === "income" ? categories.income : categories.expense)[cat] ?? categories.short[cat] ?? budgetCategoryLabel(cat, {});

  // ─── The month's rows: bank (when there are accounts) + by hand (only with every account, they belong to none) ───
  const bankTxs = (monthQ.data?.transactions ?? []) as BankTx[];
  const manualTxs = (manualQ.data ?? []) as ManualTx[];
  const rows: Row[] = [
    ...(hasAccounts ? bankTxs : []).map((x, i): Row => ({
      key: `b-${x.plaidTransactionId ?? x.id ?? i}`, description: x.description ?? "", category: x.category ?? "other", type: x.type,
      amount: num(x.amount), date: x.transactionDate, bankName: x.bankName ?? null, manual: null,
    })),
    ...(accountId ? [] : manualTxs).map((x): Row => ({
      key: `m-${x.id}`, description: x.description, category: x.category, type: x.type,
      amount: num(x.amount), date: x.transactionDate, bankName: null, manual: x,
    })),
  ];
  const income = rows.filter((r) => r.type === "income");
  const expense = rows.filter((r) => r.type === "expense");
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expense.reduce((s, r) => s + r.amount, 0);

  const available: FilterKey[] = ["all", ...FILTER_ORDER.filter((k) => rows.some(FILTERS[k]))];
  const filter: FilterKey = available.includes(filterType) ? filterType : "all";
  const q = searchQuery.trim().toLowerCase();
  const shown = rows
    .filter((r) => filter === "all" || FILTERS[filter](r))
    .filter((r) => !q || r.description.toLowerCase().includes(q))
    .map((r, i) => ({ r, i, day: dayKey(r.date) }))
    .sort((a, b) => (a.day === b.day ? a.i - b.i : a.day < b.day ? 1 : -1));
  const groups: { day: string; date: unknown; items: Row[] }[] = [];
  for (const { r, day } of shown) {
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(r);
    else groups.push({ day, date: r.date, items: [r] });
  }
  const dayTitle = (day: string, date: unknown) =>
    day === calendar.today ? t.today : day === calendar.yesterday ? t.yesterday : upperFirst(txDay(date, locale, { weekday: "long", day: "numeric", month: "long" }));

  // Third tile: the picked account's balance, what's available across accounts, or what you kept without a bank.
  const selectedAccount = accounts.find((a) => String(a.id) === selectedAccountId);
  const cashAccounts = accounts.filter((a) => !isDebt(a.accountType));
  const kept = totalIncome - totalExpense;

  const loading = manualQ.isLoading || loadingAccounts || (hasAccounts && monthQ.isLoading);
  const showConnect = !loadingAccounts && !hasAccounts;
  const monthName = monthOnly(period, locale);
  const isCurrent = monthIndex(period) === monthIndex(calendar.current);

  const openNew = () => {
    const now = new Date();
    // Today in this month; the month's last day when looking at an earlier one, so it shows up in this list.
    const last = new Date(period.y, period.m, 0).getDate();
    setDialog({ editing: null, defaultDate: isCurrent ? localTodayKey(now) : `${period.y}-${String(period.m).padStart(2, "0")}-${String(last).padStart(2, "0")}` });
  };
  const refresh = () => syncMutation.mutate({ year: period.y, month: period.m, accountId });
  const clearFilters = () => { setFilterType("all"); setSearchQuery(""); };

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-3 sm:items-end">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
          </div>
          <button type="button" onClick={openNew} className={cn(ui.primary, "shrink-0")}>
            <Plus className="h-4 w-4" aria-hidden="true" /><span className="sm:hidden">{t.addShort}</span><span className="hidden sm:inline">{t.add}</span>
          </button>
        </header>

        {showConnect && <ConnectBankHero onConnect={() => setShowPlaidOverlay(true)} />}

        {/* Month, account, search, refresh and the filters */}
        <section className={ui.card} aria-label={t.toolsLabel}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <MonthNav value={period} min={calendar.min} max={calendar.current} onChange={setPicked} locale={locale} picker showLabel
              labels={{ month: all.shared.month, prev: all.shared.prevMonth, next: all.shared.nextMonth }} className="lg:w-[20rem]" />
            {accounts.length > 1 && (
              <div className="lg:w-72">
                <label htmlFor={`${uid}-acct`} className="mb-1.5 block text-xs font-medium text-slate-600">{all.shared.account}</label>
                <select id={`${uid}-acct`} value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className={ui.control}>
                  <option value="">{t.allAccounts}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>{accountName(a, all.shared.accountFallback)} · {money(num(a.currentBalance), true)}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end gap-2 lg:flex-1">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${uid}-q`} className="mb-1.5 block text-xs font-medium text-slate-600">{t.search}</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input id={`${uid}-q`} type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t.searchPh} className={cn(ui.control, "pl-9")} />
                </div>
              </div>
              {hasAccounts && (
                <button type="button" onClick={refresh} disabled={syncMutation.isPending} aria-label={t.refreshAria} title={t.refreshAria} className={cn(ui.secondary, "w-11 px-0 sm:w-auto sm:px-4")}>
                  {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  <span className="hidden sm:inline">{t.refresh}</span>
                </button>
              )}
            </div>
          </div>

          {available.length > 1 && (
            <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0" style={{ scrollbarWidth: "none" }}>
              <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap" role="group" aria-label={t.filtersLabel}>
                {available.map((key) => (
                  <button key={key} type="button" onClick={() => setFilterType(key)} aria-pressed={filter === key} className={ui.chip(filter === key)}>
                    {t.filters[key]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* The month in three numbers (once there's a bank or something added by hand) */}
        {(loading || hasAccounts || rows.length > 0) && <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={upperFirst(monthName)}>
          <Kpi label={t.kpi.in} value={totalIncome > 0 ? `+${money(totalIncome, true)}` : money(0, true)} sub={t.kpi.inSub(income.length)} tone={totalIncome > 0 ? "good" : undefined} loading={loading} />
          <Kpi label={t.kpi.out} value={totalExpense > 0 ? `−${money(totalExpense, true)}` : money(0, true)} sub={t.kpi.inSub(expense.length)} loading={loading} />
          {selectedAccount ? (
            <Kpi label={t.kpi.accountBalance} value={money(num(selectedAccount.currentBalance), true)} sub={accountName(selectedAccount, all.shared.accountFallback)}
              tone={num(selectedAccount.currentBalance) < 0 ? "bad" : undefined} className="col-span-2 sm:col-span-1" />
          ) : hasAccounts ? (
            <Kpi label={t.kpi.balance} value={money(cashAccounts.reduce((s, a) => s + num(a.currentBalance), 0), true)} sub={t.kpi.balanceSub(cashAccounts.length)} className="col-span-2 sm:col-span-1" />
          ) : (
            <Kpi label={kept >= 0 ? t.kpi.kept : t.kpi.overspent} value={money(Math.abs(kept), true)} sub={t.kpi.keptSub} tone={kept > 0 ? "good" : kept < 0 ? "bad" : undefined} loading={loading} className="col-span-2 sm:col-span-1" />
          )}
        </section>}

        {/* The list, by day */}
        <section className={ui.card} aria-labelledby={`${uid}-list`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id={`${uid}-list`} className="font-semibold text-slate-900">{t.listTitles[filter]}</h2>
            {!loading && rows.length > 0 && (
              <p className="text-xs text-slate-500" aria-live="polite">{t.count(shown.length, rows.length)}{q ? ` ${t.searching(searchQuery.trim())}` : ""}</p>
            )}
          </div>

          {loading ? (
            <div className="mt-3 space-y-2" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : hasAccounts && monthQ.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-700" role="alert">{t.loadError}</p>
              <button type="button" onClick={() => void monthQ.refetch()} className={cn(ui.secondary, "mt-3")}>{all.shared.retry}</button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Receipt className="h-6 w-6" aria-hidden="true" /></span>
              <p className="mt-3 text-sm font-semibold text-slate-800">{t.empty.title(monthName)}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{hasAccounts ? t.empty.text : t.empty.textNoBank}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {hasAccounts && (
                  <button type="button" onClick={refresh} disabled={syncMutation.isPending} className={ui.secondary}>
                    {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}{t.refresh}
                  </button>
                )}
                <button type="button" onClick={openNew} className={ui.primary}><Plus className="h-4 w-4" aria-hidden="true" />{t.add}</button>
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="py-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><SearchX className="h-6 w-6" aria-hidden="true" /></span>
              <p className="mt-3 text-sm font-semibold text-slate-800">{t.empty.noMatch}</p>
              <p className="mt-1 text-sm text-slate-500">{t.empty.noMatchText}</p>
              <button type="button" onClick={clearFilters} className={cn(ui.secondary, "mt-4")}>{t.empty.clear}</button>
            </div>
          ) : (
            <div className="mt-1">
              {groups.map((g) => (
                <section key={g.day || "undated"} aria-label={dayTitle(g.day, g.date)}>
                  <h3 className="pb-1 pt-4 text-xs font-semibold text-slate-500">{dayTitle(g.day, g.date)}</h3>
                  <ul className="divide-y divide-slate-100">
                    {g.items.map((r) => {
                      const isIn = r.type === "income";
                      const label = catLabel(r.category, r.type);
                      const body = (
                        <>
                          <CategoryIcon category={r.category} type={r.type} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{r.description}</span>
                            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                              <span className="truncate">{label}{r.bankName ? ` · ${r.bankName}` : ""}</span>
                              {r.manual && <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">{t.manualTag}</span>}
                            </span>
                          </span>
                          <span className={cn("shrink-0 text-sm font-semibold tabular-nums", isIn ? "text-emerald-700" : "text-slate-900")}>{signed(r.amount, isIn)}</span>
                          <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" aria-hidden="true" />
                        </>
                      );
                      const rowCls = "-mx-2 flex min-h-[60px] w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
                      const manual = r.manual;
                      return (
                        <li key={r.key}>
                          {manual ? (
                            <button type="button" onClick={() => setDialog({ editing: manual, defaultDate: dayKey(manual.transactionDate) })} aria-label={t.editAria(r.description)} className={rowCls}>{body}</button>
                          ) : (
                            <Link to={`/personal/category/${encodeURIComponent(r.category)}?month=${period.m}&year=${period.y}`} aria-label={t.openAria(r.description, label)} className={rowCls}>{body}</Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>

      {dialog && <ManualTxDialog key={dialog.editing?.id ?? "new"} editing={dialog.editing} defaultDate={dialog.defaultDate} onClose={() => setDialog(null)} />}
      {showConnect && showPlaidOverlay && <PlaidLinkOverlay onClose={() => setShowPlaidOverlay(false)} />}
    </AnimatedPage>
  );
}

function Kpi({ label, value, sub, tone, loading, className }: { label: string; value: string; sub: string; tone?: "good" | "bad"; loading?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4", className)}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-2 h-7 w-28 rounded-md" /> : (
        <p className={cn("mt-1 truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl", tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900")}>{value}</p>
      )}
      <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>
    </div>
  );
}
