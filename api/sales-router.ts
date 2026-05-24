import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sales, saleServices, paymentRecords, services, customers, accounts, journalEntries, journalEntryLines } from "@db/schema";
import { eq, desc, sql, gte, and } from "drizzle-orm";

export const salesRouter = createRouter({
  list: authedQuery
    .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      return db.select({
        id: sales.id, invoiceNumber: sales.invoiceNumber, customerId: sales.customerId,
        customerName: sales.customerName, subtotal: sales.subtotal, discount: sales.discount,
        total: sales.total, paymentMethod: sales.paymentMethod, status: sales.status,
        notes: sales.notes, createdAt: sales.createdAt,
      }).from(sales).where(eq(sales.createdBy, userId)).orderBy(desc(sales.createdAt)).limit(limit).offset(offset);
    }),

  byId: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // Fetch sale with related data in a single query using joins
      const saleRows = await db.select({
          sale: sales,
          item: saleServices,
          payment: paymentRecords,
          customer: customers,
        })
        .from(sales)
        .leftJoin(saleServices, eq(sales.id, saleServices.saleId))
        .leftJoin(paymentRecords, eq(sales.id, paymentRecords.saleId))
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(and(eq(sales.id, input.id), eq(sales.createdBy, userId)));

      if (saleRows.length === 0) return null;

      const sale = saleRows[0].sale;
      const itemsMap = new Map<number, typeof saleServices.$inferSelect>();
      const paymentsMap = new Map<number, typeof paymentRecords.$inferSelect>();
      let customer = null;

      for (const row of saleRows) {
        if (row.item?.id && !itemsMap.has(row.item.id)) {
          itemsMap.set(row.item.id, row.item);
        }
        if (row.payment?.id && !paymentsMap.has(row.payment.id)) {
          paymentsMap.set(row.payment.id, row.payment);
        }
        if (row.customer?.id && !customer) {
          customer = row.customer;
        }
      }

      return { ...sale, items: Array.from(itemsMap.values()), payments: Array.from(paymentsMap.values()), customer };
    }),

  create: authedQuery
    .input(z.object({
      customerId: z.number().optional(),
      customerName: z.string().optional(),
      items: z.array(z.object({
        serviceId: z.number(),
        quantity: z.number().min(1),
        unitPrice: z.string().or(z.number()),
      })),
      subtotal: z.string().or(z.number()),
      discount: z.string().or(z.number()).optional(),
      total: z.string().or(z.number()),
      paymentMethod: z.enum(["cash", "zelle", "card", "mixed"]),
      payments: z.array(z.object({
        method: z.enum(["cash", "zelle", "card"]),
        amount: z.string().or(z.number()),
        reference: z.string().optional(),
      })).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");

      // Count today's sales for invoice number
      const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(sales)
        .where(gte(sales.createdAt, todayStart));
      const count = (countResult[0]?.count ?? 0) + 1;
      const invoiceNumber = `FAC-${dateStr}-${String(count).padStart(4, "0")}`;

      const saleResult = await db.insert(sales).values({
        invoiceNumber,
        customerId: input.customerId,
        customerName: input.customerName,
        subtotal: String(input.subtotal),
        discount: String(input.discount ?? 0),
        total: String(input.total),
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        createdBy: ctx.user.id,
      });
      const saleId = Number(saleResult[0].insertId);

      for (const item of input.items) {
        const svc = await db.select({ name: services.name }).from(services).where(eq(services.id, item.serviceId)).limit(1);
        await db.insert(saleServices).values({
          saleId,
          serviceId: item.serviceId,
          serviceName: svc[0]?.name ?? "Servicio",
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          total: String(Number(item.unitPrice) * item.quantity),
        });
      }

      if (input.payments && input.payments.length > 0) {
        for (const p of input.payments) {
          await db.insert(paymentRecords).values({
            saleId,
            method: p.method,
            amount: String(p.amount),
            reference: p.reference,
          });
        }
      } else {
        await db.insert(paymentRecords).values({
          saleId,
          method: input.paymentMethod === "mixed" ? "cash" : input.paymentMethod,
          amount: String(input.total),
        });
      }

      // Auto journal entry
      const dateStrJE = date.toISOString().split("T")[0];
      const jeCount = await db.select({ count: sql<number>`count(*)` }).from(journalEntries)
        .where(gte(journalEntries.createdAt, todayStart));
      const entryNumber = `ASI-${dateStr}-${String((jeCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

      const cashAcc = await db.select().from(accounts).where(and(eq(accounts.code, "1110"), eq(accounts.userId, ctx.user.id))).limit(1);
      const zelleAcc = await db.select().from(accounts).where(and(eq(accounts.code, "1130"), eq(accounts.userId, ctx.user.id))).limit(1);
      const creditAcc = await db.select().from(accounts).where(and(eq(accounts.code, "1150"), eq(accounts.userId, ctx.user.id))).limit(1);
      const revAcc = await db.select().from(accounts).where(and(eq(accounts.code, "4100"), eq(accounts.userId, ctx.user.id))).limit(1);

      const lines: Array<{ accountId: number; debit: string; credit: string; description: string }> = [];

      if (input.payments && input.payments.length > 0) {
        for (const p of input.payments) {
          const accId = p.method === "cash" ? cashAcc[0]?.id : p.method === "zelle" ? zelleAcc[0]?.id : creditAcc[0]?.id;
          if (accId) lines.push({ accountId: accId, debit: String(p.amount), credit: "0", description: `Pago ${p.method}` });
        }
      } else {
        const accId = input.paymentMethod === "cash" ? cashAcc[0]?.id : input.paymentMethod === "zelle" ? zelleAcc[0]?.id : creditAcc[0]?.id;
        if (accId) lines.push({ accountId: accId, debit: String(input.total), credit: "0", description: `Pago ${input.paymentMethod}` });
      }

      for (const item of input.items) {
        if (revAcc[0]?.id) {
          lines.push({ accountId: revAcc[0].id, debit: "0", credit: String(Number(item.unitPrice) * item.quantity), description: `Venta servicio` });
        }
      }

      const totalDebits = lines.reduce((s, l) => s + Number(l.debit), 0);
      const totalCredits = lines.reduce((s, l) => s + Number(l.credit), 0);

      const jeResult = await db.insert(journalEntries).values({
        entryNumber,
        date: new Date(dateStrJE),
        description: `Venta ${invoiceNumber}`,
        reference: invoiceNumber,
        referenceId: saleId,
        referenceType: "sale",
        debitTotal: String(totalDebits),
        creditTotal: String(totalCredits),
        createdBy: ctx.user.id,
      });
      const jeId = Number(jeResult[0].insertId);

      for (const line of lines) {
        await db.insert(journalEntryLines).values({ journalEntryId: jeId, ...line });
      }

      return { id: saleId, invoiceNumber };
    }),

  updateStatus: authedQuery
    .input(z.object({ id: z.number(), status: z.enum(["completed", "pending", "cancelled", "refunded"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(sales).set({ status: input.status }).where(and(eq(sales.id, input.id), eq(sales.createdBy, ctx.user.id)));
      return { success: true };
    }),

  byCustomer: authedQuery
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      return db.select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        total: sales.total,
        paymentMethod: sales.paymentMethod,
        status: sales.status,
        createdAt: sales.createdAt,
      }).from(sales).where(
        and(eq(sales.customerId, input.customerId), eq(sales.createdBy, userId))
      ).orderBy(desc(sales.createdAt));
    }),

  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user?.id ?? null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);

    const todayCond = userId
      ? and(eq(sales.createdBy, userId), gte(sales.createdAt, today), eq(sales.status, "completed"))
      : and(gte(sales.createdAt, today), eq(sales.status, "completed"));
    const weekCond = userId
      ? and(eq(sales.createdBy, userId), gte(sales.createdAt, weekAgo), eq(sales.status, "completed"))
      : and(gte(sales.createdAt, weekAgo), eq(sales.status, "completed"));
    const monthCond = userId
      ? and(eq(sales.createdBy, userId), gte(sales.createdAt, monthAgo), eq(sales.status, "completed"))
      : and(gte(sales.createdAt, monthAgo), eq(sales.status, "completed"));

    const todaySales = await db.select({
      total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales).where(todayCond);
    const weekSales = await db.select({
      total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales).where(weekCond);
    const monthSales = await db.select({
      total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales).where(monthCond);

    const payCond = userId
      ? and(eq(sales.createdBy, userId), gte(sales.createdAt, weekAgo))
      : gte(sales.createdAt, weekAgo);
    const paymentBreakdown = await db.select({
      method: sales.paymentMethod,
      total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales).where(payCond).groupBy(sales.paymentMethod);

    return {
      today: { total: todaySales[0]?.total ?? "0", count: todaySales[0]?.count ?? 0 },
      week: { total: weekSales[0]?.total ?? "0", count: weekSales[0]?.count ?? 0 },
      month: { total: monthSales[0]?.total ?? "0", count: monthSales[0]?.count ?? 0 },
      paymentBreakdown,
    };
  }),
});
