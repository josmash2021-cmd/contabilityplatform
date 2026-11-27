// ── Bancos (business /bank, 2.0) ──
// Everything the screen needs per bank connection (Plaid item) and per account: the overview with the
// 30-day change, balance lines and what's left to review; one account's month; and the per-bank actions
// (refresh now, bring history from a date, nickname, reconnect through Plaid Link update mode, disconnect
// one bank). The older whole-account procedures stay in api/bank-router.ts (only imported from here).
//
// Every procedure works on ctx.user.id only. Team members: the accountant can read (queries); every
// mutation here is refused for members by api/lib/team.ts (they aren't in its upkeep list). The Plaid
// access token is read on the server and never returned.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bankAccounts, bankTransactions } from "@db/schema";
import { bills, vendors } from "@db/vendorsSchema";
import { determineTypeAndCategory, initPlaid, plaidBalance, plaidMerchantNameOf, takeOverPending } from "./bank-router";
import { rememberMerchantLogos, withMerchantLogos } from "./lib/merchantLogos";
import { isBankOwnMovement } from "./lib/brand";
import { displayNameOf } from "./lib/reviewEngine";
import { accountMode, bankLimit } from "./lib/plans";
import { contextHas, getPlanContext, lastPaidTier } from "./lib/planAccess";
import { REVIEW_WINDOW_DAYS } from "./lib/bankReview";
import { addDays, effectiveToday, isIsoDate, utcToday } from "./lib/vendors";
import { isDuplicateKey, isMissingTable } from "./lib/dbErrors";
import { forgetInstitutions, itemKeyOf, recordItemOutcome } from "./lib/bankInstitutions";
import { askBanksNow, balancesNow, heldBanks, type LiveClient } from "./lib/liveBalance";
import type { Lang } from "./lib/i18n";
import {
  CHANGE_DAYS, DEFAULT_SYNC_DAYS, MAX_NICKNAME, QUIET_SYNC_DAYS, accountKind, balanceSeries, clampSince, cleanNickname,
  plaidProblem, signedPlaidAmount, weekBills, type AccountKind, type PlaidProblem, type WeekBillRow,
} from "./lib/banks";

type Db = ReturnType<typeof getDb>;

const MESSAGES = {
  es: {
    notFound: "No encontramos ese banco en tu cuenta.",
    accountNotFound: "No encontramos esa cuenta.",
    plaidDown: "No pudimos hablar con tu banco ahora. Intenta en un momento.",
    revokeFailed: "No pudimos desconectar el banco ahora. No borramos nada; intenta en un momento.",
    noToken: "Este banco no tiene una conexión activa. Conéctalo otra vez.",
  },
  en: {
    notFound: "We couldn't find that bank on your account.",
    accountNotFound: "We couldn't find that account.",
    plaidDown: "We couldn't reach your bank right now. Try again in a moment.",
    revokeFailed: "We couldn't disconnect the bank right now. Nothing was deleted; try again in a moment.",
    noToken: "This bank has no active connection. Connect it again.",
  },
} satisfies Record<Lang, Record<string, string>>;

function fail(code: TRPCError["code"], lang: Lang, key: keyof (typeof MESSAGES)["es"]): never {
  throw new TRPCError({ code, message: MESSAGES[lang][key] });
}

// ── Side table: nickname and the card limit Plaid reports (created on first use; cleaned up with the account) ──
let extrasReady: Promise<void> | null = null;
export function ensureBankExtras(db: Db): Promise<void> {
  extrasReady ??= (async () => {
    const columns = sql`
      bankAccountId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      userId BIGINT UNSIGNED NOT NULL,
      nickname VARCHAR(60) NULL,
      creditLimit DECIMAL(14,2) NULL,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      INDEX bankAccountExtras_userId_idx (userId)`;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS bankAccountExtras (${columns},
        CONSTRAINT bankAccountExtras_account_fk FOREIGN KEY (bankAccountId) REFERENCES bankAccounts (id) ON DELETE CASCADE)`);
    } catch (e: unknown) {
      // A database that refuses the foreign key still gets the table; disconnecting deletes these rows itself.
      console.error("[banks] extras table with FK failed, creating without:", e instanceof Error ? e.message : e);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS bankAccountExtras (${columns})`);
    }
  })().catch((e) => { extrasReady = null; throw e; });
  return extrasReady;
}

type Extras = { bankAccountId: number; nickname: string | null; creditLimit: string | null };
async function readExtras(db: Db, userId: number): Promise<Map<number, Extras>> {
  try {
    const [rows] = (await db.execute(sql`SELECT bankAccountId, nickname, creditLimit FROM bankAccountExtras WHERE userId = ${userId}`)) as unknown as [Extras[]];
    return new Map(rows.map((r) => [Number(r.bankAccountId), r]));
  } catch (e: unknown) {
    if (isMissingTable(e)) return new Map();
    throw e;
  }
}

// ── Plaid (the shared client from api/bank-router.ts), typed for what's used here ──
type PlaidAccount = {
  account_id: string; name: string; mask?: string | null; type?: string | null;
  balances?: { available?: number | null; current?: number | null; limit?: number | null; iso_currency_code?: string | null } | null;
};
type PlaidTx = {
  transaction_id: string; account_id: string; amount: number; date: string; name: string; merchant_name?: string | null;
  category?: string[] | null; personal_finance_category?: { primary: string; detailed: string } | null;
  pending?: boolean | null; pending_transaction_id?: string | null;
  logo_url?: string | null; website?: string | null;
  counterparties?: Array<{ name?: string | null; type?: string | null; logo_url?: string | null; website?: string | null }> | null;
};
type PlaidClient = {
  accountsGet(req: { access_token: string }): Promise<{ data: { accounts?: PlaidAccount[] } }>;
  transactionsGet(req: { access_token: string; start_date: string; end_date: string; options: Record<string, unknown> }): Promise<{ data: { transactions?: PlaidTx[]; total_transactions?: number } }>;
  linkTokenCreate(req: Record<string, unknown>): Promise<{ data: { link_token: string } }>;
  itemRemove(req: { access_token: string }): Promise<unknown>;
};
const plaid = async (): Promise<PlaidClient | null> => (await initPlaid()) as PlaidClient | null;

/** Plaid's error code from a failed call (the SDK wraps it in an axios error), or null for network trouble. */
function plaidErrorCode(e: unknown): string | null {
  const data = (e as { response?: { data?: { error_code?: unknown } } } | null)?.response?.data;
  return typeof data?.error_code === "string" ? data.error_code : null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })])
    .finally(() => clearTimeout(timer));
}

// ── Bank connections (Plaid items) and their accounts (server only: rows include the token) ──
// Grouped exactly like brand.institutions (api/lib/bankInstitutions.ts itemKeyOf): the Plaid item id, or for
// old rows without one, "account-<lowest id sharing the token>". Only active accounts with a token count.
type ItemRow = {
  id: number; plaidAccountId: string | null; accountType: string | null; bankName: string; accountNumber: string | null;
  plaidAccessToken: string | null; plaidItemId: string | null;
};
const itemCols = {
  id: bankAccounts.id, plaidAccountId: bankAccounts.plaidAccountId, accountType: bankAccounts.accountType, bankName: bankAccounts.bankName,
  accountNumber: bankAccounts.accountNumber, plaidAccessToken: bankAccounts.plaidAccessToken, plaidItemId: bankAccounts.plaidItemId,
};

/** The caller's banks: every active account with a connection, grouped by bank connection. */
async function itemsOf(db: Db, userId: number): Promise<Map<string, ItemRow[]>> {
  const rows: ItemRow[] = await db.select(itemCols).from(bankAccounts)
    .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, true), isNotNull(bankAccounts.plaidAccessToken)))
    .orderBy(asc(bankAccounts.id));
  const out = new Map<string, ItemRow[]>();
  for (const r of rows) {
    const k = itemKeyOf(rows, r);
    if (k) out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
}

type SyncResult = { itemId: string; ok: true; added: number; accounts: number } | { itemId: string; ok: false; problem: PlaidProblem };

/**
 * Brings one bank up to date: balances (and a card's limit) from accountsGet, then the movements from
 * `since` through today from transactionsGet, saving only the ones not saved yet. New accounts the bank
 * reports for this connection are added. Plaid errors come back as a problem, never thrown.
 */
async function syncItem(db: Db, client: PlaidClient, userId: number, itemId: string, rows: ItemRow[], since: string, today: string): Promise<SyncResult> {
  const token = rows.find((r) => r.plaidAccessToken)?.plaidAccessToken;
  if (!token) return { itemId, ok: false, problem: "gone" };
  try {
    // Balances first: they also tell us the connection works. From the bank itself when it's switched on (once
    // per bank every 15 minutes, api/lib/liveBalance.ts), else Plaid's copy.
    const res = await balancesNow(db, client as LiveClient, userId, itemId, token, () => withTimeout(client.accountsGet({ access_token: token }), 15_000));
    await recordItemOutcome(db, userId, itemId, { ok: true });
    // Plaid's copy never goes over a balance that came from the bank itself after it
    const keepSaved = !res.live && (await heldBanks(db, userId)).has(itemId);
    const plaidAccounts = res.data.accounts ?? [];
    const byPlaidId = new Map<string, { id: number; bankName: string; accountNumber: string | null }>();
    const mine: Array<{ id: number; plaidAccountId: string | null; bankName: string; accountNumber: string | null }> = plaidAccounts.length
      ? await db.select({ id: bankAccounts.id, plaidAccountId: bankAccounts.plaidAccountId, bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber })
        .from(bankAccounts).where(and(eq(bankAccounts.userId, userId), inArray(bankAccounts.plaidAccountId, plaidAccounts.map((a) => a.account_id))))
      : [];
    for (const r of mine) if (r.plaidAccountId) byPlaidId.set(r.plaidAccountId, r);
    const limits: Array<{ id: number; limit: number | null }> = [];
    for (const pa of plaidAccounts) {
      const bal = plaidBalance(pa);
      const known = byPlaidId.get(pa.account_id);
      if (known) {
        await db.update(bankAccounts).set({
          ...(bal != null && !keepSaved ? { currentBalance: bal } : {}), accountType: pa.type || undefined, lastSyncedAt: new Date(), updatedAt: new Date(),
        }).where(and(eq(bankAccounts.id, known.id), eq(bankAccounts.userId, userId)));
        if (pa.type === "credit") limits.push({ id: known.id, limit: typeof pa.balances?.limit === "number" ? pa.balances.limit : null });
      } else {
        const ins = (await db.insert(bankAccounts).values({
          userId, plaidAccountId: pa.account_id, plaidAccessToken: token, plaidItemId: rows[0]?.plaidItemId ?? null,
          bankName: pa.name, accountType: pa.type || "", accountNumber: pa.mask || "", currency: pa.balances?.iso_currency_code || "USD",
          currentBalance: bal ?? "0", isActive: true, lastSyncedAt: new Date(),
        })) as unknown as [{ insertId: number }];
        const id = Number(ins[0].insertId);
        byPlaidId.set(pa.account_id, { id, bankName: pa.name, accountNumber: pa.mask || "" });
        if (pa.type === "credit") limits.push({ id, limit: typeof pa.balances?.limit === "number" ? pa.balances.limit : null });
      }
    }
    if (limits.length) {
      await ensureBankExtras(db);
      for (const l of limits) {
        await db.execute(sql`INSERT INTO bankAccountExtras (bankAccountId, userId, creditLimit) VALUES (${l.id}, ${userId}, ${l.limit == null ? null : l.limit.toFixed(2)})
          ON DUPLICATE KEY UPDATE creditLimit = VALUES(creditLimit)`);
      }
    }

    // Movements, page by page (Plaid sends at most 500 at a time).
    const all: PlaidTx[] = [];
    for (let offset = 0; offset < 20_000;) {
      const page = await withTimeout(client.transactionsGet({
        access_token: token, start_date: since, end_date: today,
        options: { include_personal_finance_category: true, count: 500, offset },
      }), 25_000);
      const txs = page.data.transactions ?? [];
      all.push(...txs);
      offset += txs.length;
      if (txs.length < 500 || offset >= (page.data.total_transactions ?? 0)) break;
    }
    // Plaid's original merchant logos, kept for every screen (withMerchantLogos).
    await rememberMerchantLogos(db, all);
    const ids = [...new Set(all.map((t) => t.transaction_id).filter(Boolean))];
    const saved = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rowsSaved: Array<{ id: string | null }> = await db.select({ id: bankTransactions.plaidTransactionId }).from(bankTransactions)
        .where(inArray(bankTransactions.plaidTransactionId, chunk));
      for (const r of rowsSaved) if (r.id) saved.add(r.id);
    }
    // Settled movements only: a pending one gets a new id once it posts, so saving it too would count it twice.
    const fresh = all.filter((t) => t.transaction_id && !t.pending && !saved.has(t.transaction_id) && Math.abs(t.amount) > 0 && byPlaidId.has(t.account_id));
    let added = 0;
    const built = fresh.map((t) => {
      const acc = byPlaidId.get(t.account_id)!;
      const { type, category } = determineTypeAndCategory(
        t.amount, t.personal_finance_category?.detailed ? [t.personal_finance_category.primary, t.personal_finance_category.detailed] : t.category ?? [], t.name,
      );
      return {
        userId, bankAccountId: acc.id, bankName: acc.bankName, accountNumber: acc.accountNumber,
        // Noon UTC: the same calendar day whatever the server's time zone.
        transactionDate: new Date(`${t.date}T12:00:00Z`), description: (t.name || "").slice(0, 255),
        amount: Math.abs(t.amount).toFixed(2), plaidAmount: t.amount.toFixed(2), type, category: category.slice(0, 40),
        subcategory: t.personal_finance_category?.detailed || t.category?.[1] || null,
        plaidTransactionId: t.transaction_id, plaidCategory: t.personal_finance_category ? JSON.stringify(t.personal_finance_category) : null,
        merchantName: (plaidMerchantNameOf(t) || t.name || "").slice(0, 255), syncStatus: "synced" as const, lastSyncedAt: new Date(),
        reference: t.transaction_id, isReconciled: false, importedFrom: "plaid",
      };
    });
    // One saved while it was still pending (older syncs kept them) becomes the settled one instead of a second row.
    const values: typeof built = [];
    for (let i = 0; i < built.length; i++) {
      if (await takeOverPending(db, userId, fresh[i], built[i])) added++;
      else values.push(built[i]);
    }
    for (let i = 0; i < values.length; i += 100) {
      const chunk = values.slice(i, i + 100);
      try {
        await db.insert(bankTransactions).values(chunk);
        added += chunk.length;
      } catch {
        // Something in the chunk was saved meanwhile (another sync): save the rest one by one.
        for (const v of chunk) {
          try { await db.insert(bankTransactions).values(v); added++; } catch (e: unknown) { if (!isDuplicateKey(e)) console.error("[banks] insert failed:", e instanceof Error ? e.message : e); }
        }
      }
    }
    return { itemId, ok: true, added, accounts: plaidAccounts.length };
  } catch (e: unknown) {
    const code = plaidErrorCode(e);
    await recordItemOutcome(db, userId, itemId, { error: e });
    if (!code) console.error(`[banks] sync of a bank failed for user ${userId}:`, e instanceof Error ? e.message : e);
    return { itemId, ok: false, problem: code ? plaidProblem(code) : "error" };
  }
}

// ── Inputs ──
const isoDay = z.string().refine(isIsoDate, { message: "Invalid date (YYYY-MM-DD)" });
const itemIdIn = z.string().min(1).max(255);

type AccountRow = {
  id: number; bankName: string; accountNumber: string | null; accountType: string | null; currentBalance: string | null;
  lastSyncedAt: Date | string | null; plaidItemId: string | null; plaidAccessToken: string | null;
};
type TxRow = { bankAccountId: number; date: string; plaidAmount: string | null; amount: string; type: string };
type MonthRow = {
  id: number; date: string; description: string; merchantName: string | null; amount: string; plaidAmount: string | null;
  type: string; category: string; isReconciled: number | boolean | null; importedFrom: string | null; plaidCategory: string | null;
};

const KIND_ORDER: Record<AccountKind, number> = { cash: 0, credit: 1, loan: 2 };
const iso = (d: Date | string | null): string | null => (d ? new Date(d).toISOString() : null);

export const banksRouter = createRouter({
  /**
   * The whole screen: accounts (balance, 30-day line and change, movements left to review, nickname,
   * card limit), the totals, this week's vendor bills (plans with Proveedores) and the plan's bank count.
   */
  overview: authedQuery
    .input(z.object({ today: isoDay.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const today = effectiveToday(input?.today, utcToday());

      // The token is read only to group accounts by bank connection; it is never returned.
      const rows: AccountRow[] = await db.select({
        id: bankAccounts.id, bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber, accountType: bankAccounts.accountType,
        currentBalance: bankAccounts.currentBalance, lastSyncedAt: bankAccounts.lastSyncedAt, plaidItemId: bankAccounts.plaidItemId,
        plaidAccessToken: bankAccounts.plaidAccessToken,
      }).from(bankAccounts)
        .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, true), isNotNull(bankAccounts.plaidAccessToken)))
        .orderBy(asc(bankAccounts.id));
      const ids = rows.map((r) => Number(r.id));

      const [extras, txs, pending] = ids.length ? await Promise.all([
        readExtras(db, userId),
        db.select({
          bankAccountId: bankTransactions.bankAccountId, date: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
          plaidAmount: bankTransactions.plaidAmount, amount: bankTransactions.amount, type: bankTransactions.type,
        }).from(bankTransactions).where(and(
          eq(bankTransactions.userId, userId), inArray(bankTransactions.bankAccountId, ids),
          sql`${bankTransactions.transactionDate} >= ${addDays(today, -(CHANGE_DAYS - 1))}`,
        )) as Promise<TxRow[]>,
        // Same rule as "Por revisar" (api/review-router.ts): not reviewed, within the review window.
        db.select({ bankAccountId: bankTransactions.bankAccountId, n: sql<number>`COUNT(*)` }).from(bankTransactions).where(and(
          eq(bankTransactions.userId, userId), inArray(bankTransactions.bankAccountId, ids),
          sql`COALESCE(${bankTransactions.isReconciled}, 0) = 0`,
          sql`${bankTransactions.transactionDate} >= DATE_SUB(UTC_DATE(), INTERVAL ${REVIEW_WINDOW_DAYS} DAY)`,
        )).groupBy(bankTransactions.bankAccountId) as Promise<Array<{ bankAccountId: number; n: number | string }>>,
      ]) : [new Map<number, Extras>(), [] as TxRow[], [] as Array<{ bankAccountId: number; n: number | string }>];

      const txsBy = new Map<number, Array<{ date: string; plaidAmount: number }>>();
      for (const t of txs) {
        const k = Number(t.bankAccountId);
        txsBy.set(k, [...(txsBy.get(k) ?? []), { date: t.date, plaidAmount: signedPlaidAmount(t) }]);
      }
      const pendingBy = new Map(pending.map((p) => [Number(p.bankAccountId), Number(p.n)]));

      const accounts = rows.map((r) => {
        const id = Number(r.id);
        const kind = accountKind(r.accountType);
        const balance = Number(r.currentBalance ?? 0) || 0;
        const series = balanceSeries(balance, kind, txsBy.get(id) ?? [], today);
        const ex = extras.get(id);
        const limit = ex?.creditLimit != null && Number(ex.creditLimit) > 0 ? Number(ex.creditLimit) : null;
        return {
          id, name: r.bankName, nickname: ex?.nickname ?? null, mask: r.accountNumber || null, type: r.accountType || null, kind,
          balance, itemId: itemKeyOf(rows, r) ?? `account-${id}`, lastSyncedAt: iso(r.lastSyncedAt),
          series: series.points, change30: series.change, unreviewed: pendingBy.get(id) ?? 0,
          creditLimit: kind === "credit" ? limit : null,
        };
      }).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id - b.id);

      const cash = accounts.filter((a) => a.kind === "cash");
      const cards = accounts.filter((a) => a.kind === "credit");
      const cents = (n: number) => Math.round(n * 100);
      const cashTotal = cash.reduce((s, a) => s + cents(a.balance), 0) / 100;

      // This week's vendor bills, only when the plan includes Proveedores.
      let week: { bills: Array<{ id: number; vendor: string; amount: number; dueDate: string }>; total: number; after: number } | null = null;
      if (contextHas(await getPlanContext(db, ctx.user), "vendors")) {
        let billRows: WeekBillRow[] = [];
        try {
          billRows = await db.select({
            id: bills.id, vendor: vendors.name, amount: bills.amount, status: bills.status,
            dueDate: sql<string>`DATE_FORMAT(${bills.dueDate}, '%Y-%m-%d')`,
          }).from(bills).innerJoin(vendors, and(eq(vendors.id, bills.vendorId), eq(vendors.userId, userId)))
            .where(and(eq(bills.userId, userId), eq(bills.status, "unpaid"), sql`${bills.dueDate} BETWEEN ${today} AND ${addDays(today, 7)}`));
        } catch (e: unknown) {
          if (!isMissingTable(e)) throw e; // Proveedores never opened: no bills
        }
        const wb = weekBills(billRows.map((b) => ({ ...b, id: Number(b.id) })), today);
        week = { ...wb, after: (cents(cashTotal) - cents(wb.total)) / 100 };
      }

      const mode = accountMode(ctx.user.modePreference);
      const limit = ctx.user.role === "admin" ? null : bankLimit(mode, await lastPaidTier(db, userId, mode));

      return {
        today,
        accounts,
        totals: {
          cash: cashTotal,
          cashCount: cash.length,
          change30: cash.reduce((s, a) => s + cents(a.change30), 0) / 100,
          cardOwed: cards.reduce((s, a) => s + cents(a.balance), 0) / 100,
          cardCount: cards.length,
        },
        week,
        plan: { used: new Set(accounts.map((a) => a.itemId)).size, limit },
      };
    }),

  /** One account's movements in a month, newest first, with what's still to review. */
  accountMonth: authedQuery
    .input(z.object({ accountId: z.number().int().positive(), year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const owned: Array<{ id: number }> = await db.select({ id: bankAccounts.id }).from(bankAccounts)
        .where(and(eq(bankAccounts.id, input.accountId), eq(bankAccounts.userId, userId))).limit(1);
      if (!owned[0]) fail("NOT_FOUND", ctx.lang, "accountNotFound");
      const start = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const end = addDays(input.month === 12 ? `${input.year + 1}-01-01` : `${input.year}-${String(input.month + 1).padStart(2, "0")}-01`, -1);
      const rows: MonthRow[] = await db.select({
        id: bankTransactions.id, date: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
        description: bankTransactions.description, merchantName: bankTransactions.merchantName, amount: bankTransactions.amount,
        plaidAmount: bankTransactions.plaidAmount, type: bankTransactions.type, category: bankTransactions.category,
        isReconciled: bankTransactions.isReconciled, importedFrom: bankTransactions.importedFrom, plaidCategory: bankTransactions.plaidCategory,
      }).from(bankTransactions).where(and(
        eq(bankTransactions.userId, userId), eq(bankTransactions.bankAccountId, input.accountId),
        sql`${bankTransactions.transactionDate} BETWEEN ${start} AND ${end}`,
      )).orderBy(desc(bankTransactions.transactionDate), desc(bankTransactions.id)).limit(2000);
      let inCents = 0, outCents = 0;
      // Each movement's original logo (Plaid's, kept per merchant; Zelle's saved one).
      const logos = await withMerchantLogos(db, rows.map((r) => ({ description: r.description, merchantName: r.merchantName, logoUrl: null as string | null })));
      const transactions = rows.map((r, i) => {
        const signed = signedPlaidAmount(r);
        if (signed < 0) inCents += Math.round(-signed * 100); else outCents += Math.round(signed * 100);
        return {
          id: Number(r.id), date: r.date, description: r.description, merchantName: r.merchantName,
          // What people recognize ("Apple", "DoorDash"), its logo, and whether the bank itself made it (its logo then).
          who: displayNameOf(r.description, r.merchantName), logoUrl: logos[i].logoUrl,
          bankOwn: isBankOwnMovement(`${r.description} ${r.merchantName ?? ""}`, r.plaidCategory),
          amount: Math.abs(Number(r.amount) || 0), direction: signed < 0 ? ("in" as const) : ("out" as const),
          category: r.category, reviewed: !!Number(r.isReconciled), importedFrom: r.importedFrom,
        };
      });
      // The year so far, month by month (what came in and went out), for the line under the list.
      const signedSql = sql`COALESCE(${bankTransactions.plaidAmount}, IF(${bankTransactions.type} = 'income', -ABS(${bankTransactions.amount}), ABS(${bankTransactions.amount})))`;
      const yearRows: Array<{ m: number | string; inc: string | number | null; out: string | number | null; n: number | string }> = await db.select({
        m: sql<number>`MONTH(${bankTransactions.transactionDate})`,
        inc: sql<string>`SUM(CASE WHEN ${signedSql} < 0 THEN ABS(${bankTransactions.amount}) ELSE 0 END)`,
        out: sql<string>`SUM(CASE WHEN ${signedSql} < 0 THEN 0 ELSE ABS(${bankTransactions.amount}) END)`,
        n: sql<number>`COUNT(*)`,
      }).from(bankTransactions).where(and(
        eq(bankTransactions.userId, userId), eq(bankTransactions.bankAccountId, input.accountId),
        sql`${bankTransactions.transactionDate} BETWEEN ${`${input.year}-01-01`} AND ${`${input.year}-12-31`}`,
      )).groupBy(sql`MONTH(${bankTransactions.transactionDate})`);
      const year = yearRows.map((r) => ({ month: Number(r.m), income: Math.round(Number(r.inc ?? 0) * 100) / 100, expense: Math.round(Number(r.out ?? 0) * 100) / 100, count: Number(r.n) }))
        .sort((a, b) => a.month - b.month);
      return { transactions, income: inCents / 100, expense: outCents / 100, reviewFrom: addDays(utcToday(), -REVIEW_WINDOW_DAYS), year };
    }),

  /** "Cambiar nombre": a nickname for one account (empty removes it). Saved in the side table. */
  rename: authedQuery
    .input(z.object({ accountId: z.number().int().positive(), nickname: z.string().max(MAX_NICKNAME * 4).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const owned: Array<{ id: number }> = await db.select({ id: bankAccounts.id }).from(bankAccounts)
        .where(and(eq(bankAccounts.id, input.accountId), eq(bankAccounts.userId, userId))).limit(1);
      if (!owned[0]) fail("NOT_FOUND", ctx.lang, "accountNotFound");
      const nickname = cleanNickname(input.nickname);
      await ensureBankExtras(db);
      await db.execute(sql`INSERT INTO bankAccountExtras (bankAccountId, userId, nickname) VALUES (${input.accountId}, ${userId}, ${nickname})
        ON DUPLICATE KEY UPDATE nickname = VALUES(nickname)`);
      return { accountId: input.accountId, nickname };
    }),

  /**
   * "Actualizar" (no `since`: the last 30 days) and "Desde cuándo traer movimientos" (`since`, as far back
   * as Plaid allows) for one bank. Balances are refreshed too.
   */
  syncItem: authedQuery
    .input(z.object({ itemId: itemIdIn, since: isoDay.optional(), today: isoDay.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const rows = (await itemsOf(db, userId)).get(input.itemId);
      if (!rows?.length) fail("NOT_FOUND", ctx.lang, "notFound");
      const client = await plaid();
      if (!client) fail("SERVICE_UNAVAILABLE", ctx.lang, "plaidDown");
      const today = effectiveToday(input.today, utcToday());
      const since = clampSince(input.since, today, DEFAULT_SYNC_DAYS);
      return { ...(await syncItem(db, client, userId, input.itemId, rows, since, today)), since };
    }),

  /**
   * The quiet refresh when the screen opens: every bank's balances and its last few days of movements.
   * `pulled` (opening the page or pulling to refresh, owner 2026-11-27): also asks Plaid to go to the banks now (Transactions Refresh, when it's switched
   * on; once per bank per hour). Plaid answers at once and the movements arrive by webhook.
   */
  refreshItems: authedQuery
    .input(z.object({ today: isoDay.optional(), pulled: z.boolean().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const items = await itemsOf(db, userId);
      if (!items.size) return { results: [] as SyncResult[] };
      const client = await plaid();
      if (!client) return { results: [...items.keys()].map((itemId): SyncResult => ({ itemId, ok: false, problem: "error" })) };
      const today = effectiveToday(input?.today, utcToday());
      const since = addDays(today, -QUIET_SYNC_DAYS);
      const results = await Promise.all([...items.entries()].map(([itemId, rows]) => syncItem(db, client, userId, itemId, rows, since, today)));
      // Then ask Plaid to go to the banks for new movements (after the balances, so they never wait behind it)
      if (input?.pulled) {
        const asks = [...items.entries()].flatMap(([key, rows]) => { const token = rows.find((r) => r.plaidAccessToken)?.plaidAccessToken; return token ? [{ key, token }] : []; });
        void askBanksNow(db, client as LiveClient, userId, asks).catch(() => 0);
      }
      return { results };
    }),

  /**
   * "Reconectar": a Plaid Link token in update mode for one bank, so the owner signs in again without
   * adding a new connection. Only the link token goes back; the access token stays here.
   */
  updateLinkToken: authedQuery
    .input(z.object({ itemId: itemIdIn }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const rows = (await itemsOf(db, userId)).get(input.itemId);
      if (!rows?.length) fail("NOT_FOUND", ctx.lang, "notFound");
      const token = rows.find((r) => r.plaidAccessToken)?.plaidAccessToken;
      if (!token) fail("BAD_REQUEST", ctx.lang, "noToken");
      const client = await plaid();
      if (!client) fail("SERVICE_UNAVAILABLE", ctx.lang, "plaidDown");
      try {
        const res = await withTimeout(client.linkTokenCreate({
          user: { client_user_id: String(userId) },
          client_name: "Aethel Accounting platform",
          country_codes: ["US"],
          language: ctx.lang === "en" ? "en" : "es",
          access_token: token,
        }), 15_000);
        return { linkToken: String(res.data.link_token) };
      } catch (e: unknown) {
        console.error(`[banks] update link token failed for user ${userId}:`, plaidErrorCode(e) ?? (e instanceof Error ? e.message : e));
        fail("BAD_GATEWAY", ctx.lang, "plaidDown");
      }
    }),

  /**
   * "Desconectar" one bank: Plaid revokes the access (itemRemove), then that bank's accounts are removed.
   * Its movements stay (they keep the bank's name and last digits); every other bank is untouched.
   */
  disconnectItem: authedQuery
    .input(z.object({ itemId: itemIdIn }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const group = (await itemsOf(db, userId)).get(input.itemId);
      if (!group?.length) fail("NOT_FOUND", ctx.lang, "notFound");
      // Every row of this connection, also any inactive one: same Plaid item, or (old rows) same token.
      const itemId = group[0].plaidItemId;
      const groupTokens = [...new Set(group.map((r) => r.plaidAccessToken).filter((t): t is string => !!t))];
      const rows: ItemRow[] = await db.select(itemCols).from(bankAccounts).where(and(
        eq(bankAccounts.userId, userId),
        itemId ? eq(bankAccounts.plaidItemId, itemId) : inArray(bankAccounts.plaidAccessToken, groupTokens),
      ));
      const tokens = [...new Set(rows.map((r) => r.plaidAccessToken).filter((t): t is string => !!t))];
      if (tokens.length) {
        const client = await plaid();
        if (!client) fail("SERVICE_UNAVAILABLE", ctx.lang, "revokeFailed");
        for (const token of tokens) {
          try {
            await withTimeout(client.itemRemove({ access_token: token }), 15_000);
          } catch (e: unknown) {
            // Already revoked or unknown to Plaid: there's no access left to remove. Anything else: keep everything.
            const code = plaidErrorCode(e);
            if (!code || plaidProblem(code) !== "gone") {
              console.error(`[banks] itemRemove failed for user ${userId}:`, code ?? (e instanceof Error ? e.message : e));
              fail("BAD_GATEWAY", ctx.lang, "revokeFailed");
            }
          }
        }
      }
      const ids = rows.map((r) => Number(r.id));
      const kept = await db.transaction(async (t: Db) => {
        const [c] = (await t.execute(sql`SELECT COUNT(*) AS n FROM bankTransactions WHERE userId = ${userId} AND bankAccountId IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)) as unknown as [Array<{ n: number | string }>];
        // The movements stay; they just no longer point at an account that's gone (same as the FK's ON DELETE SET NULL).
        await t.update(bankTransactions).set({ bankAccountId: null }).where(and(eq(bankTransactions.userId, userId), inArray(bankTransactions.bankAccountId, ids)));
        try {
          await t.execute(sql`DELETE FROM bankAccountExtras WHERE userId = ${userId} AND bankAccountId IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
        } catch (e: unknown) {
          if (!isMissingTable(e)) throw e;
        }
        await t.delete(bankAccounts).where(and(eq(bankAccounts.userId, userId), inArray(bankAccounts.id, ids)));
        return Number(c[0]?.n ?? 0);
      });
      await forgetInstitutions(db, userId, input.itemId);
      return { success: true as const, accounts: ids.length, keptMovements: kept };
    }),
});
