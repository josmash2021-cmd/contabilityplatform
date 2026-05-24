import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { personalTransactions, personalCategories, personalGoals } from "@db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

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

      let conditions = [
        eq(personalTransactions.userId, userId),
        gte(personalTransactions.transactionDate, startStr),
        lte(personalTransactions.transactionDate, endStr),
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
      const updateData: any = {};
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
        gte(personalTransactions.transactionDate, startStr),
        lte(personalTransactions.transactionDate, endStr)
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
      let conditions = [eq(personalCategories.userId, ctx.user.id)];
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
