// More free days, given by the admin from a user's card ("Dar más días gratis"). One row per user: the trial
// runs at least until `until` (getTrialInfo in api/lib/trial.ts). Created on first use.
import { sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { rowsOf, utcDate } from "./support";

type Db = ReturnType<typeof getDb>;

let ready: Promise<void> | null = null;
export function ensureTrialTables(db: Db): Promise<void> {
  ready ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS trialExtensions (
      userId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      until DATETIME NOT NULL,
      grantedBy BIGINT UNSIGNED NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

/** Until when this user's trial was extended, or null. */
export async function trialUntil(db: Db, userId: number): Promise<Date | null> {
  await ensureTrialTables(db);
  const row = rowsOf<{ until: string | Date }>(await db.execute(sql`SELECT until FROM trialExtensions WHERE userId = ${userId} LIMIT 1`))[0];
  return row ? utcDate(row.until) : null;
}

/** Every extension, by user. */
export async function allTrialUntil(db: Db): Promise<Map<number, Date>> {
  await ensureTrialTables(db);
  const rows = rowsOf<{ userId: number; until: string | Date }>(await db.execute(sql`SELECT userId, until FROM trialExtensions`));
  const out = new Map<number, Date>();
  for (const r of rows) { const d = utcDate(r.until); if (d) out.set(Number(r.userId), d); }
  return out;
}

/** Sets the extension (UTC). */
export async function setTrialUntil(db: Db, userId: number, until: Date, grantedBy: number): Promise<void> {
  await ensureTrialTables(db);
  const v = until.toISOString().slice(0, 19).replace("T", " ");
  await db.execute(sql`INSERT INTO trialExtensions (userId, until, grantedBy) VALUES (${userId}, ${v}, ${grantedBy})
    ON DUPLICATE KEY UPDATE until = VALUES(until), grantedBy = VALUES(grantedBy)`);
}
