// ── Soporte 24/7 (the site's chat bubble) ──
// Anyone on the site can write. The AI answers right away from what the site says (the FAQ, prices, plans);
// with the first message the chat tells the visitor a specialist will join in a few minutes, and the admins get
// an email (and a count in the app's menu). An admin answers from /admin/soporte; once an agent writes, the AI
// stops answering that chat, until the admin hands it back. A visitor is known only by a random key kept in their
// browser: only its hash is stored. Lines, emails and limits: api/lib/support.ts.
import { createHash } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { RateLimiter } from "./lib/security";
import type { TrpcContext } from "./context";
import {
  AI_MAX_PER_CHAT, addMessage, chatById, chatByToken, ensureSupportTables, mailVisitor, messagesOf,
  notifyAdmins, rowsOf, supportAiAnswer, utcDate, type SupportChatRow, type SupportMessage, type SupportNote, type SupportStatus,
} from "./lib/support";

/** The visitor's key: 24 random bytes in hex, made in their browser. */
const token = z.string().regex(/^[a-f0-9]{48}$/);
const hashOf = (t: string) => createHash("sha256").update(t).digest("hex");

// Limits for a page anyone can use (per address, per chat). In memory: fine for one server.
const pollLimiter = new RateLimiter(240, 60_000);
const sendIpLimiter = new RateLimiter(40, 10 * 60_000);
const sendChatLimiter = new RateLimiter(15, 5 * 60_000);
const newChatLimiter = new RateLimiter(8, 60 * 60_000);
const contactLimiter = new RateLimiter(10, 60 * 60_000);
/** A new admin email for a chat an agent already has, at most this often. */
const RENOTIFY_MS = 15 * 60_000;
/** The visitor counts as gone (so the agent's answer goes to their email) after this long without the page polling. */
const AWAY_MS = 2 * 60_000;
const MAIL_VISITOR_EVERY_MS = 10 * 60_000;

function ipOf(ctx: TrpcContext): string {
  return (ctx.req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || ctx.req.headers.get("x-real-ip") || "local";
}

const words = {
  es: { busy: "Estás escribiendo muy rápido. Espera un momento.", tooMany: "Hay demasiados chats desde tu conexión. Intenta más tarde.", notFound: "Ese chat no existe." },
  en: { busy: "You're writing too fast. Wait a moment.", tooMany: "Too many chats from your connection. Try again later.", notFound: "That chat doesn't exist." },
};

/** What the visitor's page sees of their chat. */
function visitorView(chat: SupportChatRow, messages: SupportMessage[]) {
  const unread = messages.filter((m) => (m.fromRole === "agent" || m.fromRole === "ai") && m.id > Number(chat.visitorReadId)).length;
  return {
    chat: { status: chat.status, agentName: chat.agentName, hasEmail: !!chat.email, unread },
    messages: messages.map((m) => ({ id: m.id, fromRole: m.fromRole, authorName: m.authorName, body: m.body, createdAt: m.createdAt })),
  };
}

const firstName = (name: string | null | undefined) => (name || "").trim().split(/\s+/)[0]?.slice(0, 40) || "Soporte";

export const supportRouter = createRouter({
  // ── The visitor (the site's bubble) ──
  /** Their chat and its lines. `open`: the chat is on screen, so what's there counts as read. */
  get: publicQuery.input(z.object({ token, open: z.boolean().default(false) })).query(async ({ ctx, input }) => {
    if (!pollLimiter.consume(ipOf(ctx))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: words[ctx.lang].busy });
    const db = getDb();
    await ensureSupportTables(db);
    const chat = await chatByToken(db, hashOf(input.token));
    if (!chat) return { chat: null, messages: [] };
    const messages = await messagesOf(db, Number(chat.id));
    const lastId = messages.length ? messages[messages.length - 1].id : 0;
    if (input.open) {
      await db.execute(sql`UPDATE supportChats SET visitorSeenAt = CURRENT_TIMESTAMP, visitorReadId = ${lastId} WHERE id = ${chat.id}`);
      chat.visitorReadId = lastId;
    } else {
      await db.execute(sql`UPDATE supportChats SET visitorSeenAt = CURRENT_TIMESTAMP WHERE id = ${chat.id}`);
    }
    return visitorView(chat, messages);
  }),

  /**
   * The visitor writes. The first message opens the chat: the AI answers, the chat says a specialist will join
   * in a few minutes, and the admins are told. Until an agent answers, the AI keeps answering.
   */
  send: publicQuery.input(z.object({ token, body: z.string().trim().min(1).max(1000), page: z.string().trim().max(200).optional() })).mutation(async ({ ctx, input }) => {
    const w = words[ctx.lang];
    const ip = ipOf(ctx);
    const tokenHash = hashOf(input.token);
    if (!sendIpLimiter.consume(ip) || !sendChatLimiter.consume(tokenHash)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: w.busy });
    const db = getDb();
    await ensureSupportTables(db);
    let chat = await chatByToken(db, tokenHash);
    let opened = false;
    if (!chat) {
      if (!newChatLimiter.consume(ip)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: w.tooMany });
      await db.execute(sql`
        INSERT INTO supportChats (tokenHash, userId, lang, status, page, visitorSeenAt)
        VALUES (${tokenHash}, ${ctx.user ? Number(ctx.user.id) : null}, ${ctx.lang}, 'waiting', ${input.page ?? null}, CURRENT_TIMESTAMP)
      `);
      chat = await chatByToken(db, tokenHash);
      if (!chat) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      opened = true;
    }
    const chatId = Number(chat.id);
    // A closed chat that gets a new message is opened again and goes back to waiting for a person.
    const reopened = chat.status === "closed";
    if (reopened) await db.execute(sql`UPDATE supportChats SET status = 'waiting' WHERE id = ${chatId}`);
    const status: SupportStatus = reopened ? "waiting" : chat.status;
    await addMessage(db, chatId, "visitor", input.body);

    // The AI answers while no agent has the chat.
    if (status !== "agent" && Number(chat.aiAnswers) < AI_MAX_PER_CHAT) {
      const answer = await supportAiAnswer(chat.lang === "en" ? "en" : "es", await messagesOf(db, chatId, 40));
      if (answer) {
        await addMessage(db, chatId, "ai", answer);
        await db.execute(sql`UPDATE supportChats SET aiAnswers = aiAnswers + 1 WHERE id = ${chatId}`);
      }
    }
    // A person is on the way: said in the chat, and the admins get told.
    if (opened || reopened) {
      await addMessage(db, chatId, "system", "handoff" satisfies SupportNote);
      await db.execute(sql`UPDATE supportChats SET notifiedAt = CURRENT_TIMESTAMP WHERE id = ${chatId}`);
      // The email goes out on its own: the visitor doesn't wait for the mail server.
      void notifyAdmins(db, { ...chat, status: "waiting" }, input.body, false).catch(() => {});
    } else if (status === "agent" && (!chat.notifiedAt || Date.now() - new Date(chat.notifiedAt).getTime() > RENOTIFY_MS)) {
      await db.execute(sql`UPDATE supportChats SET notifiedAt = CURRENT_TIMESTAMP WHERE id = ${chatId}`);
      void notifyAdmins(db, chat, input.body, true).catch(() => {});
    }
    return { ok: true };
  }),

  /** "Quiero hablar con una persona" when the AI has the chat on its own. */
  askHuman: publicQuery.input(z.object({ token })).mutation(async ({ ctx, input }) => {
    if (!contactLimiter.consume(ipOf(ctx))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: words[ctx.lang].busy });
    const db = getDb();
    await ensureSupportTables(db);
    const chat = await chatByToken(db, hashOf(input.token));
    if (!chat) throw new TRPCError({ code: "NOT_FOUND", message: words[ctx.lang].notFound });
    if (chat.status === "ai" || chat.status === "closed") {
      await db.execute(sql`UPDATE supportChats SET status = 'waiting', notifiedAt = CURRENT_TIMESTAMP WHERE id = ${chat.id}`);
      await addMessage(db, Number(chat.id), "system", "handoff" satisfies SupportNote);
      const last = (await messagesOf(db, Number(chat.id), 20)).filter((m) => m.fromRole === "visitor").pop();
      void notifyAdmins(db, chat, last?.body ?? "", false).catch(() => {});
    }
    return { ok: true };
  }),

  /** Their name and email, so the agent's answer can reach them if they leave. */
  setContact: publicQuery
    .input(z.object({ token, name: z.string().trim().max(80).optional(), email: z.string().trim().toLowerCase().email().max(255) }))
    .mutation(async ({ ctx, input }) => {
      if (!contactLimiter.consume(ipOf(ctx))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: words[ctx.lang].busy });
      const db = getDb();
      await ensureSupportTables(db);
      const chat = await chatByToken(db, hashOf(input.token));
      if (!chat) throw new TRPCError({ code: "NOT_FOUND", message: words[ctx.lang].notFound });
      await db.execute(sql`UPDATE supportChats SET email = ${input.email}, name = COALESCE(${input.name || null}, name) WHERE id = ${chat.id}`);
      return { ok: true };
    }),

  // ── The admins (/admin/soporte) ──
  /** Every chat, the newest activity first, with what's unread. */
  adminList: adminQuery.query(async () => {
    const db = getDb();
    await ensureSupportTables(db);
    const rows = rowsOf<SupportChatRow & { lastBody: string | null; lastRole: string | null; unread: number }>(await db.execute(sql`
      SELECT c.*,
        (SELECT m.body FROM supportMessages m WHERE m.chatId = c.id AND m.fromRole <> 'system' ORDER BY m.id DESC LIMIT 1) AS lastBody,
        (SELECT m.fromRole FROM supportMessages m WHERE m.chatId = c.id AND m.fromRole <> 'system' ORDER BY m.id DESC LIMIT 1) AS lastRole,
        (SELECT COUNT(*) FROM supportMessages m WHERE m.chatId = c.id AND m.fromRole = 'visitor' AND m.id > c.adminReadId) AS unread
      FROM supportChats c ORDER BY c.updatedAt DESC, c.id DESC LIMIT 200
    `));
    return rows.map((r) => ({
      id: Number(r.id), name: r.name, email: r.email, lang: r.lang, status: r.status, page: r.page, agentName: r.agentName,
      lastBody: r.lastBody, lastRole: r.lastRole, unread: Number(r.unread), createdAt: utcDate(r.createdAt) as Date, updatedAt: utcDate(r.updatedAt) as Date,
      signedIn: r.userId !== null,
    }));
  }),

  /** One chat with all its lines; opening it marks the visitor's lines read. */
  adminGet: adminQuery.input(z.object({ chatId: z.number().int().positive() })).query(async ({ input }) => {
    const db = getDb();
    await ensureSupportTables(db);
    const chat = await chatById(db, input.chatId);
    if (!chat) throw new TRPCError({ code: "NOT_FOUND", message: "Ese chat no existe." });
    const messages = await messagesOf(db, input.chatId, 500);
    const lastId = messages.length ? messages[messages.length - 1].id : 0;
    await db.execute(sql`UPDATE supportChats SET adminReadId = ${lastId} WHERE id = ${input.chatId}`);
    const online = !!chat.visitorSeenAt && Date.now() - new Date(chat.visitorSeenAt).getTime() < AWAY_MS;
    return {
      chat: { id: Number(chat.id), name: chat.name, email: chat.email, lang: chat.lang, status: chat.status, page: chat.page, agentName: chat.agentName, createdAt: chat.createdAt, online, signedIn: chat.userId !== null },
      messages,
    };
  }),

  /** The agent answers. The first answer takes the chat from the AI; if the visitor left, it goes to their email too. */
  adminReply: adminQuery.input(z.object({ chatId: z.number().int().positive(), body: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await ensureSupportTables(db);
    const chat = await chatById(db, input.chatId);
    if (!chat) throw new TRPCError({ code: "NOT_FOUND", message: "Ese chat no existe." });
    const agent = firstName(ctx.user.name);
    if (chat.status !== "agent" || chat.agentName !== agent) {
      await addMessage(db, input.chatId, "system", "joined" satisfies SupportNote, agent);
      await db.execute(sql`UPDATE supportChats SET status = 'agent', agentName = ${agent} WHERE id = ${input.chatId}`);
    }
    const id = await addMessage(db, input.chatId, "agent", input.body, agent);
    await db.execute(sql`UPDATE supportChats SET adminReadId = ${id} WHERE id = ${input.chatId}`);
    const away = !chat.visitorSeenAt || Date.now() - new Date(chat.visitorSeenAt).getTime() > AWAY_MS;
    const mailedRecently = !!chat.mailedVisitorAt && Date.now() - new Date(chat.mailedVisitorAt).getTime() < MAIL_VISITOR_EVERY_MS;
    let mailed = false;
    if (away && chat.email && !mailedRecently) {
      mailed = await mailVisitor(chat, agent, input.body);
      if (mailed) await db.execute(sql`UPDATE supportChats SET mailedVisitorAt = CURRENT_TIMESTAMP WHERE id = ${input.chatId}`);
    }
    return { ok: true, mailed };
  }),

  /** Hand the chat back to the AI, or close it. */
  adminSetStatus: adminQuery.input(z.object({ chatId: z.number().int().positive(), status: z.enum(["ai", "closed"]) })).mutation(async ({ input }) => {
    const db = getDb();
    await ensureSupportTables(db);
    const chat = await chatById(db, input.chatId);
    if (!chat) throw new TRPCError({ code: "NOT_FOUND", message: "Ese chat no existe." });
    if (chat.status !== input.status) {
      await addMessage(db, input.chatId, "system", (input.status === "ai" ? "toAi" : "closed") satisfies SupportNote);
      await db.execute(sql`UPDATE supportChats SET status = ${input.status} WHERE id = ${input.chatId}`);
    }
    return { ok: true };
  }),

  /** For the menu's count and the "new chat" notice: chats with lines the admins haven't read, and how many wait for a person. */
  adminUnread: adminQuery.query(async () => {
    const db = getDb();
    await ensureSupportTables(db);
    const row = rowsOf<{ unread: number; waiting: number; latest: number | null }>(await db.execute(sql`
      SELECT
        (SELECT COUNT(DISTINCT c.id) FROM supportChats c JOIN supportMessages m ON m.chatId = c.id AND m.fromRole = 'visitor' AND m.id > c.adminReadId) AS unread,
        (SELECT COUNT(*) FROM supportChats WHERE status = 'waiting') AS waiting,
        (SELECT MAX(m.id) FROM supportMessages m WHERE m.fromRole = 'visitor') AS latest
    `))[0];
    return { unread: Number(row?.unread ?? 0), waiting: Number(row?.waiting ?? 0), latest: Number(row?.latest ?? 0) };
  }),
});

