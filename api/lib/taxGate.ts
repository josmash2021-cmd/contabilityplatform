// "Primero, confirma que eres tú": Impuestos keeps IDs and Social Security numbers, so it opens with a 6-digit
// code sent to the account's email (free, through the same mailbox as the other emails). The code lasts 10 minutes
// and allows 5 tries. Once confirmed, that browser tab gets a random key (only its hash is stored) that keeps
// Impuestos open for 30 minutes, renewed while it's being used. The server checks the key on every tax call:
// hiding the page isn't enough. Without email (local, tests) there's no way to send a code, so the gate is off.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { mailReady, sendMail } from "./mailer";
import { taxCodeMail } from "./accountEmails";
import { RateLimiter } from "./security";
import type { Lang } from "./i18n";

type Db = ReturnType<typeof getDb>;
type GateUser = { id: number | string; email?: string | null; name?: string | null };

export const CODE_MINUTES = 10;
export const UNLOCK_MINUTES = 30;
export const MAX_TRIES = 5;
/** Seconds before another code can be asked for. */
export const RESEND_SECONDS = 30;
/** The header the page sends its key in. */
export const UNLOCK_HEADER = "x-tax-unlock";

/** The gate is on when the server can send email (production). */
export const taxGateOn = (): boolean => mailReady();

const say = {
  es: {
    locked: "Por seguridad, confirma que eres tú otra vez.",
    noEmail: "Tu cuenta no tiene correo para mandarte el código. Escríbenos para ayudarte.",
    wait: "Espera unos segundos para pedir otro código.",
    tooManySends: "Ya pediste varios códigos. Espera un rato e intenta otra vez.",
    sendFailed: "No pudimos mandar el código. Intenta en unos minutos.",
    askFirst: "Primero pide un código.",
    expired: "El código venció. Pide otro.",
    tooMany: "Demasiados intentos. Pide otro código.",
    wrong: (left: number) => `Ese código no es. Te ${left === 1 ? "queda 1 intento" : `quedan ${left} intentos`}.`,
  },
  en: {
    locked: "For your security, confirm it's you again.",
    noEmail: "Your account has no email to send the code to. Contact us for help.",
    wait: "Wait a few seconds before asking for another code.",
    tooManySends: "You've asked for several codes. Wait a while and try again.",
    sendFailed: "We couldn't send the code. Try again in a few minutes.",
    askFirst: "Ask for a code first.",
    expired: "The code expired. Ask for another one.",
    tooMany: "Too many tries. Ask for another code.",
    wrong: (left: number) => `That's not the code. ${left === 1 ? "1 try left" : `${left} tries left`}.`,
  },
} as const;
const words = (lang: Lang) => (lang === "en" ? say.en : say.es);

// ── Tables (created on first use; additive) ──
let ready: Promise<void> | null = null;
function ensureGateTables(db: Db): Promise<void> {
  ready ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS taxAccessCodes (
      userId BIGINT UNSIGNED PRIMARY KEY,
      codeHash CHAR(64) NOT NULL,
      expiresAt DATETIME NOT NULL,
      tries INT NOT NULL DEFAULT 0,
      sentAt DATETIME NOT NULL)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS taxUnlocks (
      tokenHash CHAR(64) PRIMARY KEY,
      userId BIGINT UNSIGNED NOT NULL,
      until DATETIME NOT NULL,
      INDEX taxUnlocks_user (userId))`);
  })().catch((e: unknown) => { ready = null; throw e; });
  return ready;
}

const rows = async <T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> => ((await db.execute(q)) as unknown as [T[]])[0];
/** The code, tied to the person: a copied hash is useless for anyone else. */
const codeHash = (userId: number, code: string) =>
  createHmac("sha256", process.env.JWT_SECRET || "tax-gate").update(`${userId}:${code}`).digest("hex");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** "j•••@gmail.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

const sendLimiter = new RateLimiter(5, 60 * 60 * 1000);
const verifyLimiter = new RateLimiter(25, 15 * 60 * 1000);

/** Emails a new code (the old one stops working). */
export async function sendTaxCode(db: Db, user: GateUser, lang: Lang): Promise<{ sentTo: string; minutes: number }> {
  const w = words(lang);
  const userId = Number(user.id);
  const email = (user.email || "").trim();
  if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: w.noEmail });
  if (!sendLimiter.consume(String(userId))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: w.tooManySends });
  await ensureGateTables(db);
  const [recent] = await rows<{ n: number }>(db, sql`SELECT COUNT(*) AS n FROM taxAccessCodes
    WHERE userId = ${userId} AND sentAt > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${RESEND_SECONDS} SECOND)`);
  if (Number(recent?.n ?? 0) > 0) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: w.wait });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.execute(sql`INSERT INTO taxAccessCodes (userId, codeHash, expiresAt, tries, sentAt)
    VALUES (${userId}, ${codeHash(userId, code)}, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${CODE_MINUTES} MINUTE), 0, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE codeHash = VALUES(codeHash), expiresAt = VALUES(expiresAt), tries = 0, sentAt = VALUES(sentAt)`);
  const firstName = (user.name || "").trim().split(/\s+/)[0] || "";
  if (!(await sendMail(taxCodeMail(email, lang === "en" ? "en" : "es", firstName, code)))) {
    await db.execute(sql`DELETE FROM taxAccessCodes WHERE userId = ${userId}`);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: w.sendFailed });
  }
  return { sentTo: maskEmail(email), minutes: CODE_MINUTES };
}

/** Checks the code; when it's right, returns the key that keeps Impuestos open in this tab. */
export async function verifyTaxCode(db: Db, user: GateUser, code: string, lang: Lang): Promise<{ token: string; minutes: number }> {
  const w = words(lang);
  const userId = Number(user.id);
  if (!verifyLimiter.consume(String(userId))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: w.tooMany });
  await ensureGateTables(db);
  const [row] = await rows<{ codeHash: string; tries: number; live: number }>(db, sql`SELECT codeHash, tries,
    (expiresAt > UTC_TIMESTAMP()) AS live FROM taxAccessCodes WHERE userId = ${userId}`);
  if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: w.askFirst });
  if (!Number(row.live)) {
    await db.execute(sql`DELETE FROM taxAccessCodes WHERE userId = ${userId}`);
    throw new TRPCError({ code: "BAD_REQUEST", message: w.expired });
  }
  const tries = Number(row.tries);
  if (tries >= MAX_TRIES) throw new TRPCError({ code: "BAD_REQUEST", message: w.tooMany });
  const given = Buffer.from(codeHash(userId, code.trim()), "hex");
  const stored = Buffer.from(row.codeHash, "hex");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    const left = MAX_TRIES - (tries + 1);
    if (left <= 0) await db.execute(sql`DELETE FROM taxAccessCodes WHERE userId = ${userId}`);
    else await db.execute(sql`UPDATE taxAccessCodes SET tries = tries + 1 WHERE userId = ${userId}`);
    throw new TRPCError({ code: "BAD_REQUEST", message: left <= 0 ? w.tooMany : w.wrong(left) });
  }
  // Right: the code is used up, old keys of this person that already ran out go away, and this tab gets a new one.
  await db.execute(sql`DELETE FROM taxAccessCodes WHERE userId = ${userId}`);
  await db.execute(sql`DELETE FROM taxUnlocks WHERE userId = ${userId} AND until < UTC_TIMESTAMP()`);
  const token = randomBytes(32).toString("base64url");
  await db.execute(sql`INSERT INTO taxUnlocks (tokenHash, userId, until)
    VALUES (${tokenHash(token)}, ${userId}, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${UNLOCK_MINUTES} MINUTE))`);
  return { token, minutes: UNLOCK_MINUTES };
}

/** Is Impuestos open for this request? Renews the 30 minutes while it's being used. */
export async function taxUnlocked(db: Db, userId: number, req: Request): Promise<boolean> {
  if (!taxGateOn()) return true;
  const token = req.headers.get(UNLOCK_HEADER) || "";
  if (token.length < 20 || token.length > 100) return false;
  await ensureGateTables(db);
  const h = tokenHash(token);
  const [row] = await rows<{ left: number }>(db, sql`SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), until) AS \`left\`
    FROM taxUnlocks WHERE tokenHash = ${h} AND userId = ${userId}`);
  if (!row || Number(row.left) <= 0) return false;
  if (Number(row.left) < (UNLOCK_MINUTES - 10) * 60) {
    await db.execute(sql`UPDATE taxUnlocks SET until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${UNLOCK_MINUTES} MINUTE) WHERE tokenHash = ${h}`);
  }
  return true;
}

/** Refuses the call unless Impuestos is open in this tab. */
export async function requireTaxUnlocked(db: Db, userId: number, req: Request, lang: Lang): Promise<void> {
  if (!(await taxUnlocked(db, userId, req))) throw new TRPCError({ code: "FORBIDDEN", message: words(lang).locked });
}

/** "Cerrar": this tab's key stops working. */
export async function lockTax(db: Db, userId: number, req: Request): Promise<void> {
  const token = req.headers.get(UNLOCK_HEADER) || "";
  if (!token || !taxGateOn()) return;
  await ensureGateTables(db);
  await db.execute(sql`DELETE FROM taxUnlocks WHERE tokenHash = ${tokenHash(token)} AND userId = ${userId}`);
}
