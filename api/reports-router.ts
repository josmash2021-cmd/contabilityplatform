import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { accounts, journalEntries, journalEntryLines, sales, expenses, bankTransactions, bankAccounts } from "@db/schema";
import { sql, desc, eq, and, gte, lte } from "drizzle-orm";

export const reportsRouter = createRouter({

  // ── Income Statement: based on ACTUAL sales and expenses ──
  incomeStatement: authedQuery
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      tzOffsetHours: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const tzOff = input?.tzOffsetHours ?? 0;
      const tzExprSales = `DATE_ADD(createdAt, INTERVAL ${tzOff} HOUR)`;
      const tzExprBank = `DATE_ADD(transactionDate, INTERVAL ${tzOff} HOUR)`;
      const tzExprExp = `DATE_ADD(date, INTERVAL ${tzOff} HOUR)`;

      const todayLocal = new Date();
      const y = todayLocal.getFullYear();
      const m = todayLocal.getMonth();
      const d = todayLocal.getDate();
      const pad = (n: number) => String(n).padStart(2, "0");

      const endDate = input?.endDate || `${y}-${pad(m + 1)}-${pad(d)}`;
      const startDate = input?.startDate || `${y}-${pad(m + 1)}-01`;

      // Helper: normalize db.execute result
      const getRows = (r: any): any[] => {
        if (Array.isArray(r) && r.length === 2 && Array.isArray(r[1]) && r[1][0]?.name !== undefined) return r[0];
        return Array.isArray(r) ? r : [];
      };

      // REVENUE from sales (POS/ventas)
      const revResult = await db.execute(sql.raw(`
        SELECT COALESCE(SUM(total), 0) as total
        FROM sales
        WHERE createdBy = ${userId}
          AND DATE(${tzExprSales}) >= '${startDate}'
          AND DATE(${tzExprSales}) <= '${endDate}'
          AND status = 'completed'
      `));
      const salesRevenue = Number(getRows(revResult)[0]?.total ?? 0);

      // REVENUE from bank transactions (deposits, zelle received)
      const bankIncResult = await db.execute(sql.raw(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM bankTransactions
        WHERE userId = ${userId}
          AND type = 'income'
          AND DATE(${tzExprBank}) >= '${startDate}'
          AND DATE(${tzExprBank}) <= '${endDate}'
      `));
      const bankRevenue = Number(getRows(bankIncResult)[0]?.total ?? 0);

      // EXPENSES from expenses table (operativos)
      const expResult = await db.execute(sql.raw(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE createdBy = ${userId}
          AND DATE(${tzExprExp}) >= '${startDate}'
          AND DATE(${tzExprExp}) <= '${endDate}'
      `));
      const operExpenses = Number(getRows(expResult)[0]?.total ?? 0);

      // EXPENSES from bank transactions
      const bankExpResult = await db.execute(sql.raw(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM bankTransactions
        WHERE userId = ${userId}
          AND type = 'expense'
          AND DATE(${tzExprBank}) >= '${startDate}'
          AND DATE(${tzExprBank}) <= '${endDate}'
      `));
      const bankExpenses = Number(getRows(bankExpResult)[0]?.total ?? 0);

      const totalRevenue = salesRevenue + bankRevenue;
      const totalExpenses = operExpenses + bankExpenses;
      const netIncome = totalRevenue - totalExpenses;

      return {
        period: { start: startDate, end: endDate },
        totalRevenue,
        totalExpenses,
        netIncome,
        breakdown: { salesRevenue, bankRevenue, operExpenses, bankExpenses },
      };
    }),

  // ── Balance Sheet: based on journal entries ──
  balanceSheet: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user?.id ?? null;

    if (!userId) {
      return { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalLiabilitiesAndEquity: 0 };
    }

    // Get all journal entry lines for this user
    const allLines = await db
      .select({
        accountId: accounts.id,
        accountCode: accounts.code,
        accountName: accounts.name,
        accountType: accounts.type,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
      })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
      .where(and(eq(journalEntries.createdBy, userId), eq(accounts.userId, userId)));

    // Calculate balance per account (raw: debit - credit)
    const accountBalances = new Map<number, { code: string; name: string; type: string; balance: number }>();

    for (const line of allLines) {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);
      const existing = accountBalances.get(line.accountId);
      if (existing) {
        existing.balance += debit - credit;
      } else {
        accountBalances.set(line.accountId, {
          code: line.accountCode,
          name: line.accountName,
          type: line.accountType,
          balance: debit - credit,
        });
      }
    }

    // After closing entries: revenue=0, expense=0, equity=Ganancias Acumuladas
    // Assets: positive balance (debit > credit)
    // Liabilities: negative balance (credit > debit), show as positive
    // Equity: negative balance (credit > debit), show as positive
    const allAccounts = Array.from(accountBalances.values());
    const assets = allAccounts.filter(a => a.type === "asset" && a.balance > 0.01);
    const liabilities = allAccounts.filter(a => a.type === "liability" && a.balance < -0.01).map(a => ({ ...a, balance: -a.balance }));
    const equity = allAccounts.filter(a => a.type === "equity" && a.balance < -0.01).map(a => ({ ...a, balance: -a.balance }));

    // Add Plaid bank balance as a separate asset line (real bank position)
    const bankRow = await db.select({ currentBalance: bankAccounts.currentBalance, bankName: bankAccounts.bankName })
      .from(bankAccounts).where(eq(bankAccounts.userId, userId)).limit(1);
    const plaidBalance = bankRow[0] ? Number(bankRow[0].currentBalance ?? 0) : 0;

    if (plaidBalance > 0.01) {
      assets.push({
        code: "1121",
        name: `Banco (${bankRow[0]?.bankName || "Conectado"})`,
        type: "asset",
        balance: plaidBalance,
      });
    }

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
    const totalEquity = equity.reduce((s, e) => s + e.balance, 0);

    return {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
    };
  }),

  journalEntries: authedQuery
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;

      if (!userId) {
        return [];
      }

      // Get entries with their lines in a single query using joins
      const rows = await db.select({
        entry: journalEntries,
        line: {
          id: journalEntryLines.id,
          accountId: journalEntryLines.accountId,
          accountCode: accounts.code,
          accountName: accounts.name,
          debit: journalEntryLines.debit,
          credit: journalEntryLines.credit,
          description: journalEntryLines.description,
        },
      })
      .from(journalEntries)
      .leftJoin(journalEntryLines, eq(journalEntries.id, journalEntryLines.journalEntryId))
      .leftJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
      .where(eq(journalEntries.createdBy, userId))
      .orderBy(desc(journalEntries.createdAt))
      .limit(input.limit)
      .offset(input.offset);

      // Group lines by entry
      const entryMap = new Map<number, typeof rows[0]['entry'] & { lines: Array<typeof rows[0]['line']> }>();
      for (const row of rows) {
        const entryId = row.entry.id;
        if (!entryMap.has(entryId)) {
          entryMap.set(entryId, { ...row.entry, lines: [] });
        }
        if (row.line && row.line.id !== null) {
          entryMap.get(entryId)!.lines.push(row.line);
        }
      }

      return Array.from(entryMap.values());
    }),
});
