// Shared bits for the business bank page (src/pages/Bank.tsx) and its cards.

/** A row from bank.listAccounts (active accounts; the Plaid token is stripped by the server). */
export type DbAccount = {
  id: number;
  bankName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  currentBalance: string | null;
  lastSyncedAt: string | Date | null;
  plaidAccountId: string | null;
  plaidItemId: string | null;
};

/** A row from bank.getAllPlaidAccounts (live from Plaid, when it answers). */
export type LiveAccount = {
  id: number;
  plaidAccountId: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  currentBalance: string;
  isInDb: boolean;
};

/** One account as the page shows it. `dbId` is null for an account Plaid knows that isn't saved yet. */
export type BankAccountView = {
  key: string;
  dbId: number | null;
  name: string;
  type: string;
  mask: string;
  balance: number;
  itemId: string | null;
  lastSyncedAt: number;
};

/** A bank transaction from bank.getMonthData (Plaid rows have no id; DB rows do). */
export type MonthTx = {
  id?: number;
  plaidTransactionId?: string | null;
  description: string;
  amount: string | number;
  type: "income" | "expense" | string;
  category: string | null;
  transactionDate: string | Date | null;
  isReversed?: boolean;
};

/** Plaid reports what you owe on cards and loans as their balance. */
export const isDebt = (type: string | null | undefined) => type === "credit" || type === "loan";

export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Saved accounts (every connected bank) with live Plaid balances on top when Plaid answered.
 * Plaid only reports the first bank's accounts, so saved accounts are the base and nothing is dropped.
 */
export function mergeAccounts(db: DbAccount[], live: LiveAccount[], fallbackName: string): BankAccountView[] {
  const liveById = new Map(live.map((a) => [a.plaidAccountId, a]));
  const out: BankAccountView[] = db.map((a) => {
    const l = a.plaidAccountId ? liveById.get(a.plaidAccountId) : undefined;
    return {
      key: `db:${a.id}`,
      dbId: a.id,
      name: l?.bankName || a.bankName || fallbackName,
      type: l?.accountType || a.accountType || "",
      mask: l?.accountNumber || a.accountNumber || "",
      balance: Number(l?.currentBalance ?? a.currentBalance ?? 0),
      itemId: a.plaidItemId,
      lastSyncedAt: a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0,
    };
  });
  const saved = new Set(db.map((a) => a.plaidAccountId).filter(Boolean));
  for (const l of live) {
    if (saved.has(l.plaidAccountId)) continue;
    out.push({
      key: `plaid:${l.plaidAccountId}`, dbId: null, name: l.bankName || fallbackName, type: l.accountType, mask: l.accountNumber,
      balance: Number(l.currentBalance ?? 0), itemId: null, lastSyncedAt: 0,
    });
  }
  return out;
}

/**
 * Connected banks, counted like the server's plan limit (api/bank-router.ts exchangePublicToken):
 * one per Plaid item, so a bank's checking and savings count once. Old rows without an item id count as one bank.
 */
export function countBanks(db: DbAccount[]): number {
  const items = new Set(db.map((a) => a.plaidItemId ?? "legacy"));
  return items.size;
}

/** A date-only bank value as a local date (Plaid dates arrive as UTC midnight). */
export function txDay(v: string | Date | null): Date | null {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00`);
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
}
