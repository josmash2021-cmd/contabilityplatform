import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { AllMovements, type Account, type YearMonth } from "@/components/transactions/AllMovements";
import { ReviewInbox } from "@/components/transactions/ReviewInbox";
import type { BankRow, MoneyType, SaleRow } from "@/components/transactions/shared";

type View = "review" | "all";

/**
 * 2.0 Movimientos: "Por revisar", where the owner confirms or fixes the category of each bank movement
 * (api/review-router.ts), and "Todos", the month's bank movements and the sales, with the filters,
 * search, account and month the page always had. Bank sync, syncRecent and autoFix run as before.
 */
export default function Transactions() {
  const t = useCopy(movimientosCopy);
  const utils = trpc.useUtils();
  const uid = useId();

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
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [pickedView, setPickedView] = useState<View | null>(null);

  // Is a bank connected?
  const { data: bankConnection, isLoading: isCheckingBank } = trpc.bank.checkConnection.useQuery(undefined, { staleTime: 60000, refetchOnMount: true });
  const hasBank = bankConnection?.hasBank === true;

  // Accounts: live from Plaid, with the saved balance; the saved accounts when Plaid isn't reachable.
  const { data: plaidAccountsData } = trpc.bank.getAllPlaidAccounts.useQuery(undefined, { staleTime: 60000, enabled: hasBank });
  const { data: dbAccounts } = trpc.bank.listAccounts.useQuery(undefined, { enabled: hasBank });
  const accounts: Account[] = useMemo(() => {
    const saved = (dbAccounts ?? []) as Array<Account & { plaidAccountId?: string | null }>;
    const live = (plaidAccountsData?.accounts ?? []) as Array<Account & { plaidAccountId?: string | null }>;
    if (live.length === 0) return saved;
    return live.map((pa) => {
      const match = saved.find((s) => s.id === pa.id || s.plaidAccountId === pa.plaidAccountId);
      return match ? { ...pa, currentBalance: match.currentBalance } : pa;
    });
  }, [dbAccounts, plaidAccountsData]);
  const accountId = selectedAccountId || (accounts[0] ? String(accounts[0].id) : "");

  // The month's bank movements, and the sales (no bank needed).
  const monthInput = { year: period.y, month: period.m, accountId: accountId ? parseInt(accountId) : undefined };
  const month = trpc.bank.getMonthData.useQuery(monthInput);
  const salesQ = trpc.sales.list.useQuery({ limit: 100, offset: 0 });

  // Team members: the accountant reads, only the owner (no membership) reviews.
  const { data: membership, isLoading: membershipLoading } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canReview = !membershipLoading && membership === null;

  const pending = trpc.review.count.useQuery(undefined, { enabled: hasBank });
  const pendingCount = pending.data?.count;

  const refreshReview = () => Promise.all([utils.review.list.invalidate(), utils.review.count.invalidate()]);

  // Silently fix categories the old rules got wrong (skips movements the owner reviewed).
  const { mutate: autoFix } = trpc.bank.autoFixCategories.useMutation({
    onSuccess: (data) => {
      if (data.fixed && data.fixed > 0) {
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
    onSuccess: (data) => {
      if (data.success && "added" in data && data.added && data.added > 0) {
        void utils.bank.getMonthData.invalidate();
        void refreshReview();
        toast.success(t.syncedNew(data.added));
      }
    },
    onError: () => { /* silent */ },
  });
  useEffect(() => {
    const timer = setTimeout(() => syncRecent(), 2000);
    return () => clearTimeout(timer);
  }, [syncRecent]);

  const sync = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      if (data.success && "added" in data && data.added && data.added > 0) toast.success(t.synced(data.added));
      void utils.bank.getMonthData.invalidate();
      void refreshReview();
    },
    onError: (err) => toast.error(err.message),
  });

  /** Show the owner's choice in "Todos" without asking the bank again. */
  const patchMonth = (ids: number[], patch: { isReconciled: boolean; category?: string; type?: MoneyType }) => {
    void utils.bank.getMonthData.invalidate(undefined, { refetchType: "none" });
    utils.bank.getMonthData.setData(monthInput, (d) => {
      if (!d) return d;
      const transactions = (d.transactions as BankRow[]).map((tx) => (typeof tx.id === "number" && ids.includes(tx.id) ? { ...tx, ...patch } : tx));
      return { ...d, transactions } as typeof d;
    });
  };
  const onReviewed = (ids: number[], change?: { category: string; type: MoneyType }) => {
    setPickedView((v) => v ?? "review"); // stay on the list (now maybe "all done") instead of jumping away
    patchMonth(ids, { isReconciled: true, ...change });
  };
  const onSavedFromAll = (saved: { id: number; category: string; type: MoneyType }) => {
    patchMonth([saved.id], { isReconciled: true, category: saved.category, type: saved.type });
    void refreshReview();
  };

  // "Por revisar" first when something is waiting; "Todos" otherwise.
  const view: View | null = !hasBank
    ? "all"
    : pickedView ?? (pendingCount === undefined ? (pending.isError ? "all" : null) : pendingCount > 0 ? "review" : "all");

  const tabKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: View = view === "review" ? "all" : "review";
    setPickedView(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
          </div>
          {hasBank && (
            <button
              onClick={() => sync.mutate({ year: period.y, month: period.m, accountId: accountId ? parseInt(accountId) : undefined })}
              disabled={sync.isPending}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:h-10"
            >
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              {sync.isPending ? t.syncing : t.sync}
            </button>
          )}
        </header>

        {hasBank && view && (
          <div role="tablist" aria-label={t.tabs.label} onKeyDown={tabKeys}
            className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:inline-grid sm:w-auto sm:min-w-[22rem]">
            <Tab id={`${uid}-tab-review`} panel={`${uid}-panel`} active={view === "review"} onClick={() => setPickedView("review")}
              label={pendingCount !== undefined ? t.tabs.reviewCount(pendingCount) : t.tabs.review}>
              {t.tabs.review}
              {pendingCount !== undefined && (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", pendingCount > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600")} aria-hidden>
                  {pendingCount}
                </span>
              )}
            </Tab>
            <Tab id={`${uid}-tab-all`} panel={`${uid}-panel`} active={view === "all"} onClick={() => setPickedView("all")} label={t.tabs.all}>
              {t.tabs.all}
            </Tab>
          </div>
        )}

        {isCheckingBank || (hasBank && !view) ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : (
          <div id={`${uid}-panel`} role={hasBank ? "tabpanel" : undefined} aria-labelledby={hasBank ? `${uid}-tab-${view}` : undefined}>
            {view === "review" ? (
              <ReviewInbox
                canReview={canReview}
                onSeeAll={() => setPickedView("all")}
                onReviewed={onReviewed}
                onReopened={(ids) => patchMonth(ids, { isReconciled: false })}
              />
            ) : (
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
            )}
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}

function Tab({ id, panel, active, onClick, label, children }: { id: string; panel: string; active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button id={id} type="button" role="tab" aria-selected={active} aria-controls={panel} aria-label={label} tabIndex={active ? 0 : -1} onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9",
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
      )}>
      {children}
    </button>
  );
}
