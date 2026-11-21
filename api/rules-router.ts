// ── Reglas de Por revisar: "Siempre que diga X → categoría Y" (mounted as review.rules in api/review-router.ts) ──
// Stored in smartCategoryRules (db/schema.ts). A rule matches when its text is inside the movement's bank
// description or merchant name (any case). Creating or editing one applies it at once to the movements still
// to review: they get the rule's category as a sure suggestion ("Regla: Shell → Gasolina") and stay in the
// list until approved. The bank's automatic categorizer leaves any movement a rule matches alone
// (`unreviewed()` in api/review-router.ts). Team members: the accountant reads, nobody else changes
// (api/lib/team.ts refuses every member mutation here).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { smartCategoryRules } from "@db/schema";
import type { Lang } from "./lib/i18n";
import { isDuplicateKey } from "./lib/dbErrors";
import { isKnownCategory } from "./lib/bankReview";
import { RULE_PATTERN_MAX, RULE_PATTERN_MIN, cleanPattern } from "./lib/reviewEngine";
import { applyRulesToPending, ensureReviewTables, loadRules } from "./lib/reviewStore";

type Db = ReturnType<typeof getDb>;
type Exec = [{ insertId: number | string; affectedRows: number }];

const MESSAGES = {
  es: {
    notFound: "No encontramos esa regla.",
    badCategory: "Esa categoría no existe. Elige otra de la lista.",
    badPattern: `Escribe entre ${RULE_PATTERN_MIN} y ${RULE_PATTERN_MAX} letras de cómo aparece en tu banco.`,
    duplicate: "Ya tienes una regla con ese texto. Cámbiala en vez de crear otra.",
    tooMany: "Llegaste a 200 reglas. Quita alguna antes de crear otra.",
  },
  en: {
    notFound: "We couldn't find that rule.",
    badCategory: "That category doesn't exist. Pick one from the list.",
    badPattern: `Type ${RULE_PATTERN_MIN} to ${RULE_PATTERN_MAX} characters of how it shows on your bank.`,
    duplicate: "You already have a rule with that text. Change it instead of adding another.",
    tooMany: "You've reached 200 rules. Remove one before adding another.",
  },
} satisfies Record<Lang, Record<string, string>>;

function fail(code: TRPCError["code"], lang: Lang, key: keyof (typeof MESSAGES)["es"]): never {
  throw new TRPCError({ code, message: MESSAGES[lang][key] });
}

const MAX_RULES = 200;
const pattern = z.string().max(200);
const category = z.string().min(1).max(40);
const id = z.number().int().positive();

function checkInput(lang: Lang, p: string, c: string): string {
  const clean = cleanPattern(p);
  if (clean.length < RULE_PATTERN_MIN) fail("BAD_REQUEST", lang, "badPattern");
  if (!isKnownCategory(c)) fail("BAD_REQUEST", lang, "badCategory");
  return clean;
}

/** Applies the user's rules to what's still to review and adds what each one set to its count. */
async function applyAndCount(db: Db, userId: number, ruleId: number): Promise<number> {
  const hits = await applyRulesToPending(db, userId, await loadRules(db, userId));
  const n = hits.get(ruleId) ?? 0;
  if (n > 0) {
    await db.update(smartCategoryRules).set({ usageCount: sql`COALESCE(${smartCategoryRules.usageCount}, 0) + ${n}` })
      .where(and(eq(smartCategoryRules.id, ruleId), eq(smartCategoryRules.userId, userId)));
  }
  return n;
}

export const rulesRouter = createRouter({
  /** The owner's rules, oldest first. */
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    await ensureReviewTables(db);
    const rules = await loadRules(db, Number(ctx.user.id));
    return rules.map((r) => ({ id: r.id, pattern: r.pattern, category: r.category, usageCount: r.usageCount }));
  }),

  /** "Crear regla": from a change in Por revisar or typed in the rules panel. `applied` = movements it categorized now. */
  create: authedQuery
    .input(z.object({ pattern, category }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      const clean = checkInput(ctx.lang, input.pattern, input.category);
      const existing = await loadRules(db, userId);
      if (existing.some((r) => r.pattern.toLowerCase() === clean.toLowerCase())) fail("CONFLICT", ctx.lang, "duplicate");
      if (existing.length >= MAX_RULES) fail("BAD_REQUEST", ctx.lang, "tooMany");
      let ruleId: number;
      try {
        const res: Exec = await db.insert(smartCategoryRules).values({
          userId, merchantPattern: clean, category: input.category, source: "user", confidence: 100, usageCount: 0, isActive: true,
        });
        ruleId = Number(res[0].insertId);
      } catch (e: unknown) {
        // An old inactive rule with the same text: bring it back with the new category.
        if (!isDuplicateKey(e)) throw e;
        await db.update(smartCategoryRules).set({ category: input.category, isActive: true, source: "user" })
          .where(and(eq(smartCategoryRules.userId, userId), eq(smartCategoryRules.merchantPattern, clean)));
        const row: Array<{ id: number }> = await db.select({ id: smartCategoryRules.id }).from(smartCategoryRules)
          .where(and(eq(smartCategoryRules.userId, userId), eq(smartCategoryRules.merchantPattern, clean))).limit(1);
        ruleId = Number(row[0].id);
      }
      const applied = await applyAndCount(db, userId, ruleId);
      return { id: ruleId, pattern: clean, category: input.category, applied };
    }),

  /** Changes a rule's text or category, and applies it again. */
  update: authedQuery
    .input(z.object({ id, pattern, category }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureReviewTables(db);
      const clean = checkInput(ctx.lang, input.pattern, input.category);
      const own: Array<{ id: number }> = await db.select({ id: smartCategoryRules.id }).from(smartCategoryRules)
        .where(and(eq(smartCategoryRules.id, input.id), eq(smartCategoryRules.userId, userId))).limit(1);
      if (!own[0]) fail("NOT_FOUND", ctx.lang, "notFound");
      const clash: Array<{ id: number }> = await db.select({ id: smartCategoryRules.id }).from(smartCategoryRules)
        .where(and(eq(smartCategoryRules.userId, userId), eq(smartCategoryRules.merchantPattern, clean), ne(smartCategoryRules.id, input.id))).limit(1);
      if (clash[0]) fail("CONFLICT", ctx.lang, "duplicate");
      await db.update(smartCategoryRules).set({ merchantPattern: clean, category: input.category, isActive: true, source: "user" })
        .where(and(eq(smartCategoryRules.id, input.id), eq(smartCategoryRules.userId, userId)));
      const applied = await applyAndCount(db, userId, input.id);
      return { id: input.id, pattern: clean, category: input.category, applied };
    }),

  /** "Quitar": movements it already categorized keep that category until reviewed. */
  delete: authedQuery
    .input(z.object({ id }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await ensureReviewTables(db);
      const res: Exec = await db.delete(smartCategoryRules)
        .where(and(eq(smartCategoryRules.id, input.id), eq(smartCategoryRules.userId, Number(ctx.user.id))));
      if (Number(res[0]?.affectedRows ?? 0) === 0) fail("NOT_FOUND", ctx.lang, "notFound");
      return { id: input.id };
    }),
});
