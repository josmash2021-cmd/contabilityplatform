import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";

type SyncResult = { success?: boolean; added?: number; error?: string };

/**
 * Keeps the business bank fresh without toasts (it replaces the old useBankHealthMonitor on this page).
 * These are the upkeep calls any team member may make (api/lib/team.ts); the owner's page also runs
 * banks.refreshItems for every bank (src/pages/Bank.tsx):
 * - on arrival: recent transactions (syncRecent) and fresh balances (refreshAllBalances);
 * - the month being viewed (syncTransactions): shortly after it's chosen, then every 3 minutes;
 * - category clean-up (autoFixCategories): a few seconds in, then every 5 minutes.
 * Data refreshes when something new arrives. If the bank's login expired, `needsReconnect` turns on.
 */
export function useQuietBankSync({ enabled, year, month, accountId }: { enabled: boolean; year: number; month: number; accountId: number | undefined }) {
  const utils = trpc.useUtils();
  const [needsReconnect, setNeedsReconnect] = useState(false);

  /** Shared by the quiet syncs and the page's Refresh button. */
  const handleSyncResult = useCallback((d: SyncResult | undefined) => {
    if (!d) return;
    if (d.success) {
      setNeedsReconnect(false);
      if ((d.added ?? 0) > 0) {
        void utils.bank.getMonthData.invalidate();
        void utils.bank.getYearData.invalidate();
        void utils.bank.listAccounts.invalidate();
        void utils.banks.invalidate();
        void utils.review.count.invalidate();
      }
    } else if (d.error === "TOKEN_INVALID") {
      setNeedsReconnect(true);
    }
  }, [utils]);

  const { mutate: syncRecent, isPending: recentPending } = trpc.bank.syncRecent.useMutation({ onSuccess: handleSyncResult, onError: () => {} });
  const { mutate: syncMonth, isPending: monthPending } = trpc.bank.syncTransactions.useMutation({ onSuccess: handleSyncResult, onError: () => {} });
  const { mutate: refreshBalances } = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: (d) => { if (d.success) { void utils.bank.listAccounts.invalidate(); void utils.bank.getAllPlaidAccounts.invalidate(); void utils.banks.overview.invalidate(); } },
    onError: () => {},
  });
  const { mutate: autoFix } = trpc.bank.autoFixCategories.useMutation({
    onSuccess: (d) => {
      if ((d.fixed ?? 0) > 0 || (d.autoConfirmed ?? 0) > 0) { void utils.bank.getMonthData.invalidate(); void utils.banks.accountMonth.invalidate(); }
      // The app confirmed what it was sure about: the Por revisar badge and lists change.
      if ((d.autoConfirmed ?? 0) > 0) { void utils.review.count.invalidate(); void utils.review.list.invalidate(); void utils.review.autoRecent.invalidate(); }
    },
    onError: () => {},
  });

  useEffect(() => {
    if (!enabled) return;
    syncRecent();
    refreshBalances();
    const fixSoon = setTimeout(() => autoFix(), 3000);
    const fixEvery = setInterval(() => autoFix(), 5 * 60_000);
    return () => { clearTimeout(fixSoon); clearInterval(fixEvery); };
  }, [enabled, syncRecent, refreshBalances, autoFix]);

  useEffect(() => {
    if (!enabled || !accountId) return;
    const soon = setTimeout(() => syncMonth({ year, month, accountId }), 1500);
    const every = setInterval(() => syncMonth({ year, month, accountId }), 3 * 60_000);
    return () => { clearTimeout(soon); clearInterval(every); };
  }, [enabled, year, month, accountId, syncMonth]);

  return { syncing: recentPending || monthPending, needsReconnect, handleSyncResult };
}
