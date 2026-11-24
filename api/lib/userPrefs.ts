// ── Small personal choices kept on the server (so every device shows the same) ──
// For now, the color of the person's own circle (the initial in the menu), chosen in Ajustes › Perfil or by asking
// the assistant's bubble. The table is created on first use and goes with the account (userDataCleanup USER_TABLES).
import { sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { isUserColor, type UserColor } from "@contracts/bubble";
import { rowsOf } from "./support";

type Db = ReturnType<typeof getDb>;

let ready: Promise<void> | null = null;
function ensureUserPrefs(db: Db): Promise<void> {
  ready ??= (db.execute(sql`
    CREATE TABLE IF NOT EXISTS userPrefs (
      userId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      color VARCHAR(16) NULL,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`) as Promise<unknown>).then(() => undefined).catch((e: unknown) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** The person's circle color (blue when they never chose one). */
export async function colorOf(db: Db, userId: number): Promise<UserColor> {
  await ensureUserPrefs(db);
  const c = rowsOf<{ color: string | null }>(await db.execute(sql`SELECT color FROM userPrefs WHERE userId = ${userId}`))[0]?.color;
  return isUserColor(c) ? c : "blue";
}

export async function setColor(db: Db, userId: number, color: UserColor): Promise<void> {
  await ensureUserPrefs(db);
  await db.execute(sql`INSERT INTO userPrefs (userId, color) VALUES (${userId}, ${color})
    ON DUPLICATE KEY UPDATE color = VALUES(color), updatedAt = CURRENT_TIMESTAMP`);
}
