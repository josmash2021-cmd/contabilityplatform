// Shared types and helpers for the Cobrar screen (src/pages/POS.tsx) and Servicios.

/** A row of `services.list` (raw SQL on the server, so numbers can arrive as strings). */
export type ServiceRow = {
  id: number;
  name: string;
  description: string | null;
  price: string | number;
  cost: string | number | null;
  isActive: number | boolean | null;
};

/** The fields of a `customers.list` row this screen uses. */
export type CustomerRow = { id: number; name: string; lastName: string | null; phone: string | null };

export type PayMethod = "cash" | "zelle" | "card";

export interface CartItem {
  id: string;
  serviceId?: number;
  name: string;
  price: number;
  quantity: number;
  isCustom?: boolean;
}

/** What the success screen and the receipt show after a sale. */
export type DoneSale = {
  id: number;
  invoiceNumber: string;
  at: string;
  method: PayMethod;
  customerName?: string;
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

export const num = (v: unknown) => Number(v ?? 0) || 0;

/** "$1,234.50"; negatives use a real minus sign. */
export const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lowercase, without accents: "Cambio de Aceité" → "cambio de aceite". */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const customerName = (c: Pick<CustomerRow, "name" | "lastName">) => `${c.name} ${c.lastName || ""}`.trim();

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
