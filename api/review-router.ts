// ── Por revisar (business /transactions) ──
// The owner goes through the bank movements of the last REVIEW_WINDOW_DAYS days. Each one is grouped by how
// sure we are (api/lib/reviewEngine.ts explains the rule): it matches something the app already has
// ("Vincular"), it's ready to approve ("Seguro"), or it needs an answer ("Revisa", business or personal,
// split, duplicate). "Reviewed" is bankTransactions.isReconciled = true: from then on the bank's automatic
// categorizer and the live sync leave its category alone (api/bank-router.ts). What was done and when is in
// bankReviewLog (for "Revisados hoy", "Excluidos" and undo); links, splits and rules in their own tables
// (api/lib/reviewSchema.ts, smartCategoryRules).
//
// Never counted twice:
//   - Vincular uses the app's own procedures: invoices.pay records the client's payment on what they owe
//     (payment record, journal entry, the sale completed when nothing is left; the same path quotes.collect
//     takes), vendors.bills.markPaid records the bill's expense. The bank movement is only marked reviewed and
//     linked (bankReviewMatches), so a sale or bill is never linked again and the reports, which count sales
//     and expenses (not bank movements), count the money once.
//   - A cash deposit linked to the day's cash sales adds nothing: those sales already count.
//   - A split keeps the movement whole (its amount and its largest business part as category) and stores
//     the parts in bankTransactionSplits, which add up to the movement to the cent. No new bank or expense
//     rows are created, so any sum over movements still counts it once.
//   - Excluded movements (duplicates, transfers between your accounts) are reviewed and logged as excluded;
//     duplicates also get bankTransactions.isDuplicate = 1. `excludedInReview()` (api/lib/reviewStore.ts)
//     lets other reports leave them out.
//
// Team access (api/lib/team.ts): the accountant can read; every mutation here is refused for members.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import type { TrpcContext } from "./context";
import { getDb } from "./queries/connection";
import { bankAccounts, bankTransactions, type User } from "@db/schema";
import type { Lang } from "./lib/i18n";
import { contextHas, getPlanContext } from "./lib/planAccess";
import { withMerchantLogos } from "./lib/merchantLogos";
import { assertPeriodsOpen, closedPeriodIds } from "./reconcile-router";
import { invoicesRouter } from "./invoices-router";
import { vendorsRouter } from "./vendors-router";
import { rulesRouter } from "./rules-router";
import {
  REVIEW_WINDOW_DAYS, MAX_REVIEW_BATCH, REVIEW_LIST_MAX, REVIEW_PAGE, directionOf, isKnownCategory, resolveType,
  type MoneyType, type StoredReview,
} from "./lib/bankReview";
import {
  CASH_SUBSET_MAX, SPLIT_MAX_PARTS, PERSONAL_CATEGORY, addDay, buildHistory, buildHistoryLooks, classify, detectDuplicates, detectTransfers, displayNameOf,
  findRule, mainCategoryOf, matchBill, matchCashSales, matchReceivable, rulePatternFor, signedCents, splitProblem,
  toCents, topCategories, transferCategory, type EngineRow, type Match, type SplitPart, type Verdict,
} from "./lib/reviewEngine";
import {
  applyRulesToPending, bankReviewLog, bankReviewMatches, bankTransactionSplits, clearSplits, ensureReviewTables, loadCashSales,
  loadDismissed, loadHistory, loadLinkedTargets, loadOpenBills, loadReceivables, loadRules, matchesAnyRule, rulesTableReady, writeLog,
  type LogAction, type LogEntry,
} from "./lib/reviewStore";
import { accountShortLabel } from "./lib/banks";
import { accountMode } from "./lib/plans";
import { autoPrevOf, autoReasonFor, autoSince, ensureAutoTable, forgetAuto, recordAuto, type AutoReason } from "./lib/autoConfirm";
import { utcDate } from "./lib/support";

type Db = ReturnType<typeof getDb>;
type Exec = [{ insertId: number | string; affectedRows: number }];
type Ctx = TrpcContext & { user: User };

const MESSAGES = {
  es: {
    notFound: "No encontramos ese movimiento.",
    badCategory: "Esa categoría no existe. Elige otra de la lista.",
    reviewed: "Ese movimiento ya está revisado.",
    noMatch: "Eso ya no coincide con el movimiento (cambió el monto o ya se cobró o pagó). Revisa la lista.",
    splitParts: `Divide en 2 a ${SPLIT_MAX_PARTS} partes.`,
    splitZero: "Cada parte tiene que ser mayor que $0.",
    splitSum: "Las partes tienen que sumar exactamente el total del movimiento.",
    linkFailed: "No pudimos vincularlo. Inténtalo de nuevo.",
    saleLinked: "Este movimiento cobró una factura. Para deshacerlo, registra un reembolso o anula la factura en Facturas.",
  },
  en: {
    notFound: "We couldn't find that transaction.",
    badCategory: "That category doesn't exist. Pick one from the list.",
    reviewed: "That transaction is already reviewed.",
    noMatch: "That no longer matches the transaction (the amount changed, or it was already collected or paid). Check the list.",
    splitParts: `Split it into 2 to ${SPLIT_MAX_PARTS} parts.`,
    splitZero: "Each part has to be more than $0.",
    splitSum: "The parts have to add up exactly to the transaction's total.",
    linkFailed: "We couldn't link it. Please try again.",
    saleLinked: "This transaction paid an invoice. To undo it, record a refund or void the invoice in Invoices.",
  },
} satisfies Record<Lang, Record<string, string>>;

function fail(code: TRPCError["code"], lang: Lang, key: keyof (typeof MESSAGES)["es"]): never {
  throw new TRPCError({ code, message: MESSAGES[lang][key] });
}

/** Not reviewed yet (rows from before the flag was used may hold NULL). */
const notReviewed = () => sql`COALESCE(${bankTransactions.isReconciled}, 0) = 0`;

/**
 * For api/bank-router.ts (autoFixCategories): the movements the bank's automatic categorizer may still change.
 * Not reviewed, and no rule of the owner's matches it (a rule's category stays as the suggestion). The rules
 * part is added once this process knows the rules table exists (ensureReviewTables), so autoFix never
 * breaks on an older database.
 */
export const unreviewed = () => (rulesTableReady() ? sql`(${notReviewed()} AND NOT ${matchesAnyRule()})` : notReviewed());

/** Bank dates are calendar days, so compare against the UTC calendar day. */
const recent = () => sql`${bankTransactions.transactionDate} >= DATE_SUB(UTC_DATE(), INTERVAL ${REVIEW_WINDOW_DAYS} DAY)`;

// Create the tables early, so the rules protection above is on before the first autoFix runs (not in unit tests).
if (!process.env.VITEST) {
  setTimeout(() => {
    try { void ensureReviewTables(getDb()).catch(() => { /* retried on first use */ }); } catch { /* no database configured */ }
  }, 0);
}

/**
 * The saved state of the movements the bank sends live, matched by Plaid's id (for api/bank-router.ts).
 * `ruleApplied` marks unreviewed movements whose category one of the owner's rules set, so the live list
 * shows that category instead of the recomputed one.
 */
export async function storedReviewsFor(db: Db, userId: number, plaidIds: string[]): Promise<StoredReview[]> {
  const ids = [...new Set(plaidIds.filter(Boolean))];
  if (ids.length === 0) return [];
  try {
    const rows: Array<StoredReview & { description: string; merchantName: string | null }> = await db.select({
      id: bankTransactions.id,
      plaidTransactionId: bankTransactions.plaidTransactionId,
      type: bankTransactions.type,
      category: bankTransactions.category,
      isReconciled: bankTransactions.isReconciled,
      description: bankTransactions.description,
      merchantName: bankTransactions.merchantName,
    }).from(bankTransactions).where(and(eq(bankTransactions.userId, userId), inArray(bankTransactions.plaidTransactionId, ids)));
    let rules: Awaited<ReturnType<typeof loadRules>> = [];
    if (rulesTableReady()) rules = await loadRules(db, userId).catch(() => []);
    return rows.map(({ description, merchantName, ...r }) => {
      const rule = rules.length ? findRule(rules, { description, merchantName, type: r.type }) : null;
      return { ...r, ruleApplied: !!rule && rule.category === r.category };
    });
  } catch (e: unknown) {
    console.error("[review] stored lookup failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

// ── Reading movements ──
type TxRow = {
  id: number; date: string; description: string; merchantName: string | null; amount: string; plaidAmount: string | null;
  importedFrom: string | null; type: MoneyType; category: string; bankName: string | null; accountNumber: string | null;
  bankAccountId: number | null; isReconciled: boolean | number | null;
};

const txCols = {
  id: bankTransactions.id,
  date: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
  description: bankTransactions.description,
  merchantName: bankTransactions.merchantName,
  amount: bankTransactions.amount,
  plaidAmount: bankTransactions.plaidAmount,
  importedFrom: bankTransactions.importedFrom,
  type: bankTransactions.type,
  category: bankTransactions.category,
  bankName: bankTransactions.bankName,
  accountNumber: bankTransactions.accountNumber,
  bankAccountId: bankTransactions.bankAccountId,
  isReconciled: bankTransactions.isReconciled,
};

const reviewedFlag = (v: boolean | number | null) => v === true || Number(v) === 1;

function engineRow(r: TxRow): EngineRow {
  return {
    id: Number(r.id), date: r.date, description: r.description, merchantName: r.merchantName, type: r.type === "income" ? "income" : "expense",
    category: r.category, amountCents: Math.abs(toCents(r.amount)), plaidAmount: r.plaidAmount, importedFrom: r.importedFrom,
    bankAccountId: r.bankAccountId === null ? null : Number(r.bankAccountId), reviewed: reviewedFlag(r.isReconciled),
  };
}

async function ownRows(db: Db, userId: number, ids: number[]): Promise<TxRow[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  return db.select(txCols).from(bankTransactions).where(and(eq(bankTransactions.userId, userId), inArray(bankTransactions.id, unique)));
}

export async function pendingCount(db: Db, userId: number): Promise<number> {
  const rows: Array<{ n: number | string }> = await db.select({ n: sql<number>`COUNT(*)` }).from(bankTransactions)
    .where(and(eq(bankTransactions.userId, userId), notReviewed(), recent()));
  return Number(rows[0]?.n ?? 0);
}

/** Start of the owner's day (sent by the app); UTC midnight when missing or odd. */
function sinceOf(since: string | undefined): Date {
  const t = since ? Date.parse(since) : NaN;
  const now = Date.now();
  if (Number.isFinite(t) && t <= now + 86_400_000 && t >= now - 3 * 86_400_000) return new Date(t);
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const accountLabelOf = (bankName: string | null, accountNumber: string | null) => accountShortLabel(bankName, accountNumber, "") ?? "";

/** Excluded for a reason other than being a transfer between the owner's accounts. */
const notTransfer = () => sql`(${bankReviewLog.reason} IS NULL OR ${bankReviewLog.reason} <> 'transfer')`;

// ── Writing ──
/** Marks movements reviewed with a category each (or the one they have), and logs it. */
async function markReviewed(db: Db, userId: number, rows: TxRow[], pick: (r: TxRow) => { category: string; type?: MoneyType }, action: LogAction, extra?: (r: TxRow) => Partial<LogEntry>): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const { category, type: wanted } = pick(r);
    const type = resolveType(category, r.type, wanted);
    const res: Exec = await db.update(bankTransactions).set({ category, type, isReconciled: true })
      .where(and(eq(bankTransactions.id, r.id), eq(bankTransactions.userId, userId)));
    n += Number(res[0]?.affectedRows ?? 0);
    await writeLog(db, userId, [{ bankTransactionId: Number(r.id), action, prevCategory: r.category, prevType: r.type, ...(extra?.(r) ?? {}) }]);
  }
  return n;
}

function callerCtx(ctx: Ctx): TrpcContext {
  return { req: ctx.req, resHeaders: ctx.resHeaders, user: ctx.user, lang: ctx.lang, member: ctx.member };
}

/** How a deposit or bill payment went through the bank, for the sale's payment or the bill's expense. */
const bankMethod = (description: string): "zelle" | "card" => (/zelle/i.test(description) ? "zelle" : "card");

/** Takes back what markReviewed + the link rows recorded, when the app's own procedure then refused the link. */
async function unrecordLink(db: Db, userId: number, src: TxRow): Promise<void> {
  await db.delete(bankReviewMatches).where(and(eq(bankReviewMatches.userId, userId), eq(bankReviewMatches.bankTransactionId, Number(src.id)), eq(bankReviewMatches.status, "linked")));
  await db.update(bankTransactions).set({ isReconciled: false, category: src.category, type: src.type }).where(and(eq(bankTransactions.id, Number(src.id)), eq(bankTransactions.userId, userId)));
  await db.delete(bankReviewLog).where(and(eq(bankReviewLog.userId, userId), eq(bankReviewLog.bankTransactionId, Number(src.id))));
}

// ── Inputs ──
const idNum = z.number().int().positive();
const ids = z.array(idNum).min(1).max(MAX_REVIEW_BATCH);
const tzOffsetMinutes = z.number().int().min(-840).max(840).default(0);
const target = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sale"), saleId: idNum }),
  z.object({ type: z.literal("cash"), saleIds: z.array(idNum).min(1).max(CASH_SUBSET_MAX) }),
  z.object({ type: z.literal("bill"), billId: idNum }),
]);

export type ReviewItem = {
  id: number; date: string; description: string; who: string; amount: number; type: MoneyType;
  category: string; storedCategory: string; bankAccountId: number | null; bankName: string | null; accountNumber: string | null;
  logoUrl: string | null; merchantName: string | null; plaidAmount: string | null; importedFrom: string | null; rulePattern: string; hasRule: boolean; cashDeposit: boolean;
  transferPair: number | null; duplicateOf: number | null; match: Match | null;
} & Omit<Verdict, "category" | "ruleId">;

/**
 * Por revisar's verdict for each pending movement (newest first, up to `limit`): the rows, and what the inbox and
 * the app's own confirmations (api/lib/autoConfirm.ts) need. Reading it applies the owner's rules to new movements
 * (only for the owner: a team member's read changes nothing).
 */
async function pendingVerdicts(db: Db, ctx: Ctx, limit: number, tz: number) {
  const userId = Number(ctx.user.id);
  const rules = await loadRules(db, userId);
  if (!ctx.member && rules.length) await applyRulesToPending(db, userId, rules);

  const rows: TxRow[] = await db.select(txCols).from(bankTransactions)
    .where(and(eq(bankTransactions.userId, userId), notReviewed(), recent()))
    .orderBy(desc(bankTransactions.transactionDate), desc(bankTransactions.id))
    .limit(limit);
  const pending = rows.map(engineRow);

  // Neighbors (any status, except excluded ones) for transfers and duplicates.
  let neighbors: EngineRow[] = pending;
  let minDay = "", maxDay = "";
  if (pending.length) {
    minDay = pending.reduce((m, r) => (r.date < m ? r.date : m), pending[0].date);
    maxDay = pending.reduce((m, r) => (r.date > m ? r.date : m), pending[0].date);
    const near: TxRow[] = await db.select(txCols).from(bankTransactions).where(and(
      eq(bankTransactions.userId, userId),
      sql`${bankTransactions.transactionDate} BETWEEN ${addDay(minDay, -3)} AND ${addDay(maxDay, 3)}`,
      sql`NOT EXISTS (SELECT 1 FROM bankReviewLog l WHERE l.bankTransactionId = ${bankTransactions.id} AND l.action = 'excluded')`,
    )).limit(3000);
    const seen = new Set(pending.map((r) => r.id));
    neighbors = [...pending, ...near.map(engineRow).filter((r) => !seen.has(r.id))];
  }

  const historyRows = await loadHistory(db, userId);
  const history = buildHistory(historyRows);
  const looks = buildHistoryLooks(historyRows);
  const plan = await getPlanContext(db, ctx.user);
  const receivables = pending.length && contextHas(plan, "quotes") ? await loadReceivables(db, userId, tz) : [];
  const cashSales = pending.length ? await loadCashSales(db, userId, addDay(minDay, -3), maxDay, tz) : [];
  const openBills = pending.length && contextHas(plan, "vendors") ? await loadOpenBills(db, userId) : [];
  const dismissed = await loadDismissed(db, userId, pending.map((r) => r.id));
  const linked = await loadLinkedTargets(db, userId);

  // Oldest first, so the oldest deposit gets the oldest sale or bill.
  const matches = new Map<number, Match>();
  const usedSales = new Set(linked.sale);
  const usedBills = new Set(linked.bill);
  const usedCash = new Set<number>();
  for (const r of [...pending].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const d = dismissed.get(r.id) ?? new Set<string>();
    const m = matchReceivable(r, receivables, usedSales, d) ?? matchCashSales(r, cashSales, usedCash, d) ?? matchBill(r, openBills, usedBills, d);
    if (!m) continue;
    matches.set(r.id, m);
    if (m.type === "sale") usedSales.add(m.saleId);
    else if (m.type === "bill") usedBills.add(m.billId);
    else m.saleIds.forEach((s) => usedCash.add(s));
  }
  const transfers = detectTransfers(neighbors);
  const duplicates = detectDuplicates(neighbors, new Set(transfers.keys()));

  const verdicts = pending.map((r) => ({ r, v: classify(r, { rules, history, transfers, duplicates, matches, looks }) }));
  return { rules, rows, pending, history, matches, transfers, duplicates, verdicts };
}
/**
 * The app confirms the pending movements it's sure about (api/lib/autoConfirm.ts), so Por revisar keeps only what
 * needs the person. Only for the owner (a team member's visit confirms nothing), never inside a closed period.
 * Returns how many it confirmed.
 */
export async function autoConfirmPending(db: Db, ctx: Ctx): Promise<number> {
  if (ctx.member) return 0;
  await ensureReviewTables(db);
  await ensureAutoTable(db);
  const userId = Number(ctx.user.id);
  const mode = accountMode(ctx.user.modePreference);
  const { rows, verdicts } = await pendingVerdicts(db, ctx, REVIEW_LIST_MAX, 0);
  const locked = new Set(await closedPeriodIds(db, userId, rows.map((r) => Number(r.id))));
  const picks: Array<{ id: number; category: string; reason: AutoReason; type: MoneyType; prevCategory: string; prevType: MoneyType }> = [];
  for (const { r, v } of verdicts) {
    if (locked.has(r.id) || !isKnownCategory(v.category)) continue;
    const reason = autoReasonFor({ description: r.description, merchantName: r.merchantName, type: r.type, category: r.category }, v, mode);
    if (reason) picks.push({ id: r.id, category: v.category, reason, type: resolveType(v.category, r.type), prevCategory: r.category, prevType: r.type });
  }
  let done = 0;
  const confirmed: typeof picks = [];
  for (const p of picks) {
    // Still pending at this moment (the person may have reviewed it meanwhile).
    const res: Exec = await db.update(bankTransactions).set({ category: p.category, type: p.type, isReconciled: true })
      .where(and(eq(bankTransactions.id, p.id), eq(bankTransactions.userId, userId), notReviewed()));
    if (Number(res[0]?.affectedRows ?? 0) > 0) { done++; confirmed.push(p); }
  }
  await recordAuto(db, userId, confirmed);
  return done;
}

export const reviewRouter = createRouter({
  /**
   * The movements still to review, grouped (kind), with the suggested category, the reason in facts (why)
   * and any match; plus the accounts with their pending counts, what was done for the owner (auto), the
   * owner's most used categories and the counts for the tabs. Reading it applies the owner's rules to new
   * movements (only when the owner reads it: a team member's read changes nothing).
   */
  list: authedQuery
    .input(z.object({
      limit: z.number().int().min(1).max(REVIEW_LIST_MAX).default(REVIEW_PAGE),
      since: z.string().max(40).optional(),
      tzOffsetMinutes,
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      const tz = input?.tzOffsetMinutes ?? 0;
      const since = sinceOf(input?.since);

      const { rules, rows, history, matches, transfers, duplicates, verdicts } = await pendingVerdicts(db, ctx, input?.limit ?? REVIEW_PAGE, tz);
      const total = await pendingCount(db, userId);
      const withLogos = await withMerchantLogos(db, rows.map((r) => ({ id: Number(r.id), merchantName: r.merchantName, description: r.description })));
      const logoOf = new Map(withLogos.map((x) => [x.id, x.logoUrl]));

      const items: ReviewItem[] = verdicts.map(({ r, v }) => {
        const src = rows.find((x) => Number(x.id) === r.id) as TxRow;
        const { category, ruleId, ...rest } = v;
        return {
          id: r.id, date: r.date, description: r.description, who: displayNameOf(r.description, r.merchantName),
          amount: r.amountCents / 100, type: r.type, category, storedCategory: r.category,
          bankAccountId: r.bankAccountId, bankName: src.bankName, accountNumber: src.accountNumber, merchantName: r.merchantName,
          plaidAmount: src.plaidAmount, importedFrom: src.importedFrom,
          logoUrl: logoOf.get(r.id) ?? null, rulePattern: rulePatternFor(r.description, r.merchantName), hasRule: ruleId !== null,
          cashDeposit: matches.get(r.id)?.type === "cash",
          transferPair: transfers.get(r.id)?.otherId ?? null, duplicateOf: duplicates.get(r.id)?.otherId ?? null,
          match: matches.get(r.id) ?? null, ...rest,
        };
      });

      // Accounts with what's still to review in each (all of the window, not only the rows loaded).
      const accts: Array<{ id: number; bankName: string; accountNumber: string | null; accountType: string | null }> = await db
        .select({ id: bankAccounts.id, bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber, accountType: bankAccounts.accountType })
        .from(bankAccounts).where(and(eq(bankAccounts.userId, userId), sql`COALESCE(${bankAccounts.isActive}, 1) = 1`)).orderBy(bankAccounts.id);
      const perAcct: Array<{ acct: number | null; n: number | string }> = await db
        .select({ acct: bankTransactions.bankAccountId, n: sql<number>`COUNT(*)` }).from(bankTransactions)
        .where(and(eq(bankTransactions.userId, userId), notReviewed(), recent())).groupBy(bankTransactions.bankAccountId);
      const countOf = new Map(perAcct.map((p) => [p.acct === null ? null : Number(p.acct), Number(p.n)]));
      const accountNames = new Map(accts.map((a) => [Number(a.id), accountLabelOf(a.bankName, a.accountNumber)]));

      // Tabs and progress. An approved transfer between the owner's accounts counts as reviewed, not excluded.
      const doneRows: Array<{ action: LogAction; reason: string | null; n: number | string }> = await db
        .select({ action: bankReviewLog.action, reason: bankReviewLog.reason, n: sql<number>`COUNT(*)` }).from(bankReviewLog)
        .where(and(eq(bankReviewLog.userId, userId), sql`${bankReviewLog.reviewedAt} >= ${since}`)).groupBy(bankReviewLog.action, bankReviewLog.reason);
      const leftOut = (d: { action: LogAction; reason: string | null }) => d.action === "excluded" && d.reason !== "transfer";
      const doneToday = doneRows.filter((d) => !leftOut(d)).reduce((a, d) => a + Number(d.n), 0);
      const excludedToday = doneRows.filter(leftOut).reduce((a, d) => a + Number(d.n), 0);
      const exc: Array<{ n: number | string }> = await db.select({ n: sql<number>`COUNT(*)` }).from(bankReviewLog)
        .where(and(eq(bankReviewLog.userId, userId), eq(bankReviewLog.action, "excluded"), notTransfer()));

      return {
        total,
        items,
        accounts: accts.map((a) => ({ id: Number(a.id), bankName: a.bankName, accountNumber: a.accountNumber, accountType: a.accountType, pending: countOf.get(Number(a.id)) ?? 0 })),
        /** Other accounts' names, for the transfer "why" lines. */
        accountNames: Object.fromEntries(accountNames),
        auto: {
          rules: items.filter((i) => i.why.code === "rule").length,
          transfers: new Set(items.filter((i) => i.transferPair !== null).map((i) => [i.id, i.transferPair as number].sort((a, b) => a - b).join("-"))).size,
          duplicates: items.filter((i) => i.ask === "duplicate").length,
        },
        topCategories: { income: topCategories(history, "income"), expense: topCategories(history, "expense") },
        rulesCount: rules.length,
        autoToday: (await autoSince(db, userId, since)).length,
        doneToday,
        reviewedToday: doneToday + excludedToday,
        excludedCount: Number(exc[0]?.n ?? 0),
      };
    }),

  /** What the app confirmed by itself in the last days (personal Movimientos: "La app confirmó N por ti"). */
  autoRecent: authedQuery
    .input(z.object({ days: z.number().int().min(1).max(60).default(7) }).nullish())
    .query(async ({ input, ctx }) => {
      const list = await autoSince(getDb(), Number(ctx.user.id), new Date(Date.now() - (input?.days ?? 7) * 86_400_000));
      return { count: list.length, ids: list.map((a) => a.bankTransactionId) };
    }),

  /** How many are waiting (for the "Por revisar (N)" badge). */
  count: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    // The badge loads on every business page: a good moment to make sure the rules protection is on.
    if (!rulesTableReady()) await ensureReviewTables(db).catch(() => undefined);
    return { count: await pendingCount(db, Number(ctx.user.id)) };
  }),

  /** "Revisados hoy": what the owner reviewed since the start of their day (excluded ones are in their own tab). */
  done: authedQuery
    .input(z.object({ since: z.string().max(40).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      const rows: Array<TxRow & { action: LogAction; reason: string | null; at: Date | string }> = await db
        .select({ ...txCols, action: bankReviewLog.action, reason: bankReviewLog.reason, at: bankReviewLog.reviewedAt })
        .from(bankReviewLog).innerJoin(bankTransactions, and(eq(bankTransactions.id, bankReviewLog.bankTransactionId), eq(bankTransactions.userId, userId)))
        .where(and(eq(bankReviewLog.userId, userId), or(ne(bankReviewLog.action, "excluded"), eq(bankReviewLog.reason, "transfer")), sql`${bankReviewLog.reviewedAt} >= ${sinceOf(input?.since)}`))
        .orderBy(desc(bankReviewLog.reviewedAt), desc(bankReviewLog.id)).limit(200);
      const splitIds = rows.filter((r) => r.action === "split").map((r) => Number(r.id));
      const parts: Array<{ tx: number; category: string; amount: string }> = splitIds.length
        ? await db.select({ tx: bankTransactionSplits.bankTransactionId, category: bankTransactionSplits.category, amount: bankTransactionSplits.amount })
          .from(bankTransactionSplits).where(and(eq(bankTransactionSplits.userId, userId), inArray(bankTransactionSplits.bankTransactionId, splitIds)))
          .orderBy(bankTransactionSplits.bankTransactionId, bankTransactionSplits.position)
        : [];
      // What the app confirmed by itself since then (once the person touches one, it's in their own log above).
      const autos = await autoSince(db, userId, sinceOf(input?.since));
      const autoRows: TxRow[] = autos.length ? await ownRows(db, userId, autos.map((a) => a.bankTransactionId)) : [];
      const autoOf = new Map(autos.map((a) => [a.bankTransactionId, a]));
      const all = [
        ...rows.map((r) => ({ r, action: (r.action === "excluded" && r.reason === "transfer" ? "transfer" : r.action) as LogAction | "transfer" | "auto", at: r.at as Date | string, autoReason: null as AutoReason | null })),
        ...autoRows.map((r) => ({ r, action: "auto" as const, at: utcDate(autoOf.get(Number(r.id))?.at ?? null) ?? new Date(), autoReason: autoOf.get(Number(r.id))?.reason ?? null })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      const logos = await withMerchantLogos(db, all.map(({ r }) => ({ id: Number(r.id), merchantName: r.merchantName, description: r.description })));
      return all.map(({ r, action, at, autoReason }, i) => ({
        id: Number(r.id), who: displayNameOf(r.description, r.merchantName), description: r.description, amount: Math.abs(Number(r.amount)),
        type: r.type, category: r.category, at, logoUrl: logos[i].logoUrl,
        // "transfer" = an approved transfer between the owner's accounts ("Entre tus cuentas"); "auto" = the app confirmed it.
        action, autoReason,
        parts: parts.filter((p) => Number(p.tx) === Number(r.id)).map((p) => ({ category: p.category, amount: Number(p.amount) })),
      }));
    }),

  /** "Excluidos": what the owner left out of the reports (duplicates, others), newest first, with why. Transfers are in "Revisados". */
  excluded: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = Number(ctx.user.id);
    await ensureReviewTables(db);
    const rows: Array<TxRow & { reason: "duplicate" | "transfer" | "other" | null; relatedId: number | null }> = await db
      .select({ ...txCols, reason: bankReviewLog.reason, relatedId: bankReviewLog.relatedId })
      .from(bankReviewLog).innerJoin(bankTransactions, and(eq(bankTransactions.id, bankReviewLog.bankTransactionId), eq(bankTransactions.userId, userId)))
      .where(and(eq(bankReviewLog.userId, userId), eq(bankReviewLog.action, "excluded"), notTransfer()))
      .orderBy(desc(bankReviewLog.reviewedAt), desc(bankReviewLog.id)).limit(200);
    const logos = await withMerchantLogos(db, rows.map((r) => ({ id: Number(r.id), merchantName: r.merchantName, description: r.description })));
    return rows.map((r, i) => ({
      id: Number(r.id), who: displayNameOf(r.description, r.merchantName), description: r.description, date: r.date,
      amount: Math.abs(Number(r.amount)), type: r.type, reason: r.reason ?? "other", relatedId: r.relatedId === null ? null : Number(r.relatedId),
      bankName: r.bankName, accountNumber: r.accountNumber, logoUrl: logos[i].logoUrl,
    }));
  }),

  /** "Está bien" (kept for older clients): keeps each movement's category. Only the caller's own movements change. */
  confirm: authedQuery
    .input(z.object({ ids }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      await assertPeriodsOpen(db, userId, input.ids, ctx.lang);
      const rows = await ownRows(db, userId, input.ids);
      const confirmed = await markReviewed(db, userId, rows, (r) => ({ category: r.category, type: r.type }), "approved");
      return { confirmed };
    }),

  /**
   * "Aprobar" (one, "Aprobar los N", bulk, "Negocio"/"Personal", bulk category): each movement with the category
   * the owner saw (the suggestion may come from a rule or their history), marked reviewed and logged.
   */
  approve: authedQuery
    .input(z.object({
      items: z.array(z.object({ id: idNum, category: z.string().min(1).max(40).optional(), type: z.enum(["income", "expense"]).optional() })).min(1).max(MAX_REVIEW_BATCH),
      how: z.enum(["approved", "answered", "bulk", "changed"]).default("approved"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      for (const it of input.items) if (it.category !== undefined && !isKnownCategory(it.category)) fail("BAD_REQUEST", ctx.lang, "badCategory");
      await ensureReviewTables(db);
      const wanted = new Map(input.items.map((i) => [i.id, i]));
      await assertPeriodsOpen(db, userId, [...wanted.keys()], ctx.lang);
      const rows = await ownRows(db, userId, [...wanted.keys()]);
      const approved = await markReviewed(db, userId, rows, (r) => {
        const w = wanted.get(Number(r.id));
        return { category: w?.category ?? r.category, type: w?.type };
      }, input.how);
      return { approved, ids: rows.map((r) => Number(r.id)) };
    }),

  /**
   * Undo (and "Restaurar"): back to the list with the category it had before. Takes back what the review did:
   * a link (a bill becomes unpaid again with vendors.bills.markUnpaid; cash sales are only unlinked), a split's
   * parts, an exclusion (both legs of a transfer). A movement that paid an invoice is refused: Facturas keeps
   * every payment (a refund or a void reverses it there), so nothing here deletes one.
   */
  reopen: authedQuery
    .input(z.object({ ids }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      const logs0: Array<{ tx: number; action: LogAction; reason: string | null; relatedId: number | null }> = await db
        .select({ tx: bankReviewLog.bankTransactionId, action: bankReviewLog.action, reason: bankReviewLog.reason, relatedId: bankReviewLog.relatedId })
        .from(bankReviewLog).where(and(eq(bankReviewLog.userId, userId), inArray(bankReviewLog.bankTransactionId, input.ids)));
      // A transfer goes back as a whole.
      const all = new Set(input.ids);
      for (const l of logs0) if (l.action === "excluded" && l.reason === "transfer" && l.relatedId) all.add(Number(l.relatedId));
      const idList = [...all];
      await assertPeriodsOpen(db, userId, idList, ctx.lang);
      // Back to pending: not the app's confirmation anymore either (one the app confirmed goes back to what it had).
      const appPrev = await autoPrevOf(db, userId, idList);
      await forgetAuto(db, userId, idList);
      const rows = await ownRows(db, userId, idList);
      const logs: Array<{ tx: number; action: LogAction; reason: string | null; prevCategory: string | null; prevType: MoneyType | null }> = await db
        .select({ tx: bankReviewLog.bankTransactionId, action: bankReviewLog.action, reason: bankReviewLog.reason, prevCategory: bankReviewLog.prevCategory, prevType: bankReviewLog.prevType })
        .from(bankReviewLog).where(and(eq(bankReviewLog.userId, userId), inArray(bankReviewLog.bankTransactionId, rows.map((r) => Number(r.id)))));
      const logOf = new Map(logs.map((l) => [Number(l.tx), l]));
      const linkRows: Array<{ id: number; tx: number; type: "sale" | "cash" | "bill"; target: number }> = rows.length ? await db
        .select({ id: bankReviewMatches.id, tx: bankReviewMatches.bankTransactionId, type: bankReviewMatches.targetType, target: bankReviewMatches.targetId }).from(bankReviewMatches)
        .where(and(eq(bankReviewMatches.userId, userId), inArray(bankReviewMatches.bankTransactionId, rows.map((r) => Number(r.id))), eq(bankReviewMatches.status, "linked"))) : [];
      if (linkRows.some((l) => l.type === "sale")) fail("PRECONDITION_FAILED", ctx.lang, "saleLinked");
      const vendorsApi = vendorsRouter.createCaller(callerCtx(ctx));
      let reopened = 0;
      for (const r of rows) {
        const id = Number(r.id);
        const log = logOf.get(id);
        const links = linkRows.filter((l) => Number(l.tx) === id);
        for (const l of links) if (l.type === "bill") await vendorsApi.bills.markUnpaid({ id: Number(l.target) });
        if (links.length) await db.delete(bankReviewMatches).where(and(eq(bankReviewMatches.userId, userId), inArray(bankReviewMatches.id, links.map((l) => Number(l.id)))));
        if (log?.action === "split") await clearSplits(db, userId, [id]);
        const restore: { isReconciled: boolean; category?: string; type?: MoneyType; isDuplicate?: boolean } = { isReconciled: false };
        // What it had before: from the person's review, else from the app's confirmation.
        const prev = log?.prevCategory ? { category: log.prevCategory, type: log.prevType } : appPrev.has(id) ? { category: appPrev.get(id)?.prevCategory, type: appPrev.get(id)?.prevType } : null;
        if (prev?.category) restore.category = prev.category;
        if (prev?.type) restore.type = prev.type;
        if (log?.action === "excluded" && log.reason === "duplicate") restore.isDuplicate = false;
        const res: Exec = await db.update(bankTransactions).set(restore).where(and(eq(bankTransactions.id, id), eq(bankTransactions.userId, userId)));
        reopened += Number(res[0]?.affectedRows ?? 0);
        if (log) await db.delete(bankReviewLog).where(and(eq(bankReviewLog.userId, userId), eq(bankReviewLog.bankTransactionId, id)));
      }
      return { reopened, ids: rows.map((r) => Number(r.id)) };
    }),

  /** "Cambiar": the owner's category (and type, if the money went the other way). Marks it reviewed. */
  setCategory: authedQuery
    .input(z.object({
      id: idNum,
      category: z.string().min(1).max(40),
      type: z.enum(["income", "expense"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isKnownCategory(input.category)) fail("BAD_REQUEST", ctx.lang, "badCategory");
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      const rows = await ownRows(db, userId, [input.id]);
      if (!rows[0]) fail("NOT_FOUND", ctx.lang, "notFound");
      await assertPeriodsOpen(db, userId, [input.id], ctx.lang);
      const type = resolveType(input.category, rows[0].type, input.type);
      await markReviewed(db, userId, rows, () => ({ category: input.category, type }), "changed");
      return { id: input.id, category: input.category, type };
    }),

  /**
   * "Excluir": duplicates, transfers between the owner's accounts, or anything that doesn't belong in the
   * books. Reviewed and logged as excluded; a transfer's legs get the transfer categories and point at each
   * other; a duplicate is flagged isDuplicate.
   */
  exclude: authedQuery
    .input(z.object({ ids, reason: z.enum(["duplicate", "transfer", "other"]).default("other"), relatedId: idNum.optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      await assertPeriodsOpen(db, userId, input.ids, ctx.lang);
      const rows = await ownRows(db, userId, input.ids);
      const pair = input.reason === "transfer" && rows.length === 2 ? rows.map((r) => Number(r.id)) : null;
      const excluded = await markReviewed(db, userId, rows,
        (r) => ({ category: input.reason === "transfer" ? transferCategory(r.type) : r.category, type: r.type }),
        "excluded",
        (r) => ({ reason: input.reason, relatedId: pair ? pair.find((x) => x !== Number(r.id)) ?? null : input.relatedId ?? null }));
      if (input.reason === "duplicate" && rows.length) {
        await db.update(bankTransactions).set({ isDuplicate: true }).where(and(eq(bankTransactions.userId, userId), inArray(bankTransactions.id, rows.map((r) => Number(r.id)))));
      }
      return { excluded, ids: rows.map((r) => Number(r.id)) };
    }),

  /**
   * "Vincular": checks the match again on the server, records the link, then does it with the app's own
   * procedures: invoices.pay for what a client owes (the same payment quotes.collect makes: payment record,
   * journal entry, the sale completed once nothing is owed) and vendors.bills.markPaid for a bill (its
   * expense). Cash sales already count, so linking them only records it. If the procedure refuses, the link
   * is taken back and its message shown.
   */
  link: authedQuery
    .input(z.object({ id: idNum, target, tzOffsetMinutes }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      const rows = await ownRows(db, userId, [input.id]);
      const src = rows[0];
      if (!src) fail("NOT_FOUND", ctx.lang, "notFound");
      if (reviewedFlag(src.isReconciled)) fail("CONFLICT", ctx.lang, "reviewed");
      await assertPeriodsOpen(db, userId, [input.id], ctx.lang);
      const row = engineRow(src);
      const linked = await loadLinkedTargets(db, userId);
      const none = new Set<string>();
      const t = input.target;
      let category = row.category;
      let label: { invoiceNumber?: string; vendorName?: string; count?: number } = {};
      let targets: Array<{ type: "sale" | "cash" | "bill"; id: number }> = [];

      // 1. Check it still matches.
      if (t.type === "sale") {
        const list = (await loadReceivables(db, userId, input.tzOffsetMinutes)).filter((s) => s.saleId === t.saleId);
        const m = matchReceivable(row, list, linked.sale, none);
        if (!m || m.type !== "sale") fail("CONFLICT", ctx.lang, "noMatch");
        if (directionOf(category) === "out") category = "deposit";
        label = { invoiceNumber: m.invoiceNumber };
        targets = [{ type: "sale", id: t.saleId }];
      } else if (t.type === "cash") {
        const all = await loadCashSales(db, userId, addDay(row.date, -10), row.date, input.tzOffsetMinutes);
        const picked = all.filter((s) => t.saleIds.includes(s.saleId));
        if (picked.length !== new Set(t.saleIds).size || picked.reduce((a, s) => a + s.totalCents, 0) !== row.amountCents || signedCents(row) >= 0) fail("CONFLICT", ctx.lang, "noMatch");
        category = "cash_deposit";
        label = { count: picked.length };
        targets = picked.map((s) => ({ type: "cash" as const, id: s.saleId }));
      } else {
        const list = (await loadOpenBills(db, userId)).filter((b) => b.billId === t.billId);
        const m = matchBill(row, list, linked.bill, none);
        if (!m || m.type !== "bill") fail("CONFLICT", ctx.lang, "noMatch");
        if (directionOf(category) === "in") category = "business_expense";
        label = { vendorName: m.vendorName };
        targets = [{ type: "bill", id: t.billId }];
      }

      // 2. Record the link (our own rows: easy to take back).
      for (const x of targets) {
        await db.insert(bankReviewMatches).values({ userId, bankTransactionId: row.id, targetType: x.type, targetId: x.id, status: "linked" })
          .onDuplicateKeyUpdate({ set: { status: "linked" } });
      }
      await markReviewed(db, userId, [src], () => ({ category, type: row.type }), "linked");

      // 3. Book it with the app's own procedure.
      try {
        if (t.type === "sale") {
          await invoicesRouter.createCaller(callerCtx(ctx)).pay({ ref: `s${t.saleId}`, amount: row.amountCents / 100, method: bankMethod(row.description), note: row.description.slice(0, 120) });
        } else if (t.type === "bill") {
          await vendorsRouter.createCaller(callerCtx(ctx)).bills.markPaid({ id: t.billId, paidDate: row.date, method: bankMethod(row.description) });
        }
      } catch (e: unknown) {
        await unrecordLink(db, userId, src).catch((err: unknown) => console.error("[review.link] undo failed:", err instanceof Error ? err.message : err));
        if (e instanceof TRPCError) throw e;
        console.error("[review.link]", e instanceof Error ? e.message : e);
        fail("INTERNAL_SERVER_ERROR", ctx.lang, "linkFailed");
      }
      return { id: row.id, type: t.type, ...label };
    }),

  /** "No es esto": that suggestion isn't offered again for this movement. */
  dismissMatch: authedQuery
    .input(z.object({ id: idNum, target }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      if (!(await ownRows(db, userId, [input.id]))[0]) fail("NOT_FOUND", ctx.lang, "notFound");
      const t = input.target;
      const list = t.type === "sale" ? [{ type: "sale" as const, id: t.saleId }]
        : t.type === "bill" ? [{ type: "bill" as const, id: t.billId }]
          : t.saleIds.map((s) => ({ type: "cash" as const, id: s }));
      for (const x of list) {
        await db.insert(bankReviewMatches).values({ userId, bankTransactionId: input.id, targetType: x.type, targetId: x.id, status: "dismissed" })
          .onDuplicateKeyUpdate({ set: { status: sql`IF(status = 'linked', 'linked', 'dismissed')` } });
      }
      return { id: input.id };
    }),

  /**
   * "Dividir": one movement across categories (the personal part goes to the personal category). The parts
   * must add up to the movement to the cent; the movement keeps its full amount and its largest business part
   * as its category, so nothing is counted twice.
   */
  split: authedQuery
    .input(z.object({
      id: idNum,
      parts: z.array(z.object({ category: z.string().min(1).max(40), amount: z.number().finite().nonnegative().max(99_999_999.99) })).min(1).max(SPLIT_MAX_PARTS + 2),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      if (input.parts.some((p) => !isKnownCategory(p.category))) fail("BAD_REQUEST", ctx.lang, "badCategory");
      await ensureReviewTables(db);
      const rows = await ownRows(db, userId, [input.id]);
      const src = rows[0];
      if (!src) fail("NOT_FOUND", ctx.lang, "notFound");
      await assertPeriodsOpen(db, userId, [input.id], ctx.lang);
      const parts: SplitPart[] = input.parts.map((p) => ({ category: p.category, amountCents: toCents(p.amount) }));
      const problem = splitProblem(parts, Math.abs(toCents(src.amount)));
      if (problem === "parts") fail("BAD_REQUEST", ctx.lang, "splitParts");
      if (problem === "zero") fail("BAD_REQUEST", ctx.lang, "splitZero");
      if (problem === "sum") fail("BAD_REQUEST", ctx.lang, "splitSum");
      const main = mainCategoryOf(parts);
      await db.transaction(async (tx: Db) => {
        await clearSplits(tx, userId, [Number(src.id)]);
        await tx.insert(bankTransactionSplits).values(parts.map((p, i) => ({
          userId, bankTransactionId: Number(src.id), position: i, category: p.category, amount: (p.amountCents / 100).toFixed(2), personal: p.category === PERSONAL_CATEGORY,
        })));
        await markReviewed(tx, userId, [src], () => ({ category: main, type: src.type }), "split");
      });
      return { id: Number(src.id), category: main, parts: parts.length };
    }),

  /** "Reglas": review.rules.list / create / update / delete (api/rules-router.ts). */
  rules: rulesRouter,
});
