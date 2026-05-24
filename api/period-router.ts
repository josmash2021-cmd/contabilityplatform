import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { periodClosures } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";

export const periodRouter = createRouter({

  // ── List closed periods ──
  list: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    const db = getDb();
    return db.select().from(periodClosures)
      .where(eq(periodClosures.userId, ctx.user.id))
      .orderBy(desc(periodClosures.year), desc(periodClosures.month));
  }),

  // ── Check if a period is closed ──
  isClosed: authedQuery
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) return false;
      const db = getDb();
      const result = await db.select().from(periodClosures)
        .where(and(
          eq(periodClosures.userId, ctx.user.id),
          eq(periodClosures.year, input.year),
          eq(periodClosures.month, input.month),
        )).limit(1);
      return result.length > 0;
    }),

  // ── Close a period ──
  close: authedQuery
    .input(z.object({ year: z.number(), month: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) return { success: false, error: "No autenticado" };
      const db = getDb();

      // Check if already closed
      const existing = await db.select().from(periodClosures)
        .where(and(
          eq(periodClosures.userId, ctx.user.id),
          eq(periodClosures.year, input.year),
          eq(periodClosures.month, input.month),
        )).limit(1);
      if (existing.length > 0) return { success: false, error: "Este periodo ya esta cerrado" };

      await db.insert(periodClosures).values({
        userId: ctx.user.id,
        year: input.year,
        month: input.month,
        closedBy: ctx.user.id,
      });
      return { success: true };
    }),

  // ── Reopen a period (admin only) ──
  reopen: authedQuery
    .input(z.object({ year: z.number(), month: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) return { success: false, error: "No autenticado" };
      const db = getDb();
      await db.delete(periodClosures).where(and(
        eq(periodClosures.userId, ctx.user.id),
        eq(periodClosures.year, input.year),
        eq(periodClosures.month, input.month),
      ));
      return { success: true };
    }),
});
