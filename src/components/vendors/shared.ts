// Shared types and helpers for the Proveedores page and its dialogs.
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { intlLocale, type Lang } from "@/i18n/lang";
import type { VendorsCopy } from "@/i18n/copy/vendors";

type Out = inferRouterOutputs<AppRouter>;
export type BillItem = Out["vendors"]["bills"]["list"]["items"][number];
export type VendorItem = Out["vendors"]["list"][number];
export type PaymentMethod = "cash" | "zelle" | "card";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "zelle", "card"];

/** Same ceiling as the server (api/lib/vendors.ts MAX_BILL_AMOUNT). */
export const MAX_BILL_AMOUNT = 10_000_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** The user's local calendar day, YYYY-MM-DD. Call it outside render (e.g. in a useState initializer). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11-21" → "21 nov" (adds the year when it isn't the current one). No time zone involved. */
export function formatDay(iso: string | null | undefined, lang: Lang, today: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return new Date(y, m - 1, d).toLocaleDateString(intlLocale(lang), {
    day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "1,234.50", "$ 99" or "99,5" → 99.5; null when it isn't a positive amount. */
export function parseAmount(text: string): number | null {
  let s = text.replace(/[$\s]/g, "");
  // "1.234,56" or "99,5": a comma used for decimals.
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

/** What goes back into the amount input when editing (no thousands separators). */
export function amountInput(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** The status line of a bill: "Vencida hace 3 días", "Vence mañana", "Pagada el 2 nov · Zelle"… */
export function timingText(bill: BillItem, t: VendorsCopy, lang: Lang, today: string): string {
  if (bill.status === "paid") {
    const method = bill.paymentMethod ? t.methods[bill.paymentMethod] : "";
    return t.paidOn(formatDay(bill.paidAt, lang, today), method);
  }
  const days = bill.daysUntilDue ?? 0;
  if (days < 0) return t.timing.overdue(-days);
  if (days === 0) return t.timing.dueToday;
  if (days === 1) return t.timing.dueTomorrow;
  if (days <= 7) return t.timing.dueIn(days);
  return t.timing.dueOn(formatDay(bill.dueDate, lang, today));
}

/** Server messages are already in the user's language; fall back to a generic one. */
export function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message && !e.message.startsWith("[") ? e.message : fallback;
}
