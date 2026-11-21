// The bell in the top bar, like the 2.0 prototype: real notices worked out from the user's own data
// (bills about to fall due, movements waiting for review, clients who owe, budgets near their limit,
// documents the tax preparer asked for again), with "read" remembered on the server so it is the same
// on every device. Notices live inside the app; there is no email/SMS/push sender yet.
import { z } from "zod";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bankTransactions, personalCategories, sales } from "@db/schema";
import { bills, vendors } from "@db/vendorsSchema";
import { accountMode } from "./lib/plans";
import { isMissingTable } from "./lib/dbErrors";
import { REVIEW_WINDOW_DAYS } from "./lib/bankReview";
import { budgetPercent, budgetStatus, spendingByCategory } from "./lib/budgets";

type Db = ReturnType<typeof getDb>;

export type Notice = {
  key: string;
  kind: "review" | "bill_late" | "bill_soon" | "owed" | "budget_near" | "budget_over" | "tax_redo";
  /** Facts the client turns into words in the user's language. */
  params: Record<string, string | number>;
  /** When it happened or is due (YYYY-MM-DD). */
  date: string;
  urgent: boolean;
  path: string;
  read: boolean;
};

const OWED_AFTER_DAYS = 15;
const BILL_SOON_DAYS = 3;

let readsReady: Promise<void> | null = null;
function ensureReads(db: Db): Promise<void> {
  if (readsReady) return readsReady;
  const ready: Promise<void> = db.execute(sql`
    CREATE TABLE IF NOT EXISTS noticeReads (
      userId BIGINT UNSIGNED NOT NULL,
      noticeKey VARCHAR(120) NOT NULL,
      readAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY (userId, noticeKey)
    )
  `).then(() => undefined).catch((e: unknown) => { readsReady = null; throw e; });
  readsReady = ready;
  return ready;
}

/** A query on a table only some accounts have (vendors, tax): missing just means nothing to say. */
async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try { return await p; } catch (e) { if (isMissingTable(e)) return []; throw e; }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function taxRedo(db: Db, userId: number): Promise<Notice[]> {
  const rows: Array<{ id: number; kind: string; at: string }> = await safe(db.execute(sql`
    SELECT d.id, d.kind, DATE_FORMAT(d.createdAt, '%Y-%m-%d') AS at FROM taxDocuments d
    JOIN taxReturns r ON r.id = d.returnId
    WHERE r.userId = ${userId} AND d.source = 'client' AND d.status = 'redo'
    ORDER BY d.id DESC LIMIT 5
  `).then((r: unknown) => (r as [Array<{ id: number; kind: string; at: string }>])[0]));
  return rows.map((d) => ({ key: `taxredo:${d.id}`, kind: "tax_redo" as const, params: { doc: d.kind }, date: d.at, urgent: true, path: "", read: false }));
}

async function businessNotices(db: Db, userId: number, today: string): Promise<Notice[]> {
  const out: Notice[] = [];
  // Movements waiting for review: a new arrival (a newer id) makes a new, unread notice.
  const rv: Array<{ n: number; newest: number | null; at: string | null }> = await db.select({
    n: sql<number>`COUNT(*)`, newest: sql<number | null>`MAX(${bankTransactions.id})`,
    at: sql<string | null>`DATE_FORMAT(MAX(${bankTransactions.transactionDate}), '%Y-%m-%d')`,
  }).from(bankTransactions).where(and(
    eq(bankTransactions.userId, userId), sql`COALESCE(${bankTransactions.isReconciled}, 0) = 0`,
    sql`${bankTransactions.transactionDate} >= DATE_SUB(UTC_DATE(), INTERVAL ${REVIEW_WINDOW_DAYS} DAY)`,
  ));
  const pending = Number(rv[0]?.n ?? 0);
  if (pending > 0) out.push({ key: `review:${rv[0]?.newest}`, kind: "review", params: { count: pending }, date: rv[0]?.at ?? today, urgent: false, path: "/transactions", read: false });

  // Vendor bills overdue or due within a few days.
  const soon = ymd(new Date(Date.parse(`${today}T12:00:00Z`) + BILL_SOON_DAYS * 86_400_000));
  const due: Array<{ id: number; amount: string; dueDate: string; vendor: string | null }> = await safe(db.select({
    id: bills.id, amount: bills.amount, dueDate: sql<string>`DATE_FORMAT(${bills.dueDate}, '%Y-%m-%d')`, vendor: vendors.name,
  }).from(bills).leftJoin(vendors, eq(vendors.id, bills.vendorId))
    .where(and(eq(bills.userId, userId), eq(bills.status, "unpaid"), sql`${bills.dueDate} <= ${soon}`))
    .orderBy(bills.dueDate).limit(10));
  for (const b of due) {
    const late = b.dueDate < today;
    out.push({
      key: `bill:${b.id}:${late ? "late" : "soon"}`, kind: late ? "bill_late" : "bill_soon",
      params: { vendor: b.vendor ?? "", amount: Number(b.amount), due: b.dueDate }, date: b.dueDate, urgent: late || b.dueDate <= today, path: "/vendors", read: false,
    });
  }

  // Clients who still owe after a couple of weeks.
  const owed: Array<{ id: number; client: string | null; total: string; at: string }> = await db.select({
    id: sales.id, client: sales.customerName, total: sales.total, at: sql<string>`DATE_FORMAT(${sales.createdAt}, '%Y-%m-%d')`,
  }).from(sales).where(and(eq(sales.createdBy, userId), eq(sales.status, "pending"), sql`${sales.createdAt} <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${OWED_AFTER_DAYS} DAY)`))
    .orderBy(sales.createdAt).limit(10);
  for (const s of owed) out.push({ key: `owed:${s.id}`, kind: "owed", params: { client: s.client ?? "", amount: Number(s.total), since: s.at }, date: s.at, urgent: false, path: "/invoices", read: false });

  out.push(...(await taxRedo(db, userId)).map((n) => ({ ...n, path: "/taxes" })));
  return out;
}

async function personalNotices(db: Db, userId: number, today: string): Promise<Notice[]> {
  const out: Notice[] = [];
  const month = today.slice(0, 7);
  const limitsRows: Array<{ name: string; budgetLimit: string | null }> = await db.select({ name: personalCategories.name, budgetLimit: personalCategories.budgetLimit })
    .from(personalCategories).where(and(eq(personalCategories.userId, userId), isNotNull(personalCategories.budgetLimit)));
  const limits = limitsRows.map((r) => ({ name: r.name, limit: Number(r.budgetLimit) })).filter((r) => Number.isFinite(r.limit) && r.limit > 0);
  if (limits.length) {
    const txs: Array<{ type: string; category: string; amount: string }> = await db.select({ type: bankTransactions.type, category: bankTransactions.category, amount: bankTransactions.amount })
      .from(bankTransactions).where(and(eq(bankTransactions.userId, userId), sql`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m') = ${month}`));
    const spent = spendingByCategory(txs);
    for (const { name, limit } of limits) {
      const s = spent.get(name) ?? 0;
      const status = budgetStatus(s, limit);
      if (status === "ok") continue;
      out.push({
        key: `budget:${name}:${month}:${status}`, kind: status === "over" ? "budget_over" : "budget_near",
        params: { category: name, spent: s, limit, percent: budgetPercent(s, limit) }, date: today, urgent: status === "over", path: "/personal/budgets", read: false,
      });
    }
  }
  out.push(...(await taxRedo(db, userId)).map((n) => ({ ...n, path: "/personal/taxes" })));
  return out;
}

async function currentNotices(db: Db, user: { id: number | string; modePreference?: string | null }): Promise<Notice[]> {
  const userId = Number(user.id);
  const today = ymd(new Date());
  const list = accountMode(user.modePreference) === "personal" ? await personalNotices(db, userId, today) : await businessNotices(db, userId, today);
  if (!list.length) return [];
  await ensureReads(db);
  const reads: Array<{ noticeKey: string }> = (await db.execute(sql`SELECT noticeKey FROM noticeReads WHERE userId = ${userId} AND noticeKey IN (${sql.join(list.map((n) => sql`${n.key}`), sql`, `)})`) as unknown as [Array<{ noticeKey: string }>])[0];
  const read = new Set(reads.map((r) => r.noticeKey));
  return list
    .map((n) => ({ ...n, read: read.has(n.key) }))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.read === b.read ? b.date.localeCompare(a.date) : Number(a.read) - Number(b.read)));
}

export const noticesRouter = createRouter({
  /** What the bell shows. Team members get nothing here (the owner's notices are the owner's). */
  list: authedQuery.query(async ({ ctx }) => {
    if (ctx.member) return { items: [] as Notice[], unread: 0 };
    const items = await currentNotices(getDb(), ctx.user);
    return { items, unread: items.filter((n) => !n.read).length };
  }),

  markRead: authedQuery
    .input(z.object({ keys: z.array(z.string().min(1).max(120)).min(1).max(50) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureReads(db);
      const userId = Number(ctx.user.id);
      await db.execute(sql`INSERT IGNORE INTO noticeReads (userId, noticeKey) VALUES ${sql.join(input.keys.map((k) => sql`(${userId}, ${k})`), sql`, `)}`);
      return { ok: true };
    }),

  markAllRead: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const items = await currentNotices(db, ctx.user);
    const keys = items.filter((n) => !n.read).map((n) => n.key);
    if (keys.length) {
      const userId = Number(ctx.user.id);
      await db.execute(sql`INSERT IGNORE INTO noticeReads (userId, noticeKey) VALUES ${sql.join(keys.map((k) => sql`(${userId}, ${k})`), sql`, `)}`);
    }
    return { ok: true, count: keys.length };
  }),
});

/** Account deletion: forget the read marks. */
export async function deleteUserNotices(db: Db, userId: number): Promise<void> {
  try { await db.execute(sql`DELETE FROM noticeReads WHERE userId = ${userId}`); } catch (e) { if (!isMissingTable(e)) throw e; }
}

