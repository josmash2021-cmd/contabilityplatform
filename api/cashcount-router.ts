// ── Cierre de caja (end-of-day cash count) ──
// Mounted as `sales.cashCount` (api/sales-router.ts), so the team rules for sales apply:
// staff and the accountant read it; staff may also save a count (sales.cashCount.save in
// api/lib/team.ts); the accountant only reads.
//
// What "should be in the drawer": every cash payment received today (POS sales, the cash
// part of split sales, invoice payments in cash), minus cash given back today (invoice refunds
// and voids). Payments of a sale later cancelled from Movimientos (no refund on record) don't count.
// Today is the calendar day in the device's time zone.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { isMissingTable } from "./lib/dbErrors";
import { BUSINESS_TIME_ZONE } from "./lib/quotes";
import {
  cashCountResult, centsToDecimal, dayIn, dayTotals, dayWindow, isIsoDay, isValidTimeZone, toCents, type CountStatus, type PayMethod,
} from "./lib/ventas";
import { epoch, rowsOf } from "./services-router";

type Db = ReturnType<typeof getDb>;

let tableReady: Promise<void> | null = null;

export function ensureCashCountTable(db: Db): Promise<void> {
  tableReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cashCounts (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        countedBy BIGINT UNSIGNED NULL,
        countedByName VARCHAR(255) NULL,
        day DATE NOT NULL,
        timeZone VARCHAR(64) NOT NULL,
        expectedCash DECIMAL(12,2) NOT NULL,
        countedCash DECIMAL(12,2) NOT NULL,
        difference DECIMAL(12,2) NOT NULL,
        salesCount INT NOT NULL DEFAULT 0,
        salesTotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        zelleTotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        cardTotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        note VARCHAR(255) NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX cashCounts_userId_day_idx (userId, day)
      )
    `);
  })().catch((e: unknown) => {
    tableReady = null;
    throw e;
  });
  return tableReady;
}

/** Deletes a user's saved cash counts (account deletion). */
export async function deleteUserCashCounts(db: Db, userId: number): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM cashCounts WHERE userId = ${userId}`);
  } catch (e: unknown) {
    if (!isMissingTable(e)) throw e;
  }
}

export type DayPayment = {
  id: number;
  at: Date;
  saleId: number;
  number: string;
  customerName: string | null;
  method: PayMethod;
  cents: number;
  /** A payment on an invoice (the sale was made earlier or is still partly owed). */
  invoice: boolean;
};

export type DaySummary = {
  day: string;
  timeZone: string;
  payments: DayPayment[];
  refunds: Array<{ method: PayMethod; cents: number }>;
  totals: { cash: number; zelle: number; card: number; total: number };
  expectedCashCents: number;
};

/** Every payment received on a day, and the cash that should be in the drawer. */
export async function daySummary(db: Db, userId: number, day: string, timeZone: string): Promise<DaySummary> {
  const { start, end } = dayWindow(day, timeZone);
  type Row = { id: number; method: PayMethod; amount: string; ts: number | string; saleId: number; invoiceNumber: string; customerName: string | null; status: string; saleTs: number | string };
  const rows = rowsOf<Row>(await db.execute(sql`
    SELECT pr.id, pr.method, pr.amount, UNIX_TIMESTAMP(pr.createdAt) AS ts, s.id AS saleId, s.invoiceNumber, s.customerName, s.status,
      UNIX_TIMESTAMP(s.createdAt) AS saleTs
    FROM paymentRecords pr JOIN sales s ON s.id = pr.saleId
    WHERE s.createdBy = ${userId} AND pr.createdAt >= FROM_UNIXTIME(${epoch(start)}) AND pr.createdAt < FROM_UNIXTIME(${epoch(end)})
    ORDER BY pr.createdAt DESC, pr.id DESC
  `));

  // Refunds given today, and which sales had money given back (Facturas keeps that log).
  let refunds: Array<{ method: PayMethod; cents: number }> = [];
  const refundedSales = new Set<number>();
  try {
    const r = rowsOf<{ method: PayMethod; amount: string; saleId: number; paidOn: string }>(await db.execute(sql`
      SELECT method, amount, saleId, DATE_FORMAT(paidOn, '%Y-%m-%d') AS paidOn FROM invoicePayments
      WHERE userId = ${userId} AND kind = 'refund'
    `));
    for (const x of r) refundedSales.add(Number(x.saleId));
    refunds = r.filter((x) => x.paidOn === day).map((x) => ({ method: x.method, cents: toCents(x.amount) }));
  } catch (e: unknown) {
    if (!isMissingTable(e)) throw e;
  }

  const payments: DayPayment[] = rows
    // A sale cancelled without a refund on record (Movimientos → Anular): its money was never kept.
    .filter((r) => r.status === "completed" || r.status === "pending" || refundedSales.has(Number(r.saleId)))
    .map((r) => ({
      id: Number(r.id),
      at: new Date(Number(r.ts) * 1000),
      saleId: Number(r.saleId),
      number: r.invoiceNumber,
      customerName: r.customerName,
      method: r.method,
      cents: toCents(r.amount),
      // Paid more than a minute after the sale was made: an invoice being paid, not a counter sale.
      invoice: r.status === "pending" || Number(r.ts) - Number(r.saleTs) > 60,
    }));

  const totals = dayTotals(payments, refunds);
  return { day, timeZone, payments, refunds, totals, expectedCashCents: totals.cash };
}

export type SavedCount = {
  id: number;
  day: string;
  at: Date;
  countedByName: string | null;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  status: CountStatus;
  note: string | null;
};

async function loadCounts(db: Db, userId: number, limit: number): Promise<SavedCount[]> {
  type Row = { id: number; day: string; ts: number | string; countedBy: number | null; countedByName: string | null; expectedCash: string; countedCash: string; difference: string; note: string | null };
  const rows = rowsOf<Row>(await db.execute(sql`
    SELECT id, DATE_FORMAT(day, '%Y-%m-%d') AS day, UNIX_TIMESTAMP(createdAt) AS ts, countedBy, countedByName, expectedCash, countedCash, difference, note
    FROM cashCounts WHERE userId = ${userId} ORDER BY createdAt DESC, id DESC LIMIT ${limit}
  `));
  return rows.map((r) => {
    const expectedCents = toCents(r.expectedCash);
    const countedCents = toCents(r.countedCash);
    return {
      // Who counted: only shown when it was a team member, not the owner.
      id: Number(r.id), day: r.day, at: new Date(Number(r.ts) * 1000), countedByName: Number(r.countedBy) === userId ? null : r.countedByName,
      expectedCents, countedCents, ...cashCountResult(expectedCents, countedCents), note: r.note,
    };
  });
}

const tzInput = z.string().max(64).refine(isValidTimeZone);

/** The day asked for (today by default) in the caller's time zone; never a future day. */
function pickDay(input: { timeZone?: string; day?: string } | undefined, lang: string): { day: string; timeZone: string } {
  const timeZone = input?.timeZone ?? BUSINESS_TIME_ZONE;
  const today = dayIn(new Date(), timeZone);
  const day = input?.day ?? today;
  if (!isIsoDay(day) || day > today) {
    throw new TRPCError({ code: "BAD_REQUEST", message: lang === "en" ? "That day isn't valid." : "Ese día no es válido." });
  }
  return { day, timeZone };
}

export const cashCountRouter = createRouter({
  /** The day's money in by method, the payments one by one, and the counts saved (today's last one first). */
  today: authedQuery
    .input(z.object({ timeZone: tzInput.optional(), day: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const { day, timeZone } = pickDay(input, ctx.lang);
      await ensureCashCountTable(db);
      const summary = await daySummary(db, userId, day, timeZone);
      const history = await loadCounts(db, userId, 8);
      return { ...summary, lastCount: history.find((c) => c.day === day) ?? null, history };
    }),

  /** Saves a count: the server works out what should be there, so the difference can't be made up. */
  save: authedQuery
    .input(z.object({
      timeZone: tzInput.optional(),
      day: z.string().optional(),
      counted: z.number().finite().min(0).max(10_000_000).or(z.string().regex(/^\d{1,8}(\.\d{1,2})?$/)),
      note: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const { day, timeZone } = pickDay(input, ctx.lang);
      await ensureCashCountTable(db);
      const s = await daySummary(db, userId, day, timeZone);
      const countedCents = toCents(input.counted);
      const res = cashCountResult(s.expectedCashCents, countedCents);
      const who = ctx.member ? { id: ctx.member.userId, name: ctx.member.name ?? ctx.member.email } : { id: userId, name: ctx.user.name ?? null };
      const ins = await db.execute(sql`
        INSERT INTO cashCounts (userId, countedBy, countedByName, day, timeZone, expectedCash, countedCash, difference, salesCount, salesTotal, zelleTotal, cardTotal, note)
        VALUES (${userId}, ${who.id}, ${who.name}, ${day}, ${timeZone}, ${centsToDecimal(s.expectedCashCents)}, ${centsToDecimal(countedCents)},
          ${centsToDecimal(res.differenceCents)}, ${s.payments.length}, ${centsToDecimal(s.totals.total)}, ${centsToDecimal(s.totals.zelle)},
          ${centsToDecimal(s.totals.card)}, ${input.note || null})
      `);
      const id = Number((ins as unknown as Array<{ insertId: number }>)[0].insertId);
      return { id, day, expectedCents: s.expectedCashCents, countedCents, ...res };
    }),
});
