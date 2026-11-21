// ── Facturas: pure rules (states, due dates, reminders, payments, share links) ──
// An invoice is a bill to a client: a pending sale is an unpaid invoice, a completed one is
// paid. Money is added up in whole cents; dates are "YYYY-MM-DD" strings compared as text.
// No database or server imports: the page (src/pages/Invoices.tsx) uses this file too.
import { addDays, type PaymentMethod } from "./quotes";

export type SaleStatus = "completed" | "pending" | "cancelled" | "refunded";

/**
 * draft: saved, not issued (no sale yet) · open: waiting to be paid, not past due ·
 * late: past its due date · paid · refunded: paid and all of it returned ·
 * void: cancelled · writeoff: the rest won't be collected ("No se cobró").
 */
export const INVOICE_STATES = ["draft", "open", "late", "paid", "refunded", "void", "writeoff"] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];

/** The list's tabs (void, refunded and written-off invoices only show under "all"). */
export const INVOICE_FILTERS = ["all", "draft", "open", "late", "paid"] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

/** Payment terms offered when creating an invoice (days after it's issued). */
export const TERMS_OPTIONS = [0, 7, 14, 15, 30] as const;
export const DEFAULT_TERMS = 14;
export const MAX_TERMS = 365;

/** Ways an invoice or a reminder is handed to the client (all done by the user's own apps). */
export const SEND_CHANNELS = ["whatsapp", "email", "pdf", "copy", "share"] as const;
export type SendChannel = (typeof SEND_CHANNELS)[number];

export function invoiceState(x: {
  saleStatus: SaleStatus | null;
  voided: boolean;
  writtenOff: boolean;
  dueDate: string | null;
  today: string;
}): InvoiceState {
  if (x.saleStatus === null) return x.voided ? "void" : "draft";
  if (x.saleStatus === "cancelled") return x.writtenOff ? "writeoff" : "void";
  if (x.saleStatus === "refunded") return "refunded";
  if (x.saleStatus === "completed") return x.writtenOff ? "writeoff" : "paid";
  return x.dueDate !== null && x.dueDate < x.today ? "late" : "open";
}

/** Still owed by the client: counts in "Te deben". */
export function isOwed(state: InvoiceState): boolean {
  return state === "open" || state === "late";
}

export function matchesFilter(state: InvoiceState, filter: InvoiceFilter): boolean {
  if (filter === "all") return true;
  return state === filter;
}

// ── Dates ──

function utcDay(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

export function dueDateFor(issueDate: string, termsDays: number): string {
  return addDays(issueDate, Math.max(0, Math.min(MAX_TERMS, Math.round(termsDays))));
}

export type DueInfo =
  | { kind: "none" }
  | { kind: "overdue"; days: number }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "in"; days: number };

/** How far the due date is from today, for "Vence en 6 días" / "Vencida hace 5 días". */
export function dueInfo(dueDate: string | null, today: string): DueInfo {
  if (!dueDate) return { kind: "none" };
  const d = daysBetween(today, dueDate);
  if (d < 0) return { kind: "overdue", days: -d };
  if (d === 0) return { kind: "today" };
  if (d === 1) return { kind: "tomorrow" };
  return { kind: "in", days: d };
}

/** First day of the month `today` falls in. */
export function monthStartOf(today: string): string {
  return `${today.slice(0, 8)}01`;
}

// ── Reminders ──

export type ReminderSettings = { before: boolean; onDue: boolean; after: boolean; weekly: boolean };
export const DEFAULT_REMINDERS: ReminderSettings = { before: true, onDue: true, after: true, weekly: false };
export const REMIND_BEFORE_DAYS = 3;
export const REMIND_AFTER_DAYS = 3;
export type ReminderKind = keyof ReminderSettings;
export type Reminder = { date: string; kind: ReminderKind };

/** Weekly reminders while overdue: 7, 14, 21… days after the due date. */
const WEEK = 7;

/** Every reminder of an invoice due on `dueDate` up to `until` (inclusive), oldest first. */
export function reminderDates(dueDate: string, s: ReminderSettings, until: string): Reminder[] {
  const out: Reminder[] = [];
  if (s.before) out.push({ date: addDays(dueDate, -REMIND_BEFORE_DAYS), kind: "before" });
  if (s.onDue) out.push({ date: dueDate, kind: "onDue" });
  if (s.after) out.push({ date: addDays(dueDate, REMIND_AFTER_DAYS), kind: "after" });
  if (s.weekly) {
    for (let k = 1; k <= 520; k++) {
      const date = addDays(dueDate, WEEK * k);
      if (date > until) break;
      out.push({ date, kind: "weekly" });
    }
  }
  const seen = new Set<string>();
  return out
    .filter((r) => r.date <= until)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .filter((r) => (seen.has(r.date) ? false : (seen.add(r.date), true)));
}

/** The next reminder on or after `today`; null when the settings leave none. */
export function nextReminder(dueDate: string, s: ReminderSettings, today: string): Reminder | null {
  const fixed: Reminder[] = [];
  if (s.before) fixed.push({ date: addDays(dueDate, -REMIND_BEFORE_DAYS), kind: "before" });
  if (s.onDue) fixed.push({ date: dueDate, kind: "onDue" });
  if (s.after) fixed.push({ date: addDays(dueDate, REMIND_AFTER_DAYS), kind: "after" });
  if (s.weekly) {
    const late = daysBetween(dueDate, today);
    const k = Math.max(1, Math.ceil(late / WEEK));
    fixed.push({ date: addDays(dueDate, WEEK * k), kind: "weekly" });
  }
  const upcoming = fixed.filter((r) => r.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return upcoming[0] ?? null;
}

/**
 * The reminder that has come up and hasn't been sent since: the latest one on or before
 * today, unless a reminder was already sent on or after its date. Null: nothing to send.
 */
export function reminderToSend(dueDate: string, s: ReminderSettings, today: string, lastSentOn: string | null): Reminder | null {
  const past = reminderDates(dueDate, s, today);
  const latest = past[past.length - 1];
  if (!latest) return null;
  if (lastSentOn !== null && lastSentOn >= latest.date) return null;
  return latest;
}

// ── Money (whole cents) ──

export type PaymentCheck = "ok" | "zero" | "tooMuch";

/** A payment must be more than $0 and no more than what's still owed. */
export function checkPayment(amountCents: number, balanceCents: number): PaymentCheck {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return "zero";
  return amountCents > balanceCents ? "tooMuch" : "ok";
}

/** A refund must be more than $0 and no more than what the client has paid (net of earlier refunds). */
export function checkRefund(amountCents: number, netPaidCents: number): PaymentCheck {
  return checkPayment(amountCents, netPaidCents);
}

export type MoneyMove = { kind: "payment" | "refund"; method: PaymentMethod; cents: number };

/** What the client has paid, net of refunds, per method. */
export function netByMethod(moves: readonly MoneyMove[]): Record<PaymentMethod, number> {
  const out: Record<PaymentMethod, number> = { cash: 0, zelle: 0, card: 0 };
  for (const m of moves) out[m.method] += m.kind === "payment" ? m.cents : -m.cents;
  return out;
}

export function netPaidCents(moves: readonly MoneyMove[]): number {
  const by = netByMethod(moves);
  return Math.max(0, by.cash + by.zelle + by.card);
}

export function balanceCents(totalCents: number, moves: readonly MoneyMove[]): number {
  return Math.max(0, totalCents - netPaidCents(moves));
}

/** The method a fully paid sale keeps: the one used, or "mixed" when there were several. */
export function saleMethodFor(methods: readonly PaymentMethod[]): PaymentMethod | "mixed" {
  const unique = [...new Set(methods)];
  if (unique.length === 0) return "cash";
  return unique.length === 1 ? unique[0] : "mixed";
}

/**
 * Splits giving back `amountCents` across the methods the client paid with, so each account
 * returns no more than it received (largest first). Used when voiding a paid invoice.
 */
export function reversalByMethod(net: Record<PaymentMethod, number>, amountCents: number): Array<{ method: PaymentMethod; cents: number }> {
  const order = (Object.keys(net) as PaymentMethod[]).filter((m) => net[m] > 0).sort((a, b) => net[b] - net[a]);
  const out: Array<{ method: PaymentMethod; cents: number }> = [];
  let left = amountCents;
  for (const method of order) {
    if (left <= 0) break;
    const cents = Math.min(left, net[method]);
    out.push({ method, cents });
    left -= cents;
  }
  return out;
}

// ── Sending (the user's own WhatsApp and email apps: the app has no email service) ──

/** Digits for a WhatsApp link: a 10-digit US number gets the country code 1. Null when it isn't a phone number. */
export function whatsappPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** Opens WhatsApp with the text ready; without a number the user picks the chat. */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const to = whatsappPhone(phone);
  return `https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`;
}

/** A plausible email address (for the "to" of a mailto link). */
export function isEmail(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(value.trim());
}

/** Opens the user's email app with the subject and text ready. */
export function mailtoUrl(email: string | null | undefined, subject: string, body: string): string {
  const to = isEmail(email) ? email.trim() : "";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
