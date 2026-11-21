import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { personalTransactions, personalCategories, personalGoals } from "@db/schema";
import { eq, and, desc, sql, gte, lte, isNotNull } from "drizzle-orm";
import { bankRouter } from "./bank-router";
import { requireFeature } from "./lib/planAccess";
import { CATEGORY_KEY_RE, MAX_BUDGET_LIMIT, budgetTotals, buildBudgetRows, spendingByCategory, type SpendingTx } from "./lib/budgets";

const budgetMonthInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});
/** A spending category key as stored on bank transactions ("shopping", "home_expense"...). */
const budgetCategoryInput = z.string().regex(CATEGORY_KEY_RE);

// ─── PERSONAL TRANSACTIONS ───

export const personalRouter = createRouter({

  // ─── TRANSACTIONS ───

  listTransactions: authedQuery
    .input(z.object({
      year: z.number(),
      month: z.number(),
      type: z.enum(["all", "income", "expense"]).optional(),
      category: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) return [];
      const userId = ctx.user.id;
      const db = getDb();
      const startStr = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const endDay = new Date(input.year, input.month, 0).getDate();
      const endStr = `${input.year}-${String(input.month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

      const conditions = [
        eq(personalTransactions.userId, userId),
        gte(personalTransactions.transactionDate, sql`${startStr}`),
        lte(personalTransactions.transactionDate, sql`${endStr}`),
      ];
      if (input.type && input.type !== "all") {
        conditions.push(eq(personalTransactions.type, input.type));
      }
      if (input.category && input.category !== "all") {
        conditions.push(eq(personalTransactions.category, input.category));
      }

      return await db.select().from(personalTransactions)
        .where(and(...conditions))
        .orderBy(desc(personalTransactions.transactionDate));
    }),

  createTransaction: authedQuery
    .input(z.object({
      description: z.string().min(1),
      amount: z.number().positive(),
      type: z.enum(["income", "expense"]),
      category: z.string().default("other"),
      paymentMethod: z.enum(["cash", "card", "transfer", "zelle", "other"]).default("cash"),
      transactionDate: z.string(),
      notes: z.string().optional(),
      isRecurring: z.boolean().default(false),
      recurringFrequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      const result = await db.insert(personalTransactions).values({
        userId: ctx.user.id,
        description: input.description,
        amount: String(input.amount.toFixed(2)),
        type: input.type,
        category: input.category,
        paymentMethod: input.paymentMethod,
        transactionDate: input.transactionDate,
        notes: input.notes,
        isRecurring: input.isRecurring,
        recurringFrequency: input.recurringFrequency,
      });
      return { id: Number(result[0].insertId), success: true };
    }),

  updateTransaction: authedQuery
    .input(z.object({
      id: z.number(),
      description: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      type: z.enum(["income", "expense"]).optional(),
      category: z.string().optional(),
      paymentMethod: z.enum(["cash", "card", "transfer", "zelle", "other"]).optional(),
      transactionDate: z.string().optional(),
      notes: z.string().optional(),
      isRecurring: z.boolean().optional(),
      recurringFrequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = {};
      if (data.description) updateData.description = data.description;
      if (data.amount) updateData.amount = String(data.amount.toFixed(2));
      if (data.type) updateData.type = data.type;
      if (data.category) updateData.category = data.category;
      if (data.paymentMethod) updateData.paymentMethod = data.paymentMethod;
      if (data.transactionDate) updateData.transactionDate = data.transactionDate;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
      if (data.recurringFrequency) updateData.recurringFrequency = data.recurringFrequency;

      await db.update(personalTransactions).set(updateData)
        .where(and(eq(personalTransactions.id, id), eq(personalTransactions.userId, ctx.user.id)));
      return { success: true };
    }),

  deleteTransaction: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      await db.delete(personalTransactions)
        .where(and(eq(personalTransactions.id, input.id), eq(personalTransactions.userId, ctx.user.id)));
      return { success: true };
    }),

  // ─── DASHBOARD STATS ───

  stats: authedQuery
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) return { income: "0", expense: "0", balance: "0", count: 0 };
      const userId = ctx.user.id;
      const db = getDb();
      const startStr = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const endDay = new Date(input.year, input.month, 0).getDate();
      const endStr = `${input.year}-${String(input.month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

      const baseFilter = and(
        eq(personalTransactions.userId, userId),
        gte(personalTransactions.transactionDate, sql`${startStr}`),
        lte(personalTransactions.transactionDate, sql`${endStr}`)
      );

      const income = await db.select({ total: sql<string>`COALESCE(SUM(${personalTransactions.amount}), 0)` })
        .from(personalTransactions).where(and(baseFilter, eq(personalTransactions.type, "income")));
      const expense = await db.select({ total: sql<string>`COALESCE(SUM(${personalTransactions.amount}), 0)` })
        .from(personalTransactions).where(and(baseFilter, eq(personalTransactions.type, "expense")));
      const count = await db.select({ count: sql<number>`COUNT(*)` })
        .from(personalTransactions).where(baseFilter);

      const incVal = parseFloat(income[0]?.total ?? "0");
      const expVal = parseFloat(expense[0]?.total ?? "0");

      return {
        income: income[0]?.total ?? "0",
        expense: expense[0]?.total ?? "0",
        balance: String((incVal - expVal).toFixed(2)),
        count: count[0]?.count ?? 0,
      };
    }),

  // ─── CATEGORIES ───

  listCategories: authedQuery
    .input(z.object({ type: z.enum(["income", "expense", "all"]).optional() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) return [];
      const db = getDb();
      const conditions = [eq(personalCategories.userId, ctx.user.id)];
      if (input?.type && input.type !== "all") {
        conditions.push(eq(personalCategories.type, input.type));
      }
      return await db.select().from(personalCategories)
        .where(and(...conditions))
        .orderBy(personalCategories.name);
    }),

  createCategory: authedQuery
    .input(z.object({
      name: z.string().min(1).max(50),
      type: z.enum(["income", "expense"]),
      color: z.string().default("#000000"),
      icon: z.string().default("circle"),
      budgetLimit: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      // A category with a limit is a budget: only plans with budgets can set one.
      if (input.budgetLimit !== undefined) await requireFeature(db, ctx.user, "budgets", ctx.lang);
      const result = await db.insert(personalCategories).values({
        userId: ctx.user.id,
        name: input.name,
        type: input.type,
        color: input.color,
        icon: input.icon,
        budgetLimit: input.budgetLimit ? String(input.budgetLimit.toFixed(2)) : undefined,
      });
      return { id: Number(result[0].insertId) };
    }),

  deleteCategory: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      await db.delete(personalCategories)
        .where(and(eq(personalCategories.id, input.id), eq(personalCategories.userId, ctx.user.id)));
      return { success: true };
    }),

  // ─── BUDGETS (personal Pro: monthly limit per spending category, with alerts) ───
  // A budget is personalCategories.budgetLimit on the row whose name is the category key.
  // Spending comes from the same place as the dashboard's "Gastos por categoría" and the
  // transactions page: bank.getMonthData (Plaid first, saved bankTransactions if Plaid fails),
  // all accounts, expense transactions grouped by category.

  listBudgets: authedQuery
    .input(budgetMonthInput)
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "budgets", ctx.lang);
      const bank = bankRouter.createCaller(ctx);
      const [limitRows, connection, monthData] = await Promise.all([
        db.select({ name: personalCategories.name, budgetLimit: personalCategories.budgetLimit })
          .from(personalCategories)
          .where(and(eq(personalCategories.userId, ctx.user.id), isNotNull(personalCategories.budgetLimit))) as Promise<Array<{ name: string; budgetLimit: string | null }>>,
        bank.checkConnection(),
        bank.getMonthData({ year: input.year, month: input.month }),
      ]);

      const limits = new Map<string, number>();
      for (const row of limitRows) {
        const limit = Number(row.budgetLimit);
        if (Number.isFinite(limit) && limit > 0) limits.set(row.name, limit);
      }
      const txs: SpendingTx[] = monthData.transactions;
      const items = buildBudgetRows(limits, spendingByCategory(txs));
      return {
        year: input.year,
        month: input.month,
        bankConnected: connection.hasBank,
        items,
        totals: budgetTotals(items),
      };
    }),

  /** Sets a category's monthly limit, or clears it with limit: null. The limit applies to every month. */
  setBudget: authedQuery
    .input(z.object({
      category: budgetCategoryInput,
      limit: z.number().min(0.01).max(MAX_BUDGET_LIMIT).nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "budgets", ctx.lang);
      if (input.limit === null) {
        await db.update(personalCategories)
          .set({ budgetLimit: null })
          .where(and(eq(personalCategories.userId, ctx.user.id), eq(personalCategories.name, input.category)));
        return { category: input.category, limit: null };
      }
      const limit = (Math.round(input.limit * 100) / 100).toFixed(2);
      await db.insert(personalCategories)
        .values({ userId: ctx.user.id, name: input.category, type: "expense", budgetLimit: limit })
        .onDuplicateKeyUpdate({ set: { budgetLimit: limit } });
      return { category: input.category, limit: Number(limit) };
    }),

  // ─── GOALS ───

  listGoals: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    const db = getDb();
    return await db.select().from(personalGoals)
      .where(eq(personalGoals.userId, ctx.user.id))
      .orderBy(desc(personalGoals.createdAt));
  }),

  createGoal: authedQuery
    .input(z.object({
      name: z.string().min(1),
      targetAmount: z.number().positive(),
      deadline: z.string().optional(),
      category: z.string().default("savings"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      const result = await db.insert(personalGoals).values({
        userId: ctx.user.id,
        name: input.name,
        targetAmount: String(input.targetAmount.toFixed(2)),
        deadline: input.deadline,
        category: input.category,
      });
      return { id: Number(result[0].insertId) };
    }),

  updateGoal: authedQuery
    .input(z.object({
      id: z.number(),
      currentAmount: z.number().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      await db.update(personalGoals)
        .set({ currentAmount: String(input.currentAmount.toFixed(2)) })
        .where(and(eq(personalGoals.id, input.id), eq(personalGoals.userId, ctx.user.id)));
      return { success: true };
    }),

  deleteGoal: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      await db.delete(personalGoals)
        .where(and(eq(personalGoals.id, input.id), eq(personalGoals.userId, ctx.user.id)));
      return { success: true };
    }),
});
