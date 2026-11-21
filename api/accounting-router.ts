// Accounting housekeeping the app runs on its own.
//
// rebuild: runs once per login (src/hooks/useAutoRepair.ts) and makes sure the user's chart of accounts has
//   the accounts every screen books to. Each sale, expense, receipt, bill payment and invoice payment already
//   writes its own balanced journal entry when it's saved (sales-, expenses-, receipts-, vendors- and
//   quotes-router), so nothing else is booked here.
//   The old repair also re-booked every bank movement (money a sale or an expense had already counted) and
//   added "closing" entries dated today that emptied the income statement. It never ran to the end (it
//   stopped on a missing import right after the accounts step), and it's gone so it can't start doing that.
// verify: a read-only check that the books balance (assets = liabilities + equity + the result so far).
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { accounts, journalEntries, journalEntryLines } from "@db/schema";
import { eq, and } from "drizzle-orm";

/** The accounts the app books to: cash, bank, Zelle, money owed to the business, revenue, expenses, equity. */
const REQUIRED_ACCOUNTS = [
  { code: "1110", name: "Caja / Efectivo", type: "asset" },
  { code: "1120", name: "Banco", type: "asset" },
  { code: "1130", name: "Zelle", type: "asset" },
  { code: "1150", name: "Cuentas por Cobrar", type: "asset" },
  { code: "4100", name: "Ingresos", type: "revenue" },
  { code: "5100", name: "Gastos", type: "expense" },
  { code: "3110", name: "Capital Social", type: "equity" },
  { code: "3120", name: "Ganancias Acumuladas", type: "equity" },
  { code: "5200", name: "Transferencias", type: "expense" },
] as const;

/** Adds the accounts the user doesn't have yet; never changes or removes one. Returns how many were added. */
async function ensureAccounts(db: ReturnType<typeof getDb>, userId: number): Promise<number> {
  const have = await db.select({ code: accounts.code }).from(accounts).where(eq(accounts.userId, userId));
  const codes = new Set(have.map((a: { code: string }) => a.code));
  const missing = REQUIRED_ACCOUNTS.filter((a) => !codes.has(a.code));
  for (const a of missing) {
    await db.insert(accounts).values({ userId, code: a.code, name: a.name, type: a.type, balance: "0" });
  }
  return missing.length;
}

export const accountingRouter = createRouter({
  rebuild: authedQuery.mutation(async ({ ctx }): Promise<{ success: boolean; entries: number; accountsAdded: number; error?: string }> => {
    try {
      const accountsAdded = await ensureAccounts(getDb(), Number(ctx.user.id));
      return { success: true, entries: 0, accountsAdded };
    } catch (err: unknown) {
      console.error("[accounting.rebuild]", err instanceof Error ? err.message : err);
      return { success: false, entries: 0, accountsAdded: 0, error: "No se pudo revisar el catálogo de cuentas." };
    }
  }),

  verify: authedQuery.query(async ({ ctx }) => {
    try {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const lines = await db.select({ type: accounts.type, debit: journalEntryLines.debit, credit: journalEntryLines.credit })
        .from(journalEntryLines)
        .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
        .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
        .where(and(eq(journalEntries.createdBy, userId), eq(accounts.userId, userId)));

      // In cents, so the comparison isn't thrown off by float sums.
      let assets = 0, liabilities = 0, equity = 0, revenue = 0, expense = 0;
      for (const ln of lines) {
        const d = Math.round(Number(ln.debit) * 100), c = Math.round(Number(ln.credit) * 100);
        if (ln.type === "asset") assets += d - c;
        else if (ln.type === "liability") liabilities += c - d;
        else if (ln.type === "equity") equity += c - d;
        else if (ln.type === "revenue") revenue += c - d;
        else if (ln.type === "expense") expense += d - c;
      }
      const netIncome = revenue - expense;
      const totalEquity = equity + netIncome;
      const diff = Math.abs(assets - (liabilities + totalEquity));
      const money = (cents: number) => (cents / 100).toFixed(2);
      return { balanced: diff < 1, diff: money(diff), assets: money(assets), eq: money(totalEquity), inc: money(netIncome) };
    } catch {
      return { balanced: false, diff: "0", assets: "0", eq: "0", inc: "0" };
    }
  }),
});
