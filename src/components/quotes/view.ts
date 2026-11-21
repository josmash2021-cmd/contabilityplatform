// How a quote shows in the list and its dialog (status word, color, validity line).
import type { QuoteView, QuotesCopy } from "@/i18n/copy/quotes";
import type { Tone } from "@/components/invoices/proto";
import { fmtDay } from "@/components/invoices/shared";
import { daysBetween } from "../../../api/lib/invoices";
import { quoteExpired, type QuoteStatus } from "../../../api/lib/quotes";

type QuoteLike = { status: QuoteStatus; validUntil: string | null; invoiceNumber: string | null };

/** Its status, or "expired" when the date passed while still waiting for an answer. */
export function quoteView(q: QuoteLike, today: string): QuoteView {
  return quoteExpired(q.validUntil, q.status, today) ? "expired" : q.status;
}

const TONE: Record<QuoteView, Tone> = {
  draft: "muted", sent: "open", accepted: "good", rejected: "muted", converted: "muted", expired: "bad",
};

export const quoteTone = (v: QuoteView): Tone => TONE[v];

/** The "Validez" column, as the prototype's quoteValid(). */
export function validityView(q: QuoteLike, today: string, t: QuotesCopy): { text: string; tone: "bad" | "warn" | "" } {
  if (q.status === "converted") return { text: q.invoiceNumber ? t.validity.invoice(q.invoiceNumber) : t.state.converted, tone: "" };
  if (q.status === "accepted") return { text: t.validity.accepted, tone: "" };
  if (q.status === "rejected") return { text: t.validity.rejected, tone: "" };
  if (!q.validUntil) return { text: q.status === "draft" ? t.validity.notSent : t.validity.none, tone: "" };
  const left = daysBetween(today, q.validUntil);
  if (left < 0) return { text: t.validity.expired(-left), tone: "bad" };
  if (left === 0) return { text: t.validity.today, tone: "warn" };
  return { text: t.validity.left(left), tone: left <= 3 ? "warn" : "" };
}

/** "Válida hasta: 3 dic" style meta for the document. */
export function quoteDocMeta(q: { createdAt: Date | string; validUntil: string | null }, t: QuotesCopy, locale: string, today: string): string[] {
  const out = [t.detail.doc.date(fmtDay(createdDayOf(q.createdAt) || today, locale, today))];
  if (q.validUntil) out.push(t.detail.doc.validUntil(fmtDay(q.validUntil, locale, today)));
  return out;
}

/** The day a quote was created, for "COT-0007 · del 18 nov". */
export function createdDayOf(createdAt: Date | string): string {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
