import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sales, expenses, journalEntries, journalEntryLines, accounts } from "@db/schema";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";

export const exportRouter = createRouter({

  incomeStatement: authedQuery
    .input(z.object({ year: z.number(), month: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) return { csv: "", filename: "" };
      const db = getDb();
      const userId = ctx.user.id;

      try {
        const start = new Date(input.year, input.month - 1, 1);
        const end = new Date(input.year, input.month, 0, 23, 59, 59);

        // Get totals using SQL aggregation (handles nulls automatically)
        const revResult = await db.select({
          total: sql<string>`COALESCE(SUM(${sales.total}), 0)`,
        }).from(sales).where(and(
          eq(sales.createdBy, userId),
          gte(sales.createdAt, start),
          lte(sales.createdAt, end),
          eq(sales.status, "completed"),
        ));
        const totalRevenue = Number(revResult[0]?.total ?? 0);

        const expResult = await db.select({
          total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
        }).from(expenses).where(and(
          eq(expenses.createdBy, userId),
          gte(expenses.date, start),
          lte(expenses.date, end),
        ));
        const totalExpenses = Number(expResult[0]?.total ?? 0);

        const netIncome = totalRevenue - totalExpenses;

        // Build CSV manually (most reliable method)
        const lines: string[] = [];
        lines.push("Concepto,Ingresos ($),Gastos ($)");
        lines.push(`Ventas de servicios,${totalRevenue.toFixed(2)},0.00`);
        lines.push(`Gastos operativos,0.00,${totalExpenses.toFixed(2)}`);
        lines.push(`TOTAL,${totalRevenue.toFixed(2)},${totalExpenses.toFixed(2)}`);
        lines.push(`,,`);
        lines.push(`UTILIDAD NETA,${netIncome.toFixed(2)},`);

        const csv = lines.join("\n");
        return { csv, filename: `Estado_Resultados_${input.month}_${input.year}.csv` };
      } catch {
        return { csv: "", filename: "" };
      }
    }),

  journalEntries: authedQuery
    .input(z.object({ limit: z.number().default(500) }).optional())
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) return { csv: "", filename: "" };
      const db = getDb();
      const userId = ctx.user.id;
      const limit = input?.limit ?? 500;

      try {
        // The limit counts entries (not their lines): page the entries first, then fetch their lines.
        const page: Array<typeof journalEntries.$inferSelect> = await db.select().from(journalEntries)
          .where(eq(journalEntries.createdBy, userId))
          .orderBy(desc(journalEntries.date), desc(journalEntries.id))
          .limit(limit);
        const lineRows: Array<{ entryId: number; code: string | null; name: string | null; debit: string | null; credit: string | null }> = page.length
          ? await db.select({
            entryId: journalEntryLines.journalEntryId,
            code: accounts.code,
            name: accounts.name,
            debit: journalEntryLines.debit,
            credit: journalEntryLines.credit,
          })
            .from(journalEntryLines)
            .leftJoin(accounts, and(eq(journalEntryLines.accountId, accounts.id), eq(accounts.userId, userId)))
            .where(inArray(journalEntryLines.journalEntryId, page.map((e) => e.id)))
            .orderBy(journalEntryLines.id)
          : [];
        const entryMap = new Map(page.map((entry) => [Number(entry.id), { entry, lines: lineRows.filter((l) => Number(l.entryId) === Number(entry.id) && l.code !== null) }]));

        const lines: string[] = [];
        lines.push("Asiento,Fecha,Descripcion,Cuenta,Debito ($),Credito ($)");

        for (const { entry, lines: jeLines } of entryMap.values()) {
          for (const jl of jeLines) {
            const fecha = entry.date ? new Date(entry.date).toLocaleDateString("es") : "";
            const cuenta = `${jl.code || ""} - ${jl.name || ""}`.replace(/,/g, ";");
            const desc = (entry.description || "").replace(/,/g, ";").replace(/\n/g, " ");
            // Prevent CSV injection
            const safeDesc = desc.startsWith("=") || desc.startsWith("+") || desc.startsWith("-") || desc.startsWith("@") ? `"${desc}"` : desc;
            lines.push(`${entry.entryNumber || ""},${fecha},${safeDesc},${cuenta},${jl.debit || "0"},${jl.credit || "0"}`);
          }
        }

        const csv = lines.join("\n");
        return { csv, filename: `Libro_Diario.csv` };
      } catch {
        return { csv: "", filename: "" };
      }
    }),
});
