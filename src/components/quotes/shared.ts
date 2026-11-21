// Types and helpers shared by the Cotizaciones page pieces (no components here).
import { useCallback } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import type { QuotesCopy } from "@/i18n/copy/quotes";
import { MAX_LINE_CENTS, MAX_QUANTITY, MAX_UNIT_PRICE, lineTotalCents, quoteTotals, type Totals } from "../../../api/lib/quotes";

type QuotesOut = inferRouterOutputs<AppRouter>["quotes"];
export type QuoteListItem = QuotesOut["list"]["items"][number];
export type QuoteDetail = QuotesOut["get"];
export type RecurringInvoice = QuotesOut["recurring"]["list"][number];
export type Receivable = QuotesOut["receivables"][number];

export type ServiceOption = { id: number; name: string; price: number };
export type CustomerOption = { id: number; label: string; detail: string | null };
export type CompanyInfo = { name: string | null; lines: string[]; logo: string | null };
export type CustomerValue = { id: number | null; name: string };

/** Same placeholder the POS uses for free-text charges: not a real catalog service. */
const CUSTOM_SERVICE_NAME = "Cargo personalizado";

type ServiceRow = { id: number; name: string; price: string | number | null; isActive?: boolean | number | null };
type CustomerRow = { id: number; name: string; lastName?: string | null; phone?: string | null; email?: string | null };
type SettingsRow = {
  companyName?: string | null; address?: string | null; city?: string | null; state?: string | null; zipCode?: string | null;
  phone?: string | null; email?: string | null; logo?: string | null;
};

export function toServiceOptions(rows: readonly ServiceRow[] | null | undefined): ServiceOption[] {
  return (rows ?? [])
    .filter((s) => (s.isActive === undefined || s.isActive === null || Boolean(s.isActive)) && s.name !== CUSTOM_SERVICE_NAME)
    .map((s) => ({ id: Number(s.id), name: s.name, price: Number(s.price ?? 0) || 0 }));
}

export function toCustomerOptions(rows: readonly CustomerRow[] | null | undefined): CustomerOption[] {
  return (rows ?? []).map((c) => ({
    id: Number(c.id),
    label: `${c.name} ${c.lastName ?? ""}`.trim(),
    detail: c.phone || c.email || null,
  }));
}

export function toCompanyInfo(row: SettingsRow | null | undefined): CompanyInfo {
  if (!row) return { name: null, lines: [], logo: null };
  const cityLine = [row.city, [row.state, row.zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const lines = [row.address, cityLine, row.phone, row.email].map((l) => l?.trim() ?? "").filter((l) => l.length > 0);
  const logo = row.logo && /^(data:image\/|https:\/\/)/.test(row.logo) ? row.logo : null;
  return { name: row.companyName?.trim() || null, lines, logo };
}

/** "21 nov 2026" for a "YYYY-MM-DD" day (read at noon so no timezone moves it). */
export function formatDay(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(value: Date | string, locale: string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

// ── Lines being edited (form state keeps what the user typed) ──

export type DraftLine = { key: string; serviceId: number | null; description: string; quantity: string; unitPrice: string };
export type LineValue = { serviceId: number | null; description: string; quantity: number; unitPrice: number };

export function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

/** "120" for whole dollars, "99.50" otherwise: what goes back into a price input. */
export function priceInput(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function toDraftLines(items: ReadonlyArray<{ serviceId: number | null; description: string; quantity: number; unitPrice: number }>): DraftLine[] {
  return items.map((it) => ({
    key: newKey(), serviceId: it.serviceId, description: it.description, quantity: String(it.quantity), unitPrice: priceInput(it.unitPrice),
  }));
}

export function blankLine(): DraftLine {
  return { key: newKey(), serviceId: null, description: "", quantity: "1", unitPrice: "" };
}

/** A money amount typed by the user ("$1,200.50" is fine); null when it isn't one. */
export function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function parseQuantity(s: string): number | null {
  const n = Number(s.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY ? n : null;
}

/** Checks every line; the first problem comes back as a message for the form. */
export function parseLines(lines: readonly DraftLine[], t: QuotesCopy["form"]): { items: LineValue[] } | { error: string } {
  if (lines.length === 0) return { error: t.noLines };
  const items: LineValue[] = [];
  for (const [i, l] of lines.entries()) {
    const n = i + 1;
    const description = l.description.trim();
    if (!description) return { error: t.errors.description(n) };
    const quantity = parseQuantity(l.quantity);
    if (quantity === null) return { error: t.errors.quantity(n) };
    const unitPrice = parseMoney(l.unitPrice);
    if (unitPrice === null || unitPrice > MAX_UNIT_PRICE) return { error: t.errors.price(n) };
    if (lineTotalCents({ quantity, unitPrice }) > MAX_LINE_CENTS) return { error: t.errors.lineTooBig(n) };
    items.push({ serviceId: l.serviceId, description: description.slice(0, 255), quantity, unitPrice });
  }
  return { items };
}

/** Live totals while typing: lines that aren't valid yet count as zero. */
export function draftTotals(lines: readonly DraftLine[], discount: string): Totals {
  return quoteTotals(
    lines.map((l) => ({ quantity: parseQuantity(l.quantity) ?? 0, unitPrice: parseMoney(l.unitPrice) ?? 0 })),
    parseMoney(discount) ?? 0,
  );
}

export const money = (cents: number): string => formatCurrency(cents / 100);

// ── Sharing ──

/** Plain text of a quote to paste in WhatsApp, a text message or an email. */
export function quoteShareText(q: QuoteDetail, t: QuotesCopy, company: CompanyInfo, locale: string): string {
  const out = [t.share.header(q.number, company.name)];
  if (q.customerName) out.push(t.share.customer(q.customerName));
  out.push("");
  for (const it of q.items) out.push(t.share.line(it.description, it.quantity, formatCurrency(it.lineTotal)));
  out.push("");
  if (q.discount > 0) {
    out.push(t.share.subtotal(formatCurrency(q.subtotal)));
    out.push(t.share.discount(formatCurrency(q.discount)));
  }
  out.push(t.share.total(formatCurrency(q.total)));
  if (q.validUntil) out.push(t.share.validUntil(formatDay(q.validUntil, locale)));
  if (q.notes) out.push("", t.share.notes(q.notes));
  if (company.name && company.lines.length > 0) out.push("", company.name, ...company.lines);
  return out.join("\n");
}

/** Copies text to the clipboard; false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Refreshes everything this page shows, and the sales the rest of the app shows when sales changed. */
export function useRefreshQuotes() {
  const utils = trpc.useUtils();
  return useCallback((salesChanged = false) => {
    void utils.quotes.invalidate();
    if (salesChanged) {
      void utils.sales.invalidate();
      void utils.dashboard.invalidate();
    }
  }, [utils]);
}

