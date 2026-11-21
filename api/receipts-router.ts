// ── Recibos: receipt photos for business expenses ──
// The owner (or a team member) photographs a receipt and says who, how much, when and
// how it was paid. The photo is stored encrypted, with the same AES-256-GCM key as the
// tax documents (lib/taxCrypto.ts), and a matching expense is recorded with the same
// journal entry expenses.create writes, so the receipt counts in Reportes and the books.
// Business Básico: 20 photos a calendar month; Pro and Negocio: no cap (contracts/planFeatures.ts).
//
// Link: receipts.expenseId -> expenses.id, and expenses.receipt holds the receipt id (as text).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { accounts, expenses, journalEntries, journalEntryLines } from "@db/schema";
import { receipts } from "@db/receiptsSchema";
import { TAX_FILE_TYPES, TAX_MAX_FILE_BYTES } from "@contracts/taxRules";
import { requireFeature, type PlanContext } from "./lib/planAccess";
import type { Lang } from "./lib/i18n";
import { decryptTaxFile, encryptTaxFile, hasTaxKey } from "./lib/taxCrypto";
import { sniffTaxFile } from "./tax-router";
import {
  FIRST_RECEIPT_YEAR, MAX_MERCHANT_LENGTH, MAX_NOTES_LENGTH, MAX_RECEIPT_AMOUNT, RECEIPT_CATEGORIES, RECEIPT_PAYMENT_METHODS,
  RECEIPT_THUMB_MAX_BYTES, centsToDecimal, isIsoDate, monthRange, monthStartUtc, receiptTotals, receiptUsage, toCents,
  type ReceiptPaymentMethod, type ReceiptUsage,
} from "./lib/receipts";

type Db = ReturnType<typeof getDb>;
type CtxUser = { id: number | string; role?: string | null; modePreference?: string | null; createdAt?: Date | string | null };

// ── Messages for the user (es/en, picked by ctx.lang) ──
type Messages = { capReached: (cap: number) => string; badFile: string; tooBig: string; noKey: string; notFound: string };
const MESSAGES: Record<Lang, Messages> = {
  es: {
    capReached: (cap) => `Ya subiste tus ${cap} fotos de recibo de este mes. Se renuevan el día 1, o puedes cambiar de plan en Ajustes.`,
    badFile: "Sube una foto (JPG, PNG, HEIC) o un PDF.",
    tooBig: "El archivo pesa más de 10 MB.",
    noKey: "Todavía no podemos guardar recibos. Inténtalo más tarde.",
    notFound: "No encontramos ese recibo.",
  },
  en: {
    capReached: (cap) => `You already uploaded your ${cap} receipt photos this month. They renew on the 1st, or you can change your plan in Settings.`,
    badFile: "Upload a photo (JPG, PNG, HEIC) or a PDF.",
    tooBig: "The file is larger than 10 MB.",
    noKey: "We can't store receipts yet. Please try again later.",
    notFound: "We couldn't find that receipt.",
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
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX receipts_userId_date_idx (userId, date),
        INDEX receipts_userId_createdAt_idx (userId, createdAt)
      )
    `);
  })().catch((e) => {
    tableReady = null;
    throw e;
  });
  return tableReady;
}

/** Deletes every receipt of a user (for when an account is deleted; their expenses go with the account). */
export async function deleteUserReceipts(db: Db, userId: number): Promise<void> {
  try {
    await db.delete(receipts).where(eq(receipts.userId, userId));
  } catch (e: unknown) {
    // The table doesn't exist until someone uses Recibos: nothing to delete then.
    if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(e instanceof Error ? e.message : String(e))) throw e;
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

/** The account the money leaves from, as in expenses.create (card -> 1150). */
const PAYMENT_ACCOUNT: Record<ReceiptPaymentMethod, string> = { cash: "1110", zelle: "1130", card: "1150" };
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
async function deleteExpenseEntries(tx: Db, userId: number, expenseId: number): Promise<void> {
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
async function lockReceipt(tx: Db, userId: number, id: number, lang: Lang): Promise<{ id: number; expenseId: number | null }> {
  const rows: { id: number; expenseId: number | null }[] = await tx.select({ id: receipts.id, expenseId: receipts.expenseId }).from(receipts)
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
};
type MetaRow = {
  id: number; expenseId: number | null; fileName: string; mimeType: string; size: number; merchant: string; amount: string; date: string;
  category: string; paymentMethod: ReceiptPaymentMethod; notes: string | null; createdAt: Date; hasThumb: number | string;
};
export type ReceiptItem = Omit<MetaRow, "amount" | "hasThumb"> & { amount: number; hasThumb: boolean };

function inMonth(userId: number, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  return and(eq(receipts.userId, userId), sql`${receipts.date} >= ${start}`, sql`${receipts.date} < ${end}`);
}

/** Previews returned at most per month (newest first); older ones show an icon. */
const MAX_THUMBS = 300;

export const receiptsRouter = createRouter({
  /** Receipts uploaded this calendar month and the plan's cap (null = no cap). */
  usage: authedQuery.query(async ({ ctx }) => {
    const { db, plan, userId } = await open(ctx.user, ctx.lang);
    return usageOf(plan, await uploadedThisMonth(db, userId));
  }),

  /** One month's receipts (by receipt date), with the month's total and totals by category. */
  list: authedQuery.input(monthInput).query(async ({ ctx, input }) => {
    const { db, userId } = await open(ctx.user, ctx.lang);
    const rows: MetaRow[] = await db.select(meta).from(receipts)
      .where(inMonth(userId, input.year, input.month))
      .orderBy(desc(receipts.date), desc(receipts.id));
    const items: ReceiptItem[] = rows.map(({ amount, hasThumb, ...r }) => ({ ...r, amount: Number(amount), hasThumb: Number(hasThumb) === 1 }));
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

  /** Deletes the receipt, its expense and the expense's journal entries. */
  remove: authedQuery.input(idInput).mutation(async ({ ctx, input }) => {
    const { db, userId } = await open(ctx.user, ctx.lang);
    await db.transaction(async (tx: Db) => {
      const rec = await lockReceipt(tx, userId, input.id, ctx.lang);
      if (rec.expenseId) {
        const state = await expenseState(tx, userId, rec.id, rec.expenseId);
        if (state !== "other") await deleteExpenseEntries(tx, userId, rec.expenseId);
        if (state === "linked") await tx.delete(expenses).where(and(eq(expenses.id, rec.expenseId), eq(expenses.createdBy, userId)));
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
