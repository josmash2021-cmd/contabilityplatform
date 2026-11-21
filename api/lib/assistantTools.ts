// Read-only tools the assistant uses to answer questions about the user's own money.
// Every query is scoped to the asking user's id; nothing here writes data.
// Each call is recorded (name, input, result) so the answer can say where its numbers came from:
// sourcesFromCalls() turns those calls into links to the app's screens and records.
import { z } from "zod";
import { and, desc, eq, gte, isNotNull, like, lte, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { bankTransactions, expenses, personalCategories, personalGoals, sales } from "@db/schema";
import { bills, vendors } from "@db/vendorsSchema";
import type { getDb } from "../queries/connection";
import { isMissingTable } from "./dbErrors";
import { budgetPercent, budgetStatus, spendingByCategory } from "./budgets";

type Db = ReturnType<typeof getDb>;
export type AssistantMode = "business" | "personal";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const range = z.object({
  from: isoDate.describe("First day, YYYY-MM-DD"),
  to: isoDate.describe("Last day, YYYY-MM-DD (inclusive)"),
});

const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
/** A DATE column as "YYYY-MM-DD", formatted by MySQL so no time zone can shift the day. */
const ymd = (col: AnyMySqlColumn) => sql<string>`DATE_FORMAT(${col}, '%Y-%m-%d')`;
const json = (v: unknown) => JSON.stringify(v);

// ── Recording the calls (for the sources under each answer) ──

/** One tool call the model made while answering, with what the tool gave back. */
export type ToolCall = { name: string; input: Record<string, unknown>; output: unknown };
export type CallRecorder = (call: ToolCall) => void;

/** A betaZodTool whose result is also handed to `record` (parsed back from the JSON the model sees). */
function recorded<S extends z.ZodType>(
  record: CallRecorder | undefined,
  def: { name: string; description: string; inputSchema: S; run: (args: z.infer<S>) => Promise<string> },
) {
  return betaZodTool({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    run: async (args: z.infer<S>) => {
      const out = await def.run(args);
      if (record) {
        let parsed: unknown = out;
        try { parsed = JSON.parse(out); } catch { /* plain text result */ }
        record({ name: def.name, input: (args ?? {}) as Record<string, unknown>, output: parsed });
      }
      return out;
    },
  });
}

// ── Shared queries (also used by the weekly summary, which never calls the model) ──

export type Receivable = { saleId: number; client: string; balance: number; dueDate: string | null; late: boolean };

/**
 * What clients still owe: pending sales (an issued invoice is a sale), less what was already paid on them.
 * The invoice tables are created on first use, so without them the sale total is the balance and there's no due date.
 */
export async function receivablesOf(db: Db, userId: number, today: string): Promise<Receivable[]> {
  type Row = { id: number; client: string | null; total: string; paid: string | null; dueDate: string | null };
  let rows: Row[];
  try {
    const res = await db.execute(sql`
      SELECT s.id, s.customerName AS client, s.total,
        (SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END) FROM invoicePayments p WHERE p.saleId = s.id AND p.userId = ${userId}) AS paid,
        DATE_FORMAT(i.dueDate, '%Y-%m-%d') AS dueDate
      FROM sales s LEFT JOIN invoices i ON i.saleId = s.id AND i.userId = ${userId}
      WHERE s.createdBy = ${userId} AND s.status = 'pending'
      ORDER BY s.createdAt ASC LIMIT 200`);
    rows = (res as unknown as [Row[]])[0];
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    rows = await db.select({ id: sales.id, client: sales.customerName, total: sales.total, paid: sql<string | null>`NULL`, dueDate: sql<string | null>`NULL` })
      .from(sales).where(and(eq(sales.createdBy, userId), eq(sales.status, "pending"))).orderBy(sales.createdAt).limit(200);
  }
  return rows
    .map((r) => {
      const balance = Math.max(0, money(money(r.total) - money(r.paid)));
      const dueDate = r.dueDate || null;
      return { saleId: Number(r.id), client: r.client || "", balance, dueDate, late: dueDate !== null && dueDate < today };
    })
    .filter((r) => r.balance > 0);
}

export type BillDue = { id: number; vendor: string; amount: number; dueDate: string; late: boolean };

/** Unpaid vendor bills due on or before `until` (late ones included). Nothing when Proveedores was never used. */
export async function billsDueOf(db: Db, userId: number, today: string, until: string): Promise<BillDue[]> {
  try {
    type Row = { id: number; vendor: string | null; amount: string; dueDate: string };
    const rows: Row[] = await db.select({ id: bills.id, vendor: vendors.name, amount: bills.amount, dueDate: sql<string>`DATE_FORMAT(${bills.dueDate}, '%Y-%m-%d')` })
      .from(bills).leftJoin(vendors, eq(vendors.id, bills.vendorId))
      .where(and(eq(bills.userId, userId), eq(bills.status, "unpaid"), sql`${bills.dueDate} <= ${until}`))
      .orderBy(bills.dueDate).limit(50);
    return rows.map((b) => ({ id: Number(b.id), vendor: b.vendor ?? "", amount: money(b.amount), dueDate: b.dueDate, late: b.dueDate < today }));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

// ── The tools ──

/** Bank movements: income, spending and the categories they fall in (both modes). */
function bankTools(db: Db, userId: number, record?: CallRecorder) {
  return [
    recorded(record, {
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
          count: rows.reduce((s, r) => s + Number(r.n), 0),
          byCategory: rows.map((r) => ({ type: r.type, category: r.category, total: money(r.total), count: Number(r.n) })).sort((a, b) => b.total - a.total),
          note: rows.length === 0 ? "No bank movements in this range (the bank may not be connected or synced)." : undefined,
        });
      },
    }),
    recorded(record, {
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
        type Row = { id: number; date: string; description: string; amount: string; type: string; category: string; accountId: number | null };
        const rows: Row[] = await db
          .select({ id: bankTransactions.id, date: ymd(bankTransactions.transactionDate), description: bankTransactions.description, amount: bankTransactions.amount, type: bankTransactions.type, category: bankTransactions.category, accountId: bankTransactions.bankAccountId })
          .from(bankTransactions).where(and(...conds)).orderBy(desc(bankTransactions.transactionDate)).limit(limit ?? 20);
        return json({ from, to, movements: rows.map((r) => ({ ...r, id: Number(r.id), amount: money(r.amount) })) });
      },
    }),
  ];
}

/** Sales, expenses, what clients owe and vendor bills (business mode). */
function businessTools(db: Db, userId: number, today: string, record?: CallRecorder) {
  return [
    recorded(record, {
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
    recorded(record, {
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
          count: byCat.reduce((s, r) => s + Number(r.n), 0),
          byCategory: byCat.map((r) => ({ category: r.category, total: money(r.total), count: Number(r.n) })).sort((a, b) => b.total - a.total),
          largest: top.map((r) => ({ ...r, amount: money(r.amount) })),
        });
      },
    }),
    recorded(record, {
      name: "get_receivables",
      description: "Who owes the business money right now: unpaid invoices and pending sales, with the balance still owed, the due date and whether it's late. Use for 'who owes me', 'what's overdue', 'how much am I owed'.",
      inputSchema: z.object({}),
      run: async () => {
        const list = await receivablesOf(db, userId, today);
        return json({
          today,
          totalOwed: money(list.reduce((s, r) => s + r.balance, 0)),
          count: list.length,
          lateCount: list.filter((r) => r.late).length,
          invoices: list.sort((a, b) => Number(b.late) - Number(a.late) || b.balance - a.balance).slice(0, 25),
        });
      },
    }),
    recorded(record, {
      name: "get_bills_due",
      description: "Unpaid vendor bills (Proveedores) due on or before a date, including late ones. Use for 'what do I have to pay this week', 'what do I owe my vendors'.",
      inputSchema: z.object({ until: isoDate.describe("Last due date to include, YYYY-MM-DD") }),
      run: async ({ until }) => {
        const list = await billsDueOf(db, userId, today, until);
        return json({ today, until, total: money(list.reduce((s, b) => s + b.amount, 0)), count: list.length, bills: list });
      },
    }),
  ];
}

/** Savings goals and category budgets (personal mode). */
function personalTools(db: Db, userId: number, today: string, record?: CallRecorder) {
  return [
    recorded(record, {
      name: "get_goals",
      description: "The user's savings goals: target, saved so far, progress and deadline.",
      inputSchema: z.object({}),
      run: async () => {
        type Goal = { name: string; target: string; current: string; deadline: string | null; active: boolean | null };
        const rows: Goal[] = await db.select({ name: personalGoals.name, target: personalGoals.targetAmount, current: personalGoals.currentAmount, deadline: ymd(personalGoals.deadline), active: personalGoals.isActive })
          .from(personalGoals).where(eq(personalGoals.userId, userId));
        return json({
          goals: rows.map((g) => ({
            name: g.name, target: money(g.target), saved: money(g.current),
            progressPercent: money(g.target) > 0 ? Math.round((money(g.current) / money(g.target)) * 100) : 0,
            deadline: g.deadline, active: g.active !== false,
          })),
        });
      },
    }),
    recorded(record, {
      name: "get_budgets",
      description: "This month's category budgets: the monthly limit, what was spent so far and whether it is near or over the limit.",
      inputSchema: z.object({}),
      run: async () => {
        const month = today.slice(0, 7);
        type Limit = { name: string; limit: string | null };
        const limits: Limit[] = await db.select({ name: personalCategories.name, limit: personalCategories.budgetLimit })
          .from(personalCategories).where(and(eq(personalCategories.userId, userId), isNotNull(personalCategories.budgetLimit)));
        type Tx = { type: string; category: string; amount: string };
        const txs: Tx[] = await db.select({ type: bankTransactions.type, category: bankTransactions.category, amount: bankTransactions.amount })
          .from(bankTransactions).where(and(eq(bankTransactions.userId, userId), sql`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m') = ${month}`));
        const spent = spendingByCategory(txs);
        return json({
          month,
          budgets: limits.map((l) => ({ category: l.name, limit: money(l.limit) })).filter((l) => l.limit > 0).map((l) => {
            const s = spent.get(l.category) ?? 0;
            return { ...l, spent: s, percent: budgetPercent(s, l.limit), status: budgetStatus(s, l.limit) };
          }),
        });
      },
    }),
  ];
}

/** The tools for this user's mode. `record` hears every call, for the sources under the answer. */
export function assistantTools(db: Db, userId: number, mode: AssistantMode, today: string, record?: CallRecorder) {
  return [...bankTools(db, userId, record), ...(mode === "business" ? businessTools(db, userId, today, record) : personalTools(db, userId, today, record))];
}

// ── Sources: where the numbers in an answer came from ──

export type SourceKind = "bank" | "bankTx" | "sales" | "expenses" | "receivables" | "invoice" | "bills" | "goals" | "budgets";
/** Facts only (the page turns them into words in the user's language) and the screen to open. */
export type AssistantSource = { kind: SourceKind; path: string; from?: string; to?: string; count?: number; name?: string; amount?: number };

/** At most this many links under one answer. */
export const MAX_SOURCES = 6;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** "/personal/transactions?year=2026&month=11" when the range sits inside one month (that screen opens on it). */
function personalMonthPath(from?: string, to?: string): string {
  if (from && to && from.slice(0, 7) === to.slice(0, 7) && /^\d{4}-\d{2}$/.test(from.slice(0, 7))) {
    return `/personal/transactions?year=${Number(from.slice(0, 4))}&month=${Number(from.slice(5, 7))}`;
  }
  return "/personal/transactions";
}

/**
 * Turns the tool calls behind an answer into links: the screen each number lives on, and for
 * money owed, the invoices themselves. Calls that found nothing don't become a source.
 */
export function sourcesFromCalls(calls: readonly ToolCall[], mode: AssistantMode): AssistantSource[] {
  const out: AssistantSource[] = [];
  const seen = new Set<string>();
  const add = (s: AssistantSource) => {
    const key = `${s.kind}|${s.path}|${s.from ?? ""}|${s.to ?? ""}`;
    if (seen.has(key) || out.length >= MAX_SOURCES) return;
    seen.add(key);
    out.push(s);
  };
  for (const c of calls) {
    const o = obj(c.output);
    const from = str(o.from) ?? str(c.input.from);
    const to = str(o.to) ?? str(c.input.to);
    switch (c.name) {
      case "get_bank_summary":
        if ((num(o.count) ?? arr(o.byCategory).length) > 0) add({ kind: "bank", path: mode === "business" ? "/bank" : personalMonthPath(from, to), from, to });
        break;
      case "list_bank_transactions": {
        const n = arr(o.movements).length;
        if (n > 0) add({ kind: "bankTx", path: mode === "business" ? "/bank" : personalMonthPath(from, to), from, to, count: n });
        break;
      }
      case "get_sales_summary":
        if ((num(o.count) ?? 0) > 0) add({ kind: "sales", path: "/reports", from, to, count: num(o.count) });
        break;
      case "get_expenses_summary":
        if ((num(o.count) ?? arr(o.byCategory).length) > 0) add({ kind: "expenses", path: "/reports", from, to, count: num(o.count) });
        break;
      case "get_receivables": {
        const list = arr(o.invoices).map(obj);
        if (list.length === 0) break;
        add({ kind: "receivables", path: "/invoices", count: num(o.count) ?? list.length, amount: num(o.totalOwed) });
        for (const r of list.slice(0, 3)) {
          const id = num(r.saleId);
          if (id) add({ kind: "invoice", path: `/invoices?id=s${id}`, name: str(r.client), amount: num(r.balance) });
        }
        break;
      }
      case "get_bills_due":
        if ((num(o.count) ?? 0) > 0) add({ kind: "bills", path: "/vendors", count: num(o.count), amount: num(o.total) });
        break;
      case "get_goals":
        if (arr(o.goals).length > 0) add({ kind: "goals", path: "/personal/goals", count: arr(o.goals).length });
        break;
      case "get_budgets":
        if (arr(o.budgets).length > 0) add({ kind: "budgets", path: "/personal/budgets", count: arr(o.budgets).length });
        break;
    }
  }
  return out;
}

/** Parses sources saved with a message; anything malformed is dropped (never shown as a broken link). */
export function parseSources(raw: unknown): AssistantSource[] {
  if (typeof raw !== "string" || !raw) return [];
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return []; }
  const kinds: readonly string[] = ["bank", "bankTx", "sales", "expenses", "receivables", "invoice", "bills", "goals", "budgets"];
  return arr(v).map(obj).filter((s) => typeof s.kind === "string" && kinds.includes(s.kind) && typeof s.path === "string" && s.path.startsWith("/") && !s.path.startsWith("//"))
    .slice(0, MAX_SOURCES)
    .map((s) => ({ kind: s.kind as SourceKind, path: s.path as string, from: str(s.from), to: str(s.to), count: num(s.count), name: str(s.name), amount: num(s.amount) }));
}

// ── The week, for the summary card ──

/** Days as "YYYY-MM-DD" (UTC math, so no time zone moves them). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Last week, Monday to Sunday, for a given today (also "YYYY-MM-DD"). On a Monday, it's the 7 days before. */
export function lastWeek(today: string): { from: string; to: string; monday: string } {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  const monday = addDays(today, -sinceMonday);
  return { from: addDays(monday, -7), to: addDays(monday, -1), monday };
}
