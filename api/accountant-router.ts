// "Para tu contador" (business Pro and Negocio): the period's books in one read-only query.
// The page (src/pages/Accountant.tsx) shows them and builds the Excel file and the
// printable PDF in the browser. Pure rules live in api/lib/accountant.ts.
//
// Same rules as the Reports page income statement (api/reports-router.ts):
// - income: this user's sales (createdBy) with status "completed", by local day using the
//   browser's UTC offset; pending, cancelled and refunded are listed but don't count;
// - expenses: every expense this user recorded (createdBy), no status filter;
// - profit = income − expenses; bank movements are listed apart and don't change it.
// Expense and bank dates are calendar dates (DATE columns) and are compared as they are.
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { bankTransactions, customers, expenses, sales, saleServices } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { isoDate, tzOffsetHours } from "./lib/security";
import { requireFeature } from "./lib/planAccess";
import {
  MAX_RANGE_DAYS,
  ROW_CAP,
  buildBankTotals,
  buildIncomeStatement,
  buildSalesTotals,
  capRows,
  isValidIsoDate,
  rangeDays,
  toNumber,
  type AccountantPeriod,
  type BankRow,
  type BankTypeAgg,
  type ExpenseCategoryAgg,
  type ExpenseRow,
  type Numeric,
  type SaleRow,
  type StatusAgg,
} from "./lib/accountant";

const periodInput = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    tzOffsetHours: tzOffsetHours.optional(),
  })
  .refine((v) => isValidIsoDate(v.startDate) && isValidIsoDate(v.endDate), { message: "Invalid date", path: ["startDate"] })
  .refine((v) => v.startDate <= v.endDate, { message: "startDate must be on or before endDate", path: ["endDate"] })
  .refine((v) => rangeDays(v) <= MAX_RANGE_DAYS, { message: `The period can be at most ${MAX_RANGE_DAYS} days`, path: ["endDate"] });

type SaleDbRow = {
  id: number;
  day: string;
  invoice: string;
  customerName: string | null;
  snapshotName: string | null;
  items: string | null;
  method: string;
  total: Numeric;
  status: string;
};
type ExpenseDbRow = { id: number; day: string; description: string; category: string | null; method: string; amount: Numeric };
type BankDbRow = { id: number; day: string; description: string; category: string; type: "income" | "expense"; amount: Numeric; account: string | null };

export const accountantRouter = createRouter({
  period: authedQuery
    .input(periodInput)
    .query(async ({ input, ctx }): Promise<AccountantPeriod> => {
      const db = getDb();
      await requireFeature(db, ctx.user, "accountant", ctx.lang);
      const userId = ctx.user.id;
      const { startDate, endDate } = input;
      const tz = input.tzOffsetHours ?? 0;

      // Bound parameters (not sql.raw), on top of the strict zod validation above.
      const saleLocal = sql`DATE_ADD(${sales.createdAt}, INTERVAL ${tz} HOUR)`;
      const salesInRange = and(
        eq(sales.createdBy, userId),
        sql`DATE(${saleLocal}) >= ${startDate}`,
        sql`DATE(${saleLocal}) <= ${endDate}`,
      );
      const expensesInRange = and(
        eq(expenses.createdBy, userId),
        sql`${expenses.date} >= ${startDate}`,
        sql`${expenses.date} <= ${endDate}`,
      );
      const bankInRange = and(
        eq(bankTransactions.userId, userId),
        sql`${bankTransactions.transactionDate} >= ${startDate}`,
        sql`${bankTransactions.transactionDate} <= ${endDate}`,
      );

      const [salesByStatus, saleRows, expensesByCategory, expenseRows, bankByType, bankRows] = await Promise.all([
        // Every status, so the list can show them; only "completed" becomes income.
        db.select({
          status: sales.status,
          total: sql<Numeric>`COALESCE(SUM(${sales.total}), 0)`,
          count: sql<Numeric>`COUNT(*)`,
        }).from(sales).where(salesInRange).groupBy(sales.status) as Promise<StatusAgg[]>,

        db.select({
          id: sales.id,
          day: sql<string>`DATE_FORMAT(${saleLocal}, '%Y-%m-%d')`,
          invoice: sales.invoiceNumber,
          customerName: sql<string | null>`NULLIF(TRIM(CONCAT(${customers.name}, ' ', COALESCE(${customers.lastName}, ''))), '')`,
          snapshotName: sales.customerName,
          // Kept as a nested sql chunk so the columns stay table-qualified for the correlated subquery.
          items: sql<string | null>`(SELECT GROUP_CONCAT(${saleServices.serviceName} ORDER BY ${saleServices.id} SEPARATOR ', ') FROM ${saleServices} WHERE ${saleServices.saleId} = ${sales.id})`,
          method: sales.paymentMethod,
          total: sales.total,
          status: sales.status,
        })
          .from(sales)
          .leftJoin(customers, and(eq(sales.customerId, customers.id), eq(customers.userId, userId)))
          .where(salesInRange)
          .orderBy(asc(sales.createdAt), asc(sales.id))
          .limit(ROW_CAP + 1) as Promise<SaleDbRow[]>,

        db.select({
          category: expenses.category,
          total: sql<Numeric>`COALESCE(SUM(${expenses.amount}), 0)`,
          count: sql<Numeric>`COUNT(*)`,
        }).from(expenses).where(expensesInRange).groupBy(expenses.category) as Promise<ExpenseCategoryAgg[]>,

        db.select({
          id: expenses.id,
          day: sql<string>`DATE_FORMAT(${expenses.date}, '%Y-%m-%d')`,
          description: expenses.description,
          category: expenses.category,
          method: expenses.paymentMethod,
          amount: expenses.amount,
        })
          .from(expenses)
          .where(expensesInRange)
          .orderBy(asc(expenses.date), asc(expenses.id))
          .limit(ROW_CAP + 1) as Promise<ExpenseDbRow[]>,

        db.select({
          type: bankTransactions.type,
          total: sql<Numeric>`COALESCE(SUM(${bankTransactions.amount}), 0)`,
          count: sql<Numeric>`COUNT(*)`,
        }).from(bankTransactions).where(bankInRange).groupBy(bankTransactions.type) as Promise<BankTypeAgg[]>,

        db.select({
          id: bankTransactions.id,
          day: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
          description: bankTransactions.description,
          category: bankTransactions.category,
          type: bankTransactions.type,
          amount: bankTransactions.amount,
          account: bankTransactions.bankName,
        })
          .from(bankTransactions)
          .where(bankInRange)
          .orderBy(asc(bankTransactions.transactionDate), asc(bankTransactions.id))
          .limit(ROW_CAP + 1) as Promise<BankDbRow[]>,
      ]);

      const salesTotals = buildSalesTotals(salesByStatus);
      const incomeStatement = buildIncomeStatement({
        salesTotal: salesTotals.completedTotal,
        salesCount: salesTotals.completedCount,
        expensesByCategory,
      });
      const bankTotals = buildBankTotals(bankByType);

      const salesList = capRows(saleRows, ROW_CAP);
      const expensesList = capRows(expenseRows, ROW_CAP);
      const bankList = capRows(bankRows, ROW_CAP);

      return {
        period: { startDate, endDate },
        rowCap: ROW_CAP,
        incomeStatement,
        sales: {
          ...salesTotals,
          truncated: salesList.truncated,
          rows: salesList.rows.map((r): SaleRow => ({
            id: Number(r.id),
            date: r.day,
            invoice: r.invoice,
            client: r.customerName?.trim() || r.snapshotName?.trim() || null,
            items: r.items,
            method: r.method,
            total: toNumber(r.total),
            status: r.status,
          })),
        },
        expenses: {
          count: incomeStatement.expensesCount,
          total: incomeStatement.totalExpenses,
          truncated: expensesList.truncated,
          rows: expensesList.rows.map((r): ExpenseRow => ({
            id: Number(r.id),
            date: r.day,
            description: r.description,
            category: r.category ?? "",
            method: r.method,
            amount: toNumber(r.amount),
          })),
        },
        bank: {
          ...bankTotals,
          truncated: bankList.truncated,
          rows: bankList.rows.map((r): BankRow => ({
            id: Number(r.id),
            date: r.day,
            description: r.description,
            category: r.category,
            type: r.type,
            amount: toNumber(r.amount),
            account: r.account,
          })),
        },
      };
    }),
});
