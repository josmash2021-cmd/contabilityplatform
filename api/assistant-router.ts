// ── Asistente de inteligencia artificial ──
// Answers questions about the user's own money with Claude, using read-only tools
// (api/lib/assistantTools.ts). Each plan has a monthly number of questions
// ("límite xN", N × 20 — contracts/planFeatures.ts). Needs ANTHROPIC_API_KEY.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { assistantMessages } from "@db/schema";
import { assistantMonthlyLimit } from "@contracts/planFeatures";
import { getPlanContext } from "./lib/planAccess";
import { assistantTools } from "./lib/assistantTools";
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
      createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
      INDEX assistantMessages_user_idx (userId, createdAt)
    )
  `) as Promise<unknown>).then(() => undefined).catch((e: unknown) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady as Promise<void>;
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

Today is ${today} (the business's local date, US Central time).`;
}

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
    type Row = { id: number; role: "user" | "assistant"; content: string; createdAt: Date };
    const recent: Row[] = await db.select({ id: assistantMessages.id, role: assistantMessages.role, content: assistantMessages.content, createdAt: assistantMessages.createdAt })
      .from(assistantMessages).where(and(eq(assistantMessages.userId, userId), eq(assistantMessages.hidden, false)))
      .orderBy(desc(assistantMessages.id)).limit(40);
    return { mode: plan.mode, limit, used, remaining: Math.max(0, limit - used), ready: !!process.env.ANTHROPIC_API_KEY, messages: recent.reverse() };
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

      type Row = { role: "user" | "assistant"; content: string };
      const history: Row[] = (await db.select({ role: assistantMessages.role, content: assistantMessages.content }).from(assistantMessages)
        .where(and(eq(assistantMessages.userId, userId), eq(assistantMessages.hidden, false)))
        .orderBy(desc(assistantMessages.id)).limit(HISTORY_MESSAGES)).reverse();
      // The conversation must start with the person and alternate; drop a leading answer if the window cut its question.
      while (history.length && history[0].role !== "user") history.shift();

      let answer: string;
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
          system: systemPrompt(plan.mode, todayCentral()),
          tools: assistantTools(db, userId, plan.mode),
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

      await db.insert(assistantMessages).values([
        { userId, role: "user", content: input.question },
        { userId, role: "assistant", content: answer },
      ]);
      return { answer, remaining: Math.max(0, limit - used - 1) };
    }),

  /** Clears the visible conversation. Questions already asked still count for this month. */
  clear: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await ensureAssistantTables(db);
    await db.update(assistantMessages).set({ hidden: true }).where(eq(assistantMessages.userId, Number(ctx.user.id)));
    return { ok: true };
  }),
});
