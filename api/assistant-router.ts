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
import { assistantMessages, bankAccounts, bankTransactions, expenses, personalCategories, personalGoals, sales } from "@db/schema";
import type { TrpcContext } from "./context";
import { mailReady } from "./lib/mailer";
import { pendingCount } from "./review-router";
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
    // Files a question came with: their names and types only (the files themselves are never kept).
    .then(() => (db.execute(sql`ALTER TABLE assistantMessages ADD COLUMN attachments TEXT NULL`) as Promise<unknown>).catch((e: unknown) => {
      if (!isDuplicateColumn(e)) throw e;
    }))
    // Saved conversations: each message belongs to a chat (NULL: the conversation from before chats existed).
    .then(() => (db.execute(sql`ALTER TABLE assistantMessages ADD COLUMN chatId BIGINT UNSIGNED NULL`) as Promise<unknown>).catch((e: unknown) => {
      if (!isDuplicateColumn(e)) throw e;
    }))
    .then(() => db.execute(sql`
      CREATE TABLE IF NOT EXISTS assistantChats (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        title VARCHAR(160) NOT NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        updatedAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX assistantChats_user_idx (userId, updatedAt)
      )`) as Promise<unknown>)
    // The Monday summary by email: who wants it and the last Monday it went out.
    .then(() => db.execute(sql`
      CREATE TABLE IF NOT EXISTS assistantPrefs (
        userId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        weeklyEmail BOOLEAN NOT NULL DEFAULT FALSE,
        lastWeeklySent DATE NULL,
        updatedAt TIMESTAMP DEFAULT NOW() NOT NULL
      )`) as Promise<unknown>)
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

type MessageRow = { id: number; role: "user" | "assistant"; content: string; sources: string | null; attachments: string | null; createdAt: Date };
export type AttachmentInfo = { name: string; mime: string };

/** The names and types a stored question came with (bad or missing JSON: none). */
function parseAttachments(raw: string | null): AttachmentInfo[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is AttachmentInfo => !!x && typeof x.name === "string" && typeof x.mime === "string").slice(0, 3) : [];
  } catch { return []; }
}

/** Photos and PDFs a question can carry, and how big each may be (bytes, decoded). */
export const ATTACH_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"] as const;
export const ATTACH_MAX_IMAGE = 5 * 1024 * 1024;
export const ATTACH_MAX_PDF = 10 * 1024 * 1024;
export const ATTACH_MAX_FILES = 3;
const attachment = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.enum(ATTACH_TYPES),
  dataBase64: z.string().min(8).max(Math.ceil((ATTACH_MAX_PDF * 4) / 3) + 8),
});
/** Which chat: a saved one's id, or LEGACY_CHAT for the conversation from before chats existed. */
const LEGACY_CHAT = 0;
const inChat = (chatId: number) => (chatId === LEGACY_CHAT ? sql`chatId IS NULL` : sql`chatId = ${chatId}`);

/** One chat's visible messages, oldest first, with each answer's sources. */
async function visibleMessages(db: Db, userId: number, limit: number, chatId: number) {
  const res = await db.execute(sql`
    SELECT id, role, content, sources, attachments, createdAt FROM assistantMessages
    WHERE userId = ${userId} AND hidden = FALSE AND ${inChat(chatId)} ORDER BY id DESC LIMIT ${limit}`);
  const rows = (res as unknown as [MessageRow[]])[0];
  return rows.reverse().map((m) => ({
    id: Number(m.id), role: m.role, content: m.content, createdAt: m.createdAt,
    sources: m.role === "assistant" ? parseSources(m.sources) : [],
    attachments: m.role === "user" ? parseAttachments(m.attachments) : [],
  }));
}

export type ChatSummary = { id: number; title: string; at: string };

/** The saved conversations, most recent first (the one from before chats existed included, as id 0). */
async function chatsOf(db: Db, userId: number): Promise<ChatSummary[]> {
  const saved = (await db.execute(sql`
    SELECT c.id AS id, c.title AS title, c.updatedAt AS at FROM assistantChats c
    WHERE c.userId = ${userId}
      AND EXISTS (SELECT 1 FROM assistantMessages m WHERE m.userId = ${userId} AND m.chatId = c.id AND m.hidden = FALSE)
    ORDER BY c.updatedAt DESC, c.id DESC LIMIT 50`) as unknown as [Array<{ id: number; title: string; at: Date | string }>])[0];
  const legacy = (await db.execute(sql`
    SELECT MIN(CASE WHEN role = 'user' THEN id END) AS firstQ, MAX(createdAt) AS at, COUNT(*) AS n FROM assistantMessages
    WHERE userId = ${userId} AND hidden = FALSE AND chatId IS NULL`) as unknown as [Array<{ firstQ: number | null; at: Date | string | null; n: number | string }>])[0][0];
  const out: ChatSummary[] = saved.map((c) => ({ id: Number(c.id), title: c.title, at: new Date(c.at).toISOString() }));
  if (legacy && Number(legacy.n) > 0 && legacy.at) {
    let title = "";
    if (legacy.firstQ) {
      const q = (await db.execute(sql`SELECT content FROM assistantMessages WHERE id = ${legacy.firstQ}`) as unknown as [Array<{ content: string }>])[0][0];
      title = chatTitle(q?.content ?? "");
    }
    out.push({ id: LEGACY_CHAT, title, at: new Date(legacy.at).toISOString() });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** A chat is named after its first question ("¿Cuánto vendí este mes?"), cut to fit a list. */
export function chatTitle(question: string): string {
  const q = question.replace(/\s+/g, " ").trim();
  return q.length > 80 ? `${q.slice(0, 79).trimEnd()}…` : q;
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
- The person may attach photos or PDFs (a receipt, an invoice, a bank statement, a letter). Read them carefully and answer about them; compare with their data using the tools when it helps. You can't save a file into the app: to keep a receipt, tell them to use Gastos → Foto de recibo.

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
  status: authedQuery
    .input(z.object({ chatId: z.number().int().min(0).nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      await ensureAssistantTables(db);
      const plan = await getPlanContext(db, ctx.user);
      const limit = plan.tier ? assistantMonthlyLimit(plan.mode, plan.tier) : 0;
      const userId = Number(ctx.user.id);
      const used = await questionsThisMonth(db, userId);
      const chats = await chatsOf(db, userId);
      // The chat asked for (null: a new, empty one), else the most recent one.
      const asked = input?.chatId;
      const chatId = asked === null ? null : asked !== undefined && chats.some((c) => c.id === asked) ? asked : chats[0]?.id ?? null;
      const messages = chatId === null ? [] : await visibleMessages(db, userId, 60, chatId);
      return { mode: plan.mode, limit, used, remaining: Math.max(0, limit - used), ready: !!process.env.ANTHROPIC_API_KEY, messages, chats, chatId };
    }),

  ask: authedQuery
    // chatId: a saved chat (0: the one from before chats existed); null: start a new chat; missing: the latest one.
    .input(z.object({
      question: z.string().trim().max(1000),
      chatId: z.number().int().min(0).nullable().optional(),
      attachments: z.array(attachment).max(ATTACH_MAX_FILES).optional(),
    }).refine((x) => x.question.length > 0 || (x.attachments?.length ?? 0) > 0, { message: "question or attachment required" }))
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

      const chats = await chatsOf(db, userId);
      let chatId: number | null = input.chatId === undefined ? chats[0]?.id ?? null : input.chatId;
      if (chatId !== null && !chats.some((c) => c.id === chatId)) chatId = null;
      // Earlier files aren't sent again; their names are, so a follow-up about them still makes sense.
      const history = chatId === null ? [] : (await visibleMessages(db, userId, HISTORY_MESSAGES, chatId)).map((m) => ({
        role: m.role,
        content: m.attachments.length ? `${m.content}\n[Adjuntó: ${m.attachments.map((a) => a.name).join(", ")}]`.trim() : m.content,
      }));
      // The files for this question, checked: type and size (decoded).
      const files = input.attachments ?? [];
      const blocks: Array<
        | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } }
        | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
      > = [];
      for (const f of files) {
        const bytes = Buffer.byteLength(f.dataBase64, "base64");
        const max = f.mime === "application/pdf" ? ATTACH_MAX_PDF : ATTACH_MAX_IMAGE;
        if (bytes > max) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "assistantFileTooBig") });
        if (f.mime === "application/pdf") blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.dataBase64 } });
        else blocks.push({ type: "image", source: { type: "base64", media_type: f.mime, data: f.dataBase64 } });
      }
      const questionText = input.question || msg(ctx.lang, "assistantFileOnly");
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
          messages: [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: blocks.length ? [...blocks, { type: "text" as const, text: questionText }] : questionText },
          ],
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
      // A new chat is named after this question.
      if (chatId === null) {
        const res = await db.execute(sql`INSERT INTO assistantChats (userId, title) VALUES (${userId}, ${chatTitle(input.question || files.map((f) => f.name).join(", "))})`);
        chatId = Number((res as unknown as [{ insertId: number }])[0].insertId);
      } else if (chatId !== LEGACY_CHAT) {
        await db.execute(sql`UPDATE assistantChats SET updatedAt = NOW() WHERE id = ${chatId} AND userId = ${userId}`);
      }
      const chatCol = chatId === LEGACY_CHAT ? null : chatId;
      const attached = files.length ? JSON.stringify(files.map((f) => ({ name: f.name, mime: f.mime }))) : null;
      await db.execute(sql`INSERT INTO assistantMessages (userId, role, content, chatId, attachments) VALUES (${userId}, 'user', ${input.question}, ${chatCol}, ${attached})`);
      await db.execute(sql`INSERT INTO assistantMessages (userId, role, content, sources, chatId) VALUES (${userId}, 'assistant', ${answer}, ${sources.length ? JSON.stringify(sources) : null}, ${chatCol})`);
      return { answer, sources, remaining: Math.max(0, limit - used - 1), chatId };
    }),

  /**
   * The weekly summary card: last week (Monday to Sunday) and what's coming, from the user's own data.
   * Worked out here, without the model, so it never uses one of the month's questions.
   */
  weekly: authedQuery.query(({ ctx }) => weeklyOf(getDb(), ctx.user)),

  /** "Lo que hice": what the app did on its own today, from real data (the banks' last update, what's ready to confirm, invoices and bills). */
  activity: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const plan = await getPlanContext(db, ctx.user);
    const userId = Number(ctx.user.id);
    const today = todayCentral();
    const accts: Array<{ at: Date | string | null; n: number | string }> = await db
      .select({ at: sql<Date>`MAX(${bankAccounts.lastSyncedAt})`, n: sql<number>`COUNT(*)` }).from(bankAccounts)
      .where(and(eq(bankAccounts.userId, userId), isNotNull(bankAccounts.plaidAccessToken), sql`COALESCE(${bankAccounts.isActive}, 1) = 1`));
    const banks = Number(accts[0]?.n ?? 0);
    const lastSync = accts[0]?.at ? new Date(accts[0].at).toISOString() : null;
    // Movements that came in today (US Central day).
    const added: Array<{ n: number | string }> = banks ? await db.select({ n: sql<number>`COUNT(*)` }).from(bankTransactions)
      .where(and(eq(bankTransactions.userId, userId), sql`DATE(CONVERT_TZ(${bankTransactions.createdAt}, '+00:00', '-06:00')) = ${today}`)) : [{ n: 0 }];
    if (plan.mode === "personal") {
      return { mode: "personal" as const, today, banks, lastSync, added: Number(added[0]?.n ?? 0) };
    }
    const toConfirm = banks ? await pendingCount(db, userId).catch(() => 0) : 0;
    const owed = await receivablesOf(db, userId, today);
    const due = await billsDueOf(db, userId, today, addDays(today, 6));
    return {
      mode: "business" as const, today, banks, lastSync, added: Number(added[0]?.n ?? 0), toConfirm,
      owed: { count: owed.length, late: owed.filter((r) => r.late).length },
      bills: { count: due.length, late: due.filter((b) => b.late).length },
    };
  }),

  /** The Monday summary by email: whether it's on, and whether the server can send email at all. */
  prefs: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    await ensureAssistantTables(db);
    const rows = (await db.execute(sql`SELECT weeklyEmail FROM assistantPrefs WHERE userId = ${Number(ctx.user.id)}`) as unknown as [Array<{ weeklyEmail: number | boolean }>])[0];
    return { weeklyEmail: !!Number(rows[0]?.weeklyEmail ?? 0), mailReady: mailReady() };
  }),

  setWeeklyEmail: authedQuery
    .input(z.object({ on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureAssistantTables(db);
      await db.execute(sql`INSERT INTO assistantPrefs (userId, weeklyEmail) VALUES (${Number(ctx.user.id)}, ${input.on})
        ON DUPLICATE KEY UPDATE weeklyEmail = VALUES(weeklyEmail), updatedAt = NOW()`);
      return { weeklyEmail: input.on };
    }),

  /** Deletes one saved chat (or, without chatId, every one). Questions already asked still count for this month. */
  clear: authedQuery
    .input(z.object({ chatId: z.number().int().min(0).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureAssistantTables(db);
      const userId = Number(ctx.user.id);
      if (input?.chatId === undefined) {
        await db.update(assistantMessages).set({ hidden: true }).where(eq(assistantMessages.userId, userId));
        await db.execute(sql`DELETE FROM assistantChats WHERE userId = ${userId}`);
        return { ok: true };
      }
      await db.execute(sql`UPDATE assistantMessages SET hidden = TRUE WHERE userId = ${userId} AND ${inChat(input.chatId)}`);
      if (input.chatId !== LEGACY_CHAT) await db.execute(sql`DELETE FROM assistantChats WHERE id = ${input.chatId} AND userId = ${userId}`);
      return { ok: true };
    }),
});

/**
 * The weekly summary: last week (Monday to Sunday) and what's coming, from the user's own data.
 * Worked out without the model, so it never uses one of the month's questions; the Monday email uses it too.
 */
export async function weeklyOf(db: Db, user: NonNullable<TrpcContext["user"]>) {
  const plan = await getPlanContext(db, user);
  const userId = Number(user.id);
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
}
