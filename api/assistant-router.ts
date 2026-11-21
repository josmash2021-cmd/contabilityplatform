// ── Asistente de inteligencia artificial ──
// Answers questions about the user's own money with Claude, using read-only tools
// (api/lib/assistantTools.ts). Each plan has a monthly number of questions
// ("límite xN", N × 20 — contracts/planFeatures.ts). Needs ANTHROPIC_API_KEY.
// Every answer keeps its sources: the screens and records its numbers came from (the tool calls).
// The weekly summary is worked out here from the user's data, without the model and without
// using a question; asking the assistant for one is an ordinary question.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { assistantMessages, bankTransactions, expenses, personalCategories, personalGoals, sales } from "@db/schema";
import { assistantMonthlyLimit } from "@contracts/planFeatures";
import { getPlanContext } from "./lib/planAccess";
import {
  addDays, assistantTools, billsDueOf, lastWeek, parseSources, receivablesOf, sourcesFromCalls, type AssistantSource, type ToolCall,
} from "./lib/assistantTools";
import { budgetStatus, spendingByCategory } from "./lib/budgets";
import { msg } from "./lib/i18n";

type Db = ReturnType<typeof getDb>;

const MODEL = "claude-opus-5-5";
/** Earlier messages sent along with each question, so follow-ups ("¿y el mes pasado?") make sense. */
const HISTORY_MESSAGES = 10;

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

let tablesReady: Promise<void> | null = null;
function ensureAssistantTables(db: Db): Promise<void> {
  tablesReady ??= (db.execute(sql`
    CREATE TABLE IF NOT EXISTS assistantMessages (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      userId BIGINT UNSIGNED NOT NULL,
      role ENUM('user', 'assistant') NOT NULL,
      content TEXT NOT NULL,
      hidden BOOLEAN NOT NULL DEFAULT FALSE,
      sources TEXT NULL,
      createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
      INDEX assistantMessages_user_idx (userId, createdAt)
    )
  `) as Promise<unknown>)
    // Tables made before answers kept their sources get the column (additive; "duplicate column" means it's there).
    .then(() => (db.execute(sql`ALTER TABLE assistantMessages ADD COLUMN sources TEXT NULL`) as Promise<unknown>).catch((e: unknown) => {
      if (!isDuplicateColumn(e)) throw e;
    }))
    .then(() => undefined).catch((e: unknown) => {
      tablesReady = null;
      throw e;
    });
  return tablesReady as Promise<void>;
}

function isDuplicateColumn(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
    const err = cur as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (err.code === "ER_DUP_FIELDNAME" || err.errno === 1060) return true;
    if (typeof err.message === "string" && /Duplicate column/i.test(err.message)) return true;
    cur = err.cause;
  }
  return false;
}

type MessageRow = { id: number; role: "user" | "assistant"; content: string; sources: string | null; createdAt: Date };
/** The visible conversation, oldest first, with each answer's sources. */
async function visibleMessages(db: Db, userId: number, limit: number) {
  const res = await db.execute(sql`
    SELECT id, role, content, sources, createdAt FROM assistantMessages
    WHERE userId = ${userId} AND hidden = FALSE ORDER BY id DESC LIMIT ${limit}`);
  const rows = (res as unknown as [MessageRow[]])[0];
  return rows.reverse().map((m) => ({ id: Number(m.id), role: m.role, content: m.content, createdAt: m.createdAt, sources: m.role === "assistant" ? parseSources(m.sources) : [] }));
}

/** First instant of the current calendar month (UTC): the monthly count starts over here. */
export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Questions asked this month. Clearing the chat hides messages but still counts them. */
async function questionsThisMonth(db: Db, userId: number): Promise<number> {
  const rows: { n: number }[] = await db.select({ n: sql<number>`count(*)` }).from(assistantMessages)
    .where(and(eq(assistantMessages.userId, userId), eq(assistantMessages.role, "user"), gte(assistantMessages.createdAt, monthStart())));
  return Number(rows[0]?.n ?? 0);
}

export function systemPrompt(mode: "business" | "personal", today: string): string {
  const who = mode === "business"
    ? "a small-business owner (often a one-person or family business: sales at a point of sale, clients, services, expenses, a connected bank)"
    : "a person managing their household money (a connected bank, spending by category, subscriptions, savings goals)";
  return `You are the assistant inside Personal & Business Solutions, an accounting and personal-finance app. You are talking with ${who}.

How to answer:
- Reply in the language the person writes in (usually Spanish, sometimes English). Be warm, plain and short: a few sentences or a short list. No jargon; explain any accounting word you must use.
- For any number about their money, call the tools and use what they return. Never guess or invent amounts, dates or merchants. If a tool returns nothing, say so and suggest why (for example, the bank isn't connected or synced yet).
- Pick sensible date ranges yourself ("este mes" = from the 1st of this month to today; "el mes pasado" = the whole previous month) and say which range you used.
- Amounts are US dollars; write them like $1,234.56.
- You can explain what the numbers mean and give practical, general money tips. Do not give tax, legal or investment advice as if it were professional advice; for their tax return, tell them to ask their preparer in the Impuestos section.
- You only read data. You can't change, delete or send anything, move money, or see other people's data. If asked to do something in the app, explain where in the app they can do it.
- Plain text only: no markdown headings, tables or bold markers. For lists, use short lines starting with "• ".
- Under your answer the app shows links to the screens and records your numbers came from (from the tools you called), so don't write links or paths yourself.

Today is ${today} (the business's local date, US Central time).`;
}

const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100) || 0;
const cents2 = (c: number) => c / 100;

/** Today's date in US Central time (the business's local date), e.g. "2026-11-21". */
function todayCentral(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export const assistantRouter = createRouter({
  /** Limit, questions used this month, whether the assistant is set up, and the visible conversation. */
  status: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    await ensureAssistantTables(db);
    const plan = await getPlanContext(db, ctx.user);
    const limit = plan.tier ? assistantMonthlyLimit(plan.mode, plan.tier) : 0;
    const userId = Number(ctx.user.id);
    const used = await questionsThisMonth(db, userId);
    const messages = await visibleMessages(db, userId, 40);
    return { mode: plan.mode, limit, used, remaining: Math.max(0, limit - used), ready: !!process.env.ANTHROPIC_API_KEY, messages };
  }),

  ask: authedQuery
    .input(z.object({ question: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureAssistantTables(db);
      const plan = await getPlanContext(db, ctx.user);
      const limit = plan.tier ? assistantMonthlyLimit(plan.mode, plan.tier) : 0;
      const userId = Number(ctx.user.id);
      const used = await questionsThisMonth(db, userId);
      if (used >= limit) throw new TRPCError({ code: "FORBIDDEN", message: msg(ctx.lang, "assistantQuota") });
      const api = anthropic();
      if (!api) throw new TRPCError({ code: "PRECONDITION_FAILED", message: msg(ctx.lang, "assistantNotReady") });

      const history = (await visibleMessages(db, userId, HISTORY_MESSAGES)).map((m) => ({ role: m.role, content: m.content }));
      // The conversation must start with the person and alternate; drop a leading answer if the window cut its question.
      while (history.length && history[0].role !== "user") history.shift();

      let answer: string;
      // Every tool call made for this answer: they become its sources.
      const calls: ToolCall[] = [];
      const today = todayCentral();
      try {
        const final = await api.beta.messages.toolRunner({
          model: MODEL,
          max_tokens: 8000,
          max_iterations: 6,
          thread: false,
          // Chat answers: low effort keeps replies quick and cheap; thinking stays on (it can't be turned off on this model).
          output_config: { effort: "low" },
          // If the model declines for policy reasons, the API retries on its default fallback model in the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          cache_control: { type: "ephemeral" },
          system: systemPrompt(plan.mode, today),
          tools: assistantTools(db, userId, plan.mode, today, (c) => calls.push(c)),
          messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: input.question }],
        });
        if (final.stop_reason === "refusal") {
          answer = msg(ctx.lang, "assistantDeclined");
        } else {
          answer = final.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() || msg(ctx.lang, "assistantError");
        }
      } catch (e: unknown) {
        if (e instanceof Anthropic.RateLimitError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: msg(ctx.lang, "assistantBusy") });
        if (e instanceof Anthropic.APIError) {
          console.error("[assistant] API error", e.status, e.message);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg(ctx.lang, "assistantError") });
        }
        throw e;
      }

      const sources: AssistantSource[] = sourcesFromCalls(calls, plan.mode);
      await db.execute(sql`INSERT INTO assistantMessages (userId, role, content) VALUES (${userId}, 'user', ${input.question})`);
      await db.execute(sql`INSERT INTO assistantMessages (userId, role, content, sources) VALUES (${userId}, 'assistant', ${answer}, ${sources.length ? JSON.stringify(sources) : null})`);
      return { answer, sources, remaining: Math.max(0, limit - used - 1) };
    }),

  /**
   * The weekly summary card: last week (Monday to Sunday) and what's coming, from the user's own data.
   * Worked out here, without the model, so it never uses one of the month's questions.
   */
  weekly: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const plan = await getPlanContext(db, ctx.user);
    const userId = Number(ctx.user.id);
    const today = todayCentral();
    const week = lastWeek(today);
    const inWeek = and(eq(bankTransactions.userId, userId), sql`${bankTransactions.transactionDate} >= ${week.from}`, sql`${bankTransactions.transactionDate} <= ${week.to}`);
    type Tx = { type: string; category: string; amount: string };
    const txs: Tx[] = await db.select({ type: bankTransactions.type, category: bankTransactions.category, amount: bankTransactions.amount }).from(bankTransactions).where(inWeek);
    const sum = (list: Tx[]) => cents2(list.reduce((s, t) => s + toCents(t.amount), 0));

    if (plan.mode === "personal") {
      const byCat = spendingByCategory(txs);
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
      // Budgets this month: the one furthest over its limit.
      const month = today.slice(0, 7);
      type Limit = { name: string; limit: string | null };
      const limits: Limit[] = await db.select({ name: personalCategories.name, limit: personalCategories.budgetLimit })
        .from(personalCategories).where(and(eq(personalCategories.userId, userId), isNotNull(personalCategories.budgetLimit)));
      let over: { category: string; spent: number; limit: number } | null = null;
      if (limits.length) {
        const monthTx: Tx[] = await db.select({ type: bankTransactions.type, category: bankTransactions.category, amount: bankTransactions.amount })
          .from(bankTransactions).where(and(eq(bankTransactions.userId, userId), sql`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m') = ${month}`));
        const spent = spendingByCategory(monthTx);
        for (const l of limits) {
          const limit = cents2(toCents(l.limit));
          const s = spent.get(l.name) ?? 0;
          if (limit > 0 && budgetStatus(s, limit) === "over" && (!over || s - limit > over.spent - over.limit)) over = { category: l.name, spent: s, limit };
        }
      }
      type Goal = { target: string; current: string; active: boolean | null };
      const goals: Goal[] = await db.select({ target: personalGoals.targetAmount, current: personalGoals.currentAmount, active: personalGoals.isActive })
        .from(personalGoals).where(eq(personalGoals.userId, userId));
      const active = goals.filter((g) => g.active !== false);
      return {
        mode: "personal" as const, today, from: week.from, to: week.to, monday: week.monday, month,
        spent: sum(txs.filter((t) => t.type === "expense")), moneyIn: sum(txs.filter((t) => t.type === "income")), count: txs.length,
        top: top ? { category: top[0], amount: top[1] } : null,
        budgets: limits.filter((l) => toCents(l.limit) > 0).length,
        over,
        goals: { count: active.length, saved: cents2(active.reduce((s, g) => s + toCents(g.current), 0)), target: cents2(active.reduce((s, g) => s + toCents(g.target), 0)) },
      };
    }

    const salesWeek: Array<{ total: string; n: number }> = await db.select({ total: sql<string>`COALESCE(SUM(${sales.total}), 0)`, n: sql<number>`COUNT(*)` }).from(sales)
      .where(and(eq(sales.createdBy, userId), eq(sales.status, "completed"), sql`DATE(${sales.createdAt}) >= ${week.from}`, sql`DATE(${sales.createdAt}) <= ${week.to}`));
    const expWeek: Array<{ total: string; n: number }> = await db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`, n: sql<number>`COUNT(*)` }).from(expenses)
      .where(and(sql`${expenses.createdBy} = ${userId}`, sql`${expenses.date} >= ${week.from}`, sql`${expenses.date} <= ${week.to}`));
    const owed = await receivablesOf(db, userId, today);
    const late = owed.filter((r) => r.late).sort((a, b) => b.balance - a.balance);
    const topOwed = late[0] ?? [...owed].sort((a, b) => b.balance - a.balance)[0] ?? null;
    const due = await billsDueOf(db, userId, today, addDays(today, 6));
    return {
      mode: "business" as const, today, from: week.from, to: week.to, monday: week.monday,
      bank: { moneyIn: sum(txs.filter((t) => t.type === "income")), moneyOut: sum(txs.filter((t) => t.type === "expense")), count: txs.length },
      sales: { total: cents2(toCents(salesWeek[0]?.total)), count: Number(salesWeek[0]?.n ?? 0) },
      expenses: { total: cents2(toCents(expWeek[0]?.total)), count: Number(expWeek[0]?.n ?? 0) },
      owed: { count: owed.length, total: cents2(owed.reduce((s, r) => s + toCents(r.balance), 0)), late: late.length, top: topOwed },
      bills: { count: due.length, total: cents2(due.reduce((s, b) => s + toCents(b.amount), 0)), late: due.filter((b) => b.late).length },
    };
  }),

  /** Clears the visible conversation. Questions already asked still count for this month. */
  clear: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await ensureAssistantTables(db);
    await db.update(assistantMessages).set({ hidden: true }).where(eq(assistantMessages.userId, Number(ctx.user.id)));
    return { ok: true };
  }),
});
