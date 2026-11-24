// ── The app confirms what it's sure about (owner, 2026-11-24: "el sistema debería tener esa inteligencia") ──
// Por revisar only keeps what really needs the person. A pending movement is confirmed by the app when it's sure:
//   · the person's own rule says what it is, or they confirmed the same merchant the same way before (history),
//   · it's paying a credit card (never spending, in either mode),
//   · personal accounts only: a bill the app knows by name (loan, rent, power, phone, health insurance,
//     government), a membership (a car wash, a known service like Netflix) or a chain everyone knows (restaurants,
//     supermarkets, pharmacies, big stores, delivery apps, gas stations) in the category that fits it.
// Never: a possible link to an invoice, a bill or cash sales (that creates records), a possible duplicate, a
// transfer between their own accounts (approving one records both legs as left out of the reports: the person does
// it in one tap), or a business question (business or personal? split it?). Business accounts are more careful: those bills can be
// the owner's home, so they keep asking.
// What the app confirmed is kept in bankAutoConfirms (created on first use): the person sees it ("La app confirmó
// N por ti"), can change it, and once they touch it it's theirs (writeLog drops the mark). Unlike their own
// confirmations, the app's can still be corrected by a better rule later (autoFixCategories); if the app then
// changes its mind, the movement goes back to Por revisar.
import { sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { CHAIN_FITS, isCarWash, knownBill, knownChain, knownIncome } from "./bankRules";
import type { Verdict } from "./reviewEngine";
import { knownServiceOf } from "./subscriptions";
import { rowsOf } from "./support";

type Db = ReturnType<typeof getDb>;

export type AutoReason = "rule" | "history" | "card" | "bill" | "service" | "chain" | "income";
export type AccountKind = "business" | "personal";

/** What the policy reads of a pending movement. */
export type AutoRow = { description: string; merchantName: string | null; type: "income" | "expense"; category: string };

/**
 * Why the app may confirm this movement by itself, or null when the person has to look at it.
 * `v` is Por revisar's own verdict for it (api/lib/reviewEngine.ts classify).
 */
export function autoReasonFor(row: AutoRow, v: Pick<Verdict, "kind" | "ask" | "why" | "category">, mode: AccountKind): AutoReason | null {
  // A possible link (invoice, bill, cash sales) or a possible duplicate: always the person's call.
  if (v.kind === "match" || v.ask === "duplicate" || v.why.code === "transfer") return null;
  // Business questions (business or personal? split it?) only make sense for a business.
  if (mode === "business" && v.ask) return null;
  if (v.why.code === "rule") return "rule";
  if (v.why.code === "history") return "history";
  const text = `${row.description} ${row.merchantName ?? ""}`;
  const bill = knownBill(text, null, row.type === "expense" ? 1 : -1);
  if (bill === "card_payment" && v.category === "card_payment") return "card";
  if (mode === "business") return null;
  if (bill && bill !== "card_payment" && v.category === bill) return "bill";
  // A paycheck or a tax refund known by name.
  const income = knownIncome(text, null, row.type === "income" ? -1 : 1);
  if (income && v.category === income) return "income";
  if (row.type === "expense" && v.category === "subscription" && (isCarWash(text) || knownServiceOf(row.description, row.merchantName))) return "service";
  // A chain everyone knows (Zaxby's, Publix, CVS, Walmart, Shell, Uber...) in the category that fits it.
  const chain = knownChain(text);
  if (row.type === "expense" && chain && CHAIN_FITS[chain].has(v.category)) return "chain";
  return null;
}

// ── Where the app's confirmations are kept ──
let ready: Promise<void> | null = null;
export function ensureAutoTable(db: Db): Promise<void> {
  ready ??= db.execute(sql`CREATE TABLE IF NOT EXISTS bankAutoConfirms (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      userId BIGINT UNSIGNED NOT NULL,
      bankTransactionId BIGINT UNSIGNED NOT NULL UNIQUE,
      category VARCHAR(40) NOT NULL,
      reason VARCHAR(20) NOT NULL,
      prevCategory VARCHAR(40) NULL,
      prevType VARCHAR(10) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX bankAutoConfirms_user_idx (userId, createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).then(() => undefined).catch((e: unknown) => { ready = null; throw e; });
  return ready as Promise<void>;
}

/** Records what the app confirmed (one row per movement), with the category it had before (for "Deshacer"). */
export async function recordAuto(db: Db, userId: number, picks: ReadonlyArray<{ id: number; category: string; reason: AutoReason; prevCategory: string; prevType: string }>): Promise<void> {
  if (picks.length === 0) return;
  await ensureAutoTable(db);
  for (const p of picks) {
    await db.execute(sql`INSERT INTO bankAutoConfirms (userId, bankTransactionId, category, reason, prevCategory, prevType)
      VALUES (${userId}, ${p.id}, ${p.category}, ${p.reason}, ${p.prevCategory}, ${p.prevType})
      ON DUPLICATE KEY UPDATE category = VALUES(category), reason = VALUES(reason), prevCategory = VALUES(prevCategory), prevType = VALUES(prevType), createdAt = CURRENT_TIMESTAMP`);
  }
}

/** The category each of these movements had before the app confirmed it (only the ones the app confirmed). Never throws. */
export async function autoPrevOf(db: Db, userId: number, txIds: readonly number[]): Promise<Map<number, { prevCategory: string; prevType: "income" | "expense" }>> {
  const out = new Map<number, { prevCategory: string; prevType: "income" | "expense" }>();
  if (txIds.length === 0) return out;
  try {
    await ensureAutoTable(db);
    const rows = rowsOf<{ bankTransactionId: number | string; prevCategory: string | null; prevType: string | null }>(await db.execute(sql`
      SELECT bankTransactionId, prevCategory, prevType FROM bankAutoConfirms
      WHERE userId = ${userId} AND bankTransactionId IN (${sql.join(txIds.map((id) => sql`${id}`), sql`, `)})`));
    for (const r of rows) {
      if (r.prevCategory && (r.prevType === "income" || r.prevType === "expense")) out.set(Number(r.bankTransactionId), { prevCategory: r.prevCategory, prevType: r.prevType });
    }
  } catch (e: unknown) {
    console.error("[autoConfirm] prev lookup failed:", e instanceof Error ? e.message : e);
  }
  return out;
}

/** The person touched these movements: from now on they're theirs, not the app's. Never throws. */
export async function forgetAuto(db: Db, userId: number, txIds: readonly number[]): Promise<void> {
  if (txIds.length === 0) return;
  try {
    await ensureAutoTable(db);
    await db.execute(sql`DELETE FROM bankAutoConfirms WHERE userId = ${userId} AND bankTransactionId IN (${sql.join(txIds.map((id) => sql`${id}`), sql`, `)})`);
  } catch (e: unknown) {
    console.error("[autoConfirm] forget failed:", e instanceof Error ? e.message : e);
  }
}

/** The app's confirmations since a moment, newest first (for "La app confirmó N por ti" and its list). */
export async function autoSince(db: Db, userId: number, since: Date): Promise<Array<{ bankTransactionId: number; reason: AutoReason; at: string | Date }>> {
  await ensureAutoTable(db);
  const rows = rowsOf<{ bankTransactionId: number | string; reason: string; createdAt: string | Date }>(await db.execute(sql`
    SELECT a.bankTransactionId, a.reason, a.createdAt FROM bankAutoConfirms a
    JOIN bankTransactions t ON t.id = a.bankTransactionId AND t.userId = a.userId
    WHERE a.userId = ${userId} AND a.createdAt >= ${since} ORDER BY a.createdAt DESC, a.id DESC LIMIT 300`));
  // `at` as the database gives it (UTC text or a Date): read it with utcDate (api/lib/support.ts).
  return rows.map((r) => ({ bankTransactionId: Number(r.bankTransactionId), reason: r.reason as AutoReason, at: r.createdAt }));
}
