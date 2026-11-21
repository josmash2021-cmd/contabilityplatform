// ── Recibos: receipt photos for business expenses ──
// The owner (or a team member) photographs a receipt and says who, how much, when and
// how it was paid. The photo is stored encrypted, with the same AES-256-GCM key as the
// tax documents (lib/taxCrypto.ts), and a matching expense is recorded with the same
// journal entry expenses.create writes, so the receipt counts in Reportes and the books.
// Business Básico: 20 photos a calendar month; Pro and Negocio: no cap (contracts/planFeatures.ts).
//
// Link: receipts.expenseId -> expenses.id, and expenses.receipt holds the receipt id (as text).
// A photo can also be added later to an expense that already exists (Gastos → "Subir recibo"): then
// receipts.attached = 1 and that expense stays the owner's (editing or removing the photo never changes it).
// Or to a bank charge: then the receipt records its own expense and links it to the charge (expenseBankLinks),
// so Gastos counts that money once (api/lib/expenses.ts).
//
// "Leer recibo" (read): when ANTHROPIC_API_KEY is set, Claude reads the photo or PDF on the server and only
// suggests merchant, total and date for the form. Nothing of it is stored; the photo is saved only when the
// person saves the receipt, and it counts against the monthly photos then, as always.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { isMissingTable } from "./lib/dbErrors";
import { accounts, bankAccounts, bankTransactions, expenses, journalEntries, journalEntryLines } from "@db/schema";
import { expenseBankLinks, expenseLimits, receipts } from "@db/receiptsSchema";
import { TAX_FILE_TYPES, TAX_MAX_FILE_BYTES } from "@contracts/taxRules";
import { requireFeature, type PlanContext } from "./lib/planAccess";
import type { Lang } from "./lib/i18n";
import { decryptTaxFile, encryptTaxFile, hasTaxKey } from "./lib/taxCrypto";
import { sniffTaxFile } from "./tax-router";
import {
  FIRST_RECEIPT_YEAR, MAX_MERCHANT_LENGTH, MAX_NOTES_LENGTH, MAX_RECEIPT_AMOUNT, RECEIPT_CATEGORIES, RECEIPT_PAYMENT_METHODS,
  RECEIPT_THUMB_MAX_BYTES, centsToDecimal, isIsoDate, monthRange, monthStartUtc, receiptTotals, receiptUsage, toCents,
  type ReceiptCategory, type ReceiptPaymentMethod, type ReceiptUsage,
} from "./lib/receipts";
import { bankSpendCategory, expenseSpendCategory, isBusinessSpending, toCents as spendCents } from "./lib/expenses";
import { displayNameOf } from "./lib/reviewEngine";

type Db = ReturnType<typeof getDb>;
type CtxUser = { id: number | string; role?: string | null; modePreference?: string | null; createdAt?: Date | string | null };

// ── Messages for the user (es/en, picked by ctx.lang) ──
type Messages = {
  capReached: (cap: number) => string; badFile: string; tooBig: string; noKey: string; notFound: string;
  attachedEdit: string; expenseNotFound: string; alreadyHasReceipt: string; bankNotFound: string; bankTaken: string; readBusy: string;
};
const MESSAGES: Record<Lang, Messages> = {
  es: {
    capReached: (cap) => `Ya subiste tus ${cap} fotos de recibo de este mes. Se renuevan el día 1, o puedes cambiar de plan en Ajustes.`,
    badFile: "Sube una foto (JPG, PNG, HEIC) o un PDF.",
    tooBig: "El archivo pesa más de 10 MB.",
    noKey: "Todavía no podemos guardar recibos. Inténtalo más tarde.",
    notFound: "No encontramos ese recibo.",
    attachedEdit: "Esta foto es el recibo de un gasto que ya tenías. Cambia los datos en el gasto, no en el recibo.",
    expenseNotFound: "No encontramos ese gasto.",
    alreadyHasReceipt: "Ese gasto ya tiene su recibo.",
    bankNotFound: "No encontramos ese cargo del banco.",
    bankTaken: "Ese cargo del banco ya está unido a otro gasto.",
    readBusy: "Leíste muchos recibos seguidos. Espera unos minutos o escribe los datos tú.",
  },
  en: {
    capReached: (cap) => `You already uploaded your ${cap} receipt photos this month. They renew on the 1st, or you can change your plan in Settings.`,
    badFile: "Upload a photo (JPG, PNG, HEIC) or a PDF.",
    tooBig: "The file is larger than 10 MB.",
    noKey: "We can't store receipts yet. Please try again later.",
    notFound: "We couldn't find that receipt.",
    attachedEdit: "This photo is the receipt of an expense you already had. Change the expense, not the receipt.",
    expenseNotFound: "We couldn't find that expense.",
    alreadyHasReceipt: "That expense already has its receipt.",
    bankNotFound: "We couldn't find that bank charge.",
    bankTaken: "That bank charge is already joined to another expense.",
    readBusy: "You read many receipts in a row. Wait a few minutes or type the details yourself.",
  },
};
const say = (lang: Lang): Messages => MESSAGES[lang] ?? MESSAGES.es;

// ── Table (created on first use; additive, never touches other tables). Keep in step with db/receiptsSchema.ts ──
let tableReady: Promise<void> | null = null;
export function ensureReceiptsTable(db: Db): Promise<void> {
  tableReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS receipts (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        expenseId BIGINT UNSIGNED NULL,
        fileName VARCHAR(255) NOT NULL,
        mimeType VARCHAR(100) NOT NULL,
        size INT NOT NULL,
        data LONGBLOB NOT NULL,
        thumb MEDIUMBLOB NULL,
        merchant VARCHAR(255) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        date DATE NOT NULL,
        category VARCHAR(100) NOT NULL,
        paymentMethod ENUM('cash', 'zelle', 'card') NOT NULL,
        notes TEXT,
        attached BOOLEAN NOT NULL DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX receipts_userId_date_idx (userId, date),
        INDEX receipts_userId_createdAt_idx (userId, createdAt)
      )
    `);
    // Tables made before "attached" existed get the column (additive; every old receipt owns its expense).
    await addColumnIfMissing(db, "receipts", "attached", sql`ALTER TABLE receipts ADD COLUMN attached BOOLEAN NOT NULL DEFAULT FALSE`);
  })().catch((e) => {
    tableReady = null;
    throw e;
  });
  return tableReady;
}

/** Adds a column to an existing table once; another process adding it at the same moment is fine. */
export async function addColumnIfMissing(db: Db, table: string, column: string, ddl: ReturnType<typeof sql>): Promise<void> {
  const rows = (await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `)) as unknown as [Array<{ n: number | string }>];
  if (Number(rows[0]?.[0]?.n ?? 0) > 0) return;
  try {
    await db.execute(ddl);
  } catch (e: unknown) {
    // ER_DUP_FIELDNAME: added meanwhile.
    const err = e as { errno?: number; cause?: { errno?: number } };
    if (err.errno !== 1060 && err.cause?.errno !== 1060) throw e;
  }
}

// ── Gastos tables (schema in db/receiptsSchema.ts; used by api/expenses-router.ts and "Subir recibo" here) ──
let expenseTablesReady: Promise<void> | null = null;
export function ensureExpenseTables(db: Db): Promise<void> {
  expenseTablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expenseLimits (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        category VARCHAR(40) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE INDEX expenseLimits_user_category_idx (userId, category)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expenseBankLinks (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        expenseId BIGINT UNSIGNED NOT NULL,
        bankTransactionId BIGINT UNSIGNED NOT NULL,
        status ENUM('linked', 'dismissed') NOT NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE INDEX expenseBankLinks_pair_idx (expenseId, bankTransactionId),
        INDEX expenseBankLinks_user_idx (userId),
        INDEX expenseBankLinks_tx_idx (bankTransactionId)
      )
    `);
  })().catch((e) => {
    expenseTablesReady = null;
    throw e;
  });
  return expenseTablesReady;
}

/** Deletes every receipt of a user (for when an account is deleted; their expenses go with the account). */
export async function deleteUserReceipts(db: Db, userId: number): Promise<void> {
  // Each table exists only once someone used it: nothing to delete otherwise.
  const deletes = [
    () => db.delete(receipts).where(eq(receipts.userId, userId)),
    () => db.delete(expenseLimits).where(eq(expenseLimits.userId, userId)),
    () => db.delete(expenseBankLinks).where(eq(expenseBankLinks.userId, userId)),
  ];
  for (const del of deletes) {
    try {
      await del();
    } catch (e: unknown) {
      if (!isMissingTable(e)) throw e;
    }
  }
}

/** Every procedure: the plan must include Recibos; then the table must exist. */
async function open(user: CtxUser, lang: Lang): Promise<{ db: Db; plan: PlanContext; userId: number }> {
  const plan = await requireFeature(getDb(), user, "receipts", lang);
  const db = getDb();
  await ensureReceiptsTable(db);
  return { db, plan, userId: Number(user.id) };
}

// ── Monthly cap ──
async function uploadedThisMonth(db: Db, userId: number): Promise<number> {
  const rows: { n: number | string }[] = await db.select({ n: sql<number>`count(*)` }).from(receipts)
    .where(and(eq(receipts.userId, userId), gte(receipts.createdAt, monthStartUtc(new Date()))));
  return Number(rows[0]?.n ?? 0);
}

const usageOf = (plan: PlanContext, used: number): ReceiptUsage => receiptUsage(plan.tier ?? "basic", used);

// ── Input ──
const idInput = z.object({ id: z.number().int().positive() });
const monthInput = z.object({ year: z.number().int().min(FIRST_RECEIPT_YEAR).max(2100), month: z.number().int().min(1).max(12) });
const fieldsInput = {
  merchant: z.string().trim().min(1).max(MAX_MERCHANT_LENGTH),
  amount: z.number().positive().max(MAX_RECEIPT_AMOUNT).refine((n) => toCents(n) >= 1, "Amount must be at least 0.01"),
  date: z.string().refine(isIsoDate, "Use a real date as YYYY-MM-DD"),
  category: z.enum(RECEIPT_CATEGORIES),
  paymentMethod: z.enum(RECEIPT_PAYMENT_METHODS),
  notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
};
const fileInput = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(TAX_FILE_TYPES),
  // base64 of at most TAX_MAX_FILE_BYTES
  dataBase64: z.string().min(8).max(Math.ceil((TAX_MAX_FILE_BYTES * 4) / 3) + 8),
  /** Optional small JPEG preview made by the browser. */
  thumbBase64: z.string().max(Math.ceil((RECEIPT_THUMB_MAX_BYTES * 4) / 3) + 8).optional(),
});

type ExpenseFields = {
  merchant: string;
  category: string;
  amountCents: number;
  paymentMethod: ReceiptPaymentMethod;
  /** YYYY-MM-DD, written as text so no time zone moves the day. */
  date: string;
  notes: string | null;
};

function expenseFields(input: { merchant: string; category: string; amount: number; paymentMethod: ReceiptPaymentMethod; date: string; notes?: string }): ExpenseFields {
  return {
    merchant: input.merchant,
    category: input.category,
    amountCents: toCents(input.amount),
    paymentMethod: input.paymentMethod,
    date: input.date,
    notes: input.notes ? input.notes : null,
  };
}

/** Checks the upload like Impuestos does: size, real file type (sniffTaxFile), and that it can be encrypted. */
function decodeFile(file: z.infer<typeof fileInput>, lang: Lang): { buf: Buffer; fileName: string; thumb: Buffer | null } {
  const m = say(lang);
  const buf = Buffer.from(file.dataBase64, "base64");
  if (buf.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: m.badFile });
  if (buf.length > TAX_MAX_FILE_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: m.tooBig });
  if (!sniffTaxFile(buf, file.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: m.badFile });
  if (!hasTaxKey()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: m.noKey });
  // Keep only a safe display name: no paths, no control characters.
  const printable = Array.from(file.fileName).filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join("");
  const fileName = printable.replace(/[\\/]/g, "_").slice(0, 200) || "recibo";
  // A preview that isn't a small real JPEG is dropped (the list then shows an icon), never an error.
  const t = file.thumbBase64 ? Buffer.from(file.thumbBase64, "base64") : null;
  const thumb = t && t.length > 0 && t.length <= RECEIPT_THUMB_MAX_BYTES && sniffTaxFile(t, "image/jpeg") ? t : null;
  return { buf, fileName, thumb };
}

// ── The expense and its journal entry (same accounts and shape as expenses.create) ──
// Not called through expensesRouter.createCaller because, there, (1) the entry number is
// always GAS-<today>-0001 (it counts entries created after "now"), which the unique index on
// journalEntries.entryNumber rejects from the second expense of the day; (2) the date goes in as
// a JS Date at UTC midnight, which can land on the previous day; (3) nothing is in a transaction.

/** The account the money leaves from, as in expenses.create (card -> the bank, 1120). */
const PAYMENT_ACCOUNT: Record<ReceiptPaymentMethod, string> = { cash: "1110", zelle: "1130", card: "1120" };
const EXPENSE_ACCOUNT = "5100";

async function insertExpense(tx: Db, userId: number, receiptId: number, f: ExpenseFields): Promise<number> {
  const res = await tx.insert(expenses).values({
    description: f.merchant,
    category: f.category,
    amount: centsToDecimal(f.amountCents),
    paymentMethod: f.paymentMethod,
    date: f.date,
    receipt: String(receiptId),
    notes: f.notes,
    createdBy: userId,
  });
  return Number(res[0].insertId);
}

/** Debit Gastos (5100), credit the payment account. Skipped, like in expenses.create, when the chart of accounts isn't there yet: the accounting repair adds it later. */
async function postExpenseEntry(tx: Db, userId: number, receiptId: number, expenseId: number, f: ExpenseFields): Promise<void> {
  const payCode = PAYMENT_ACCOUNT[f.paymentMethod];
  const accs: { id: number; code: string }[] = await tx.select({ id: accounts.id, code: accounts.code }).from(accounts)
    .where(and(eq(accounts.userId, userId), inArray(accounts.code, [payCode, EXPENSE_ACCOUNT])))
    .orderBy(accounts.id);
  const paymentAccId = accs.find((a) => a.code === payCode)?.id;
  const expenseAccId = accs.find((a) => a.code === EXPENSE_ACCOUNT)?.id;
  if (!paymentAccId || !expenseAccId) return;
  const amount = centsToDecimal(f.amountCents);
  const description = `Gasto: ${f.merchant}`;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const je = await tx.insert(journalEntries).values({
    // Unique: one receipt, one expense, and the old entry is always deleted before posting again.
    entryNumber: `GAS-${today}-R${receiptId}-E${expenseId}`,
    date: f.date,
    description,
    reference: `EXP-${expenseId}`,
    referenceId: expenseId,
    referenceType: "purchase",
    debitTotal: amount,
    creditTotal: amount,
    createdBy: userId,
  });
  const jeId = Number(je[0].insertId);
  await tx.insert(journalEntryLines).values([
    { journalEntryId: jeId, accountId: expenseAccId, debit: amount, credit: "0", description },
    { journalEntryId: jeId, accountId: paymentAccId, debit: "0", credit: amount, description: `Pago ${f.paymentMethod}` },
  ]);
}

/**
 * Removes the journal entries of one expense: the one written here or by expenses.create
 * (reference EXP-<id>) and the ones the accounting repair adds (reference exp_<id>).
 */
export async function deleteExpenseEntries(tx: Db, userId: number, expenseId: number): Promise<void> {
  const rows: { id: number }[] = await tx.select({ id: journalEntries.id }).from(journalEntries).where(and(
    eq(journalEntries.createdBy, userId),
    eq(journalEntries.referenceId, expenseId),
    inArray(journalEntries.reference, [`EXP-${expenseId}`, `exp_${expenseId}`]),
  ));
  const ids = rows.map((r) => r.id);
  if (!ids.length) return;
  await tx.delete(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, ids));
  await tx.delete(journalEntries).where(inArray(journalEntries.id, ids));
}

/** "linked": the expense is this receipt's; "missing": it was deleted elsewhere; "other": it now belongs to something else (left alone). */
async function expenseState(tx: Db, userId: number, receiptId: number, expenseId: number): Promise<"linked" | "missing" | "other"> {
  const rows: { receipt: string | null }[] = await tx.select({ receipt: expenses.receipt }).from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.createdBy, userId))).limit(1);
  if (!rows[0]) return "missing";
  return rows[0].receipt === String(receiptId) ? "linked" : "other";
}

/** The receipt, locked for the rest of the transaction; NOT_FOUND unless it's the user's. */
async function lockReceipt(tx: Db, userId: number, id: number, lang: Lang): Promise<{ id: number; expenseId: number | null; attached: boolean | number }> {
  const rows: { id: number; expenseId: number | null; attached: boolean | number }[] = await tx.select({ id: receipts.id, expenseId: receipts.expenseId, attached: receipts.attached }).from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.userId, userId))).limit(1).for("update");
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: say(lang).notFound });
  return rows[0];
}

// ── What the list shows (no file bytes) ──
const meta = {
  id: receipts.id,
  expenseId: receipts.expenseId,
  fileName: receipts.fileName,
  mimeType: receipts.mimeType,
  size: receipts.size,
  merchant: receipts.merchant,
  amount: receipts.amount,
  date: sql<string>`DATE_FORMAT(${receipts.date}, '%Y-%m-%d')`,
  category: receipts.category,
  paymentMethod: receipts.paymentMethod,
  notes: receipts.notes,
  createdAt: receipts.createdAt,
  hasThumb: sql<number>`(${receipts.thumb} IS NOT NULL)`,
  attached: receipts.attached,
};
type MetaRow = {
  id: number; expenseId: number | null; fileName: string; mimeType: string; size: number; merchant: string; amount: string; date: string;
  category: string; paymentMethod: ReceiptPaymentMethod; notes: string | null; createdAt: Date; hasThumb: number | string; attached: boolean | number;
};
export type ReceiptItem = Omit<MetaRow, "amount" | "hasThumb" | "attached"> & { amount: number; hasThumb: boolean; attached: boolean };

function inMonth(userId: number, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  return and(eq(receipts.userId, userId), sql`${receipts.date} >= ${start}`, sql`${receipts.date} < ${end}`);
}

/** Previews returned at most per month (newest first); older ones show an icon. */
const MAX_THUMBS = 300;

// ── Reading a receipt (or a vendor's bill) with Claude ──
// Only when ANTHROPIC_API_KEY is set; otherwise the form is simply typed by hand. Runs on the server, sends the
// photo to Claude once and keeps nothing: no file, no answer, no log of either. Same model as the assistant
// (api/assistant-router.ts). It doesn't use the assistant's monthly questions; a few reads in a row are allowed
// per business (READS_PER_WINDOW), and on a capped plan only while photos are left this month.
const READ_MODEL = "claude-opus-5-5";
let readClient: Anthropic | null = null;
function reader(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  readClient ??= new Anthropic({ timeout: 60_000, maxRetries: 1 });
  return readClient;
}
/** True when receipts and bills can be read for the person (the server has a Claude key). */
export const canReadDocuments = (): boolean => !!process.env.ANTHROPIC_API_KEY;

/** Image types Claude reads (HEIC isn't one: those receipts are typed by hand). */
const READABLE_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Claude takes images up to 5 MB; PDFs up to the app's own 10 MB. */
const MAX_READ_IMAGE_BYTES = 5 * 1024 * 1024;

const READS_PER_WINDOW = 20;
const READ_WINDOW_MS = 10 * 60_000;
const recentReads = new Map<number, number[]>();
/** One more read for this business, unless it already did READS_PER_WINDOW in the last 10 minutes. */
function takeReadSlot(userId: number, now = Date.now()): boolean {
  const list = (recentReads.get(userId) ?? []).filter((t) => now - t < READ_WINDOW_MS);
  if (list.length >= READS_PER_WINDOW) {
    recentReads.set(userId, list);
    return false;
  }
  list.push(now);
  recentReads.set(userId, list);
  if (recentReads.size > 5000) recentReads.clear();
  return true;
}

const ReceiptReading = z.object({
  is_receipt: z.boolean(),
  merchant: z.string().nullable(),
  total: z.number().nullable(),
  date: z.string().nullable(),
  category: z.enum(RECEIPT_CATEGORIES).nullable(),
  paid_with: z.enum(["cash", "card", "unknown"]),
});
const BillReading = z.object({
  is_bill: z.boolean(),
  vendor: z.string().nullable(),
  concept: z.string().nullable(),
  total: z.number().nullable(),
  due_date: z.string().nullable(),
  bill_date: z.string().nullable(),
});

export type ReceiptRead = { merchant: string | null; amount: number | null; date: string | null; category: ReceiptCategory | null; paymentMethod: "cash" | "card" | null };
export type BillRead = { vendor: string | null; description: string | null; amount: number | null; dueDate: string | null };
export type ReadOutcome<T> = { status: "read"; fields: T } | { status: "off" | "unsupported" | "unreadable" };

const RECEIPT_PROMPT = (today: string) => `This is a photo or PDF of a purchase receipt for a small business in the United States.
Read it and fill in the fields:
- is_receipt: false if this isn't a receipt, a bill or an invoice for a purchase.
- merchant: the store or business name as printed at the top (not the street address), in normal capitalization.
- total: the final amount paid, with tax and after discounts, as a number (e.g. 127.45). Not the subtotal, not the change.
- date: the purchase date as YYYY-MM-DD. Receipts are usually from the last few weeks; today is ${today}.
- category: the closest one for what was bought, or null if you can't tell.
- paid_with: "card" if it shows a card payment (VISA, MASTERCARD, DEBIT, last 4 digits...), "cash" if paid in cash, else "unknown".
Use null for anything you can't read clearly. Never guess a number.`;

const BILL_PROMPT = (today: string) => `This is a photo or PDF of a bill (invoice) that a small business in the United States received from a vendor and has to pay.
Read it and fill in the fields:
- is_bill: false if this isn't a bill or invoice to pay.
- vendor: the business that sent the bill (who must be paid), in normal capitalization.
- concept: a short description of what it's for, in the bill's language, at most 80 characters (include the invoice number if printed).
- total: the total amount due as a number (e.g. 312.40).
- due_date: the payment due date as YYYY-MM-DD, or null if not printed.
- bill_date: the date of the bill as YYYY-MM-DD, or null.
Today is ${today}. Use null for anything you can't read clearly. Never guess a number.`;

/** A day Claude read, kept only when it's a real date within the last two years and not after tomorrow. */
function readDay(v: string | null, today: string, allowFuture: boolean): string | null {
  if (!v || !isIsoDate(v)) return null;
  const t = Date.parse(`${today}T00:00:00Z`), d = Date.parse(`${v}T00:00:00Z`);
  if (d < t - 730 * 86_400_000) return null;
  if (!allowFuture && d > t + 86_400_000) return null;
  if (allowFuture && d > t + 400 * 86_400_000) return null;
  return v;
}
function readAmount(v: number | null): number | null {
  if (v === null || !Number.isFinite(v) || v <= 0 || v > MAX_RECEIPT_AMOUNT) return null;
  return Math.round(v * 100) / 100;
}
function readText(v: string | null, max: number): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Asks Claude to read one receipt or bill. "off": no key on the server; "unsupported": a file type it can't read
 * (HEIC) or too big; "unreadable": it isn't a receipt / bill, Claude declined, or the call failed (the person types it).
 */
export async function readDocument(kind: "receipt", file: { mimeType: string; buf: Buffer }, today: string): Promise<ReadOutcome<ReceiptRead>>;
export async function readDocument(kind: "bill", file: { mimeType: string; buf: Buffer }, today: string): Promise<ReadOutcome<BillRead>>;
export async function readDocument(kind: "receipt" | "bill", file: { mimeType: string; buf: Buffer }, today: string): Promise<ReadOutcome<ReceiptRead | BillRead>> {
  const api = reader();
  if (!api) return { status: "off" };
  const isPdf = file.mimeType === "application/pdf";
  if (!isPdf && !READABLE_IMAGES.has(file.mimeType)) return { status: "unsupported" };
  if (!isPdf && file.buf.length > MAX_READ_IMAGE_BYTES) return { status: "unsupported" };
  const data = file.buf.toString("base64");
  const media = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: file.mimeType as "image/jpeg" | "image/png" | "image/webp", data } };
  try {
    if (kind === "receipt") {
      const res = await api.beta.messages.parse({
        model: READ_MODEL,
        max_tokens: 4000,
        // A short extraction: low effort keeps it quick and cheap.
        output_config: { effort: "low", format: betaZodOutputFormat(ReceiptReading) },
        // If the model declines for policy reasons, the API retries on its default fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content: [media, { type: "text", text: RECEIPT_PROMPT(today) }] }],
      });
      const out = res.stop_reason === "refusal" ? null : res.parsed_output;
      if (!out || !out.is_receipt) return { status: "unreadable" };
      return {
        status: "read",
        fields: {
          merchant: readText(out.merchant, MAX_MERCHANT_LENGTH),
          amount: readAmount(out.total),
          date: readDay(out.date, today, false),
          category: out.category,
          paymentMethod: out.paid_with === "unknown" ? null : out.paid_with,
        },
      };
    }
    const res = await api.beta.messages.parse({
      model: READ_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(BillReading) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [media, { type: "text", text: BILL_PROMPT(today) }] }],
    });
    const out = res.stop_reason === "refusal" ? null : res.parsed_output;
    if (!out || !out.is_bill) return { status: "unreadable" };
    return {
      status: "read",
      fields: {
        vendor: readText(out.vendor, 120),
        description: readText(out.concept, 255),
        amount: readAmount(out.total),
        dueDate: readDay(out.due_date, today, true),
      },
    };
  } catch (e: unknown) {
    // Never the file or its content in the log: only what went wrong.
    if (e instanceof Anthropic.APIError) console.error("[receipts.read] API error", e.status, e.name);
    else console.error("[receipts.read] failed:", e instanceof Error ? e.name : "unknown");
    return { status: "unreadable" };
  }
}

/** Checks a file sent only to be read (same checks as an upload, minus the encryption key). */
export function decodeReadFile(file: { mimeType: string; dataBase64: string }, lang: Lang): Buffer {
  const m = say(lang);
  const buf = Buffer.from(file.dataBase64, "base64");
  if (buf.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: m.badFile });
  if (buf.length > TAX_MAX_FILE_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: m.tooBig });
  if (!sniffTaxFile(buf, file.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: m.badFile });
  return buf;
}

/** Gives one read slot, or refuses with TOO_MANY_REQUESTS. */
export function claimRead(userId: number, lang: Lang): void {
  if (!takeReadSlot(userId)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: say(lang).readBusy });
}

/** The user's today (from the app) when it's a real day close to the server's; else the server's (UTC). */
function clientToday(v: string | undefined): string {
  const server = new Date().toISOString().slice(0, 10);
  if (!v || !isIsoDate(v)) return server;
  return Math.abs(Date.parse(v) - Date.parse(server)) <= 2 * 86_400_000 ? v : server;
}

// ── "Subir recibo" on a bank charge: the account it went out of ──
const last4 = (n: string | null | undefined) => (n ?? "").replace(/\D/g, "").slice(-4);
export function accountLabel(bankName: string | null | undefined, accountNumber: string | null | undefined): string | null {
  const name = (bankName ?? "").trim();
  const l4 = last4(accountNumber);
  if (!name && !l4) return null;
  return l4 ? `${name || "Banco"} ••${l4}` : name;
}

/** A receipt category for an existing expense's category (a paid bill has none of its own: "other"). */
function receiptCategoryFor(expenseCategory: string): ReceiptCategory {
  const c = expenseSpendCategory(expenseCategory);
  return c === "vendors" ? "other" : c;
}

export const receiptsRouter = createRouter({
  /** Receipts uploaded this calendar month and the plan's cap (null = no cap). */
  usage: authedQuery.query(async ({ ctx }) => {
    const { db, plan, userId } = await open(ctx.user, ctx.lang);
    // `reading`: the photo can be read to fill in the form (the server has a Claude key).
    return { ...usageOf(plan, await uploadedThisMonth(db, userId)), reading: canReadDocuments() };
  }),

  /**
   * Reads a receipt photo or PDF and suggests merchant, total, date, category and how it was paid. Saves nothing
   * (the person reviews the form and saves the receipt with receipts.create). On a capped plan, only while photos
   * are left this month, so a read never leads to a photo that can't be saved.
   */
  read: authedQuery
    .input(z.object({
      file: z.object({ mimeType: z.enum(TAX_FILE_TYPES), dataBase64: fileInput.shape.dataBase64 }),
      today: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<ReadOutcome<ReceiptRead>> => {
      const { db, plan, userId } = await open(ctx.user, ctx.lang);
      if (!canReadDocuments()) return { status: "off" };
      const usage = usageOf(plan, await uploadedThisMonth(db, userId));
      if (!usage.canUpload) throw new TRPCError({ code: "FORBIDDEN", message: say(ctx.lang).capReached(usage.cap ?? 0) });
      const buf = decodeReadFile(input.file, ctx.lang);
      claimRead(userId, ctx.lang);
      return readDocument("receipt", { mimeType: input.file.mimeType, buf }, clientToday(input.today));
    }),

  /**
   * "Subir recibo" in Gastos: the photo of an expense that's already there, or of a bank charge.
   * - expenseId: the photo is added to that expense (receipts.attached = 1); the expense doesn't change.
   * - bankTransactionId: the receipt records the charge as an expense (its amount, day and category) and joins
   *   it to the charge (expenseBankLinks), so Gastos shows it once, with its receipt.
   * Counts against the monthly photos like any receipt.
   */
  attach: authedQuery
    .input(z.object({
      file: fileInput,
      expenseId: z.number().int().positive().optional(),
      bankTransactionId: z.number().int().positive().optional(),
    }).refine((v) => !!v.expenseId !== !!v.bankTransactionId, "Pick an expense or a bank charge"))
    .mutation(async ({ ctx, input }) => {
      const { db, plan, userId } = await open(ctx.user, ctx.lang);
      const m = say(ctx.lang);
      const { buf, fileName, thumb } = decodeFile(input.file, ctx.lang);
      const data = encryptTaxFile(buf);
      const thumbData = thumb ? encryptTaxFile(thumb) : null;
      if (input.bankTransactionId) await ensureExpenseTables(db);
      const capped = usageOf(plan, 0).cap !== null;
      return db.transaction(async (tx: Db) => {
        if (capped) await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
        const before = usageOf(plan, await uploadedThisMonth(tx, userId));
        if (!before.canUpload) throw new TRPCError({ code: "FORBIDDEN", message: m.capReached(before.cap ?? 0) });
        const file = { userId, fileName, mimeType: input.file.mimeType, size: buf.length, data, thumb: thumbData };

        if (input.expenseId) {
          type Row = { id: number; description: string; category: string; amount: string; paymentMethod: ReceiptPaymentMethod; date: string; receipt: string | null; notes: string | null };
          const rows: Row[] = await tx.select({
            id: expenses.id, description: expenses.description, category: expenses.category, amount: expenses.amount,
            paymentMethod: expenses.paymentMethod, date: sql<string>`DATE_FORMAT(${expenses.date}, '%Y-%m-%d')`, receipt: expenses.receipt, notes: expenses.notes,
          }).from(expenses).where(and(eq(expenses.id, input.expenseId), eq(expenses.createdBy, userId))).limit(1).for("update");
          const exp = rows[0];
          if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: m.expenseNotFound });
          if (exp.receipt) throw new TRPCError({ code: "CONFLICT", message: m.alreadyHasReceipt });
          const ins = await tx.insert(receipts).values({
            ...file, expenseId: exp.id, attached: true,
            merchant: exp.description.slice(0, MAX_MERCHANT_LENGTH), amount: centsToDecimal(toCents(exp.amount)), date: exp.date,
            category: receiptCategoryFor(exp.category), paymentMethod: exp.paymentMethod, notes: null,
          });
          const id = Number(ins[0].insertId);
          await tx.update(expenses).set({ receipt: String(id) }).where(and(eq(expenses.id, exp.id), eq(expenses.createdBy, userId)));
          return { id, expenseId: exp.id, usage: usageOf(plan, before.used + 1) };
        }

        // A bank charge: business money out of one of the user's accounts, not yet joined to an expense.
        type Tx = {
          id: number; description: string; merchantName: string | null; amount: string; date: string; category: string; type: string;
          isDuplicate: boolean | number | null; bankName: string | null; accountNumber: string | null;
        };
        const txs: Tx[] = await tx.select({
          id: bankTransactions.id, description: bankTransactions.description, merchantName: bankTransactions.merchantName,
          amount: bankTransactions.amount, date: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
          category: bankTransactions.category, type: bankTransactions.type, isDuplicate: bankTransactions.isDuplicate,
          bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber,
        }).from(bankTransactions).leftJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId))
          .where(and(eq(bankTransactions.id, input.bankTransactionId!), eq(bankTransactions.userId, userId))).limit(1);
        const bt = txs[0];
        if (!bt || !isBusinessSpending({ type: bt.type, category: bt.category, isDuplicate: bt.isDuplicate })) {
          throw new TRPCError({ code: "NOT_FOUND", message: m.bankNotFound });
        }
        const taken: Array<{ id: number }> = await tx.select({ id: expenseBankLinks.id }).from(expenseBankLinks)
          .where(and(eq(expenseBankLinks.userId, userId), eq(expenseBankLinks.bankTransactionId, bt.id), eq(expenseBankLinks.status, "linked"))).limit(1);
        if (taken.length) throw new TRPCError({ code: "CONFLICT", message: m.bankTaken });
        const spend = bankSpendCategory(bt.category);
        const f: ExpenseFields = {
          merchant: displayNameOf(bt.description, bt.merchantName).slice(0, MAX_MERCHANT_LENGTH) || "Banco",
          category: spend === "vendors" ? "other" : spend,
          amountCents: Math.abs(spendCents(bt.amount)),
          paymentMethod: bt.category === "zelle_sent" ? "zelle" : "card",
          date: bt.date,
          notes: null,
        };
        const ins = await tx.insert(receipts).values({
          ...file, merchant: f.merchant, amount: centsToDecimal(f.amountCents), date: f.date, category: f.category, paymentMethod: f.paymentMethod, notes: null,
        });
        const id = Number(ins[0].insertId);
        const expenseId = await insertExpense(tx, userId, id, f);
        await postExpenseEntry(tx, userId, id, expenseId, f);
        await tx.update(receipts).set({ expenseId }).where(eq(receipts.id, id));
        await tx.insert(expenseBankLinks).values({ userId, expenseId, bankTransactionId: bt.id, status: "linked" });
        return { id, expenseId, usage: usageOf(plan, before.used + 1) };
      });
    }),

  /** One month's receipts (by receipt date), with the month's total and totals by category. */
  list: authedQuery.input(monthInput).query(async ({ ctx, input }) => {
    const { db, userId } = await open(ctx.user, ctx.lang);
    const rows: MetaRow[] = await db.select(meta).from(receipts)
      .where(inMonth(userId, input.year, input.month))
      .orderBy(desc(receipts.date), desc(receipts.id));
    const items: ReceiptItem[] = rows.map(({ amount, hasThumb, attached, ...r }) => ({ ...r, amount: Number(amount), hasThumb: Number(hasThumb) === 1, attached: Number(attached) === 1 }));
    return { items, totals: receiptTotals(items) };
  }),

  /** Small previews for one month's receipts, decrypted (only the ones that have one). */
  thumbs: authedQuery.input(monthInput).query(async ({ ctx, input }) => {
    const { db, userId } = await open(ctx.user, ctx.lang);
    if (!hasTaxKey()) return [] as { id: number; dataBase64: string }[];
    const rows: { id: number; thumb: Buffer }[] = await db.select({ id: receipts.id, thumb: receipts.thumb }).from(receipts)
      .where(and(inMonth(userId, input.year, input.month), isNotNull(receipts.thumb)))
      .orderBy(desc(receipts.date), desc(receipts.id))
      .limit(MAX_THUMBS);
    const out: { id: number; dataBase64: string }[] = [];
    for (const r of rows) {
      try {
        out.push({ id: r.id, dataBase64: decryptTaxFile(Buffer.from(r.thumb)).toString("base64") });
      } catch {
        // An unreadable preview: the list shows an icon instead.
      }
    }
    return out;
  }),

  /** Saves the photo and records the expense (and its journal entry), all or nothing. */
  create: authedQuery
    .input(z.object({ ...fieldsInput, file: fileInput }))
    .mutation(async ({ ctx, input }) => {
      const { db, plan, userId } = await open(ctx.user, ctx.lang);
      const { buf, fileName, thumb } = decodeFile(input.file, ctx.lang);
      const f = expenseFields(input);
      const data = encryptTaxFile(buf);
      const thumbData = thumb ? encryptTaxFile(thumb) : null;
      const capped = usageOf(plan, 0).cap !== null;
      return db.transaction(async (tx: Db) => {
        // With a cap, one upload at a time per business, so two at once can't both take the last photo.
        if (capped) await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
        const before = usageOf(plan, await uploadedThisMonth(tx, userId));
        if (!before.canUpload) throw new TRPCError({ code: "FORBIDDEN", message: say(ctx.lang).capReached(before.cap ?? 0) });
        const ins = await tx.insert(receipts).values({
          userId, fileName, mimeType: input.file.mimeType, size: buf.length, data, thumb: thumbData,
          merchant: f.merchant, amount: centsToDecimal(f.amountCents), date: f.date, category: f.category, paymentMethod: f.paymentMethod, notes: f.notes,
        });
        const id = Number(ins[0].insertId);
        const expenseId = await insertExpense(tx, userId, id, f);
        await postExpenseEntry(tx, userId, id, expenseId, f);
        await tx.update(receipts).set({ expenseId }).where(eq(receipts.id, id));
        return { id, expenseId, usage: usageOf(plan, before.used + 1) };
      });
    }),

  /** Changes the details; the expense and its journal entry follow. */
  update: authedQuery
    .input(idInput.extend(fieldsInput))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = await open(ctx.user, ctx.lang);
      const f = expenseFields(input);
      return db.transaction(async (tx: Db) => {
        const rec = await lockReceipt(tx, userId, input.id, ctx.lang);
        // The photo of an expense that already existed: that expense is changed in Gastos, not here.
        if (Number(rec.attached) === 1) throw new TRPCError({ code: "CONFLICT", message: say(ctx.lang).attachedEdit });
        await tx.update(receipts).set({
          merchant: f.merchant, amount: centsToDecimal(f.amountCents), date: f.date, category: f.category, paymentMethod: f.paymentMethod, notes: f.notes,
        }).where(eq(receipts.id, rec.id));
        const state = rec.expenseId ? await expenseState(tx, userId, rec.id, rec.expenseId) : "missing";
        let expenseId: number;
        if (rec.expenseId && state === "linked") {
          expenseId = rec.expenseId;
          await tx.update(expenses).set({
            description: f.merchant, category: f.category, amount: centsToDecimal(f.amountCents), paymentMethod: f.paymentMethod, date: f.date, notes: f.notes,
          }).where(and(eq(expenses.id, expenseId), eq(expenses.createdBy, userId)));
          await deleteExpenseEntries(tx, userId, expenseId);
        } else {
          // The expense was deleted elsewhere: drop its leftover entries and record it again.
          if (rec.expenseId && state === "missing") await deleteExpenseEntries(tx, userId, rec.expenseId);
          expenseId = await insertExpense(tx, userId, rec.id, f);
          await tx.update(receipts).set({ expenseId }).where(eq(receipts.id, rec.id));
        }
        await postExpenseEntry(tx, userId, rec.id, expenseId, f);
        return { id: rec.id, expenseId };
      });
    }),

  /**
   * Deletes the receipt, its expense and the expense's journal entries. A photo added to an expense that
   * already existed (attached) takes only the photo away: the expense stays.
   */
  remove: authedQuery.input(idInput).mutation(async ({ ctx, input }) => {
    const { db, userId } = await open(ctx.user, ctx.lang);
    await ensureExpenseTables(db);
    await db.transaction(async (tx: Db) => {
      const rec = await lockReceipt(tx, userId, input.id, ctx.lang);
      if (Number(rec.attached) === 1) {
        if (rec.expenseId) {
          await tx.update(expenses).set({ receipt: null })
            .where(and(eq(expenses.id, rec.expenseId), eq(expenses.createdBy, userId), eq(expenses.receipt, String(rec.id))));
        }
      } else if (rec.expenseId) {
        const state = await expenseState(tx, userId, rec.id, rec.expenseId);
        if (state !== "other") await deleteExpenseEntries(tx, userId, rec.expenseId);
        if (state === "linked") {
          await tx.delete(expenses).where(and(eq(expenses.id, rec.expenseId), eq(expenses.createdBy, userId)));
          // Its bank charge, if it was joined to one, shows on its own again.
          await tx.delete(expenseBankLinks).where(and(eq(expenseBankLinks.userId, userId), eq(expenseBankLinks.expenseId, rec.expenseId)));
        }
      }
      await tx.delete(receipts).where(eq(receipts.id, rec.id));
    });
    return { ok: true };
  }),

  /** One receipt's file, decrypted. Its owner only. */
  file: authedQuery.input(idInput).query(async ({ ctx, input }) => {
    const { db, userId } = await open(ctx.user, ctx.lang);
    const rows: { fileName: string; mimeType: string; data: Buffer }[] = await db
      .select({ fileName: receipts.fileName, mimeType: receipts.mimeType, data: receipts.data }).from(receipts)
      .where(and(eq(receipts.id, input.id), eq(receipts.userId, userId))).limit(1);
    const r = rows[0];
    if (!r) throw new TRPCError({ code: "NOT_FOUND", message: say(ctx.lang).notFound });
    if (!hasTaxKey()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: say(ctx.lang).noKey });
    return { fileName: r.fileName, mimeType: r.mimeType, dataBase64: decryptTaxFile(Buffer.from(r.data)).toString("base64") };
  }),
});
