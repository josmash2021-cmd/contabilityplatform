// ── Revisar movimientos (business /transactions, "Por revisar") ──
// The owner confirms or fixes the category the bank sync suggested for each bank movement.
// "Reviewed" is bankTransactions.isReconciled = true (no new columns). Once reviewed, the automatic
// categorizer (bank.autoFixCategories) skips the movement and the bank screens show the owner's
// category instead of the recomputed one (api/bank-router.ts). Rules live in api/lib/bankReview.ts.
// Team access (api/lib/team.ts): the accountant can read the list; nobody but the owner can change it.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bankTransactions } from "@db/schema";
import type { Lang } from "./lib/i18n";
import {
  REVIEW_WINDOW_DAYS,
  MAX_REVIEW_BATCH, REVIEW_LIST_MAX, REVIEW_PAGE, isKnownCategory, resolveType,
  type MoneyType, type StoredReview,
} from "./lib/bankReview";

type Db = ReturnType<typeof getDb>;
type Exec = [{ affectedRows: number }];

const MESSAGES = {
  es: {
    notFound: "No encontramos ese movimiento.",
    badCategory: "Esa categoría no existe. Elige otra de la lista.",
  },
  en: {
    notFound: "We couldn't find that transaction.",
    badCategory: "That category doesn't exist. Pick one from the list.",
  },
} satisfies Record<Lang, Record<string, string>>;

function fail(code: TRPCError["code"], lang: Lang, key: keyof (typeof MESSAGES)["es"]): never {
  throw new TRPCError({ code, message: MESSAGES[lang][key] });
}

/** Movements the owner hasn't reviewed yet (rows from before the flag was used may hold NULL). */
export const unreviewed = () => sql`COALESCE(${bankTransactions.isReconciled}, 0) = 0`;
/** Bank dates are calendar days, so compare against the UTC calendar day. */
const recent = () => sql`${bankTransactions.transactionDate} >= DATE_SUB(UTC_DATE(), INTERVAL ${REVIEW_WINDOW_DAYS} DAY)`;

/** The saved state of the movements the bank sends live, matched by Plaid's id (for api/bank-router.ts). */
export async function storedReviewsFor(db: Db, userId: number, plaidIds: string[]): Promise<StoredReview[]> {
  const ids = [...new Set(plaidIds.filter(Boolean))];
  if (ids.length === 0) return [];
  try {
    const rows: StoredReview[] = await db.select({
      id: bankTransactions.id,
      plaidTransactionId: bankTransactions.plaidTransactionId,
      type: bankTransactions.type,
      category: bankTransactions.category,
      isReconciled: bankTransactions.isReconciled,
    }).from(bankTransactions).where(and(eq(bankTransactions.userId, userId), inArray(bankTransactions.plaidTransactionId, ids)));
    return rows;
  } catch (e: unknown) {
    console.error("[review] stored lookup failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

type ItemRow = {
  id: number;
  date: string;
  description: string;
  amount: string;
  plaidAmount: string | null;
  importedFrom: string | null;
  type: MoneyType;
  category: string;
  bankName: string | null;
  accountNumber: string | null;
};

const itemCols = {
  id: bankTransactions.id,
  date: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`,
  description: bankTransactions.description,
  amount: bankTransactions.amount,
  plaidAmount: bankTransactions.plaidAmount,
  importedFrom: bankTransactions.importedFrom,
  type: bankTransactions.type,
  category: bankTransactions.category,
  bankName: bankTransactions.bankName,
  accountNumber: bankTransactions.accountNumber,
};

async function pendingCount(db: Db, userId: number): Promise<number> {
  const rows: Array<{ n: number | string }> = await db.select({ n: sql<number>`COUNT(*)` }).from(bankTransactions)
    .where(and(eq(bankTransactions.userId, userId), unreviewed(), recent()));
  return Number(rows[0]?.n ?? 0);
}

const ids = z.array(z.number().int().positive()).min(1).max(MAX_REVIEW_BATCH);

export const reviewRouter = createRouter({
  /** Bank movements still to review, newest first, with the category and type the sync suggested. */
  list: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(REVIEW_LIST_MAX).default(REVIEW_PAGE) }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const rows: ItemRow[] = await db.select(itemCols).from(bankTransactions)
        .where(and(eq(bankTransactions.userId, userId), unreviewed(), recent()))
        .orderBy(desc(bankTransactions.transactionDate), desc(bankTransactions.id))
        .limit(input?.limit ?? REVIEW_PAGE);
      const total = await pendingCount(db, userId);
      return {
        total,
        items: rows.map((r) => ({
          id: Number(r.id),
          date: r.date,
          description: r.description,
          amount: Number(r.amount),
          plaidAmount: r.plaidAmount,
          importedFrom: r.importedFrom,
          type: r.type,
          category: r.category,
          bankName: r.bankName,
          accountNumber: r.accountNumber,
        })),
      };
    }),

  /** How many are waiting (for the "Por revisar (N)" badge). */
  count: authedQuery.query(async ({ ctx }) => ({ count: await pendingCount(getDb(), ctx.user.id) })),

  /** "Está bien": keep the category as it is. Only the caller's own movements change. */
  confirm: authedQuery
    .input(z.object({ ids }))
    .mutation(async ({ input, ctx }) => {
      const res: Exec = await getDb().update(bankTransactions).set({ isReconciled: true })
        .where(and(eq(bankTransactions.userId, ctx.user.id), inArray(bankTransactions.id, input.ids)));
      return { confirmed: Number(res[0]?.affectedRows ?? 0) };
    }),

  /** Undo of "Está bien": the movement goes back to the list. */
  reopen: authedQuery
    .input(z.object({ ids }))
    .mutation(async ({ input, ctx }) => {
      const res: Exec = await getDb().update(bankTransactions).set({ isReconciled: false })
        .where(and(eq(bankTransactions.userId, ctx.user.id), inArray(bankTransactions.id, input.ids)));
      return { reopened: Number(res[0]?.affectedRows ?? 0) };
    }),

  /** "Cambiar": the owner's category (and type, if the money went the other way). Marks it reviewed. */
  setCategory: authedQuery
    .input(z.object({
      id: z.number().int().positive(),
      category: z.string().min(1).max(40),
      type: z.enum(["income", "expense"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isKnownCategory(input.category)) fail("BAD_REQUEST", ctx.lang, "badCategory");
      const db = getDb();
      const where = and(eq(bankTransactions.id, input.id), eq(bankTransactions.userId, ctx.user.id));
      const rows: Array<{ type: MoneyType }> = await db.select({ type: bankTransactions.type }).from(bankTransactions).where(where).limit(1);
      if (!rows[0]) fail("NOT_FOUND", ctx.lang, "notFound");
      const type = resolveType(input.category, rows[0].type, input.type);
      await db.update(bankTransactions).set({ category: input.category, type, isReconciled: true }).where(where);
      return { id: input.id, category: input.category, type };
    }),
});
