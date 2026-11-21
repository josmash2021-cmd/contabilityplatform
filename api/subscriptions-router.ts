// ── Suscripciones (personal): recurring charges found in the bank movements, plus the ones added by hand ──
// Detection lives in api/lib/subscriptions.ts (similar amounts, a regular interval, enough charges).
// What the person did with each one (cancelled, "not a subscription", alerts already seen) is kept in
// personalSubStates; subscriptions they pay without the bank (cash, another card) in personalManualSubs.
// Cancelling is done by the person at the service; we only follow it: "pending" until the next charge
// date passes without a charge (then "cancelled"), or back to active with an alert if the charge arrives.
// The old bank.cancelSubscription rows (userCancelledSubscriptions) are read as cancelled ones, and
// reactivating one deletes that row, so reactivation works for them too.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bankAccounts, bankTransactions, userCancelledSubscriptions } from "@db/schema";
import { isMissingTable } from "./lib/dbErrors";
import { withMerchantLogos } from "./lib/merchantLogos";
import {
  PER_YEAR, addMonths, cancelRoute, daysBetween, detectSubscriptions, manualNext, merchantKeyOf, perYear, round2,
  type DetectTx, type SubFreq,
} from "./lib/subscriptions";
import { accountShortLabel } from "./lib/banks";

type Db = ReturnType<typeof getDb>;

let ready: Promise<void> | null = null;
/** The tables of this screen, created on first use (no migrations), utf8mb4 for names like "Disney+". */
export function ensureSubTables(db: Db): Promise<void> {
  ready ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS personalSubStates (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        subKey VARCHAR(130) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'on',
        amount DECIMAL(12,2) NULL,
        freq VARCHAR(8) NULL,
        cancelledOn DATE NULL,
        expectedOn DATE NULL,
        confirmedOn DATE NULL,
        failed TINYINT NOT NULL DEFAULT 0,
        raiseSeen DECIMAL(12,2) NULL,
        renewSeen DATE NULL,
        unused TINYINT NOT NULL DEFAULT 0,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX personalSubStates_user_key (userId, subKey)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS personalManualSubs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        name VARCHAR(120) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        freq VARCHAR(8) NOT NULL,
        day TINYINT NOT NULL DEFAULT 1,
        month TINYINT NULL,
        weekday TINYINT NULL,
        via VARCHAR(10) NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX personalManualSubs_user (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS personalSubPrefs (
        userId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        videoAnswer VARCHAR(130) NULL,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Rows of a raw query (mysql2 returns [rows, fields]). */
async function rows<T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as [T[], unknown];
  return r[0];
}

const dayRe = /^\d{4}-\d{2}-\d{2}$/;
const dayInput = z.string().regex(dayRe);
const keyInput = z.string().trim().min(1).max(130);
const freqInput = z.enum(["week", "month", "year"]);
const toDay = (d: unknown): string | null => {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  const s = String(d).slice(0, 10);
  return dayRe.test(s) ? s : null;
};

type StateRow = {
  subKey: string; name: string; status: string; amount: string | null; freq: string | null; cancelledOn: unknown; expectedOn: unknown;
  confirmedOn: unknown; failed: number; raiseSeen: string | null; renewSeen: unknown; unused: number;
};
type ManualRow = { id: number; name: string; amount: string; freq: string; day: number; month: number | null; weekday: number | null; via: string | null; createdAt: unknown };

export type SubStatus = "on" | "pending" | "cancelled";
export type SubItem = {
  key: string;
  name: string;
  freq: SubFreq;
  amount: number;
  perYear: number;
  perMonth: number;
  next: string;
  daysToNext: number;
  since: string | null;
  history: Array<{ date: string; amount: number }>;
  raised: { from: number; to: number } | null;
  raiseSeen: boolean;
  /** A yearly renewal coming within 30 days that the person hasn't dismissed (it shows again 3 days before). */
  renewsSoon: boolean;
  failed: boolean;
  status: SubStatus;
  cancelledOn: string | null;
  expectedOn: string | null;
  confirmedOn: string | null;
  unused: boolean;
  via: "apple" | "google" | null;
  video: boolean;
  manual: boolean;
  manualId: number | null;
  accountId: number | null;
  accountName: string | null;
  logoUrl: string | null;
  cancel: { kind: "web" | "apple" | "google" | "none"; url: string | null };
};

async function upsertState(db: Db, userId: number, key: string, name: string, set: Partial<Record<"status" | "amount" | "freq" | "cancelledOn" | "expectedOn" | "confirmedOn" | "failed" | "raiseSeen" | "renewSeen" | "unused", string | number | null>>) {
  const cols = Object.keys(set) as Array<keyof typeof set>;
  const insertCols = sql.join([sql`userId`, sql`subKey`, sql`name`, ...cols.map((c) => sql.raw(c))], sql`, `);
  const insertVals = sql.join([sql`${userId}`, sql`${key}`, sql`${name}`, ...cols.map((c) => sql`${set[c]}`)], sql`, `);
  const updates = sql.join([sql`name = VALUES(name)`, ...cols.map((c) => sql`${sql.raw(c)} = VALUES(${sql.raw(c)})`)], sql`, `);
  await db.execute(sql`INSERT INTO personalSubStates (${insertCols}) VALUES (${insertVals}) ON DUPLICATE KEY UPDATE ${updates}`);
}

/** The old cancel flow's rows (bank.cancelSubscription), by our key. */
async function legacyCancelled(db: Db, userId: number): Promise<Map<string, { id: number; name: string; amount: number; on: string | null }>> {
  const out = new Map<string, { id: number; name: string; amount: number; on: string | null }>();
  try {
    const list: Array<{ id: number; merchantName: string; originalMonthlyAmount: string; cancelledAt: unknown }> = await db
      .select({ id: userCancelledSubscriptions.id, merchantName: userCancelledSubscriptions.merchantName, originalMonthlyAmount: userCancelledSubscriptions.originalMonthlyAmount, cancelledAt: userCancelledSubscriptions.cancelledAt })
      .from(userCancelledSubscriptions).where(eq(userCancelledSubscriptions.userId, userId));
    for (const r of list) out.set(merchantKeyOf(r.merchantName), { id: r.id, name: r.merchantName, amount: Number(r.originalMonthlyAmount) || 0, on: toDay(r.cancelledAt) });
  } catch (e: unknown) {
    if (!isMissingTable(e)) throw e;
  }
  return out;
}

async function deleteLegacy(db: Db, userId: number, key: string) {
  const legacy = await legacyCancelled(db, userId);
  const row = legacy.get(key);
  if (row) await db.delete(userCancelledSubscriptions).where(and(eq(userCancelledSubscriptions.id, row.id), eq(userCancelledSubscriptions.userId, userId)));
}

const upper = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** Builds the screen's list for one user (and settles pending cancellations as days go by). */
export async function listSubscriptions(db: Db, userId: number, today: string) {
  await ensureSubTables(db);
  const from = addMonths(today, -25);
  const txRows: Array<{ id: number; transactionDate: unknown; description: string; merchantName: string | null; amount: string; category: string | null; bankAccountId: number | null }> = await db
    .select({
      id: bankTransactions.id, transactionDate: bankTransactions.transactionDate, description: bankTransactions.description, merchantName: bankTransactions.merchantName,
      amount: bankTransactions.amount, category: bankTransactions.category, bankAccountId: bankTransactions.bankAccountId,
    })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.userId, userId), eq(bankTransactions.type, "expense"), gte(bankTransactions.transactionDate, sql`${from}`), sql`COALESCE(${bankTransactions.isDuplicate}, 0) = 0`));
  const txs: DetectTx[] = txRows.flatMap((r) => {
    const date = toDay(r.transactionDate);
    return date ? [{ id: r.id, date, description: r.description ?? "", merchantName: r.merchantName, amount: Number(r.amount), category: r.category, accountId: r.bankAccountId }] : [];
  });
  const detected = detectSubscriptions(txs, today);

  // Logos: Plaid's, saved per merchant (looked up from each subscription's latest movement).
  const wanted = new Set(detected.map((d) => d.key));
  const newest = new Map<string, DetectTx>();
  for (const t of txs) {
    const k = merchantKeyOf(t.description, t.merchantName);
    if (!wanted.has(k)) continue;
    const prev = newest.get(k);
    if (!prev || t.date > prev.date) newest.set(k, t);
  }
  const latestTx = detected.map((d) => newest.get(d.key));
  const logos = await withMerchantLogos(db, latestTx.map((t) => ({ merchantName: t?.merchantName ?? null, description: t?.description ?? null })));

  const accts: Array<{ id: number; bankName: string; accountNumber: string | null }> = await db
    .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber }).from(bankAccounts).where(eq(bankAccounts.userId, userId));
  const acctName = (id: number | null) => {
    const a = id === null ? undefined : accts.find((x) => x.id === id);
    return a ? accountShortLabel(a.bankName, a.accountNumber ? String(a.accountNumber) : null) ?? a.bankName : null;
  };

  const states = new Map<string, StateRow>();
  for (const s of await rows<StateRow>(db, sql`SELECT subKey, name, status, amount, freq, cancelledOn, expectedOn, confirmedOn, failed, raiseSeen, renewSeen, unused FROM personalSubStates WHERE userId = ${userId}`)) states.set(s.subKey, s);
  const legacy = await legacyCancelled(db, userId);
  const manual = await rows<ManualRow>(db, sql`SELECT id, name, amount, freq, day, month, weekday, via, createdAt FROM personalManualSubs WHERE userId = ${userId} ORDER BY id`);
  const prefs = (await rows<{ videoAnswer: string | null }>(db, sql`SELECT videoAnswer FROM personalSubPrefs WHERE userId = ${userId}`))[0];

  const items: SubItem[] = [];
  const removed: Array<{ key: string; name: string }> = [];
  const used = new Set<string>();

  for (const [i, d] of detected.entries()) {
    used.add(d.key);
    const st = states.get(d.key);
    const old = !st ? legacy.get(d.key) : undefined;
    let status: string = st?.status ?? (old ? "cancelled" : "on");
    let failed = !!st?.failed;
    let cancelledOn = toDay(st?.cancelledOn) ?? old?.on ?? null;
    let confirmedOn = toDay(st?.confirmedOn) ?? (old ? old.on : null);
    const expectedOn = toDay(st?.expectedOn);
    if (status === "removed") { removed.push({ key: d.key, name: d.name }); continue; }

    // A charge after the day they said they cancelled: the cancellation didn't go through.
    if ((status === "pending" || status === "cancelled") && cancelledOn && d.history.some((h) => h.date > cancelledOn!)) {
      status = "on"; failed = true; cancelledOn = null; confirmedOn = null;
      await upsertState(db, userId, d.key, d.name, { status: "on", failed: 1, cancelledOn: null, expectedOn: null, confirmedOn: null });
      if (old) await deleteLegacy(db, userId, d.key);
    } else if (status === "pending" && expectedOn && daysBetween(expectedOn, today) > 3) {
      // The charge was due more than 3 days ago and didn't come: confirmed.
      status = "cancelled"; confirmedOn = today;
      await upsertState(db, userId, d.key, d.name, { status: "cancelled", confirmedOn: today });
    }
    if (status === "on" && !d.active) continue; // stopped by itself

    const renewSeen = toDay(st?.renewSeen);
    const daysToNext = Math.max(0, daysBetween(today, d.next));
    items.push({
      key: d.key,
      name: d.name,
      freq: d.freq,
      amount: d.amount,
      perYear: perYear(d.amount, d.freq),
      perMonth: round2(perYear(d.amount, d.freq) / 12),
      next: status === "on" ? d.next : expectedOn ?? d.next,
      daysToNext,
      since: d.first,
      history: d.history.slice(-12),
      raised: d.raised,
      raiseSeen: !!d.raised && st?.raiseSeen !== null && st?.raiseSeen !== undefined && Math.abs(Number(st.raiseSeen) - d.raised.to) < 0.005,
      renewsSoon: d.freq === "year" && status === "on" && daysToNext <= 30 && (renewSeen !== d.next || daysToNext <= 3),
      failed,
      status: status as SubStatus,
      cancelledOn,
      expectedOn,
      confirmedOn,
      unused: !!st?.unused,
      via: d.via,
      video: d.video,
      manual: false,
      manualId: null,
      accountId: d.accountId,
      accountName: acctName(d.accountId),
      logoUrl: logos[i]?.logoUrl ?? d.logoUrl ?? null,
      cancel: cancelRoute(d.key, d.via),
    });
  }

  // Old cancelled ones whose charges are too old or too few to detect: still listed as cancelled.
  for (const [key, old] of legacy) {
    if (used.has(key) || states.has(key)) continue;
    items.push({
      key, name: upper(old.name), freq: "month", amount: old.amount, perYear: perYear(old.amount, "month"), perMonth: old.amount,
      next: old.on ?? today, daysToNext: 0, since: null, history: [], raised: null, raiseSeen: false, renewsSoon: false, failed: false,
      status: "cancelled", cancelledOn: old.on, expectedOn: null, confirmedOn: old.on, unused: false, via: null, video: false, manual: false, manualId: null,
      accountId: null, accountName: null, logoUrl: null, cancel: cancelRoute(key, null),
    });
  }

  // Added by hand.
  for (const m of manual) {
    const key = `m:${m.id}`;
    const st = states.get(key);
    const freq = (["week", "month", "year"].includes(m.freq) ? m.freq : "month") as SubFreq;
    const amount = Number(m.amount);
    const status = (st?.status ?? "on") as string;
    if (status === "removed") { removed.push({ key, name: m.name }); continue; }
    const next = manualNext(freq, today, m.day, m.month, m.weekday);
    const via = m.via === "apple" || m.via === "google" ? m.via : null;
    const daysToNext = Math.max(0, daysBetween(today, next));
    const renewSeen = toDay(st?.renewSeen);
    let finalStatus = status as SubStatus;
    let confirmedOn = toDay(st?.confirmedOn);
    const expectedOn = toDay(st?.expectedOn);
    if (finalStatus === "pending" && expectedOn && daysBetween(expectedOn, today) > 3) {
      // We can't see these charges: once the day passes, take the person's word for it.
      finalStatus = "cancelled"; confirmedOn = today;
      await upsertState(db, userId, key, m.name, { status: "cancelled", confirmedOn: today });
    }
    items.push({
      key, name: m.name, freq, amount, perYear: perYear(amount, freq), perMonth: round2(perYear(amount, freq) / 12),
      next: finalStatus === "on" ? next : expectedOn ?? next, daysToNext, since: toDay(m.createdAt), history: [], raised: null, raiseSeen: false,
      renewsSoon: freq === "year" && finalStatus === "on" && daysToNext <= 30 && (renewSeen !== next || daysToNext <= 3),
      failed: false, status: finalStatus, cancelledOn: toDay(st?.cancelledOn), expectedOn, confirmedOn, unused: !!st?.unused,
      via, video: false, manual: true, manualId: m.id, accountId: null, accountName: null, logoUrl: null, cancel: cancelRoute(merchantKeyOf(m.name), via),
    });
  }

  items.sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : b.amount - a.amount));
  const on = items.filter((s) => s.status === "on");
  const yearTotal = round2(on.reduce((s, x) => s + x.perYear, 0));
  return {
    today,
    items,
    removed,
    videoAnswer: prefs?.videoAnswer ?? null,
    totals: { active: on.length, perYear: yearTotal, perMonth: round2(yearTotal / 12), mixed: on.some((s) => s.freq !== "month") },
    perYearFactor: PER_YEAR,
  };
}

const itemInput = z.object({ key: keyInput, name: z.string().trim().min(1).max(255) });

export const subscriptionsRouter = createRouter({
  /** Active, pending and cancelled subscriptions, with what each costs and when it charges next. */
  list: authedQuery.input(z.object({ today: dayInput })).query(async ({ ctx, input }) => {
    return listSubscriptions(getDb(), Number(ctx.user.id), input.today);
  }),

  /**
   * "Ya la cancelé" (pending until the next charge date passes), "Sigo con ella" / "Volver a agregarla"
   * (on), "No es una suscripción" (removed) and undo. Reactivating also clears the old cancel flow's row.
   */
  setStatus: authedQuery
    .input(itemInput.extend({
      status: z.enum(["on", "pending", "removed"]),
      today: dayInput,
      expectedOn: dayInput.optional(),
      amount: z.number().min(0).max(1_000_000).optional(),
      freq: freqInput.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureSubTables(db);
      const userId = Number(ctx.user.id);
      if (input.status === "pending") {
        await upsertState(db, userId, input.key, input.name, {
          status: "pending", cancelledOn: input.today, expectedOn: input.expectedOn ?? input.today, confirmedOn: null, failed: 0,
          amount: input.amount ?? null, freq: input.freq ?? null,
        });
      } else if (input.status === "on") {
        await upsertState(db, userId, input.key, input.name, { status: "on", cancelledOn: null, expectedOn: null, confirmedOn: null, failed: 0 });
        await deleteLegacy(db, userId, input.key);
      } else {
        await upsertState(db, userId, input.key, input.name, { status: "removed" });
      }
      return { ok: true, status: input.status };
    }),

  /** Dismisses an alert: a price rise (until the price changes again), a renewal (until 3 days before), a failed cancel. */
  markSeen: authedQuery
    .input(itemInput.extend({ kind: z.enum(["raise", "renew", "failed"]), amount: z.number().min(0).max(1_000_000).optional(), date: dayInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureSubTables(db);
      const userId = Number(ctx.user.id);
      if (input.kind === "raise") await upsertState(db, userId, input.key, input.name, { raiseSeen: input.amount ?? null });
      else if (input.kind === "renew") await upsertState(db, userId, input.key, input.name, { renewSeen: input.date ?? null });
      else await upsertState(db, userId, input.key, input.name, { failed: 0 });
      return { ok: true };
    }),

  /** "¿Usas las dos?": "both", the key of the one they no longer use, or null to undo. */
  answerVideo: authedQuery
    .input(z.object({ answer: z.string().trim().min(1).max(130).nullable(), unused: itemInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureSubTables(db);
      const userId = Number(ctx.user.id);
      await db.execute(sql`INSERT INTO personalSubPrefs (userId, videoAnswer) VALUES (${userId}, ${input.answer}) ON DUPLICATE KEY UPDATE videoAnswer = VALUES(videoAnswer)`);
      // Only one service is "no longer used" at a time.
      await db.execute(sql`UPDATE personalSubStates SET unused = 0 WHERE userId = ${userId}`);
      if (input.unused) await upsertState(db, userId, input.unused.key, input.unused.name, { unused: 1 });
      return { ok: true };
    }),

  /** A subscription paid without the bank (cash, another card): name, price, how often and which day. */
  addManual: authedQuery
    .input(z.object({
      name: z.string().trim().min(1).max(120),
      amount: z.number().min(0.5).max(100_000),
      freq: freqInput,
      day: z.number().int().min(1).max(31),
      month: z.number().int().min(1).max(12).nullable().optional(),
      weekday: z.number().int().min(0).max(6).nullable().optional(),
      via: z.enum(["apple", "google"]).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureSubTables(db);
      const userId = Number(ctx.user.id);
      if (input.freq === "year") {
        const m = input.month ?? 1;
        if (input.day > new Date(Date.UTC(2028, m, 0)).getUTCDate()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: ctx.lang === "en" ? "That date doesn't exist." : "Esa fecha no existe." });
        }
      }
      const same = await rows<{ id: number }>(db, sql`SELECT id FROM personalManualSubs WHERE userId = ${userId} AND LOWER(name) = LOWER(${input.name}) LIMIT 1`);
      if (same.length) throw new TRPCError({ code: "CONFLICT", message: ctx.lang === "en" ? `${input.name} is already in your list.` : `Ya tienes ${input.name} en tu lista.` });
      const amount = (Math.round(input.amount * 100) / 100).toFixed(2);
      const r = (await db.execute(sql`INSERT INTO personalManualSubs (userId, name, amount, freq, day, month, weekday, via)
        VALUES (${userId}, ${input.name}, ${amount}, ${input.freq}, ${Math.min(input.day, input.freq === "month" ? 28 : 31)}, ${input.freq === "year" ? input.month ?? 1 : null}, ${input.freq === "week" ? input.weekday ?? 1 : null}, ${input.via ?? null})`)) as unknown as [{ insertId: number }];
      return { id: Number(r[0].insertId), key: `m:${Number(r[0].insertId)}` };
    }),

  /** Deletes one added by hand (its state goes with it). */
  removeManual: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await ensureSubTables(db);
    const userId = Number(ctx.user.id);
    await db.execute(sql`DELETE FROM personalManualSubs WHERE id = ${input.id} AND userId = ${userId}`);
    await db.execute(sql`DELETE FROM personalSubStates WHERE userId = ${userId} AND subKey = ${`m:${input.id}`}`);
    return { ok: true };
  }),
});

/** Every subscription row of a user (used when an account is deleted). */
export async function deleteUserSubData(db: Db, userId: number): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM personalSubStates WHERE userId = ${userId}`);
    await db.execute(sql`DELETE FROM personalManualSubs WHERE userId = ${userId}`);
    await db.execute(sql`DELETE FROM personalSubPrefs WHERE userId = ${userId}`);
  } catch (e: unknown) {
    if (!isMissingTable(e)) throw e;
  }
}
