// ── Facturas (every business plan) ──
// An invoice is a bill to a client. Issued, it IS a sale: "pending" while something is owed,
// "completed" once paid, "cancelled" when voided, "refunded" when all the money went back.
// The tables in db/invoicesSchema.ts add the due date, the history (sent, reminders…),
// partial payments and refunds. A draft has no sale until it's issued.
//
// Accounting (cash basis, like the rest of the app): nothing is booked when an invoice is
// issued; each payment books its amount like quotes.collect does (debit the method's account,
// credit revenue: postSaleJournal), a refund books the reverse, and voiding a paid invoice
// reverses what was paid. Every entry references the sale, so the accounting rebuild never
// books it again.
//
// Which sales are invoices: the ones made here, every pending sale, and the sales made from
// quotes and recurring invoices. POS sales paid at the counter are not.
//
// Sending: the app has no email service. Invoices go out through the user's own WhatsApp or
// email app (wa.me / mailto links with the text ready) or as a PDF from the print view; the
// server only records that it was sent. Reminders work the same way: the app says when one is
// due and prepares it, the user sends it.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { customers, paymentRecords, sales, saleServices } from "@db/schema";
import { quotes, recurringInvoiceRuns } from "@db/quotesSchema";
import { invoiceEvents, invoicePayments, invoices, invoiceSettings, type InvoiceDraftItem } from "@db/invoicesSchema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { contextHas, getPlanContext } from "./lib/planAccess";
import type { Lang } from "./lib/i18n";
import {
  MAX_ITEMS, MAX_QUANTITY, MAX_UNIT_PRICE, PAYMENT_METHODS, centsToDecimal, isValidIsoDate, lineTotalCents, quoteTotals, toCents, todayInTimeZone, type PaymentMethod,
} from "./lib/quotes";
import {
  DEFAULT_REMINDERS, DEFAULT_TERMS, INVOICE_FILTERS, MAX_TERMS, SEND_CHANNELS, checkPayment, checkRefund, dueDateFor, invoiceState,
  isOwed, matchesFilter, monthStartOf, netByMethod, netPaidCents, nextReminder, reminderToSend, reversalByMethod, saleMethodFor,
  type InvoiceFilter, type InvoiceState, type MoneyMove, type Reminder, type ReminderSettings, type SaleStatus,
} from "./lib/invoices";
import {
  affectedRowsOf, assertOwnServices, checkLines, createSale, ensureQuotesTables, existingCustomerId, insertIdOf, isDuplicateKey,
  parseItems, postSaleJournal, resolveCustomer, saleLinesFor, type SaleLine,
} from "./quotes-router";

type Db = ReturnType<typeof getDb>;

// ── Messages ──

const es = {
  plan: "Facturas está en los planes de negocio. Puedes elegir uno en Ajustes.",
  notFound: "No encontramos esa factura.",
  notOwed: "Esta factura ya no tiene nada por cobrar.",
  notRefundable: "Esta factura no tiene pagos que se puedan regresar.",
  alreadyVoid: "Esta factura ya está anulada.",
  notDraft: "Esa factura ya no es un borrador.",
  zeroAmount: "El monto tiene que ser mayor que $0.",
  tooMuch: "Es más de lo que falta por pagar.",
  refundTooMuch: "Es más de lo que te ha pagado.",
  zeroTotal: "El total tiene que ser mayor que $0.",
  badDue: "La fecha de vencimiento no puede ser antes de la fecha de la factura.",
  badDate: "La fecha no es válida.",
  draftEmpty: "Este borrador no tiene líneas válidas.",
  failed: "No pudimos guardar la factura. Inténtalo de nuevo.",
};
type MsgKey = keyof typeof es;
const en: Record<MsgKey, string> = {
  plan: "Invoices are part of the business plans. You can pick one in Settings.",
  notFound: "We couldn't find that invoice.",
  notOwed: "Nothing is owed on this invoice anymore.",
  notRefundable: "This invoice has no payments to give back.",
  alreadyVoid: "This invoice is already void.",
  notDraft: "That invoice isn't a draft anymore.",
  zeroAmount: "The amount has to be more than $0.",
  tooMuch: "That's more than what's still owed.",
  refundTooMuch: "That's more than what the client has paid.",
  zeroTotal: "The total has to be more than $0.",
  badDue: "The due date can't be before the invoice date.",
  badDate: "That date isn't valid.",
  draftEmpty: "This draft has no valid lines.",
  failed: "We couldn't save the invoice. Please try again.",
};
const MESSAGES: Record<Lang, Record<MsgKey, string>> = { es, en };

function fail(code: TRPCError["code"], lang: Lang, key: MsgKey): never {
  throw new TRPCError({ code, message: MESSAGES[lang][key] });
}

// ── Tables (created on first use, in step with db/invoicesSchema.ts) ──

let tablesReady: Promise<void> | null = null;

export function ensureInvoicesTables(db: Db): Promise<void> {
  tablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        saleId BIGINT UNSIGNED NULL,
        source ENUM('invoice', 'quote', 'recurring', 'sale') NOT NULL DEFAULT 'invoice',
        quoteId BIGINT UNSIGNED NULL,
        customerId BIGINT UNSIGNED NULL,
        customerName VARCHAR(255) NULL,
        items JSON NULL,
        discount DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        total DECIMAL(12,2) NOT NULL,
        termsDays INT NOT NULL DEFAULT 14,
        issueDate DATE NULL,
        dueDate DATE NULL,
        sentAt TIMESTAMP NULL,
        lastReminderOn DATE NULL,
        voidedAt TIMESTAMP NULL,
        writtenOffAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        updatedAt TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE INDEX invoices_saleId_idx (saleId),
        INDEX invoices_userId_idx (userId),
        INDEX invoices_userId_dueDate_idx (userId, dueDate)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoicePayments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        invoiceId BIGINT UNSIGNED NOT NULL,
        saleId BIGINT UNSIGNED NOT NULL,
        kind ENUM('payment', 'refund') NOT NULL,
        method ENUM('cash', 'zelle', 'card') NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        paidOn DATE NOT NULL,
        note VARCHAR(255) NULL,
        journalEntryId BIGINT UNSIGNED NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX invoicePayments_invoiceId_idx (invoiceId),
        INDEX invoicePayments_userId_paidOn_idx (userId, paidOn)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoiceEvents (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        invoiceId BIGINT UNSIGNED NOT NULL,
        type ENUM('created', 'draft', 'issued', 'sent', 'reminder', 'payment', 'refund', 'void', 'writeoff', 'due') NOT NULL,
        detail JSON NULL,
        at TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX invoiceEvents_invoiceId_idx (invoiceId),
        INDEX invoiceEvents_userId_idx (userId)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoiceSettings (
        userId BIGINT UNSIGNED PRIMARY KEY,
        remindBefore BOOLEAN NOT NULL DEFAULT TRUE,
        remindOnDue BOOLEAN NOT NULL DEFAULT TRUE,
        remindAfter BOOLEAN NOT NULL DEFAULT TRUE,
        remindWeekly BOOLEAN NOT NULL DEFAULT FALSE,
        updatedAt TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
  })().catch((e: unknown) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

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

/** Deletes a user's invoice history, payments log, drafts and settings (account deletion). The sales stay with the sales. */
export async function deleteUserInvoicesData(db: Db, userId: number): Promise<void> {
  try {
    await db.transaction(async (tx: Db) => {
      await tx.delete(invoiceEvents).where(eq(invoiceEvents.userId, userId));
      await tx.delete(invoicePayments).where(eq(invoicePayments.userId, userId));
      await tx.delete(invoices).where(eq(invoices.userId, userId));
      await tx.delete(invoiceSettings).where(eq(invoiceSettings.userId, userId));
    });
  } catch (e: unknown) {
    if (!isNoSuchTable(e)) throw e;
  }
}

// ── Small helpers ──

type EventType = "created" | "draft" | "issued" | "sent" | "reminder" | "payment" | "refund" | "void" | "writeoff" | "due";
type EventDetail = Record<string, string | number | null>;
type Source = "invoice" | "quote" | "recurring" | "sale";

/** The business day ("YYYY-MM-DD", US Central) of an instant; null for none. */
function dayOf(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : todayInTimeZone(date);
}

const businessToday = () => todayInTimeZone(new Date());

/** Times are written from here (not the database's NOW()) so they read back the same whatever the database's time zone. */
async function addEvent(db: Db, userId: number, invoiceId: number, type: EventType, detail: EventDetail = {}, at: Date = new Date()): Promise<void> {
  await db.insert(invoiceEvents).values({ userId, invoiceId, type, detail, at });
}

/** A reference to an invoice: "s<saleId>" once issued, "d<invoiceId>" for a draft. */
const refInput = z.string().regex(/^[sd][1-9]\d{0,17}$/);
function parseRef(ref: string): { kind: "sale" | "draft"; id: number } {
  return { kind: ref[0] === "d" ? "draft" : "sale", id: Number(ref.slice(1)) };
}

/** The plan must be a business one with access (every business tier has Facturas); tables ready. */
async function setup(ctx: { user: { id: number | string; role?: string | null; modePreference?: string | null; createdAt?: Date | string | null }; lang: Lang }) {
  const db = getDb();
  const plan = await getPlanContext(db, ctx.user);
  if (!(plan.admin || (plan.mode === "business" && plan.tier !== null))) fail("FORBIDDEN", ctx.lang, "plan");
  await ensureQuotesTables(db); // the list joins quotes and recurring runs
  await ensureInvoicesTables(db);
  return { db, userId: Number(ctx.user.id), canQuotes: contextHas(plan, "quotes") };
}

async function loadSettings(db: Db, userId: number): Promise<ReminderSettings> {
  const rows: Array<{ remindBefore: boolean | number; remindOnDue: boolean | number; remindAfter: boolean | number; remindWeekly: boolean | number }> =
    await db.select({
      remindBefore: invoiceSettings.remindBefore, remindOnDue: invoiceSettings.remindOnDue,
      remindAfter: invoiceSettings.remindAfter, remindWeekly: invoiceSettings.remindWeekly,
    }).from(invoiceSettings).where(eq(invoiceSettings.userId, userId)).limit(1);
  const r = rows[0];
  if (!r) return { ...DEFAULT_REMINDERS };
  return { before: Boolean(r.remindBefore), onDue: Boolean(r.remindOnDue), after: Boolean(r.remindAfter), weekly: Boolean(r.remindWeekly) };
}

// ── Reading invoices ──

type SaleInvoiceRow = {
  saleId: number; invoiceNumber: string; customerId: number | null; customerName: string | null;
  subtotal: string; discount: string | null; saleTotal: string; status: SaleStatus; saleNotes: string | null; createdAt: Date;
  invoiceId: number | null; source: Source | null; metaTotal: string | null; termsDays: number | null; metaNotes: string | null;
  issueDate: string | null; dueDate: string | null; sentAt: Date | null; lastReminderOn: string | null;
  voidedAt: Date | null; writtenOffAt: Date | null;
  quoteId: number | null; quoteNumber: string | null; periodDate: string | null;
};

const saleInvoiceCols = {
  saleId: sales.id,
  invoiceNumber: sales.invoiceNumber,
  customerId: sales.customerId,
  customerName: sales.customerName,
  subtotal: sales.subtotal,
  discount: sales.discount,
  saleTotal: sales.total,
  status: sales.status,
  saleNotes: sales.notes,
  createdAt: sales.createdAt,
  invoiceId: invoices.id,
  source: invoices.source,
  metaTotal: invoices.total,
  termsDays: invoices.termsDays,
  metaNotes: invoices.notes,
  issueDate: sql<string | null>`DATE_FORMAT(${invoices.issueDate}, '%Y-%m-%d')`,
  dueDate: sql<string | null>`DATE_FORMAT(${invoices.dueDate}, '%Y-%m-%d')`,
  sentAt: invoices.sentAt,
  lastReminderOn: sql<string | null>`DATE_FORMAT(${invoices.lastReminderOn}, '%Y-%m-%d')`,
  voidedAt: invoices.voidedAt,
  writtenOffAt: invoices.writtenOffAt,
  quoteId: quotes.id,
  quoteNumber: quotes.number,
  periodDate: sql<string | null>`DATE_FORMAT(${recurringInvoiceRuns.periodDate}, '%Y-%m-%d')`,
};

/** This user's sales that are invoices (see the top of the file), newest first. */
async function loadSaleInvoices(db: Db, userId: number, saleId?: number): Promise<SaleInvoiceRow[]> {
  const rows: SaleInvoiceRow[] = await db.select(saleInvoiceCols).from(sales)
    .leftJoin(invoices, and(eq(invoices.saleId, sales.id), eq(invoices.userId, userId)))
    .leftJoin(quotes, and(eq(quotes.saleId, sales.id), eq(quotes.userId, userId)))
    .leftJoin(recurringInvoiceRuns, and(eq(recurringInvoiceRuns.saleId, sales.id), eq(recurringInvoiceRuns.userId, userId)))
    .where(and(
      eq(sales.createdBy, userId),
      saleId === undefined ? undefined : eq(sales.id, saleId),
      sql`(${invoices.id} IS NOT NULL OR ${sales.status} = 'pending' OR ${quotes.id} IS NOT NULL OR ${recurringInvoiceRuns.id} IS NOT NULL)`,
    ))
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(saleId === undefined ? 500 : 1);
  return rows.map((r) => ({
    ...r,
    saleId: Number(r.saleId),
    customerId: r.customerId === null ? null : Number(r.customerId),
    invoiceId: r.invoiceId === null ? null : Number(r.invoiceId),
    quoteId: r.quoteId === null ? null : Number(r.quoteId),
    termsDays: r.termsDays === null ? null : Number(r.termsDays),
  }));
}

type DraftRow = {
  id: number; customerId: number | null; customerName: string | null; items: unknown; discount: string; notes: string | null;
  total: string; termsDays: number; voidedAt: Date | null; createdAt: Date;
};

const draftCols = {
  id: invoices.id, customerId: invoices.customerId, customerName: invoices.customerName, items: invoices.items,
  discount: invoices.discount, notes: invoices.notes, total: invoices.total, termsDays: invoices.termsDays,
  voidedAt: invoices.voidedAt, createdAt: invoices.createdAt,
};

async function loadDrafts(db: Db, userId: number, id?: number): Promise<DraftRow[]> {
  const rows: DraftRow[] = await db.select(draftCols).from(invoices)
    .where(and(eq(invoices.userId, userId), isNull(invoices.saleId), id === undefined ? undefined : eq(invoices.id, id)))
    .orderBy(desc(invoices.createdAt), desc(invoices.id)).limit(id === undefined ? 200 : 1);
  return rows.map((r) => ({ ...r, id: Number(r.id), customerId: r.customerId === null ? null : Number(r.customerId), termsDays: Number(r.termsDays) }));
}

type MoveRow = { id: string; kind: "payment" | "refund"; method: PaymentMethod; amount: string; paidOn: string; note: string | null; at: Date | null };

/**
 * Money in and out per sale: the invoice's own log, or, for an older sale that has none, its
 * payment records (the full payment made when it was collected).
 */
async function loadMoves(db: Db, userId: number, saleIds: readonly number[]): Promise<Map<number, MoveRow[]>> {
  const out = new Map<number, MoveRow[]>();
  if (saleIds.length === 0) return out;
  const own: Array<{ id: number; saleId: number; kind: "payment" | "refund"; method: PaymentMethod; amount: string; paidOn: string; note: string | null; createdAt: Date }> =
    await db.select({
      id: invoicePayments.id, saleId: invoicePayments.saleId, kind: invoicePayments.kind, method: invoicePayments.method,
      amount: invoicePayments.amount, paidOn: sql<string>`DATE_FORMAT(${invoicePayments.paidOn}, '%Y-%m-%d')`,
      note: invoicePayments.note, createdAt: invoicePayments.createdAt,
    }).from(invoicePayments)
      .where(and(eq(invoicePayments.userId, userId), inArray(invoicePayments.saleId, [...saleIds])))
      .orderBy(asc(invoicePayments.paidOn), asc(invoicePayments.id));
  for (const p of own) {
    const list = out.get(Number(p.saleId)) ?? [];
    list.push({ id: `p${p.id}`, kind: p.kind, method: p.method, amount: p.amount, paidOn: p.paidOn, note: p.note, at: p.createdAt });
    out.set(Number(p.saleId), list);
  }
  const legacyIds = saleIds.filter((id) => !out.has(id));
  if (legacyIds.length > 0) {
    // saleIds are already this user's sales (createdBy), so their payment records are too.
    const recs: Array<{ id: number; saleId: number; method: PaymentMethod; amount: string; createdAt: Date }> = await db.select({
      id: paymentRecords.id, saleId: paymentRecords.saleId, method: paymentRecords.method, amount: paymentRecords.amount, createdAt: paymentRecords.createdAt,
    }).from(paymentRecords).where(inArray(paymentRecords.saleId, legacyIds)).orderBy(asc(paymentRecords.id));
    for (const p of recs) {
      const list = out.get(Number(p.saleId)) ?? [];
      list.push({ id: `r${p.id}`, kind: "payment", method: p.method, amount: p.amount, paidOn: dayOf(p.createdAt) ?? businessToday(), note: null, at: p.createdAt });
      out.set(Number(p.saleId), list);
    }
  }
  return out;
}

const toMoves = (rows: readonly MoveRow[]): MoneyMove[] => rows.map((m) => ({ kind: m.kind, method: m.method, cents: toCents(m.amount) }));

export type InvoiceListItem = {
  ref: string;
  saleId: number | null;
  /** The sale's invoice number ("FAC-20261121-0003"); null for a draft. */
  number: string | null;
  customerId: number | null;
  customerName: string | null;
  state: InvoiceState;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  netPaidCents: number;
  /** Still owed (0 unless open or late). */
  balanceCents: number;
  /** Left uncollected by a write-off. */
  writtenOffCents: number;
  issueDate: string | null;
  dueDate: string | null;
  termsDays: number;
  createdOn: string;
  sentOn: string | null;
  lastPaymentOn: string | null;
  voidedOn: string | null;
  lastReminderOn: string | null;
  source: Source;
  quoteNumber: string | null;
  periodDate: string | null;
  /** A reminder that has come up and hasn't been sent yet. */
  reminderDue: Reminder | null;
  nextReminder: Reminder | null;
};

function issuedOut(r: SaleInvoiceRow, moves: readonly MoveRow[], settings: ReminderSettings, today: string): InvoiceListItem {
  const issueDate = r.issueDate ?? r.periodDate ?? dayOf(r.createdAt) ?? today;
  // Before it has its own row, an invoice is due DEFAULT_TERMS days after it was made.
  const dueDate = r.invoiceId !== null ? r.dueDate : dueDateFor(issueDate, DEFAULT_TERMS);
  const writtenOff = r.writtenOffAt !== null;
  const state = invoiceState({ saleStatus: r.status, voided: false, writtenOff, dueDate, today });
  const mm = toMoves(moves);
  const paidCents = mm.filter((m) => m.kind === "payment").reduce((s, m) => s + m.cents, 0);
  const refundedCents = mm.filter((m) => m.kind === "refund").reduce((s, m) => s + m.cents, 0);
  const net = netPaidCents(mm);
  const totalCents = toCents(r.metaTotal ?? r.saleTotal);
  const owed = isOwed(state);
  const payments = moves.filter((m) => m.kind === "payment");
  return {
    ref: `s${r.saleId}`,
    saleId: r.saleId,
    number: r.invoiceNumber,
    customerId: r.customerId,
    customerName: r.customerName,
    state,
    totalCents,
    paidCents,
    refundedCents,
    netPaidCents: net,
    balanceCents: owed ? Math.max(0, toCents(r.saleTotal) - net) : 0,
    writtenOffCents: writtenOff ? Math.max(0, totalCents - net) : 0,
    issueDate,
    dueDate,
    termsDays: r.termsDays ?? DEFAULT_TERMS,
    createdOn: dayOf(r.createdAt) ?? today,
    sentOn: dayOf(r.sentAt),
    lastPaymentOn: payments.length > 0 ? payments[payments.length - 1].paidOn : null,
    voidedOn: dayOf(r.voidedAt),
    lastReminderOn: r.lastReminderOn,
    source: r.source ?? (r.quoteId !== null ? "quote" : r.periodDate !== null ? "recurring" : "sale"),
    quoteNumber: r.quoteNumber,
    periodDate: r.periodDate,
    reminderDue: owed && dueDate ? reminderToSend(dueDate, settings, today, r.lastReminderOn) : null,
    nextReminder: owed && dueDate ? nextReminder(dueDate, settings, today) : null,
  };
}

function draftOut(d: DraftRow, today: string): InvoiceListItem {
  return {
    ref: `d${d.id}`, saleId: null, number: null, customerId: d.customerId, customerName: d.customerName,
    state: d.voidedAt ? "void" : "draft", totalCents: toCents(d.total), paidCents: 0, refundedCents: 0, netPaidCents: 0,
    balanceCents: 0, writtenOffCents: 0, issueDate: null, dueDate: null, termsDays: d.termsDays, createdOn: dayOf(d.createdAt) ?? today,
    sentOn: null, lastPaymentOn: null, voidedOn: dayOf(d.voidedAt), lastReminderOn: null, source: "invoice", quoteNumber: null,
    periodDate: null, reminderDue: null, nextReminder: null,
  };
}

// ── Writing: the invoice row of a sale ──

type MetaRow = { id: number; saleId: number | null; issueDate: string | null; dueDate: string | null; voidedAt: Date | null };

async function loadMetaBySale(db: Db, userId: number, saleId: number): Promise<MetaRow | null> {
  const rows: MetaRow[] = await db.select({
    id: invoices.id, saleId: invoices.saleId,
    issueDate: sql<string | null>`DATE_FORMAT(${invoices.issueDate}, '%Y-%m-%d')`,
    dueDate: sql<string | null>`DATE_FORMAT(${invoices.dueDate}, '%Y-%m-%d')`,
    voidedAt: invoices.voidedAt,
  }).from(invoices).where(and(eq(invoices.saleId, saleId), eq(invoices.userId, userId))).limit(1);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

export type NewSaleInvoice = {
  saleId: number;
  source: Exclude<Source, "sale">;
  quoteId?: number | null;
  customerId: number | null;
  customerName: string | null;
  /** Decimal string, e.g. "450.00". */
  total: string;
  termsDays: number;
  issueDate: string;
  notes?: string | null;
  detail?: EventDetail;
  /** Already paid in full when it was made (a quote converted and paid on the spot). */
  payment?: { method: PaymentMethod; amount: string; journalEntryId: number | null } | null;
};

/** Gives a just-created sale its invoice row (due date, history). Call it in the sale's transaction. */
export async function addInvoiceForSale(db: Db, userId: number, x: NewSaleInvoice): Promise<number> {
  const res = await db.insert(invoices).values({
    userId, saleId: x.saleId, source: x.source, quoteId: x.quoteId ?? null, customerId: x.customerId, customerName: x.customerName,
    total: x.total, termsDays: x.termsDays, issueDate: x.issueDate, dueDate: dueDateFor(x.issueDate, x.termsDays), notes: x.notes?.trim() || null,
    createdAt: new Date(),
  });
  const invoiceId = insertIdOf(res);
  await addEvent(db, userId, invoiceId, "created", x.detail ?? {});
  if (x.payment) {
    const today = businessToday();
    await db.insert(invoicePayments).values({
      userId, invoiceId, saleId: x.saleId, kind: "payment", method: x.payment.method, amount: x.payment.amount, paidOn: today,
      journalEntryId: x.payment.journalEntryId,
    });
    await addEvent(db, userId, invoiceId, "payment", { amount: toCents(x.payment.amount), method: x.payment.method, left: 0 });
  }
  return invoiceId;
}

type SaleCore = { id: number; invoiceNumber: string; subtotal: string; total: string; status: SaleStatus; customerId: number | null; customerName: string | null; createdAt: Date };

/** This user's sale, locked for the rest of the transaction (two payments at once wait for each other). */
async function lockSale(tx: Db, userId: number, saleId: number, lang: Lang): Promise<SaleCore> {
  const rows: SaleCore[] = await tx.select({
    id: sales.id, invoiceNumber: sales.invoiceNumber, subtotal: sales.subtotal, total: sales.total, status: sales.status,
    customerId: sales.customerId, customerName: sales.customerName, createdAt: sales.createdAt,
  }).from(sales).where(and(eq(sales.id, saleId), eq(sales.createdBy, userId))).limit(1).for("update");
  const s = rows[0];
  if (!s) fail("NOT_FOUND", lang, "notFound");
  return { ...s, id: Number(s.id), customerId: s.customerId === null ? null : Number(s.customerId) };
}

/**
 * The sale's invoice row, created the first time an older invoice (a pending sale, or one from
 * a quote or recurring invoice made before Facturas existed) is touched: due DEFAULT_TERMS days
 * after it was made, with its earlier payments copied into the log. A POS sale isn't an invoice.
 */
async function metaFor(tx: Db, userId: number, sale: SaleCore, lang: Lang): Promise<MetaRow> {
  const found = await loadMetaBySale(tx, userId, sale.id);
  if (found) return found;
  const q: Array<{ id: number; number: string }> = await tx.select({ id: quotes.id, number: quotes.number }).from(quotes)
    .where(and(eq(quotes.saleId, sale.id), eq(quotes.userId, userId))).limit(1);
  const r: Array<{ periodDate: string }> = await tx.select({ periodDate: sql<string>`DATE_FORMAT(${recurringInvoiceRuns.periodDate}, '%Y-%m-%d')` })
    .from(recurringInvoiceRuns).where(and(eq(recurringInvoiceRuns.saleId, sale.id), eq(recurringInvoiceRuns.userId, userId))).limit(1);
  if (!q[0] && !r[0] && sale.status !== "pending") fail("NOT_FOUND", lang, "notFound");
  const issueDate = r[0]?.periodDate ?? dayOf(sale.createdAt) ?? businessToday();
  let invoiceId = 0;
  try {
    const res = await tx.insert(invoices).values({
      userId, saleId: sale.id, source: q[0] ? "quote" : r[0] ? "recurring" : "sale", quoteId: q[0] ? Number(q[0].id) : null,
      customerId: sale.customerId, customerName: sale.customerName, total: sale.total, termsDays: DEFAULT_TERMS,
      issueDate, dueDate: dueDateFor(issueDate, DEFAULT_TERMS), createdAt: sale.createdAt,
    });
    invoiceId = insertIdOf(res);
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    const again = await loadMetaBySale(tx, userId, sale.id);
    if (again) return again;
    throw e;
  }
  await addEvent(tx, userId, invoiceId, "created", q[0] ? { quote: q[0].number } : r[0] ? { period: r[0].periodDate } : {}, sale.createdAt);
  const recs: Array<{ method: PaymentMethod; amount: string; createdAt: Date }> = await tx.select({
    method: paymentRecords.method, amount: paymentRecords.amount, createdAt: paymentRecords.createdAt,
  }).from(paymentRecords).where(eq(paymentRecords.saleId, sale.id)).orderBy(asc(paymentRecords.id));
  for (const p of recs) {
    await tx.insert(invoicePayments).values({
      userId, invoiceId, saleId: sale.id, kind: "payment", method: p.method, amount: p.amount, paidOn: dayOf(p.createdAt) ?? businessToday(),
    });
    await addEvent(tx, userId, invoiceId, "payment", { amount: toCents(p.amount), method: p.method }, p.createdAt);
  }
  const meta = await loadMetaBySale(tx, userId, sale.id);
  if (!meta) throw new Error("invoice row missing");
  return meta;
}

async function movesOf(tx: Db, invoiceId: number): Promise<Array<MoneyMove & { kind: "payment" | "refund" }>> {
  const rows: Array<{ kind: "payment" | "refund"; method: PaymentMethod; amount: string }> = await tx.select({
    kind: invoicePayments.kind, method: invoicePayments.method, amount: invoicePayments.amount,
  }).from(invoicePayments).where(eq(invoicePayments.invoiceId, invoiceId)).orderBy(asc(invoicePayments.id));
  return rows.map((m) => ({ kind: m.kind, method: m.method, cents: toCents(m.amount) }));
}

// ── Money (also used by quotes.collect / quotes.cancelPending) ──

/**
 * Records a payment on an issued invoice: amountCents of what's owed (null = all of it), with its
 * payment record and journal entry. When nothing is left, the sale becomes completed.
 */
export async function payInvoiceSale(
  db: Db, userId: number, saleId: number, p: { amountCents: number | null; method: PaymentMethod; note?: string | null }, lang: Lang,
): Promise<{ amountCents: number; balanceCents: number; paid: boolean }> {
  return db.transaction(async (tx: Db) => {
    const sale = await lockSale(tx, userId, saleId, lang);
    const meta = await metaFor(tx, userId, sale, lang);
    if (sale.status !== "pending") fail("CONFLICT", lang, "notOwed");
    const moves = await movesOf(tx, meta.id);
    const balance = Math.max(0, toCents(sale.total) - netPaidCents(moves));
    const amount = p.amountCents ?? balance;
    const check = checkPayment(amount, balance);
    if (check === "zero") fail("BAD_REQUEST", lang, balance === 0 ? "notOwed" : "zeroAmount");
    if (check === "tooMuch") fail("BAD_REQUEST", lang, "tooMuch");
    const amountDec = centsToDecimal(amount);
    const note = p.note?.trim().slice(0, 255) || null;
    const firstAndFull = moves.length === 0 && amount === balance;
    await tx.insert(paymentRecords).values({ saleId: sale.id, method: p.method, amount: amountDec, reference: note });
    const journalEntryId = await postSaleJournal(tx, userId, { id: sale.id, invoiceNumber: sale.invoiceNumber, total: amountDec }, p.method, {
      description: firstAndFull ? `Venta ${sale.invoiceNumber}` : `Pago de factura ${sale.invoiceNumber}`,
    });
    await tx.insert(invoicePayments).values({
      userId, invoiceId: meta.id, saleId: sale.id, kind: "payment", method: p.method, amount: amountDec, paidOn: businessToday(), note, journalEntryId,
    });
    const left = balance - amount;
    if (left === 0) {
      const methods = [...moves.filter((m) => m.kind === "payment").map((m) => m.method), p.method];
      await tx.update(sales).set({ status: "completed", paymentMethod: saleMethodFor(methods) }).where(eq(sales.id, sale.id));
    }
    await addEvent(tx, userId, meta.id, "payment", { amount, method: p.method, left, note });
    return { amountCents: amount, balanceCents: left, paid: left === 0 };
  });
}

/** Gives money back to the client: the reversing entry (debit revenue, credit the method's account). */
async function refundInvoiceSale(
  db: Db, userId: number, saleId: number, p: { amountCents: number; method: PaymentMethod; reason: string | null }, lang: Lang,
): Promise<{ netPaidCents: number }> {
  return db.transaction(async (tx: Db) => {
    const sale = await lockSale(tx, userId, saleId, lang);
    const meta = await metaFor(tx, userId, sale, lang);
    if (sale.status !== "pending" && sale.status !== "completed") fail("CONFLICT", lang, "notRefundable");
    const moves = await movesOf(tx, meta.id);
    const net = netPaidCents(moves);
    if (net === 0) fail("CONFLICT", lang, "notRefundable");
    const check = checkRefund(p.amountCents, net);
    if (check === "zero") fail("BAD_REQUEST", lang, "zeroAmount");
    if (check === "tooMuch") fail("BAD_REQUEST", lang, "refundTooMuch");
    const amountDec = centsToDecimal(p.amountCents);
    const reason = p.reason?.trim().slice(0, 255) || null;
    const journalEntryId = await postSaleJournal(tx, userId, { id: sale.id, invoiceNumber: sale.invoiceNumber, total: amountDec }, p.method, {
      description: `Reembolso ${sale.invoiceNumber}`, reverse: true,
    });
    await tx.insert(invoicePayments).values({
      userId, invoiceId: meta.id, saleId: sale.id, kind: "refund", method: p.method, amount: amountDec, paidOn: businessToday(), note: reason, journalEntryId,
    });
    const left = net - p.amountCents;
    if (sale.status === "completed" && left === 0) await tx.update(sales).set({ status: "refunded" }).where(eq(sales.id, sale.id));
    await addEvent(tx, userId, meta.id, "refund", { amount: p.amountCents, method: p.method, reason });
    return { netPaidCents: left };
  });
}

/**
 * Voids an issued invoice: the sale is cancelled (never deleted, so the numbers add up), and
 * anything the client had paid is reversed per method with its own entry.
 */
export async function voidInvoiceSale(db: Db, userId: number, saleId: number, lang: Lang): Promise<{ reversedCents: number }> {
  return db.transaction(async (tx: Db) => {
    const sale = await lockSale(tx, userId, saleId, lang);
    const meta = await metaFor(tx, userId, sale, lang);
    if (sale.status === "cancelled") fail("CONFLICT", lang, "alreadyVoid");
    const moves = await movesOf(tx, meta.id);
    const reversals = reversalByMethod(netByMethod(moves), netPaidCents(moves));
    const today = businessToday();
    for (const r of reversals) {
      const amountDec = centsToDecimal(r.cents);
      const journalEntryId = await postSaleJournal(tx, userId, { id: sale.id, invoiceNumber: sale.invoiceNumber, total: amountDec }, r.method, {
        description: `Anulación ${sale.invoiceNumber}`, reverse: true,
      });
      await tx.insert(invoicePayments).values({
        userId, invoiceId: meta.id, saleId: sale.id, kind: "refund", method: r.method, amount: amountDec, paidOn: today, note: "void", journalEntryId,
      });
    }
    await tx.update(sales).set({ status: "cancelled" }).where(eq(sales.id, sale.id));
    await tx.update(invoices).set({ voidedAt: new Date() }).where(eq(invoices.id, meta.id));
    const reversedCents = reversals.reduce((s, r) => s + r.cents, 0);
    await addEvent(tx, userId, meta.id, "void", { refunded: reversedCents });
    return { reversedCents };
  });
}

/**
 * The client won't pay the rest. Nothing unpaid was ever booked (cash basis), so there's no
 * entry: with nothing paid the sale is cancelled; with part paid it's closed at what was
 * collected (total = paid, the rest shown as discount), so the sales reports match the books.
 */
async function writeOffInvoiceSale(db: Db, userId: number, saleId: number, lang: Lang): Promise<{ writtenOffCents: number }> {
  return db.transaction(async (tx: Db) => {
    const sale = await lockSale(tx, userId, saleId, lang);
    const meta = await metaFor(tx, userId, sale, lang);
    if (sale.status !== "pending") fail("CONFLICT", lang, "notOwed");
    const moves = await movesOf(tx, meta.id);
    const net = netPaidCents(moves);
    const left = Math.max(0, toCents(sale.total) - net);
    if (net === 0) {
      await tx.update(sales).set({ status: "cancelled" }).where(eq(sales.id, sale.id));
    } else {
      const methods = moves.filter((m) => m.kind === "payment").map((m) => m.method);
      await tx.update(sales).set({
        status: "completed", total: centsToDecimal(net), discount: centsToDecimal(Math.max(0, toCents(sale.subtotal) - net)), paymentMethod: saleMethodFor(methods),
      }).where(eq(sales.id, sale.id));
    }
    await tx.update(invoices).set({ writtenOffAt: new Date() }).where(eq(invoices.id, meta.id));
    await addEvent(tx, userId, meta.id, "writeoff", { amount: left });
    return { writtenOffCents: left };
  });
}

// ── Detail ──

type ItemOut = { key: string; description: string; quantity: number; unitPriceCents: number; lineCents: number };
type EventOut = { id: string; type: EventType; at: Date; day: string; detail: EventDetail };

function parseDetail(raw: unknown): EventDetail {
  let v: unknown = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return {}; }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: EventDetail = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" || typeof val === "number" || val === null) out[k] = val;
  }
  return out;
}

async function loadEvents(db: Db, userId: number, invoiceId: number): Promise<EventOut[]> {
  const rows: Array<{ id: number; type: EventType; detail: unknown; at: Date }> = await db.select({
    id: invoiceEvents.id, type: invoiceEvents.type, detail: invoiceEvents.detail, at: invoiceEvents.at,
  }).from(invoiceEvents).where(and(eq(invoiceEvents.invoiceId, invoiceId), eq(invoiceEvents.userId, userId)))
    .orderBy(asc(invoiceEvents.at), asc(invoiceEvents.id)).limit(300);
  return rows.map((e) => ({ id: `e${e.id}`, type: e.type, at: e.at, day: dayOf(e.at) ?? "", detail: parseDetail(e.detail) }));
}

async function customerContact(db: Db, userId: number, customerId: number | null): Promise<{ email: string | null; phone: string | null } | null> {
  if (!customerId) return null;
  const rows: Array<{ email: string | null; phone: string | null }> = await db.select({ email: customers.email, phone: customers.phone })
    .from(customers).where(and(eq(customers.id, customerId), eq(customers.userId, userId))).limit(1);
  return rows[0] ?? null;
}

// ── Input shapes ──

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidIsoDate, { message: "Invalid date" });
const money = z.number().finite().positive().max(100_000_000);
const method = z.enum(PAYMENT_METHODS);
const terms = z.number().int().min(0).max(MAX_TERMS);
// Same line shape as quotes (api/quotes-router.ts). Defined here, not imported: the two routers
// import each other, and only functions (not values used while loading) may cross that cycle.
const itemInput = z.object({
  serviceId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1).max(255),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  unitPrice: z.number().finite().min(0).max(MAX_UNIT_PRICE),
});

const createInput = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  customerName: z.string().trim().max(255).nullable().optional(),
  items: z.array(itemInput).min(1).max(MAX_ITEMS),
  discount: z.number().finite().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(2000).nullable().optional(),
  termsDays: terms.default(DEFAULT_TERMS),
  draft: z.boolean().default(false),
});

/** An issued invoice's sale id, or NOT_FOUND for a draft ref. */
function saleIdOf(ref: string, lang: Lang): number {
  const r = parseRef(ref);
  if (r.kind !== "sale") fail("BAD_REQUEST", lang, "notFound");
  return r.id;
}

/** Runs a mutation, turning unexpected database errors into a plain message (and logging them). */
async function guarded<T>(lang: Lang, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    console.error("[invoices] failed:", e);
    fail("INTERNAL_SERVER_ERROR", lang, "failed");
  }
}

export const invoicesRouter = createRouter({
  /** Every invoice (newest first, up to 500 plus 200 drafts) with the totals for the top of the page. */
  list: authedQuery.query(async ({ ctx }) => {
    const { db, userId, canQuotes } = await setup(ctx);
    const today = businessToday();
    const settings = await loadSettings(db, userId);
    const rows = await loadSaleInvoices(db, userId);
    const moves = await loadMoves(db, userId, rows.map((r) => r.saleId));
    const issued = rows.map((r) => ({ at: r.createdAt, item: issuedOut(r, moves.get(r.saleId) ?? [], settings, today) }));
    const drafts = (await loadDrafts(db, userId)).map((d) => ({ at: d.createdAt, item: draftOut(d, today) }));
    const items = [...issued, ...drafts]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .map((x) => x.item);

    const monthStart = monthStartOf(today);
    // Collected this month: the invoices' payment log (net of refunds), plus older collected
    // invoices that only have payment records.
    const logged: Array<{ n: string | number | null }> = await db.select({
      n: sql<string | null>`COALESCE(SUM(CASE WHEN ${invoicePayments.kind} = 'payment' THEN ${invoicePayments.amount} ELSE -${invoicePayments.amount} END), 0)`,
    }).from(invoicePayments).where(and(eq(invoicePayments.userId, userId), sql`${invoicePayments.paidOn} >= ${monthStart}`));
    let collectedMonthCents = toCents(logged[0]?.n ?? 0);
    for (const [, list] of moves) {
      for (const m of list) if (m.id.startsWith("r") && m.paidOn >= monthStart) collectedMonthCents += toCents(m.amount);
    }

    const sum = (pred: (i: InvoiceListItem) => boolean) => items.filter(pred).reduce((s, i) => s + i.balanceCents, 0);
    const counts = Object.fromEntries(INVOICE_FILTERS.map((f) => [f, items.filter((i) => matchesFilter(i.state, f)).length])) as Record<InvoiceFilter, number>;
    return {
      today,
      items,
      counts,
      summary: {
        owedCents: sum((i) => isOwed(i.state)),
        openCents: sum((i) => i.state === "open"),
        openCount: counts.open,
        lateCents: sum((i) => i.state === "late"),
        lateCount: counts.late,
        collectedMonthCents,
        monthStart,
        remindersToSend: items.filter((i) => i.reminderDue !== null).length,
      },
      reminders: settings,
      canQuotes,
    };
  }),

  /** One invoice with its lines, payments, history and the client's contact (for sending). */
  get: authedQuery.input(z.object({ ref: refInput })).query(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const today = businessToday();
    const settings = await loadSettings(db, userId);
    const ref = parseRef(input.ref);

    if (ref.kind === "draft") {
      const d = (await loadDrafts(db, userId, ref.id))[0];
      if (!d) fail("NOT_FOUND", ctx.lang, "notFound");
      const lines = parseItems(d.items);
      const subtotalCents = lines.reduce((s, l) => s + lineTotalCents(l), 0);
      const events = await loadEvents(db, userId, d.id);
      return {
        ...draftOut(d, today),
        today,
        items: lines.map((l, i): ItemOut => ({
          key: `l${i}`, description: l.description, quantity: l.quantity, unitPriceCents: toCents(l.unitPrice), lineCents: lineTotalCents(l),
        })),
        subtotalCents,
        discountCents: toCents(d.discount),
        notes: d.notes,
        contact: await customerContact(db, userId, d.customerId),
        payments: [] as Array<{ id: string; kind: "payment" | "refund"; method: PaymentMethod; cents: number; paidOn: string; note: string | null }>,
        events,
        reminders: settings,
      };
    }

    const row = (await loadSaleInvoices(db, userId, ref.id))[0];
    if (!row) fail("NOT_FOUND", ctx.lang, "notFound");
    const moves = (await loadMoves(db, userId, [row.saleId])).get(row.saleId) ?? [];
    const item = issuedOut(row, moves, settings, today);
    const lines: Array<{ id: number; serviceName: string; quantity: number; unitPrice: string; total: string }> = await db.select({
      id: saleServices.id, serviceName: saleServices.serviceName, quantity: saleServices.quantity, unitPrice: saleServices.unitPrice, total: saleServices.total,
    }).from(saleServices).where(eq(saleServices.saleId, row.saleId)).orderBy(asc(saleServices.id));
    const subtotalCents = toCents(row.subtotal);
    let events: EventOut[];
    if (row.invoiceId !== null) {
      events = await loadEvents(db, userId, row.invoiceId);
    } else {
      // An older invoice with no history of its own yet: what the sale tells.
      events = [
        { id: "x0", type: "created", at: row.createdAt, day: dayOf(row.createdAt) ?? today, detail: row.quoteNumber ? { quote: row.quoteNumber } : row.periodDate ? { period: row.periodDate } : {} },
        ...moves.map((m): EventOut => ({ id: `x${m.id}`, type: "payment", at: m.at ?? row.createdAt, day: m.paidOn, detail: { amount: toCents(m.amount), method: m.method } })),
      ];
    }
    return {
      ...item,
      today,
      items: lines.map((l): ItemOut => ({
        key: `s${l.id}`, description: l.serviceName, quantity: Number(l.quantity), unitPriceCents: toCents(l.unitPrice), lineCents: toCents(l.total),
      })),
      subtotalCents,
      // A write-off lowers the sale to what was collected; the document keeps the original total.
      discountCents: Math.max(0, subtotalCents - item.totalCents),
      notes: row.metaNotes ?? (row.invoiceId !== null && row.source === "invoice" ? row.saleNotes : null),
      contact: await customerContact(db, userId, row.customerId),
      payments: moves.map((m) => ({ id: m.id, kind: m.kind, method: m.method, cents: toCents(m.amount), paidOn: m.paidOn, note: m.note })),
      events,
      reminders: settings,
    };
  }),

  /** A new invoice: issued now (a pending sale, due in `termsDays`) or saved as a draft. Totals are computed here. */
  create: authedQuery.input(createInput).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    checkLines(input.items, ctx.lang);
    const totals = quoteTotals(input.items, input.discount);
    if (totals.totalCents <= 0) fail("BAD_REQUEST", ctx.lang, "zeroTotal");
    await assertOwnServices(db, userId, input.items, ctx.lang);
    const customer = await resolveCustomer(db, userId, input, ctx.lang);
    const notes = input.notes?.trim() || null;
    const items: InvoiceDraftItem[] = input.items.map((it) => ({
      serviceId: it.serviceId ?? null, description: it.description, quantity: it.quantity, unitPrice: centsToDecimal(toCents(it.unitPrice)),
    }));

    if (input.draft) {
      const res = await db.insert(invoices).values({
        userId, saleId: null, source: "invoice", ...customer, items, discount: centsToDecimal(totals.discountCents), notes,
        total: centsToDecimal(totals.totalCents), termsDays: input.termsDays, createdAt: new Date(),
      });
      const id = insertIdOf(res);
      await addEvent(db, userId, id, "draft");
      return { ref: `d${id}` };
    }

    return guarded(ctx.lang, (): Promise<{ ref: string }> => db.transaction(async (tx: Db) => {
      const lines: SaleLine[] = items.map((it) => ({ serviceId: it.serviceId, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice }));
      const total = centsToDecimal(totals.totalCents);
      const sale = await createSale(tx, userId, {
        ...customer, lines, subtotal: centsToDecimal(totals.subtotalCents), discount: centsToDecimal(totals.discountCents), total,
        notes: notes ?? "",
      }, null);
      await addInvoiceForSale(tx, userId, {
        saleId: sale.id, source: "invoice", ...customer, total, termsDays: input.termsDays, issueDate: businessToday(), notes,
      });
      return { ref: `s${sale.id}` };
    }));
  }),

  /** Issues a draft: it becomes a pending sale, due `termsDays` days from today. */
  issue: authedQuery.input(z.object({ ref: refInput, termsDays: terms.optional() })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const ref = parseRef(input.ref);
    if (ref.kind !== "draft") fail("BAD_REQUEST", ctx.lang, "notDraft");
    return guarded(ctx.lang, (): Promise<{ ref: string }> => db.transaction(async (tx: Db) => {
      // Locked: a second click waits here, then finds it already issued.
      const rows: Array<DraftRow & { saleId: number | null }> = await tx.select({ ...draftCols, saleId: invoices.saleId }).from(invoices)
        .where(and(eq(invoices.id, ref.id), eq(invoices.userId, userId))).limit(1).for("update");
      const d = rows[0];
      if (!d) fail("NOT_FOUND", ctx.lang, "notFound");
      if (d.saleId) fail("CONFLICT", ctx.lang, "notDraft");
      if (d.voidedAt) fail("CONFLICT", ctx.lang, "alreadyVoid");
      const lines = await saleLinesFor(tx, userId, parseItems(d.items));
      if (lines.length === 0) fail("BAD_REQUEST", ctx.lang, "draftEmpty");
      const totals = quoteTotals(lines, d.discount);
      if (totals.totalCents <= 0) fail("BAD_REQUEST", ctx.lang, "zeroTotal");
      const customerId = await existingCustomerId(tx, userId, d.customerId === null ? null : Number(d.customerId));
      const total = centsToDecimal(totals.totalCents);
      const sale = await createSale(tx, userId, {
        customerId, customerName: d.customerName, lines, subtotal: centsToDecimal(totals.subtotalCents),
        discount: centsToDecimal(totals.discountCents), total, notes: d.notes ?? "",
      }, null);
      const termsDays = input.termsDays ?? Number(d.termsDays);
      const issueDate = businessToday();
      await tx.update(invoices).set({
        saleId: sale.id, customerId, total, termsDays, issueDate, dueDate: dueDateFor(issueDate, termsDays),
      }).where(eq(invoices.id, ref.id));
      await addEvent(tx, userId, ref.id, "issued");
      return { ref: `s${sale.id}` };
    }));
  }),

  /** A payment from the client (part or all of what's owed), with its journal entry. */
  pay: authedQuery
    .input(z.object({ ref: refInput, amount: money, method, note: z.string().trim().max(255).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      return guarded(ctx.lang, () => payInvoiceSale(db, userId, saleIdOf(input.ref, ctx.lang), { amountCents: toCents(input.amount), method: input.method, note: input.note }, ctx.lang));
    }),

  /** Money given back to the client, with the reversing journal entry. */
  refund: authedQuery
    .input(z.object({ ref: refInput, amount: money, method, reason: z.string().trim().max(255).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      return guarded(ctx.lang, () => refundInvoiceSale(db, userId, saleIdOf(input.ref, ctx.lang), { amountCents: toCents(input.amount), method: input.method, reason: input.reason ?? null }, ctx.lang));
    }),

  /** Voids an invoice (a draft, or an issued one with what was paid reversed). Nothing is deleted. */
  void: authedQuery.input(z.object({ ref: refInput })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const ref = parseRef(input.ref);
    if (ref.kind === "draft") {
      const res = await db.update(invoices).set({ voidedAt: new Date() })
        .where(and(eq(invoices.id, ref.id), eq(invoices.userId, userId), isNull(invoices.saleId), isNull(invoices.voidedAt)));
      if (affectedRowsOf(res) === 0) fail("CONFLICT", ctx.lang, "alreadyVoid");
      await addEvent(db, userId, ref.id, "void", { refunded: 0 });
      return { reversedCents: 0 };
    }
    return guarded(ctx.lang, () => voidInvoiceSale(db, userId, ref.id, ctx.lang));
  }),

  /** "No se cobró": stops counting as owed (see writeOffInvoiceSale for the books). */
  writeOff: authedQuery.input(z.object({ ref: refInput })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    return guarded(ctx.lang, () => writeOffInvoiceSale(db, userId, saleIdOf(input.ref, ctx.lang), ctx.lang));
  }),

  /** Moves the due date of an invoice that's still owed. */
  setDueDate: authedQuery.input(z.object({ ref: refInput, dueDate: day })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const saleId = saleIdOf(input.ref, ctx.lang);
    return guarded(ctx.lang, (): Promise<{ dueDate: string }> => db.transaction(async (tx: Db) => {
      const sale = await lockSale(tx, userId, saleId, ctx.lang);
      const meta = await metaFor(tx, userId, sale, ctx.lang);
      if (sale.status !== "pending") fail("CONFLICT", ctx.lang, "notOwed");
      if (meta.issueDate && input.dueDate < meta.issueDate) fail("BAD_REQUEST", ctx.lang, "badDue");
      await tx.update(invoices).set({ dueDate: input.dueDate }).where(eq(invoices.id, meta.id));
      await addEvent(tx, userId, meta.id, "due", { dueDate: input.dueDate });
      return { dueDate: input.dueDate };
    }));
  }),

  /** The user sent it from their own app (WhatsApp, email, PDF…): recorded in its history. */
  markSent: authedQuery.input(z.object({ ref: refInput, channel: z.enum(SEND_CHANNELS) })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const saleId = saleIdOf(input.ref, ctx.lang);
    return guarded(ctx.lang, (): Promise<{ ok: boolean }> => db.transaction(async (tx: Db) => {
      const sale = await lockSale(tx, userId, saleId, ctx.lang);
      const meta = await metaFor(tx, userId, sale, ctx.lang);
      if (sale.status === "cancelled") fail("CONFLICT", ctx.lang, "alreadyVoid");
      await tx.update(invoices).set({ sentAt: new Date() }).where(and(eq(invoices.id, meta.id), isNull(invoices.sentAt)));
      await addEvent(tx, userId, meta.id, "sent", { channel: input.channel });
      return { ok: true };
    }));
  }),

  /** The user sent a payment reminder from their own app: recorded, and the next one waits for its date. */
  markReminded: authedQuery.input(z.object({ ref: refInput, channel: z.enum(SEND_CHANNELS) })).mutation(async ({ ctx, input }) => {
    const { db, userId } = await setup(ctx);
    const saleId = saleIdOf(input.ref, ctx.lang);
    return guarded(ctx.lang, (): Promise<{ ok: boolean }> => db.transaction(async (tx: Db) => {
      const sale = await lockSale(tx, userId, saleId, ctx.lang);
      const meta = await metaFor(tx, userId, sale, ctx.lang);
      if (sale.status !== "pending") fail("CONFLICT", ctx.lang, "notOwed");
      const today = businessToday();
      await tx.update(invoices).set({ lastReminderOn: today }).where(eq(invoices.id, meta.id));
      const late = meta.dueDate !== null && meta.dueDate < today;
      await addEvent(tx, userId, meta.id, "reminder", { channel: input.channel, dueDate: meta.dueDate, late: late ? 1 : 0 });
      return { ok: true };
    }));
  }),

  settings: authedQuery.query(async ({ ctx }) => {
    const { db, userId } = await setup(ctx);
    return loadSettings(db, userId);
  }),

  saveSettings: authedQuery
    .input(z.object({ before: z.boolean(), onDue: z.boolean(), after: z.boolean(), weekly: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await setup(ctx);
      await db.execute(sql`
        INSERT INTO invoiceSettings (userId, remindBefore, remindOnDue, remindAfter, remindWeekly)
        VALUES (${userId}, ${input.before}, ${input.onDue}, ${input.after}, ${input.weekly})
        ON DUPLICATE KEY UPDATE remindBefore = VALUES(remindBefore), remindOnDue = VALUES(remindOnDue),
          remindAfter = VALUES(remindAfter), remindWeekly = VALUES(remindWeekly), updatedAt = NOW()
      `);
      return loadSettings(db, userId);
    }),
});
