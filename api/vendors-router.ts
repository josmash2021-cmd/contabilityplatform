// ── Proveedores y facturas por pagar (business Pro and Negocio) ──
// Vendors the business buys from and the bills it owes them. Marking a bill paid records the
// expense (and its journal entry) exactly like expenses.create, and keeps the link in bills.expenseId.
// Rules (overdue, due this week, totals) live in api/lib/vendors.ts.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { isMissingTable } from "./lib/dbErrors";
import { accounts, expenses, journalEntries, journalEntryLines, periodClosures } from "@db/schema";
import { bills, vendors } from "@db/vendorsSchema";
import { requireFeature, type PlanUser } from "./lib/planAccess";
import type { Lang } from "./lib/i18n";
import {
  MAX_BILL_AMOUNT, balancesByVendor, billTiming, cleanText, daysBetween, daysUntilDue, dueSoonRange, effectiveToday,
  expenseEntryReference, expenseEntryReferences, expenseFromBill, isIsoDate, sameVendorName, summarizeBills, toCents, centsToDecimal,
  utcToday, vendorEntryNumber,
  type BillStatus, type PaymentMethod,
} from "./lib/vendors";

type Db = ReturnType<typeof getDb>;
type Gate = { user: PlanUser; lang: Lang };
type Exec = [{ insertId: number | string; affectedRows: number }];

// ── Messages (es / en, by ctx.lang) ──
const MESSAGES = {
  es: {
    vendorNotFound: "No encontramos ese proveedor.",
    billNotFound: "No encontramos esa factura.",
    vendorMissing: "Elige un proveedor o escribe el nombre de uno nuevo.",
    vendorDuplicate: "Ya tienes un proveedor con ese nombre.",
    vendorDuplicateArchived: "Ya tienes un proveedor archivado con ese nombre. Búscalo en «Ver archivados» y reactívalo.",
    paidLocked: "Esta factura ya está pagada. Márcala como no pagada si necesitas cambiarla.",
    deletePaid: "Solo puedes borrar facturas por pagar. Primero márcala como no pagada.",
    alreadyPaid: "Esta factura ya está marcada como pagada.",
    notPaid: "Esta factura todavía está por pagar.",
    futurePayment: "La fecha de pago no puede ser en el futuro.",
    closedPayMonth: "Ese mes ya está cerrado en tu contabilidad. Elige otra fecha de pago.",
    closedUnpayMonth: "No podemos quitar el gasto de este pago: su mes ya está cerrado en tu contabilidad. Si fue un error, pide a tu contador un ajuste.",
    expenseHasReceipt: "El gasto de este pago tiene una foto de recibo. Para no perderla, no lo borramos: quita primero el recibo y vuelve a intentarlo.",
    payFailed: "No pudimos registrar el pago. La factura sigue por pagar; inténtalo de nuevo.",
  },
  en: {
    vendorNotFound: "We couldn't find that vendor.",
    billNotFound: "We couldn't find that bill.",
    vendorMissing: "Pick a vendor or type the name of a new one.",
    vendorDuplicate: "You already have a vendor with that name.",
    vendorDuplicateArchived: "You already have an archived vendor with that name. Find it under “Show archived” and restore it.",
    paidLocked: "This bill is already paid. Mark it unpaid if you need to change it.",
    deletePaid: "Only bills to pay can be deleted. Mark it unpaid first.",
    alreadyPaid: "This bill is already marked as paid.",
    notPaid: "This bill is still unpaid.",
    futurePayment: "The payment date can't be in the future.",
    closedPayMonth: "That month is already closed in your books. Pick another payment date.",
    closedUnpayMonth: "We can't remove this payment's expense: its month is already closed in your books. If it was a mistake, ask your accountant for an adjustment.",
    expenseHasReceipt: "This payment's expense has a receipt photo. So it isn't lost, we won't delete it: remove the receipt first and try again.",
    payFailed: "We couldn't record the payment. The bill is still unpaid; please try again.",
  },
} satisfies Record<Lang, Record<string, string>>;
type MsgKey = keyof (typeof MESSAGES)["es"];

function fail(code: TRPCError["code"], lang: Lang, key: MsgKey): never {
  throw new TRPCError({ code, message: MESSAGES[lang][key] });
}

// ── Tables (created on first use; additive, never touches other tables). Keep in step with db/vendorsSchema.ts ──
let tablesReady: Promise<void> | null = null;
export function ensureVendorTables(db: Db): Promise<void> {
  tablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendors (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NULL,
        email VARCHAR(320) NULL,
        notes TEXT NULL,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX vendors_userId_idx (userId)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bills (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        vendorId BIGINT UNSIGNED NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        dueDate DATE NOT NULL,
        status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
        paidAt DATE NULL,
        paymentMethod ENUM('cash', 'zelle', 'card') NULL,
        expenseId BIGINT UNSIGNED NULL,
        notes TEXT NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX bills_user_status_due_idx (userId, status, dueDate),
        INDEX bills_vendorId_idx (vendorId)
      )
    `);
  })().catch((e) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

/** Deletes every vendor and bill of a user (for account deletion; the expenses stay with the user's other data). */
export async function deleteUserVendorsData(db: Db, userId: number): Promise<void> {
  try {
    await db.delete(bills).where(eq(bills.userId, userId));
    await db.delete(vendors).where(eq(vendors.userId, userId));
  } catch (e: unknown) {
    // The tables don't exist until someone opens Proveedores: nothing to delete then.
    if (!isMissingTable(e)) throw e;
  }
}

/** Every procedure starts here: the plan must include "vendors", then the tables must exist. */
async function open(ctx: Gate): Promise<{ db: Db; userId: number }> {
  await requireFeature(getDb(), ctx.user, "vendors", ctx.lang);
  const db = getDb();
  await ensureVendorTables(db);
  return { db, userId: Number(ctx.user.id) };
}

// ── Inputs ──
const isoDate = z.string().refine(isIsoDate, { message: "Invalid date (YYYY-MM-DD)" });
const idInput = z.number().int().positive();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const vendorName = z.string().trim().min(1).max(120);
const vendorFields = {
  name: vendorName,
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().max(320).refine((v) => v === "" || EMAIL_RE.test(v), { message: "Invalid email" }).nullish(),
  notes: z.string().trim().max(1000).nullish(),
};
const billFields = {
  /** An existing vendor… */
  vendorId: idInput.optional(),
  /** …or the name of a new one, created on the spot (an existing one with that name is reused). */
  newVendorName: vendorName.optional(),
  description: z.string().trim().min(1).max(255),
  amount: z.number().positive().max(MAX_BILL_AMOUNT).refine((n) => toCents(n) > 0, { message: "Amount too small" }),
  dueDate: isoDate,
  notes: z.string().trim().max(1000).nullish(),
};
const methodInput = z.enum(["cash", "zelle", "card"]);

// ── Rows ──
/** Calendar days come back as "YYYY-MM-DD" text, so no time zone moves them. */
const ymd = (col: AnyMySqlColumn) => sql<string>`DATE_FORMAT(${col}, '%Y-%m-%d')`;

type VendorRow = { id: number; name: string; phone: string | null; email: string | null; notes: string | null; archived: boolean; createdAt: Date };
type BillRow = {
  id: number; vendorId: number; vendorName: string | null; vendorArchived: boolean | null; description: string; amount: string;
  dueDate: string; status: BillStatus; paidAt: string | null; paymentMethod: PaymentMethod | null; expenseId: number | null;
  notes: string | null; createdAt: Date;
};
type UnpaidRow = { vendorId: number; amount: string; dueDate: string; status: BillStatus };

const vendorCols = {
  id: vendors.id, name: vendors.name, phone: vendors.phone, email: vendors.email, notes: vendors.notes,
  archived: vendors.archived, createdAt: vendors.createdAt,
};
const billCols = {
  id: bills.id, vendorId: bills.vendorId, vendorName: vendors.name, vendorArchived: vendors.archived, description: bills.description,
  amount: bills.amount, dueDate: ymd(bills.dueDate), status: bills.status, paidAt: ymd(bills.paidAt), paymentMethod: bills.paymentMethod,
  expenseId: bills.expenseId, notes: bills.notes, createdAt: bills.createdAt,
};

function shapeBill(b: BillRow, today: string) {
  return {
    ...b,
    vendorName: b.vendorName ?? "",
    vendorArchived: !!b.vendorArchived,
    amount: Number(b.amount),
    timing: billTiming(b, today),
    /** Days until due (negative = late); null once paid. */
    daysUntilDue: b.status === "unpaid" ? daysUntilDue(b.dueDate, today) : null,
  };
}

async function findBill(db: Db, userId: number, id: number): Promise<BillRow | null> {
  const rows: BillRow[] = await db.select(billCols).from(bills)
    .leftJoin(vendors, eq(vendors.id, bills.vendorId))
    .where(and(eq(bills.id, id), eq(bills.userId, userId))).limit(1);
  return rows[0] ?? null;
}

async function findVendor(db: Db, userId: number, id: number): Promise<VendorRow | null> {
  const rows: VendorRow[] = await db.select(vendorCols).from(vendors).where(and(eq(vendors.id, id), eq(vendors.userId, userId))).limit(1);
  return rows[0] ?? null;
}

/** The user's vendor with this name (ignoring case, accents and spaces), active ones first. */
async function findVendorByName(db: Db, userId: number, name: string, exceptId?: number): Promise<VendorRow | null> {
  const rows: VendorRow[] = await db.select(vendorCols).from(vendors)
    .where(exceptId ? and(eq(vendors.userId, userId), ne(vendors.id, exceptId)) : eq(vendors.userId, userId))
    .orderBy(asc(vendors.archived), asc(vendors.id));
  return rows.find((v) => sameVendorName(v.name, name)) ?? null;
}

/** The vendor for a new or edited bill: the one picked, or one created from the typed name. */
async function resolveVendor(db: Db, userId: number, input: { vendorId?: number; newVendorName?: string }, lang: Lang): Promise<VendorRow> {
  if (input.vendorId) {
    const v = await findVendor(db, userId, input.vendorId);
    if (!v) fail("NOT_FOUND", lang, "vendorNotFound");
    return v;
  }
  const name = cleanText(input.newVendorName);
  if (!name) fail("BAD_REQUEST", lang, "vendorMissing");
  const existing = await findVendorByName(db, userId, name);
  if (existing) {
    if (existing.archived) await db.update(vendors).set({ archived: false }).where(and(eq(vendors.id, existing.id), eq(vendors.userId, userId)));
    return { ...existing, archived: false };
  }
  const res: Exec = await db.insert(vendors).values({ userId, name });
  const created = await findVendor(db, userId, Number(res[0].insertId));
  if (!created) fail("NOT_FOUND", lang, "vendorNotFound");
  return created;
}

/** True when the month of that day is closed in the user's books (Contabilidad → cerrar periodo). */
async function isMonthClosed(db: Db, userId: number, day: string): Promise<boolean> {
  const [y, m] = day.split("-").map(Number);
  const rows: Array<{ id: number }> = await db.select({ id: periodClosures.id }).from(periodClosures)
    .where(and(eq(periodClosures.userId, userId), eq(periodClosures.year, y), eq(periodClosures.month, m))).limit(1);
  return rows.length > 0;
}

// ── The expense of a paid bill (same row, accounts and entry shape as expenses.create) ──
// Not called through expensesRouter.createCaller: there the entry number is always GAS-<today>-0001
// (it counts entries created after "now"), which the unique index on journalEntries.entryNumber rejects
// from the second expense of the day, after the expense row is already written; and nothing there runs
// in a transaction. Here the expense, its entry and the bill change are written together or not at all.

/** Payment account per method, as in expenses.create: cash 1110, Zelle 1130, card 1150; the expense goes to 5100. */
const PAYMENT_ACCOUNT: Record<PaymentMethod, string> = { cash: "1110", zelle: "1130", card: "1150" };

async function accountId(tx: Db, userId: number, code: string): Promise<number | undefined> {
  const rows: Array<{ id: number }> = await tx.select({ id: accounts.id }).from(accounts)
    .where(and(eq(accounts.code, code), eq(accounts.userId, userId))).limit(1);
  return rows[0]?.id;
}

const vendorBillFilter = z.enum(["unpaid", "overdue", "week", "paid", "all"]);

// ── Bills ──
const billsRouter = createRouter({
  /** A list of bills, already classified against the user's today. */
  list: authedQuery
    .input(z.object({
      filter: vendorBillFilter.default("unpaid"),
      vendorId: idInput.optional(),
      today: isoDate.optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).optional())
    .query(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const today = effectiveToday(input?.today, utcToday());
      const filter = input?.filter ?? "unpaid";
      const limit = input?.limit ?? 200;
      const conds: SQL[] = [eq(bills.userId, userId)];
      if (input?.vendorId) conds.push(eq(bills.vendorId, input.vendorId));
      if (filter === "paid") conds.push(eq(bills.status, "paid"));
      else if (filter !== "all") conds.push(eq(bills.status, "unpaid"));
      if (filter === "overdue") conds.push(sql`${bills.dueDate} < ${today}`);
      if (filter === "week") {
        const { from, to } = dueSoonRange(today);
        conds.push(sql`${bills.dueDate} >= ${from}`, sql`${bills.dueDate} <= ${to}`);
      }
      const order: SQL[] = filter === "paid"
        ? [desc(bills.paidAt), desc(bills.id)]
        : filter === "all"
          // To pay first (soonest due first), then paid (latest first).
          ? [sql`${bills.status} = 'paid'`, sql`CASE WHEN ${bills.status} = 'unpaid' THEN ${bills.dueDate} END`, desc(bills.paidAt), desc(bills.id)]
          : [asc(bills.dueDate), asc(bills.id)];
      const rows: BillRow[] = await db.select(billCols).from(bills)
        .leftJoin(vendors, eq(vendors.id, bills.vendorId))
        .where(and(...conds)).orderBy(...order).limit(limit + 1);
      return { today, items: rows.slice(0, limit).map((b) => shapeBill(b, today)), hasMore: rows.length > limit };
    }),

  /** The cards at the top: total to pay, overdue and due within the next 7 days. */
  summary: authedQuery
    .input(z.object({ today: isoDate.optional() }).optional())
    .query(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const today = effectiveToday(input?.today, utcToday());
      const unpaid: UnpaidRow[] = await db.select({ vendorId: bills.vendorId, amount: bills.amount, dueDate: ymd(bills.dueDate), status: bills.status })
        .from(bills).where(and(eq(bills.userId, userId), eq(bills.status, "unpaid")));
      return { today, ...summarizeBills(unpaid, today) };
    }),

  create: authedQuery
    .input(z.object(billFields))
    .mutation(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const vendor = await resolveVendor(db, userId, input, ctx.lang);
      const res: Exec = await db.insert(bills).values({
        userId, vendorId: vendor.id, description: input.description, amount: centsToDecimal(toCents(input.amount)),
        dueDate: input.dueDate, status: "unpaid", notes: cleanText(input.notes),
      });
      return { id: Number(res[0].insertId), vendorId: vendor.id };
    }),

  /** Only bills still to pay can change; a paid one must be marked unpaid first (its expense would no longer match). */
  update: authedQuery
    .input(z.object({ id: idInput, ...billFields }))
    .mutation(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const bill = await findBill(db, userId, input.id);
      if (!bill) fail("NOT_FOUND", ctx.lang, "billNotFound");
      if (bill.status === "paid") fail("CONFLICT", ctx.lang, "paidLocked");
      const vendor = await resolveVendor(db, userId, input, ctx.lang);
      await db.update(bills).set({
        vendorId: vendor.id, description: input.description, amount: centsToDecimal(toCents(input.amount)),
        dueDate: input.dueDate, notes: cleanText(input.notes),
      }).where(and(eq(bills.id, bill.id), eq(bills.userId, userId), eq(bills.status, "unpaid")));
      return { id: bill.id, vendorId: vendor.id };
    }),

  delete: authedQuery
    .input(z.object({ id: idInput }))
    .mutation(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const bill = await findBill(db, userId, input.id);
      if (!bill) fail("NOT_FOUND", ctx.lang, "billNotFound");
      if (bill.status === "paid") fail("CONFLICT", ctx.lang, "deletePaid");
      await db.delete(bills).where(and(eq(bills.id, bill.id), eq(bills.userId, userId), eq(bills.status, "unpaid")));
      return { success: true };
    }),

  /**
   * Marks the bill paid and records its expense, in one transaction: the expense row and its
   * journal entry are the same expenses.create writes (debit 5100, credit cash 1110 / Zelle 1130 /
   * card 1150, reference EXP-<expense id>, type "purchase"); the entry is skipped, as there, when the
   * user's chart of accounts isn't set up yet (the accounting repair adds it later).
   */
  markPaid: authedQuery
    .input(z.object({ id: idInput, paidDate: isoDate, method: methodInput }))
    .mutation(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const serverToday = utcToday();
      // The app sends its local day; allow one day ahead for time zones east of UTC.
      if (daysBetween(serverToday, input.paidDate) > 1) fail("BAD_REQUEST", ctx.lang, "futurePayment");
      const bill = await findBill(db, userId, input.id);
      if (!bill) fail("NOT_FOUND", ctx.lang, "billNotFound");
      if (bill.status === "paid") fail("CONFLICT", ctx.lang, "alreadyPaid");
      if (await isMonthClosed(db, userId, input.paidDate)) fail("PRECONDITION_FAILED", ctx.lang, "closedPayMonth");

      const exp = expenseFromBill(bill, bill.vendorName ?? "", input.paidDate, input.method);
      try {
        const expenseId: number = await db.transaction(async (tx: Db) => {
          // Claim the bill first: of two taps on "Pagar", only one gets past this.
          const claim: Exec = await tx.update(bills).set({ status: "paid", paidAt: input.paidDate, paymentMethod: input.method })
            .where(and(eq(bills.id, bill.id), eq(bills.userId, userId), eq(bills.status, "unpaid")));
          if (Number(claim[0].affectedRows) !== 1) fail("CONFLICT", ctx.lang, "alreadyPaid");

          const ins: Exec = await tx.insert(expenses).values({ ...exp, createdBy: userId });
          const id = Number(ins[0].insertId);

          const paymentAccId = await accountId(tx, userId, PAYMENT_ACCOUNT[input.method]);
          const expenseAccId = await accountId(tx, userId, "5100");
          if (paymentAccId && expenseAccId) {
            const je: Exec = await tx.insert(journalEntries).values({
              entryNumber: vendorEntryNumber(serverToday, bill.id, id),
              date: exp.date,
              description: `Gasto: ${exp.description}`,
              reference: expenseEntryReference(id),
              referenceId: id,
              referenceType: "purchase",
              debitTotal: exp.amount,
              creditTotal: exp.amount,
              createdBy: userId,
            });
            const jeId = Number(je[0].insertId);
            await tx.insert(journalEntryLines).values([
              { journalEntryId: jeId, accountId: expenseAccId, debit: exp.amount, credit: "0", description: `Gasto: ${exp.description}` },
              { journalEntryId: jeId, accountId: paymentAccId, debit: "0", credit: exp.amount, description: `Pago ${input.method}` },
            ]);
          }

          await tx.update(bills).set({ expenseId: id }).where(and(eq(bills.id, bill.id), eq(bills.userId, userId)));
          return id;
        });
        return { id: bill.id, expenseId };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        console.error("[vendors.markPaid]", e);
        fail("INTERNAL_SERVER_ERROR", ctx.lang, "payFailed");
      }
    }),

  /**
   * Back to unpaid: removes the expense recorded when it was paid, with its journal entry, in one
   * transaction. Refused when that month is closed in the books, or when the expense has a receipt photo.
   * If the expense was already deleted elsewhere, the bill is simply unlinked.
   */
  markUnpaid: authedQuery
    .input(z.object({ id: idInput }))
    .mutation(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const bill = await findBill(db, userId, input.id);
      if (!bill) fail("NOT_FOUND", ctx.lang, "billNotFound");
      if (bill.status !== "paid") fail("CONFLICT", ctx.lang, "notPaid");

      type ExpenseRow = { id: number; date: string; receipt: string | null };
      const expense: ExpenseRow | null = bill.expenseId
        ? ((await db.select({ id: expenses.id, date: ymd(expenses.date), receipt: expenses.receipt }).from(expenses)
          .where(and(eq(expenses.id, bill.expenseId), eq(expenses.createdBy, userId))).limit(1)) as ExpenseRow[])[0] ?? null
        : null;
      if (expense) {
        if (expense.receipt) fail("PRECONDITION_FAILED", ctx.lang, "expenseHasReceipt");
        if (await isMonthClosed(db, userId, expense.date)) fail("PRECONDITION_FAILED", ctx.lang, "closedUnpayMonth");
      }

      await db.transaction(async (tx: Db) => {
        if (expense) {
          // Its journal entries: ours (EXP-<id>) and any the accounting repair added (exp_<id>).
          const entries: Array<{ id: number }> = await tx.select({ id: journalEntries.id }).from(journalEntries).where(and(
            eq(journalEntries.createdBy, userId), eq(journalEntries.referenceId, expense.id),
            inArray(journalEntries.reference, expenseEntryReferences(expense.id)),
          ));
          const ids = entries.map((e) => e.id);
          if (ids.length) {
            await tx.delete(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, ids));
            await tx.delete(journalEntries).where(inArray(journalEntries.id, ids));
          }
          await tx.delete(expenses).where(and(eq(expenses.id, expense.id), eq(expenses.createdBy, userId)));
        }
        await tx.update(bills).set({ status: "unpaid", paidAt: null, paymentMethod: null, expenseId: null })
          .where(and(eq(bills.id, bill.id), eq(bills.userId, userId), eq(bills.status, "paid")));
      });
      return { id: bill.id, removedExpense: !!expense };
    }),
});

// ── Vendors ──
export const vendorsRouter = createRouter({
  /** Vendors with what is owed to each (and how much of it is late) and their latest bill. */
  list: authedQuery
    .input(z.object({ includeArchived: z.boolean().default(false), today: isoDate.optional() }).optional())
    .query(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const today = effectiveToday(input?.today, utcToday());
      const rows: VendorRow[] = await db.select(vendorCols).from(vendors)
        .where(input?.includeArchived ? eq(vendors.userId, userId) : and(eq(vendors.userId, userId), eq(vendors.archived, false)))
        .orderBy(asc(vendors.archived), asc(vendors.name));

      const unpaid: UnpaidRow[] = await db.select({ vendorId: bills.vendorId, amount: bills.amount, dueDate: ymd(bills.dueDate), status: bills.status })
        .from(bills).where(and(eq(bills.userId, userId), eq(bills.status, "unpaid")));
      const balances = balancesByVendor(unpaid, today);

      const lastIds: Array<{ id: number | string }> = await db.select({ id: sql<number>`MAX(${bills.id})` }).from(bills)
        .where(eq(bills.userId, userId)).groupBy(bills.vendorId);
      const ids = lastIds.map((r) => Number(r.id)).filter((n) => n > 0);
      const lastBills: BillRow[] = ids.length
        ? await db.select(billCols).from(bills).leftJoin(vendors, eq(vendors.id, bills.vendorId))
          .where(and(eq(bills.userId, userId), inArray(bills.id, ids)))
        : [];
      const lastByVendor = new Map(lastBills.map((b) => [b.vendorId, shapeBill(b, today)]));

      return rows.map((v) => {
        const bal = balances.get(v.id);
        const last = lastByVendor.get(v.id);
        return {
          ...v,
          archived: !!v.archived,
          unpaidTotal: bal?.unpaidTotal ?? 0,
          unpaidCount: bal?.unpaidCount ?? 0,
          overdueCount: bal?.overdueCount ?? 0,
          lastBill: last
            ? { id: last.id, description: last.description, amount: last.amount, dueDate: last.dueDate, status: last.status, paidAt: last.paidAt, timing: last.timing }
            : null,
        };
      });
    }),

  create: authedQuery
    .input(z.object(vendorFields))
    .mutation(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const name = cleanText(input.name);
      if (!name) fail("BAD_REQUEST", ctx.lang, "vendorMissing");
      const dup = await findVendorByName(db, userId, name);
      if (dup) fail("CONFLICT", ctx.lang, dup.archived ? "vendorDuplicateArchived" : "vendorDuplicate");
      const res: Exec = await db.insert(vendors).values({
        userId, name, phone: cleanText(input.phone), email: cleanText(input.email), notes: cleanText(input.notes),
      });
      return { id: Number(res[0].insertId) };
    }),

  update: authedQuery
    .input(z.object({ id: idInput, ...vendorFields }))
    .mutation(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const vendor = await findVendor(db, userId, input.id);
      if (!vendor) fail("NOT_FOUND", ctx.lang, "vendorNotFound");
      const name = cleanText(input.name);
      if (!name) fail("BAD_REQUEST", ctx.lang, "vendorMissing");
      const dup = await findVendorByName(db, userId, name, vendor.id);
      if (dup) fail("CONFLICT", ctx.lang, dup.archived ? "vendorDuplicateArchived" : "vendorDuplicate");
      await db.update(vendors).set({
        name, phone: cleanText(input.phone), email: cleanText(input.email), notes: cleanText(input.notes),
      }).where(and(eq(vendors.id, vendor.id), eq(vendors.userId, userId)));
      return { id: vendor.id };
    }),

  /** Archive hides the vendor from the lists and the picker; their bills stay. archived: false restores it. */
  archive: authedQuery
    .input(z.object({ id: idInput, archived: z.boolean().default(true) }))
    .mutation(async ({ input, ctx }) => {
      const { db, userId } = await open(ctx);
      const vendor = await findVendor(db, userId, input.id);
      if (!vendor) fail("NOT_FOUND", ctx.lang, "vendorNotFound");
      if (!input.archived) {
        const dup = await findVendorByName(db, userId, vendor.name, vendor.id);
        if (dup && !dup.archived) fail("CONFLICT", ctx.lang, "vendorDuplicate");
      }
      await db.update(vendors).set({ archived: input.archived }).where(and(eq(vendors.id, vendor.id), eq(vendors.userId, userId)));
      return { id: vendor.id, archived: input.archived };
    }),

  bills: billsRouter,
});
