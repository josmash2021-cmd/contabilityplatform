// ── Stripe billing periods and invoice links, for old and new API versions ──
// Since Stripe API 2025-03-31 ("basil"), a subscription's current period lives on
// each subscription item (items.data[].current_period_start/end) instead of on the
// subscription, and an invoice points to its subscription through
// parent.subscription_details.subscription instead of invoice.subscription.
// This app calls Stripe with a newer version ("dahlia"), while webhook payloads
// use whatever version the endpoint is set to, so we accept both shapes.

type Ts = number | null | undefined;

type PeriodItem = { current_period_start?: Ts; current_period_end?: Ts };

export type SubscriptionLike = {
  items?: { data?: PeriodItem[] | null } | null;
  /** Old API versions only. */
  current_period_start?: Ts;
  /** Old API versions only. */
  current_period_end?: Ts;
};

type IdOrObject = string | { id?: string | null } | null | undefined;

export type InvoiceLike = {
  /** Old API versions only. */
  subscription?: IdOrObject;
  parent?: { subscription_details?: { subscription?: IdOrObject } | null } | null;
  lines?: { data?: Array<{ period?: { start?: Ts; end?: Ts } | null } | null> | null } | null;
};

export type Period = { start: Date | null; end: Date | null };

const valid = (n: Ts): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const toDate = (n: number | null) => (n === null ? null : new Date(n * 1000));

/** Current billing period of a subscription. Null parts mean Stripe didn't send them. */
export function subscriptionPeriod(sub: SubscriptionLike | null | undefined): Period {
  if (!sub) return { start: null, end: null };
  const items = sub.items?.data ?? [];
  const starts = items.map((i) => i?.current_period_start).filter(valid);
  const ends = items.map((i) => i?.current_period_end).filter(valid);
  const start = starts.length ? Math.min(...starts) : valid(sub.current_period_start) ? sub.current_period_start : null;
  const end = ends.length ? Math.max(...ends) : valid(sub.current_period_end) ? sub.current_period_end : null;
  return { start: toDate(start), end: toDate(end) };
}

function idOf(x: IdOrObject): string | null {
  if (!x) return null;
  if (typeof x === "string") return x;
  return typeof x.id === "string" && x.id ? x.id : null;
}

/** The subscription an invoice belongs to, or null for one-off invoices. */
export function invoiceSubscriptionId(invoice: InvoiceLike | null | undefined): string | null {
  if (!invoice) return null;
  return idOf(invoice.parent?.subscription_details?.subscription) ?? idOf(invoice.subscription);
}

/**
 * The period an invoice pays for, taken from its line items. (invoice.period_start/end
 * is the usage window before the invoice, which for a renewal is the period that just
 * ended, so it must not be stored as the new period.)
 */
export function invoicePeriod(invoice: InvoiceLike | null | undefined): Period {
  const lines = invoice?.lines?.data ?? [];
  const starts = lines.map((l) => l?.period?.start).filter(valid);
  const ends = lines.map((l) => l?.period?.end).filter(valid);
  return { start: toDate(starts.length ? Math.min(...starts) : null), end: toDate(ends.length ? Math.max(...ends) : null) };
}
