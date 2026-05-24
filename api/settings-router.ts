import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { companySettings } from "@db/schema";
import { eq, sql } from "drizzle-orm";

export const settingsRouter = createRouter({
  // ── get: return ONLY the current user's settings ──
  get: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const db = getDb();
    const userId = ctx.user.id;
    const settings = await db.select().from(companySettings)
      .where(eq(companySettings.userId, userId))
      .limit(1);
    return settings[0] ?? null;
  }),

  // ── update: update ONLY the current user's settings ──
  update: authedQuery
    .input(z.object({
      companyName: z.string().optional(),
      rif: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      zelleEmail: z.string().optional(),
      bankName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      currency: z.string().optional(),
      logo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // Check if this user already has settings
      const existing = await db.select().from(companySettings)
        .where(eq(companySettings.userId, userId))
        .limit(1);

      const data = { ...input };

      if (existing.length > 0) {
        // Update only this user's settings
        await db.update(companySettings).set(data)
          .where(eq(companySettings.userId, userId));
        return { success: true, id: existing[0].id };
      } else {
        // Create new settings for this user
        const result = await db.insert(companySettings).values({
          ...data,
          userId,
        });
        return { success: true, id: Number(result[0].insertId) };
      }
    }),
});
