import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { cloverAccounts, cloverTransactions, accounts, journalEntries, journalEntryLines } from "@db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
// and already imported

// ─── Clover API Client ───
const CLOVER_BASE =
  process.env.CLOVER_ENV === "sandbox"
    ? "https://apisandbox.dev.clover.com/v3"
    : "https://api.clover.com/v3";

async function cloverRequest(endpoint: string, accessToken: string, method = "GET", body?: any) {
  // Clover private tokens use ?access_token= query param, not Bearer header
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${CLOVER_BASE}${endpoint}${separator}access_token=${accessToken}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    
    throw new Error(`Clover API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Create Journal Entry for Clover Payment ───
async function createCloverJournalEntry(
  db: any,
  amount: number,
  description: string,
  userId: number,
) {
  try {
    // Ensure user accounts exist
    const requiredAccounts = [
      { code: "1110", name: "Caja / Efectivo", type: "asset" },
      { code: "4100", name: "Ingresos por Servicios", type: "revenue" },
    ];
    for (const acc of requiredAccounts) {
      const existing = await db.select().from(accounts)
        .where(and(eq(accounts.code, acc.code), eq(accounts.userId, userId))).limit(1);
      if (!existing[0]) {
        await db.insert(accounts).values({ userId, code: acc.code, name: acc.name, type: acc.type as any, balance: "0" });
      }
    }

    const lastEntry = await db.select({ entryNumber: journalEntries.entryNumber })
      .from(journalEntries).orderBy(desc(journalEntries.id)).limit(1);
    const lastNum = lastEntry[0]?.entryNumber ? parseInt(lastEntry[0].entryNumber.replace("JE-", "")) : 0;
    const entryNum = `JE-${String(lastNum + 1).padStart(6, "0")}`;

    const date = new Date();
    const debitAccountCode = "1110";
    const creditAccountCode = "4100";

    const debitAcc = await db.select().from(accounts)
      .where(and(eq(accounts.code, debitAccountCode), eq(accounts.userId, userId))).limit(1);
    const creditAcc = await db.select().from(accounts)
      .where(and(eq(accounts.code, creditAccountCode), eq(accounts.userId, userId))).limit(1);

    if (!debitAcc[0] || !creditAcc[0]) return;

    const entry = await db.insert(journalEntries).values({
      entryNumber: entryNum,
      date,
      description: `${description} - Clover POS`,
      reference: "clover_payment",
      referenceType: "sale",
      debitTotal: String(amount),
      creditTotal: String(amount),
      isPosted: true,
      createdBy: userId,
    });
    const entryId = Number(entry[0].insertId);

    await db.insert(journalEntryLines).values([
      { journalEntryId: entryId, accountId: debitAcc[0].id, debit: String(amount), credit: "0", description },
      { journalEntryId: entryId, accountId: creditAcc[0].id, debit: "0", credit: String(amount), description },
    ]);
  } catch (e) {
    
  }
}

export const cloverRouter = createRouter({
  // ── Check connection status ──
  getAccount: authedQuery.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = getDb();
    const rows = await db.select().from(cloverAccounts)
      .where(eq(cloverAccounts.userId, userId)).limit(1);
    if (!rows[0]) return null;
    return {
      ...rows[0],
      accessToken: undefined,
      refreshToken: undefined,
      hasToken: !!rows[0].accessToken,
    };
  }),

  // ── List devices ──
  listDevices: authedQuery
    .input(z.object({ merchantId: z.string(), accessToken: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const devices = await cloverRequest(`/merchants/${input.merchantId}/devices`, input.accessToken) as any;
        return {
          success: true,
          devices: (devices?.elements || []).map((d: any) => ({
            id: d.id,
            name: d.name || d.model || `Device ${d.serial || d.id?.slice(-6)}`,
            model: d.model,
            serial: d.serial,
          })),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }),

  // ── Connect with Merchant ID + API Token ──
  connect: authedQuery
    .input(z.object({
      merchantId: z.string().min(1),
      accessToken: z.string().min(1),
      deviceId: z.string().optional(),
      deviceName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const db = getDb();

      try {
        // Verify credentials by fetching merchant info
        const merchant = await cloverRequest(`/merchants/${input.merchantId}`, input.accessToken) as any;
        const merchantName = merchant?.name || "Clover Merchant";

        // Auto-detect devices if not provided
        let deviceId = input.deviceId;
        let deviceName = input.deviceName;
        if (!deviceId) {
          try {
            const devices = await cloverRequest(`/merchants/${input.merchantId}/devices`, input.accessToken) as any;
            const firstDevice = devices?.elements?.[0];
            if (firstDevice?.id) {
              deviceId = firstDevice.id;
              const deviceIdSuffix = deviceId ? deviceId.slice(-6) : "device";
              deviceName = firstDevice.name || firstDevice.model || `Clover ${firstDevice.serial || deviceIdSuffix}`;

            }
          } catch (e) {
            
          }
        }

        const existing = await db.select().from(cloverAccounts)
          .where(eq(cloverAccounts.userId, userId)).limit(1);

        if (existing.length > 0) {
          await db.update(cloverAccounts).set({
            merchantId: input.merchantId,
            merchantName,
            accessToken: input.accessToken,
            deviceId: deviceId || existing[0].deviceId,
            deviceName: deviceName || existing[0].deviceName,
            isActive: true,
            updatedAt: new Date(),
          }).where(eq(cloverAccounts.id, existing[0].id));
        } else {
          await db.insert(cloverAccounts).values({
            userId,
            merchantId: input.merchantId,
            merchantName,
            accessToken: input.accessToken,
            deviceId: deviceId || null,
            deviceName: deviceName || null,
            isActive: true,
          });
        }

        return { success: true, merchantName, deviceName, deviceId };
      } catch (err: any) {
        return { success: false, error: err.message || "Error conectando con Clover" };
      }
    }),

  // ── Disconnect ──
  disconnect: authedQuery.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = getDb();
    await db.delete(cloverAccounts).where(eq(cloverAccounts.userId, userId));
    return { success: true };
  }),

  // ── Create Order in Clover (for manual entry on device) ──
  createOrder: authedQuery
    .input(z.object({
      amount: z.number().positive(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const db = getDb();

      const account = await db.select().from(cloverAccounts)
        .where(eq(cloverAccounts.userId, userId)).limit(1);
      if (!account[0]?.accessToken) {
        return { success: false, error: "Clover no conectado" };
      }

      try {
        const amountCents = Math.round(input.amount * 100);
        const merchantId = account[0].merchantId;
        const token = account[0].accessToken;

        // Create order
        const order = await cloverRequest(
          `/merchants/${merchantId}/orders`,
          token,
          "POST",
          { state: "open" }
        ) as any;

        // Add line item
        await cloverRequest(
          `/merchants/${merchantId}/orders/${order.id}/line_items`,
          token,
          "POST",
          { name: input.note || "Servicio", price: amountCents }
        );

        // Update total
        await cloverRequest(
          `/merchants/${merchantId}/orders/${order.id}`,
          token,
          "POST",
          { total: amountCents }
        );

        return { success: true, orderId: order.id };
      } catch (err: any) {
        
        return { success: false, error: err.message };
      }
    }),

  // ── Initiate Payment on Clover Device (Cloud Pay Display) ──
  initiatePayment: authedQuery
    .input(z.object({
      amount: z.number().positive(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const db = getDb();

      const account = await db.select().from(cloverAccounts)
        .where(eq(cloverAccounts.userId, userId)).limit(1);
      if (!account[0]?.accessToken) {
        return { success: false, error: "Clover no conectado" };
      }
      if (!account[0]?.deviceId) {
        return { success: false, error: "No hay dispositivo configurado. Desconecta y vuelve a conectar Clover para detectar tu terminal." };
      }

      try {
        const amountCents = Math.round(input.amount * 100);
        const merchantId = account[0].merchantId;
        const token = account[0].accessToken;

        // Step 1: Get tender ID for Credit Card (cache it)
        let tenderId = account[0].tenderId;
        if (!tenderId) {
          try {
            const tenders = await cloverRequest(`/merchants/${merchantId}/tenders`, token) as any;
            const creditTender = tenders?.elements?.find((t: any) =>
              t.label?.toLowerCase().includes("credit") ||
              t.label?.toLowerCase().includes("card") ||
              t.label?.toLowerCase().includes("default")
            );
            tenderId = creditTender?.id || tenders?.elements?.[0]?.id;
            if (tenderId) {
              await db.update(cloverAccounts).set({ tenderId }).where(eq(cloverAccounts.id, account[0].id));
              
            }
          } catch (e: any) {
            
          }
        }

        // Step 2: Create order
        const order = await cloverRequest(
          `/merchants/${merchantId}/orders`,
          token,
          "POST",
          { state: "open" }
        ) as any;
        

        // Step 3: Add line item
        await cloverRequest(
          `/merchants/${merchantId}/orders/${order.id}/line_items`,
          token,
          "POST",
          {
            name: input.note || "Servicio",
            price: amountCents,
          }
        );

        // Step 4: Update order total
        await cloverRequest(
          `/merchants/${merchantId}/orders/${order.id}`,
          token,
          "POST",
          { total: amountCents }
        );

        // Step 5: Send payment to device via Cloud Pay Display
        // POST /orders/{orderId}/pay triggers the payment on the connected device
        
        let devicePayment = null;
        try {
          const payBody: any = {
            deviceId: account[0].deviceId,
            amount: amountCents,
            tipAmount: 0,
            taxAmount: 0,
          };
          if (tenderId) payBody.tender = { id: tenderId };

          devicePayment = await cloverRequest(
            `/merchants/${merchantId}/orders/${order.id}/pay`,
            token,
            "POST",
            payBody
          );
          
        } catch (payErr: any) {
          
          // Fallback: try direct payment endpoint
          try {
            devicePayment = await cloverRequest(
              `/merchants/${merchantId}/pay`,
              token,
              "POST",
              {
                deviceId: account[0].deviceId,
                amount: amountCents,
                orderId: order.id,
              }
            );
            
          } catch (fbErr: any) {
            
          }
        }

        // Record transaction
        const result = await db.insert(cloverTransactions).values({
          userId,
          cloverAccountId: account[0].id,
          cloverOrderId: order?.id,
          amount: String(input.amount),
          status: devicePayment ? "processing" : "pending",
          deviceName: account[0].deviceName,
          notes: input.note || null,
        });

        return {
          success: true,
          orderId: order.id,
          cloverTxId: Number(result[0].insertId),
          status: devicePayment ? "processing" : "pending",
          deviceName: account[0].deviceName,
        };
      } catch (err: any) {
        
        return { success: false, error: err.message };
      }
    }),

  // ── Check Payment Status ──
  checkPayment: authedQuery
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const db = getDb();

      const account = await db.select().from(cloverAccounts)
        .where(eq(cloverAccounts.userId, userId)).limit(1);
      if (!account[0]?.accessToken) {
        return { success: false, error: "Clover no conectado" };
      }

      try {
        // Fetch payments for the order
        const payments = await cloverRequest(
          `/merchants/${account[0].merchantId}/orders/${input.orderId}/payments`,
          account[0].accessToken
        ) as any;

        const payment = payments?.elements?.[0];
        if (payment) {
          // Update local record
          await db.update(cloverTransactions).set({
            cloverPaymentId: payment.id,
            status: payment.result === "SUCCESS" ? "completed" : "failed",
            cardLastFour: payment.cardTransaction?.last4 || null,
            cardType: payment.cardTransaction?.cardType || null,
            updatedAt: new Date(),
          }).where(eq(cloverTransactions.cloverOrderId, input.orderId));

          // If completed, create journal entry
          if (payment.result === "SUCCESS") {
            const tx = await db.select().from(cloverTransactions)
              .where(eq(cloverTransactions.cloverOrderId, input.orderId)).limit(1);
            if (tx[0]) {
              await createCloverJournalEntry(db, Number(tx[0].amount), `Pago Clover - ${tx[0].notes || "POS"}`, Number(userId));
            }
          }

          return {
            success: true,
            status: payment.result === "SUCCESS" ? "completed" : "failed",
            cardLastFour: payment.cardTransaction?.last4,
            cardType: payment.cardTransaction?.cardType,
          };
        }

        return { success: true, status: "pending" };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }),

  // ── Complete Payment (mark as paid manually) ──
  completePayment: authedQuery
    .input(z.object({
      cloverTxId: z.number(),
      saleId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      await db.update(cloverTransactions).set({
        saleId: input.saleId || null,
        status: "completed",
        updatedAt: new Date(),
      }).where(eq(cloverTransactions.id, input.cloverTxId));

      const tx = await db.select().from(cloverTransactions)
        .where(eq(cloverTransactions.id, input.cloverTxId)).limit(1);
      if (tx[0]) {
        await createCloverJournalEntry(db, Number(tx[0].amount), `Pago Clover - ${tx[0].notes || "POS"}`, tx[0].userId ? Number(tx[0].userId) : 0);
      }

      return { success: true };
    }),

  // ── List Clover Transactions ──
  list: authedQuery.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = getDb();
    return db.select().from(cloverTransactions)
      .where(eq(cloverTransactions.userId, userId))
      .orderBy(desc(cloverTransactions.createdAt))
      .limit(100);
  }),

  // ── Stats ──
  stats: authedQuery.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = getDb();

    const hasAccount = await db.select().from(cloverAccounts)
      .where(eq(cloverAccounts.userId, userId)).limit(1);

    if (!hasAccount[0]) {
      return { totalAmount: "0", count: 0, todayAmount: "0", connected: false };
    }

    const total = await db.select({
      total: sql<string>`COALESCE(SUM(${cloverTransactions.amount}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cloverTransactions)
      .where(and(eq(cloverTransactions.userId, userId), eq(cloverTransactions.status, "completed")));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTotal = await db.select({
      total: sql<string>`COALESCE(SUM(${cloverTransactions.amount}), 0)`,
    }).from(cloverTransactions)
      .where(
        and(
          eq(cloverTransactions.userId, userId),
          eq(cloverTransactions.status, "completed"),
          sql`${cloverTransactions.createdAt} >= ${today}`,
        )
      );

    return {
      totalAmount: total[0]?.total ?? "0",
      count: total[0]?.count ?? 0,
      todayAmount: todayTotal[0]?.total ?? "0",
      connected: true,
      merchantName: hasAccount[0].merchantName,
    };
  }),
});
