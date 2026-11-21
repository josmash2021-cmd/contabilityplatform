// The top-bar search, like the 2.0 prototype: clients (and what they owe), invoices, products and
// services, movements waiting for review and vendors — or, in personal mode, movements and goals.
// Everything is the caller's own data; an employee on a team only finds clients, sales and services.
import { z } from "zod";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bankTransactions, customers, personalGoals, sales, services } from "@db/schema";
import { bills, vendors } from "@db/vendorsSchema";
import { accountMode } from "./lib/plans";
import { isMissingTable } from "./lib/dbErrors";
import { REVIEW_WINDOW_DAYS } from "./lib/bankReview";

export type SearchHit = {
  kind: "customer" | "invoice" | "service" | "review" | "vendor" | "movement" | "goal";
  id: number;
  title: string;
  /** A number to show on the right (owed, total, price…); null when there's nothing to show. */
  amount: number | null;
  /** Extra facts the client turns into words: e.g. { owes: 1 } or { status: "pending" }. */
  meta: Record<string, string | number | null>;
  path: string;
};

const PER_KIND = 5;
/** LIKE pattern for a user's text, with % and _ taken literally. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const lower = (col: unknown) => sql`LOWER(${col})`;

/** A missing optional table (nobody used that feature yet) just means no results there. */
async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try { return await p; } catch (e) { if (isMissingTable(e)) return []; throw e; }
}

export const searchRouter = createRouter({
  global: authedQuery
    .input(z.object({ q: z.string().trim().min(1).max(60) }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const pat = likePattern(input.q.toLowerCase());
      const staff = ctx.member?.role === "staff";
      const hits: SearchHit[] = [];

      if (accountMode(ctx.user.modePreference) === "personal") {
        type Mv = { id: number; description: string; amount: string; type: string; date: string };
        const mv: Mv[] = await db.select({
          id: bankTransactions.id, description: bankTransactions.description, amount: bankTransactions.amount, type: bankTransactions.type,
          date: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
        }).from(bankTransactions)
          .where(and(eq(bankTransactions.userId, userId), sql`${lower(bankTransactions.description)} LIKE ${pat}`))
          .orderBy(desc(bankTransactions.transactionDate)).limit(PER_KIND);
        for (const m of mv) hits.push({ kind: "movement", id: Number(m.id), title: m.description, amount: Number(m.amount), meta: { type: m.type, date: m.date }, path: "/personal/transactions" });
        type Goal = { id: number; name: string; current: string };
        const goals: Goal[] = await safe(db.select({ id: personalGoals.id, name: personalGoals.name, current: personalGoals.currentAmount }).from(personalGoals)
          .where(and(eq(personalGoals.userId, userId), sql`${lower(personalGoals.name)} LIKE ${pat}`)).limit(PER_KIND));
        for (const g of goals) hits.push({ kind: "goal", id: Number(g.id), title: g.name, amount: Number(g.current), meta: {}, path: "/personal/goals" });
        return { hits };
      }

      // Clients, with what they still owe (sales not yet collected).
      type Cust = { id: number; name: string; lastName: string | null };
      const cust: Cust[] = await db.select({ id: customers.id, name: customers.name, lastName: customers.lastName }).from(customers)
        .where(and(eq(customers.userId, userId), sql`(${lower(customers.name)} LIKE ${pat} OR ${lower(customers.lastName)} LIKE ${pat} OR ${customers.phone} LIKE ${pat})`))
        .orderBy(customers.name).limit(PER_KIND);
      const owed = new Map<number, number>();
      if (cust.length) {
        const rows: Array<{ customerId: number; owed: string }> = await db.select({ customerId: sales.customerId, owed: sql<string>`COALESCE(SUM(${sales.total}), 0)` })
          .from(sales).where(and(eq(sales.createdBy, userId), eq(sales.status, "pending"), inArray(sales.customerId, cust.map((c) => Number(c.id)))))
          .groupBy(sales.customerId);
        for (const r of rows) owed.set(Number(r.customerId), Number(r.owed));
      }
      for (const c of cust) {
        const o = owed.get(Number(c.id)) ?? 0;
        hits.push({ kind: "customer", id: Number(c.id), title: [c.name, c.lastName].filter(Boolean).join(" "), amount: o > 0 ? o : null, meta: { owes: o > 0 ? 1 : 0 }, path: "/customers" });
      }

      // Invoices (sales), by number or client.
      type Inv = { id: number; invoiceNumber: string; customerName: string | null; total: string; status: string };
      const inv: Inv[] = await db.select({ id: sales.id, invoiceNumber: sales.invoiceNumber, customerName: sales.customerName, total: sales.total, status: sales.status })
        .from(sales).where(and(eq(sales.createdBy, userId), sql`(${lower(sales.invoiceNumber)} LIKE ${pat} OR ${lower(sales.customerName)} LIKE ${pat})`))
        .orderBy(desc(sales.createdAt)).limit(PER_KIND);
      for (const i of inv) hits.push({ kind: "invoice", id: Number(i.id), title: `#${i.invoiceNumber}${i.customerName ? ` · ${i.customerName}` : ""}`, amount: Number(i.total), meta: { status: i.status }, path: "/invoices" });

      // Products and services.
      type Svc = { id: number; name: string; price: string };
      const svc: Svc[] = await db.select({ id: services.id, name: services.name, price: services.price }).from(services)
        .where(and(eq(services.userId, userId), sql`${lower(services.name)} LIKE ${pat}`)).orderBy(services.name).limit(PER_KIND);
      for (const s of svc) hits.push({ kind: "service", id: Number(s.id), title: s.name, amount: Number(s.price), meta: {}, path: "/services" });

      if (staff) return { hits };

      // Bank movements waiting for review.
      const reviewConds: SQL[] = [
        eq(bankTransactions.userId, userId), sql`COALESCE(${bankTransactions.isReconciled}, 0) = 0`,
        sql`${bankTransactions.transactionDate} >= DATE_SUB(UTC_DATE(), INTERVAL ${REVIEW_WINDOW_DAYS} DAY)`,
        sql`${lower(bankTransactions.description)} LIKE ${pat}`,
      ];
      type Rv = { id: number; description: string; amount: string; type: string };
      const rv: Rv[] = await db.select({ id: bankTransactions.id, description: bankTransactions.description, amount: bankTransactions.amount, type: bankTransactions.type })
        .from(bankTransactions).where(and(...reviewConds)).orderBy(desc(bankTransactions.transactionDate)).limit(PER_KIND);
      for (const r of rv) hits.push({ kind: "review", id: Number(r.id), title: r.description, amount: Number(r.amount), meta: { type: r.type }, path: "/transactions" });

      // Vendors, with what's still owed to them.
      type Vend = { id: number; name: string };
      const vend: Vend[] = await safe(db.select({ id: vendors.id, name: vendors.name }).from(vendors)
        .where(and(eq(vendors.userId, userId), sql`${lower(vendors.name)} LIKE ${pat}`)).orderBy(vendors.name).limit(PER_KIND));
      const owe = new Map<number, number>();
      if (vend.length) {
        const rows: Array<{ vendorId: number; owe: string }> = await safe(db.select({ vendorId: bills.vendorId, owe: sql<string>`COALESCE(SUM(${bills.amount}), 0)` })
          .from(bills).where(and(eq(bills.userId, userId), eq(bills.status, "unpaid"), inArray(bills.vendorId, vend.map((v) => Number(v.id)))))
          .groupBy(bills.vendorId));
        for (const r of rows) owe.set(Number(r.vendorId), Number(r.owe));
      }
      for (const v of vend) {
        const o = owe.get(Number(v.id)) ?? 0;
        hits.push({ kind: "vendor", id: Number(v.id), title: v.name, amount: o > 0 ? o : null, meta: { owes: o > 0 ? 1 : 0 }, path: "/vendors" });
      }
      return { hits };
    }),
});
