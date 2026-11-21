// ── Cotizaciones y facturas recurrentes (business Pro and Negocio) ──
// Quotes go draft → sent → accepted / rejected, and "convert" turns one into a sale.
// Recurring invoices create, on each due date, a sale waiting to be paid (status "pending",
// like any sale not paid yet: no payment and no journal entry, so it doesn't count as income);
// the user marks it collected when the client pays, which books it like the POS does.
// runRecurringInvoices(db) does the due ones for every user; a server timer calls it.
// The pure rules (totals, dates, statuses) live in ./lib/quotes.ts; tables are created on first use.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, like, sql } from "drizzle-orm";
import type { AnyMySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { accounts, customers, journalEntries, journalEntryLines, paymentRecords, sales, saleServices, services, users } from "@db/schema";
import { quoteItems, quotes, recurringInvoiceRuns, recurringInvoices, type RecurringItem } from "@db/quotesSchema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { contextHas, getPlanContext, requireFeature, type PlanUser } from "./lib/planAccess";
import { isoDate } from "./lib/security";
import type { Lang } from "./lib/i18n";
import {
  FREQUENCIES, MANUAL_QUOTE_STATUSES, MAX_ITEMS, MAX_LINE_CENTS, MAX_QUANTITY, MAX_UNIT_PRICE, PAYMENT_METHODS, QUOTE_STATUSES,
  addDays, canConvertQuote, canDeleteQuote, canEditQuote, canSetQuoteStatus, centsToDecimal, duePeriods, firstPeriodOnOrAfter,
  isValidIsoDate, lineTotalCents, quoteNumber, quoteTotals, scheduleFinished, toCents, todayInTimeZone,
  type Frequency, type PaymentMethod, type QuoteStatus,
} from "./lib/quotes";

type Db = ReturnType<typeof getDb>;

// ── Messages (Spanish and English) ──

const es = {
  quoteNotFound: "No encontramos esa cotización.",
  recurringNotFound: "No encontramos esa factura recurrente.",
  customerNotFound: "Cliente no encontrado.",
  serviceNotFound: "Servicio no encontrado.",
  quoteConverted: "Esta cotización ya se convirtió en venta y no se puede cambiar.",
  cannotConvert: "Una cotización rechazada no se convierte en venta. Vuelve a abrirla primero.",
  badDate: "La fecha no es válida.",
  pastStart: "La primera factura no puede ser antes de hoy.",
  farStart: "La primera factura tiene que ser dentro de los próximos 2 años.",
  endBeforeStart: "La fecha final no puede ser antes de la primera factura.",
  lineTooBig: "Una línea pasa del máximo permitido ($99,999,999.99).",
  zeroTotal: "El total tiene que ser mayor que $0.",
  saleNotFound: "No encontramos esa venta por cobrar.",
  saleNotPending: "Esa venta ya está cobrada o anulada.",
  saleFailed: "No pudimos crear la venta. Inténtalo de nuevo.",
  finished: "Esta factura recurrente ya terminó. Cambia la fecha final para seguir facturando.",
};
type MsgKey = keyof typeof es;
const en: Record<MsgKey, string> = {
  quoteNotFound: "We couldn't find that quote.",
  recurringNotFound: "We couldn't find that recurring invoice.",
  customerNotFound: "Customer not found.",
  serviceNotFound: "Service not found.",
  quoteConverted: "This quote was already turned into a sale and can't be changed.",
  cannotConvert: "A rejected quote can't become a sale. Reopen it first.",
  badDate: "That date isn't valid.",
  pastStart: "The first invoice can't be before today.",
  farStart: "The first invoice has to be within the next 2 years.",
  endBeforeStart: "The end date can't be before the first invoice.",
  lineTooBig: "A line is over the maximum allowed ($99,999,999.99).",
  zeroTotal: "The total has to be more than $0.",
  saleNotFound: "We couldn't find that sale to collect.",
  saleNotPending: "That sale was already collected or voided.",
  saleFailed: "We couldn't create the sale. Please try again.",
  finished: "This recurring invoice has ended. Change the end date to keep invoicing.",
};
const MESSAGES: Record<Lang, Record<MsgKey, string>> = { es, en };

function fail(code: TRPCError["code"], lang: Lang, key: MsgKey): never {
  throw new TRPCError({ code, message: MESSAGES[lang][key] });
}

// ── Tables (created on first use, in step with db/quotesSchema.ts) ──

let tablesReady: Promise<void> | null = null;

export function ensureQuotesTables(db: Db): Promise<void> {
  tablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS quotes (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        seq INT NOT NULL,
        number VARCHAR(30) NOT NULL,
        customerId BIGINT UNSIGNED NULL,
        customerName VARCHAR(255) NULL,
        status ENUM('draft', 'sent', 'accepted', 'rejected', 'converted') NOT NULL DEFAULT 'draft',
        validUntil DATE NULL,
        notes TEXT NULL,
        subtotal DECIMAL(12,2) NOT NULL,
        discount DECIMAL(12,2) NOT NULL DEFAULT 0,
        total DECIMAL(12,2) NOT NULL,
        saleId BIGINT UNSIGNED NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        updatedAt TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE INDEX quotes_userId_seq_idx (userId, seq),
        INDEX quotes_userId_status_idx (userId, status),
        INDEX quotes_saleId_idx (saleId)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS quoteItems (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        quoteId BIGINT UNSIGNED NOT NULL,
        serviceId BIGINT UNSIGNED NULL,
        description VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        unitPrice DECIMAL(10,2) NOT NULL,
        position INT NOT NULL DEFAULT 0,
        INDEX quoteItems_quoteId_idx (quoteId)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recurringInvoices (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        customerId BIGINT UNSIGNED NULL,
        customerName VARCHAR(255) NULL,
        items JSON NOT NULL,
        total DECIMAL(12,2) NOT NULL,
        frequency ENUM('weekly', 'monthly', 'quarterly', 'yearly') NOT NULL,
        startDate DATE NOT NULL,
        nextDate DATE NOT NULL,
        endDate DATE NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT NULL,
        lastRunAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        updatedAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX recurringInvoices_userId_idx (userId),
        INDEX recurringInvoices_active_nextDate_idx (active, nextDate)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recurringInvoiceRuns (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        recurringId BIGINT UNSIGNED NOT NULL,
        userId BIGINT UNSIGNED NOT NULL,
        periodDate DATE NOT NULL,
        saleId BIGINT UNSIGNED NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE INDEX recurringInvoiceRuns_period_idx (recurringId, periodDate),
        INDEX recurringInvoiceRuns_userId_idx (userId),
        INDEX recurringInvoiceRuns_saleId_idx (saleId)
      )
    `);
  })().catch((e: unknown) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

/** True when the error (or one it wraps) says a table doesn't exist yet. */
function isNoSuchTable(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const err = cur as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (err.code === "ER_NO_SUCH_TABLE" || err.errno === 1146) return true;
    if (typeof err.message === "string" && /doesn't exist/i.test(err.message)) return true;
    cur = err.cause;
  }
  return false;
}

/**
 * Deletes a user's quotes, quote lines, recurring invoices and their run log (used when an
 * account is deleted). The sales they created are ordinary sales and are left to whoever deletes those.
 */
export async function deleteUserQuotesData(db: Db, userId: number): Promise<void> {
  try {
    await db.transaction(async (tx: Db) => {
      await tx.delete(quoteItems).where(inArray(quoteItems.quoteId, tx.select({ id: quotes.id }).from(quotes).where(eq(quotes.userId, userId))));
      await tx.delete(quotes).where(eq(quotes.userId, userId));
      await tx.delete(recurringInvoiceRuns).where(eq(recurringInvoiceRuns.userId, userId));
      await tx.delete(recurringInvoices).where(eq(recurringInvoices.userId, userId));
    });
  } catch (e: unknown) {
    // The tables don't exist until someone uses Cotizaciones: nothing to delete then.
    if (!isNoSuchTable(e)) throw e;
  }
}

// ── Small database helpers (the drizzle db is untyped: rows are annotated by hand) ──

type ResultHeader = { insertId?: number | string; affectedRows?: number };

function resultHeader(res: unknown): ResultHeader {
  const head: unknown = Array.isArray(res) ? res[0] : res;
  return head && typeof head === "object" ? (head as ResultHeader) : {};
}
const insertIdOf = (res: unknown): number => Number(resultHeader(res).insertId ?? 0);
const affectedRowsOf = (res: unknown): number => Number(resultHeader(res).affectedRows ?? 0);

/** A unique-index clash (MySQL 1062), also when drizzle wraps the driver's error. */
function isDuplicateKey(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const err = cur as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) return true;
    if (typeof err.message === "string" && /Duplicate entry/i.test(err.message)) return true;
    cur = err.cause;
  }
  return false;
}

const isId = (v: number | null | undefined): v is number => typeof v === "number" && v > 0;

/** The calendar dates "invoice number" and "journal entry number" use, exactly as api/sales-router.ts does. */
function saleClock(now: Date) {
  return {
    dateStr: now.toISOString().slice(0, 10).replace(/-/g, ""),
    dayIso: now.toISOString().split("T")[0],
    todayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  };
}

// ── Input shapes ──

const day = isoDate.refine(isValidIsoDate, { message: "Invalid date" });
const id = z.number().int().positive();

const itemInput = z.object({
  serviceId: id.nullable().optional(),
  description: z.string().trim().min(1).max(255),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  unitPrice: z.number().finite().min(0).max(MAX_UNIT_PRICE),
});
type ItemInput = z.infer<typeof itemInput>;

const customerInput = {
  customerId: id.nullable().optional(),
  customerName: z.string().trim().max(255).nullable().optional(),
};

const quoteInput = z.object({
  ...customerInput,
  items: z.array(itemInput).min(1).max(MAX_ITEMS),
  discount: z.number().finite().min(0).max(100_000_000).default(0),
  validUntil: day.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const recurringFields = {
  ...customerInput,
  items: z.array(itemInput).min(1).max(MAX_ITEMS),
  frequency: z.enum(FREQUENCIES),
  endDate: day.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
};

// ── Shared checks ──

function checkLines(items: readonly ItemInput[], lang: Lang): void {
  for (const it of items) if (lineTotalCents(it) > MAX_LINE_CENTS) fail("BAD_REQUEST", lang, "lineTooBig");
}

async function ownServiceIds(db: Db, userId: number, ids: readonly number[]): Promise<Set<number>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const rows: Array<{ id: number }> = await db.select({ id: services.id }).from(services)
    .where(and(inArray(services.id, unique), eq(services.userId, userId)));
  return new Set(rows.map((r) => Number(r.id)));
}

/** Every catalog service on the lines must be this user's (same tenant check as sales). */
async function assertOwnServices(db: Db, userId: number, items: readonly ItemInput[], lang: Lang): Promise<void> {
  const ids = [...new Set(items.map((i) => i.serviceId).filter(isId))];
  if ((await ownServiceIds(db, userId, ids)).size !== ids.length) fail("NOT_FOUND", lang, "serviceNotFound");
}

/** The customer must be this user's; with no name typed, the customer's own name is used. */
async function resolveCustomer(
  db: Db, userId: number, input: { customerId?: number | null; customerName?: string | null }, lang: Lang,
): Promise<{ customerId: number | null; customerName: string | null }> {
  const typed = input.customerName?.trim() || null;
  if (!input.customerId) return { customerId: null, customerName: typed };
  const c: { name: string; lastName: string | null } | undefined = (await db.select({ name: customers.name, lastName: customers.lastName })
    .from(customers).where(and(eq(customers.id, input.customerId), eq(customers.userId, userId))).limit(1))[0];
  if (!c) fail("NOT_FOUND", lang, "customerNotFound");
  return { customerId: input.customerId, customerName: typed ?? `${c.name} ${c.lastName ?? ""}`.trim() };
}

/** The customer id when it still exists for this user (a deleted customer keeps only the name). */
async function existingCustomerId(db: Db, userId: number, customerId: number | null): Promise<number | null> {
  if (!customerId) return null;
  const rows: Array<{ id: number }> = await db.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.userId, userId))).limit(1);
  return rows.length > 0 ? customerId : null;
}

// ── Creating sales ──

/** A line of a sale about to be created. unitPrice is a decimal string. */
type SaleLine = { serviceId: number | null; description: string; quantity: number; unitPrice: string };

/** Lines whose catalog service was deleted since become free-text lines (the sale keeps the description). */
async function saleLinesFor(db: Db, userId: number, lines: readonly SaleLine[]): Promise<SaleLine[]> {
  const own = await ownServiceIds(db, userId, lines.map((l) => l.serviceId).filter(isId));
  return lines.map((l) => ({ ...l, serviceId: l.serviceId && own.has(l.serviceId) ? l.serviceId : null }));
}

/** Same placeholder service api/sales-router.ts uses for free-text lines (sale lines need a service). */
const CUSTOM_SERVICE_NAME = "Cargo personalizado";

async function customServiceId(db: Db, userId: number): Promise<number> {
  const existing: Array<{ id: number }> = await db.select({ id: services.id }).from(services)
    .where(and(eq(services.userId, userId), eq(services.name, CUSTOM_SERVICE_NAME))).limit(1);
  if (existing[0]) return Number(existing[0].id);
  const res = await db.execute(sql`
    INSERT INTO services (userId, name, description, price, cost, isActive)
    VALUES (${userId}, ${CUSTOM_SERVICE_NAME}, ${""}, ${"0"}, ${"0"}, ${1})
  `);
  return insertIdOf(res);
}

type NewSale = {
  customerId: number | null;
  customerName: string | null;
  lines: readonly SaleLine[];
  subtotal: string;
  discount: string;
  total: string;
  notes: string;
};

/** Numbers tried before giving up (each clash moves one up). */
const MAX_NUMBER_TRIES = 50;

/**
 * First number to try for today's "PREFIX-YYYYMMDD-NNNN": one past both the day's row count (how
 * api/sales-router.ts numbers) and the highest number already used with this prefix. Counting
 * alone collides after a row of today is deleted or when two are created at once, so callers
 * also retry upward on a duplicate (the unique index has the last word).
 */
async function firstDailyNumber(
  db: Db, table: MySqlTable, numberCol: AnyMySqlColumn, createdAtCol: AnyMySqlColumn, prefix: string, todayStart: Date,
): Promise<number> {
  const counted: Array<{ n: number }> = await db.select({ n: sql<number>`count(*)` }).from(table).where(gte(createdAtCol, todayStart));
  const highest: Array<{ n: number | null }> = await db.select({
    n: sql<number | null>`MAX(CAST(SUBSTRING(${numberCol}, ${prefix.length + 1}) AS UNSIGNED))`,
  }).from(table).where(like(numberCol, `${prefix}%`));
  return Math.max(Number(counted[0]?.n ?? 0), Number(highest[0]?.n ?? 0)) + 1;
}

const dailyNumber = (prefix: string, n: number) => `${prefix}${String(n).padStart(4, "0")}`;

/**
 * Creates a sale like api/sales-router.ts does (FAC-YYYYMMDD-NNNN number, lines, the
 * "Cargo personalizado" service for free-text lines, and when paid its payment record and
 * journal entry), but with numbers that can't collide and all-or-nothing: call it inside a
 * transaction. Not paid yet (payment null): status "pending" with no payment and no journal
 * entry, since the app only books completed sales (reports, the dashboard and the accounting
 * rebuild skip pending ones); paymentMethod is a placeholder until it's collected.
 */
async function createSale(db: Db, userId: number, s: NewSale, payment: PaymentMethod | null): Promise<{ id: number; invoiceNumber: string }> {
  const { dateStr, todayStart } = saleClock(new Date());
  const prefix = `FAC-${dateStr}-`;
  const first = await firstDailyNumber(db, sales, sales.invoiceNumber, sales.createdAt, prefix, todayStart);

  let saleId = 0;
  let invoiceNumber = "";
  for (let attempt = 0; attempt < MAX_NUMBER_TRIES && saleId === 0; attempt++) {
    invoiceNumber = dailyNumber(prefix, first + attempt);
    try {
      const res = await db.insert(sales).values({
        invoiceNumber,
        customerId: s.customerId,
        customerName: s.customerName,
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
        paymentMethod: payment ?? "cash",
        status: payment ? "completed" : "pending",
        notes: s.notes,
        createdBy: userId,
      });
      saleId = insertIdOf(res);
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
    }
  }
  if (saleId === 0) throw new Error("No free invoice number");

  let customId: number | null = null;
  for (const line of s.lines) {
    let serviceId = line.serviceId;
    if (!serviceId) serviceId = customId ??= await customServiceId(db, userId);
    await db.insert(saleServices).values({
      saleId,
      serviceId,
      serviceName: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: centsToDecimal(lineTotalCents(line)),
    });
  }

  if (payment) {
    await db.insert(paymentRecords).values({ saleId, method: payment, amount: s.total });
    await postSaleJournal(db, userId, { id: saleId, invoiceNumber, total: s.total }, payment);
  }
  return { id: saleId, invoiceNumber };
}

/** Chart-of-accounts code each payment method lands in (same as sales and the accounting rebuild). */
const ASSET_ACCOUNT: Record<PaymentMethod, string> = { cash: "1110", zelle: "1130", card: "1150" };
const REVENUE_ACCOUNT = "4100";

/**
 * Books a paid sale like api/sales-router.ts does for a POS sale (ASI-YYYYMMDD-NNNN entry, debit
 * the payment method's account, credit revenue), crediting the total so the entry balances when
 * there's a discount, and with a number that can't collide. Without a chart of accounts it books
 * nothing: the accounting rebuild adds the entry later (it books completed sales that have none).
 */
async function postSaleJournal(db: Db, userId: number, sale: { id: number; invoiceNumber: string; total: string }, method: PaymentMethod): Promise<void> {
  const accs: Array<{ id: number; code: string }> = await db.select({ id: accounts.id, code: accounts.code }).from(accounts)
    .where(and(eq(accounts.userId, userId), inArray(accounts.code, [ASSET_ACCOUNT[method], REVENUE_ACCOUNT])));
  const asset = accs.find((a) => a.code === ASSET_ACCOUNT[method]);
  const revenue = accs.find((a) => a.code === REVENUE_ACCOUNT);
  if (!asset || !revenue) return;

  const { dateStr, dayIso, todayStart } = saleClock(new Date());
  const prefix = `ASI-${dateStr}-`;
  const first = await firstDailyNumber(db, journalEntries, journalEntries.entryNumber, journalEntries.createdAt, prefix, todayStart);

  let jeId = 0;
  for (let attempt = 0; attempt < MAX_NUMBER_TRIES && jeId === 0; attempt++) {
    try {
      const res = await db.insert(journalEntries).values({
        entryNumber: dailyNumber(prefix, first + attempt),
        date: new Date(dayIso),
        description: `Venta ${sale.invoiceNumber}`,
        reference: sale.invoiceNumber,
        referenceId: sale.id,
        referenceType: "sale",
        debitTotal: sale.total,
        creditTotal: sale.total,
        createdBy: userId,
      });
      jeId = insertIdOf(res);
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
    }
  }
  if (jeId === 0) throw new Error("No free journal entry number");
  await db.insert(journalEntryLines).values([
    { journalEntryId: jeId, accountId: asset.id, debit: sale.total, credit: "0", description: `Pago ${method}` },
    { journalEntryId: jeId, accountId: revenue.id, debit: "0", credit: sale.total, description: "Venta servicio" },
  ]);
}

// ── Quotes ──

type QuoteRow = {
  id: number;
  number: string;
  customerId: number | null;
  customerName: string | null;
  status: QuoteStatus;
  validUntil: string | null;
  notes: string | null;
  subtotal: string;
  discount: string;
  total: string;
  saleId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const quoteCols = {
  id: quotes.id,
  number: quotes.number,
  customerId: quotes.customerId,
  customerName: quotes.customerName,
  status: quotes.status,
  validUntil: sql<string | null>`DATE_FORMAT(${quotes.validUntil}, '%Y-%m-%d')`,
  notes: quotes.notes,
  subtotal: quotes.subtotal,
  discount: quotes.discount,
  total: quotes.total,
  saleId: quotes.saleId,
  createdAt: quotes.createdAt,
  updatedAt: quotes.updatedAt,
};

type QuoteItemRow = { id: number; serviceId: number | null; description: string; quantity: number; unitPrice: string };

type SaleStatus = "completed" | "pending" | "cancelled" | "refunded";
type LinkedSale = { invoiceNumber: string | null; saleStatus: SaleStatus | null };

function quoteOut(q: QuoteRow, sale: LinkedSale) {
  return {
    id: Number(q.id),
    number: q.number,
    customerId: q.customerId === null ? null : Number(q.customerId),
    customerName: q.customerName,
    status: q.status,
    validUntil: q.validUntil,
    notes: q.notes,
    subtotal: Number(q.subtotal),
    discount: Number(q.discount),
    total: Number(q.total),
    saleId: q.saleId === null ? null : Number(q.saleId),
    invoiceNumber: sale.invoiceNumber,
    saleStatus: sale.saleStatus,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

async function loadQuote(db: Db, userId: number, quoteId: number, lang: Lang, lock = false): Promise<QuoteRow> {
  const query = db.select(quoteCols).from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId))).limit(1);
  const row: QuoteRow | undefined = (await (lock ? query.for("update") : query))[0];
  if (!row) fail("NOT_FOUND", lang, "quoteNotFound");
  return row;
}

async function loadQuoteItems(db: Db, quoteId: number): Promise<QuoteItemRow[]> {
  return db.select({
    id: quoteItems.id, serviceId: quoteItems.serviceId, description: quoteItems.description,
    quantity: quoteItems.quantity, unitPrice: quoteItems.unitPrice,
  }).from(quoteItems).where(eq(quoteItems.quoteId, quoteId)).orderBy(asc(quoteItems.position), asc(quoteItems.id));
}

async function linkedSale(db: Db, userId: number, saleId: number | null): Promise<LinkedSale> {
  if (!saleId) return { invoiceNumber: null, saleStatus: null };
  const s: { invoiceNumber: string; status: SaleStatus } | undefined = (await db.select({ invoiceNumber: sales.invoiceNumber, status: sales.status })
    .from(sales).where(and(eq(sales.id, saleId), eq(sales.createdBy, userId))).limit(1))[0];
  return { invoiceNumber: s?.invoiceNumber ?? null, saleStatus: s?.status ?? null };
}

async function insertQuoteItems(db: Db, quoteId: number, items: readonly ItemInput[]): Promise<void> {
  await db.insert(quoteItems).values(items.map((it, position) => ({
    quoteId,
    serviceId: it.serviceId ?? null,
    description: it.description,
    quantity: it.quantity,
    unitPrice: centsToDecimal(toCents(it.unitPrice)),
    position,
  })));
}

type QuoteValues = {
  customerId: number | null;
  customerName: string | null;
  validUntil: string | null;
  notes: string | null;
  subtotal: string;
  discount: string;
  total: string;
};

/** Inserts a quote with the user's next number; two at once can't share one (unique index, retry). */
async function insertNumberedQuote(db: Db, userId: number, values: QuoteValues): Promise<{ id: number; number: string }> {
  const maxRows: Array<{ seq: number | null }> = await db.select({ seq: sql<number | null>`MAX(${quotes.seq})` }).from(quotes)
    .where(eq(quotes.userId, userId));
  const base = Number(maxRows[0]?.seq ?? 0) + 1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const seq = base + attempt;
    const number = quoteNumber(seq);
    try {
      const res = await db.insert(quotes).values({ ...values, userId, seq, number, status: "draft" });
      return { id: insertIdOf(res), number };
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
    }
  }
  throw new Error("No free quote number");
}

/** Validates a quote's input and works out its stored values (totals computed here, never trusted from the client). */
async function quoteValues(db: Db, userId: number, input: z.infer<typeof quoteInput>, lang: Lang): Promise<QuoteValues> {
  checkLines(input.items, lang);
  await assertOwnServices(db, userId, input.items, lang);
  const customer = await resolveCustomer(db, userId, input, lang);
  const totals = quoteTotals(input.items, input.discount);
  return {
    ...customer,
    validUntil: input.validUntil ?? null,
    notes: input.notes?.trim() || null,
    subtotal: centsToDecimal(totals.subtotalCents),
    discount: centsToDecimal(totals.discountCents),
    total: centsToDecimal(totals.totalCents),
  };
}

// ── Recurring invoices ──

type RecurringRow = {
  id: number;
  userId: number;
  customerId: number | null;
  customerName: string | null;
  items: unknown;
  total: string;
  frequency: Frequency;
  startDate: string;
  nextDate: string;
  endDate: string | null;
  active: boolean;
  notes: string | null;
  lastRunAt: Date | null;
  createdAt: Date;
};

const recurringCols = {
  id: recurringInvoices.id,
  userId: recurringInvoices.userId,
  customerId: recurringInvoices.customerId,
  customerName: recurringInvoices.customerName,
  items: recurringInvoices.items,
  total: recurringInvoices.total,
  frequency: recurringInvoices.frequency,
  startDate: sql<string>`DATE_FORMAT(${recurringInvoices.startDate}, '%Y-%m-%d')`,
  nextDate: sql<string>`DATE_FORMAT(${recurringInvoices.nextDate}, '%Y-%m-%d')`,
  endDate: sql<string | null>`DATE_FORMAT(${recurringInvoices.endDate}, '%Y-%m-%d')`,
  active: recurringInvoices.active,
  notes: recurringInvoices.notes,
  lastRunAt: recurringInvoices.lastRunAt,
  createdAt: recurringInvoices.createdAt,
};

/** The stored JSON lines, tolerating a driver that hands back the raw string. */
function parseItems(raw: unknown): RecurringItem[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): RecurringItem[] => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    const quantity = Number(o.quantity);
    if (typeof o.description !== "string" || !Number.isInteger(quantity) || quantity < 1) return [];
    const serviceId = Number(o.serviceId);
    return [{
      serviceId: Number.isInteger(serviceId) && serviceId > 0 ? serviceId : null,
      description: o.description,
      quantity,
      unitPrice: centsToDecimal(toCents(typeof o.unitPrice === "number" || typeof o.unitPrice === "string" ? o.unitPrice : 0)),
    }];
  });
}

function toRecurringItems(items: readonly ItemInput[]): RecurringItem[] {
  return items.map((it) => ({
    serviceId: it.serviceId ?? null,
    description: it.description,
    quantity: it.quantity,
    unitPrice: centsToDecimal(toCents(it.unitPrice)),
  }));
}

function recurringOut(r: RecurringRow, invoiced: number) {
  return {
    id: Number(r.id),
    customerId: r.customerId === null ? null : Number(r.customerId),
    customerName: r.customerName,
    items: parseItems(r.items).map((it) => ({ ...it, unitPrice: Number(it.unitPrice) })),
    total: Number(r.total),
    frequency: r.frequency,
    startDate: r.startDate,
    nextDate: r.nextDate,
    endDate: r.endDate,
    active: Boolean(r.active),
    finished: scheduleFinished(r),
    notes: r.notes,
    lastRunAt: r.lastRunAt,
    createdAt: r.createdAt,
    invoiced,
  };
}

async function loadRecurring(db: Db, userId: number, recurringId: number, lang: Lang, lock = false): Promise<RecurringRow> {
  const query = db.select(recurringCols).from(recurringInvoices)
    .where(and(eq(recurringInvoices.id, recurringId), eq(recurringInvoices.userId, userId))).limit(1);
  const row: RecurringRow | undefined = (await (lock ? query.for("update") : query))[0];
  if (!row) fail("NOT_FOUND", lang, "recurringNotFound");
  return row;
}

/** Recurring invoices that have a period due by `today` (active, not past their end date). */
function dueFilter(today: string, userId?: number) {
  return and(
    eq(recurringInvoices.active, true),
    sql`${recurringInvoices.nextDate} <= ${today}`,
    sql`(${recurringInvoices.endDate} IS NULL OR ${recurringInvoices.nextDate} <= ${recurringInvoices.endDate})`,
    userId === undefined ? undefined : eq(recurringInvoices.userId, userId),
  );
}

/**
 * Creates the pending sales of one recurring invoice's due periods, all in one transaction:
 * the row is locked (two runs at once wait for each other and the second finds nothing due),
 * each period is recorded in recurringInvoiceRuns (unique per period: never invoiced twice),
 * and the next date moves on only together with the sales it stands for.
 */
async function runRecurringInvoice(db: Db, recurringId: number, userId: number, today: string): Promise<number> {
  return db.transaction(async (tx: Db): Promise<number> => {
    const rows: RecurringRow[] = await tx.select(recurringCols).from(recurringInvoices)
      .where(and(eq(recurringInvoices.id, recurringId), eq(recurringInvoices.userId, userId))).limit(1).for("update");
    const row = rows[0];
    if (!row || !row.active) return 0;
    const due = duePeriods({ startDate: row.startDate, nextDate: row.nextDate, frequency: row.frequency, endDate: row.endDate }, today);
    if (due.dates.length === 0) return 0;

    const lines = await saleLinesFor(tx, userId, parseItems(row.items));
    if (lines.length === 0) return 0;
    const totals = quoteTotals(lines);
    const customerId = await existingCustomerId(tx, userId, row.customerId);
    let created = 0;
    for (const period of due.dates) {
      const done: Array<{ id: number }> = await tx.select({ id: recurringInvoiceRuns.id }).from(recurringInvoiceRuns)
        .where(and(eq(recurringInvoiceRuns.recurringId, recurringId), sql`${recurringInvoiceRuns.periodDate} = ${period}`)).limit(1);
      if (done.length > 0) continue; // invoiced before (the date was moved back): never twice
      const label = `Factura recurrente del ${period}`;
      const sale = await createSale(tx, userId, {
        customerId,
        customerName: row.customerName,
        lines,
        subtotal: centsToDecimal(totals.subtotalCents),
        discount: "0.00",
        total: centsToDecimal(totals.totalCents),
        notes: row.notes ? `${label} · ${row.notes}` : label,
      }, null);
      await tx.insert(recurringInvoiceRuns).values({ recurringId, userId, periodDate: period, saleId: sale.id });
      created++;
    }
    await tx.update(recurringInvoices).set({ nextDate: due.next, lastRunAt: new Date() }).where(eq(recurringInvoices.id, recurringId));
    return created;
  });
}

/** Runs one recurring invoice, logging instead of failing (the caller's own change already succeeded). */
async function runRecurringQuietly(db: Db, recurringId: number, userId: number, today: string): Promise<number> {
  try {
    return await runRecurringInvoice(db, recurringId, userId, today);
  } catch (e) {
    console.error(`[quotes] recurring invoice ${recurringId} failed:`, e);
    return 0;
  }
}

/** Recurring invoices are a business feature: check the business plan even while the owner is in personal mode. */
async function userHasQuotes(db: Db, userId: number): Promise<boolean> {
  const user: PlanUser | undefined = (await db.select({ id: users.id, role: users.role, createdAt: users.createdAt })
    .from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return false;
  return contextHas(await getPlanContext(db, { ...user, modePreference: "business" }), "quotes");
}

/**
 * Creates the sales of every recurring invoice that is due today (US Central time), for all
 * users whose plan includes quotes. Safe to call often and from several places at once: each
 * period is invoiced exactly once. A period catch-up is capped per run; the rest goes next run.
 */
export async function runRecurringInvoices(db: Db, now: Date = new Date()): Promise<{ created: number }> {
  await ensureQuotesTables(db);
  const today = todayInTimeZone(now);
  const due: Array<{ id: number; userId: number }> = await db.select({ id: recurringInvoices.id, userId: recurringInvoices.userId })
    .from(recurringInvoices).where(dueFilter(today))
    .orderBy(asc(recurringInvoices.userId), asc(recurringInvoices.id)).limit(5000);
  const allowed = new Map<number, boolean>();
  let created = 0;
  for (const r of due) {
    const userId = Number(r.userId);
    let ok = allowed.get(userId);
    if (ok === undefined) {
      ok = await userHasQuotes(db, userId).catch((e: unknown) => {
        console.error(`[quotes] plan check for user ${userId} failed:`, e);
        return false;
      });
      allowed.set(userId, ok);
    }
    if (ok) created += await runRecurringQuietly(db, Number(r.id), userId, today);
  }
  return { created };
}

/** Checks a recurring invoice's dates. `start` is the first (or next) invoice date. */
function checkSchedule(start: string, endDate: string | null, today: string, lang: Lang): void {
  if (start < addDays(today, -1)) fail("BAD_REQUEST", lang, "pastStart"); // a day of slack for the client's timezone
  if (start > addDays(today, 731)) fail("BAD_REQUEST", lang, "farStart");
  if (endDate !== null && endDate < start) fail("BAD_REQUEST", lang, "endBeforeStart");
}

// ── Procedures ──

/** Every procedure: the plan must include quotes, and the tables must exist. */
async function setup(ctx: { user: PlanUser; lang: Lang }): Promise<{ db: Db; userId: number }> {
  const db = getDb();
  await requireFeature(db, ctx.user, "quotes", ctx.lang);
  await ensureQuotesTables(db);
  return { db, userId: Number(ctx.user.id) };
}

const recurringRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const { db, userId } = await setup(ctx);
    const rows: RecurringRow[] = await db.select(recurringCols).from(recurringInvoices)
      .where(eq(recurringInvoices.userId, userId))
      .orderBy(desc(recurringInvoices.active), asc(recurringInvoices.nextDate), asc(recurringInvoices.id)).limit(500);
    const counts: Array<{ recurringId: number; n: number }> = await db.select({
      recurringId: recurringInvoiceRuns.recurringId, n: sql<number>`count(*)`,
    }).from(recurringInvoiceRuns).where(eq(recurringInvoiceRuns.userId, userId)).groupBy(recurringInvoiceRuns.recurringId);
    const byId = new Map(counts.map((c) => [Number(c.recurringId), Number(c.n)]));
    return rows.map((r) => recurringOut(r, byId.get(Number(r.id)) ?? 0));
  }),

  create: authedQuery
    .input(z.object({ ...recurringFields, startDate: day }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      const today = todayInTimeZone(new Date());
      checkSchedule(input.startDate, input.endDate ?? null, today, ctx.lang);
      checkLines(input.items, ctx.lang);
      const totals = quoteTotals(input.items);
      if (totals.totalCents <= 0) fail("BAD_REQUEST", ctx.lang, "zeroTotal");
      await assertOwnServices(db, userId, input.items, ctx.lang);
      const customer = await resolveCustomer(db, userId, input, ctx.lang);
      const res = await db.insert(recurringInvoices).values({
        userId,
        ...customer,
        items: toRecurringItems(input.items),
        total: centsToDecimal(totals.totalCents),
        frequency: input.frequency,
        startDate: input.startDate,
        nextDate: input.startDate,
        endDate: input.endDate ?? null,
        active: true,
        notes: input.notes?.trim() || null,
      });
      const recurringId = insertIdOf(res);
      // Starting today: the first sale is created right away.
      const created = input.startDate <= today ? await runRecurringQuietly(db, recurringId, userId, today) : 0;
      return { id: recurringId, created };
    }),

  /** `nextDate` is the next invoice; changing it or the frequency starts the schedule again from that date. */
  update: authedQuery
    .input(z.object({ ...recurringFields, id, nextDate: day }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      const today = todayInTimeZone(new Date());
      checkLines(input.items, ctx.lang);
      const totals = quoteTotals(input.items);
      if (totals.totalCents <= 0) fail("BAD_REQUEST", ctx.lang, "zeroTotal");
      await assertOwnServices(db, userId, input.items, ctx.lang);
      const customer = await resolveCustomer(db, userId, input, ctx.lang);
      const active = await db.transaction(async (tx: Db): Promise<boolean> => {
        const row = await loadRecurring(tx, userId, input.id, ctx.lang, true);
        const rescheduled = input.nextDate !== row.nextDate || input.frequency !== row.frequency;
        const endDate = input.endDate ?? null;
        if (rescheduled) checkSchedule(input.nextDate, endDate, today, ctx.lang);
        else if (endDate !== null && endDate < row.startDate) fail("BAD_REQUEST", ctx.lang, "endBeforeStart");
        await tx.update(recurringInvoices).set({
          ...customer,
          items: toRecurringItems(input.items),
          total: centsToDecimal(totals.totalCents),
          frequency: input.frequency,
          endDate,
          notes: input.notes?.trim() || null,
          ...(rescheduled ? { startDate: input.nextDate, nextDate: input.nextDate } : {}),
        }).where(eq(recurringInvoices.id, row.id));
        return Boolean(row.active);
      });
      const created = active ? await runRecurringQuietly(db, input.id, userId, today) : 0;
      return { id: input.id, created };
    }),

  pause: authedQuery.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const res = await db.update(recurringInvoices).set({ active: false })
      .where(and(eq(recurringInvoices.id, input.id), eq(recurringInvoices.userId, userId)));
    if (affectedRowsOf(res) === 0) fail("NOT_FOUND", ctx.lang, "recurringNotFound");
    return { id: input.id };
  }),

  /** Periods that passed while paused are skipped, not invoiced late. */
  resume: authedQuery.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const today = todayInTimeZone(new Date());
    await db.transaction(async (tx: Db) => {
      const row = await loadRecurring(tx, userId, input.id, ctx.lang, true);
      if (scheduleFinished(row)) fail("BAD_REQUEST", ctx.lang, "finished");
      const nextDate = row.active ? row.nextDate : firstPeriodOnOrAfter(row, today);
      await tx.update(recurringInvoices).set({ active: true, nextDate }).where(eq(recurringInvoices.id, row.id));
    });
    const created = await runRecurringQuietly(db, input.id, userId, today);
    return { id: input.id, created };
  }),

  /** The sales it already created stay (they're the user's sales). */
  delete: authedQuery.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const res = await db.delete(recurringInvoices).where(and(eq(recurringInvoices.id, input.id), eq(recurringInvoices.userId, userId)));
    if (affectedRowsOf(res) === 0) fail("NOT_FOUND", ctx.lang, "recurringNotFound");
    return { id: input.id };
  }),

  /** Creates this user's sales that are due now (the server timer does it for everyone too). */
  runDue: authedQuery.mutation(async ({ ctx }) => {
    const { db, userId } = await setup(ctx);
    const today = todayInTimeZone(new Date());
    const due: Array<{ id: number }> = await db.select({ id: recurringInvoices.id }).from(recurringInvoices)
      .where(dueFilter(today, userId)).orderBy(asc(recurringInvoices.id)).limit(500);
    let created = 0;
    for (const r of due) created += await runRecurringQuietly(db, Number(r.id), userId, today);
    return { created };
  }),
});

/** A pending sale this feature created (from a quote or a recurring invoice), for collecting or voiding it. */
async function loadOwnPendingSale(db: Db, userId: number, saleId: number, lang: Lang): Promise<{ id: number; invoiceNumber: string; total: string; status: SaleStatus }> {
  const rows: Array<{ id: number; invoiceNumber: string; total: string; status: SaleStatus }> = await db.select({
    id: sales.id, invoiceNumber: sales.invoiceNumber, total: sales.total, status: sales.status,
  }).from(sales)
    .leftJoin(quotes, and(eq(quotes.saleId, sales.id), eq(quotes.userId, userId)))
    .leftJoin(recurringInvoiceRuns, and(eq(recurringInvoiceRuns.saleId, sales.id), eq(recurringInvoiceRuns.userId, userId)))
    .where(and(eq(sales.id, saleId), eq(sales.createdBy, userId), sql`(${quotes.id} IS NOT NULL OR ${recurringInvoiceRuns.id} IS NOT NULL)`))
    .limit(1);
  const sale = rows[0];
  if (!sale) fail("NOT_FOUND", lang, "saleNotFound");
  if (sale.status !== "pending") fail("CONFLICT", lang, "saleNotPending");
  return { ...sale, id: Number(sale.id) };
}

export const quotesRouter = createRouter({
  list: authedQuery
    .input(z.object({ status: z.enum(QUOTE_STATUSES).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      const rows: Array<QuoteRow & LinkedSale> = await db.select({ ...quoteCols, invoiceNumber: sales.invoiceNumber, saleStatus: sales.status })
        .from(quotes)
        .leftJoin(sales, and(eq(sales.id, quotes.saleId), eq(sales.createdBy, userId)))
        .where(and(eq(quotes.userId, userId), input?.status ? eq(quotes.status, input.status) : undefined))
        .orderBy(desc(quotes.createdAt), desc(quotes.id)).limit(300);
      const ids = rows.map((r) => Number(r.id));
      const itemCounts: Array<{ quoteId: number; n: number }> = ids.length === 0 ? [] : await db.select({
        quoteId: quoteItems.quoteId, n: sql<number>`count(*)`,
      }).from(quoteItems).where(inArray(quoteItems.quoteId, ids)).groupBy(quoteItems.quoteId);
      const itemsById = new Map(itemCounts.map((c) => [Number(c.quoteId), Number(c.n)]));
      const statusCounts: Array<{ status: QuoteStatus; n: number }> = await db.select({ status: quotes.status, n: sql<number>`count(*)` })
        .from(quotes).where(eq(quotes.userId, userId)).groupBy(quotes.status);
      const counts = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, 0])) as Record<QuoteStatus, number>;
      for (const c of statusCounts) counts[c.status] = Number(c.n);
      return {
        items: rows.map((r) => ({ ...quoteOut(r, r), itemCount: itemsById.get(Number(r.id)) ?? 0 })),
        counts,
      };
    }),

  get: authedQuery.input(z.object({ id })).query(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const q = await loadQuote(db, userId, input.id, ctx.lang);
    const items = await loadQuoteItems(db, q.id);
    return {
      ...quoteOut(q, await linkedSale(db, userId, q.saleId)),
      items: items.map((it) => ({
        id: Number(it.id),
        serviceId: it.serviceId === null ? null : Number(it.serviceId),
        description: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        lineTotal: lineTotalCents(it) / 100,
      })),
    };
  }),

  create: authedQuery.input(quoteInput).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const values = await quoteValues(db, userId, input, ctx.lang);
    return db.transaction(async (tx: Db) => {
      const created = await insertNumberedQuote(tx, userId, values);
      await insertQuoteItems(tx, created.id, input.items);
      return created;
    });
  }),

  update: authedQuery.input(quoteInput.extend({ id })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const values = await quoteValues(db, userId, input, ctx.lang);
    await db.transaction(async (tx: Db) => {
      const q = await loadQuote(tx, userId, input.id, ctx.lang, true);
      if (!canEditQuote(q.status)) fail("BAD_REQUEST", ctx.lang, "quoteConverted");
      await tx.update(quotes).set(values).where(eq(quotes.id, q.id));
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, q.id));
      await insertQuoteItems(tx, q.id, input.items);
    });
    return { id: input.id };
  }),

  setStatus: authedQuery
    .input(z.object({ id, status: z.enum(MANUAL_QUOTE_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      const q = await loadQuote(db, userId, input.id, ctx.lang);
      if (q.status === "converted") fail("BAD_REQUEST", ctx.lang, "quoteConverted");
      if (!canSetQuoteStatus(q.status, input.status)) return { id: input.id, status: q.status };
      const res = await db.update(quotes).set({ status: input.status })
        .where(and(eq(quotes.id, q.id), eq(quotes.userId, userId), sql`${quotes.status} <> 'converted'`));
      if (affectedRowsOf(res) === 0) fail("CONFLICT", ctx.lang, "quoteConverted");
      return { id: input.id, status: input.status };
    }),

  /**
   * Turns the quote into a sale, all in one transaction with the quote locked (two clicks can't
   * make two sales). Paid now ("cash" | "zelle" | "card"): a completed sale with its payment and
   * journal entry, like the POS. Not paid yet ("pending"): a pending sale to collect later.
   */
  convertToSale: authedQuery
    .input(z.object({ id, payment: z.enum(["pending", "cash", "zelle", "card"]) }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      const payment = input.payment === "pending" ? null : input.payment;
      try {
        const sale = await db.transaction(async (tx: Db) => {
          // Locked: a second click waits here, then finds the quote already converted.
          const q = await loadQuote(tx, userId, input.id, ctx.lang, true);
          if (q.status === "converted") fail("CONFLICT", ctx.lang, "quoteConverted");
          if (!canConvertQuote(q.status)) fail("BAD_REQUEST", ctx.lang, "cannotConvert");
          const items = await loadQuoteItems(tx, q.id);
          const lines = await saleLinesFor(tx, userId, items.map((it) => ({
            serviceId: it.serviceId === null ? null : Number(it.serviceId),
            description: it.description,
            quantity: Number(it.quantity),
            unitPrice: centsToDecimal(toCents(it.unitPrice)),
          })));
          const customerId = await existingCustomerId(tx, userId, q.customerId === null ? null : Number(q.customerId));
          const created = await createSale(tx, userId, {
            customerId, customerName: q.customerName, lines, subtotal: q.subtotal, discount: q.discount, total: q.total,
            notes: `Cotización ${q.number}`,
          }, payment);
          await tx.update(quotes).set({ status: "converted", saleId: created.id }).where(eq(quotes.id, q.id));
          return created;
        });
        return { saleId: sale.id, invoiceNumber: sale.invoiceNumber, pending: payment === null };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        console.error("[quotes] convertToSale failed:", e);
        fail("INTERNAL_SERVER_ERROR", ctx.lang, "saleFailed");
      }
    }),

  delete: authedQuery.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    await db.transaction(async (tx: Db) => {
      const q = await loadQuote(tx, userId, input.id, ctx.lang, true);
      if (!canDeleteQuote(q.status)) fail("BAD_REQUEST", ctx.lang, "quoteConverted");
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, q.id));
      await tx.delete(quotes).where(eq(quotes.id, q.id));
    });
    return { id: input.id };
  }),

  recurring: recurringRouter,

  /** Pending sales created from quotes and recurring invoices: what's left to collect. */
  receivables: authedQuery.query(async ({ ctx }) => {
    const { db, userId } = await setup(ctx);
    const rows: Array<{
      id: number; invoiceNumber: string; customerName: string | null; total: string; createdAt: Date;
      quoteId: number | null; quoteNumber: string | null; periodDate: string | null;
    }> = await db.select({
      id: sales.id,
      invoiceNumber: sales.invoiceNumber,
      customerName: sales.customerName,
      total: sales.total,
      createdAt: sales.createdAt,
      quoteId: quotes.id,
      quoteNumber: quotes.number,
      periodDate: sql<string | null>`DATE_FORMAT(${recurringInvoiceRuns.periodDate}, '%Y-%m-%d')`,
    }).from(sales)
      .leftJoin(quotes, and(eq(quotes.saleId, sales.id), eq(quotes.userId, userId)))
      .leftJoin(recurringInvoiceRuns, and(eq(recurringInvoiceRuns.saleId, sales.id), eq(recurringInvoiceRuns.userId, userId)))
      .where(and(eq(sales.createdBy, userId), eq(sales.status, "pending"), sql`(${quotes.id} IS NOT NULL OR ${recurringInvoiceRuns.id} IS NOT NULL)`))
      .orderBy(asc(sales.createdAt), asc(sales.id)).limit(200);
    return rows.map((r) => ({
      saleId: Number(r.id),
      invoiceNumber: r.invoiceNumber,
      customerName: r.customerName,
      total: Number(r.total),
      createdAt: r.createdAt,
      quoteId: r.quoteId === null ? null : Number(r.quoteId),
      quoteNumber: r.quoteNumber,
      periodDate: r.periodDate,
    }));
  }),

  /** The client paid a pending sale: it becomes a completed sale with its payment and journal entry. */
  collect: authedQuery
    .input(z.object({ saleId: id, method: z.enum(PAYMENT_METHODS) }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      const sale = await loadOwnPendingSale(db, userId, input.saleId, ctx.lang);
      await db.transaction(async (tx: Db) => {
        const res = await tx.update(sales).set({ status: "completed", paymentMethod: input.method })
          .where(and(eq(sales.id, sale.id), eq(sales.createdBy, userId), eq(sales.status, "pending")));
        if (affectedRowsOf(res) === 0) fail("CONFLICT", ctx.lang, "saleNotPending");
        await tx.insert(paymentRecords).values({ saleId: sale.id, method: input.method, amount: sale.total });
        await postSaleJournal(tx, userId, sale, input.method);
      });
      return { saleId: sale.id, invoiceNumber: sale.invoiceNumber };
    }),

  /** Voids a pending sale (it was never booked, so there's nothing else to undo). */
  cancelPending: authedQuery.input(z.object({ saleId: id })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const sale = await loadOwnPendingSale(db, userId, input.saleId, ctx.lang);
    const res = await db.update(sales).set({ status: "cancelled" })
      .where(and(eq(sales.id, sale.id), eq(sales.createdBy, userId), eq(sales.status, "pending")));
    if (affectedRowsOf(res) === 0) fail("CONFLICT", ctx.lang, "saleNotPending");
    return { saleId: sale.id, invoiceNumber: sale.invoiceNumber };
  }),
});
