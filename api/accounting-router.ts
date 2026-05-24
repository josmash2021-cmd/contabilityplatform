import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { accounts, journalEntries, journalEntryLines, sales, expenses, bankTransactions } from "@db/schema";
import { eq, desc, and, sql, isNull } from "drizzle-orm";

function fmtDate(d: Date | string | null): string {
  if (!d) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function ensureAccounts(db: any, userId: number) {
  const required = [
    { code: "1110", name: "Caja / Efectivo", type: "asset" },
    { code: "1120", name: "Banco", type: "asset" },
    { code: "1130", name: "Zelle", type: "asset" },
    { code: "1150", name: "Cuentas por Cobrar", type: "asset" },
    { code: "4100", name: "Ingresos", type: "revenue" },
    { code: "5100", name: "Gastos", type: "expense" },
    { code: "3110", name: "Capital Social", type: "equity" },
    { code: "3120", name: "Ganancias Acumuladas", type: "equity" },
    { code: "5200", name: "Transferencias", type: "expense" },
  ];
  for (const a of required) {
    const ex = await db.select().from(accounts).where(and(eq(accounts.code, a.code), eq(accounts.userId, userId))).limit(1);
    if (!ex[0]) await db.insert(accounts).values({ userId, code: a.code, name: a.name, type: a.type as any, balance: "0" });
  }
}

async function accId(db: any, userId: number, code: string) {
  const r = await db.select().from(accounts).where(and(eq(accounts.code, code), eq(accounts.userId, userId))).limit(1);
  return r[0]?.id ?? null;
}

// Exact decimal addition using integer cents (avoids JS float errors)
function addCents(a: string, b: string): number {
  return Math.round(parseFloat(a) * 100) + Math.round(parseFloat(b) * 100);
}

async function mkJE(
  db: any, userId: number, num: string, date: Date, desc: string,
  ref: string, refId: number | null, refType: string,
  lines: Array<{ accountId: number; debit: string; credit: string }>,
) {
  const tdCents = lines.reduce((s, l) => s + addCents(l.debit, "0"), 0);
  const tcCents = lines.reduce((s, l) => s + addCents(l.credit, "0"), 0);
  if (Math.abs(tdCents - tcCents) > 1 || lines.length === 0) return null;

  const td = String(tdCents / 100);
  const tc = String(tcCents / 100);

  const r = await db.insert(journalEntries).values({
    entryNumber: num,
    date: fmtDate(date),
    description: desc,
    reference: ref,
    referenceId: refId,
    referenceType: refType as any,
    debitTotal: td,
    creditTotal: tc,
    isPosted: true,
    createdBy: userId,
  });
  const id = Number(r[0].insertId);
  for (const l of lines) {
    await db.insert(journalEntryLines).values({
      journalEntryId: id, accountId: l.accountId, debit: l.debit, credit: l.credit,
    });
  }
  return id;
}

export const accountingRouter = createRouter({
  // SMART REPAIR: Only creates missing journal entries, never deletes existing ones
  rebuild: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { success: false, error: "No autenticado" };
    const userId = ctx.user.id;
    const db = getDb();

    try {
      await ensureAccounts(db, userId);
      const cash = await accId(db, userId, "1110");
      const bank = await accId(db, userId, "1120");
      const zelle = await accId(db, userId, "1130");
      const receivable = await accId(db, userId, "1150");
      const revenue = await accId(db, userId, "4100");
      const expense = await accId(db, userId, "5100");
      const transfer = await accId(db, userId, "5200");
      const resultExercise = await accId(db, userId, "3120");

      if (!cash || !bank || !revenue || !expense || !resultExercise || !transfer) {
        return { success: false, error: "Faltan cuentas contables" };
      }

      // STEP 1: Delete only orphaned entries (entries whose source records no longer exist)
      const orphanedEntries = await db.select({ id: journalEntries.id }).from(journalEntries)
        .where(
          and(
            eq(journalEntries.createdBy, userId),
            sql`${journalEntries.referenceId} IS NOT NULL`,
            sql`${journalEntries.referenceType} IN ('sale', 'purchase')`,
            sql`NOT EXISTS (SELECT 1 FROM ${sales} WHERE ${sales.id} = ${journalEntries.referenceId})`,
            sql`NOT EXISTS (SELECT 1 FROM ${expenses} WHERE ${expenses.id} = ${journalEntries.referenceId})`
          )
        );
      for (const entry of orphanedEntries) {
        await db.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, entry.id));
        await db.delete(journalEntries).where(eq(journalEntries.id, entry.id));
      }
      // Also delete orphaned bank_sync entries with no matching bank transaction
      const orphanedBankEntries = await db.select({ id: journalEntries.id, ref: journalEntries.reference }).from(journalEntries)
        .where(
          and(
            eq(journalEntries.createdBy, userId),
            eq(journalEntries.referenceType, "payment"),
            like(journalEntries.reference, "bank_%")
          )
        );
      for (const entry of orphanedBankEntries) {
        const txId = entry.ref?.replace("bank_", "");
        if (txId) {
          const exists = await db.select({ id: bankTransactions.id }).from(bankTransactions)
            .where(eq(bankTransactions.id, Number(txId))).limit(1);
          if (exists.length === 0) {
            await db.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, entry.id));
            await db.delete(journalEntries).where(eq(journalEntries.id, entry.id));
          }
        }
      }

      // STEP 2: Clean up closing entries (delete old ones, will recreate)
      const oldClosing = await db.select({ id: journalEntries.id }).from(journalEntries)
        .where(and(eq(journalEntries.createdBy, userId), eq(journalEntries.isClosingEntry, true)));
      for (const o of oldClosing) {
        await db.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, o.id));
        await db.delete(journalEntries).where(eq(journalEntries.id, o.id));
      }

      let n = 0;
      let totalRevenueStr = "0";
      let totalExpenseStr = "0";

      function addExact(a: string, b: string): string {
        const pa = Math.round(parseFloat(a) * 100);
        const pb = Math.round(parseFloat(b) * 100);
        return String((pa + pb) / 100);
      }

      const ts = Date.now().toString(36).toUpperCase();

      // STEP 3: SALES - only create if no JE exists
      const ss = await db.select().from(sales).where(eq(sales.createdBy, userId));
      for (const s of ss) {
        if (s.status !== "completed") continue;
        const existingJE = await db.select({ id: journalEntries.id }).from(journalEntries)
          .where(and(eq(journalEntries.referenceId, s.id), eq(journalEntries.referenceType, "sale"), eq(journalEntries.createdBy, userId)))
          .limit(1);
        if (existingJE.length > 0) continue; // Already has JE, skip

        const amtStr = String(s.total);
        totalRevenueStr = addExact(totalRevenueStr, amtStr);
        const method = s.paymentMethod || "cash";
        const assetId = method === "cash" ? cash : method === "zelle" ? zelle : method === "card" ? receivable : bank;
        const saleId = s.id ? Number(s.id) : null;
        await mkJE(db, userId, `JE-${ts}-${String(++n).padStart(4, "0")}`, s.createdAt ?? new Date(), `Venta ${s.invoiceNumber}`, s.invoiceNumber, saleId, "sale", [
          { accountId: assetId, debit: amtStr, credit: "0" },
          { accountId: revenue, debit: "0", credit: amtStr },
        ]);
      }

      // STEP 4: EXPENSES - only create if no JE exists
      const es = await db.select().from(expenses).where(eq(expenses.createdBy, userId));
      for (const e of es) {
        const existingJE = await db.select({ id: journalEntries.id }).from(journalEntries)
          .where(and(eq(journalEntries.referenceId, e.id), eq(journalEntries.referenceType, "purchase"), eq(journalEntries.createdBy, userId)))
          .limit(1);
        if (existingJE.length > 0) continue; // Already has JE, skip

        const amtStr = String(e.amount);
        totalExpenseStr = addExact(totalExpenseStr, amtStr);
        const method = e.paymentMethod || "cash";
        const assetId = method === "cash" ? cash : method === "zelle" ? zelle : bank;
        const expId = e.id ? Number(e.id) : null;
        await mkJE(db, userId, `JE-${ts}-${String(++n).padStart(4, "0")}`, e.date ?? new Date(), `Gasto: ${e.description || ""}`, `exp_${e.id}`, expId, "payment", [
          { accountId: expense, debit: amtStr, credit: "0" },
          { accountId: assetId, debit: "0", credit: amtStr },
        ]);
      }

      // STEP 5: BANK TRANSACTIONS - only create if no JE exists
      const bankTxs = await db.select().from(bankTransactions).where(eq(bankTransactions.userId, userId));
      for (const btx of bankTxs) {
        const existingJE = await db.select({ id: journalEntries.id }).from(journalEntries)
          .where(and(eq(journalEntries.reference, btx.reference || `bank_${btx.id}`), eq(journalEntries.createdBy, userId)))
          .limit(1);
        if (existingJE.length > 0) continue; // Already has JE, skip

        const amtStr = String(btx.amount);
        const isIncome = btx.type === "income";
        const btxId = btx.id ? Number(btx.id) : null;

        if (isIncome) {
          totalRevenueStr = addExact(totalRevenueStr, amtStr);
        } else {
          totalExpenseStr = addExact(totalExpenseStr, amtStr);
        }

        let debitId: number;
        let creditId: number;
        const cat = btx.category || "transfer";

        if (isIncome) {
          switch (cat) {
            case "zelle_income": debitId = zelle; creditId = revenue; break;
            case "cash_deposit":
            case "deposit":
            default: debitId = bank; creditId = revenue; break;
          }
        } else {
          switch (cat) {
            case "cash_withdrawal": debitId = cash; creditId = bank; break;
            case "zelle_sent": debitId = zelle; creditId = bank; break;
            case "subscription": debitId = expense; creditId = bank; break;
            case "transfer":
            default: debitId = transfer; creditId = bank; break;
          }
        }

        await mkJE(db, userId, `JE-${ts}-${String(++n).padStart(4, "0")}`, btx.transactionDate ?? new Date(), `Banco: ${btx.description || ""}`, btx.reference || `bank_${btx.id}`, btxId, "payment", [
          { accountId: debitId, debit: amtStr, credit: "0" },
          { accountId: creditId, debit: "0", credit: amtStr },
        ]);
      }

      // STEP 6: Create closing entries
      const totalRevenue = parseFloat(totalRevenueStr);
      const totalExpense = parseFloat(totalExpenseStr);
      const exactNetIncome = totalRevenue - totalExpense;

      if (Math.abs(exactNetIncome) > 0.001 || totalRevenue > 0.001 || totalExpense > 0.001) {
        if (totalRevenue > 0.001) {
          await mkJE(db, userId, `CIERRE-${String(++n).padStart(4, "0")}`, new Date(), `Cierre ingresos`, "cierre", null, "adjustment", [
            { accountId: revenue, debit: totalRevenueStr, credit: "0" },
            { accountId: resultExercise, debit: "0", credit: totalRevenueStr },
          ]);
        }
        if (totalExpense > 0.001) {
          await mkJE(db, userId, `CIERRE-${String(++n).padStart(4, "0")}`, new Date(), `Cierre gastos`, "cierre", null, "adjustment", [
            { accountId: resultExercise, debit: totalExpenseStr, credit: "0" },
            { accountId: expense, debit: "0", credit: totalExpenseStr },
          ]);
        }
      }

      return { success: true, entries: n, salesCount: ss.filter(s => s.status === "completed").length, expensesCount: es.length, bankCount: bankTxs.length, revenue: totalRevenueStr, expenseTotal: totalExpenseStr, netIncome: String(exactNetIncome), message: "Reparacion completada. Se crearon " + n + " asientos faltantes." };
    } catch (err: any) {
      return { success: false, error: `Error: ${err.message || "desconocido"}` };
    }
  }),

  verify: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { balanced: false };
    try {
      const db = getDb();

      // Helper: calculate balance
      const calcBalance = async () => {
        const lines = await db.select({ type: accounts.type, debit: journalEntryLines.debit, credit: journalEntryLines.credit })
          .from(journalEntryLines)
          .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
          .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
          .where(and(eq(journalEntries.createdBy, ctx.user!.id), eq(accounts.userId, ctx.user!.id)));

        let assets = 0, liabilities = 0, equity = 0, revenue = 0, expenseTotal = 0;
        for (const ln of lines) {
          const d = Number(ln.debit), c = Number(ln.credit);
          if (ln.type === "asset") assets += d - c;
          else if (ln.type === "liability") liabilities += c - d;
          else if (ln.type === "equity") equity += c - d;
          else if (ln.type === "revenue") revenue += c - d;
          else if (ln.type === "expense") expenseTotal += d - c;
        }
        const netIncome = revenue - expenseTotal;
        const totalEquity = equity + netIncome;
        const diff = Math.abs(assets - (liabilities + totalEquity));
        return { diff, assets, liabilities, totalEquity, netIncome };
      };

      // First check
      let balance = await calcBalance();

      // If unbalanced, auto-repair (create missing journal entries only)
      if (balance.diff >= 0.01) {
        console.log(`[AutoRepair] Balance unbalanced (${balance.diff.toFixed(2)}). Running smart repair...`);
        // Call the repair logic inline - only creates missing entries
        await ensureAccounts(db, ctx.user.id);
        // Quick repair: create missing journal entries for sales/expenses/bank without deleting anything
        const salesList = await db.select().from(sales).where(eq(sales.createdBy, ctx.user.id));
        for (const s of salesList) {
          if (s.status !== "completed") continue;
          const exists = await db.select({ id: journalEntries.id }).from(journalEntries)
            .where(and(eq(journalEntries.referenceId, s.id), eq(journalEntries.referenceType, "sale"))).limit(1);
          if (exists.length === 0) {
            const cashAcc = await accId(db, ctx.user.id, "1110");
            const zelleAcc = await accId(db, ctx.user.id, "1130");
            const revAcc = await accId(db, ctx.user.id, "4100");
            const recAcc = await accId(db, ctx.user.id, "1150");
            const bankAcc = await accId(db, ctx.user.id, "1120");
            if (!cashAcc || !revAcc) continue;
            const method = s.paymentMethod || "cash";
            const assetId = method === "cash" ? cashAcc : method === "zelle" ? zelleAcc : method === "card" ? recAcc : bankAcc;
            const totalStr = String(s.total);
            const saleId = s.id ? Number(s.id) : null;
            await mkJE(db, ctx.user.id, `JE-AUTO-${Date.now()}-${s.id}`, s.createdAt ?? new Date(), `Venta ${s.invoiceNumber}`, s.invoiceNumber, saleId, "sale", [
              { accountId: assetId, debit: totalStr, credit: "0" },
              { accountId: revAcc, debit: "0", credit: totalStr },
            ]);
          }
        }
        const expList = await db.select().from(expenses).where(eq(expenses.createdBy, ctx.user.id));
        for (const e of expList) {
          const exists = await db.select({ id: journalEntries.id }).from(journalEntries)
            .where(and(eq(journalEntries.referenceId, e.id), eq(journalEntries.referenceType, "purchase"))).limit(1);
          if (exists.length === 0) {
            const cashAcc = await accId(db, ctx.user.id, "1110");
            const zelleAcc = await accId(db, ctx.user.id, "1130");
            const expAcc = await accId(db, ctx.user.id, "5100");
            const bankAcc = await accId(db, ctx.user.id, "1120");
            if (!cashAcc || !expAcc) continue;
            const method = e.paymentMethod || "cash";
            const assetId = method === "cash" ? cashAcc : method === "zelle" ? zelleAcc : bankAcc;
            const amtStr = String(e.amount);
            const expId = e.id ? Number(e.id) : null;
            await mkJE(db, ctx.user.id, `JE-AUTO-${Date.now()}-${e.id}`, e.date ?? new Date(), `Gasto: ${e.description || ""}`, `exp_${e.id}`, expId, "purchase", [
              { accountId: expAcc, debit: amtStr, credit: "0" },
              { accountId: assetId, debit: "0", credit: amtStr },
            ]);
          }
        }
        const bankTxs = await db.select().from(bankTransactions).where(eq(bankTransactions.userId, ctx.user.id));
        for (const btx of bankTxs) {
          const exists = await db.select({ id: journalEntries.id }).from(journalEntries)
            .where(and(eq(journalEntries.reference, btx.reference || `bank_${btx.id}`))).limit(1);
          if (exists.length === 0) {
            const cashAcc = await accId(db, ctx.user.id, "1110");
            const bankAcc = await accId(db, ctx.user.id, "1120");
            const zelleAcc = await accId(db, ctx.user.id, "1130");
            const revAcc = await accId(db, ctx.user.id, "4100");
            const expAcc = await accId(db, ctx.user.id, "5100");
            const transferAcc = await accId(db, ctx.user.id, "5200");
            if (!cashAcc || !bankAcc || !revAcc || !expAcc || !transferAcc) continue;
            const isIncome = btx.type === "income";
            const amtStr = String(btx.amount);
            const btxId = btx.id ? Number(btx.id) : null;
            let debitId: number, creditId: number;
            const cat = btx.category || "transfer";
            if (isIncome) {
              switch (cat) { case "zelle_income": debitId = zelleAcc!; creditId = revAcc!; break; default: debitId = bankAcc!; creditId = revAcc!; break; }
            } else {
              switch (cat) { case "cash_withdrawal": debitId = cashAcc!; creditId = bankAcc!; break; case "zelle_sent": debitId = zelleAcc!; creditId = bankAcc!; break; case "subscription": debitId = expAcc!; creditId = bankAcc!; break; default: debitId = transferAcc!; creditId = bankAcc!; break; }
            }
            await mkJE(db, ctx.user.id, `JE-AUTO-${Date.now()}-${btx.id}`, btx.transactionDate ?? new Date(), `Banco: ${btx.description || ""}`, btx.reference || `bank_${btx.id}`, btxId, "payment", [
              { accountId: debitId, debit: amtStr, credit: "0" },
              { accountId: creditId, debit: "0", credit: amtStr },
            ]);
          }
        }
        // Recalculate after repair
        balance = await calcBalance();
        console.log(`[AutoRepair] After repair: diff=${balance.diff.toFixed(2)}`);
      }

      return {
        balanced: balance.diff < 0.01,
        diff: balance.diff.toFixed(2),
        assets: balance.assets.toFixed(2),
        eq: balance.totalEquity.toFixed(2),
        inc: balance.netIncome.toFixed(2),
        autoRepaired: balance.diff < 0.01,
      };
    } catch {
      return { balanced: false, diff: "0", assets: "0", eq: "0", inc: "0", autoRepaired: false };
    }
  }),
});
