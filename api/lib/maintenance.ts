// Maintenance mode (Admin · Sistema). While it's on, customers see the notice (src/components/MaintenanceScreen.tsx)
// and the server doesn't let them change anything (api/middleware.ts); the admin can do everything. Kept in
// systemSettings: on/off, an optional message from the admin and an optional time it's expected back. A short cache
// keeps every request from reading the database.
import { eq } from "drizzle-orm";
import { systemSettings } from "@db/schema";
import { getDb } from "../queries/connection";

type Db = ReturnType<typeof getDb>;

export const MAINTENANCE_KEY = "maintenance_mode";
export const MAINTENANCE_MSG_KEY = "maintenance_message";
export const MAINTENANCE_UNTIL_KEY = "maintenance_until";
/** What the old screen saved by default (in Spanish only): not a message the admin wrote. */
const OLD_DEFAULT = "Estamos en mantenimiento. Volveremos pronto.";
const CACHE_MS = 5000;

export type MaintenanceState = { enabled: boolean; message: string | null; until: string | null };

async function get(db: Db, key: string): Promise<string> {
  try {
    const rows: { value: string | null }[] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    return rows[0]?.value ?? "";
  } catch { return ""; }
}

async function put(db: Db, key: string, value: string) {
  try {
    await db.insert(systemSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  } catch { /* table may not exist yet */ }
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
  return readMaintenance(db);
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
