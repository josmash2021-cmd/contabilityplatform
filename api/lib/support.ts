// ── Soporte 24/7: the site's chat bubble (api/support-router.ts) ──
// Tables (made on first use), what the AI knows, the AI's answer, and the emails: to the admins when someone
// needs a person, and to the visitor when an agent answered and they had left.
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { appBaseUrl, brandedHtml, escapeHtml, mailNote, mailP, sendMail } from "./mailer";
import { isMissingTable } from "./dbErrors";
import type { Lang } from "./i18n";
import { preguntasCopy } from "../../src/i18n/copy/site/preguntas";
import { PREGUNTAS_FACTS } from "../../src/components/marketing/site/PreguntasFacts";

type Db = ReturnType<typeof getDb>;

export const SUPPORT_MODEL = "claude-opus-5-5";
/** Answers the AI gives in one chat; after that only a person answers (keeps a runaway chat cheap). */
export const AI_MAX_PER_CHAT = 30;
/** Messages a visitor's chat keeps sending to the AI as context. */
const HISTORY = 16;
export const SUPPORT_STATUSES = ["ai", "waiting", "agent", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportRole = "visitor" | "ai" | "agent" | "system";
/** What a system line in the chat says; the page words it in the visitor's language. */
export type SupportNote = "handoff" | "joined" | "closed" | "toAi";

export type SupportChatRow = {
  id: number; tokenHash: string; userId: number | null; name: string | null; email: string | null; lang: Lang;
  status: SupportStatus; page: string | null; agentName: string | null; aiAnswers: number;
  visitorSeenAt: Date | null; adminReadId: number; visitorReadId: number; notifiedAt: Date | null;
  mailedVisitorAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type SupportMessage = { id: number; fromRole: SupportRole; authorName: string | null; body: string; createdAt: Date };

// ── Tables ──
let tablesReady: Promise<void> | null = null;
export function ensureSupportTables(db: Db): Promise<void> {
  tablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS supportChats (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tokenHash CHAR(64) NOT NULL,
        userId BIGINT UNSIGNED NULL,
        name VARCHAR(80) NULL,
        email VARCHAR(255) NULL,
        lang VARCHAR(2) NOT NULL DEFAULT 'es',
        status VARCHAR(10) NOT NULL DEFAULT 'waiting',
        page VARCHAR(200) NULL,
        agentName VARCHAR(80) NULL,
        aiAnswers INT NOT NULL DEFAULT 0,
        visitorSeenAt TIMESTAMP NULL,
        adminReadId BIGINT UNSIGNED NOT NULL DEFAULT 0,
        visitorReadId BIGINT UNSIGNED NOT NULL DEFAULT 0,
        notifiedAt TIMESTAMP NULL,
        mailedVisitorAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE INDEX supportChats_token_idx (tokenHash),
        INDEX supportChats_updated_idx (updatedAt),
        INDEX supportChats_user_idx (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS supportMessages (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        chatId BIGINT UNSIGNED NOT NULL,
        fromRole VARCHAR(10) NOT NULL,
        authorName VARCHAR(80) NULL,
        body TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX supportMessages_chat_idx (chatId, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })().catch((e) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

/** Rows of a raw SELECT (mysql2 gives [rows, fields]). */
export function rowsOf<T>(res: unknown): T[] {
  return ((res as unknown as [T[]])[0] ?? []) as T[];
}

/**
 * A time read with raw SQL as an exact moment. The connection gives "YYYY-MM-DD HH:MM:SS" text, in the
 * database's time (UTC, like the server); without this the browser would read it as its own local time.
 */
export function utcDate(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  return new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(" ", "T")}Z`);
}

function normChat(r: SupportChatRow | undefined): SupportChatRow | null {
  if (!r) return null;
  return {
    ...r, id: Number(r.id), aiAnswers: Number(r.aiAnswers), adminReadId: Number(r.adminReadId), visitorReadId: Number(r.visitorReadId),
    visitorSeenAt: utcDate(r.visitorSeenAt), notifiedAt: utcDate(r.notifiedAt), mailedVisitorAt: utcDate(r.mailedVisitorAt),
    createdAt: utcDate(r.createdAt) as Date, updatedAt: utcDate(r.updatedAt) as Date,
  };
}

export async function chatByToken(db: Db, tokenHash: string): Promise<SupportChatRow | null> {
  return normChat(rowsOf<SupportChatRow>(await db.execute(sql`SELECT * FROM supportChats WHERE tokenHash = ${tokenHash} LIMIT 1`))[0]);
}

export async function chatById(db: Db, id: number): Promise<SupportChatRow | null> {
  return normChat(rowsOf<SupportChatRow>(await db.execute(sql`SELECT * FROM supportChats WHERE id = ${id} LIMIT 1`))[0]);
}

export async function messagesOf(db: Db, chatId: number, limit = 300): Promise<SupportMessage[]> {
  const rows = rowsOf<SupportMessage>(await db.execute(sql`
    SELECT id, fromRole, authorName, body, createdAt FROM supportMessages WHERE chatId = ${chatId} ORDER BY id DESC LIMIT ${limit}
  `));
  return rows.reverse().map((m) => ({ ...m, id: Number(m.id), createdAt: utcDate(m.createdAt) as Date }));
}

/** Adds a line to the chat and moves the chat to the top of the admin's list. Returns its id. */
export async function addMessage(db: Db, chatId: number, fromRole: SupportRole, body: string, authorName: string | null = null): Promise<number> {
  const res = await db.execute(sql`INSERT INTO supportMessages (chatId, fromRole, authorName, body) VALUES (${chatId}, ${fromRole}, ${authorName}, ${body})`);
  await db.execute(sql`UPDATE supportChats SET updatedAt = CURRENT_TIMESTAMP WHERE id = ${chatId}`);
  return Number((res as unknown as [{ insertId: number }])[0].insertId);
}

/** When an account is deleted: its chats (the ones written while signed in) go too. */
export async function deleteUserSupportData(db: Db, userId: number): Promise<void> {
  try {
    await db.execute(sql`DELETE m FROM supportMessages m JOIN supportChats c ON c.id = m.chatId WHERE c.userId = ${userId}`);
    await db.execute(sql`DELETE FROM supportChats WHERE userId = ${userId}`);
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
}

// ── What the AI knows: the site's own answers (/preguntas), with the real prices and limits ──
const knowledgeCache: Partial<Record<Lang, string>> = {};
export function supportKnowledge(lang: Lang): string {
  if (knowledgeCache[lang]) return knowledgeCache[lang];
  const cats = preguntasCopy[lang].categories(PREGUNTAS_FACTS);
  const text = cats.map((c) => [
    `## ${c.title}`,
    ...c.items.map((it) => `P: ${it.q}\nR: ${it.a.map((b) => (typeof b === "string" ? b : b.map((x) => `- ${x}`).join("\n"))).join("\n")}`),
  ].join("\n\n")).join("\n\n");
  knowledgeCache[lang] = text;
  return text;
}

export function supportSystemPrompt(lang: Lang): string {
  const site = appBaseUrl();
  const es = `Eres el asistente virtual de soporte de Personal & Business Solutions, una app de contabilidad en español (y en inglés) para negocios pequeños y para las finanzas personales, pensada para hispanos en Estados Unidos. Su sitio es ${site}.

Cómo responder:
- Responde en el idioma en que te escriba la persona. Sé breve (de 1 a 4 oraciones o una lista corta), cálido y claro, sin palabras de contador.
- Usa solo la información de abajo. Si no la tienes, o la pregunta es de su cuenta (cobros, accesos, un error, su declaración), di con honestidad que un agente especializado de nuestro equipo le va a ayudar en este mismo chat en unos minutos.
- Eres una inteligencia artificial: no digas que eres una persona.
- Nunca pidas contraseñas, códigos, números de tarjeta, de cuenta ni de Seguro Social. Si alguien los escribe, pídele que no los comparta por aquí.
- No des asesoría legal ni fiscal personalizada; explica lo que hace la app.
- Cuando ayude, menciona la página: crear cuenta ${site}/register, precios ${site}/precios, preguntas frecuentes ${site}/preguntas, seguridad ${site}/seguridad.
- Escribe en texto simple, sin tablas ni encabezados ni comillas angulares.

Lo que sabes (preguntas frecuentes del sitio):

`;
  const en = `You are the virtual support assistant of Personal & Business Solutions, a Spanish-and-English accounting app for small businesses and personal finances, built for Hispanic people in the United States. Its site is ${site}.

How to answer:
- Answer in the language the person writes in. Be brief (1 to 4 sentences or a short list), warm and clear, with no accounting jargon.
- Use only the information below. If you don't have it, or the question is about their own account (billing, access, an error, their tax return), say honestly that a specialist from our team will help them in this same chat in a few minutes.
- You are an AI: never say you are a person.
- Never ask for passwords, codes, card, account or Social Security numbers. If someone types one, ask them not to share it here.
- Don't give personal legal or tax advice; explain what the app does.
- When it helps, point to the page: sign up ${site}/register, pricing ${site}/precios, FAQ ${site}/preguntas, security ${site}/seguridad.
- Write plain text, with no tables or headings.

What you know (the site's FAQ):

`;
  return (lang === "en" ? en : es) + supportKnowledge(lang);
}

// ── The AI's answer ──
let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

export function supportAiReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * The conversation as the model reads it: the visitor's lines are "user", the AI's and the agents' are
 * "assistant" (an agent's line says who wrote it). Same-side lines are joined, and it starts and ends with the visitor.
 */
export function turnsFor(msgs: SupportMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of msgs.slice(-HISTORY)) {
    if (m.fromRole === "system") continue;
    const role = m.fromRole === "visitor" ? "user" : "assistant";
    const content = m.fromRole === "agent" ? `[${m.authorName || "Agente"}, del equipo de soporte]: ${m.body}` : m.body;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else turns.push({ role, content });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  while (turns.length && turns[turns.length - 1].role !== "user") turns.pop();
  return turns;
}

/** The AI's reply to the chat so far, or null when it can't answer now (no key, an error, a refusal). */
export async function supportAiAnswer(lang: Lang, msgs: SupportMessage[]): Promise<string | null> {
  const api = anthropic();
  const turns = turnsFor(msgs);
  if (!api || !turns.length) return null;
  try {
    const res = await api.messages.create({
      model: SUPPORT_MODEL,
      max_tokens: 2500,
      // Quick, short replies.
      output_config: { effort: "low" },
      // The prompt with the FAQ is the same for every chat: cached.
      system: [{ type: "text", text: supportSystemPrompt(lang), cache_control: { type: "ephemeral" } }],
      messages: turns,
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return text ? text.slice(0, 4000) : null;
  } catch (e: unknown) {
    console.error("[support] AI error", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e instanceof Error ? e.message : "error");
    return null;
  }
}

// ── Emails ──
/** The admins' addresses (accounts with the admin role). */
async function adminEmails(db: Db): Promise<string[]> {
  const rows = rowsOf<{ email: string | null }>(await db.execute(sql`SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL AND email <> ''`));
  return [...new Set(rows.map((r) => (r.email || "").trim()).filter(Boolean))];
}

/** Tells every admin a visitor is waiting for a person (or wrote again to an agent). Returns how many got it. */
export async function notifyAdmins(db: Db, chat: SupportChatRow, lastMessage: string, again: boolean): Promise<number> {
  const to = await adminEmails(db);
  if (!to.length) return 0;
  const who = chat.name || chat.email || `Visitante #${chat.id}`;
  const url = `${appBaseUrl()}/admin/soporte/${chat.id}`;
  const subject = again ? `Soporte: ${who} escribió de nuevo` : `Nuevo chat de soporte: ${who} espera un agente`;
  const body = [
    mailP(again ? `<strong>${escapeHtml(who)}</strong> escribió de nuevo en el chat del sitio:` : `<strong>${escapeHtml(who)}</strong> escribió en el chat del sitio. La IA ya le respondió y le dijimos que en unos minutos lo atiende un agente especializado.`),
    mailNote(escapeHtml(lastMessage.slice(0, 600))),
    chat.page ? mailP(`Página: ${escapeHtml(chat.page)}`) : "",
    chat.email ? mailP(`Correo que dejó: ${escapeHtml(chat.email)}`) : "",
  ].join("");
  const html = brandedHtml({ title: again ? "Escribieron de nuevo en soporte" : "Alguien espera en el chat de soporte", body, preheader: lastMessage.slice(0, 90), button: { label: "Contestar el chat", url }, lang: "es" });
  const text = `${again ? `${who} escribió de nuevo` : `${who} espera un agente`} en el chat del sitio:\n\n${lastMessage.slice(0, 600)}\n\nContestar: ${url}`;
  let sent = 0;
  for (const addr of to) if (await sendMail({ to: addr, subject, text, html })) sent++;
  return sent;
}

/** Sends the visitor the agent's answer when they left an email and aren't on the page. */
export async function mailVisitor(chat: SupportChatRow, agentName: string, body: string): Promise<boolean> {
  if (!chat.email) return false;
  const en = chat.lang === "en";
  const url = `${appBaseUrl()}/?soporte=1`;
  const subject = en ? `${agentName} answered you in our support chat` : `${agentName} te respondió en el chat de soporte`;
  const html = brandedHtml({
    title: en ? "We answered your question" : "Respondimos tu pregunta",
    body: [
      mailP(en ? `<strong>${escapeHtml(agentName)}</strong>, from our support team, wrote:` : `<strong>${escapeHtml(agentName)}</strong>, de nuestro equipo de soporte, te escribió:`),
      mailNote(escapeHtml(body.slice(0, 2000)).replace(/\n/g, "<br>")),
      mailP(en ? "Open the chat on our site to keep talking (on the same device you wrote from)." : "Abre el chat en nuestro sitio para seguir la conversación (en el mismo aparato desde el que escribiste)."),
    ].join(""),
    preheader: body.slice(0, 90),
    button: { label: en ? "Keep the conversation going" : "Seguir la conversación", url },
    lang: en ? "en" : "es",
  });
  return sendMail({ to: chat.email, subject, text: `${agentName}: ${body}\n\n${url}`, html });
}
