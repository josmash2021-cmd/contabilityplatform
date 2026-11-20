import { z } from "zod";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { companySettings } from "@db/schema";
import { eq, sql } from "drizzle-orm";

export const settingsRouter = createRouter({
  // ── run DB migration for onboarding columns (DDL: admin only) ──
  migrate: adminQuery.query(async () => {
    const db = getDb();
    const results: string[] = [];
    const columns = [
      { name: "addressType", def: "VARCHAR(50)" },
      { name: "unitNumber", def: "VARCHAR(50)" },
      { name: "city", def: "VARCHAR(100)" },
      { name: "state", def: "VARCHAR(100)" },
      { name: "zipCode", def: "VARCHAR(20)" },
    ];
    for (const col of columns) {
      try {
        await db.execute(sql.raw(`ALTER TABLE companySettings ADD COLUMN ${col.name} ${col.def}`));
        results.push(`Added ${col.name}`);
      } catch (e: any) {
        if (e.message?.includes("Duplicate") || e.message?.includes("already exists")) {
          results.push(`${col.name} already exists`);
        } else {
          results.push(`Error ${col.name}: ${e.message}`);
        }
      }
    }
    return { success: true, results };
  }),
  // ── get: return ONLY the current user's settings + auto-migrate columns ──
  get: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const db = getDb();
    const userId = ctx.user.id;

    // Auto-migrate: silently add missing columns (unitNumber, etc.)
    const migrateCols = [
      { name: "addressType", def: "VARCHAR(50)" },
      { name: "unitNumber", def: "VARCHAR(50)" },
      { name: "city", def: "VARCHAR(100)" },
      { name: "state", def: "VARCHAR(100)" },
      { name: "zipCode", def: "VARCHAR(20)" },
    ];
    for (const col of migrateCols) {
      try { await db.execute(sql.raw(`ALTER TABLE companySettings ADD COLUMN ${col.name} ${col.def}`)); } catch { /* already exists */ }
    }

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
      addressType: z.string().optional(),
      unitNumber: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
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
