import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { services } from "@db/schema";
import { eq, like, asc, sql, and } from "drizzle-orm";

export const servicesRouter = createRouter({
  debug: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const cols = await db.execute(sql`SHOW COLUMNS FROM services`);
    const all = await db.execute(sql`SELECT id, userId, name, description, price, cost, isActive, createdAt FROM services ORDER BY id DESC LIMIT 10`);
    return {
      currentUserId: ctx.user?.id ?? null,
      columns: cols,
      recentRecords: Array.isArray(all) ? (all.length === 2 && Array.isArray(all[0]) ? all[0] : all) : [],
    };
  }),

  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user?.id ?? null;
    let result: any;
    if (userId) {
      result = await db.execute(sql`SELECT id, userId, name, description, price, cost, categoryId, isActive, createdAt, updatedAt FROM services WHERE userId = ${userId} ORDER BY name`);
    } else {
      result = await db.execute(sql`SELECT id, userId, name, description, price, cost, categoryId, isActive, createdAt, updatedAt FROM services ORDER BY name`);
    }
    // mysql2/promise returns [rows, fields] array; Drizzle may wrap differently
    if (Array.isArray(result)) {
      if (result.length === 2 && Array.isArray(result[0])) {
        return result[0];
      }
      return result;
    }
    return result?.rows ?? [];
  }),

  byId: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;
      if (userId) {
        const s = await db.select().from(services).where(
          sql`${services.id} = ${input.id} AND ${services.userId} = ${userId}`
        ).limit(1);
        return s[0] ?? null;
      }
      const s = await db.select().from(services).where(eq(services.id, input.id)).limit(1);
      return s[0] ?? null;
    }),

  create: authedQuery
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      price: z.string().or(z.number()),
      cost: z.string().or(z.number()).optional(),
      image: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Use raw SQL matching the actual DB schema (no image column in Railway DB)
      const result = await db.execute(sql`
        INSERT INTO services (userId, name, description, price, cost, isActive)
        VALUES (${ctx.user.id}, ${input.name}, ${input.description || ""}, ${String(input.price)}, ${input.cost ? String(input.cost) : "0"}, ${input.isActive ?? true ? 1 : 0})
      `);
      return { id: Number(result[0].insertId) };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      price: z.string().or(z.number()).optional(),
      cost: z.string().or(z.number()).optional(),
      image: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...data } = input;
      const upd: Record<string, unknown> = { ...data };
      if (data.price !== undefined) upd.price = String(data.price);
      if (data.cost !== undefined) upd.cost = String(data.cost);
      // Only update if the service belongs to the current user
      await db.update(services).set(upd).where(
        sql`${services.id} = ${id} AND ${services.userId} = ${ctx.user.id}`
      );
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Only delete if the service belongs to the current user
      await db.delete(services).where(
        sql`${services.id} = ${input.id} AND ${services.userId} = ${ctx.user.id}`
      );
      return { success: true };
    }),

  search: authedQuery
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;
      if (userId) {
        return db.select().from(services).where(
          sql`${like(services.name, `%${input.query}%`)} AND ${services.userId} = ${userId}`
        ).limit(20);
      }
      return db.select().from(services).where(like(services.name, `%${input.query}%`)).limit(20);
    }),
});

export const productsRouter = servicesRouter;
