// ── Inicio (business home): the numbers the home screen shows that no other procedure gives ──
// One read for the whole screen (src/pages/Dashboard.tsx). Everything comes from the user's own records
// with plain, written-down rules; nothing is guessed by a model.
//
// Definitions, the same as the rest of the app:
// - "Ganancia" (what's left) = completed sales − recorded expenses (the expenses table), like Reportes
//   (api/reports-router.ts incomeStatement). Bank movements aren't counted there, so not here either.
// - Sales carry a timestamp and are read on the user's local day (tzOffsetHours); expenses and bills
//   carry a calendar day.
// - Month over month compares this month so far with the same days of last month (Nov 1–21 against
//   Oct 1–21), so the 21st isn't measured against a whole month.
// - "Te deben" comes from Facturas (invoices.list, api/invoices-router.ts) so both screens agree: what's
//   still owed on open and late invoices, with their due dates and partial payments.
// - "En 30 días" lists dated money: open invoices due in the next 30 days (what's left on them), the
//   recurring invoices that will be issued and fall due by then (due DEFAULT_TERMS days after their
//   period, as Facturas does), unpaid bills due by then (overdue ones included), and a "gastos
//   habituales" line equal to the expenses of the last 30 days that weren't bill payments. Late invoices
//   stay out of "Entra" (nobody knows when they'll pay) and feed the tip instead ("Si X paga…").
// Plan rules: invoices need a business plan (Facturas), recurring invoices "quotes", bills "vendors"; the
// 30-day card is for plans with bills or recurring invoices (Pro and Negocio), as before.
// Team: the accountant may read this (api/lib/team.ts lets them run any query); staff never reach the home.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import type { TrpcContext } from "./context";
import { getDb } from "./queries/connection";
import { bankAccounts, companySettings, customers, expenses, sales } from "@db/schema";
import { accountKind } from "./lib/banks";
import { bills, vendors } from "@db/vendorsSchema";
import { recurringInvoices } from "@db/quotesSchema";
import { invoicesRouter } from "./invoices-router";
import { contextHas, getPlanContext } from "./lib/planAccess";
import { isMissingTable } from "./lib/dbErrors";
import { isoDate, tzOffsetHours } from "./lib/security";
import { addDays, anchorDayOf, daysInMonth, nextPeriodDate, type Frequency } from "./lib/quotes";
import { DEFAULT_TERMS, dueDateFor } from "./lib/invoices";
import { daysBetween, effectiveToday, summarizeBills, toCents, utcToday } from "./lib/vendors";
import { withMerchantLogos } from "./lib/merchantLogos";

type Db = ReturnType<typeof getDb>;
type InvoiceList = Awaited<ReturnType<ReturnType<typeof invoicesRouter.createCaller>["list"]>>;

/** How far ahead "En 30 días tendrás" looks. */
export const FORECAST_DAYS = 30;
/** Category of the expense a paid bill records (api/lib/vendors.ts VENDOR_EXPENSE_CATEGORY). */
const BILL_EXPENSE_CATEGORY = "vendors";
/** Default company name the settings table starts with: not a real business name. */
const PLACEHOLDER_COMPANY = "Tu Placa";
/** A category counts as "grew" when it rose at least this much, in percent and in dollars. */
export const INSIGHT_MIN_PCT = 10;
export const INSIGHT_MIN_CENTS = 25_00;

// ── Pure rules (exported for the tests) ──

export type Range = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** This month so far, and the same days of last month (clamped to its length). */
export function monthWindows(today: string): { current: Range; previous: Range; month: number; previousMonth: number } {
  const [y, m, d] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const pd = Math.min(d, daysInMonth(py, pm));
  return {
    current: { from: `${y}-${pad(m)}-01`, to: today },
    previous: { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(pd)}` },
    month: m,
    previousMonth: pm,
  };
}

/** Change in percent with one decimal, or null when there's nothing positive to compare with. */
export function pctChange(currentCents: number, previousCents: number): number | null {
  if (previousCents <= 0) return null;
  return Math.round(((currentCents - previousCents) / previousCents) * 1000) / 10;
}

/** The dates a recurring invoice will bill between `from` and `to` (both included), at most `max`. */
export function recurringDatesBetween(
  s: { startDate: string; nextDate: string; endDate: string | null; frequency: Frequency },
  from: string, to: string, max = 10,
): string[] {
  const anchor = anchorDayOf(s.startDate);
  const out: string[] = [];
  let d = s.nextDate;
  for (let i = 0; i < 500 && out.length < max && d <= to; i++) {
    if (s.endDate !== null && d > s.endDate) break;
    if (d >= from) out.push(d);
    d = nextPeriodDate(d, s.frequency, anchor);
  }
  return out;
}

export type CategoryTotals = { category: string; currentCents: number; previousCents: number; currentCount: number };

/**
 * The category that grew the most in dollars against the same days of last month, when it grew at
 * least INSIGHT_MIN_PCT percent and INSIGHT_MIN_CENTS. Categories with nothing last month can't "grow".
 */
export function biggestIncrease(rows: readonly CategoryTotals[]): (CategoryTotals & { pct: number }) | null {
  let best: (CategoryTotals & { pct: number }) | null = null;
  for (const r of rows) {
    if (r.previousCents <= 0) continue;
    const diff = r.currentCents - r.previousCents;
    const pct = pctChange(r.currentCents, r.previousCents);
    if (pct === null || pct < INSIGHT_MIN_PCT || diff < INSIGHT_MIN_CENTS) continue;
    if (!best || diff > best.currentCents - best.previousCents) best = { ...r, pct: Math.round(pct) };
  }
  return best;
}

export type FlowItem = {
  /** YYYY-MM-DD (the due date), or null for an invoice without one. */
  date: string | null;
  kind: "invoice" | "recurring" | "bill";
  dir: "in" | "out";
  /** Customer or vendor name. */
  name: string | null;
  /** The invoice's number. */
  ref: string | null;
  amount: number;
};

/** Undated invoices first (they're due any day), then by date; out before in on the same day. */
export function sortFlow(items: FlowItem[]): FlowItem[] {
  return [...items].sort((a, b) => {
    if (a.date === null || b.date === null) return a.date === b.date ? 0 : a.date === null ? -1 : 1;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.dir === b.dir ? 0 : a.dir === "out" ? -1 : 1;
  });
}

// ── Reads ──

const num =(v: unknown): number => Number(v ?? 0) || 0;
const cents = (v: unknown): number => toCents(typeof v === "number" || typeof v === "string" ? v : 0);
const ymd = (col: unknown) => sql<string>`DATE_FORMAT(${col}, '%Y-%m-%d')`;

/** The user's invoices as Facturas lists them; null when the plan doesn't include Facturas. */
async function invoicesOf(ctx: TrpcContext): Promise<InvoiceList | null> {
  try {
    return await invoicesRouter.createCaller(ctx).list();
  } catch (e: unknown) {
    if (e instanceof TRPCError && e.code === "FORBIDDEN") return null;
    throw e;
  }
}

/** Empty when a feature's table hasn't been created yet (they're made on first use). */
async function orEmpty<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch (e: unknown) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

type SalesRow = { cur: string; prev: string; curCount: number | string };
type DayRow = { day: string; total: string; n: number | string };
type ClientRow = { name: string; total: string; n: number | string };
type CatRow = { category: string; cur: string; prev: string; curCount: number | string };
type MerchantRow = { merchant: string | null; total: string };
type CustomerRow = { name: string | null; lastName: string | null; email: string | null; phone: string | null };
type BillRow = { id: number; vendorName: string | null; amount: string; dueDate: string };
type RecurringRow = { id: number; customerName: string | null; total: string; frequency: Frequency; startDate: string; nextDate: string; endDate: string | null };

export type Insight =
  | { kind: "categoryUp"; category: string; pct: number; current: number; previous: number; merchant: string | null; merchantTotal: number; logoUrl: string | null }
  | { kind: "topCategory"; category: string; current: number; merchant: string | null; merchantTotal: number; logoUrl: string | null }
  | { kind: "topClient"; customer: string; total: number; count: number };

async function topMerchant(db: Db, userId: number, category: string, range: Range): Promise<{ merchant: string | null; merchantTotal: number; logoUrl: string | null }> {
  // A bill payment's expense keeps the vendor in `subcategory`; everything else names the merchant in `description`.
  const who = sql<string | null>`CASE WHEN ${expenses.category} = ${BILL_EXPENSE_CATEGORY} AND COALESCE(${expenses.subcategory}, '') <> '' THEN ${expenses.subcategory} ELSE ${expenses.description} END`;
  const rows: MerchantRow[] = await db.select({ merchant: who, total: sql<string>`SUM(${expenses.amount})` }).from(expenses)
    .where(and(eq(expenses.createdBy, userId), eq(expenses.category, category), sql`${expenses.date} BETWEEN ${range.from} AND ${range.to}`))
    .groupBy(who).orderBy(sql`SUM(${expenses.amount}) DESC`).limit(1);
  const top = rows[0];
  const merchant = top?.merchant?.trim() || null;
  if (!merchant) return { merchant: null, merchantTotal: 0, logoUrl: null };
  const [withLogo] = await withMerchantLogos(db, [{ merchantName: merchant, description: merchant }]);
  return { merchant, merchantTotal: cents(top.total) / 100, logoUrl: withLogo?.logoUrl ?? null };
}

export const homeRouter = createRouter({
  /** Everything the business home shows, for the user's local day. */
  overview: authedQuery
    .input(z.object({ today: isoDate.optional(), tzOffsetHours: tzOffsetHours.optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const today = effectiveToday(input?.today, utcToday());
      const tz = input?.tzOffsetHours ?? 0;
      const plan = await getPlanContext(db, ctx.user);
      const hasQuotes = contextHas(plan, "quotes");
      const hasVendors = contextHas(plan, "vendors");
      const { current, previous, month, previousMonth } = monthWindows(today);
      const localDay = sql`DATE(DATE_ADD(${sales.createdAt}, INTERVAL ${tz} HOUR))`;
      const completed = and(eq(sales.createdBy, userId), eq(sales.status, "completed"));
      // Sales rows read on a local day: a margin of a day either side, then the exact local-day filter.
      const near = (from: string, to: string) => sql`${sales.createdAt} >= ${addDays(from, -1)} AND ${sales.createdAt} < ${addDays(to, 2)}`;

      // ── Profit: this month so far against the same days of last month ──
      const salesAgg = (await db.select({
        cur: sql<string>`COALESCE(SUM(CASE WHEN ${localDay} BETWEEN ${current.from} AND ${current.to} THEN ${sales.total} END), 0)`,
        prev: sql<string>`COALESCE(SUM(CASE WHEN ${localDay} BETWEEN ${previous.from} AND ${previous.to} THEN ${sales.total} END), 0)`,
        curCount: sql<string>`COALESCE(SUM(CASE WHEN ${localDay} BETWEEN ${current.from} AND ${current.to} THEN 1 END), 0)`,
      }).from(sales).where(and(completed, near(previous.from, current.to))) as SalesRow[])[0];
      const catRows: CatRow[] = await db.select({
        category: expenses.category,
        cur: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.date} BETWEEN ${current.from} AND ${current.to} THEN ${expenses.amount} END), 0)`,
        prev: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.date} BETWEEN ${previous.from} AND ${previous.to} THEN ${expenses.amount} END), 0)`,
        curCount: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.date} BETWEEN ${current.from} AND ${current.to} THEN 1 END), 0)`,
      }).from(expenses).where(and(eq(expenses.createdBy, userId), sql`${expenses.date} BETWEEN ${previous.from} AND ${current.to}`))
        .groupBy(expenses.category);
      const cats: CategoryTotals[] = catRows.map((r) => ({
        category: r.category, currentCents: cents(r.cur), previousCents: cents(r.prev), currentCount: num(r.curCount),
      }));
      const salesCur = cents(salesAgg?.cur);
      const salesPrev = cents(salesAgg?.prev);
      const expCur = cats.reduce((a, c) => a + c.currentCents, 0);
      const expPrev = cats.reduce((a, c) => a + c.previousCents, 0);
      const profitCur = salesCur - expCur;
      const profitPrev = salesPrev - expPrev;

      // ── Week: the last 7 local days against the 7 before ──
      const weekFrom = addDays(today, -13);
      const dayRows: DayRow[] = await db.select({
        day: sql<string>`DATE_FORMAT(${localDay}, '%Y-%m-%d')`, total: sql<string>`SUM(${sales.total})`, n: sql<string>`COUNT(*)`,
      }).from(sales).where(and(completed, near(weekFrom, today), sql`${localDay} BETWEEN ${weekFrom} AND ${today}`))
        .groupBy(sql`DATE_FORMAT(${localDay}, '%Y-%m-%d')`);
      const byDay = new Map(dayRows.map((r) => [r.day, { cents: cents(r.total), n: num(r.n) }]));
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i - 6);
        const d = byDay.get(date);
        return { date, total: (d?.cents ?? 0) / 100, count: d?.n ?? 0 };
      });
      let weekCents = 0, prevWeekCents = 0;
      for (const [day, d] of byDay) {
        if (day > addDays(today, -7)) weekCents += d.cents;
        else prevWeekCents += d.cents;
      }

      // ── Bank: money in the connected accounts, as Bancos' "Tienes en N cuentas" (banks.overview) ──
      // A credit card or a loan is money owed, not money in the bank, so it's left out of the total.
      const bankRows = await db.select({ type: bankAccounts.accountType, balance: bankAccounts.currentBalance })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.userId, userId), sql`${bankAccounts.plaidAccessToken} IS NOT NULL`, eq(bankAccounts.isActive, true))) as Array<{ type: string | null; balance: string | null }>;
      const cashRows = bankRows.filter((r) => accountKind(r.type) === "cash");
      const bank = { accounts: cashRows.length, balance: cashRows.reduce((s, r) => s + cents(r.balance), 0) / 100 };

      // ── Te deben: open and late invoices, as Facturas shows them ──
      const inv = await invoicesOf(ctx);
      const owedInvoices = (inv?.items ?? []).filter((i) => (i.state === "open" || i.state === "late") && i.saleId !== null && i.balanceCents > 0);
      const lateInvoices = owedInvoices.filter((i) => i.state === "late")
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || b.balanceCents - a.balanceCents);
      // The one to collect first: the longest overdue. Its contact, for "Recordar".
      const lateOne = lateInvoices[0];
      const contact: CustomerRow | undefined = lateOne?.customerId ? (await db.select({
        name: customers.name, lastName: customers.lastName, email: customers.email, phone: customers.phone,
      }).from(customers).where(and(eq(customers.id, lateOne.customerId), eq(customers.userId, userId))).limit(1) as CustomerRow[])[0] : undefined;
      const nameOf = (i: { customerName: string | null }) => i.customerName?.trim() || null;

      // ── Debes: unpaid bills ──
      const billRows: BillRow[] = hasVendors ? await orEmpty(() => db.select({
        id: bills.id, vendorName: vendors.name, amount: bills.amount, dueDate: ymd(bills.dueDate),
      }).from(bills).leftJoin(vendors, eq(vendors.id, bills.vendorId))
        .where(and(eq(bills.userId, userId), eq(bills.status, "unpaid")))
        .orderBy(asc(bills.dueDate), asc(bills.id))) : [];
      const billSummary = summarizeBills(billRows.map((b) => ({ status: "unpaid" as const, dueDate: b.dueDate, amount: b.amount })), today);

      // ── En 30 días ──
      let next30: null | {
        items: FlowItem[]; inTotal: number; outTotal: number; habitual: number; balance: number | null;
        tip: { customerName: string | null; number: string | null; amount: number } | null;
      } = null;
      if (hasQuotes || hasVendors) {
        const until = addDays(today, FORECAST_DAYS);
        const items: FlowItem[] = [];
        for (const i of owedInvoices) {
          if (i.state === "open" && (i.dueDate === null || i.dueDate <= until)) {
            items.push({ date: i.dueDate, kind: "invoice", dir: "in", name: nameOf(i), ref: i.number, amount: i.balanceCents / 100 });
          }
        }
        if (hasQuotes) {
          const recurring: RecurringRow[] = await orEmpty(() => db.select({
            id: recurringInvoices.id, customerName: recurringInvoices.customerName, total: recurringInvoices.total,
            frequency: recurringInvoices.frequency, startDate: ymd(recurringInvoices.startDate), nextDate: ymd(recurringInvoices.nextDate),
            endDate: ymd(recurringInvoices.endDate),
          }).from(recurringInvoices).where(and(eq(recurringInvoices.userId, userId), eq(recurringInvoices.active, true))).limit(500));
          // Each period becomes an invoice due DEFAULT_TERMS days later (api/quotes-router.ts): that's when the money is expected.
          for (const r of recurring) {
            for (const period of recurringDatesBetween(r, today, until)) {
              const due = dueDateFor(period, DEFAULT_TERMS);
              if (due <= until) items.push({ date: due, kind: "recurring", dir: "in", name: r.customerName?.trim() || null, ref: null, amount: cents(r.total) / 100 });
            }
          }
        }
        for (const b of billRows) {
          if (b.dueDate <= until) items.push({ date: b.dueDate, kind: "bill", dir: "out", name: b.vendorName, ref: null, amount: cents(b.amount) / 100 });
        }
        // What went out in the last 30 days, other than bill payments (those are listed one by one above).
        const habitualRow = (await db.select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` }).from(expenses)
          .where(and(
            eq(expenses.createdBy, userId), ne(expenses.category, BILL_EXPENSE_CATEGORY),
            sql`${expenses.date} BETWEEN ${addDays(today, -FORECAST_DAYS)} AND ${addDays(today, -1)}`,
          )))[0] as { total: string } | undefined;
        const habitualCents = cents(habitualRow?.total);
        const inCents = items.filter((i) => i.dir === "in").reduce((a, i) => a + toCents(i.amount), 0);
        const outCents = items.filter((i) => i.dir === "out").reduce((a, i) => a + toCents(i.amount), 0) + habitualCents;
        // The tip: the biggest late invoice, which isn't counted in "Entra".
        const tipFrom = [...lateInvoices].sort((a, b) => b.balanceCents - a.balanceCents)[0];
        next30 = {
          items: sortFlow(items),
          inTotal: inCents / 100,
          outTotal: outCents / 100,
          habitual: habitualCents / 100,
          balance: bank.accounts > 0 ? (toCents(bank.balance) + inCents - outCents) / 100 : null,
          tip: tipFrom ? { customerName: nameOf(tipFrom), number: tipFrom.number, amount: tipFrom.balanceCents / 100 } : null,
        };
      }

      // ── Esto notamos: the first rule that applies ──
      let insight: Insight | null = null;
      const up = biggestIncrease(cats);
      if (up) {
        insight = {
          kind: "categoryUp", category: up.category, pct: up.pct, current: up.currentCents / 100, previous: up.previousCents / 100,
          ...(await topMerchant(db, userId, up.category, current)),
        };
      } else {
        const top = [...cats].filter((c) => c.currentCents > 0).sort((a, b) => b.currentCents - a.currentCents)[0];
        if (top) {
          insight = { kind: "topCategory", category: top.category, current: top.currentCents / 100, ...(await topMerchant(db, userId, top.category, current)) };
        } else {
          const name = sql<string>`TRIM(${sales.customerName})`;
          const client = (await db.select({ name, total: sql<string>`SUM(${sales.total})`, n: sql<string>`COUNT(*)` }).from(sales)
            .where(and(completed, near(current.from, current.to), sql`${localDay} BETWEEN ${current.from} AND ${current.to}`, sql`COALESCE(TRIM(${sales.customerName}), '') <> ''`))
            .groupBy(name).orderBy(sql`SUM(${sales.total}) DESC`).limit(1) as ClientRow[])[0];
          if (client && num(client.n) >= 2) insight = { kind: "topClient", customer: client.name, total: cents(client.total) / 100, count: num(client.n) };
        }
      }

      const company = (await db.select({ name: companySettings.companyName }).from(companySettings)
        .where(eq(companySettings.userId, userId)).limit(1) as Array<{ name: string | null }>)[0]?.name?.trim();

      return {
        today,
        month,
        previousMonth,
        businessName: company && company !== PLACEHOLDER_COMPANY ? company : null,
        profit: {
          sales: salesCur / 100, expenses: expCur / 100, profit: profitCur / 100, salesCount: num(salesAgg?.curCount),
          previousSales: salesPrev / 100, previousExpenses: expPrev / 100, previousProfit: profitPrev / 100,
          changePct: pctChange(profitCur, profitPrev),
        },
        bank,
        receivables: inv ? {
          total: owedInvoices.reduce((a, i) => a + i.balanceCents, 0) / 100,
          count: owedInvoices.length,
          lateCount: lateInvoices.length,
          /** The longest-overdue invoice: the "Cobra a …" task. */
          late: lateOne && lateOne.dueDate ? {
            ref: lateOne.ref,
            number: lateOne.number,
            customerName: nameOf(lateOne) || [contact?.name, contact?.lastName].filter((x) => x?.trim()).join(" ").trim() || null,
            balance: lateOne.balanceCents / 100,
            dueDate: lateOne.dueDate,
            daysLate: Math.max(1, daysBetween(lateOne.dueDate, inv.today)),
            email: contact?.email?.trim() || null,
            phone: contact?.phone?.trim() || null,
            remindedToday: lateOne.lastReminderOn === inv.today,
          } : null,
        } : null,
        bills: hasVendors ? billSummary : null,
        next30,
        week: { days, total: weekCents / 100, previousTotal: prevWeekCents / 100, changePct: pctChange(weekCents, prevWeekCents) },
        expenses: {
          monthTotal: expCur / 100,
          monthCount: cats.reduce((a, c) => a + c.currentCount, 0),
          byCategory: cats.filter((c) => c.currentCents > 0).sort((a, b) => b.currentCents - a.currentCents).slice(0, 5)
            .map((c) => ({ category: c.category, total: c.currentCents / 100 })),
        },
        insight,
      };
    }),
});
