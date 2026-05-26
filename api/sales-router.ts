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
      // Fetch sales
      const salesRows = await db.select({
        id: sales.id, invoiceNumber: sales.invoiceNumber, customerId: sales.customerId,
        customerName: sales.customerName, subtotal: sales.subtotal, discount: sales.discount,
        total: sales.total, paymentMethod: sales.paymentMethod, status: sales.status,
        notes: sales.notes, createdAt: sales.createdAt,
      }).from(sales).where(eq(sales.createdBy, userId)).orderBy(desc(sales.createdAt)).limit(limit).offset(offset);
      // Fetch items for each sale
      const result = await Promise.all(salesRows.map(async (sale) => {
        const items = await db.select({
          serviceName: saleServices.serviceName,
          quantity: saleServices.quantity,
          unitPrice: saleServices.unitPrice,
          total: saleServices.total,
        }).from(saleServices).where(eq(saleServices.saleId, sale.id));
        return { ...sale, items };
      }));
      return result;
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

  stats: authedQuery
    .input(z.object({
      todayDate: z.string().optional(),     // "2026-05-25" (local date)
      weekStartDate: z.string().optional(), // "2026-05-19" (local date)
      monthStartDate: z.string().optional(),// "2026-05-01" (local date)
      tzOffsetHours: z.number().optional(), // -4 for EDT
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;

      const todayDate = input?.todayDate;
      const weekStartDate = input?.weekStartDate;
      const monthStartDate = input?.monthStartDate;
      const tzOff = input?.tzOffsetHours ?? 0;
      const tzExpr = `DATE_ADD(createdAt, INTERVAL ${tzOff} HOUR)`;

      // Helper: normalize db.execute result
      const getRows = (r: any): any[] => {
        if (Array.isArray(r) && r.length === 2 && Array.isArray(r[1]) && r[1][0]?.name !== undefined) return r[0];
        return Array.isArray(r) ? r : [];
      };

      // ─── TODAY ───
      const todayResult = (todayDate && userId)
        ? getRows(await db.execute(sql.raw(`
            SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM sales
            WHERE createdBy = ${userId}
              AND DATE(${tzExpr}) = '${todayDate}'
              AND status = 'completed'
          `)))
        : [];

      // ─── WEEK ───
      const weekResult = (weekStartDate && todayDate && userId)
        ? getRows(await db.execute(sql.raw(`
            SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM sales
            WHERE createdBy = ${userId}
              AND DATE(${tzExpr}) >= '${weekStartDate}'
              AND DATE(${tzExpr}) <= '${todayDate}'
              AND status = 'completed'
          `)))
        : [];

      // ─── MONTH ───
      const monthResult = (monthStartDate && todayDate && userId)
        ? getRows(await db.execute(sql.raw(`
            SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM sales
            WHERE createdBy = ${userId}
              AND DATE(${tzExpr}) >= '${monthStartDate}'
              AND DATE(${tzExpr}) <= '${todayDate}'
              AND status = 'completed'
          `)))
        : [];

      // ─── Payment breakdown (week) ───
      const paymentResult = (weekStartDate && todayDate && userId)
        ? getRows(await db.execute(sql.raw(`
            SELECT paymentMethod as method, COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM sales
            WHERE createdBy = ${userId}
              AND DATE(${tzExpr}) >= '${weekStartDate}'
              AND DATE(${tzExpr}) <= '${todayDate}'
            GROUP BY paymentMethod
          `)))
        : [];

      return {
        today: { total: todayResult[0]?.total ?? "0", count: todayResult[0]?.count ?? 0 },
        week: { total: weekResult[0]?.total ?? "0", count: weekResult[0]?.count ?? 0 },
        month: { total: monthResult[0]?.total ?? "0", count: monthResult[0]?.count ?? 0 },
        paymentBreakdown: paymentResult as Array<{ method: string; total: string; count: number }>,
      };
    }),
});
