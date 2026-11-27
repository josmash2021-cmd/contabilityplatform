// ── The bank's balance at this moment (Plaid Balance) and asking Plaid to go to the bank now (Transactions Refresh) ──
// Owner, 2026-11-26: "tengo más dinero y se ve dinero viejo". Plaid's free /accounts/get returns Plaid's last copy,
// which Plaid brings 1–4 times a day (the owner's Wells Fargo was "Delayed" for 3 days). The two calls here are
// billed by Plaid for each successful call. On by default with the real Plaid (owner, 2026-11-27: "cuando abre debe
// ya estar actualizado"); Railway can switch each one off (PLAID_LIVE_BALANCE=off, PLAID_TX_REFRESH=off). Always limited:
// - balance (/accounts/balance/get): once per bank every 15 minutes, only when someone opens Inicio or Banco or
//   pulls to refresh (bank.refreshAllBalances); never from the background jobs;
// - transactions refresh (/transactions/refresh): when Inicio or Banco opens or on a pull (owner, 2026-11-27: "cuando
//   abre debe ya estar actualizado"), once per bank per hour. Plaid answers at once and
//   posts the webhook when it has the new movements (api/lib/plaidWebhook.ts reads them);
// - both: a daily cap for the whole app, and a 6-hour pause when Plaid says the product isn't enabled.
// A live balance is newer than Plaid's copy, so the free calls (background every 5 min, the syncs) must not write
// Plaid's older copy over it: heldBanks() names the banks to leave alone until Plaid's own copy is newer.
import { eq } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { bankInstitutionsTable } from "./brandSchema";
import { ensureBrandTables } from "./brandTables";
import { plaidErrorCode } from "./brand";

type Db = ReturnType<typeof getDb>;
export type LiveKind = "balance" | "refresh";

/** How often each bank may be asked (per bank, whoever asks). */
export const EVERY_MS: Record<LiveKind, number> = { balance: 15 * 60 * 1000, refresh: 60 * 60 * 1000 };
/** At most this many calls a day for the whole app (UTC day), unless Railway says otherwise. */
export const DAILY_CAP: Record<LiveKind, number> = { balance: 300, refresh: 100 };
/** Plaid's answer when the product isn't on for this Plaid account: pause instead of asking again and again. */
const NOT_ENABLED = new Set(["INVALID_PRODUCT", "PRODUCT_NOT_ENABLED"]);
const PAUSE_MS = 6 * 60 * 60 * 1000;
/** A bank with a live balance but no date for Plaid's copy keeps the live one this long at most. */
const HOLD_WITHOUT_DATE_MS = 6 * 60 * 60 * 1000;

const FLAG: Record<LiveKind, string> = { balance: "PLAID_LIVE_BALANCE", refresh: "PLAID_TX_REFRESH" };
const CAP_VAR: Record<LiveKind, string> = { balance: "PLAID_LIVE_BALANCE_DAILY_CAP", refresh: "PLAID_TX_REFRESH_DAILY_CAP" };

/**
 * Whether this paid call may be made. Railway's variable decides when it's set (on/1/true/yes, off/0/false/no).
 * Unset: on in production with the real Plaid (owner, 2026-11-27), off everywhere else (tests, and local servers,
 * which point PLAID_BASE_URL at a fake Plaid), so the old behavior stays there unless a check switches it on.
 */
export function liveOn(kind: LiveKind, env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[FLAG[kind]]?.trim() ?? "";
  if (/^(on|1|true|yes)$/i.test(v)) return true;
  if (/^(off|0|false|no)$/i.test(v)) return false;
  return env.NODE_ENV === "production" && !env.PLAID_BASE_URL;
}

function capOf(kind: LiveKind, env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env[CAP_VAR[kind]]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DAILY_CAP[kind];
}

// What this server remembers (one server; a restart forgets the counts, the per-bank times are in the database).
const used = { day: "", balance: 0, refresh: 0 };
const pausedUntil: Record<LiveKind, number> = { balance: 0, refresh: 0 };
const inFlight = new Set<string>();

function countToday(kind: LiveKind, nowMs: number, delta = 0): number {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (used.day !== day) { used.day = day; used.balance = 0; used.refresh = 0; }
  used[kind] = Math.max(0, used[kind] + delta);
  return used[kind];
}

/** For tests: forget the counts and pauses. */
export function resetLive() {
  used.day = ""; used.balance = 0; used.refresh = 0;
  pausedUntil.balance = 0; pausedUntil.refresh = 0;
  inFlight.clear();
}

/** Calls made today (for the logs and tests). */
export function usedToday(kind: LiveKind, nowMs = Date.now()): number { return countToday(kind, nowMs); }

type Stamps = { bankAt: Date | null; liveAt: Date | null; refreshAt: Date | null };

async function stampsOf(db: Db, userId: number): Promise<Map<string, Stamps>> {
  await ensureBrandTables(db);
  const rows: Array<{ itemId: string; bankAt: Date | null; liveAt: Date | null; refreshAt: Date | null }> = await db.select({
    itemId: bankInstitutionsTable.itemId, bankAt: bankInstitutionsTable.bankUpdatedAt,
    liveAt: bankInstitutionsTable.liveBalanceAt, refreshAt: bankInstitutionsTable.txRefreshAt,
  }).from(bankInstitutionsTable).where(eq(bankInstitutionsTable.userId, userId));
  return new Map(rows.map((r) => [r.itemId, { bankAt: r.bankAt ?? null, liveAt: r.liveAt ?? null, refreshAt: r.refreshAt ?? null }]));
}

async function stamp(db: Db, userId: number, itemKey: string, kind: LiveKind, at: Date | null): Promise<void> {
  const set = kind === "balance" ? { liveBalanceAt: at } : { txRefreshAt: at };
  await db.insert(bankInstitutionsTable).values({ userId, itemId: itemKey, name: "", ...set })
    .onDuplicateKeyUpdate({ set });
}

/**
 * The banks whose saved balance came from the bank itself after Plaid's last copy: the free calls must not write
 * Plaid's copy over them. Empty when the live balance is off (the free calls then work as always).
 */
export async function heldBanks(db: Db, userId: number, nowMs = Date.now()): Promise<Set<string>> {
  const held = new Set<string>();
  if (!liveOn("balance")) return held;
  try {
    for (const [key, s] of await stampsOf(db, userId)) {
      if (!s.liveAt) continue;
      const newer = s.bankAt ? s.bankAt.getTime() < s.liveAt.getTime() : nowMs - s.liveAt.getTime() < HOLD_WITHOUT_DATE_MS;
      if (newer) held.add(key);
    }
  } catch (e: unknown) {
    console.error("[live] held banks not read:", e instanceof Error ? e.message : e);
  }
  return held;
}

/**
 * Takes the right to make one paid call for this bank now: on, not paused, under today's cap, not asked in the
 * last 15 minutes (balance) or hour (refresh), not already being asked. The bank's time is written first, so
 * the free calls running at the same moment already leave its balance alone. Null: don't call.
 */
async function claim(db: Db, userId: number, itemKey: string, kind: LiveKind, nowMs: number): Promise<{ prev: Date | null } | null> {
  if (!liveOn(kind) || nowMs < pausedUntil[kind]) return null;
  if (countToday(kind, nowMs) >= capOf(kind)) return null;
  const k = `${kind}:${userId}:${itemKey}`;
  if (inFlight.has(k)) return null;
  inFlight.add(k);
  try {
    const s = (await stampsOf(db, userId)).get(itemKey);
    const prev = (kind === "balance" ? s?.liveAt : s?.refreshAt) ?? null;
    if (prev && nowMs - prev.getTime() < EVERY_MS[kind]) { inFlight.delete(k); return null; }
    await stamp(db, userId, itemKey, kind, new Date(nowMs));
    countToday(kind, nowMs, +1);
    return { prev };
  } catch (e: unknown) {
    inFlight.delete(k);
    console.error(`[live] ${kind} not started for bank ${itemKey}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** A call that failed isn't billed: give back the count and the bank's previous time. */
async function giveBack(db: Db, userId: number, itemKey: string, kind: LiveKind, prev: Date | null, e: unknown, nowMs: number) {
  countToday(kind, nowMs, -1);
  const code = plaidErrorCode(e);
  if (code && NOT_ENABLED.has(code)) {
    pausedUntil[kind] = nowMs + PAUSE_MS;
    console.error(`[live] Plaid says ${kind === "balance" ? "Balance" : "Transactions Refresh"} isn't enabled (${code}): paused 6 hours`);
  } else {
    console.error(`[live] ${kind} for bank ${itemKey} (user ${userId}) failed: ${code ?? (e instanceof Error ? e.message : String(e))}`);
  }
  try { await stamp(db, userId, itemKey, kind, prev); } catch { /* the 15-minute wait then just applies */ }
}

function done(userId: number, itemKey: string, kind: LiveKind) { inFlight.delete(`${kind}:${userId}:${itemKey}`); }

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

/** The Plaid calls used here (the SDK's PlaidApi has both). */
export type LiveClient = {
  accountsBalanceGet?: (req: { access_token: string }) => Promise<{ data: unknown }>;
  transactionsRefresh?: (req: { access_token: string }) => Promise<{ data: unknown }>;
};

/**
 * One bank's balances: from the bank itself when allowed (live: true), else Plaid's copy (`cached`).
 * Balance takes ~3 s, sometimes up to 30 s (Plaid's docs), so it waits 25 s and then uses Plaid's copy.
 */
export async function balancesNow<D>(
  db: Db, client: LiveClient, userId: number, itemKey: string, accessToken: string, cached: () => Promise<{ data: D }>, nowMs = Date.now(),
): Promise<{ data: D; live: boolean }> {
  const got = client.accountsBalanceGet ? await claim(db, userId, itemKey, "balance", nowMs) : null;
  if (got && client.accountsBalanceGet) {
    try {
      const res = await withTimeout(client.accountsBalanceGet({ access_token: accessToken }), 25_000);
      console.log(`[live] balance from the bank for bank ${itemKey} (user ${userId}); ${usedToday("balance", nowMs)} today`);
      // Same answer as /accounts/get (accounts with balances), only fresh from the bank
      return { data: res.data as D, live: true };
    } catch (e: unknown) {
      await giveBack(db, userId, itemKey, "balance", got.prev, e, nowMs);
    } finally {
      done(userId, itemKey, "balance");
    }
  }
  return { data: (await cached()).data, live: false };
}

/**
 * On a pull: asks Plaid to go to these banks now (when allowed). Plaid answers at once and posts the webhook
 * when it has the movements. Never throws; returns how many banks were asked.
 */
export async function askBanksNow(db: Db, client: LiveClient, userId: number, items: Array<{ key: string; token: string }>, nowMs = Date.now()): Promise<number> {
  if (!client.transactionsRefresh || !liveOn("refresh")) return 0;
  let asked = 0;
  for (const item of items) {
    const got = await claim(db, userId, item.key, "refresh", nowMs);
    if (!got) continue;
    try {
      await withTimeout(client.transactionsRefresh({ access_token: item.token }), 30_000);
      asked++;
      console.log(`[live] Plaid is going to bank ${item.key} (user ${userId}) now; ${usedToday("refresh", nowMs)} today`);
    } catch (e: unknown) {
      await giveBack(db, userId, item.key, "refresh", got.prev, e, nowMs);
    } finally {
      done(userId, item.key, "refresh");
    }
  }
  return asked;
}
