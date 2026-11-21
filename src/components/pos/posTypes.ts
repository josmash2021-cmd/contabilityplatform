// Shared types and helpers for Cobrar (src/pages/POS.tsx), Clientes and Productos y servicios.
import { isValidTimeZone } from "../../../api/lib/ventas";

/** A row of `services.list` (raw SQL on the server, so numbers can arrive as strings). */
export type ServiceRow = {
  id: number;
  name: string;
  description: string | null;
  price: string | number;
  cost: string | number | null;
  isActive: number | boolean | null;
  kind?: "service" | "product";
  trackStock?: boolean;
  stock?: number;
  soldThisMonth?: number;
};

/** The fields of a `customers.list` row this screen uses. */
export type CustomerRow = { id: number; name: string; lastName: string | null; phone: string | null; email?: string | null };

/** How a sale was paid, as the server stores it. */
export type PayMethod = "cash" | "zelle" | "card";
/** The four choices in the "cómo te pagan" control. */
export type PayView = PayMethod | "split";

export interface CartItem {
  id: string;
  serviceId?: number;
  name: string;
  price: number;
  quantity: number;
  isCustom?: boolean;
}

/** What the success card and the receipt show after a sale. */
export type DoneSale = {
  id: number;
  invoiceNumber: string;
  at: string;
  method: PayMethod | "mixed";
  /** For a split sale: each part. */
  payments: Array<{ method: PayMethod; amount: number }>;
  change: number;
  customerName?: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
};

/** What the keypad is being used for. */
export type PadMode =
  | { kind: "free" }
  | { kind: "service"; service: ServiceRow }
  | { kind: "price"; lineId: string; name: string; price: number };

/** The name the server gives its own catch-all service for custom charges (api/sales-router.ts). */
export const SERVER_CUSTOM_SERVICE = "Cargo personalizado";

/** The device's time zone, sent with "today" questions (the server falls back to US Central). */
export const DEVICE_TZ: string | undefined = (() => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : undefined;
  } catch {
    return undefined;
  }
})();

export const num = (v: unknown) => Number(v ?? 0) || 0;

/** "$1,234.50"; negatives use a real minus sign. */
export const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Cents → "$1,234.50". */
export const moneyC = (cents: number) => money(cents / 100);
/** Cents → "$1,235" (big totals without cents, like the prototype's "Facturado este año"). */
export const money0C = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;

/** Lowercase, without accents: "Cambio de Aceité" → "cambio de aceite". */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const customerName = (c: Pick<CustomerRow, "name" | "lastName">) => `${c.name} ${c.lastName || ""}`.trim();

/** "2026-11-10" → "10 nov" (or "Nov 10"); with the year when it isn't this year. */
export function shortDay(day: string, locale: string, thisYear?: string): string {
  const d = new Date(`${day}T12:00:00`);
  const sameYear = !thisYear || day.slice(0, 4) === thisYear.slice(0, 4);
  return d.toLocaleDateString(locale, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

/** Keypad input: digits, one ".", at most 2 decimals and 8 whole digits (same limits as before). */
export function padKey(prev: string, key: string): string {
  if (key === "back") return prev.length <= 1 ? "0" : prev.slice(0, -1);
  if (key === ".") return prev.includes(".") ? prev : prev + ".";
  if (prev === "0") return key;
  const dec = prev.split(".")[1];
  if (dec !== undefined && dec.length >= 2) return prev;
  if (!prev.includes(".") && prev.replace(/[^0-9]/g, "").length >= 8) return prev;
  return prev + key;
}

/** How the keypad value reads while typing: "1234." → "$1,234." */
export function padDisplay(v: string): string {
  const [whole, dec] = v.split(".");
  const w = Number(whole || "0").toLocaleString("en-US");
  return `$${w}${dec !== undefined ? "." + dec : ""}`;
}

/** Price text from the server ("45.00") → keypad text ("45"). */
export function toPadValue(price: number): string {
  if (!(price > 0)) return "0";
  return String(Math.round(price * 100) / 100);
}
