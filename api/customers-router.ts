import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { customers } from "@db/schema";
import { eq, like, asc, sql, and, or } from "drizzle-orm";
import { contextHas, getPlanContext } from "./lib/planAccess";
import { BUSINESS_TIME_ZONE } from "./lib/quotes";
import { isValidTimeZone } from "./lib/ventas";
import { customerDetail, customersOverview, importMerge } from "./lib/customerInsights";

/** A customer row being written: the form's fields plus the date the plate expires, as a Date. */
type CustomerWrite = Record<string, unknown> & { plateExpiryDate?: string | Date; email?: string | null; clientType?: string };

const tzInput = z.string().max(64).refine(isValidTimeZone);

export const customersRouter = createRouter({
  list: authedQuery
    .input(z.object({ type: z.string().optional(), search: z.string().optional(), limit: z.number().min(1).max(200).default(50), offset: z.number().min(0).default(0) }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      // Always scope to the current user. `or(...)` wraps the search in parentheses;
      // a bare "a OR b" here used to escape the userId filter and leak every tenant's customers.
      const conditions = [eq(customers.userId, userId)];
      if (input?.type && input.type !== "all") {
        conditions.push(sql`${customers.clientType} = ${input.type}`);
      }
      if (input?.search) {
        conditions.push(or(like(customers.name, `%${input.search}%`), like(customers.lastName, `%${input.search}%`))!);
      }

      const whereClause = and(...conditions);
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
      const data: CustomerWrite = { ...input, userId: ctx.user.id };
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
      const upd: CustomerWrite = { ...data };
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
          const data: CustomerWrite = { ...row, userId: ctx.user.id };
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

  /**
   * The list's numbers, per client: billed this year, owed (pending sales and invoices), late,
   * last visit. "Billed this year" is a report by client: only with that plan feature, and not
   * for staff (same rule as before for the list).
   */
  overview: authedQuery
    .input(z.object({ timeZone: tzInput.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const plan = await getPlanContext(db, ctx.user);
      const canSeeBilled = contextHas(plan, "clientReports") && ctx.member?.role !== "staff";
      return customersOverview(db, Number(ctx.user.id), input?.timeZone ?? BUSINESS_TIME_ZONE, canSeeBilled);
    }),

  /** One client's card: what they bought, what they owe, how they pay, and their history. */
  detail: authedQuery
    .input(z.object({ id: z.number().int().positive(), timeZone: tzInput.optional() }))
    .query(async ({ ctx, input }) => {
      const d = await customerDetail(getDb(), Number(ctx.user.id), input.id, input.timeZone ?? BUSINESS_TIME_ZONE);
      if (!d) throw new TRPCError({ code: "NOT_FOUND", message: ctx.lang === "en" ? "We couldn't find that client." : "No encontramos ese cliente." });
      return d;
    }),

  /**
   * Excel import that doesn't repeat clients: a row that is someone you already have (same email,
   * phone or full name) fills in what that client was missing instead. dryRun only counts.
   * Owner only (not in the staff list of api/lib/team.ts).
   */
  importMerge: authedQuery
    .input(z.object({
      dryRun: z.boolean(),
      rows: z.array(z.object({
        name: z.string().trim().max(255),
        lastName: z.string().trim().max(255).optional(),
        email: z.string().trim().max(320).optional(),
        phone: z.string().trim().max(50).optional(),
        address: z.string().trim().max(1000).optional(),
        notes: z.string().trim().max(2000).optional(),
      })).max(5000),
    }))
    .mutation(async ({ ctx, input }) => importMerge(getDb(), Number(ctx.user.id), input.rows, input.dryRun)),
});
