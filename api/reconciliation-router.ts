import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bankAccounts, bankTransactions } from "@db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export const reconciliationRouter = createRouter({

  // ── Get reconciliation status: compare Plaid balance vs book balance ──
  status: authedQuery.input(z.object({ accountId: z.number().optional() })).query(async ({ input, ctx }) => {
    if (!ctx.user) return { connected: false };
    const userId = ctx.user.id;
    const db = getDb();

    try {
      let account;
      if (input?.accountId) {
        const rows = await db.select().from(bankAccounts).where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.id, input.accountId))).limit(1);
        account = rows[0];
      } else {
        const rows = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)).limit(1);
        account = rows[0];
      }
      if (!account) return { connected: false };

      // Book balance = sum of all bank transactions (income - expense) for THIS account
      const incomeSum = await db.select({
        total: sql<string>`COALESCE(SUM(${bankTransactions.amount}), 0)`,
      }).from(bankTransactions).where(
        and(eq(bankTransactions.userId, userId), eq(bankTransactions.type, "income"), eq(bankTransactions.bankAccountId, account.id))
      );

      const expenseSum = await db.select({
        total: sql<string>`COALESCE(SUM(${bankTransactions.amount}), 0)`,
      }).from(bankTransactions).where(
        and(eq(bankTransactions.userId, userId), eq(bankTransactions.type, "expense"), eq(bankTransactions.bankAccountId, account.id))
      );

      const bookIncome = Number(incomeSum[0]?.total ?? 0);
      const bookExpense = Number(expenseSum[0]?.total ?? 0);
      const bookBalance = bookIncome - bookExpense;

      const plaidBalance = Number(account.currentBalance ?? 0);
      const difference = plaidBalance - bookBalance;

      return {
        connected: true,
        bankName: account.bankName,
        plaidBalance: plaidBalance.toFixed(2),
        bookBalance: bookBalance.toFixed(2),
        difference: Math.abs(difference).toFixed(2),
        reconciled: Math.abs(difference) < 0.01,
        lastSyncedAt: account.lastSyncedAt,
      };
    } catch { return { connected: false }; }
  }),
});
