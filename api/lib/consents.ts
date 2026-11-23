// What a person accepted and when: the Terms of Use and the Privacy Policy when creating an account (required),
// and tips by email (optional). One row per thing accepted, with the version of the text, time, IP and device,
// so it can be shown later. Created on first use; deleted with the account (USER_TABLES).
import { sql } from "drizzle-orm";
import { TERMS_VERSION } from "@contracts/constants";

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
export type ConsentKind = "terms" | "privacy" | "marketing";

let ready: Promise<void> | null = null;
function ensureConsentTable(db: Db): Promise<void> {
  ready ??= db.execute(sql`CREATE TABLE IF NOT EXISTS userConsents (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      userId BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(20) NOT NULL,
      version VARCHAR(20) NOT NULL,
      acceptedAt TIMESTAMP DEFAULT NOW() NOT NULL,
      ip VARCHAR(80),
      userAgent VARCHAR(300),
      INDEX userConsents_userId_idx (userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).then(() => undefined).catch((e) => { ready = null; throw e; });
  return ready;
}

/** Saves what the person accepted. Never throws: the account is already made. */
export async function recordConsents(db: Db, userId: number, kinds: ConsentKind[], req: Request): Promise<void> {
  if (!kinds.length) return;
  try {
    await ensureConsentTable(db);
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "").slice(0, 80) || null;
    const ua = (req.headers.get("user-agent") || "").slice(0, 300) || null;
    for (const kind of kinds) {
      await db.execute(sql`INSERT INTO userConsents (userId, kind, version, ip, userAgent) VALUES (${userId}, ${kind}, ${TERMS_VERSION}, ${ip}, ${ua})`);
    }
  } catch (e) {
    console.error("[consents]", e instanceof Error ? e.message : e);
  }
}
