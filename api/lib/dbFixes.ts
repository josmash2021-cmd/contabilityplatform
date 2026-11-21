// One-time, additive fixes to existing tables, applied when the server starts.
// Each fix checks first and does nothing if it was already applied.
import { sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";

type Db = ReturnType<typeof getDb>;

/**
 * bankTransactions.category used to be an ENUM of 13 values, but the bank sync also
 * produces categories like "transfer_income", "refund" or "food". In strict MySQL those
 * rows were rejected and never saved. A VARCHAR keeps every existing value as it is and
 * accepts the rest. Returns what it did.
 */
export async function widenBankCategory(db: Db): Promise<"widened" | "already" | "no-table"> {
  const rows = (await db.execute(sql`
    SELECT DATA_TYPE AS t FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bankTransactions' AND COLUMN_NAME = 'category'
  `)) as unknown as [{ t: string }[]];
  const type = rows[0]?.[0]?.t;
  if (!type) return "no-table";
  if (type.toLowerCase() !== "enum") return "already";
  await db.execute(sql`ALTER TABLE bankTransactions MODIFY COLUMN category VARCHAR(40) NOT NULL DEFAULT 'other'`);
  return "widened";
}

export async function runStartupDbFixes(db: Db): Promise<void> {
  try {
    const r = await widenBankCategory(db);
    console.log(`[db-fixes] bankTransactions.category: ${r}`);
  } catch (e: unknown) {
    console.error("[db-fixes] bankTransactions.category failed:", e instanceof Error ? e.message : e);
  }
}
