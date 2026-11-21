import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { personalTransactions, personalCategories, personalGoals, bankAccounts } from "@db/schema";
import { eq, and, asc, desc, sql, gte, lte, isNotNull } from "drizzle-orm";
import { bankRouter } from "./bank-router";
import { requireFeature } from "./lib/planAccess";
import {
  CATEGORY_KEY_RE, MAX_BUDGET_LIMIT, averageSpending, budgetTotals, buildBudgetRows, carryOver, isFixedCategory, limitsForMonth, prevYm, rolloverFor,
  roundUp10, spendingByCategory, toCents, ymFromDate, ymOf, type BudgetHistoryRow, type CurrentBudget, type SpendingTx,
} from "./lib/budgets";

type Db = ReturnType<typeof getDb>;

const budgetMonthInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});
/** A spending category key as stored on bank transactions ("shopping", "home_expense"...). */
const budgetCategoryInput = z.string().regex(CATEGORY_KEY_RE);

// ── Tables of the 2.0 budgets and goals, created on first use (they stay out of db/schema.ts) ──
let planTables: Promise<void> | null = null;
export function ensurePlanTables(db: Db): Promise<void> {
  planTables ??= (async () => {
    // Budget history: from month ym on, the category's limit is budgetLimit (NULL = none). rollover = pass
    // what's left of month ym to the next one. Past months keep the limits they had.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS personalBudgetMonths (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        category VARCHAR(50) NOT NULL,
        ym INT NOT NULL,
        budgetLimit DECIMAL(12,2) NULL,
        rollover TINYINT NOT NULL DEFAULT 0,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX personalBudgetMonths_user_cat_ym (userId, category, ym)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // How a goal is followed: by hand (deposits), a savings account's balance, or a card's debt going down.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS personalGoalPlans (
        goalId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        kind VARCHAR(8) NOT NULL DEFAULT 'save',
        track VARCHAR(8) NOT NULL DEFAULT 'manual',
        accountId BIGINT UNSIGNED NULL,
        monthly DECIMAL(12,2) NULL,
        paused TINYINT NOT NULL DEFAULT 0,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX personalGoalPlans_user (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // "Anotar lo que aparté": each deposit to a goal followed by hand, with its day (for "este mes apartaste").
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS personalGoalDeposits (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        goalId BIGINT UNSIGNED NOT NULL,
        userId BIGINT UNSIGNED NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        depositOn DATE NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX personalGoalDeposits_goal (goalId),
        INDEX personalGoalDeposits_user_day (userId, depositOn)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })().catch((e) => {
    planTables = null;
    throw e;
  });
  return planTables;
}

/** Rows of a raw query (mysql2 returns [rows, fields]). */
async function rawRows<T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(q)) as unknown as [T[], unknown])[0];
}

function monthBounds(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}` };
}
function serverYm(): number {
  const d = new Date();
  return ymOf(d.getUTCFullYear(), d.getUTCMonth() + 1);
}
const money2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Budget history and current limits of a user. */
async function budgetSources(db: Db, userId: number): Promise<{ history: BudgetHistoryRow[]; current: Map<string, CurrentBudget> }> {
  await ensurePlanTables(db);
  const hist = await rawRows<{ category: string; ym: number; budgetLimit: string | null; rollover: number }>(db,
    sql`SELECT category, ym, budgetLimit, rollover FROM personalBudgetMonths WHERE userId = ${userId}`);
  const cur: Array<{ name: string; budgetLimit: string | null; createdAt: Date | string | null }> = await db
    .select({ name: personalCategories.name, budgetLimit: personalCategories.budgetLimit, createdAt: personalCategories.createdAt })
    .from(personalCategories)
    .where(and(eq(personalCategories.userId, userId), isNotNull(personalCategories.budgetLimit)));
  const current = new Map<string, CurrentBudget>();
  for (const r of cur) {
    const limit = Number(r.budgetLimit);
    if (Number.isFinite(limit) && limit > 0) current.set(r.name, { limit, createdYm: ymFromDate(r.createdAt) });
  }
  return {
    history: hist.map((h) => ({ category: h.category, ym: Number(h.ym), limit: h.budgetLimit === null ? null : Number(h.budgetLimit), rollover: !!Number(h.rollover) })),
    current,
  };
}

/**
 * Saves a category's limit from month `ym` on (and as the current limit). The first change of a budget set
 * before the history existed first records the old limit at the month it started, so past months keep it.
 */
async function writeBudget(db: Db, userId: number, category: string, limit: number | null, ym: number) {
  const { history, current } = await budgetSources(db, userId);
  const had = current.get(category);
  if (had && !history.some((h) => h.category === category)) {
    const from = Math.min(had.createdYm ?? ym, ym);
    if (from < ym) {
      await db.execute(sql`INSERT INTO personalBudgetMonths (userId, category, ym, budgetLimit) VALUES (${userId}, ${category}, ${from}, ${money2(had.limit)})
        ON DUPLICATE KEY UPDATE budgetLimit = VALUES(budgetLimit)`);
    }
  }
  const value = limit === null ? null : money2(limit);
  await db.execute(sql`INSERT INTO personalBudgetMonths (userId, category, ym, budgetLimit) VALUES (${userId}, ${category}, ${ym}, ${value})
    ON DUPLICATE KEY UPDATE budgetLimit = VALUES(budgetLimit)`);
  if (limit === null || value === null) {
    await db.update(personalCategories).set({ budgetLimit: null })
      .where(and(eq(personalCategories.userId, userId), eq(personalCategories.name, category)));
  } else {
    await db.insert(personalCategories)
      .values({ userId, name: category, type: "expense", budgetLimit: value })
      .onDuplicateKeyUpdate({ set: { budgetLimit: value } });
  }
}

/** The month the client says it is, checked against the server's: a month that already ended can't change. */
function editableYm(lang: string, year?: number, month?: number): number {
  const now = serverYm();
  if (year === undefined || month === undefined) return now;
  const ym = ymOf(year, month);
  if (ym < prevYm(now) || ym > now + 100) {
    throw new TRPCError({ code: "BAD_REQUEST", message: lang === "en" ? "Past months don't change: they're there to compare." : "Los meses que ya pasaron no se cambian: sirven para comparar." });
  }
  return ym;
}

type BankCaller = ReturnType<typeof bankRouter.createCaller>;

/** Spending by category and whether the month has any bank data, from the same source as the dashboard. */
async function monthSpending(bank: BankCaller, year: number, month: number) {
  const data = await bank.getMonthData({ year, month });
  const txs: SpendingTx[] = data.transactions;
  return { hasData: txs.length > 0, spending: spendingByCategory(txs) };
}

const goalPlanInput = {
  monthly: z.number().min(0).max(MAX_BUDGET_LIMIT).nullable().optional(),
  track: z.enum(["manual", "acct", "debt"]).optional(),
  accountId: z.number().int().positive().nullable().optional(),
  kind: z.enum(["save", "debt"]).optional(),
};
const dayInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type GoalRow = { id: number; userId: number; name: string; targetAmount: string; currentAmount: string; deadline: Date | string | null; category: string | null; isActive: boolean | null; createdAt: Date | string };
type PlanRow = { goalId: number; kind: string; track: string; accountId: number | null; monthly: string | null; paused: number };
type AccountRow = { id: number; bankName: string; accountNumber: string | null; accountType: string | null; currentBalance: string | null; isActive: boolean | null };

const isCard = (a: AccountRow) => /credit/i.test(a.accountType ?? "");
const isSavings = (a: AccountRow) => !isCard(a) && !/loan/i.test(a.accountType ?? "") && /sav|ahorro/i.test(`${a.accountType ?? ""} ${a.bankName}`);
const acctLabel = (a: AccountRow) => `${a.bankName}${a.accountNumber ? ` ••${String(a.accountNumber).slice(-4)}` : ""}`;

async function userAccounts(db: Db, userId: number): Promise<AccountRow[]> {
  return db.select({
    id: bankAccounts.id, bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber, accountType: bankAccounts.accountType,
    currentBalance: bankAccounts.currentBalance, isActive: bankAccounts.isActive,
  }).from(bankAccounts).where(eq(bankAccounts.userId, userId));
}

/** Checks the account a goal follows: the user's own, a savings account (or a card for a debt), not used by another goal. */
async function checkGoalAccount(db: Db, userId: number, track: "acct" | "debt", accountId: number | null | undefined, lang: string, exceptGoal?: number): Promise<AccountRow> {
  const fail = (es: string, en: string): never => { throw new TRPCError({ code: "BAD_REQUEST", message: lang === "en" ? en : es }); };
  if (!accountId) return fail("Elige la cuenta que sigue esta meta.", "Pick the account this goal follows.");
  const acc = (await userAccounts(db, userId)).find((a) => a.id === accountId);
  if (!acc) return fail("No encontramos esa cuenta.", "We couldn't find that account.");
  if (track === "debt" ? !isCard(acc) : isCard(acc)) fail("Esa cuenta no sirve para esta meta.", "That account doesn't work for this goal.");
  const taken = await rawRows<{ goalId: number; name: string }>(db, sql`
    SELECT p.goalId, g.name FROM personalGoalPlans p JOIN personalGoals g ON g.id = p.goalId
    WHERE p.userId = ${userId} AND p.accountId = ${accountId} AND p.track = ${track} AND COALESCE(g.isActive, 1) = 1 ${exceptGoal ? sql`AND p.goalId <> ${exceptGoal}` : sql``}`);
  if (taken.length) fail(`Esa cuenta ya la sigue tu meta ${taken[0].name}.`, `Your goal ${taken[0].name} already follows that account.`);
  return acc;
}

async function ownGoal(db: Db, userId: number, id: number) {
  const goal = (await db.select({ id: personalGoals.id }).from(personalGoals).where(and(eq(personalGoals.id, id), eq(personalGoals.userId, userId))).limit(1))[0];
  if (!goal) throw new TRPCError({ code: "NOT_FOUND" });
}
async function planOf(db: Db, userId: number, goalId: number): Promise<PlanRow | undefined> {
  return (await rawRows<PlanRow>(db, sql`SELECT goalId, kind, track, accountId, monthly, paused FROM personalGoalPlans WHERE goalId = ${goalId} AND userId = ${userId}`))[0];
}

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
  // A budget is personalCategories.budgetLimit on the row whose name is the category key, with its history
  // per month in personalBudgetMonths (so past months keep their limits). Spending comes from the same place
  // as the dashboard's "Gastos por categoría" and the transactions page: bank.getMonthData (Plaid first,
  // saved bankTransactions if Plaid fails), all accounts, expense transactions grouped by category.

  listBudgets: authedQuery
    .input(budgetMonthInput)
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "budgets", ctx.lang);
      const userId = Number(ctx.user.id);
      const bank = bankRouter.createCaller(ctx);
      const ym = ymOf(input.year, input.month);
      const [sources, connection, monthData] = await Promise.all([
        budgetSources(db, userId),
        bank.checkConnection(),
        bank.getMonthData({ year: input.year, month: input.month }),
      ]);
      const base = limitsForMonth(sources.history, sources.current, ym);

      // "Pasar lo que sobre": last month's leftover joins this month's limit.
      const prev = prevYm(ym);
      const rolled = rolloverFor(sources.history, prev);
      const carry = new Map<string, number>();
      if (rolled.size > 0) {
        const prevBase = limitsForMonth(sources.history, sources.current, prev);
        const { spending: prevSpending } = await monthSpending(bank, Math.floor(prev / 100), prev % 100);
        for (const category of rolled) {
          const l = prevBase.get(category);
          if (l === undefined || !base.has(category)) continue;
          const c = carryOver(l, prevSpending.get(category) ?? 0);
          if (c > 0) carry.set(category, c);
        }
      }
      const limits = new Map<string, number>();
      for (const [category, l] of base) limits.set(category, (toCents(l) + toCents(carry.get(category) ?? 0)) / 100);

      const txs: SpendingTx[] = monthData.transactions;
      const rollNow = rolloverFor(sources.history, ym);
      const items = buildBudgetRows(limits, spendingByCategory(txs)).map((r) => ({
        ...r,
        /** The month's own limit, without what came from last month. */
        baseLimit: base.get(r.category) ?? null,
        /** What last month's leftover added to the limit. */
        carry: carry.get(r.category) ?? 0,
        /** This month's leftover passes to the next month. */
        rollover: rollNow.has(r.category),
        fixed: isFixedCategory(r.category),
      }));
      return {
        year: input.year,
        month: input.month,
        bankConnected: connection.hasBank,
        items,
        totals: budgetTotals(items),
      };
    }),

  /** Sets a category's monthly limit, or clears it with limit: null, from this month on (past months keep theirs). */
  setBudget: authedQuery
    .input(z.object({
      category: budgetCategoryInput,
      limit: z.number().min(0.01).max(MAX_BUDGET_LIMIT).nullable(),
      year: z.number().int().min(2000).max(2100).optional(),
      month: z.number().int().min(1).max(12).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "budgets", ctx.lang);
      const ym = editableYm(ctx.lang, input.year, input.month);
      const limit = input.limit === null ? null : Math.round(input.limit * 100) / 100;
      await writeBudget(db, Number(ctx.user.id), input.category, limit, ym);
      return { category: input.category, limit };
    }),

  /** "Pasar lo que sobre a diciembre": the leftover of this month joins the next month's limit. */
  setRollover: authedQuery
    .input(z.object({ category: budgetCategoryInput, year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12), on: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "budgets", ctx.lang);
      const userId = Number(ctx.user.id);
      const ym = editableYm(ctx.lang, input.year, input.month);
      const { history, current } = await budgetSources(db, userId);
      const limit = limitsForMonth(history, current, ym).get(input.category);
      if (limit === undefined) throw new TRPCError({ code: "BAD_REQUEST", message: ctx.lang === "en" ? "Set a budget first." : "Primero ponle un presupuesto." });
      // A new row keeps the limit the month already had, so only the switch changes.
      await db.execute(sql`INSERT INTO personalBudgetMonths (userId, category, ym, budgetLimit, rollover) VALUES (${userId}, ${input.category}, ${ym}, ${money2(limit)}, ${input.on ? 1 : 0})
        ON DUPLICATE KEY UPDATE rollover = VALUES(rollover)`);
      return { category: input.category, on: input.on };
    }),

  /**
   * "Sugerirme un presupuesto": what was spent on average in each category in the 3 months before this one
   * (only months with bank data count), rounded up to the next $10, next to today's limit.
   */
  suggestBudgets: authedQuery
    .input(budgetMonthInput)
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "budgets", ctx.lang);
      const userId = Number(ctx.user.id);
      const bank = bankRouter.createCaller(ctx);
      const ym = ymOf(input.year, input.month);
      const months: number[] = [];
      for (let m = prevYm(ym), i = 0; i < 3; i++, m = prevYm(m)) months.unshift(m);
      const sources = await budgetSources(db, userId);
      const data = await Promise.all(months.map((m) => monthSpending(bank, Math.floor(m / 100), m % 100)));
      const { avg, used } = averageSpending(data);
      const now = limitsForMonth(sources.history, sources.current, ym);
      const keys = new Set<string>([...now.keys(), ...[...avg.entries()].filter(([, v]) => v > 0).map(([k]) => k)]);
      const rows = [...keys].map((category) => {
        const average = avg.get(category) ?? 0;
        const current = now.get(category) ?? null;
        return { category, current, average: average > 0 ? average : null, suggested: average > 0 ? roundUp10(average) : current };
      }).sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || (b.current ?? 0) - (a.current ?? 0) || a.category.localeCompare(b.category));
      return {
        months: months.filter((_, i) => data[i].hasData).map((m) => ({ year: Math.floor(m / 100), month: m % 100 })),
        used,
        rows,
      };
    }),

  /** Saves several limits at once (the suggestion, or undoing it). */
  applyBudgets: authedQuery
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
      limits: z.array(z.object({ category: budgetCategoryInput, limit: z.number().min(0.01).max(MAX_BUDGET_LIMIT).nullable() })).min(1).max(60),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "budgets", ctx.lang);
      const ym = editableYm(ctx.lang, input.year, input.month);
      for (const l of input.limits) await writeBudget(db, Number(ctx.user.id), l.category, l.limit === null ? null : Math.round(l.limit * 100) / 100, ym);
      const total = input.limits.reduce((s, l) => s + (l.limit ?? 0), 0);
      return { count: input.limits.length, total: Math.round(total * 100) / 100 };
    }),

  // ─── GOALS ───
  // A goal follows a savings account's balance, a card's debt going down, or what the person writes down
  // ("Anotar lo que aparté", personalGoalDeposits). The app never moves money: the bank link is read-only.

  listGoals: authedQuery
    .input(budgetMonthInput.optional())
    .query(async ({ ctx, input }) => {
      if (!ctx.user) return [];
      const db = getDb();
      await ensurePlanTables(db);
      const userId = Number(ctx.user.id);
      const now = new Date();
      const { start, end } = monthBounds(input?.year ?? now.getUTCFullYear(), input?.month ?? now.getUTCMonth() + 1);
      const goals: GoalRow[] = await db.select().from(personalGoals)
        .where(and(eq(personalGoals.userId, userId), sql`COALESCE(${personalGoals.isActive}, 1) = 1`))
        .orderBy(asc(personalGoals.createdAt), asc(personalGoals.id));
      if (goals.length === 0) return [];
      const plans = new Map<number, PlanRow>();
      for (const p of await rawRows<PlanRow>(db, sql`SELECT goalId, kind, track, accountId, monthly, paused FROM personalGoalPlans WHERE userId = ${userId}`)) plans.set(Number(p.goalId), p);
      const deposits = new Map<number, number>();
      for (const d of await rawRows<{ goalId: number; total: string }>(db, sql`
        SELECT goalId, SUM(amount) AS total FROM personalGoalDeposits WHERE userId = ${userId} AND depositOn BETWEEN ${start} AND ${end} GROUP BY goalId`)) {
        deposits.set(Number(d.goalId), Number(d.total) || 0);
      }
      const accounts = await userAccounts(db, userId);
      // Money that went into each followed savings account this month (deposits minus withdrawals).
      const followed = [...new Set([...plans.values()].filter((p) => p.track === "acct" && p.accountId).map((p) => Number(p.accountId)))];
      const netIn = new Map<number, number>();
      for (const accountId of followed) {
        const r = await rawRows<{ net: string | null }>(db, sql`
          SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS net FROM bankTransactions
          WHERE userId = ${userId} AND bankAccountId = ${accountId} AND transactionDate BETWEEN ${start} AND ${end}`);
        netIn.set(accountId, Number(r[0]?.net) || 0);
      }
      return goals.map((g) => {
        const p = plans.get(g.id);
        const track: "manual" | "acct" | "debt" = p?.track === "acct" || p?.track === "debt" ? p.track : "manual";
        const acc = p?.accountId ? accounts.find((a) => a.id === Number(p.accountId)) ?? null : null;
        const target = Number(g.targetAmount) || 0;
        let current = Number(g.currentAmount) || 0;
        let owed: number | null = null;
        let month = deposits.get(g.id) ?? 0;
        if (track === "acct" && acc) {
          current = Math.max(0, Number(acc.currentBalance) || 0);
          month = Math.max(0, netIn.get(acc.id) ?? 0);
        } else if (track === "debt" && acc) {
          owed = Math.max(0, Number(acc.currentBalance) || 0);
          current = Math.max(0, target - owed);
          month = 0;
        }
        return {
          ...g,
          currentAmount: money2(current),
          kind: (p?.kind === "debt" ? "debt" : "save") as "save" | "debt",
          track,
          accountId: acc?.id ?? null,
          account: acc ? { id: acc.id, name: acctLabel(acc), bankName: acc.bankName, mask: acc.accountNumber ? String(acc.accountNumber).slice(-4) : null } : null,
          /** The followed account is gone (disconnected): the goal keeps its last saved amount. */
          accountMissing: track !== "manual" && !acc,
          monthly: p?.monthly === null || p?.monthly === undefined ? null : Number(p.monthly),
          paused: !!Number(p?.paused ?? 0),
          month: Math.round(month * 100) / 100,
          owed,
        };
      });
    }),

  /** The accounts a goal can follow, and what a month of spending comes to (for the emergency fund). */
  goalOptions: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    await ensurePlanTables(db);
    const userId = Number(ctx.user.id);
    const accounts = (await userAccounts(db, userId)).filter((a) => a.isActive !== false);
    const used = await rawRows<{ accountId: number; track: string; name: string }>(db, sql`
      SELECT p.accountId, p.track, g.name FROM personalGoalPlans p JOIN personalGoals g ON g.id = p.goalId
      WHERE p.userId = ${userId} AND p.accountId IS NOT NULL AND COALESCE(g.isActive, 1) = 1`);
    const usedBy = (id: number, track: string) => used.find((u) => Number(u.accountId) === id && u.track === track)?.name ?? null;
    // Monthly spending over the last 3 full months with bank data (money moved between accounts doesn't count).
    const now = new Date();
    const fromD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
    const from = fromD.toISOString().slice(0, 10);
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
    const spent = await rawRows<{ ym: string; total: string }>(db, sql`
      SELECT DATE_FORMAT(transactionDate, '%Y-%m') AS ym, SUM(amount) AS total FROM bankTransactions
      WHERE userId = ${userId} AND type = 'expense' AND category <> 'transfer' AND transactionDate BETWEEN ${from} AND ${to}
      GROUP BY DATE_FORMAT(transactionDate, '%Y-%m')`);
    const monthly = spent.length ? spent.reduce((s, r) => s + (Number(r.total) || 0), 0) / spent.length : null;
    return {
      savings: accounts.filter(isSavings).map((a) => ({ id: a.id, name: acctLabel(a), balance: Number(a.currentBalance) || 0, usedBy: usedBy(a.id, "acct") })),
      cards: accounts.filter(isCard).map((a) => ({ id: a.id, name: acctLabel(a), owed: Math.max(0, Number(a.currentBalance) || 0), usedBy: usedBy(a.id, "debt") })),
      monthlySpending: monthly === null ? null : Math.round(monthly * 100) / 100,
      monthsUsed: spent.length,
    };
  }),

  createGoal: authedQuery
    .input(z.object({
      name: z.string().trim().min(1).max(100),
      targetAmount: z.number().positive().max(MAX_BUDGET_LIMIT),
      deadline: z.string().optional(),
      category: z.string().max(50).default("savings"),
      ...goalPlanInput,
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("No autenticado");
      const db = getDb();
      await ensurePlanTables(db);
      const userId = Number(ctx.user.id);
      const track = input.track ?? (input.kind === "debt" ? "debt" : "manual");
      if (track !== "manual") await checkGoalAccount(db, userId, track, input.accountId, ctx.lang);
      const result = await db.insert(personalGoals).values({
        userId,
        name: input.name,
        targetAmount: String(input.targetAmount.toFixed(2)),
        deadline: input.deadline || undefined,
        category: input.category,
      });
      const id = Number(result[0].insertId);
      if (input.monthly !== undefined || input.track || input.kind) {
        await db.execute(sql`INSERT INTO personalGoalPlans (goalId, userId, kind, track, accountId, monthly)
          VALUES (${id}, ${userId}, ${track === "debt" ? "debt" : "save"}, ${track}, ${track === "manual" ? null : input.accountId ?? null}, ${input.monthly ? money2(input.monthly) : null})`);
      }
      return { id };
    }),

  /** Changes a goal: name, amount, monthly saving, date and how it's followed. */
  editGoal: authedQuery
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1).max(100),
      targetAmount: z.number().positive().max(MAX_BUDGET_LIMIT),
      deadline: dayInput.nullable(),
      ...goalPlanInput,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensurePlanTables(db);
      const userId = Number(ctx.user.id);
      await ownGoal(db, userId, input.id);
      const plan = await planOf(db, userId, input.id);
      const track = input.track ?? (plan?.track === "acct" || plan?.track === "debt" ? plan.track : "manual");
      const accountId = track === "manual" ? null : input.accountId ?? (plan?.accountId ? Number(plan.accountId) : null);
      if (track !== "manual") await checkGoalAccount(db, userId, track, accountId, ctx.lang, input.id);
      await db.update(personalGoals).set({ name: input.name, targetAmount: money2(input.targetAmount), deadline: input.deadline })
        .where(and(eq(personalGoals.id, input.id), eq(personalGoals.userId, userId)));
      const monthly = input.monthly === undefined ? (plan?.monthly ?? null) : input.monthly ? money2(input.monthly) : null;
      await db.execute(sql`INSERT INTO personalGoalPlans (goalId, userId, kind, track, accountId, monthly, paused)
        VALUES (${input.id}, ${userId}, ${track === "debt" ? "debt" : "save"}, ${track}, ${accountId}, ${monthly}, ${Number(plan?.paused ?? 0)})
        ON DUPLICATE KEY UPDATE kind = VALUES(kind), track = VALUES(track), accountId = VALUES(accountId), monthly = VALUES(monthly)`);
      return { ok: true };
    }),

  /** Pausar / Reanudar: a paused goal doesn't count in what you set aside this month. */
  setGoalPaused: authedQuery
    .input(z.object({ id: z.number().int().positive(), paused: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensurePlanTables(db);
      const userId = Number(ctx.user.id);
      await ownGoal(db, userId, input.id);
      await db.execute(sql`INSERT INTO personalGoalPlans (goalId, userId, paused) VALUES (${input.id}, ${userId}, ${input.paused ? 1 : 0})
        ON DUPLICATE KEY UPDATE paused = VALUES(paused)`);
      return { ok: true, paused: input.paused };
    }),

  /** Borrar (with undo): the goal is hidden; restoreGoal brings it back with everything it had. */
  archiveGoal: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = getDb();
    await ownGoal(db, Number(ctx.user.id), input.id);
    await db.update(personalGoals).set({ isActive: false }).where(and(eq(personalGoals.id, input.id), eq(personalGoals.userId, Number(ctx.user.id))));
    return { ok: true };
  }),
  restoreGoal: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = getDb();
    await ownGoal(db, Number(ctx.user.id), input.id);
    await db.update(personalGoals).set({ isActive: true }).where(and(eq(personalGoals.id, input.id), eq(personalGoals.userId, Number(ctx.user.id))));
    return { ok: true };
  }),

  /** "Anotar lo que aparté": a deposit to a goal followed by hand. Returns its id (for undo). */
  addDeposit: authedQuery
    .input(z.object({ goalId: z.number().int().positive(), amount: z.number().min(0.01).max(MAX_BUDGET_LIMIT), date: dayInput }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensurePlanTables(db);
      const userId = Number(ctx.user.id);
      const goal = (await db.select({ id: personalGoals.id, currentAmount: personalGoals.currentAmount, targetAmount: personalGoals.targetAmount }).from(personalGoals)
        .where(and(eq(personalGoals.id, input.goalId), eq(personalGoals.userId, userId), sql`COALESCE(${personalGoals.isActive}, 1) = 1`)).limit(1))[0];
      if (!goal) throw new TRPCError({ code: "NOT_FOUND" });
      const plan = await planOf(db, userId, input.goalId);
      if (plan && plan.track !== "manual") {
        throw new TRPCError({ code: "BAD_REQUEST", message: ctx.lang === "en" ? "This goal follows an account: it updates by itself." : "Esta meta sigue una cuenta: se actualiza sola." });
      }
      const amount = money2(input.amount);
      const r = (await db.execute(sql`INSERT INTO personalGoalDeposits (goalId, userId, amount, depositOn) VALUES (${input.goalId}, ${userId}, ${amount}, ${input.date})`)) as unknown as [{ insertId: number }];
      await db.update(personalGoals).set({ currentAmount: sql`${personalGoals.currentAmount} + ${amount}` })
        .where(and(eq(personalGoals.id, input.goalId), eq(personalGoals.userId, userId)));
      const before = Number(goal.currentAmount) || 0;
      return { id: Number(r[0].insertId), before, after: Math.round((before + Number(amount)) * 100) / 100, target: Number(goal.targetAmount) || 0 };
    }),

  /** Undoes a deposit. */
  undoDeposit: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = getDb();
    await ensurePlanTables(db);
    const userId = Number(ctx.user.id);
    const dep = (await rawRows<{ id: number; goalId: number; amount: string }>(db, sql`SELECT id, goalId, amount FROM personalGoalDeposits WHERE id = ${input.id} AND userId = ${userId}`))[0];
    if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
    await db.execute(sql`DELETE FROM personalGoalDeposits WHERE id = ${dep.id} AND userId = ${userId}`);
    await db.update(personalGoals).set({ currentAmount: sql`GREATEST(0, ${personalGoals.currentAmount} - ${dep.amount})` })
      .where(and(eq(personalGoals.id, Number(dep.goalId)), eq(personalGoals.userId, userId)));
    return { ok: true };
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
      const userId = Number(ctx.user.id);
      await ownGoal(db, userId, input.id);
      await db.delete(personalGoals).where(and(eq(personalGoals.id, input.id), eq(personalGoals.userId, userId)));
      await ensurePlanTables(db);
      await db.execute(sql`DELETE FROM personalGoalPlans WHERE goalId = ${input.id} AND userId = ${userId}`);
      await db.execute(sql`DELETE FROM personalGoalDeposits WHERE goalId = ${input.id} AND userId = ${userId}`);
      return { success: true };
    }),
});
