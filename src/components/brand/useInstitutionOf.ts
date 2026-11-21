import { useMemo } from "react";
import { trpc } from "@/providers/trpc";

/** A bank connection's name, original logo and color, as brand.institutions gives them (Plaid's own). */
export type InstitutionLook = { name: string; logo: string | null; color: string | null };

/**
 * Finds the bank behind an account id, so a row can show that bank's original logo (BankLogo `logo`)
 * instead of a letter. One shared, cached query for the whole screen.
 */
export function useInstitutionOf(enabled = true): (accountId: number | null | undefined) => InstitutionLook | null {
  const { data } = trpc.brand.institutions.useQuery(undefined, { enabled, staleTime: 5 * 60_000, retry: false });
  return useMemo(() => {
    const byAccount = new Map<number, InstitutionLook>();
    for (const inst of data ?? []) {
      const look = { name: inst.name, logo: inst.logo ?? null, color: inst.color ?? null };
      for (const id of inst.accountIds) byAccount.set(Number(id), look);
    }
    return (accountId) => (accountId === null || accountId === undefined ? null : byAccount.get(Number(accountId)) ?? null);
  }, [data]);
}
