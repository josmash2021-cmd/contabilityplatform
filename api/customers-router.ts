import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { customers } from "@db/schema";
import { eq, like, asc, sql, and } from "drizzle-orm";

export const customersRouter = createRouter({
  list: authedQuery
    .input(z.object({ type: z.string().optional(), search: z.string().optional(), limit: z.number().min(1).max(200).default(50), offset: z.number().min(0).default(0) }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      let conditions = [];
      if (userId) {
        conditions.push(sql`${customers.userId} = ${userId}`);
      }
      if (input?.type && input.type !== "all") {
        conditions.push(sql`${customers.clientType} = ${input.type}`);
      }
      if (input?.search) {
        conditions.push(sql`${like(customers.name, `%${input.search}%`)} OR ${like(customers.lastName, `%${input.search}%`)}`);
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(customers).where(whereClause).orderBy(asc(customers.name)).limit(limit).offset(offset);
    }),

  byId: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;
      if (userId) {
        const c = await db.select().from(customers).where(
          sql`${customers.id} = ${input.id} AND ${customers.userId} = ${userId}`
        ).limit(1);
        return c[0] ?? null;
      }
      const c = await db.select().from(customers).where(eq(customers.id, input.id)).limit(1);
      return c[0] ?? null;
    }),

  create: authedQuery
    .input(z.object({
      name: z.string().min(1),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      zelleEmail: z.string().optional(),
      carBrand: z.string().optional(),
      carModel: z.string().optional(),
      carYear: z.string().optional(),
      plateNumber: z.string().optional(),
      plateExpiryDate: z.string().optional(),
      transactionDate: z.string().optional(),
      clientType: z.string().optional(),
      paymentAmount: z.string().optional(),
      paymentHistory: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const data: any = { ...input, userId: ctx.user.id };
      if (data.plateExpiryDate) {
        const parsed = new Date(data.plateExpiryDate);
        if (!isNaN(parsed.getTime())) data.plateExpiryDate = parsed;
        else delete data.plateExpiryDate;
      }
      if (!data.clientType) data.clientType = "placas";
      if (data.email === "") data.email = null;
      const result = await db.insert(customers).values(data);
      return { id: Number(result[0].insertId) };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      zelleEmail: z.string().optional(),
      carBrand: z.string().optional(),
      carModel: z.string().optional(),
      carYear: z.string().optional(),
      plateNumber: z.string().optional(),
      plateExpiryDate: z.string().optional(),
      transactionDate: z.string().optional(),
      clientType: z.string().optional(),
      paymentAmount: z.string().optional(),
      paymentHistory: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...data } = input;
      const upd: any = { ...data };
      if (upd.plateExpiryDate) {
        const parsed = new Date(upd.plateExpiryDate);
        if (!isNaN(parsed.getTime())) upd.plateExpiryDate = parsed;
        else delete upd.plateExpiryDate;
      }
      if (upd.email === "") upd.email = null;
      // Only update if the customer belongs to the current user
      await db.update(customers).set(upd).where(
        sql`${customers.id} = ${id} AND ${customers.userId} = ${ctx.user.id}`
      );
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Only delete if the customer belongs to the current user
      await db.delete(customers).where(
        sql`${customers.id} = ${input.id} AND ${customers.userId} = ${ctx.user.id}`
      );
      return { success: true };
    }),

  importExcel: authedQuery
    .input(z.array(z.object({
      name: z.string(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      carBrand: z.string().optional(),
      carModel: z.string().optional(),
      carYear: z.string().optional(),
      plateNumber: z.string().optional(),
      plateExpiryDate: z.string().optional(),
      clientType: z.string().optional(),
      notes: z.string().optional(),
    })))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const results = { created: 0, errors: 0 };

      for (const row of input) {
        try {
          const data: any = { ...row, userId: ctx.user.id };
          if (row.plateExpiryDate) {
            const parsed = new Date(row.plateExpiryDate);
            if (!isNaN(parsed.getTime())) data.plateExpiryDate = parsed;
            else delete data.plateExpiryDate;
          }
          if (!row.clientType || (row.clientType !== "placas" && row.clientType !== "titulos")) {
            data.clientType = "placas";
          }
          if (row.email === "") data.email = null;
          await db.insert(customers).values(data);
          results.created++;
        } catch {
          results.errors++;
        }
      }

      return results;
    }),

  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user?.id ?? null;

    const totalResult = userId
      ? await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(sql`${customers.userId} = ${userId}`)
      : await db.select({ count: sql<number>`COUNT(*)` }).from(customers);
    const placasResult = userId
      ? await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(sql`${customers.clientType} = 'placas' AND ${customers.userId} = ${userId}`)
      : await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(eq(customers.clientType, "placas"));
    const titulosResult = userId
      ? await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(sql`${customers.clientType} = 'titulos' AND ${customers.userId} = ${userId}`)
      : await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(eq(customers.clientType, "titulos"));

    const allCustomers = userId
      ? await db.select({ name: customers.name }).from(customers).where(sql`${customers.userId} = ${userId}`).orderBy(asc(customers.name))
      : await db.select({ name: customers.name }).from(customers).orderBy(asc(customers.name));
    const letterMap = new Map<string, number>();
    for (const c of allCustomers) {
      const l = c.name.charAt(0).toUpperCase();
      letterMap.set(l, (letterMap.get(l) || 0) + 1);
    }
    const alphabet = Array.from(letterMap.entries()).map(([letter, count]) => ({ letter, count }));

    return {
      total: totalResult[0]?.count ?? 0,
      placas: placasResult[0]?.count ?? 0,
      titulos: titulosResult[0]?.count ?? 0,
      alphabet,
    };
  }),

  search: authedQuery
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;
      if (userId) {
        return db.select().from(customers).where(
          sql`(${like(customers.name, `%${input.query}%`)} OR ${like(customers.lastName, `%${input.query}%`)}) AND ${customers.userId} = ${userId}`
        ).limit(20);
      }
      return db.select().from(customers).where(
        sql`${like(customers.name, `%${input.query}%`)} OR ${like(customers.lastName, `%${input.query}%`)}`
      ).limit(20);
    }),
});
