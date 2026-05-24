import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { expenses, accounts, journalEntries, journalEntryLines } from "@db/schema";
import { eq, desc, sql, gte, and } from "drizzle-orm";
// and is already imported

export const expensesRouter = createRouter({
  list: authedQuery
    .input(z.object({ limit: z.number().min(1).max(200).default(50), offset: z.number().min(0).default(0) }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      if (userId) {
        return db.select().from(expenses).where(sql`${expenses.createdBy} = ${userId}`).orderBy(desc(expenses.createdAt)).limit(limit).offset(offset);
      }
      return db.select().from(expenses).orderBy(desc(expenses.createdAt)).limit(limit).offset(offset);
    }),

  create: authedQuery
    .input(z.object({
      description: z.string().min(1),
      category: z.string().min(1),
      subcategory: z.string().optional(),
      amount: z.string().or(z.number()),
      paymentMethod: z.enum(["cash", "zelle", "card"]),
      date: z.string(),
      reference: z.string().optional(),
      receipt: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db.insert(expenses).values({
        ...input,
        amount: String(input.amount),
        date: new Date(input.date),
        createdBy: ctx.user.id,
      });

      const expenseId = Number(result[0].insertId);
      const expenseAmount = Number(input.amount);

      const cashAcc = await db.select().from(accounts).where(and(eq(accounts.code, "1110"), eq(accounts.userId, ctx.user.id))).limit(1);
      const zelleAcc = await db.select().from(accounts).where(and(eq(accounts.code, "1130"), eq(accounts.userId, ctx.user.id))).limit(1);
      const creditAcc = await db.select().from(accounts).where(and(eq(accounts.code, "1150"), eq(accounts.userId, ctx.user.id))).limit(1);
      const expAcc = await db.select().from(accounts).where(and(eq(accounts.code, "5100"), eq(accounts.userId, ctx.user.id))).limit(1);

      let paymentAccId: number | undefined;
      switch (input.paymentMethod) {
        case "cash": paymentAccId = cashAcc[0]?.id; break;
        case "zelle": paymentAccId = zelleAcc[0]?.id; break;
        case "card": paymentAccId = creditAcc[0]?.id; break;
      }
      const expenseAccId = expAcc[0]?.id;

      if (paymentAccId && expenseAccId) {
        const jeCount = await db.select({ count: sql<number>`count(*)` }).from(journalEntries).where(gte(journalEntries.createdAt, new Date()));
        const entryNumber = `GAS-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String((jeCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

        const jeResult = await db.insert(journalEntries).values({
          entryNumber, date: new Date(input.date),
          description: `Gasto: ${input.description}`,
          reference: input.reference ?? `EXP-${expenseId}`,
          referenceId: expenseId,
          referenceType: "purchase",
          debitTotal: String(expenseAmount),
          creditTotal: String(expenseAmount),
          createdBy: ctx.user.id,
        });
        const jeId = Number(jeResult[0].insertId);

        await db.insert(journalEntryLines).values([
          { journalEntryId: jeId, accountId: expenseAccId, debit: String(expenseAmount), credit: "0", description: `Gasto: ${input.description}` },
          { journalEntryId: jeId, accountId: paymentAccId, debit: "0", credit: String(expenseAmount), description: `Pago ${input.paymentMethod}` },
        ]);
      }

      return { id: expenseId };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Only delete if the expense belongs to the current user
      await db.delete(expenses).where(
        sql`${expenses.id} = ${input.id} AND ${expenses.createdBy} = ${ctx.user.id}`
      );
      return { success: true };
    }),

  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);

    const monthResult = await db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`, count: sql<number>`COUNT(*)` })
      .from(expenses).where(and(eq(expenses.createdBy, userId), gte(expenses.date, monthAgo)));

    const byCategory = await db.select({
      category: expenses.category,
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(expenses).where(and(eq(expenses.createdBy, userId), gte(expenses.date, monthAgo))).groupBy(expenses.category);

    return { monthTotal: monthResult[0]?.total ?? "0", monthCount: monthResult[0]?.count ?? 0, byCategory };
  }),
});
