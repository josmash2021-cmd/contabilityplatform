import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sales, expenses, accounts, bankTransactions, bankAccounts, journalEntries, journalEntryLines, customers } from "@db/schema";
import { sql, desc, and, eq, gte, count } from "drizzle-orm";
import { z } from "zod";

export const dashboardRouter = createRouter({
  debug: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    
    // Get raw counts and recent sales
    const totalSales = await db.select({ count: sql<number>`COUNT(*)` }).from(sales);
    const recentSalesRaw = await db.select({ id: sales.id, total: sales.total, createdAt: sales.createdAt, status: sales.status, createdBy: sales.createdBy }).from(sales).orderBy(desc(sales.createdAt)).limit(5);
    const curDate = await db.select({ curdate: sql<string>`CURDATE()`, now: sql<string>`NOW()` }).from(sales).limit(1);

    return {
      currentUserId: userId,
      totalSalesCount: totalSales[0]?.count ?? 0,
      recentSales: recentSalesRaw,
      dbDate: curDate[0] ?? null,
    };
  }),

  summary: authedQuery.query(async ({ ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // Use SQL date functions to match MySQL's timezone handling
      // DATE(createdAt) compares dates correctly regardless of timezone

      // ─── Sales aggregates via SQL ───
      const todaySalesAgg = await db.select({
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(sales).where(
        and(eq(sales.createdBy, userId), sql`DATE(${sales.createdAt}) = CURDATE()`, eq(sales.status, "completed"))
      );

      const weekSalesAgg = await db.select({
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(sales).where(
        and(eq(sales.createdBy, userId), sql`DATE(${sales.createdAt}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`, eq(sales.status, "completed"))
      );

      const monthSalesAgg = await db.select({
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(sales).where(
        and(eq(sales.createdBy, userId), sql`DATE(${sales.createdAt}) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`, eq(sales.status, "completed"))
      );

      // Payment breakdown (today)
      const paymentBreakdownRaw = await db.select({
        method: sales.paymentMethod,
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(sales).where(
        and(eq(sales.createdBy, userId), sql`DATE(${sales.createdAt}) = CURDATE()`, eq(sales.status, "completed"))
      ).groupBy(sales.paymentMethod);

      const paymentBreakdown = (paymentBreakdownRaw as Array<{ method: string; total: string; count: number }>).map((p) => ({
        method: p.method,
        total: String(Number(p.total).toFixed(2)),
        count: p.count,
      }));

      // Daily sales (last 7 days) via SQL
      const dailySalesRaw = await db.select({
        date: sql<string>`DATE(${sales.createdAt})`,
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(sales).where(
        and(eq(sales.createdBy, userId), sql`DATE(${sales.createdAt}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`, eq(sales.status, "completed"))
      ).groupBy(sql`DATE(${sales.createdAt})`);

      const dailySalesMap = new Map((dailySalesRaw as Array<{ date: string; total: string; count: number }>).map(d => [d.date, d]));
      const dailySales: Array<{ date: string; dayName: string; total: string; count: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split("T")[0];
        const row = dailySalesMap.get(dayStr);
        dailySales.push({
          date: dayStr,
          dayName: d.toLocaleDateString("es", { weekday: "short" }),
          total: String(Number(row?.total ?? 0).toFixed(2)),
          count: Number(row?.count ?? 0),
        });
      }

      // Recent sales (top 8)
      const recentSales = await db.select({
        id: sales.id, invoiceNumber: sales.invoiceNumber, total: sales.total,
        paymentMethod: sales.paymentMethod, status: sales.status,
        customerName: sales.customerName, createdAt: sales.createdAt,
      }).from(sales).where(eq(sales.createdBy, userId)).orderBy(desc(sales.createdAt)).limit(8);

      // Customer count
      let customerCount = 0;
      try {
        const custResult = await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(eq(customers.userId, userId));
        customerCount = custResult[0]?.count ?? 0;
      } catch {
        // Table may not exist
      }


      // Expenses
      const todayExpAgg = await db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(
        sql`DATE(${expenses.date}) = CURDATE()`
      );
      const weekExpAgg = await db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(
        sql`DATE(${expenses.date}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`
      );
      const monthExpAgg = await db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(
        sql`DATE(${expenses.date}) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`
      );

      // Bank balance (wrapped in try-catch in case table doesn't exist)
      let bankBalance = { total: "0" };
      try {
        const bankResult = await db.select({ total: sql<string>`COALESCE(SUM(${bankAccounts.currentBalance}), 0)` }).from(bankAccounts).where(
          eq(bankAccounts.userId, userId)
        );
        bankBalance = bankResult[0] ?? { total: "0" };
      } catch {
        // Table may not exist, ignore
      }

      // Account balances (wrapped in try-catch in case table doesn't exist)
      let accountBalances: Array<{ name: string; balance: string }> = [];
      try {
        accountBalances = await db.select({ name: accounts.name, balance: accounts.balance }).from(accounts).where(
          and(eq(accounts.userId, userId), sql`${accounts.balance} != 0`)
        ).orderBy(desc(accounts.balance)).limit(5);
      } catch {
        // Table may not exist, ignore
      }

      return {
        todaySales: { total: todaySalesAgg[0]?.total ?? "0", count: todaySalesAgg[0]?.count ?? 0 },
        weekSales: { total: weekSalesAgg[0]?.total ?? "0", count: weekSalesAgg[0]?.count ?? 0 },
        monthSales: { total: monthSalesAgg[0]?.total ?? "0", count: monthSalesAgg[0]?.count ?? 0 },
        todayExpenses: todayExpAgg[0]?.total ?? "0",
        weekExpenses: weekExpAgg[0]?.total ?? "0",
        monthExpenses: monthExpAgg[0]?.total ?? "0",
        paymentBreakdown,
        dailySales,
        recentSales: recentSales as any[],
        bankBalance: bankBalance.total ?? "0",
        accountBalances,
        customerCount,
      };
    }),

  monthly: authedQuery
    .input(z.object({ month: z.number().min(1).max(12), year: z.number() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;

      const year = input?.year ?? new Date().getFullYear();
      const month = (input?.month ?? (new Date().getMonth() + 1)) - 1;

      const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

      const monthName = new Date(year, month, 15).toLocaleDateString("es-ES", { month: "long", year: "numeric" });

      // Sales via SQL
      const salesAgg = await db.select({
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(sales).where(and(
        userId ? eq(sales.createdBy, userId) : undefined,
        gte(sales.createdAt, monthStart),
        sql`${sales.createdAt} <= ${monthEnd}`,
        eq(sales.status, "completed"),
      ));
      const monthSalesTotal = Number(salesAgg[0]?.total ?? 0);

      // Expenses via SQL
      const expAgg = await db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses).where(and(
        userId ? eq(expenses.createdBy, userId) : undefined,
        gte(expenses.date, monthStart),
        sql`${expenses.date} <= ${monthEnd}`,
      ));
      const monthExpTotal = Number(expAgg[0]?.total ?? 0);

      // Payment breakdown
      const paymentBreakdownRaw = await db.select({
        method: sales.paymentMethod,
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(sales).where(and(
        userId ? eq(sales.createdBy, userId) : undefined,
        gte(sales.createdAt, monthStart),
        sql`${sales.createdAt} <= ${monthEnd}`,
        eq(sales.status, "completed"),
      )).groupBy(sales.paymentMethod);

      // Daily sales via SQL
      const dailySalesRaw = await db.select({
        day: sql<number>`DAY(${sales.createdAt})`,
        total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(sales).where(and(
        userId ? eq(sales.createdBy, userId) : undefined,
        gte(sales.createdAt, monthStart),
        sql`${sales.createdAt} <= ${monthEnd}`,
        eq(sales.status, "completed"),
      )).groupBy(sql`DAY(${sales.createdAt})`);

      const dayMap = new Map((dailySalesRaw as Array<{ day: number; total: string; count: number }>).map(d => [d.day, d]));
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const dailySales: Array<{ day: number; dayName: string; total: string; count: number }> = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const row = dayMap.get(d);
        dailySales.push({
          day: d,
          dayName: String(d),
          total: String(Number(row?.total ?? 0).toFixed(2)),
          count: Number(row?.count ?? 0),
        });
      }

      return {
        monthName,
        totalSales: String(monthSalesTotal.toFixed(2)),
        totalCount: salesAgg[0]?.count ?? 0,
        totalExpenses: String(monthExpTotal.toFixed(2)),
        netIncome: String((monthSalesTotal - monthExpTotal).toFixed(2)),
        paymentBreakdown: (paymentBreakdownRaw as Array<{ method: string; total: string; count: number }>).map((p) => ({ method: p.method, total: String(Number(p.total).toFixed(2)), count: p.count })),
        dailySales,
      };
    }),
});

function formatDbCurrency(value: string | number | null): string {
  const n = Number(value ?? 0);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
