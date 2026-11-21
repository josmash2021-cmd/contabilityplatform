// Types and helpers shared by the Facturas pieces (no components here).
import { useCallback } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import type { InvoicesCopy } from "@/i18n/copy/invoices";
import type { CompanyInfo } from "@/components/quotes/shared";
import { dueInfo, type InvoiceState } from "../../../api/lib/invoices";
import type { Tone } from "./proto";

type InvoicesOut = inferRouterOutputs<AppRouter>["invoices"];
export type InvoiceList = InvoicesOut["list"];
export type InvoiceItem = InvoiceList["items"][number];
export type InvoiceDetail = InvoicesOut["get"];
export type InvoiceEvent = InvoiceDetail["events"][number];

/** Cents as dollars: "$1,250.00". */
export const money = (cents: number): string => formatCurrency(cents / 100);

/** "18 nov" (plus the year when it isn't this year's). Dates are "YYYY-MM-DD", read at noon so no timezone moves them. */
export function fmtDay(iso: string | null | undefined, locale: string, today?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = !today || today.slice(0, 4) === iso.slice(0, 4);
  return d.toLocaleDateString(locale, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

export function monthName(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale, { month: "long" });
}

/** The status word and its color, as the prototype's invState(). */
export function stateView(i: Pick<InvoiceItem, "state" | "netPaidCents" | "refundedCents">, t: InvoicesCopy): { label: string; tone: Tone } {
  const s: InvoiceState = i.state;
  if (s === "paid") return { label: i.refundedCents > 0 ? t.state.paidRefund : t.state.paid, tone: "good" };
  if (s === "draft") return { label: t.state.draft, tone: "muted" };
  if (s === "void") return { label: t.state.void, tone: "muted" };
  if (s === "writeoff") return { label: t.state.writeoff, tone: "muted" };
  if (s === "refunded") return { label: t.state.refunded, tone: "muted" };
  if (s === "late") return { label: i.netPaidCents > 0 ? t.state.latePartial : t.state.late, tone: "bad" };
  return { label: i.netPaidCents > 0 ? t.state.partial : t.state.open, tone: "open" };
}

/** The "Vence" column, as the prototype's dueText(). */
export function dueView(i: Pick<InvoiceItem, "state" | "dueDate" | "lastPaymentOn">, today: string, t: InvoicesCopy, locale: string): { text: string; tone: "bad" | "warn" | "" } {
  if (i.state === "paid") return { text: i.lastPaymentOn ? t.due.paidOn(fmtDay(i.lastPaymentOn, locale, today)) : t.due.paid, tone: "" };
  if (i.state === "draft") return { text: t.due.unsent, tone: "" };
  if (i.state === "void") return { text: t.due.void, tone: "" };
  if (i.state === "writeoff") return { text: t.due.writeoff, tone: "" };
  if (i.state === "refunded") return { text: t.due.refunded, tone: "" };
  const d = dueInfo(i.dueDate, today);
  if (d.kind === "overdue") return { text: t.due.overdue(d.days), tone: "bad" };
  if (d.kind === "today") return { text: t.due.today, tone: "warn" };
  if (d.kind === "tomorrow") return { text: t.due.tomorrow, tone: "warn" };
  if (d.kind === "in") return { text: t.due.in(d.days), tone: "" };
  return { text: t.due.none, tone: "" };
}

/**
 * The small line under the client's name. The prototype says whether the client opened the
 * invoice; there's no tracking link (see the report), so it says when it was sent instead.
 */
export function seenText(i: InvoiceItem, today: string, t: InvoicesCopy, locale: string): string {
  const day = (d: string | null) => fmtDay(d, locale, today);
  if (i.state === "draft") return t.seen.draft(day(i.createdOn));
  if (i.state === "paid") return i.lastPaymentOn ? t.seen.paid(day(i.lastPaymentOn)) : t.state.paid;
  if (i.state === "void") return i.voidedOn ? t.seen.void(day(i.voidedOn)) : t.seen.voidNoDate;
  if (i.state === "writeoff") return t.seen.writeoff;
  if (i.state === "refunded") return t.seen.refunded;
  if (i.sentOn) return t.seen.sent(day(i.sentOn));
  if (i.quoteNumber) return t.seen.fromQuote(i.quoteNumber);
  if (i.periodDate) return t.seen.recurring(day(i.periodDate));
  return t.seen.notSent;
}

/** One line of the history, with its dot color (payments green; void, write-off and refunds red). */
export function eventView(e: InvoiceEvent, t: InvoicesCopy, locale: string, today: string): { text: string; tone?: "good" | "bad" } {
  const d = e.detail;
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : Number(d[k] ?? 0));
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const method = (k: string) => {
    const m = str(k);
    return m === "cash" || m === "zelle" || m === "card" ? t.methodWords[m] : "";
  };
  const channel = (): "whatsapp" | "email" | "pdf" | "copy" | "share" => {
    const c = str("channel");
    return c === "whatsapp" || c === "email" || c === "pdf" || c === "copy" || c === "share" ? c : "copy";
  };
  switch (e.type) {
    case "created":
      if (str("quote")) return { text: t.events.createdFromQuote(str("quote")) };
      if (str("period")) return { text: t.events.createdRecurring(fmtDay(str("period"), locale, today)) };
      return { text: t.events.created };
    case "draft": return { text: t.events.draft };
    case "issued": return { text: t.events.issued };
    case "sent": return { text: t.events.sent[channel()] };
    case "reminder": return { text: t.events.reminder[channel()] };
    case "payment": return { text: t.events.payment(money(num("amount")), method("method")), tone: "good" };
    case "refund": return { text: t.events.refund(money(num("amount")), method("method")), tone: "bad" };
    case "void": return { text: num("refunded") > 0 ? t.events.voidRefunded(money(num("refunded"))) : t.events.void, tone: "bad" };
    case "writeoff": return { text: t.events.writeoff(money(num("amount"))), tone: "bad" };
    case "due": return { text: t.events.due(fmtDay(str("dueDate"), locale, today)) };
    default: return { text: "" };
  }
}

/** The number shown for an invoice: the sale's invoice number, or "Borrador". */
export const invoiceNumber = (i: Pick<InvoiceItem, "number">, t: InvoicesCopy): string => i.number ?? t.draftNumber;

/** First name for a friendly message ("Luis" from "Luis Mena"); empty for a company-looking name. */
export function firstName(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}

/** Plain text of an invoice for WhatsApp, a text message or an email. */
export function invoiceShareText(inv: InvoiceDetail, t: InvoicesCopy, company: CompanyInfo, zelle: string | null, locale: string): string {
  const s = t.share;
  const num = invoiceNumber(inv, t);
  const out = [s.header(num, company.name)];
  if (inv.customerName) out.push(s.to(inv.customerName));
  out.push("");
  for (const it of inv.items) out.push(s.line(it.description, it.quantity, money(it.lineCents)));
  out.push("");
  if (inv.discountCents > 0) {
    out.push(s.subtotal(money(inv.subtotalCents)));
    out.push(s.discount(money(inv.discountCents)));
  }
  out.push(s.total(money(inv.totalCents)));
  if (inv.netPaidCents > 0 && inv.balanceCents > 0) {
    out.push(s.paid(money(inv.netPaidCents)));
    out.push(s.balance(money(inv.balanceCents)));
  }
  if (inv.dueDate && (inv.state === "open" || inv.state === "late")) out.push(s.due(fmtDay(inv.dueDate, locale, inv.today)));
  if (inv.state === "open" || inv.state === "late" || inv.state === "draft") out.push("", zelle ? s.payZelle(zelle) : s.payPlain);
  if (inv.notes) out.push("", s.notes(inv.notes));
  if (company.name) out.push("", company.name, ...company.lines);
  return out.join("\n");
}

/** A friendly payment reminder. */
export function reminderText(inv: InvoiceDetail, t: InvoicesCopy, zelle: string | null, locale: string): string {
  const s = t.share;
  const num = invoiceNumber(inv, t);
  const amount = money(inv.balanceCents);
  const name = firstName(inv.customerName);
  const head = inv.dueDate
    ? s.remind(name, num, amount, fmtDay(inv.dueDate, locale, inv.today), inv.state === "late")
    : s.remindNoDue(name, num, amount);
  return [head, zelle ? s.payZelle(zelle) : s.payPlain, s.thanks].join(" ");
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

/** Refreshes Facturas, and the sales the rest of the app shows. */
export function useRefreshInvoices() {
  const utils = trpc.useUtils();
  return useCallback(() => {
    void utils.invoices.invalidate();
    void utils.quotes.invalidate();
    void utils.sales.invalidate();
    void utils.dashboard.invalidate();
  }, [utils]);
}

/** The company's Zelle (from Ajustes) when it looks usable. */
export function zelleOf(settings: { zelleEmail?: string | null } | null | undefined): string | null {
  const z = settings?.zelleEmail?.trim();
  return z ? z : null;
}
