// Stripe subscription statuses use American spelling ("canceled") and include
// values not present in our DB enum (incomplete, incomplete_expired, paused).
// Our subscriptions.status enum is ["active","cancelled","past_due","unpaid","trialing"].
// Persisting a raw Stripe status triggers MySQL "Data truncated for column 'status'"
// errors (and the write fails), so ALWAYS normalize before writing to the DB.
export type SubStatus = "active" | "cancelled" | "past_due" | "unpaid" | "trialing";

export function normalizeSubStatus(s: string | null | undefined): SubStatus {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "past_due";
    default:
      return "cancelled";
  }
}
