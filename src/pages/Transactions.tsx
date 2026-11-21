import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { ListChecks, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { AllMovements, type Account, type YearMonth } from "@/components/transactions/AllMovements";
import { ReviewInbox } from "@/components/transactions/ReviewInbox";
import { DoneList, ExcludedList } from "@/components/transactions/ReviewedLists";
import { AccountPicker } from "@/components/transactions/AccountPicker";
import { RulesPanel } from "@/components/transactions/RulesPanel";
import type { BankRow, MoneyType, SaleRow } from "@/components/transactions/shared";

type Tab = "pending" | "done" | "excluded" | "all";
const TABS: Tab[] = ["pending", "done", "excluded", "all"];
/** How many movements the list loads at first, and how many more each "Ver más" adds. */
const PAGE = 100;
const MAX = 300;

/**
 * 2.0 "Por revisar" (the prototype's review screen): the bank movements to confirm, grouped by how sure we are,
 * with matches to link, splits, rules, exclusions, bulk actions, shortcuts and swipe (api/review-router.ts).
 * "Todos" keeps the month's movements and the sales with the filters, search, account and month the page always
 * had. /transactions?view=all&account=<id> opens "Todos" on that account (for the Bancos "Ver movimientos").
 * Bank sync, syncRecent and autoFix run as before.
 */
export default function Transactions() {
  const t = useCopy(movimientosCopy);
  const r = t.rv;
  const utils = trpc.useUtils();
  const uid = useId();
  const [params] = useSearchParams();

  // The owner's day and time zone (for "Revisados hoy" and the day of each cash sale).
  const clock = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { since: start.toISOString(), tz: -now.getTimezoneOffset() };
  }, []);

  // This month, and the months to choose from: back to January two years ago (2024–2026, as before).
  const calendar = useMemo(() => {
    const now = new Date();
    const current: YearMonth = { y: now.getFullYear(), m: now.getMonth() + 1 };
    const months: YearMonth[] = [];
    let { y, m } = current;
    while (y >= current.y - 2) {
      months.push({ y, m });
      if (m === 1) { y -= 1; m = 12; } else m -= 1;
    }
    return { current, months };
  }, []);
  const [pickedPeriod, setPickedPeriod] = useState<YearMonth | null>(null);
  const period = pickedPeriod ?? calendar.current;
  const [selectedAccountId, setSelectedAccountId] = useState(() => params.get("account") ?? "");
  const [tab, setTab] = useState<Tab>(() => (params.get("view") === "all" ? "all" : "pending"));
  const [reviewAccount, setReviewAccount] = useState<number | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Is a bank connected?
  const { data: bankConnection, isLoading: isCheckingBank } = trpc.bank.checkConnection.useQuery(undefined, { staleTime: 60000, refetchOnMount: true });
  const hasBank = bankConnection?.hasBank === true;
  const showAll = tab === "all" || (!isCheckingBank && !hasBank);

  // Accounts for "Todos": live from Plaid, with the saved balance; the saved accounts when Plaid isn't reachable.
  const { data: plaidAccountsData } = trpc.bank.getAllPlaidAccounts.useQuery(undefined, { staleTime: 60000, enabled: hasBank && showAll });
  const { data: dbAccounts } = trpc.bank.listAccounts.useQuery(undefined, { enabled: hasBank && showAll });
  const accounts: Account[] = useMemo(() => {
    const saved = (dbAccounts ?? []) as Array<Account & { plaidAccountId?: string | null }>;
    const live = (plaidAccountsData?.accounts ?? []) as Array<Account & { plaidAccountId?: string | null }>;
    if (live.length === 0) return saved;
    return live.map((pa) => {
      const match = saved.find((s) => s.id === pa.id || s.plaidAccountId === pa.plaidAccountId);
      return match ? { ...pa, currentBalance: match.currentBalance } : pa;
    });
  }, [dbAccounts, plaidAccountsData]);
  const accountId = selectedAccountId && accounts.some((a) => String(a.id) === selectedAccountId) ? selectedAccountId : accounts[0] ? String(accounts[0].id) : "";

  // "Todos": the month's bank movements, and the sales (no bank needed).
  const monthInput = { year: period.y, month: period.m, accountId: accountId ? parseInt(accountId) : undefined };
  const month = trpc.bank.getMonthData.useQuery(monthInput, { enabled: showAll });
  const salesQ = trpc.sales.list.useQuery({ limit: 100, offset: 0 }, { enabled: showAll });

  // Team members: the accountant reads, only the owner (no membership) reviews.
  const { data: membership, isLoading: membershipLoading } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canReview = !membershipLoading && membership === null;

  // "Por revisar": grouped movements, accounts, counts.
  const listKey = { limit, since: clock.since, tzOffsetMinutes: clock.tz };
  const list = trpc.review.list.useQuery(listKey, { enabled: hasBank, placeholderData: keepPreviousData });
  const data = list.data;

  const refreshReview = () => Promise.all([utils.review.list.invalidate(), utils.review.count.invalidate()]);
  const onChanged = () => { void utils.bank.getMonthData.invalidate(); };

  // Silently fix categories the old rules got wrong (skips reviewed movements and those a rule set).
  const { mutate: autoFix } = trpc.bank.autoFixCategories.useMutation({
    onSuccess: (res) => {
      if (res.fixed && res.fixed > 0) {
        void utils.bank.getMonthData.invalidate();
        void utils.review.list.invalidate();
      }
    },
  });
  useEffect(() => {
    const timer = setTimeout(() => autoFix(), 2000);
    return () => clearTimeout(timer);
  }, [autoFix]);

  // Bring in the latest movements on page load.
  const { mutate: syncRecent } = trpc.bank.syncRecent.useMutation({
    onSuccess: (res) => {
      if (res.success && "added" in res && res.added && res.added > 0) {
        void utils.bank.getMonthData.invalidate();
        void refreshReview();
        toast.success(t.syncedNew(res.added));
      }
    },
    onError: () => { /* silent */ },
  });
  useEffect(() => {
    const timer = setTimeout(() => syncRecent(), 2000);
    return () => clearTimeout(timer);
  }, [syncRecent]);

  const sync = trpc.bank.syncTransactions.useMutation({
    onSuccess: (res) => {
      if (res.success && "added" in res && res.added && res.added > 0) toast.success(t.synced(res.added));
      void utils.bank.getMonthData.invalidate();
      void refreshReview();
    },
    onError: (err) => toast.error(err.message),
  });

  /** A category changed from "Todos": show it there without asking the bank again, and refresh the list. */
  const onSavedFromAll = (saved: { id: number; category: string; type: MoneyType }) => {
    void utils.bank.getMonthData.invalidate(undefined, { refetchType: "none" });
    utils.bank.getMonthData.setData(monthInput, (d) => {
      if (!d) return d;
      const transactions = (d.transactions as BankRow[]).map((tx) => (tx.id === saved.id ? { ...tx, isReconciled: true, category: saved.category, type: saved.type } : tx));
      return { ...d, transactions } as typeof d;
    });
    void refreshReview();
  };

  const pendingTotal = data?.total ?? 0;
  const tabCount: Record<Tab, number | null> = {
    pending: data ? data.total : null,
    done: data ? data.doneToday : null,
    excluded: data ? data.excludedCount : null,
    all: null,
  };
  const progressTotal = (data?.reviewedToday ?? 0) + pendingTotal;
  const autoParts = data ? [
    data.auto.rules ? r.autoRules(data.auto.rules) : "",
    data.auto.duplicates ? r.autoDup(data.auto.duplicates) : "",
    data.auto.transfers ? r.autoTransfer(data.auto.transfers) : "",
  ].filter(Boolean) : [];
  const autoText = autoParts.length ? `${r.autoLead} ${autoParts.length > 1 ? `${autoParts.slice(0, -1).join(", ")} ${r.and} ${autoParts[autoParts.length - 1]}` : autoParts[0]}.` : "";
  const pickerAccounts = (data?.accounts ?? []).filter((a) => a.pending > 0 || (data?.accounts.length ?? 0) <= 6);

  const tabKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  const tabLabel = (k: Tab) => (k === "pending" ? r.tabPending : k === "done" ? r.tabDone : k === "excluded" ? r.tabExcluded : r.tabAll);
  const btn = "inline-flex min-h-11 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-[11px] py-1.5 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 sm:min-h-[34px]";

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{r.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {!hasBank ? t.subtitle : data ? (pendingTotal ? r.sub(pendingTotal) : r.allDone) : <span className="inline-block h-4 w-40 animate-pulse rounded bg-slate-100 align-middle" />}
            </p>
          </div>
          {hasBank && (
            <div className="flex flex-wrap gap-2">
              {tab === "all" && (
                <button type="button" onClick={() => sync.mutate({ year: period.y, month: period.m, accountId: accountId ? parseInt(accountId) : undefined })} disabled={sync.isPending} className={btn}>
                  {sync.isPending ? <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden /> : <RefreshCw className="h-[15px] w-[15px]" aria-hidden />}
                  {sync.isPending ? t.syncing : t.sync}
                </button>
              )}
              <button type="button" onClick={() => setRulesOpen(true)} className={btn}>
                <ListChecks className="h-[15px] w-[15px]" aria-hidden />{r.rules(data?.rulesCount ?? 0)}
              </button>
            </div>
          )}
        </header>

        {isCheckingBank ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-16 rounded-[14px]" />
            <Skeleton className="h-40 rounded-[14px]" />
          </div>
        ) : !hasBank ? (
          <AllMovements
            hasBank={false}
            checkingBank={isCheckingBank}
            accounts={accounts}
            accountId={accountId}
            onAccountChange={setSelectedAccountId}
            period={period}
            months={calendar.months}
            onPeriodChange={setPickedPeriod}
            bankRows={[]}
            bankLoading={false}
            bankError={false}
            onRetryBank={() => void month.refetch()}
            sales={(salesQ.data ?? []) as SaleRow[]}
            salesLoading={salesQ.isLoading}
            canReview={canReview}
            onSaved={onSavedFromAll}
          />
        ) : (
          <>
            {/* Progress */}
            <div className="rounded-[14px] border border-slate-200 bg-white px-3.5 py-3">
              <div className="flex flex-wrap justify-between gap-x-3 text-[13px]">
                <b className="text-slate-900">{data ? r.progress(data.reviewedToday, progressTotal) : "…"}</b>
                <span className="text-slate-500">{pendingTotal ? r.progressHint : r.progressDone}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={progressTotal || 1} aria-valuenow={data?.reviewedToday ?? 0} aria-label={data ? r.progress(data.reviewedToday, progressTotal) : undefined}>
                <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progressTotal ? Math.round(((data?.reviewedToday ?? 0) / progressTotal) * 100) : 100}%` }} />
              </div>
            </div>

            {/* What was done for the owner (only real facts; hidden when there's nothing) */}
            {autoText && (
              <p className="mt-3 flex items-start gap-2.5 rounded-[10px] bg-slate-100 px-3 py-2.5 text-[13px] text-slate-900">
                <Sparkles className="mt-px h-[18px] w-[18px] shrink-0 text-blue-600" aria-hidden /><span>{autoText}</span>
              </p>
            )}

            {/* Tabs and account picker */}
            <div className="mb-1 mt-[18px] grid gap-2.5 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:border-b sm:border-slate-200">
              <div role="tablist" aria-label={r.tabsLabel} onKeyDown={tabKeys} className="flex gap-5 overflow-x-auto border-b border-slate-200 pr-6 [mask-image:linear-gradient(to_right,#000_85%,transparent)] sm:gap-6 sm:border-b-0 sm:pr-0 sm:[mask-image:none]" style={{ scrollbarWidth: "none" }}>
                {TABS.map((k) => {
                  const on = tab === k;
                  const n = tabCount[k];
                  return (
                    <button key={k} id={`${uid}-tab-${k}`} type="button" role="tab" aria-selected={on} aria-controls={`${uid}-panel`} tabIndex={on ? 0 : -1} onClick={() => setTab(k)}
                      className={cn(
                        "relative inline-flex min-h-11 shrink-0 items-center gap-[7px] whitespace-nowrap pb-3 pt-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-center after:rounded-full after:bg-blue-600 after:transition-transform after:duration-200",
                        on ? "text-slate-900 after:scale-x-100" : "text-slate-500 after:scale-x-0 hover:text-slate-900",
                      )}>
                      <span>{tabLabel(k)}{k === "done" && <span className="hidden sm:inline">{r.tabDoneDesk}</span>}</span>
                      {n !== null && (
                        <span className={cn("min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-bold tabular-nums", on ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>{n}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {tab === "pending" && pickerAccounts.length > 1 && (
                <div className="sm:pb-1.5">
                  <AccountPicker accounts={pickerAccounts} value={reviewAccount} onChange={setReviewAccount} totalPending={pendingTotal} />
                </div>
              )}
            </div>

            <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
              {tab === "pending" && (
                list.isLoading ? (
                  <div className="mt-[18px] space-y-3" aria-busy="true">
                    <Skeleton className="h-5 w-56 rounded" />
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-[14px]" />)}
                  </div>
                ) : list.isError || !data ? (
                  <div className="mt-4 rounded-[14px] border border-slate-200 bg-white p-6 text-center">
                    <p className="text-sm text-slate-700">{r.loadError}</p>
                    <button type="button" onClick={() => void list.refetch()} className={cn(btn, "mt-3")}>{t.retry}</button>
                  </div>
                ) : (
                  <ReviewInbox
                    data={data}
                    listKey={listKey}
                    canReview={canReview}
                    account={reviewAccount}
                    tzOffsetMinutes={clock.tz}
                    onChanged={onChanged}
                    onSeeDone={() => setTab("done")}
                    onSeeAll={() => setTab("all")}
                    onLoadMore={data.items.length < data.total && limit < MAX ? () => setLimit((n) => Math.min(MAX, n + PAGE)) : null}
                    loadingMore={list.isFetching && data.items.length < data.total}
                  />
                )
              )}
              {tab === "done" && <div className="mt-3.5"><DoneList since={clock.since} /></div>}
              {tab === "excluded" && <div className="mt-3.5"><ExcludedList canReview={canReview} onRestored={onChanged} /></div>}
              {tab === "all" && (
                <div className="mt-3.5">
                  <AllMovements
                    hasBank={hasBank}
                    checkingBank={isCheckingBank}
                    accounts={accounts}
                    accountId={accountId}
                    onAccountChange={setSelectedAccountId}
                    period={period}
                    months={calendar.months}
                    onPeriodChange={setPickedPeriod}
                    bankRows={(month.data?.transactions ?? []) as BankRow[]}
                    bankLoading={month.isLoading}
                    bankError={month.isError}
                    onRetryBank={() => void month.refetch()}
                    sales={(salesQ.data ?? []) as SaleRow[]}
                    salesLoading={salesQ.isLoading}
                    canReview={canReview}
                    onSaved={onSavedFromAll}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <RulesPanel open={rulesOpen} onOpenChange={setRulesOpen} canEdit={canReview} onChanged={() => { void refreshReview(); onChanged(); }} />
    </AnimatedPage>
  );
}
