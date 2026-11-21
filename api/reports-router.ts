// ── Reportes (src/pages/Reports.tsx) ──
// Income = this user's sales with status "completed" (pending, cancelled and refunded don't count), by local day
// using the browser's UTC offset. Expenses = every expense this user recorded, by its calendar date.
// The balance sheet and the cash flow come from the journal (journalEntries / journalEntryLines).
// Pure rules (periods, changes, the balance sheet, the cash flow, aging, tips): api/lib/reportBooks.ts.
// Plans: the Simple view is in every business plan; "Para contador" (balance, cash flow, journal) needs
// "accountant" (Pro and Negocio); by client needs "clientReports" (Negocio). Team: the accountant reads all
// of it (queries only); staff never reach it (api/lib/team.ts).
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { accounts, journalEntries, journalEntryLines, sales, expenses, bankAccounts, bankTransactions, customers, saleServices, services } from "@db/schema";
import { bills, vendors } from "@db/vendorsSchema";
import { expenseBankLinks, receipts } from "@db/receiptsSchema";
import { bankReviewMatches, bankTransactionSplits, ensureReviewTables } from "./lib/reviewStore";
import { REVIEW_WINDOW_DAYS } from "./lib/bankReview";
import { displayNameOf } from "./lib/reviewEngine";
import { accountLabel } from "./receipts-router";
import {
  PAIR_DAYS_AFTER, addDays as spendAddDays, buildSpendItems, inRange, isBusinessSpending, toCents as spendCents,
  type BankIn, type ExpenseIn, type PairLink, type PayMethod, type SpendItem,
} from "./lib/expenses";
import { sql, desc, eq, and, inArray, lte, gte, lt } from "drizzle-orm";
import { isoDate, tzOffsetHours } from "./lib/security";
import { contextHas, getPlanContext, requireFeature } from "./lib/planAccess";
import { isMissingTable } from "./lib/dbErrors";
import { withMerchantLogos } from "./lib/merchantLogos";
import { bankReconciliations, reconcileAllowed } from "./reconcile-router";
import { buildClientReport, buildServiceReport, toNumber, type ClientAggRow, type Numeric, type ServiceAggRow } from "./lib/clientReports";
import {
  buildBalanceSheet, buildCashFlow, fillSeries, isCashAccount, mergeCategories, statementRange, sumMoney, toCents, fromCents,
  type AccountTotals, type CashEntryLine, type DateRange,
} from "./lib/reportBooks";

type Db = ReturnType<typeof getDb>;

// ── Inputs ──
const rangeShape = z.object({ startDate: isoDate, endDate: isoDate })
  .refine((v) => v.startDate <= v.endDate, { message: "startDate must be on or before endDate", path: ["endDate"] });

// ── Reports by client / by service (Negocio plan) ──
const salesRangeInput = z.object({
  startDate: isoDate,
  endDate: isoDate,
  tzOffsetHours: tzOffsetHours.optional(),
}).refine((v) => v.startDate <= v.endDate, { message: "startDate must be on or before endDate", path: ["endDate"] });
type SalesRange = z.infer<typeof salesRangeInput>;

/** A sale's local calendar day (sales carry a UTC timestamp; expenses and journal entries a plain date). */
const saleDay = (tz: number) => sql`DATE(DATE_ADD(${sales.createdAt}, INTERVAL ${tz} HOUR))`;

/** This user's completed sales whose local day is inside the range. Bound parameters, never sql.raw. */
function completedSalesIn(userId: number, range: DateRange, tz: number) {
  const day = saleDay(tz);
  return and(eq(sales.createdBy, userId), eq(sales.status, "completed"), sql`${day} >= ${range.startDate}`, sql`${day} <= ${range.endDate}`);
}
function completedSalesInRange(userId: number, range: SalesRange) {
  return completedSalesIn(userId, range, range.tzOffsetHours ?? 0);
}

const clientName = sql<string | null>`MAX(TRIM(CONCAT(${customers.name}, ' ', COALESCE(${customers.lastName}, ''))))`;

async function clientRows(db: Db, userId: number, where: ReturnType<typeof completedSalesIn>): Promise<ClientAggRow[]> {
  return db.select({
    customerId: sales.customerId,
    name: clientName,
    snapshotName: sql<string | null>`MAX(${sales.customerName})`,
    salesCount: sql<Numeric>`COUNT(*)`,
    total: sql<Numeric>`COALESCE(SUM(${sales.total}), 0)`,
    lastSaleAt: sql<Date | null>`MAX(${sales.createdAt})`.mapWith(sales.createdAt),
  })
    .from(sales)
    .leftJoin(customers, and(eq(sales.customerId, customers.id), eq(customers.userId, userId)))
    .where(where)
    .groupBy(sales.customerId);
}

async function serviceRows(db: Db, userId: number, where: ReturnType<typeof completedSalesIn>): Promise<ServiceAggRow[]> {
  return db.select({
    serviceId: saleServices.serviceId,
    name: sql<string | null>`MAX(${services.name})`,
    snapshotName: sql<string | null>`MAX(${saleServices.serviceName})`,
    quantity: sql<Numeric>`COALESCE(SUM(${saleServices.quantity}), 0)`,
    revenue: sql<Numeric>`COALESCE(SUM(${saleServices.total}), 0)`,
    salesCount: sql<Numeric>`COUNT(DISTINCT ${saleServices.saleId})`,
  })
    .from(saleServices)
    .innerJoin(sales, eq(saleServices.saleId, sales.id))
    .leftJoin(services, and(eq(saleServices.serviceId, services.id), eq(services.userId, userId)))
    .where(where)
    .groupBy(saleServices.serviceId);
}

type Agg = { total: Numeric; count: Numeric };
const one = (rows: Agg[]) => ({ total: sumMoney([rows[0]?.total]), count: toNumber(rows[0]?.count) });

async function salesTotals(db: Db, userId: number, range: DateRange, tz: number) {
  const rows: Agg[] = await db.select({ total: sql<Numeric>`COALESCE(SUM(${sales.total}), 0)`, count: sql<Numeric>`COUNT(*)` })
    .from(sales).where(completedSalesIn(userId, range, tz));
  return one(rows);
}

type CategoryRow = { category: string | null; total: Numeric; count: Numeric };

// ── Spending: the same computation as Gastos (api/lib/expenses.ts buildSpendItems) ──
// What the business spent = every expenses row + business bank charges that aren't the same money as an expense
// (no transfers, withdrawals, loan payments, personal spending, excluded or duplicate charges, nor the personal
// parts of splits). It loads the rows the way expenses-router's loadSpendItems does, so Reportes and Gastos show
// the same number for the same days.
const ymd = (col: Parameters<typeof sql>[1]) => sql<string>`DATE_FORMAT(${col}, '%Y-%m-%d')`;

async function orEmpty<T>(q: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await q();
  } catch (e) {
    if (isMissingTable(e)) return empty;
    throw e;
  }
}

/** Every spending item between two days (loaded a few days wider, so a bank charge can meet its expense). */
async function loadSpend(db: Db, userId: number, range: DateRange, today: string, opts: { logos?: boolean } = {}): Promise<SpendItem[]> {
  const loadFrom = spendAddDays(range.startDate, -(PAIR_DAYS_AFTER + 1));
  const loadTo = spendAddDays(range.endDate, PAIR_DAYS_AFTER + 1);
  type ExpRow = { id: number; description: string; category: string; subcategory: string | null; amount: string; paymentMethod: PayMethod; date: string; receipt: string | null };
  const exp: ExpRow[] = await db.select({
    id: expenses.id, description: expenses.description, category: expenses.category, subcategory: expenses.subcategory,
    amount: expenses.amount, paymentMethod: expenses.paymentMethod, date: ymd(expenses.date), receipt: expenses.receipt,
  }).from(expenses).where(and(eq(expenses.createdBy, userId), sql`${expenses.date} BETWEEN ${loadFrom} AND ${loadTo}`));
  const expIds = exp.map((e) => Number(e.id));

  // Which expenses a receipt created (as opposed to a photo added later).
  const owned = new Set<number>();
  if (expIds.length) {
    const rs: Array<{ expenseId: number | null; attached: boolean | number }> = await orEmpty(() => db.select({ expenseId: receipts.expenseId, attached: receipts.attached })
      .from(receipts).where(and(eq(receipts.userId, userId), inArray(receipts.expenseId, expIds))), []);
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
    return {
      id: Number(e.id), description: e.description, category: e.category, subcategory: e.subcategory, amount: e.amount,
      paymentMethod: e.paymentMethod, date: e.date, receiptId: e.receipt && /^\d+$/.test(e.receipt) ? Number(e.receipt) : null, fromReceipt: owned.has(Number(e.id)),
      bill: b ? { id: Number(b.id), vendorId: Number(b.vendorId), vendorName: b.vendorName ?? e.subcategory ?? "", concept: b.concept } : null,
    };
  });

  // Business money out of the bank, without movements excluded in Por revisar.
  await ensureReviewTables(db);
  type BankRow = { id: number; description: string; merchantName: string | null; amount: string; date: string; category: string; type: string; isDuplicate: boolean | number | null; isReconciled: boolean | number | null; bankName: string | null; accountNumber: string | null };
  const bankRows: BankRow[] = await db.select({
    id: bankTransactions.id, description: bankTransactions.description, merchantName: bankTransactions.merchantName,
    amount: bankTransactions.amount, date: ymd(bankTransactions.transactionDate), category: bankTransactions.category,
    type: bankTransactions.type, isDuplicate: bankTransactions.isDuplicate, isReconciled: bankTransactions.isReconciled,
    bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber,
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
      businessCents.set(id, (businessCents.get(id) ?? 0) + (Number(p.personal) === 1 ? 0 : spendCents(p.amount)));
    }
  }
  const logoRows = opts.logos
    ? await withMerchantLogos(db, spending.map((r) => ({ ...r, logoUrl: null as string | null })))
    : spending.map((r) => ({ ...r, logoUrl: null as string | null }));
  const banksIn: BankIn[] = logoRows.map((r) => {
    const full = Math.abs(spendCents(r.amount));
    return {
      id: Number(r.id), name: displayNameOf(r.description, r.merchantName), text: `${r.description} ${r.merchantName ?? ""}`,
      amountCents: businessCents.get(Number(r.id)) ?? full, fullCents: full,
      date: r.date, category: r.category, reviewed: Number(r.isReconciled) === 1,
      account: accountLabel(r.bankName, r.accountNumber), logoUrl: r.logoUrl,
    };
  });

  // Links: Por revisar's "Vincular" on a bill, and the owner's own links / "No es el mismo cargo".
  const reviewLinks: Array<{ tx: number; billId: number }> = await db.select({ tx: bankReviewMatches.bankTransactionId, billId: bankReviewMatches.targetId })
    .from(bankReviewMatches).where(and(eq(bankReviewMatches.userId, userId), eq(bankReviewMatches.targetType, "bill"), eq(bankReviewMatches.status, "linked")));
  let reviewBillLinks: Array<{ expenseId: number; bankTransactionId: number }> = [];
  if (reviewLinks.length) {
    const linked: Array<{ id: number; expenseId: number | null }> = await orEmpty(() => db.select({ id: bills.id, expenseId: bills.expenseId }).from(bills)
      .where(and(eq(bills.userId, userId), inArray(bills.id, reviewLinks.map((l) => Number(l.billId))))), [] as Array<{ id: number; expenseId: number | null }>);
    const expOfBill = new Map(linked.filter((b) => b.expenseId).map((b) => [Number(b.id), Number(b.expenseId)]));
    reviewBillLinks = reviewLinks.flatMap((l) => {
      const e = expOfBill.get(Number(l.billId));
      return e ? [{ expenseId: e, bankTransactionId: Number(l.tx) }] : [];
    });
  }
  const linkRows: PairLink[] = await orEmpty(() => db.select({ expenseId: expenseBankLinks.expenseId, bankTransactionId: expenseBankLinks.bankTransactionId, status: expenseBankLinks.status })
    .from(expenseBankLinks).where(eq(expenseBankLinks.userId, userId)) as Promise<PairLink[]>, [] as PairLink[]);
  const links = linkRows.map((l) => ({ expenseId: Number(l.expenseId), bankTransactionId: Number(l.bankTransactionId), status: l.status }));

  const items = buildSpendItems({ expenses: expensesIn, banks: banksIn, links, reviewBillLinks, today, reviewWindowDays: REVIEW_WINDOW_DAYS });
  if (opts.logos) {
    const missing = items.filter((i) => !i.logoUrl);
    if (missing.length) {
      const found = await withMerchantLogos(db, missing.map((i) => ({ description: i.who, merchantName: null, logoUrl: null as string | null })));
      missing.forEach((i, k) => { i.logoUrl = found[k].logoUrl; });
    }
  }
  return inRange(items, range.startDate, range.endDate);
}

/** Spending grouped by Gastos' category, as mergeCategories wants it. */
function spendByCategory(items: readonly SpendItem[]): CategoryRow[] {
  const by = new Map<string, { cents: number; count: number }>();
  for (const i of items) {
    const a = by.get(i.category) ?? { cents: 0, count: 0 };
    a.cents += i.amountCents;
    a.count++;
    by.set(i.category, a);
  }
  return [...by.entries()].map(([category, a]) => ({ category, total: fromCents(a.cents), count: a.count }));
}
const spendSum = (items: readonly SpendItem[]) => fromCents(items.reduce((s, i) => s + i.amountCents, 0));
/** A business bank charge that no expense records (Gastos counts it; the books don't have it yet). */
const isUnbookedBank = (i: SpendItem) => i.source === "bank";
/** The client's local day from its UTC offset (Gastos' "today": only Por revisar's window uses it). */
const localToday = (tz: number) => new Date(Date.now() + tz * 3_600_000).toISOString().slice(0, 10);

// ── Books (journal) ──
/** Each account's debits and credits up to a day (inclusive), this user's entries and accounts only. */
async function accountTotals(db: Db, userId: number, opts: { upTo?: string; before?: string }): Promise<AccountTotals[]> {
  const conds = [eq(journalEntries.createdBy, userId), eq(accounts.userId, userId)];
  if (opts.upTo) conds.push(lte(journalEntries.date, sql`${opts.upTo}`));
  if (opts.before) conds.push(lt(journalEntries.date, sql`${opts.before}`));
  const rows: Array<{ accountId: number; code: string; name: string; type: string; debit: Numeric; credit: Numeric }> = await db.select({
    accountId: accounts.id,
    code: accounts.code,
    name: accounts.name,
    type: accounts.type,
    debit: sql<Numeric>`COALESCE(SUM(${journalEntryLines.debit}), 0)`,
    credit: sql<Numeric>`COALESCE(SUM(${journalEntryLines.credit}), 0)`,
  })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
    .where(and(...conds))
    .groupBy(accounts.id, accounts.code, accounts.name, accounts.type);
  return rows.map((r) => ({ ...r, accountId: Number(r.accountId) }));
}

async function loadBalanceSheet(db: Db, userId: number, asOf: string | undefined) {
  return { asOf: asOf ?? null, ...buildBalanceSheet(await accountTotals(db, userId, { upTo: asOf })) };
}

async function loadCashFlow(db: Db, userId: number, range: DateRange) {
  const before = await accountTotals(db, userId, { before: range.startDate });
  const opening = fromCents(before.filter((a) => a.type === "asset" && isCashAccount(a.code)).reduce((s, a) => s + toCents(a.debit) - toCents(a.credit), 0));
  const lines: Array<CashEntryLine & { entryId: number }> = await db.select({
    entryId: journalEntryLines.journalEntryId,
    code: accounts.code,
    type: accounts.type,
    debit: journalEntryLines.debit,
    credit: journalEntryLines.credit,
  })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
    .where(and(
      eq(journalEntries.createdBy, userId), eq(accounts.userId, userId),
      gte(journalEntries.date, sql`${range.startDate}`), lte(journalEntries.date, sql`${range.endDate}`),
    ));
  return buildCashFlow(opening, lines.map((l) => ({ ...l, entryId: Number(l.entryId) })));
}

const isDebtType = (t: string | null | undefined) => /credit|loan|mortgage|line of credit/i.test(t ?? "");

async function requireAccountant(db: Db, ctx: { user: Parameters<typeof requireFeature>[1]; lang: Parameters<typeof requireFeature>[3] }) {
  await requireFeature(db, ctx.user, "accountant", ctx.lang);
}

// ── Drill-down: the movements behind a line ──
const DRILL_CAP = 2000;
export type DrillRow = {
  /** Unique in the list ("e12" an expense, "b34" a bank charge, "s56" a sale, "l78" a sale line). */
  key: string;
  id: number;
  date: string;
  title: string;
  sub: string | null;
  method: string | null;
  amount: number;
  /** Plaid's logo for the merchant or vendor, when we have one. */
  logoUrl: string | null;
  /** For a sale: its invoice number. */
  ref: string | null;
};

export const reportsRouter = createRouter({

  // ── Income statement: completed sales and recorded expenses of a period ──
  incomeStatement: authedQuery
    .input(z.object({
      startDate: isoDate.optional(),
      endDate: isoDate.optional(),
      tzOffsetHours: tzOffsetHours.optional(),
      year: z.number().int().min(2000).max(2100).optional(),
      month: z.number().int().min(1).max(12).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const tz = input?.tzOffsetHours ?? 0;
      const now = new Date(Date.now() + tz * 3_600_000);
      const today = now.toISOString().slice(0, 10);
      // A year alone is the whole year (it used to stop at today's month and day).
      const range = statementRange(input, today);
      const [inc, spend] = await Promise.all([salesTotals(db, userId, range, tz), loadSpend(db, userId, range, today)]);
      const salesRevenue = inc.total;
      // Expenses = what Gastos counts: the recorded expenses plus business bank charges no expense records.
      const operExpenses = spendSum(spend.filter((i) => !isUnbookedBank(i)));
      const bankExpenses = spendSum(spend.filter(isUnbookedBank));
      const totalExpenses = spendSum(spend);
      const netIncome = fromCents(toCents(salesRevenue) - toCents(totalExpenses));
      return {
        period: { start: range.startDate, end: range.endDate },
        totalRevenue: salesRevenue,
        totalExpenses,
        businessExpenses: totalExpenses,
        businessNetIncome: netIncome,
        netIncome,
        salesCount: inc.count,
        expensesCount: spend.length,
        breakdown: { salesRevenue, bankRevenue: 0, operExpenses, bankExpenses },
      };
    }),

  // ── Everything the Simple view shows for a period, and the period before ──
  overview: authedQuery
    .input(z.object({
      range: rangeShape,
      prev: rangeShape,
      seriesEnd: z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }),
      tzOffsetHours: tzOffsetHours.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const tz = input.tzOffsetHours ?? 0;
      const { range, prev, seriesEnd } = input;
      const first = { year: seriesEnd.year, month: seriesEnd.month - 11 };
      while (first.month < 1) { first.month += 12; first.year -= 1; }
      const series: DateRange = {
        startDate: `${first.year}-${String(first.month).padStart(2, "0")}-01`,
        endDate: `${seriesEnd.year}-${String(seriesEnd.month).padStart(2, "0")}-${String(new Date(Date.UTC(seriesEnd.year, seriesEnd.month, 0)).getUTCDate()).padStart(2, "0")}`,
      };
      const canClients = contextHas(await getPlanContext(db, ctx.user), "clientReports");
      const ym = sql<string>`DATE_FORMAT(DATE_ADD(${sales.createdAt}, INTERVAL ${tz} HOUR), '%Y-%m')`;

      // Spending (Salió, its categories, the chart) is Gastos' computation; one load covers every range used here.
      const spendRange: DateRange = {
        startDate: [range.startDate, prev.startDate, series.startDate].sort()[0],
        endDate: [range.endDate, prev.endDate, series.endDate].sort().reverse()[0],
      };
      const today = localToday(tz);
      const [cur, before, spendAll, seriesIn, svc, prevSvc, methods, clients] = await Promise.all([
        salesTotals(db, userId, range, tz),
        salesTotals(db, userId, prev, tz),
        loadSpend(db, userId, spendRange, today),
        db.select({ ym, total: sql<Numeric>`COALESCE(SUM(${sales.total}), 0)` }).from(sales)
          .where(completedSalesIn(userId, series, tz)).groupBy(ym) as Promise<Array<{ ym: string; total: Numeric }>>,
        serviceRows(db, userId, completedSalesIn(userId, range, tz)),
        serviceRows(db, userId, completedSalesIn(userId, prev, tz)),
        db.select({ method: sales.paymentMethod, total: sql<Numeric>`COALESCE(SUM(${sales.total}), 0)`, count: sql<Numeric>`COUNT(*)` })
          .from(sales).where(completedSalesIn(userId, range, tz)).groupBy(sales.paymentMethod) as Promise<Array<{ method: string; total: Numeric; count: Numeric }>>,
        canClients ? clientRows(db, userId, completedSalesIn(userId, range, tz)) : Promise.resolve(null),
      ]);
      const spendNow = inRange(spendAll, range.startDate, range.endDate);
      const spendBefore = inRange(spendAll, prev.startDate, prev.endDate);
      const seriesOut = inRange(spendAll, series.startDate, series.endDate).map((i) => ({ ym: i.date.slice(0, 7), total: fromCents(i.amountCents) }));

      const categories = mergeCategories(spendByCategory(spendNow), spendByCategory(spendBefore));
      const bookedNow = spendNow.filter((i) => !isUnbookedBank(i));
      const bookedBefore = spendBefore.filter((i) => !isUnbookedBank(i));
      const bankNow = spendNow.filter(isUnbookedBank);
      const bankBefore = spendBefore.filter(isUnbookedBank);
      const svcReport = buildServiceReport(svc, 0);
      const prevSvcReport = buildServiceReport(prevSvc, 0);
      const clientReport = clients ? buildClientReport(clients) : null;
      return {
        range,
        prev,
        current: { moneyIn: cur.total, salesCount: cur.count, moneyOut: spendSum(spendNow), expensesCount: spendNow.length },
        previous: { moneyIn: before.total, salesCount: before.count, moneyOut: spendSum(spendBefore) },
        series: fillSeries(seriesEnd, seriesIn, seriesOut),
        categories,
        // The income statement: recorded expenses by category, and apart the bank charges no expense records yet.
        statement: {
          booked: mergeCategories(spendByCategory(bookedNow), spendByCategory(bookedBefore)),
          unbookedBank: { total: spendSum(bankNow), prevTotal: spendSum(bankBefore), count: bankNow.length },
        },
        services: svcReport.rows.map((r) => ({ key: r.serviceId === null ? "none" : String(r.serviceId), name: r.name, total: r.revenue, quantity: r.quantity, salesCount: r.salesCount }))
          .sort((a, b) => b.total - a.total),
        prevServices: prevSvcReport.rows.map((r) => ({ name: r.name ?? "", total: r.revenue })),
        methods: methods.map((m) => ({ method: m.method, total: sumMoney([m.total]), count: toNumber(m.count) })).sort((a, b) => b.total - a.total),
        clients: clientReport ? clientReport.rows.map((r) => ({ key: r.customerId === null ? "none" : String(r.customerId), name: r.name, total: r.total, salesCount: r.salesCount })).sort((a, b) => b.total - a.total) : null,
        clientsLocked: !canClients,
      };
    }),

  // ── The movements behind one line (a category, the sales, a service, a client, every expense) ──
  drill: authedQuery
    .input(z.object({
      kind: z.enum(["category", "income", "service", "client", "expenses", "bank", "recorded"]),
      key: z.string().max(255).optional(),
      /** For "category": only what the books record (the income statement's lines), not the bank-only charges. */
      only: z.enum(["booked"]).optional(),
      range: rangeShape,
      tzOffsetHours: tzOffsetHours.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const tz = input.tzOffsetHours ?? 0;
      const { kind, range } = input;
      const key = input.key ?? "";
      const dayStr = sql<string>`DATE_FORMAT(DATE_ADD(${sales.createdAt}, INTERVAL ${tz} HOUR), '%Y-%m-%d')`;

      // Contador's lines: the expenses table's own category, as typed (key "" = no category).
      if (kind === "recorded") {
        const where = and(
          eq(expenses.createdBy, userId), sql`${expenses.date} >= ${range.startDate}`, sql`${expenses.date} <= ${range.endDate}`,
          key === "" ? sql`(${expenses.category} IS NULL OR TRIM(${expenses.category}) = '')` : sql`TRIM(${expenses.category}) = ${key.trim()}`,
        );
        const rows: Array<{ id: number; day: string; description: string; category: string | null; method: string; amount: Numeric; receipt: number }> = await db.select({
          id: expenses.id, day: sql<string>`DATE_FORMAT(${expenses.date}, '%Y-%m-%d')`, description: expenses.description,
          category: expenses.category, method: expenses.paymentMethod, amount: expenses.amount,
          receipt: sql<number>`(${expenses.receipt} REGEXP '^[0-9]+$')`, // a receipt id, as Gastos reads it
        }).from(expenses).where(where).orderBy(desc(expenses.date), desc(expenses.id));
        const kept = rows.slice(0, DRILL_CAP);
        const logos = await withMerchantLogos(db, kept.map((r) => ({ description: r.description, merchantName: null })));
        return {
          kind, total: sumMoney(rows.map((r) => r.amount)), count: rows.length, truncated: rows.length > DRILL_CAP, methods: null,
          rows: kept.map((r, i): DrillRow & { category: string; receipt: boolean; source: string; account: string | null } => ({
            key: `e${r.id}`, id: Number(r.id), date: r.day, title: r.description, sub: null, category: (r.category ?? "").trim(),
            method: r.method, amount: sumMoney([r.amount]), logoUrl: logos[i]?.logoUrl ?? null, ref: null, receipt: Number(r.receipt) === 1, source: "manual", account: null,
          })),
        };
      }

      // Spending: the same items Gastos lists (expenses + business bank charges no expense records).
      if (kind === "category" || kind === "expenses" || kind === "bank") {
        const all = await loadSpend(db, userId, range, localToday(tz), { logos: true });
        const list = all.filter((i) => kind === "expenses" ? true
          : kind === "bank" ? isUnbookedBank(i)
          : i.category === key && (input.only !== "booked" || !isUnbookedBank(i)));
        const kept = list.slice(0, DRILL_CAP);
        return {
          kind, total: spendSum(list), count: list.length, truncated: list.length > DRILL_CAP, methods: null,
          rows: kept.map((i): DrillRow & { category: string; receipt: boolean; source: string; account: string | null } => ({
            key: i.key, id: i.expenseId ?? i.bankTransactionId ?? 0, date: i.date, title: i.who, sub: i.detail, category: i.category,
            method: i.method, amount: fromCents(i.amountCents), logoUrl: i.logoUrl, ref: null, receipt: i.hasReceipt, source: i.source, account: i.account,
          })),
        };
      }

      if (kind === "service") {
        const serviceId = Number(key);
        const where = key === "none" || !Number.isInteger(serviceId)
          ? and(completedSalesIn(userId, range, tz), sql`${saleServices.serviceId} IS NULL`)
          : and(completedSalesIn(userId, range, tz), eq(saleServices.serviceId, serviceId));
        const [agg, rows] = await Promise.all([
          db.select({ total: sql<Numeric>`COALESCE(SUM(${saleServices.total}), 0)`, count: sql<Numeric>`COUNT(*)` })
            .from(saleServices).innerJoin(sales, eq(saleServices.saleId, sales.id)).where(where).then(one),
          db.select({
            id: saleServices.id, day: dayStr, invoice: sales.invoiceNumber, name: saleServices.serviceName,
            client: sql<string | null>`COALESCE(NULLIF(TRIM(CONCAT(${customers.name}, ' ', COALESCE(${customers.lastName}, ''))), ''), ${sales.customerName})`,
            quantity: saleServices.quantity, unitPrice: saleServices.unitPrice, amount: saleServices.total, method: sales.paymentMethod,
          })
            .from(saleServices).innerJoin(sales, eq(saleServices.saleId, sales.id))
            .leftJoin(customers, and(eq(sales.customerId, customers.id), eq(customers.userId, userId)))
            .where(where).orderBy(desc(sales.createdAt), desc(saleServices.id)).limit(DRILL_CAP + 1) as Promise<Array<{ id: number; day: string; invoice: string; name: string; client: string | null; quantity: number; unitPrice: Numeric; amount: Numeric; method: string }>>,
        ]);
        return {
          kind, total: agg.total, count: agg.count, truncated: rows.length > DRILL_CAP, methods: null,
          rows: rows.slice(0, DRILL_CAP).map((r): DrillRow & { quantity: number; unitPrice: number } => ({
            key: `l${r.id}`, id: Number(r.id), date: r.day, title: r.client?.trim() || r.invoice, sub: r.name, method: r.method,
            amount: sumMoney([r.amount]), logoUrl: null, ref: r.invoice, quantity: toNumber(r.quantity), unitPrice: sumMoney([r.unitPrice]),
          })),
        };
      }

      // Sales: all of the period's, or one client's (by client is Negocio).
      if (kind === "client") await requireFeature(db, ctx.user, "clientReports", ctx.lang);
      const customerId = Number(key);
      const where = kind === "client"
        ? key === "none" || !Number.isInteger(customerId)
          ? and(completedSalesIn(userId, range, tz), sql`${sales.customerId} IS NULL`)
          : and(completedSalesIn(userId, range, tz), eq(sales.customerId, customerId))
        : completedSalesIn(userId, range, tz);
      const [agg, rows, methods] = await Promise.all([
        db.select({ total: sql<Numeric>`COALESCE(SUM(${sales.total}), 0)`, count: sql<Numeric>`COUNT(*)` }).from(sales).where(where).then(one),
        db.select({
          id: sales.id, day: dayStr, invoice: sales.invoiceNumber,
          client: sql<string | null>`COALESCE(NULLIF(TRIM(CONCAT(${customers.name}, ' ', COALESCE(${customers.lastName}, ''))), ''), ${sales.customerName})`,
          items: sql<string | null>`(SELECT GROUP_CONCAT(${saleServices.serviceName} ORDER BY ${saleServices.id} SEPARATOR ', ') FROM ${saleServices} WHERE ${saleServices.saleId} = ${sales.id})`,
          method: sales.paymentMethod, amount: sales.total,
        })
          .from(sales).leftJoin(customers, and(eq(sales.customerId, customers.id), eq(customers.userId, userId)))
          .where(where).orderBy(desc(sales.createdAt), desc(sales.id)).limit(DRILL_CAP + 1) as Promise<Array<{ id: number; day: string; invoice: string; client: string | null; items: string | null; method: string; amount: Numeric }>>,
        db.select({ method: sales.paymentMethod, total: sql<Numeric>`COALESCE(SUM(${sales.total}), 0)`, count: sql<Numeric>`COUNT(*)` })
          .from(sales).where(where).groupBy(sales.paymentMethod) as Promise<Array<{ method: string; total: Numeric; count: Numeric }>>,
      ]);
      return {
        kind, total: agg.total, count: agg.count, truncated: rows.length > DRILL_CAP,
        methods: methods.map((m) => ({ method: m.method, total: sumMoney([m.total]), count: toNumber(m.count) })).sort((a, b) => b.total - a.total),
        rows: rows.slice(0, DRILL_CAP).map((r): DrillRow => ({
          key: `s${r.id}`, id: Number(r.id), date: r.day, title: r.client?.trim() || r.invoice, sub: r.items, method: r.method,
          amount: sumMoney([r.amount]), logoUrl: null, ref: r.invoice,
        })),
      };
    }),

  // ── "Para contador": balance sheet, cash flow and contractors for a period (Pro and Negocio) ──
  pro: authedQuery
    .input(z.object({ range: rangeShape, asOf: isoDate }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await requireAccountant(db, ctx);
      const userId = ctx.user.id;
      const year = Number(input.range.endDate.slice(0, 4));
      const contractors = async () => {
        try {
          const rows: Array<{ vendorId: number; name: string; total: Numeric; count: Numeric }> = await db.select({
            vendorId: bills.vendorId,
            name: sql<string>`MAX(${vendors.name})`,
            total: sql<Numeric>`COALESCE(SUM(${bills.amount}), 0)`,
            count: sql<Numeric>`COUNT(*)`,
          })
            .from(bills).innerJoin(vendors, and(eq(vendors.id, bills.vendorId), eq(vendors.userId, userId)))
            .where(and(eq(bills.userId, userId), eq(bills.status, "paid"), sql`${bills.paidAt} >= ${`${year}-01-01`}`, sql`${bills.paidAt} <= ${`${year}-12-31`}`))
            .groupBy(bills.vendorId);
          const list = rows.map((r) => ({ vendorId: Number(r.vendorId), name: r.name, total: sumMoney([r.total]), count: toNumber(r.count) }))
            .sort((a, b) => b.total - a.total);
          const logos = await withMerchantLogos(db, list.map((v) => ({ merchantName: v.name, description: v.name })));
          return list.map((v, i) => ({ ...v, logoUrl: logos[i]?.logoUrl ?? null }));
        } catch (e) {
          if (isMissingTable(e)) return [];
          throw e;
        }
      };
      const [balance, cashFlow, paid, banks] = await Promise.all([
        loadBalanceSheet(db, userId, input.asOf),
        loadCashFlow(db, userId, input.range),
        contractors(),
        db.select({ id: bankAccounts.id, name: bankAccounts.bankName, mask: bankAccounts.accountNumber, type: bankAccounts.accountType, balance: bankAccounts.currentBalance })
          .from(bankAccounts).where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, true))) as Promise<Array<{ id: number; name: string; mask: string | null; type: string | null; balance: Numeric }>>,
      ]);
      const cash = banks.filter((b) => !isDebtType(b.type));
      return {
        range: input.range,
        balance,
        cashFlow,
        contractors: { year, threshold: 600, vendors: paid },
        // What the banks say today, next to the books (not added to them: the books already count the cash).
        banks: { total: sumMoney(cash.map((b) => b.balance)), count: cash.length },
      };
    }),

  // ── Balance sheet: every account from the journal, up to a day (default: everything) ──
  balanceSheet: authedQuery
    .input(z.object({ asOf: isoDate.optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await requireAccountant(db, ctx);
      return loadBalanceSheet(db, ctx.user.id, input?.asOf);
    }),

  // ── Journal: entries with their lines; the limit counts entries (it used to count lines) ──
  journalEntries: authedQuery
    .input(z.object({
      limit: z.number().int().min(1).max(500).default(50),
      offset: z.number().int().min(0).default(0),
      startDate: isoDate.optional(),
      endDate: isoDate.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await requireAccountant(db, ctx);
      const userId = ctx.user.id;
      const conds = [eq(journalEntries.createdBy, userId)];
      if (input.startDate) conds.push(gte(journalEntries.date, sql`${input.startDate}`));
      if (input.endDate) conds.push(lte(journalEntries.date, sql`${input.endDate}`));
      const page: Array<typeof journalEntries.$inferSelect> = await db.select().from(journalEntries)
        .where(and(...conds))
        .orderBy(desc(journalEntries.date), desc(journalEntries.id))
        .limit(input.limit)
        .offset(input.offset);
      if (page.length === 0) return [];
      const lines: Array<{ id: number; entryId: number; accountId: number; accountCode: string | null; accountName: string | null; debit: string | null; credit: string | null; description: string | null }> = await db.select({
        id: journalEntryLines.id,
        entryId: journalEntryLines.journalEntryId,
        accountId: journalEntryLines.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
        description: journalEntryLines.description,
      })
        .from(journalEntryLines)
        .leftJoin(accounts, and(eq(journalEntryLines.accountId, accounts.id), eq(accounts.userId, userId)))
        .where(inArray(journalEntryLines.journalEntryId, page.map((e) => e.id)))
        .orderBy(journalEntryLines.id);
      return page.map((e) => ({
        ...e,
        lines: lines.filter((l) => Number(l.entryId) === Number(e.id)).map((l) => ({ id: l.id, accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName, debit: l.debit, credit: l.credit, description: l.description })),
      }));
    }),

  // ── Month close: up to which day each bank account is reconciled and closed (Bancos → Cuadrar) ──
  closeStatus: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const allowed = reconcileAllowed(await getPlanContext(db, ctx.user));
    const accts: Array<{ id: number; name: string; mask: string | null }> = await db.select({ id: bankAccounts.id, name: bankAccounts.bankName, mask: bankAccounts.accountNumber })
      .from(bankAccounts).where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, true)));
    let closed: Array<{ accountId: number; end: string }> = [];
    if (accts.length > 0) {
      try {
        closed = await db.select({
          accountId: bankReconciliations.bankAccountId,
          end: sql<string>`DATE_FORMAT(MAX(${bankReconciliations.periodEnd}), '%Y-%m-%d')`,
        }).from(bankReconciliations)
          .where(and(eq(bankReconciliations.userId, userId), eq(bankReconciliations.status, "closed")))
          .groupBy(bankReconciliations.bankAccountId);
      } catch (e) {
        if (!isMissingTable(e)) throw e;
      }
    }
    return {
      allowed,
      accounts: accts.map((a) => ({
        id: Number(a.id), name: a.name, mask: a.mask ? a.mask.slice(-4) : null,
        closedThrough: closed.find((c) => Number(c.accountId) === Number(a.id))?.end ?? null,
      })),
    };
  }),

  // ── Sales by client: count, total, average ticket, last sale and share of the period ──
  // Sales with no customer come back as one row with customerId null ("sin cliente").
  byClient: authedQuery
    .input(salesRangeInput)
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "clientReports", ctx.lang);
      const rows = await clientRows(db, ctx.user.id, completedSalesInRange(ctx.user.id, input));
      return { period: { start: input.startDate, end: input.endDate }, ...buildClientReport(rows) };
    }),

  // ── Sales by service: quantity, revenue, number of sales, share and average price ──
  // Line amounts are before the sale's discount; `discounts` and `salesTotal` let the page say so.
  byService: authedQuery
    .input(salesRangeInput)
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "clientReports", ctx.lang);
      const userId = ctx.user.id;
      const inRange = completedSalesInRange(userId, input);
      const rows = await serviceRows(db, userId, inRange);

      // Per sale (no join, so nothing is counted twice): what was charged and the discounts given.
      const hasItems = sql`EXISTS(SELECT 1 FROM ${saleServices} WHERE ${saleServices.saleId} = ${sales.id})`;
      const summary: Array<{ salesWithItems: Numeric; salesTotal: Numeric; discounts: Numeric }> = await db.select({
        salesWithItems: sql<Numeric>`COALESCE(SUM(${hasItems}), 0)`,
        salesTotal: sql<Numeric>`COALESCE(SUM(${sales.total}), 0)`,
        discounts: sql<Numeric>`COALESCE(SUM(${sales.discount}), 0)`,
      })
        .from(sales)
        .where(inRange);
      const s = summary[0];

      return {
        period: { start: input.startDate, end: input.endDate },
        ...buildServiceReport(rows, s?.salesWithItems),
        salesTotal: toNumber(s?.salesTotal),
        discounts: toNumber(s?.discounts),
      };
    }),
});
