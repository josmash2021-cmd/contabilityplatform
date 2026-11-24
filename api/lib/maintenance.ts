// Maintenance mode (Admin · Sistema). While it's on, customers see the notice (src/components/MaintenanceScreen.tsx)
// and the server doesn't let them change anything (api/middleware.ts); the admin can do everything. Kept in
// systemSettings: on/off, an optional message from the admin and an optional time it's expected back. A short cache
// keeps every request from reading the database.
import { sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { rowsOf } from "./support";

type Db = ReturnType<typeof getDb>;

export const MAINTENANCE_KEY = "maintenance_mode";
export const MAINTENANCE_MSG_KEY = "maintenance_message";
export const MAINTENANCE_UNTIL_KEY = "maintenance_until";
/** What the old screen saved by default (in Spanish only): not a message the admin wrote. */
const OLD_DEFAULT = "Estamos en mantenimiento. Volveremos pronto.";
const CACHE_MS = 5000;

export type MaintenanceState = { enabled: boolean; message: string | null; until: string | null };

// The settings table is created on first use (production's database didn't have it: saving failed in silence and
// maintenance never turned on). Additive: it never touches a table that's already there.
let ready: Promise<void> | null = null;
function ensureSettings(db: Db): Promise<void> {
  if (ready) return ready;
  ready = db.execute(sql`CREATE TABLE IF NOT EXISTS systemSettings (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      \`key\` VARCHAR(100) NOT NULL UNIQUE,
      value TEXT,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).then(() => undefined).catch((e: unknown) => { ready = null; throw e; });
  return ready as Promise<void>;
}

/** One setting ("" when there's none, or when it can't be read: reading never locks anyone out). */
async function get(db: Db, key: string): Promise<string> {
  try {
    await ensureSettings(db);
    return rowsOf<{ value: string | null }>(await db.execute(sql`SELECT value FROM systemSettings WHERE \`key\` = ${key} LIMIT 1`))[0]?.value ?? "";
  } catch { return ""; }
}

/** Saves one setting. Throws when it can't (the admin is told, instead of "turned on" with nothing saved). */
async function put(db: Db, key: string, value: string) {
  await ensureSettings(db);
  await db.execute(sql`INSERT INTO systemSettings (\`key\`, value) VALUES (${key}, ${value}) ON DUPLICATE KEY UPDATE value = VALUES(value)`);
}

/** The admin's own words, or null (then each customer reads the default in their language). */
export function cleanMessage(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s && s !== OLD_DEFAULT ? s.slice(0, 300) : null;
}

let cache: { at: number; state: MaintenanceState } | null = null;

export async function readMaintenance(db: Db, now = Date.now()): Promise<MaintenanceState> {
  if (cache && now - cache.at < CACHE_MS) return cache.state;
  const [on, message, until] = await Promise.all([get(db, MAINTENANCE_KEY), get(db, MAINTENANCE_MSG_KEY), get(db, MAINTENANCE_UNTIL_KEY)]);
  const state: MaintenanceState = { enabled: on === "true", message: cleanMessage(message), until: until || null };
  cache = { at: now, state };
  return state;
}

/**
 * Turns it on or off. `message` (empty = the default) and `minutes` (0 = no time) are saved when given; turning it
 * off forgets the time (it only means something while it's on).
 */
export async function writeMaintenance(db: Db, input: { enabled: boolean; message?: string | null; minutes?: number | null }, now = new Date()): Promise<MaintenanceState> {
  await put(db, MAINTENANCE_KEY, String(input.enabled));
  if (input.message !== undefined) await put(db, MAINTENANCE_MSG_KEY, cleanMessage(input.message) ?? "");
  if (!input.enabled) await put(db, MAINTENANCE_UNTIL_KEY, "");
  else if (input.minutes !== undefined) await put(db, MAINTENANCE_UNTIL_KEY, input.minutes ? new Date(now.getTime() + input.minutes * 60_000).toISOString() : "");
  cache = null;
  const state = await readMaintenance(db);
  // Read back what was saved: it has to say what was asked for.
  if (state.enabled !== input.enabled) throw new Error("maintenance not saved");
  return state;
}

/** While it's on, customers can look but not change anything; signing in and out still works, and the admin can do it all. */
export function maintenanceBlocks(path: string, type: string, isAdmin: boolean): boolean {
  return !isAdmin && type === "mutation" && !path.startsWith("auth.");
}

/** Whether maintenance is on now (false if the database can't be read: never lock people out by mistake). */
export async function maintenanceOn(): Promise<boolean> {
  try {
    return (await readMaintenance(getDb())).enabled;
  } catch {
    return false;
  }
}

/** Only for tests. */
export function resetMaintenanceCache() { cache = null; }
