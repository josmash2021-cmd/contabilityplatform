import { useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { balanceAt, type BankInfo, type Institution, type OverviewAccount } from "./bankView";

/** trpc.brand.institutions (the logos system): each bank connection's name, original logo and health. */
export function useInstitutions(enabled: boolean) {
  const utils = trpc.useUtils();
  const q = trpc.brand.institutions.useQuery(undefined, { enabled, staleTime: 60_000, retry: false });
  return { institutions: q.data ?? null, invalidate: () => utils.brand.institutions.invalidate() };
}

/**
 * One entry per bank connection on the screen: name and logo from brand.institutions, and whether it
 * needs the owner to sign in again. `session` holds what this visit learned from its own Plaid calls
 * (newer than the stored status); `fallbackName` is used while the logos system has no name for it.
 * Both sides group accounts the same way (api/lib/bankInstitutions.ts itemKeyOf).
 */
export function useBankInfo(accounts: OverviewAccount[], institutions: Institution[] | null, session: Record<string, "ok" | "needs_reconnect">, fallbackName: string) {
  return useMemo(() => {
    const byItem = new Map<string, Institution>();
    const byAccount = new Map<number, Institution>();
    for (const inst of institutions ?? []) {
      byItem.set(inst.itemId, inst);
      for (const id of inst.accountIds) byAccount.set(id, inst);
    }
    const out = new Map<string, BankInfo>();
    for (const a of accounts) {
      if (out.has(a.itemId)) continue;
      const inst = byItem.get(a.itemId) ?? byAccount.get(a.id);
      const now = session[a.itemId];
      out.set(a.itemId, {
        itemId: a.itemId,
        name: inst?.name?.trim() || fallbackName,
        logo: inst?.logo ?? null,
        color: inst?.color ?? null,
        needsReconnect: now ? now === "needs_reconnect" : inst?.status === "needs_reconnect",
        lastSuccessAt: inst?.lastSuccessAt ?? null,
        bankUpdatedAt: balanceAt(inst),
      });
    }
    return out;
  }, [accounts, institutions, session, fallbackName]);
}
