// ── Cuadrar con tu estado de cuenta (business Bancos, Pro and Negocio) ──
// The owner types the ending balance printed on a bank statement; we compare it with the records for that
// account at the statement's last day and, when it matches to the cent, they close the period. A closed
// period protects its movements: Por revisar and deleting a movement refuse to change them
// (assertPeriodsOpen / assertNotReconciled below) until the owner reopens it. Reopening is recorded.
// The pure rules (money in cents, the balance math, periods, likely causes) live in api/lib/reconcile.ts.
// Team access (api/lib/team.ts): members can't call the mutations; the accountant reads.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { bigint, date, decimal, index, mysqlEnum, mysqlTable, serial, timestamp } from "drizzle-orm/mysql-core";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bankAccounts, bankTransactions } from "@db/schema";
import { isMissingTable } from "./lib/dbErrors";
import { getPlanContext, type PlanContext, type PlanUser } from "./lib/planAccess";
import { msg, type Lang } from "./lib/i18n";
import {
  EDGE_DAYS, addDays, bookBalanceAtEnd, centsToDecimal, checkPeriod, compareBalances, decimalToCents, expectedFromPrevious,
  findCauses, movementOutCents, overlaps, statementToCents, STATEMENT_RE, suggestPeriod, utcToday,
  type Cause, type Period, type PeriodProblem, type Row,
} from "./lib/reconcile";

type Db = ReturnType<typeof getDb>;
type Exec = [{ insertId: number | string; affectedRows: number }];

/** Movements older than this aren't in Por revisar (api/lib/bankReview.ts REVIEW_WINDOW_DAYS). */
const REVIEW_WINDOW_DAYS = 60;
const HISTORY_MAX = 12;
const CAUSE_ROWS_MAX = 5000;

// ── Table (created on first use; additive, never touches other tables) ──
export const bankReconciliations = mysqlTable("bankReconciliations", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  bankAccountId: bigint("bankAccountId", { mode: "number", unsigned: true }).notNull(),
  periodStart: date("periodStart", { mode: "string" }).notNull(),
  periodEnd: date("periodEnd", { mode: "string" }).notNull(),
  statementBalance: decimal("statementBalance", { precision: 14, scale: 2 }).notNull(),
  bookBalance: decimal("bookBalance", { precision: 14, scale: 2 }).notNull(),
  difference: decimal("difference", { precision: 14, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["closed", "reopened"]).notNull(),
  closedAt: timestamp("closedAt").notNull(),
  reopenedAt: timestamp("reopenedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [index("bankReconciliations_acct_idx").on(t.userId, t.bankAccountId, t.status, t.periodEnd)]);

let tablesReady: Promise<void> | null = null;
export function ensureReconcileTables(db: Db): Promise<void> {
  tablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bankReconciliations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        bankAccountId BIGINT UNSIGNED NOT NULL,
        periodStart DATE NOT NULL,
        periodEnd DATE NOT NULL,
        statementBalance DECIMAL(14,2) NOT NULL,
        bookBalance DECIMAL(14,2) NOT NULL,
        difference DECIMAL(14,2) NOT NULL,
        status ENUM('closed', 'reopened') NOT NULL,
        closedAt TIMESTAMP NOT NULL,
        reopenedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX bankReconciliations_acct_idx (userId, bankAccountId, status, periodEnd)
      )
    `);
  })().catch((e) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

// ── Messages (es / en, by ctx.lang) ──
const MONTHS: Record<Lang, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
function dayLabel(lang: Lang, iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return lang === "en" ? `${MONTHS.en[m - 1]} ${d}` : `${d} ${MONTHS.es[m - 1]}`;
}
function periodLabel(lang: Lang, p: Period): string {
  const year = p.end.slice(0, 4);
  return `${dayLabel(lang, p.start)} – ${dayLabel(lang, p.end)}${lang === "en" ? "," : ""} ${year}`;
}
function accountLabel(bankName: string | null, accountNumber: string | null): string {
  const mask = (accountNumber ?? "").slice(-4);
  return `${bankName || "Banco"}${mask ? ` ••${mask}` : ""}`;
}

const MESSAGES = {
  es: {
    accountNotFound: "No encontramos esa cuenta.",
    badStatement: "Escribe el saldo final tal como sale en tu estado de cuenta, por ejemplo 11794.21.",
    badDate: "Esa fecha no es válida.",
    order: "La fecha de inicio tiene que ser antes de la fecha final.",
    future: "El periodo no puede terminar después de hoy: tu banco todavía no ha enviado ese estado de cuenta.",
    tooLong: "El periodo es demasiado largo. Usa las fechas de un estado de cuenta.",
    notMatching: "Todavía no cuadra. Compara de nuevo y revisa las diferencias antes de cerrar.",
    unreviewed: "Antes de cerrar, revisa los movimientos de este periodo que siguen en Por revisar.",
    overlap: (p: string) => `Ese periodo se cruza con uno que ya cerraste (${p}). Elige las fechas de otro estado de cuenta.`,
    periodNotFound: "No encontramos ese periodo cerrado.",
    notLatest: (p: string) => `Primero reabre el periodo más reciente (${p}).`,
    locked: (p: string, acct: string) => `Este movimiento está en un periodo que ya cuadraste y cerraste (${p}, ${acct}). Para cambiarlo, reabre ese periodo en Bancos.`,
    lockedMany: (n: number, p: string, acct: string) => `${n} de estos movimientos están en un periodo que ya cuadraste y cerraste (${p}, ${acct}). Para cambiarlos, reabre ese periodo en Bancos.`,
  },
  en: {
    accountNotFound: "We couldn't find that account.",
    badStatement: "Type the ending balance exactly as it shows on your statement, for example 11794.21.",
    badDate: "That date isn't valid.",
    order: "The start date has to be before the end date.",
    future: "The period can't end after today: your bank hasn't sent that statement yet.",
    tooLong: "That period is too long. Use the dates of one statement.",
    notMatching: "It doesn't match yet. Compare again and check the differences before closing.",
    unreviewed: "Before closing, review this period's transactions that are still in To review.",
    overlap: (p: string) => `That period overlaps one you already closed (${p}). Pick the dates of another statement.`,
    periodNotFound: "We couldn't find that closed period.",
    notLatest: (p: string) => `Reopen the most recent period first (${p}).`,
    locked: (p: string, acct: string) => `This transaction is in a period you already reconciled and closed (${p}, ${acct}). To change it, reopen that period in Banks.`,
    lockedMany: (n: number, p: string, acct: string) => `${n} of these transactions are in a period you already reconciled and closed (${p}, ${acct}). To change them, reopen that period in Banks.`,
  },
};
type PlainKey = "accountNotFound" | "badStatement" | "periodNotFound" | "notMatching" | "unreviewed" | PeriodProblem;

function fail(code: TRPCError["code"], lang: Lang, key: PlainKey): never {
  throw new TRPCError({ code, message: MESSAGES[lang][key] });
}

// ── Plan: Pro and Negocio (the trial and admins get everything) ──
export function reconcileAllowed(plan: PlanContext): boolean {
  return plan.admin || (plan.mode === "business" && (plan.tier === "pro" || plan.tier === "business"));
}
async function requireReconcile(db: Db, user: PlanUser, lang: Lang): Promise<void> {
  if (!reconcileAllowed(await getPlanContext(db, user))) throw new TRPCError({ code: "FORBIDDEN", message: msg(lang, "planMissingFeature") });
}

// ── Reading ──
type AccountRow = { id: number; bankName: string | null; accountNumber: string | null; accountType: string | null; currentBalance: string | null; lastSyncedAt: string | null };

async function accountOf(db: Db, userId: number, accountId: number | undefined): Promise<AccountRow | null> {
  const cols = {
    id: bankAccounts.id, bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber, accountType: bankAccounts.accountType,
    currentBalance: bankAccounts.currentBalance, lastSyncedAt: sql<string | null>`DATE_FORMAT(${bankAccounts.lastSyncedAt}, '%Y-%m-%d')`,
  };
  const where = accountId
    ? and(eq(bankAccounts.userId, userId), eq(bankAccounts.id, accountId))
    : and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, true));
  const rows: AccountRow[] = await db.select(cols).from(bankAccounts).where(where).orderBy(desc(bankAccounts.connectedAt)).limit(1);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

const isDebt = (type: string | null) => type === "credit" || type === "loan";

type StoredPeriod = { id: number; start: string; end: string; statement: string; book: string; status: "closed" | "reopened"; closedAt: string; reopenedAt: string | null };

async function periodsOf(db: Db, userId: number, accountId: number): Promise<StoredPeriod[]> {
  const rows: StoredPeriod[] = await db.select({
    id: bankReconciliations.id,
    start: sql<string>`DATE_FORMAT(${bankReconciliations.periodStart}, '%Y-%m-%d')`,
    end: sql<string>`DATE_FORMAT(${bankReconciliations.periodEnd}, '%Y-%m-%d')`,
    statement: bankReconciliations.statementBalance,
    book: bankReconciliations.bookBalance,
    status: bankReconciliations.status,
    closedAt: sql<string>`DATE_FORMAT(${bankReconciliations.closedAt}, '%Y-%m-%d')`,
    reopenedAt: sql<string | null>`DATE_FORMAT(${bankReconciliations.reopenedAt}, '%Y-%m-%d')`,
  }).from(bankReconciliations)
    .where(and(eq(bankReconciliations.userId, userId), eq(bankReconciliations.bankAccountId, accountId)))
    .orderBy(desc(bankReconciliations.periodEnd), desc(bankReconciliations.id));
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

/** Plaid's sign: + money out, − money in. Rows without plaidAmount use their type. */
const outSql = sql`CASE WHEN ${bankTransactions.plaidAmount} IS NOT NULL THEN ${bankTransactions.plaidAmount} WHEN ${bankTransactions.type} = 'income' THEN -ABS(${bankTransactions.amount}) ELSE ABS(${bankTransactions.amount}) END`;

async function sumOut(db: Db, userId: number, accountId: number, from: string | null, to: string | null): Promise<{ cents: number; count: number }> {
  const conds = [eq(bankTransactions.userId, userId), eq(bankTransactions.bankAccountId, accountId)];
  if (from) conds.push(sql`${bankTransactions.transactionDate} >= ${from}`);
  if (to) conds.push(sql`${bankTransactions.transactionDate} <= ${to}`);
  const rows: Array<{ total: string | null; n: number | string }> = await db.select({ total: sql<string | null>`SUM(${outSql})`, n: sql<number>`COUNT(*)` })
    .from(bankTransactions).where(and(...conds));
  return { cents: decimalToCents(rows[0]?.total ?? "0"), count: Number(rows[0]?.n ?? 0) };
}

type TxRow = { id: number; date: string; description: string; amount: string | null; plaidAmount: string | null; type: string | null; reviewed: number | string | null };
const toRow = (r: TxRow): Row => ({
  id: Number(r.id), date: r.date, description: r.description,
  outCents: movementOutCents({ plaidAmount: r.plaidAmount, amount: r.amount, type: r.type }),
  reviewed: Number(r.reviewed ?? 0) === 1,
});

async function movementsBetween(db: Db, userId: number, accountId: number, from: string, to: string): Promise<Row[]> {
  const rows: TxRow[] = await db.select({
    id: bankTransactions.id,
    date: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
    description: bankTransactions.description,
    amount: bankTransactions.amount,
    plaidAmount: bankTransactions.plaidAmount,
    type: bankTransactions.type,
    reviewed: sql<number>`COALESCE(${bankTransactions.isReconciled}, 0)`,
  }).from(bankTransactions)
    .where(and(eq(bankTransactions.userId, userId), eq(bankTransactions.bankAccountId, accountId),
      sql`${bankTransactions.transactionDate} >= ${from}`, sql`${bankTransactions.transactionDate} <= ${to}`))
    .orderBy(asc(bankTransactions.transactionDate), asc(bankTransactions.id))
    .limit(CAUSE_ROWS_MAX);
  return rows.map(toRow);
}

const periodInput = z.object({
  accountId: z.number().int().positive(),
  start: z.string().length(10),
  end: z.string().length(10),
  /** The ending balance, normalized by the app: "11794.21", "-50". */
  statement: z.string().max(16),
});
type PeriodInput = z.infer<typeof periodInput>;

/** Compares one statement with the records. Shared by compare (read) and close (which recomputes it, never trusting the app). */
async function evaluate(db: Db, userId: number, lang: Lang, input: PeriodInput) {
  const today = utcToday();
  const problem = checkPeriod(input, today);
  if (problem) fail("BAD_REQUEST", lang, problem);
  const statementCents = STATEMENT_RE.test(input.statement) ? statementToCents(input.statement) : null;
  if (statementCents === null) fail("BAD_REQUEST", lang, "badStatement");
  const account = await accountOf(db, userId, input.accountId);
  if (!account) fail("NOT_FOUND", lang, "accountNotFound");
  const period: Period = { start: input.start, end: input.end };
  const debt = isDebt(account.accountType);

  await ensureReconcileTables(db);
  const stored = await periodsOf(db, userId, account.id);
  const closed = stored.filter((p) => p.status === "closed");
  const overlap = closed.find((p) => overlaps(p, period)) ?? null;
  const previous = closed.find((p) => p.end === addDays(period.start, -1)) ?? null;

  const currentCents = decimalToCents(account.currentBalance);
  const after = await sumOut(db, userId, account.id, addDays(period.end, 1), null);
  const inside = await sumOut(db, userId, account.id, period.start, period.end);
  const bookCents = bookBalanceAtEnd({ currentCents, afterOutCents: after.cents, debt });
  const fromPreviousCents = previous ? expectedFromPrevious({ previousStatementCents: decimalToCents(previous.statement), periodOutCents: inside.cents, debt }) : null;
  const result = compareBalances({ statementCents, bookCents, fromPreviousCents });

  // Movements from a few days before the period up to today: for the likely causes and Por revisar.
  const rows = await movementsBetween(db, userId, account.id, addDays(period.start, -EDGE_DAYS), today);
  const windowStart = addDays(today, -REVIEW_WINDOW_DAYS);
  const pending = rows.filter((r) => !r.reviewed && r.date >= period.start && r.date <= period.end && r.date >= windowStart);
  const causes: Cause[] = result.matches || !result.mismatch ? [] : findCauses({
    rows, period, differenceCents: result.differenceCents, mismatch: result.mismatch, today,
    lastSyncedAt: account.lastSyncedAt, unreviewed: { count: pending.length, rows: pending },
  });

  return {
    account, period, debt, today, statementCents, bookCents, currentCents, fromPreviousCents, result, causes, overlap, previous,
    after, inside, pending,
  };
}

const money = (cents: number) => ({ cents, value: centsToDecimal(cents) });

// ── Closed periods protect their movements ──
type LockedRow = { id: number; start: string; end: string; bankName: string | null; accountNumber: string | null };

async function lockedAmong(db: Db, userId: number, ids: number[]): Promise<LockedRow[]> {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (unique.length === 0) return [];
  try {
    const res = await db.execute(sql`
      SELECT t.id AS id, DATE_FORMAT(r.periodStart, '%Y-%m-%d') AS start, DATE_FORMAT(r.periodEnd, '%Y-%m-%d') AS end,
             a.bankName AS bankName, a.accountNumber AS accountNumber
      FROM bankTransactions t
      JOIN bankReconciliations r ON r.userId = t.userId AND r.bankAccountId = t.bankAccountId AND r.status = 'closed'
        AND t.transactionDate BETWEEN r.periodStart AND r.periodEnd
      LEFT JOIN bankAccounts a ON a.id = t.bankAccountId
      WHERE t.userId = ${userId} AND t.id IN (${sql.join(unique.map((n) => sql`${n}`), sql`, `)})
      ORDER BY r.periodEnd DESC
    `);
    const rows = (res as unknown as [LockedRow[]])[0] ?? [];
    return rows.map((r) => ({ ...r, id: Number(r.id) }));
  } catch (e: unknown) {
    // Nobody has closed a period yet: the table doesn't exist, so nothing is locked.
    if (isMissingTable(e)) return [];
    throw e;
  }
}

/** The ids (of those given) that sit inside a closed period of their account: for jobs that should skip them. */
export async function closedPeriodIds(db: Db, userId: number, ids: number[]): Promise<Set<number>> {
  return new Set((await lockedAmong(db, userId, ids)).map((r) => r.id));
}

/**
 * Throws FORBIDDEN, saying which period and how to reopen it, when any of these movements is inside a closed
 * period of its account. For Por revisar (confirm, reopen, setCategory) and bank.delete. Ids that aren't the
 * user's, or don't exist, are ignored (the caller reports those).
 */
export async function assertPeriodsOpen(db: Db, userId: number, bankTransactionIds: number[], lang: Lang = "es"): Promise<void> {
  const locked = await lockedAmong(db, userId, bankTransactionIds);
  if (locked.length === 0) return;
  const first = locked[0];
  const p = periodLabel(lang, first);
  const acct = accountLabel(first.bankName, first.accountNumber);
  const count = new Set(locked.map((r) => r.id)).size;
  throw new TRPCError({ code: "FORBIDDEN", message: count === 1 ? MESSAGES[lang].locked(p, acct) : MESSAGES[lang].lockedMany(count, p, acct) });
}

/** One movement (bank.delete). */
export function assertNotReconciled(db: Db, userId: number, bankTransactionId: number, lang: Lang = "es"): Promise<void> {
  return assertPeriodsOpen(db, userId, [bankTransactionId], lang);
}

/** Deletes a user's closed periods (for account deletion). */
export async function deleteUserReconcileData(db: Db, userId: number): Promise<void> {
  try {
    await db.delete(bankReconciliations).where(eq(bankReconciliations.userId, userId));
  } catch (e: unknown) {
    if (!isMissingTable(e)) throw e;
  }
}

// ── Router ──
export const reconcileRouter = createRouter({
  /** The card: which period to start on, the closed periods (newest first) and whether the plan includes it. */
  overview: authedQuery
    .input(z.object({ accountId: z.number().int().positive().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      if (!reconcileAllowed(await getPlanContext(db, ctx.user))) return { locked: true as const };
      const account = await accountOf(db, userId, input?.accountId);
      const canChange = !ctx.member;
      if (!account) return { locked: false as const, account: null, canChange };
      await ensureReconcileTables(db);
      const stored = await periodsOf(db, userId, account.id);
      const closed = stored.filter((p) => p.status === "closed");
      const reopened = stored.filter((p) => p.status === "reopened");
      const today = utcToday();
      const suggestion = suggestPeriod({ today, lastClosed: closed[0] ?? null, reopened, closed });
      const reopenedRow = suggestion.reopenedId ? reopened.find((r) => r.id === suggestion.reopenedId) ?? null : null;
      return {
        locked: false as const,
        canChange,
        today,
        account: { id: account.id, debt: isDebt(account.accountType), balance: money(decimalToCents(account.currentBalance)), lastSyncedAt: account.lastSyncedAt },
        suggestion: { ...suggestion, reopenedAt: reopenedRow?.reopenedAt ?? null },
        lastClosed: closed[0] ? { start: closed[0].start, end: closed[0].end } : null,
        history: closed.slice(0, HISTORY_MAX).map((p, i) => ({
          id: p.id, start: p.start, end: p.end, statement: money(decimalToCents(p.statement)), closedAt: p.closedAt,
          // Only the newest can be reopened: older ones lead into it.
          canReopen: i === 0,
        })),
      };
    }),

  /** Step 2: compares the statement's ending balance with the records. Reads only (the accountant can too). */
  compare: authedQuery.input(periodInput).query(async ({ input, ctx }) => {
    const db = getDb();
    await requireReconcile(db, ctx.user, ctx.lang);
    const e = await evaluate(db, Number(ctx.user.id), ctx.lang, input);
    return {
      period: e.period,
      debt: e.debt,
      matches: e.result.matches,
      mismatch: e.result.mismatch,
      difference: money(e.result.differenceCents),
      statement: money(e.statementCents),
      book: money(e.bookCents),
      current: { ...money(e.currentCents), lastSyncedAt: e.account.lastSyncedAt },
      after: { ...money(e.after.cents), count: e.after.count },
      inside: { ...money(e.inside.cents), count: e.inside.count },
      previous: e.previous ? { end: e.previous.end, statement: money(decimalToCents(e.previous.statement)) } : null,
      fromPrevious: e.fromPreviousCents === null ? null : money(e.fromPreviousCents),
      causes: e.causes,
      pendingReview: { count: e.pending.length },
      overlap: e.overlap ? { start: e.overlap.start, end: e.overlap.end } : null,
      closable: e.result.matches && e.pending.length === 0 && !e.overlap,
    };
  }),

  /** Step 3: closes the period. Recomputes the comparison; refuses unless it matches to the cent. */
  close: authedQuery.input(periodInput).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const userId = Number(ctx.user.id);
    const lang = ctx.lang;
    await requireReconcile(db, ctx.user, lang);
    const e = await evaluate(db, userId, lang, input);
    if (e.overlap) throw new TRPCError({ code: "CONFLICT", message: MESSAGES[lang].overlap(periodLabel(lang, e.overlap)) });
    if (!e.result.matches) fail("CONFLICT", lang, "notMatching");
    if (e.pending.length > 0) fail("CONFLICT", lang, "unreviewed");
    const id = await db.transaction(async (t: Db) => {
      // One close at a time per account: lock the account row, then check again for an overlap.
      await t.execute(sql`SELECT id FROM bankAccounts WHERE id = ${e.account.id} AND userId = ${userId} FOR UPDATE`);
      const again: Array<{ id: number }> = await t.select({ id: bankReconciliations.id }).from(bankReconciliations).where(and(
        eq(bankReconciliations.userId, userId), eq(bankReconciliations.bankAccountId, e.account.id), eq(bankReconciliations.status, "closed"),
        sql`${bankReconciliations.periodStart} <= ${e.period.end}`, sql`${bankReconciliations.periodEnd} >= ${e.period.start}`,
      )).limit(1);
      if (again[0]) throw new TRPCError({ code: "CONFLICT", message: MESSAGES[lang].overlap(periodLabel(lang, e.period)) });
      const res: Exec = await t.execute(sql`
        INSERT INTO bankReconciliations (userId, bankAccountId, periodStart, periodEnd, statementBalance, bookBalance, difference, status, closedAt)
        VALUES (${userId}, ${e.account.id}, ${e.period.start}, ${e.period.end}, ${centsToDecimal(e.statementCents)}, ${centsToDecimal(e.bookCents)},
                ${centsToDecimal(e.statementCents - e.bookCents)}, 'closed', UTC_TIMESTAMP())
      `);
      return Number(res[0].insertId);
    });
    return { id, start: e.period.start, end: e.period.end };
  }),

  /** Reopens the newest closed period of its account (after the owner confirms). Kept as a record. */
  reopen: authedQuery
    .input(z.object({ id: z.number().int().positive(), confirm: z.literal(true) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const lang = ctx.lang;
      await requireReconcile(db, ctx.user, lang);
      await ensureReconcileTables(db);
      return db.transaction(async (t: Db) => {
        const rows: Array<{ id: number; bankAccountId: number }> = await t.select({ id: bankReconciliations.id, bankAccountId: bankReconciliations.bankAccountId })
          .from(bankReconciliations)
          .where(and(eq(bankReconciliations.id, input.id), eq(bankReconciliations.userId, userId), eq(bankReconciliations.status, "closed"))).limit(1);
        const row = rows[0];
        if (!row) fail("NOT_FOUND", lang, "periodNotFound");
        await t.execute(sql`SELECT id FROM bankAccounts WHERE id = ${row.bankAccountId} AND userId = ${userId} FOR UPDATE`);
        const newest = (await periodsOf(t, userId, Number(row.bankAccountId))).find((p) => p.status === "closed");
        if (newest && newest.id !== Number(row.id)) {
          throw new TRPCError({ code: "CONFLICT", message: MESSAGES[lang].notLatest(periodLabel(lang, newest)) });
        }
        await t.execute(sql`UPDATE bankReconciliations SET status = 'reopened', reopenedAt = UTC_TIMESTAMP() WHERE id = ${row.id} AND userId = ${userId}`);
        return { id: Number(row.id), reopened: true };
      });
    }),
});
