// "Tu resumen del lunes" by email, for whoever turned it on in Asistente (assistantPrefs.weeklyEmail).
// Runs every hour from boot.ts; it sends only on Mondays from 7 am US Central (Alabama's time), once per person
// per Monday (lastWeeklySent is claimed before sending, so two servers never send it twice). The numbers are
// the same ones the app shows (weeklyOf), worked out without the model.
import { eq, sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { users } from "@db/schema";
import { weeklyOf } from "../assistant-router";
import { isMissingTable } from "./dbErrors";
import { escapeHtml, mailReady, sendMail, simpleHtml } from "./mailer";

type Db = ReturnType<typeof getDb>;
type Weekly = Awaited<ReturnType<typeof weeklyOf>>;

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Monday and the hour, in US Central time. */
function centralNow(now: Date): { day: string; weekday: string; hour: number } {
  const day = now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const weekday = now.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long" });
  const hour = Number(now.toLocaleString("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }));
  return { day, weekday, hour };
}

/** The summary's lines, in the app's words (the same order as the Asistente card). */
export function weeklyLines(w: Weekly): string[] {
  if (w.mode === "personal") {
    const out = [w.spent > 0 ? `La semana pasada gastaste ${money(w.spent)}.` : "La semana pasada no tuviste gastos."];
    if (w.over) out.push(`Te pasaste del presupuesto de ${w.over.category} por ${money(w.over.spent - w.over.limit)}.`);
    else if (w.budgets > 0) out.push("Vas dentro de tus presupuestos.");
    if (w.goals.count > 0) out.push(`Llevas ${money(w.goals.saved)} ahorrados de ${money(w.goals.target)} en tus metas.`);
    return out;
  }
  const out: string[] = [];
  if (w.bank.count > 0) out.push(`La semana pasada entraron ${money(w.bank.moneyIn)} y salieron ${money(w.bank.moneyOut)}.`);
  else if (w.sales.count > 0 || w.expenses.count > 0) out.push(`La semana pasada vendiste ${money(w.sales.total)} y gastaste ${money(w.expenses.total)}.`);
  else out.push("La semana pasada no hubo movimientos.");
  if (w.owed.late > 0 && w.owed.top) out.push(`${w.owed.late} ${plural(w.owed.late, "factura vencida", "facturas vencidas")}: ${w.owed.top.client} te debe ${money(w.owed.top.balance)}.`);
  else if (w.owed.count > 0) out.push(`Te deben ${money(w.owed.total)} en ${w.owed.count} ${plural(w.owed.count, "factura", "facturas")}.`);
  else out.push("Nadie te debe dinero ahora.");
  out.push(w.bills.count > 0
    ? `Esta semana pagas ${money(w.bills.total)} a proveedores${w.bills.late ? ` (${w.bills.late} ${plural(w.bills.late, "vencida", "vencidas")})` : ""}.`
    : "No tienes facturas de proveedores por pagar esta semana.");
  return out;
}

/** "lunes 23 nov" */
function mondayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const month = d.toLocaleDateString("es", { month: "short", timeZone: "UTC" }).replace(".", "");
  return `lunes ${d.getUTCDate()} ${month}`;
}

/**
 * Sends this Monday's summary to everyone who wants it and hasn't got it yet. Never throws.
 * `force` (tests) skips the Monday-morning check.
 */
export async function runWeeklyEmails(db: Db, opts: { now?: Date; force?: boolean; appUrl?: string } = {}): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!mailReady()) return { sent: 0, failed: 0, skipped: "no-mail" };
  const now = centralNow(opts.now ?? new Date());
  if (!opts.force && (now.weekday !== "Monday" || now.hour < 7)) return { sent: 0, failed: 0, skipped: "not-monday-morning" };
  const monday = now.day;
  let due: Array<{ userId: number; last: string | null }>;
  try {
    due = (await db.execute(sql`
      SELECT userId, DATE_FORMAT(lastWeeklySent, '%Y-%m-%d') AS last FROM assistantPrefs
      WHERE weeklyEmail = TRUE AND (lastWeeklySent IS NULL OR lastWeeklySent < ${monday})`) as unknown as [Array<{ userId: number; last: string | null }>])[0];
  } catch (e: unknown) {
    if (isMissingTable(e)) return { sent: 0, failed: 0, skipped: "no-prefs" };
    console.error("[weekly-email] lookup failed:", e instanceof Error ? e.message : e);
    return { sent: 0, failed: 0, skipped: "error" };
  }
  const appUrl = (opts.appUrl ?? process.env.APP_URL ?? "https://aethelaccountingplatform.com").replace(/\/+$/, "");
  let sent = 0, failed = 0;
  for (const row of due) {
    const userId = Number(row.userId);
    try {
      // Claim this Monday first: another server running the same job skips this person.
      const claim = await db.execute(sql`UPDATE assistantPrefs SET lastWeeklySent = ${monday}
        WHERE userId = ${userId} AND (lastWeeklySent IS NULL OR lastWeeklySent < ${monday})`);
      if (Number((claim as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0) === 0) continue;
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user?.email) continue;
      const w = await weeklyOf(db, user);
      const lines = weeklyLines(w);
      const title = `Tu resumen del ${mondayLabel(w.monday)}`;
      const name = (user.name || "").trim().split(/\s+/)[0] || "";
      const ok = await sendMail({
        to: user.email,
        subject: title,
        text: `Hola${name ? ` ${name}` : ""},\n\n${lines.map((l) => `• ${l}`).join("\n")}\n\nVer más en la app: ${appUrl}/assistant\n\nRecibes este correo porque lo activaste en el Asistente. Puedes apagarlo ahí mismo.`,
        html: simpleHtml(title,
          [`Hola${name ? ` ${escapeHtml(name)}` : ""}, así te fue:`, `<ul style="margin:0;padding-left:18px">${lines.map((l) => `<li style="margin:0 0 6px">${escapeHtml(l)}</li>`).join("")}</ul>`],
          { label: "Abrir la app", url: `${appUrl}/assistant` },
          "Recibes este correo porque lo activaste en el Asistente. Puedes apagarlo ahí mismo."),
      });
      if (ok) sent++;
      else {
        failed++;
        // Not sent: give the Monday back so the next hour tries again.
        await db.execute(sql`UPDATE assistantPrefs SET lastWeeklySent = ${row.last} WHERE userId = ${userId}`);
      }
    } catch (e: unknown) {
      failed++;
      console.error(`[weekly-email] user ${userId} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { sent, failed };
}
