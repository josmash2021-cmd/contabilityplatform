// ── Por revisar: database side (tables, rules, the facts the engine needs, the review log) ──
// Pure decisions live in api/lib/reviewEngine.ts; the procedures in api/review-router.ts and api/rules-router.ts.
import { and, eq, inArray, sql } from "drizzle-orm";
import { bankTransactions, smartCategoryRules } from "@db/schema";
import { bills, vendors } from "@db/vendorsSchema";
import type { getDb } from "../queries/connection";
import { isMissingTable } from "./dbErrors";
import { resolveType, type MoneyType } from "./bankReview";
import { autoPrevOf, forgetAuto } from "./autoConfirm";
import { bankReviewLog, bankReviewMatches, bankTransactionSplits } from "./reviewSchema";
import { cleanPattern, findRule, toCents, type CashSale, type HistoryRow, type OpenBill, type Receivable, type Rule } from "./reviewEngine";

type Db = ReturnType<typeof getDb>;
type Exec = [{ insertId: number | string; affectedRows: number }];

// ── Tables ──
let ready: Promise<void> | null = null;
let rulesTable = false;

/** True once this process knows the rules table exists (api/review-router.ts `unreviewed()` reads it). */
export function rulesTableReady(): boolean {
  return rulesTable;
}

/** Creates the review tables (and the rules table, if an older database lacks it). Runs once per process. */
export function ensureReviewTables(db: Db): Promise<void> {
  ready ??= (async () => {
    // Same definition as db/schema.ts smartCategoryRules (and the repair in api/bank-router.ts).
    await db.execute(sql`CREATE TABLE IF NOT EXISTS smartCategoryRules (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, userId BIGINT UNSIGNED NOT NULL, merchantPattern VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL, subcategory VARCHAR(100) NULL, confidence INT DEFAULT 100,
      source ENUM('user','auto','system') DEFAULT 'system' NOT NULL, usageCount INT DEFAULT 0, isActive TINYINT(1) DEFAULT 1,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      INDEX smartCatRules_userId_idx (userId), UNIQUE INDEX smartCatRules_user_pattern_idx (userId, merchantPattern))`);
    rulesTable = true;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS bankReviewLog (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      userId BIGINT UNSIGNED NOT NULL,
      bankTransactionId BIGINT UNSIGNED NOT NULL,
      action ENUM('approved','changed','answered','bulk','linked','split','excluded') NOT NULL,
      reason ENUM('duplicate','transfer','other') NULL,
      relatedId BIGINT UNSIGNED NULL,
      prevCategory VARCHAR(40) NULL,
      prevType ENUM('income','expense') NULL,
      reviewedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      UNIQUE INDEX bankReviewLog_tx_idx (bankTransactionId),
      INDEX bankReviewLog_user_at_idx (userId, reviewedAt),
      INDEX bankReviewLog_user_action_idx (userId, action))`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS bankReviewMatches (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      userId BIGINT UNSIGNED NOT NULL,
      bankTransactionId BIGINT UNSIGNED NOT NULL,
      targetType ENUM('sale','cash','bill') NOT NULL,
      targetId BIGINT UNSIGNED NOT NULL,
      status ENUM('linked','dismissed') NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      UNIQUE INDEX bankReviewMatches_tx_target_idx (bankTransactionId, targetType, targetId),
      INDEX bankReviewMatches_user_idx (userId, targetType, status))`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS bankTransactionSplits (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      userId BIGINT UNSIGNED NOT NULL,
      bankTransactionId BIGINT UNSIGNED NOT NULL,
      position INT NOT NULL,
      category VARCHAR(40) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      personal TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      INDEX bankTransactionSplits_tx_idx (bankTransactionId),
      INDEX bankTransactionSplits_user_idx (userId))`);
  })().catch((e: unknown) => {
    ready = null; // try again on the next call
    throw e;
  });
  return ready;
}

/**
 * The SQL twin of reviewEngine.ruleMatches: true when one of the owner's active rules is contained in the
 * movement's description or merchant name. api/review-router.ts `unreviewed()` uses it so the bank's
 * automatic categorizer never overwrites a category a rule set.
 */
export const matchesAnyRule = () => sql`EXISTS (SELECT 1 FROM smartCategoryRules r WHERE r.userId = ${bankTransactions.userId}
  AND COALESCE(r.isActive, 1) = 1 AND CHAR_LENGTH(TRIM(r.merchantPattern)) >= 2
  AND LOCATE(LOWER(TRIM(r.merchantPattern)), LOWER(CONCAT(${bankTransactions.description}, ' | ', COALESCE(${bankTransactions.merchantName}, '')))) > 0)`;

// ── Rules ──
export type RuleRow = Rule & { usageCount: number; createdAt: Date | string };

export async function loadRules(db: Db, userId: number): Promise<RuleRow[]> {
  const rows: Array<{ id: number; pattern: string; category: string; usageCount: number | null; isActive: boolean | number | null; createdAt: Date | string }> = await db
    .select({
      id: smartCategoryRules.id, pattern: smartCategoryRules.merchantPattern, category: smartCategoryRules.category,
      usageCount: smartCategoryRules.usageCount, isActive: smartCategoryRules.isActive, createdAt: smartCategoryRules.createdAt,
    })
    .from(smartCategoryRules).where(eq(smartCategoryRules.userId, userId)).orderBy(smartCategoryRules.id);
  return rows
    .filter((r) => r.isActive === null || r.isActive === true || Number(r.isActive) === 1)
    .map((r) => ({ id: Number(r.id), pattern: cleanPattern(r.pattern), category: r.category, usageCount: Number(r.usageCount ?? 0), createdAt: r.createdAt }));
}

/**
 * Applies the owner's rules to their movements still to review: each one a rule matches gets the rule's
 * category as its suggestion (it stays in Por revisar until approved). Returns how many each rule set.
 */
export async function applyRulesToPending(db: Db, userId: number, rules: readonly Rule[]): Promise<Map<number, number>> {
  const hits = new Map<number, number>();
  if (rules.length === 0) return hits;
  const rows: Array<{ id: number; description: string; merchantName: string | null; type: MoneyType; category: string }> = await db
    .select({ id: bankTransactions.id, description: bankTransactions.description, merchantName: bankTransactions.merchantName, type: bankTransactions.type, category: bankTransactions.category })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.userId, userId), sql`COALESCE(${bankTransactions.isReconciled}, 0) = 0`));
  for (const r of rows) {
    const rule = findRule(rules, r);
    if (!rule) continue;
    hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1);
    if (r.category === rule.category) continue;
    await db.update(bankTransactions).set({ category: rule.category, type: resolveType(rule.category, r.type) })
      .where(and(eq(bankTransactions.id, r.id), eq(bankTransactions.userId, userId), sql`COALESCE(${bankTransactions.isReconciled}, 0) = 0`));
  }
  return hits;
}

// ── Facts for the engine ──

/** Movements the owner reviewed in the last year, except splits and exclusions (they say nothing about one category). */
export async function loadHistory(db: Db, userId: number): Promise<HistoryRow[]> {
  const res = await db.execute(sql`
    SELECT t.description AS description, t.merchantName AS merchantName, t.category AS category, t.type AS type
    FROM bankTransactions t
    LEFT JOIN bankReviewLog l ON l.bankTransactionId = t.id AND l.userId = t.userId
    WHERE t.userId = ${userId} AND COALESCE(t.isReconciled, 0) = 1
      AND t.transactionDate >= DATE_SUB(UTC_DATE(), INTERVAL 365 DAY)
      AND (l.action IS NULL OR l.action NOT IN ('excluded', 'split'))
    ORDER BY t.transactionDate DESC
    LIMIT 5000`);
  return ((res as unknown as [HistoryRow[]])[0] ?? []).map((r) => ({ ...r, type: r.type === "income" ? "income" : "expense" }));
}

/**
 * What clients still owe: every pending sale (Facturas: issued invoices, and sales from quotes and recurring
 * invoices), with the balance left after any partial payments (invoicePayments). A deposit matches the balance.
 */
export async function loadReceivables(db: Db, userId: number, tzOffsetMinutes: number): Promise<Receivable[]> {
  type Row = { saleId: number; invoiceNumber: string; customerName: string | null; total: string; paid: string | null; day: string };
  const read = async (withPayments: boolean): Promise<Row[]> => {
    const paid = withPayments
      ? sql`(SELECT COALESCE(SUM(CASE WHEN p.kind = 'payment' THEN p.amount ELSE -p.amount END), 0) FROM invoicePayments p WHERE p.saleId = s.id AND p.userId = ${userId})`
      : sql`0`;
    const res = await db.execute(sql`
      SELECT s.id AS saleId, s.invoiceNumber AS invoiceNumber, s.customerName AS customerName, s.total AS total, ${paid} AS paid,
             DATE_FORMAT(DATE_ADD(s.createdAt, INTERVAL ${tzOffsetMinutes} MINUTE), '%Y-%m-%d') AS day
      FROM sales s
      WHERE s.createdBy = ${userId} AND s.status = 'pending'
      ORDER BY s.createdAt ASC, s.id ASC
      LIMIT 300`);
    return (res as unknown as [Row[]])[0] ?? [];
  };
  let rows: Row[];
  try {
    rows = await read(true);
  } catch (e: unknown) {
    if (!isMissingTable(e)) throw e;
    rows = await read(false); // nobody used Facturas yet: no partial payments anywhere
  }
  return rows
    .map((r) => ({ saleId: Number(r.saleId), invoiceNumber: r.invoiceNumber, customerName: r.customerName, totalCents: toCents(r.total) - toCents(r.paid), day: r.day, quoteNumber: null }))
    .filter((r) => r.totalCents > 0);
}

/** Completed cash sales (point of sale) between two local days, not yet linked to a deposit. */
export async function loadCashSales(db: Db, userId: number, from: string, to: string, tzOffsetMinutes: number): Promise<CashSale[]> {
  const res = await db.execute(sql`
    SELECT s.id AS saleId, s.total AS total, DATE_FORMAT(DATE_ADD(s.createdAt, INTERVAL ${tzOffsetMinutes} MINUTE), '%Y-%m-%d') AS day
    FROM sales s
    WHERE s.createdBy = ${userId} AND s.status = 'completed' AND s.paymentMethod = 'cash'
      AND DATE(DATE_ADD(s.createdAt, INTERVAL ${tzOffsetMinutes} MINUTE)) BETWEEN ${from} AND ${to}
      AND NOT EXISTS (SELECT 1 FROM bankReviewMatches m WHERE m.userId = ${userId} AND m.targetType = 'cash' AND m.targetId = s.id AND m.status = 'linked')
    ORDER BY s.createdAt ASC, s.id ASC
    LIMIT 500`);
  type Row = { saleId: number; total: string; day: string };
  return ((res as unknown as [Row[]])[0] ?? []).map((r) => ({ saleId: Number(r.saleId), totalCents: toCents(r.total), day: r.day }));
}

/** Unpaid vendor bills. Empty without that feature's tables. */
export async function loadOpenBills(db: Db, userId: number): Promise<OpenBill[]> {
  try {
    const rows: Array<{ billId: number; vendorName: string | null; description: string; amount: string; dueDate: string }> = await db
      .select({
        billId: bills.id, vendorName: vendors.name, description: bills.description, amount: bills.amount,
        dueDate: sql<string>`DATE_FORMAT(${bills.dueDate}, '%Y-%m-%d')`,
      })
      .from(bills).leftJoin(vendors, and(eq(vendors.id, bills.vendorId), eq(vendors.userId, userId)))
      .where(and(eq(bills.userId, userId), eq(bills.status, "unpaid")))
      .limit(300);
    return rows.map((r) => ({ billId: Number(r.billId), vendorName: r.vendorName ?? "", description: r.description, amountCents: toCents(r.amount), dueDate: r.dueDate }));
  } catch (e: unknown) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

/** "No es esto" answers, per movement, as reviewEngine dismiss keys ("sale:12"). */
export async function loadDismissed(db: Db, userId: number, txIds: number[]): Promise<Map<number, Set<string>>> {
  const out = new Map<number, Set<string>>();
  if (txIds.length === 0) return out;
  const rows: Array<{ tx: number; type: "sale" | "cash" | "bill"; target: number }> = await db
    .select({ tx: bankReviewMatches.bankTransactionId, type: bankReviewMatches.targetType, target: bankReviewMatches.targetId })
    .from(bankReviewMatches)
    .where(and(eq(bankReviewMatches.userId, userId), eq(bankReviewMatches.status, "dismissed"), inArray(bankReviewMatches.bankTransactionId, txIds)));
  for (const r of rows) {
    const set = out.get(Number(r.tx)) ?? new Set<string>();
    set.add(`${r.type}:${Number(r.target)}`);
    out.set(Number(r.tx), set);
  }
  return out;
}

/** Sales and bills already linked to some movement (never suggested again). */
export async function loadLinkedTargets(db: Db, userId: number): Promise<{ sale: Set<number>; bill: Set<number> }> {
  const rows: Array<{ type: "sale" | "cash" | "bill"; target: number }> = await db
    .select({ type: bankReviewMatches.targetType, target: bankReviewMatches.targetId })
    .from(bankReviewMatches)
    .where(and(eq(bankReviewMatches.userId, userId), eq(bankReviewMatches.status, "linked"), inArray(bankReviewMatches.targetType, ["sale", "bill"])));
  const sale = new Set<number>();
  const bill = new Set<number>();
  for (const r of rows) (r.type === "sale" ? sale : bill).add(Number(r.target));
  return { sale, bill };
}

// ── The review log ──
export type LogAction = "approved" | "changed" | "answered" | "bulk" | "linked" | "split" | "excluded";
export type LogEntry = {
  bankTransactionId: number;
  action: LogAction;
  reason?: "duplicate" | "transfer" | "other" | null;
  relatedId?: number | null;
  prevCategory: string | null;
  prevType: MoneyType | null;
};

/**
 * Records what was done. A movement acted on again keeps the category it had the first time (so undo goes
 * all the way back) and gets the new action and time.
 */
export async function writeLog(db: Db, userId: number, entries: LogEntry[]): Promise<void> {
  // What the person does replaces what the app confirmed for them (api/lib/autoConfirm.ts). "Deshacer" then goes back
  // to the category the movement had before the app confirmed it.
  const txIds = entries.map((e) => Number(e.bankTransactionId));
  const appPrev = await autoPrevOf(db, userId, txIds);
  await forgetAuto(db, userId, txIds);
  for (const e0 of entries) {
    const before = appPrev.get(Number(e0.bankTransactionId));
    const e = before ? { ...e0, prevCategory: before.prevCategory, prevType: before.prevType } : e0;
    await db.insert(bankReviewLog).values({
      userId, bankTransactionId: e.bankTransactionId, action: e.action, reason: e.reason ?? null, relatedId: e.relatedId ?? null,
      prevCategory: e.prevCategory, prevType: e.prevType,
    }).onDuplicateKeyUpdate({
      set: { action: e.action, reason: e.reason ?? null, relatedId: e.relatedId ?? null, reviewedAt: sql`CURRENT_TIMESTAMP` },
    });
  }
}

/** Deletes a movement's split parts. */
export async function clearSplits(db: Db, userId: number, txIds: number[]): Promise<void> {
  if (txIds.length === 0) return;
  await db.delete(bankTransactionSplits).where(and(eq(bankTransactionSplits.userId, userId), inArray(bankTransactionSplits.bankTransactionId, txIds)));
}

/** Movement ids excluded in Por revisar (duplicates, transfers, others): for reports that should leave them out. */
export const excludedInReview = () => sql`EXISTS (SELECT 1 FROM bankReviewLog l WHERE l.bankTransactionId = ${bankTransactions.id} AND l.action = 'excluded')`;

export { bankReviewLog, bankReviewMatches, bankTransactionSplits };
export type { Exec };
