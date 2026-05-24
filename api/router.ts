import { authRouter } from "./auth-router";
import { servicesRouter } from "./services-router";
import { customersRouter } from "./customers-router";
import { salesRouter } from "./sales-router";
import { dashboardRouter } from "./dashboard-router";
import { expensesRouter } from "./expenses-router";
import { settingsRouter } from "./settings-router";
import { reportsRouter } from "./reports-router";
import { bankRouter } from "./bank-router";
import { cloverRouter } from "./clover-router";
import { subscriptionRouter } from "./subscription-router";
import { accountingRouter } from "./accounting-router";
import { reconciliationRouter } from "./reconciliation-router";
import { periodRouter } from "./period-router";
import { exportRouter } from "./export-router";
import { personalRouter } from "./personal-router";
import { setupRouter } from "./setup-router";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sales } from "@db/schema";
import { desc, sql, eq } from "drizzle-orm";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  services: servicesRouter,
  customers: customersRouter,
  sales: salesRouter,
  dashboard: dashboardRouter,
  expenses: expensesRouter,
  settings: settingsRouter,
  reports: reportsRouter,
  bank: bankRouter,
  clover: cloverRouter,
  subscription: subscriptionRouter,
  accounting: accountingRouter,
  reconciliation: reconciliationRouter,
  period: periodRouter,
  export: exportRouter,
  personal: personalRouter,
  setup: setupRouter,
  debug: createRouter({
    myData: authedQuery.query(async ({ ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const allSales = await db.select({
        id: sales.id, invoiceNumber: sales.invoiceNumber, total: sales.total,
        paymentMethod: sales.paymentMethod, status: sales.status,
        createdBy: sales.createdBy, createdAt: sales.createdAt,
      }).from(sales).where(eq(sales.createdBy, userId)).orderBy(desc(sales.createdAt)).limit(10);
      return { userId, userEmail: ctx.user.email ?? null, salesCount: allSales.length, recentSales: allSales };
    }),
  }),
});

export type AppRouter = typeof appRouter;
