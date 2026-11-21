// Shared bits for Movimientos (src/pages/Transactions.tsx): money and date formatting, row types.
import type { MovimientosCopy } from "@/i18n/copy/movimientos";
import type { MoneyType } from "../../../api/lib/bankReview";

export type { MoneyType };

/** A bank movement as bank.getMonthData returns it (live from Plaid, or saved rows when Plaid isn't reachable). */
export type BankRow = {
  id?: number | string;
  description: string | null;
  amount: string | number;
  type: string;
  category: string | null;
  transactionDate: string | Date | null;
  isReconciled?: boolean | number | null;
  plaidAmount?: string | number | null;
  plaidTransactionId?: string | null;
  importedFrom?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
};

/** A sale as sales.list returns it. */
export type SaleRow = {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  total: string | number;
  paymentMethod: string;
  status: string;
  createdAt: string | Date;
  items?: Array<{ serviceName: string }>;
};

/** What the category picker needs to know about a movement. */
export type Movement = {
  id: number;
  description: string;
  amount: number;
  type: MoneyType;
  category: string;
  /** Day of the movement, YYYY-MM-DD. */
  date: string;
  plaidAmount?: string | number | null;
  importedFrom?: string | null;
};

/** $1,234.50 with a real minus sign (U+2212) for negatives. */
export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "+$120.00" for money in, "−$45.10" for money out. The sign says it, not only the color. */
export const signedMoney = (amount: number, type: string) => `${type === "income" ? "+" : "−"}${money(Math.abs(amount))}`;

/**
 * Bank movements carry a day, not a time (stored as midnight UTC). Read it as a calendar day so a
 * movement from Nov 18 never shows as Nov 17 in US time zones.
 */
export function bankDay(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** "18 nov" / "Nov 18" for a YYYY-MM-DD day. */
export function dayLabel(day: string, locale: string, withYear = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

export function categoryLabel(key: string | null | undefined, t: MovimientosCopy): string {
  if (!key) return t.noCategory;
  return t.categories[key] ?? key.replace(/_/g, " ");
}

/** "Regions ••4821" */
export function accountLabel(bankName: string | null | undefined, accountNumber: string | null | undefined, t: MovimientosCopy): string {
  const last = (accountNumber ?? "").replace(/\D/g, "").slice(-4);
  return [bankName ?? "", last ? t.ending(last) : ""].filter(Boolean).join(" ");
}

export const asMoneyType = (type: string): MoneyType => (type === "income" ? "income" : "expense");

/** The tRPC error message, or a fallback. */
export function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
