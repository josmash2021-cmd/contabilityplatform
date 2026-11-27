// Tables of the original-logos system, created on first use (no migrations; same pattern as api/team-router.ts).
// Both declare utf8mb4 explicitly, so names like "Way2Save® Savings" keep their characters whatever the
// database default is.
import { sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";

type Db = ReturnType<typeof getDb>;

let ready: Promise<void> | null = null;

export function ensureBrandTables(db: Db): Promise<void> {
  ready ??= (async () => {
    // One row per Plaid item (bank connection) of a user: the institution's name, logo and color from Plaid,
    // and how the last Plaid calls for it went.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bankInstitutions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        itemId VARCHAR(255) NOT NULL,
        institutionId VARCHAR(64) NULL,
        name VARCHAR(255) NOT NULL,
        logo MEDIUMTEXT NULL,
        color VARCHAR(16) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ok',
        errorCode VARCHAR(64) NULL,
        lastSuccessAt TIMESTAMP NULL,
        lastErrorAt TIMESTAMP NULL,
        metaFetchedAt TIMESTAMP NULL,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX bankInstitutions_user_item (userId, itemId),
        INDEX bankInstitutions_item (itemId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Added 2026-11-26 (owner: "se ve dinero viejo"): when Plaid last brought this bank's data (Plaid's own
    // last_successful_update, not when the app asked Plaid) and the webhook address Plaid has for it.
    const cols = (await db.execute(sql`
      SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bankInstitutions'
    `)) as unknown as [{ c: string }[]];
    const have = new Set((cols[0] ?? []).map((r) => r.c));
    if (!have.has("bankUpdatedAt")) await db.execute(sql`ALTER TABLE bankInstitutions ADD COLUMN bankUpdatedAt TIMESTAMP NULL`);
    if (!have.has("webhook")) await db.execute(sql`ALTER TABLE bankInstitutions ADD COLUMN webhook VARCHAR(255) NULL`);
    // When the balance last came from the bank itself and when Plaid was last asked to go to the bank (both paid,
    // api/lib/liveBalance.ts).
    if (!have.has("liveBalanceAt")) await db.execute(sql`ALTER TABLE bankInstitutions ADD COLUMN liveBalanceAt TIMESTAMP NULL`);
    if (!have.has("txRefreshAt")) await db.execute(sql`ALTER TABLE bankInstitutions ADD COLUMN txRefreshAt TIMESTAMP NULL`);
    // Public brand data Plaid sends with transactions (merchant_name / counterparties): one row per merchant.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS merchantLogos (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        merchantKey VARCHAR(120) NOT NULL,
        name VARCHAR(255) NOT NULL,
        logoUrl VARCHAR(1000) NULL,
        website VARCHAR(255) NULL,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX merchantLogos_key (merchantKey)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
