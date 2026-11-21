// Read-only tools the assistant uses to answer questions about the user's own money.
// Every query is scoped to the asking user's id; nothing here writes data.
import { z } from "zod";
import { and, desc, eq, gte, like, lte, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { bankTransactions, expenses, personalGoals, sales } from "@db/schema";
import type { getDb } from "../queries/connection";

type Db = ReturnType<typeof getDb>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const range = z.object({
  from: isoDate.describe("First day, YYYY-MM-DD"),
  to: isoDate.describe("Last day, YYYY-MM-DD (inclusive)"),
});

const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
/** A DATE column as "YYYY-MM-DD", formatted by MySQL so no time zone can shift the day. */
const ymd = (col: AnyMySqlColumn) => sql<string>`DATE_FORMAT(${col}, '%Y-%m-%d')`;
const json = (v: unknown) => JSON.stringify(v);

/** Bank movements: income, spending and the categories they fall in (both modes). */
function bankTools(db: Db, userId: number) {
  return [
    betaZodTool({
      name: "get_bank_summary",
      description:
        "Totals of the user's connected bank accounts for a date range: money in, money out, and money out by category (Plaid-synced movements). Use for 'how much did I spend/earn', category questions and comparisons between periods.",
      inputSchema: range,
      run: async ({ from, to }) => {
        type Row = { type: string; category: string; total: string; n: number };
        const rows: Row[] = await db
          .select({ type: bankTransactions.type, category: bankTransactions.category, total: sql<string>`sum(${bankTransactions.amount})`, n: sql<number>`count(*)` })
          .from(bankTransactions)
          .where(and(eq(bankTransactions.userId, userId), sql`${bankTransactions.transactionDate} >= ${from}`, sql`${bankTransactions.transactionDate} <= ${to}`))
          .groupBy(bankTransactions.type, bankTransactions.category);
        const income = rows.filter((r) => r.type === "income").reduce((s, r) => s + money(r.total), 0);
        const spending = rows.filter((r) => r.type === "expense").reduce((s, r) => s + money(r.total), 0);
        return json({
          from, to,
          moneyIn: money(income),
          moneyOut: money(spending),
          byCategory: rows.map((r) => ({ type: r.type, category: r.category, total: money(r.total), count: Number(r.n) })).sort((a, b) => b.total - a.total),
          note: rows.length === 0 ? "No bank movements in this range (the bank may not be connected or synced)." : undefined,
        });
      },
    }),
    betaZodTool({
      name: "list_bank_transactions",
      description: "Individual bank movements in a date range, newest first. Optionally filter by text in the description (merchant), by type, or by category.",
      inputSchema: range.extend({
        search: z.string().max(60).optional().describe("Text to find in the description, e.g. a merchant name"),
        type: z.enum(["income", "expense"]).optional(),
        category: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(50).optional().describe("Max rows, default 20"),
      }),
      run: async ({ from, to, search, type, category, limit }) => {
        const conds = [eq(bankTransactions.userId, userId), sql`${bankTransactions.transactionDate} >= ${from}`, sql`${bankTransactions.transactionDate} <= ${to}`];
        if (search) conds.push(like(bankTransactions.description, `%${search.replace(/[%_\\]/g, "")}%`));
        if (type) conds.push(eq(bankTransactions.type, type));
        if (category) conds.push(sql`${bankTransactions.category} = ${category}`);
        type Row = { date: string; description: string; amount: string; type: string; category: string };
        const rows: Row[] = await db
          .select({ date: ymd(bankTransactions.transactionDate), description: bankTransactions.description, amount: bankTransactions.amount, type: bankTransactions.type, category: bankTransactions.category })
          .from(bankTransactions).where(and(...conds)).orderBy(desc(bankTransactions.transactionDate)).limit(limit ?? 20);
        return json(rows.map((r) => ({ ...r, amount: money(r.amount) })));
      },
    }),
  ];
}

/** Sales and expenses recorded in the app (business mode). */
function businessTools(db: Db, userId: number) {
  return [
    betaZodTool({
      name: "get_sales_summary",
      description: "Completed sales recorded in the app for a date range: total, number of sales, average ticket, by payment method, and the top clients.",
      inputSchema: range,
      run: async ({ from, to }) => {
        const where = and(
          eq(sales.createdBy, userId), eq(sales.status, "completed"),
          gte(sales.createdAt, new Date(`${from}T00:00:00`)), lte(sales.createdAt, new Date(`${to}T23:59:59`)),
        );
        type ByMethod = { method: string; total: string; n: number };
        const byMethod: ByMethod[] = await db.select({ method: sales.paymentMethod, total: sql<string>`sum(${sales.total})`, n: sql<number>`count(*)` })
          .from(sales).where(where).groupBy(sales.paymentMethod);
        type ByClient = { client: string | null; total: string; n: number };
        const byClient: ByClient[] = await db.select({ client: sales.customerName, total: sql<string>`sum(${sales.total})`, n: sql<number>`count(*)` })
          .from(sales).where(where).groupBy(sales.customerName).orderBy(desc(sql`sum(${sales.total})`)).limit(5);
        const total = byMethod.reduce((s, r) => s + money(r.total), 0);
        const count = byMethod.reduce((s, r) => s + Number(r.n), 0);
        return json({
          from, to, total: money(total), count, averageTicket: count ? money(total / count) : 0,
          byPaymentMethod: byMethod.map((r) => ({ method: r.method, total: money(r.total), count: Number(r.n) })),
          topClients: byClient.map((r) => ({ client: r.client || "(sin cliente)", total: money(r.total), count: Number(r.n) })),
        });
      },
    }),
    betaZodTool({
      name: "get_expenses_summary",
      description: "Expenses recorded in the app for a date range, by category, with the largest individual expenses.",
      inputSchema: range,
      run: async ({ from, to }) => {
        const where = and(sql`${expenses.createdBy} = ${userId}`, sql`${expenses.date} >= ${from}`, sql`${expenses.date} <= ${to}`);
        type ByCat = { category: string; total: string; n: number };
        const byCat: ByCat[] = await db.select({ category: expenses.category, total: sql<string>`sum(${expenses.amount})`, n: sql<number>`count(*)` })
          .from(expenses).where(where).groupBy(expenses.category);
        type Top = { date: string; description: string; category: string; amount: string };
        const top: Top[] = await db.select({ date: ymd(expenses.date), description: expenses.description, category: expenses.category, amount: expenses.amount })
          .from(expenses).where(where).orderBy(desc(expenses.amount)).limit(5);
        return json({
          from, to,
          total: money(byCat.reduce((s, r) => s + money(r.total), 0)),
          byCategory: byCat.map((r) => ({ category: r.category, total: money(r.total), count: Number(r.n) })).sort((a, b) => b.total - a.total),
          largest: top.map((r) => ({ ...r, amount: money(r.amount) })),
        });
      },
    }),
  ];
}

/** Savings goals (personal mode). */
function personalTools(db: Db, userId: number) {
  return [
    betaZodTool({
      name: "get_goals",
      description: "The user's savings goals: target, saved so far, progress and deadline.",
      inputSchema: z.object({}),
      run: async () => {
        type Goal = { name: string; target: string; current: string; deadline: string | null; active: boolean | null };
        const rows: Goal[] = await db.select({ name: personalGoals.name, target: personalGoals.targetAmount, current: personalGoals.currentAmount, deadline: ymd(personalGoals.deadline), active: personalGoals.isActive })
          .from(personalGoals).where(eq(personalGoals.userId, userId));
        return json(rows.map((g) => ({
          name: g.name, target: money(g.target), saved: money(g.current),
          progressPercent: money(g.target) > 0 ? Math.round((money(g.current) / money(g.target)) * 100) : 0,
          deadline: g.deadline, active: g.active !== false,
        })));
      },
    }),
  ];
}

/** The tools for this user's mode. */
export function assistantTools(db: Db, userId: number, mode: "business" | "personal") {
  return [...bankTools(db, userId), ...(mode === "business" ? businessTools(db, userId) : personalTools(db, userId))];
}
