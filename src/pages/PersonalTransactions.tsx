import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { List, Loader2, Plus, Receipt, RefreshCw, Search, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectBankHero } from "@/components/personal/ConnectBankHero";
import { ManualTxDialog } from "@/components/personal/ManualTxDialog";
import { MonthNav } from "@/components/personal/MonthNav";
import { PickMenu, type PickItem } from "@/components/personal/PickMenu";
import { TxDetailSheet } from "@/components/personal/TxDetailSheet";
import { AccountLogo, TxLogo } from "@/components/personal/TxLogo";
import {
  accountLabel, bankRow, dayLabel, institutionOf, isNew, makeDays, manualRow, smBtn, sumIn, sumOut, useCatLabel,
  type Institution, type TxRow,
} from "@/components/personal/txKit";
import { localTodayKey, money, monthIndex, monthOnly, num, ui, upperFirst, type ManualTx, type PersonalAccount, type YearMonth } from "@/components/personal/personalUtils";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalPagesCopy, type PersonalPagesCopy } from "@/i18n/copy/personalPages";
import { MAX_REVIEW_BATCH } from "../../api/lib/bankReview";

type Tab = "all" | "out" | "in";
const TABS: Tab[] = ["all", "out", "in"];

/**
 * 2.0 personal movements, as the prototype's pTx: the month's bank movements (all accounts or one) plus the ones
 * added by hand, grouped by day, with search, Todos/Gastos/Ingresos, category and account menus, the "new" ones to
 * confirm (review.*), a detail panel to recategorize, month navigation, a manual refresh, and add/edit/delete by hand.
 */
export default function PersonalTransactions() {
  const all = useCopy(personalPagesCopy);
  const t = all.tx;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const uid = useId();
  const utils = trpc.useUtils();
  const catLabel = useCatLabel();
  const [params, setParams] = useSearchParams();

  // This month, the oldest month to pick (January two years back), and today/yesterday/the review window on this device.
  const calendar = useMemo(() => {
    const now = new Date();
    const current: YearMonth = { y: now.getFullYear(), m: now.getMonth() + 1 };
    return { current, min: { y: current.y - 2, m: 1 }, days: makeDays(now) };
  }, []);
  const [picked, setPicked] = useState<YearMonth | null>(null);
  const period = picked ?? calendar.current;
  const [tab, setTab] = useState<Tab>("all");
  const [cat, setCat] = useState(() => params.get("cat") || "all");
  const [searchQuery, setSearchQuery] = useState(() => params.get("q") ?? "");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [showPlaidOverlay, setShowPlaidOverlay] = useState(false);
  // "+ Nuevo → Gasto en efectivo" lands here with ?new=1: open the form right away.
  const [dialog, setDialog] = useState<{ editing: ManualTx | null; defaultDate: string } | null>(() =>
    params.get("new") === "1" ? { editing: null, defaultDate: localTodayKey(new Date()) } : null);
  useEffect(() => {
    if (params.get("new") !== "1") return;
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true }); // so Back doesn't open the form again
  }, [params, setParams]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  trpc.bank.checkConnection.useQuery(undefined, { staleTime: 60000, refetchOnMount: true });
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const canBudget = plan?.features.includes("budgets") ?? false;
  // Accounts: every saved one (every bank; movements point to their ids), plus any Plaid reports live that isn't saved yet.
  // (getAllPlaidAccounts only asks the first bank, so it can't be the whole list when there are two banks.)
  const { data: plaidAccountsData } = trpc.bank.getAllPlaidAccounts.useQuery(undefined, { staleTime: 60000 });
  const { data: dbAccounts, isLoading: loadingAccounts } = trpc.bank.listAccounts.useQuery(undefined, { staleTime: 30000 });
  const accounts: PersonalAccount[] = useMemo(() => {
    const saved = (dbAccounts ?? []) as PersonalAccount[];
    const live = (plaidAccountsData?.accounts ?? []) as PersonalAccount[];
    const unsaved = live.filter((pa) => !saved.some((s) => s.id === pa.id || (!!pa.plaidAccountId && s.plaidAccountId === pa.plaidAccountId)));
    return [...saved, ...unsaved];
  }, [dbAccounts, plaidAccountsData]);
  const hasAccounts = accounts.length > 0;
  const accountId = selectedAccountId ? parseInt(selectedAccountId) : undefined;

  const monthQ = trpc.bank.getMonthData.useQuery({ year: period.y, month: period.m, accountId });
  const manualQ = trpc.personal.listTransactions.useQuery({ year: period.y, month: period.m });
  const { data: institutions } = trpc.brand.institutions.useQuery(undefined, { enabled: hasAccounts, staleTime: 5 * 60_000, retry: false });
  const { data: budgets } = trpc.personal.listBudgets.useQuery({ year: period.y, month: period.m }, { enabled: hasAccounts && canBudget && cat !== "all", staleTime: 60_000, retry: false });
  const { data: reviewCount } = trpc.review.count.useQuery(undefined, { enabled: hasAccounts, staleTime: 30_000 });
  const toReview = reviewCount?.count ?? 0;
  const { data: reviewList } = trpc.review.list.useQuery({ limit: MAX_REVIEW_BATCH }, { enabled: hasAccounts && toReview > 0, staleTime: 30_000 });
  // What the app confirmed by itself this week (api/lib/autoConfirm.ts), and "Ver cuáles" to see only those.
  const { data: autoRecent } = trpc.review.autoRecent.useQuery(undefined, { enabled: hasAccounts, staleTime: 30_000 });
  const [onlyAuto, setOnlyAuto] = useState(false);
  const autoIds = useMemo(() => new Set(autoRecent?.ids ?? []), [autoRecent]);

  const afterReview = () => Promise.all([utils.review.count.invalidate(), utils.review.list.invalidate(), utils.bank.getMonthData.invalidate()]);
  const reopen = trpc.review.reopen.useMutation({ onSuccess: () => void afterReview(), onError: (e) => toast.error(e.message) });
  const confirmAll = trpc.review.confirm.useMutation({
    onSuccess: (r, input) => {
      void afterReview();
      toast.success(t.confirmedAll(r.confirmed), { action: { label: t.undo, onClick: () => reopen.mutate({ ids: input.ids }) } });
    },
    onError: (e) => toast.error(e.message),
  });

  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) toast.success(t.synced(data.added));
      void utils.bank.getMonthData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── The month's rows: bank (when there are accounts) + by hand (only with every account, they belong to none) ───
  const rows: TxRow[] = useMemo(() => [
    ...(hasAccounts ? ((monthQ.data?.transactions ?? []) as Parameters<typeof bankRow>[0][]) : []).map(bankRow),
    ...(accountId ? [] : ((manualQ.data ?? []) as ManualTx[])).map(manualRow),
  ], [hasAccounts, monthQ.data, manualQ.data, accountId]);

  const catsHere = [...new Set(rows.map((r) => r.category))].sort((a, b) => catLabel(a, "expense").localeCompare(catLabel(b, "expense"), locale));
  const curCat = cat === "all" || catsHere.includes(cat) || rows.length === 0 ? cat : "all";
  const q = searchQuery.trim().toLowerCase();
  const shown = rows
    .filter((r) => tab === "all" || (tab === "in" ? r.isIn : !r.isIn))
    .filter((r) => curCat === "all" || r.category === curCat)
    .filter((r) => !onlyAuto || (r.id !== null && autoIds.has(r.id)))
    .filter((r) => !q || `${r.name} ${r.raw} ${catLabel(r.category, r.type)}`.toLowerCase().includes(q))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.day === b.r.day ? a.i - b.i : a.r.day < b.r.day ? 1 : -1))
    .map((x) => x.r);
  const groups: { day: string; date: unknown; items: TxRow[] }[] = [];
  for (const r of shown) {
    const last = groups[groups.length - 1];
    if (last && last.day === r.day) last.items.push(r);
    else groups.push({ day: r.day, date: r.date, items: [r] });
  }

  const loading = manualQ.isLoading || loadingAccounts || (hasAccounts && monthQ.isLoading);
  const showConnect = !loadingAccounts && !hasAccounts;
  const monthName = upperFirst(monthOnly(period, locale));
  const isCurrent = monthIndex(period) === monthIndex(calendar.current);
  const filtered = curCat !== "all" || !!q || !!selectedAccountId;
  const reviewIds = (reviewList?.items ?? []).map((i) => i.id);
  const open = openKey ? rows.find((r) => r.key === openKey) ?? null : null;
  const insts = institutions as Institution[] | undefined;

  const openNew = () => {
    const now = new Date();
    // Today in this month; the month's last day when looking at an earlier one, so it shows up in this list.
    const last = new Date(period.y, period.m, 0).getDate();
    setDialog({ editing: null, defaultDate: isCurrent ? localTodayKey(now) : `${period.y}-${String(period.m).padStart(2, "0")}-${String(last).padStart(2, "0")}` });
  };
  const refresh = () => syncMutation.mutate({ year: period.y, month: period.m, accountId });
  const clearFilters = () => { setCat("all"); setSearchQuery(""); setSelectedAccountId(""); };
  const acctName = (a: PersonalAccount) => accountLabel(a, all.shared.accountFallback);
  /** The account a bank movement came from: its logo and "Name ••1234" (manual ones have none). */
  const rowAcct = (r: TxRow) => {
    if (r.manual) return null;
    const a = accounts.find((x) => x.id === r.accountId);
    return {
      inst: institutionOf(insts, r.accountId),
      text: a ? acctName(a) : accountLabel({ bankName: r.bankName, accountNumber: r.accountNumber }, all.shared.accountFallback),
      bank: a?.bankName ?? r.bankName ?? "",
    };
  };

  // ─── Menus ───
  const catItems: PickItem[] = [
    { value: "all", label: t.allCategories, icon: <List className="h-4 w-4" aria-hidden="true" /> },
    ...catsHere.map((c) => ({ value: c, label: catLabel(c, rows.find((r) => r.category === c)?.type ?? "expense"), icon: <Tag className="h-4 w-4" aria-hidden="true" /> })),
  ];
  // One logo per bank (not per account) in the "Todas las cuentas" stack.
  const stackBanks = [...new Map(accounts.map((a) => {
    const inst = institutionOf(insts, a.id);
    return [inst?.itemId ?? `a-${a.id}`, { key: inst?.itemId ?? `a-${a.id}`, inst, name: a.bankName ?? "" }] as const;
  })).values()].slice(0, 3);
  const stack = (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {stackBanks.map((b, i) => (
        <span key={b.key} className={cn("rounded-[5px] ring-2 ring-white", i > 0 && "-ml-1.5")}><AccountLogo inst={b.inst} fallbackName={b.name} size={18} /></span>
      ))}
    </span>
  );
  const acctItems: PickItem[] = [
    { value: "", label: t.allAccounts, icon: stack },
    ...accounts.map((a) => ({
      value: String(a.id),
      label: `${acctName(a)} · ${money(num(a.currentBalance), true)}`,
      icon: <AccountLogo inst={institutionOf(insts, a.id)} fallbackName={a.bankName ?? ""} size={20} />,
    })),
  ];
  const curAcct = accounts.find((a) => String(a.id) === selectedAccountId);

  // ─── Summary bar (category with its budget, or the month in and out) ───
  const budgetRow = curCat !== "all" ? budgets?.items.find((b) => b.category === curCat && b.limit !== null) : undefined;
  const catOut = sumOut(rows.filter((r) => r.category === curCat));
  // Paying a credit card is neither money in nor spending (owner, 2026-11-24), unless that's what's being looked at.
  const counted = curCat === "card_payment" ? shown : shown.filter((r) => r.category !== "card_payment");
  const inSum = sumIn(counted);
  const outSum = sumOut(counted);
  const summary = curCat !== "all" ? (
    <div className="mt-3 rounded-xl bg-slate-100 px-3.5 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0">
          <b className="tabular-nums text-slate-900">{t.catSpent(catLabel(curCat, "expense"), money(catOut, true))}</b>
          {budgetRow && budgetRow.limit !== null && <span className="text-slate-500"> {t.catOfBudget(money(budgetRow.limit), budgetRow.percent ?? 0)}</span>}
        </p>
        {budgetRow && budgetRow.limit !== null ? (
          (budgetRow.remaining ?? 0) < 0
            ? <span className="font-semibold text-red-600">{t.catOver(money(Math.abs(budgetRow.remaining ?? 0)))}</span>
            : <span className="font-semibold text-emerald-600">{t.catLeft(money(budgetRow.remaining ?? 0))}</span>
        ) : <span className="text-slate-500">{t.kpi.inSub(shown.length)}</span>}
      </div>
      {budgetRow && budgetRow.limit !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="img" aria-label={t.catOfBudget(money(budgetRow.limit), budgetRow.percent ?? 0)}>
          <div className={cn("h-full rounded-full", (budgetRow.remaining ?? 0) < 0 ? "bg-red-600" : "bg-emerald-600")} style={{ width: `${Math.min(100, budgetRow.percent ?? 0)}%` }} />
        </div>
      )}
    </div>
  ) : (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-slate-100 px-3.5 py-3 text-sm" aria-live="polite">
      <p className="min-w-0 tabular-nums text-slate-900">
        {t.monthSum(monthName)}{" "}
        {inSum > 0 && <b className="text-emerald-600">{t.sumIn(money(inSum, true))}</b>}
        {inSum > 0 && outSum > 0 && " · "}
        {outSum > 0 && <b>{t.sumOut(money(outSum, true))}</b>}
        {inSum === 0 && outSum === 0 && <span className="text-slate-500">{money(0, true)}</span>}
      </p>
      <span className="text-slate-500">{t.kpi.inSub(shown.length)}</span>
    </div>
  );

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Title, month and "Agregar" (phone: the month on its own line, so its name fits) */}
        <header className="mb-4 flex flex-wrap items-end gap-x-2 gap-y-3">
          <div className="order-1 min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.subtitleMonth(monthName)}</p>
          </div>
          <MonthNav value={period} min={calendar.min} max={calendar.current} onChange={setPicked} locale={locale} picker
            labels={{ month: all.shared.month, prev: all.shared.prevMonth, next: all.shared.nextMonth }} className="order-3 w-full sm:order-2 sm:w-64" />
          <button type="button" onClick={openNew} className={cn(ui.primary, "order-2 shrink-0 sm:order-3")}>
            <Plus className="h-4 w-4" aria-hidden="true" /><span className="sm:hidden">{t.addShort}</span><span className="hidden sm:inline">{t.add}</span>
          </button>
        </header>

        {showConnect && <div className="mb-4"><ConnectBankHero onConnect={() => setShowPlaidOverlay(true)} /></div>}

        {/* New movements with a suggested category (the review inbox, same as business) */}
        {hasAccounts && toReview > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] bg-blue-50 px-3 py-2.5 text-[13px] text-slate-800">
            <Sparkles className="h-[18px] w-[18px] shrink-0 text-blue-600" aria-hidden="true" />
            <span className="min-w-0 flex-1">{t.banner(toReview)}</span>
            <button type="button" disabled={confirmAll.isPending || reviewIds.length === 0} onClick={() => confirmAll.mutate({ ids: reviewIds })}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] bg-blue-600 px-3.5 text-[13px] font-semibold text-white hover:bg-blue-500 disabled:opacity-60 sm:min-h-9">
              {confirmAll.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t.confirmAll(reviewIds.length || toReview)}
            </button>
          </div>
        )}

        {/* What the app confirmed by itself: a plain line, a dot and a text link */}
        {hasAccounts && (autoRecent?.count ?? 0) > 0 && (
          <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600" data-auto-confirmed="">
            <i className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>{t.autoConfirmed(autoRecent?.count ?? 0)}</span>
            <button type="button" aria-pressed={onlyAuto} onClick={() => setOnlyAuto((v) => !v)}
              className="rounded-sm font-semibold text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {onlyAuto ? t.autoAll : t.autoSee}
            </button>
          </p>
        )}

        {/* Search, category, account, refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 min-w-0 flex-[1_1_240px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-500 transition focus-within:border-blue-600 focus-within:bg-white focus-within:ring-[3px] focus-within:ring-blue-50 sm:min-h-10">
            <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <input id={`${uid}-q`} type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t.searchTxPh}
              aria-label={t.searchTxAria} autoComplete="off"
              className="min-w-0 flex-1 border-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-500 sm:text-[15px]" />
          </label>
          <PickMenu label={t.category} icon={<Tag className="h-4 w-4 shrink-0" aria-hidden="true" />} current={curCat} items={catItems} onPick={setCat} />
          {accounts.length > 1 && (
            <PickMenu label={all.shared.account} icon={curAcct ? <AccountLogo inst={institutionOf(insts, curAcct.id)} fallbackName={curAcct.bankName ?? ""} size={18} /> : stack}
              current={selectedAccountId} items={acctItems} onPick={setSelectedAccountId} className="max-w-[18rem]" />
          )}
          {hasAccounts && (
            <button type="button" onClick={refresh} disabled={syncMutation.isPending} aria-label={t.refreshAria} title={t.refreshAria} className={cn(smBtn, "min-h-11 px-3.5 text-sm sm:min-h-10")}>
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              <span>{t.refresh}</span>
            </button>
          )}
          {filtered && <button type="button" onClick={clearFilters} className="min-h-10 px-1 text-sm font-semibold text-blue-600 hover:underline">{t.clearFilters}</button>}
        </div>

        {/* Todos / Gastos / Ingresos */}
        <div className="mt-4 border-b border-slate-200">
          <div role="tablist" aria-label={t.tabsLabel} className="flex gap-6">
            {TABS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("relative min-h-11 pb-2.5 pt-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  tab === k ? "text-slate-900 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded after:bg-blue-600" : "text-slate-500 hover:text-slate-900")}>
                {t.tabs[k]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-3 space-y-2" aria-busy="true">
            <Skeleton className="h-12 rounded-xl" />
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : hasAccounts && monthQ.isError ? (
          <div className="mt-3 rounded-[14px] border border-dashed border-slate-200 px-4 py-9 text-center">
            <p className="text-sm text-slate-700" role="alert">{t.loadError}</p>
            <button type="button" onClick={() => void monthQ.refetch()} className={cn(ui.secondary, "mt-3")}>{all.shared.retry}</button>
          </div>
        ) : rows.length === 0 ? (
          <>
            {summary}
            <div className="mt-3 rounded-[14px] border border-dashed border-slate-200 px-4 py-9 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Receipt className="h-6 w-6" aria-hidden="true" /></span>
              <p className="mt-3 text-base font-semibold text-slate-900">{t.empty.title(monthOnly(period, locale))}</p>
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
          </>
        ) : (
          <>
            {summary}
            {shown.length === 0 ? (
              <div className="mt-3 rounded-[14px] border border-dashed border-slate-200 px-4 py-9 text-center">
                <p className="text-base font-semibold text-slate-900">{t.filteredEmpty[0]}</p>
                <p className="mt-1 text-sm text-slate-500">{t.filteredEmpty[1]}</p>
                <button type="button" onClick={() => { clearFilters(); setTab("all"); }} className={cn(smBtn, "mt-3")}>{t.clearFilters}</button>
              </div>
            ) : groups.map((g) => {
              const out = sumOut(g.items);
              const title = dayLabel(g.day, g.date, calendar.days, locale, { today: t.today, yesterday: t.yesterday });
              return (
                <section key={g.day || "undated"} aria-label={title}>
                  <h2 className="flex justify-between gap-2.5 px-1 pb-1.5 pt-4 text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                    <span>{title}</span>
                    {out > 0 && <span className="tabular-nums" aria-label={t.dayOut(money(out, true))}>−{money(out, true)}</span>}
                  </h2>
                  <ul className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                    {g.items.map((r) => (
                      <li key={r.key} className="border-t border-slate-200 first:border-t-0">
                        <TxLine row={r} fresh={isNew(r, calendar.days)} t={t} catLabel={catLabel} acct={rowAcct(r)}
                          onOpen={() => (r.manual ? setDialog({ editing: r.manual, defaultDate: r.day }) : setOpenKey(r.key))} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </div>

      {open && !open.manual && (
        <TxDetailSheet key={open.key} row={open} onClose={() => setOpenKey(null)} monthRows={rows} accounts={accounts} institutions={insts}
          days={calendar.days} locale={locale} period={period} />
      )}
      {dialog && <ManualTxDialog key={dialog.editing?.id ?? "new"} editing={dialog.editing} defaultDate={dialog.defaultDate} onClose={() => setDialog(null)} />}
      {showConnect && showPlaidOverlay && <PlaidLinkOverlay onClose={() => setShowPlaidOverlay(false)} />}
    </AnimatedPage>
  );
}

/** One movement (the prototype's .ptx-row): logo, name, category · account · flags, amount. */
function TxLine({ row, fresh, acct, t, catLabel, onOpen }: {
  row: TxRow;
  fresh: boolean;
  acct: { inst: Institution | null; text: string; bank: string } | null;
  t: PersonalPagesCopy["tx"];
  catLabel: (cat: string, type: string) => string;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} aria-label={row.manual ? t.editAria(row.name) : t.openRow(row.name)}
      className="grid min-h-[60px] w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
      <TxLogo row={row} size={36} />
      <span className="min-w-0">
        <b className="block truncate text-sm font-semibold text-slate-900">{row.name}</b>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span>{catLabel(row.category, row.type)}</span>
          {acct && <span className="inline-flex min-w-0 items-center gap-1.5"><AccountLogo inst={acct.inst} fallbackName={acct.bank || acct.text} size={14} /><span className="truncate">{acct.text}</span></span>}
          {row.manual && <span className="rounded-full bg-blue-50 px-2 py-px text-[11px] font-medium text-blue-700">{t.manualTag}</span>}
          {fresh && <span className="inline-flex items-center gap-1.5 font-semibold text-blue-600"><i className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />{t.newTag}</span>}
        </span>
      </span>
      <span className={cn("text-sm font-bold tabular-nums", row.isIn ? "text-emerald-600" : "text-slate-900")}>{row.isIn ? "+" : "−"}{money(row.amount, true)}</span>
    </button>
  );
}
