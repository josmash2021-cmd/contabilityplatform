import { desc, eq } from "drizzle-orm";
import { subscriptionPayments } from "@db/schema";
import { getDb } from "../queries/connection";
import { tierFromAmountCents, type AccountMode, type Plan, type Tier } from "./plans";

/**
 * Which plan (tier) the user's latest payment was for. Null when there is none or it
 * matches no plan. Tiers aren't stored: the amount Stripe charged tells them apart.
 */
export async function lastPaidTier(db: ReturnType<typeof getDb>, userId: number, mode: AccountMode): Promise<Tier | null> {
  const last = await db.select().from(subscriptionPayments)
    .where(eq(subscriptionPayments.userId, userId))
    .orderBy(desc(subscriptionPayments.paidAt))
    .limit(1);
  const p = last[0];
  if (!p || p.status !== "succeeded") return null;
  return tierFromAmountCents(Math.round(Number(p.amount) * 100), p.plan as Plan, mode);
}
