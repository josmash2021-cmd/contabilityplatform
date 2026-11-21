// ── Gastos: everything the business spends ──
// One list for the expenses written by hand ("Gasto en efectivo"), the ones receipts and paid vendor bills
// record, and the business money that left the bank. The rule that counts each peso once is in
// api/lib/expenses.ts (buildSpendItems); this router loads the rows and applies it.
//
// expenses.create writes the expense and its journal entry together (debit Gastos 5100, credit cash 1110 /
// Zelle 1130 / card: the bank 1120, reference EXP-<id>, type "purchase"; skipped when the chart of accounts isn't set up
// yet, the accounting repair adds it later). Its entry number is "GAS-<day>-M<expense id>": the old one counted
// entries created after "now" (always 0), so every expense was "-0001" and the second one of a day hit the
// unique index on journalEntries.entryNumber after the expense row was already written.
//
// Team access (api/lib/team.ts): the accountant reads (overview, list, stats); employees don't reach expenses.*
// (they add receipts through receipts.create); every change here is the owner's.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { accounts, bankAccounts, bankTransactions, expenses, journalEntries, journalEntryLines, periodClosures } from "@db/schema";
import { expenseBankLinks, expenseLimits, receipts } from "@db/receiptsSchema";
import { bills, vendors } from "@db/vendorsSchema";
import { bankReviewMatches, bankTransactionSplits, ensureReviewTables } from "./lib/reviewStore";
import { requireFeature, contextHas } from "./lib/planAccess";
import { isMissingTable } from "./lib/dbErrors";
import { withMerchantLogos } from "./lib/merchantLogos";
import { isBankOwnMovement } from "./lib/brand";
import type { Lang } from "./lib/i18n";
import { REVIEW_WINDOW_DAYS } from "./lib/bankReview";
import { displayNameOf } from "./lib/reviewEngine";
import { effectiveToday, utcToday } from "./lib/vendors";
import { MAX_RECEIPT_AMOUNT, isIsoDate } from "./lib/receipts";
import {
  PAIR_DAYS_AFTER, SPEND_CATEGORIES, addDays, buildSpendItems, comparisonRange, daysBetween, detectRecurring, inRange,
  isBusinessSpending, isDigitalPayment, manualEntryNumber, monthDays, recurringKeyOf, shiftMonth, spendTotals, toCents,
  type BankIn, type ExpenseIn, type PairLink, type PayMethod, type SpendCategory, type SpendItem,
} from "./lib/expenses";
import { accountLabel, deleteExpenseEntries, ensureExpenseTables, ensureReceiptsTable } from "./receipts-router";

type Db = ReturnType<typeof getDb>;
type Exec = [{ insertId: number | string; affectedRows: number }];

// ── Messages (es / en) ──
const MESSAGES = {
  es: {
    badAmount: "Escribe un monto válido, por ejemplo 25.50.",
    badDate: "Elige una fecha válida.",
    futureDate: "La fecha no puede ser después de hoy.",
    closedMonth: "Ese mes ya está cerrado en tu contabilidad. Elige otra fecha o pide a tu contador un ajuste.",
    hasReceipt: "Este gasto tiene su foto de recibo. Bórralo desde el recibo para no perder la foto por error.",
    isBill: "Este gasto es el pago de una factura. Para quitarlo, márcala como no pagada en Proveedores.",
    saveFailed: "No pudimos guardar el gasto. Inténtalo de nuevo.",
  },
  en: {
    badAmount: "Type a valid amount, for example 25.50.",
    badDate: "Pick a valid date.",
    futureDate: "The date can't be after today.",
    closedMonth: "That month is already closed in your books. Pick another date or ask your accountant for an adjustment.",
    hasReceipt: "This expense has its receipt photo. Delete it from the receipt so the photo isn't lost by mistake.",
    isBill: "This expense is a bill payment. To remove it, mark the bill unpaid in Vendors.",
    saveFailed: "We couldn't save the expense. Please try again.",
  },
} satisfies Record<Lang, Record<string, string>>;
type MsgKey = keyof (typeof MESSAGES)["es"];
function fail(code: TRPCError["code"], lang: Lang, key: MsgKey): never {
  throw new TRPCError({ code, message: (MESSAGES[lang] ?? MESSAGES.es)[key] });
}

const ymd = (col: AnyMySqlColumn) => sql<string>`DATE_FORMAT(${col}, '%Y-%m-%d')`;

/** True when that day's month is closed in the user's books (Contabilidad → cerrar periodo). */
async function isMonthClosed(db: Db, userId: number, day: string): Promise<boolean> {
  const [y, m] = day.split("-").map(Number);
  const rows: Array<{ id: number }> = await db.select({ id: periodClosures.id }).from(periodClosures)
    .where(and(eq(periodClosures.userId, userId), eq(periodClosures.year, y), eq(periodClosures.month, m))).limit(1);
  return rows.length > 0;
}

/**
 * Payment account per method (same as Recibos and Proveedores): cash 1110, Zelle 1130, card 1120; the expense goes to 5100.
 * A card payment comes out of the business bank account (Banco 1120), like the accounting repair books it;
 * 1150 (Cuentas por Cobrar) is money a card processor or a client still owes the business, so it was wrong here.
 */
const PAYMENT_ACCOUNT: Record<PayMethod, string> = { cash: "1110", zelle: "1130", card: "1120" };

/** A day sent as "YYYY-MM-DD" (or an ISO date-time, as older callers did): its calendar day, or null. */
function dayOf(v: string): string | null {
  const d = v.trim().slice(0, 10);
  return isIsoDate(d) ? d : null;
}

// ── Loading what Gastos shows ──
type ExpenseRow = {
  id: number; description: string; category: string; subcategory: string | null; amount: string;
  paymentMethod: PayMethod; date: string; reference: string | null; receipt: string | null;
};
type BankRow = {
  id: number; description: string; merchantName: string | null; amount: string; date: string; category: string; type: string;
  isDuplicate: boolean | number | null; isReconciled: boolean | number | null; bankName: string | null; accountNumber: string | null; accountId: number | null; plaidCategory: string | null;
};

/** Runs a query on a feature's own table, or returns `empty` when that table doesn't exist yet. */
async function orEmpty<T>(q: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await q();
  } catch (e: unknown) {
    if (isMissingTable(e)) return empty;
    throw e;
  }
}

/** Every spending item between two days (plus a few days around them, so a charge can meet its receipt). */
async function loadSpendItems(db: Db, userId: number, from: string, to: string, today: string): Promise<SpendItem[]> {
  const loadFrom = addDays(from, -(PAIR_DAYS_AFTER + 1));
  const loadTo = addDays(to, PAIR_DAYS_AFTER + 1);

  const exp: ExpenseRow[] = await db.select({
    id: expenses.id, description: expenses.description, category: expenses.category, subcategory: expenses.subcategory,
    amount: expenses.amount, paymentMethod: expenses.paymentMethod, date: ymd(expenses.date), reference: expenses.reference, receipt: expenses.receipt,
  }).from(expenses).where(and(eq(expenses.createdBy, userId), sql`${expenses.date} BETWEEN ${loadFrom} AND ${loadTo}`));
  const expIds = exp.map((e) => Number(e.id));

  // Which expenses a receipt created (as opposed to a photo added later).
  const owned = new Set<number>();
  if (expIds.length) {
    const rs: Array<{ expenseId: number | null; attached: boolean | number }> = await db.select({ expenseId: receipts.expenseId, attached: receipts.attached })
      .from(receipts).where(and(eq(receipts.userId, userId), inArray(receipts.expenseId, expIds)));
    for (const r of rs) if (r.expenseId && Number(r.attached) !== 1) owned.add(Number(r.expenseId));
  }

  // Paid bills: their expense carries the vendor and the concept.
  type BillRow = { id: number; vendorId: number; expenseId: number | null; vendorName: string | null; concept: string };
  const billRows: BillRow[] = expIds.length
    ? await orEmpty(() => db.select({ id: bills.id, vendorId: bills.vendorId, expenseId: bills.expenseId, vendorName: vendors.name, concept: bills.description })
      .from(bills).leftJoin(vendors, eq(vendors.id, bills.vendorId))
      .where(and(eq(bills.userId, userId), inArray(bills.expenseId, expIds))), [] as BillRow[])
    : [];
  const billByExpense = new Map(billRows.filter((b) => b.expenseId).map((b) => [Number(b.expenseId), b]));

  const expensesIn: ExpenseIn[] = exp.map((e) => {
    const b = billByExpense.get(Number(e.id));
    const receiptId = e.receipt && /^\d+$/.test(e.receipt) ? Number(e.receipt) : null;
    return {
      id: Number(e.id), description: e.description, category: e.category, subcategory: e.subcategory, amount: e.amount,
      paymentMethod: e.paymentMethod, date: e.date, receiptId, fromReceipt: owned.has(Number(e.id)),
      bill: b ? { id: Number(b.id), vendorId: Number(b.vendorId), vendorName: b.vendorName ?? e.subcategory ?? "", concept: b.concept } : null,
    };
  });

  // Business money out of the bank (rule 3 in api/lib/expenses.ts), without movements excluded in Por revisar.
  await ensureReviewTables(db);
  const bankRows: BankRow[] = await db.select({
    id: bankTransactions.id, description: bankTransactions.description, merchantName: bankTransactions.merchantName,
    amount: bankTransactions.amount, date: ymd(bankTransactions.transactionDate), category: bankTransactions.category,
    type: bankTransactions.type, isDuplicate: bankTransactions.isDuplicate, isReconciled: bankTransactions.isReconciled,
    bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber, accountId: bankTransactions.bankAccountId,
    plaidCategory: bankTransactions.plaidCategory,
  }).from(bankTransactions).leftJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId))
    .where(and(
      eq(bankTransactions.userId, userId),
      eq(bankTransactions.type, "expense"),
      sql`${bankTransactions.transactionDate} BETWEEN ${loadFrom} AND ${loadTo}`,
      sql`NOT EXISTS (SELECT 1 FROM bankReviewLog l WHERE l.bankTransactionId = ${bankTransactions.id} AND l.action = 'excluded')`,
    ));
  const spending = bankRows.filter((r) => isBusinessSpending({ type: r.type, category: r.category, isDuplicate: r.isDuplicate }));
  const bankIds = spending.map((r) => Number(r.id));

  // Split movements count only their business parts.
  const businessCents = new Map<number, number>();
  if (bankIds.length) {
    const parts: Array<{ tx: number; amount: string; personal: boolean | number }> = await db.select({
      tx: bankTransactionSplits.bankTransactionId, amount: bankTransactionSplits.amount, personal: bankTransactionSplits.personal,
    }).from(bankTransactionSplits).where(and(eq(bankTransactionSplits.userId, userId), inArray(bankTransactionSplits.bankTransactionId, bankIds)));
    for (const p of parts) {
      const id = Number(p.tx);
      businessCents.set(id, (businessCents.get(id) ?? 0) + (Number(p.personal) === 1 ? 0 : toCents(p.amount)));
    }
  }
  const withLogos = await withMerchantLogos(db, spending.map((r) => ({ ...r, logoUrl: null as string | null })));
  const banksIn: BankIn[] = withLogos.map((r) => {
    const full = Math.abs(toCents(r.amount));
    return {
      id: Number(r.id), name: displayNameOf(r.description, r.merchantName), text: `${r.description} ${r.merchantName ?? ""}`,
      amountCents: businessCents.has(Number(r.id)) ? businessCents.get(Number(r.id))! : full, fullCents: full,
      date: r.date, category: r.category, reviewed: Number(r.isReconciled) === 1,
      account: accountLabel(r.bankName, r.accountNumber), accountId: r.accountId === null ? null : Number(r.accountId), logoUrl: r.logoUrl,
      bankOwn: isBankOwnMovement(`${r.description} ${r.merchantName ?? ""}`, r.plaidCategory),
      digital: isDigitalPayment(`${r.description} ${r.merchantName ?? ""}`, { category: r.category, plaidCategory: r.plaidCategory }),
    };
  });

  // Links: Por revisar's "Vincular" on a bill, and the owner's own links / "No es el mismo cargo".
  const reviewLinks: Array<{ tx: number; billId: number }> = await db.select({ tx: bankReviewMatches.bankTransactionId, billId: bankReviewMatches.targetId })
    .from(bankReviewMatches).where(and(eq(bankReviewMatches.userId, userId), eq(bankReviewMatches.targetType, "bill"), eq(bankReviewMatches.status, "linked")));
  let reviewBillLinks: Array<{ expenseId: number; bankTransactionId: number }> = [];
  if (reviewLinks.length) {
    const linkedBills: Array<{ id: number; expenseId: number | null }> = await orEmpty(() => db.select({ id: bills.id, expenseId: bills.expenseId }).from(bills)
      .where(and(eq(bills.userId, userId), inArray(bills.id, reviewLinks.map((l) => Number(l.billId))))), [] as Array<{ id: number; expenseId: number | null }>);
    const expOfBill = new Map(linkedBills.filter((b) => b.expenseId).map((b) => [Number(b.id), Number(b.expenseId)]));
    reviewBillLinks = reviewLinks.flatMap((l) => {
      const e = expOfBill.get(Number(l.billId));
      return e ? [{ expenseId: e, bankTransactionId: Number(l.tx) }] : [];
    });
  }
  const links: PairLink[] = (await db.select({ expenseId: expenseBankLinks.expenseId, bankTransactionId: expenseBankLinks.bankTransactionId, status: expenseBankLinks.status })
    .from(expenseBankLinks).where(eq(expenseBankLinks.userId, userId)) as PairLink[])
    .map((l) => ({ expenseId: Number(l.expenseId), bankTransactionId: Number(l.bankTransactionId), status: l.status }));

  const items = buildSpendItems({ expenses: expensesIn, banks: banksIn, links, reviewBillLinks, today, reviewWindowDays: REVIEW_WINDOW_DAYS });

  // Merchant logos for expenses whose charge didn't bring one (matched by the merchant's name).
  const missing = items.filter((i) => !i.logoUrl);
  if (missing.length) {
    const found = await withMerchantLogos(db, missing.map((i) => ({ description: i.who, merchantName: null, logoUrl: null as string | null })));
    missing.forEach((i, k) => { i.logoUrl = found[k].logoUrl; });
  }
  return inRange(items, from, to);
}

const monthInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  /** The app's local day (YYYY-MM-DD), for "this month so far" and Por revisar's window. */
  today: z.string().optional(),
});

export const expensesRouter = createRouter({
  list: authedQuery
    .input(z.object({ limit: z.number().min(1).max(200).default(50), offset: z.number().min(0).default(0) }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      return db.select().from(expenses).where(eq(expenses.createdBy, Number(ctx.user.id))).orderBy(desc(expenses.createdAt)).limit(limit).offset(offset);
    }),

  /**
   * Gastos for one month: every item (each money movement once), the total and the month before, the split by
   * category, how many have their receipt, the monthly limits, and the charges that repeat.
   */
  overview: authedQuery.input(monthInput).query(async ({ input, ctx }) => {
    const db = getDb();
    const plan = await requireFeature(db, ctx.user, "receipts", ctx.lang);
    await ensureReceiptsTable(db);
    await ensureExpenseTables(db);
    const userId = Number(ctx.user.id);
    const today = effectiveToday(input.today, utcToday());
    const ym = { year: input.year, month: input.month };
    const cur = monthDays(ym);
    const cmp = comparisonRange(ym, today);
    // Three months before, to see a monthly charge come back.
    const histFrom = monthDays(shiftMonth(ym, -3)).from;

    const all = await loadSpendItems(db, userId, histFrom, cur.to, today);
    const monthItems = inRange(all, cur.from, cur.to);
    const prevItems = inRange(all, cmp.from, cmp.to);
    const totals = spendTotals(monthItems);
    const recurring = detectRecurring(all);

    const limitRows: Array<{ category: string; amount: string }> = await db.select({ category: expenseLimits.category, amount: expenseLimits.amount })
      .from(expenseLimits).where(eq(expenseLimits.userId, userId));
    const usedBy = new Map(totals.byCategory.map((c) => [c.category, c.cents]));
    const limits = limitRows
      .filter((l) => (SPEND_CATEGORIES as readonly string[]).includes(l.category))
      .map((l) => ({ category: l.category as SpendCategory, limit: toCents(l.amount) / 100, used: (usedBy.get(l.category as SpendCategory) ?? 0) / 100 }))
      .sort((a, b) => b.used / (b.limit || 1) - a.used / (a.limit || 1));

    const bankCount: Array<{ n: number | string }> = await db.select({ n: sql<number>`COUNT(*)` }).from(bankAccounts)
      .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, true)));

    const items = monthItems.map((i) => {
      const r = recurring.get(recurringKeyOf(i));
      return {
        key: i.key, source: i.source, expenseId: i.expenseId, bankTransactionId: i.bankTransactionId, receiptId: i.receiptId,
        billId: i.billId, vendorId: i.vendorId, who: i.who, detail: i.detail, category: i.category, amount: i.amountCents / 100,
        date: i.date, method: i.method, account: i.account, bankAccountId: i.bankAccountId, bankOwn: i.bankOwn, logoUrl: i.logoUrl, inReview: i.inReview, hasReceipt: i.hasReceipt, receiptNeeded: i.receiptNeeded,
        pairedBy: i.pairedBy, nextCharge: r && r.nextDate >= i.date ? r.nextDate : null,
      };
    });

    return {
      today,
      month: ym,
      total: totals.totalCents / 100,
      count: totals.count,
      withReceipt: totals.withReceipt,
      needReceipt: totals.needReceipt,
      previous: { total: spendTotals(prevItems).totalCents / 100, partial: cmp.partial, from: cmp.from, to: cmp.to },
      byCategory: totals.byCategory.map((c) => ({ category: c.category, total: c.cents / 100, count: c.count })),
      limits,
      recurringCount: items.filter((i) => i.nextCharge).length,
      bankConnected: Number(bankCount[0]?.n ?? 0) > 0,
      hasVendors: contextHas(plan, "vendors"),
      items,
    };
  }),

  /** A hand-written expense ("Gasto en efectivo"): the expense and its journal entry, together or not at all. */
  create: authedQuery
    .input(z.object({
      description: z.string().trim().min(1).max(255),
      category: z.string().trim().min(1).max(100),
      subcategory: z.string().trim().max(100).optional(),
      amount: z.string().or(z.number()),
      paymentMethod: z.enum(["cash", "zelle", "card"]),
      date: z.string(),
      reference: z.string().trim().max(255).optional(),
      receipt: z.string().optional(),
      notes: z.string().trim().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const cents = toCents(input.amount);
      if (cents < 1 || cents > MAX_RECEIPT_AMOUNT * 100) fail("BAD_REQUEST", ctx.lang, "badAmount");
      const day = dayOf(input.date);
      if (!day) fail("BAD_REQUEST", ctx.lang, "badDate");
      // The app sends its local day; one day ahead is allowed for time zones east of UTC.
      if (daysBetween(utcToday(), day) > 1) fail("BAD_REQUEST", ctx.lang, "futureDate");
      if (await isMonthClosed(db, userId, day)) fail("PRECONDITION_FAILED", ctx.lang, "closedMonth");
      const amount = (cents / 100).toFixed(2);

      try {
        const expenseId: number = await db.transaction(async (tx: Db) => {
          const res: Exec = await tx.insert(expenses).values({
            description: input.description, category: input.category, subcategory: input.subcategory || null, amount,
            paymentMethod: input.paymentMethod, date: day, reference: input.reference || null, receipt: input.receipt || null,
            notes: input.notes || null, createdBy: userId,
          });
          const id = Number(res[0].insertId);
          const codes = [PAYMENT_ACCOUNT[input.paymentMethod], "5100"];
          const accs: Array<{ id: number; code: string }> = await tx.select({ id: accounts.id, code: accounts.code }).from(accounts)
            .where(and(eq(accounts.userId, userId), inArray(accounts.code, codes))).orderBy(accounts.id);
          const paymentAccId = accs.find((a) => a.code === codes[0])?.id;
          const expenseAccId = accs.find((a) => a.code === "5100")?.id;
          if (paymentAccId && expenseAccId) {
            const description = `Gasto: ${input.description}`;
            const je: Exec = await tx.insert(journalEntries).values({
              entryNumber: manualEntryNumber(utcToday(), id),
              date: day, description,
              reference: input.reference ?? `EXP-${id}`,
              referenceId: id,
              referenceType: "purchase",
              debitTotal: amount,
              creditTotal: amount,
              createdBy: userId,
            });
            const jeId = Number(je[0].insertId);
            await tx.insert(journalEntryLines).values([
              { journalEntryId: jeId, accountId: expenseAccId, debit: amount, credit: "0", description },
              { journalEntryId: jeId, accountId: paymentAccId, debit: "0", credit: amount, description: `Pago ${input.paymentMethod}` },
            ]);
          }
          return id;
        });
        return { id: expenseId };
      } catch (e: unknown) {
        if (e instanceof TRPCError) throw e;
        console.error("[expenses.create]", e instanceof Error ? e.message : e);
        fail("INTERNAL_SERVER_ERROR", ctx.lang, "saveFailed");
      }
    }),

  /**
   * Deletes a hand-written expense with its journal entries. One that came with a receipt photo is deleted
   * from its receipt, and a bill payment by marking the bill unpaid, so nothing is left half-done.
   */
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const rows: Array<{ id: number; date: string; receipt: string | null; reference: string | null }> = await db
        .select({ id: expenses.id, date: ymd(expenses.date), receipt: expenses.receipt, reference: expenses.reference })
        .from(expenses).where(and(eq(expenses.id, input.id), eq(expenses.createdBy, userId))).limit(1);
      const exp = rows[0];
      if (!exp) return { success: true };
      if (exp.receipt) fail("CONFLICT", ctx.lang, "hasReceipt");
      const paidBill = await orEmpty(() => db.select({ id: bills.id }).from(bills)
        .where(and(eq(bills.userId, userId), eq(bills.expenseId, exp.id))).limit(1), [] as Array<{ id: number }>);
      if (paidBill.length || /^BILL-\d+$/.test(exp.reference ?? "")) fail("CONFLICT", ctx.lang, "isBill");
      if (await isMonthClosed(db, userId, exp.date)) fail("PRECONDITION_FAILED", ctx.lang, "closedMonth");
      await ensureExpenseTables(db);
      await db.transaction(async (tx: Db) => {
        await deleteExpenseEntries(tx, userId, exp.id);
        await tx.delete(expenseBankLinks).where(and(eq(expenseBankLinks.userId, userId), eq(expenseBankLinks.expenseId, exp.id)));
        await tx.delete(expenses).where(and(eq(expenses.id, exp.id), eq(expenses.createdBy, userId)));
      });
      return { success: true };
    }),

  /** "Límites del mes": sets (or with null, removes) the monthly limit of one category. */
  setLimit: authedQuery
    .input(z.object({ category: z.enum(SPEND_CATEGORIES), amount: z.number().positive().max(MAX_RECEIPT_AMOUNT).nullable() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "receipts", ctx.lang);
      await ensureExpenseTables(db);
      const userId = Number(ctx.user.id);
      if (input.amount === null) {
        await db.delete(expenseLimits).where(and(eq(expenseLimits.userId, userId), eq(expenseLimits.category, input.category)));
        return { category: input.category, amount: null };
      }
      const cents = toCents(input.amount);
      if (cents < 100) fail("BAD_REQUEST", ctx.lang, "badAmount");
      const amount = (cents / 100).toFixed(2);
      await db.execute(sql`
        INSERT INTO expenseLimits (userId, category, amount) VALUES (${userId}, ${input.category}, ${amount})
        ON DUPLICATE KEY UPDATE amount = VALUES(amount)
      `);
      return { category: input.category, amount: cents / 100 };
    }),

  /** "No es el mismo cargo": an expense and a bank charge that were matched are kept apart from now on. */
  unpair: authedQuery
    .input(z.object({ expenseId: z.number().int().positive(), bankTransactionId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureExpenseTables(db);
      const userId = Number(ctx.user.id);
      const own: Array<{ id: number }> = await db.select({ id: expenses.id }).from(expenses)
        .where(and(eq(expenses.id, input.expenseId), eq(expenses.createdBy, userId))).limit(1);
      const tx: Array<{ id: number }> = await db.select({ id: bankTransactions.id }).from(bankTransactions)
        .where(and(eq(bankTransactions.id, input.bankTransactionId), eq(bankTransactions.userId, userId))).limit(1);
      if (!own.length || !tx.length) throw new TRPCError({ code: "NOT_FOUND" });
      await db.execute(sql`
        INSERT INTO expenseBankLinks (userId, expenseId, bankTransactionId, status) VALUES (${userId}, ${input.expenseId}, ${input.bankTransactionId}, 'dismissed')
        ON DUPLICATE KEY UPDATE status = 'dismissed'
      `);
      return { ok: true };
    }),

  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = Number(ctx.user.id);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);

    const monthResult = await db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`, count: sql<number>`COUNT(*)` })
      .from(expenses).where(and(eq(expenses.createdBy, userId), gte(expenses.date, monthAgo)));

    const byCategory = await db.select({
      category: expenses.category,
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(expenses).where(and(eq(expenses.createdBy, userId), gte(expenses.date, monthAgo))).groupBy(expenses.category);

    return { monthTotal: monthResult[0]?.total ?? "0", monthCount: monthResult[0]?.count ?? 0, byCategory };
  }),
});
