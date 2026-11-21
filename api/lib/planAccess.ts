import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { subscriptionPayments, subscriptions } from "@db/schema";
import { planHas, topTier, type Feature, type PlanTier } from "@contracts/planFeatures";
import { getDb } from "../queries/connection";
import { accountMode, defaultTier, tierFromAmountCents, type AccountMode, type Plan, type Tier } from "./plans";
import { getTrialInfo } from "./trial";
import { msg, type Lang } from "./i18n";

type Db = ReturnType<typeof getDb>;
export type PlanUser = { id: number | string; role?: string | null; modePreference?: string | null; createdAt?: Date | string | null };

/**
 * Which plan (tier) the user's latest payment was for. Null when there is none or it
 * matches no plan. Tiers aren't stored: the amount Stripe charged tells them apart.
 */
export async function lastPaidTier(db: Db, userId: number, mode: AccountMode): Promise<Tier | null> {
  const last = await db.select().from(subscriptionPayments)
    .where(eq(subscriptionPayments.userId, userId))
    .orderBy(desc(subscriptionPayments.paidAt))
    .limit(1);
  const p = last[0];
  if (!p || p.status !== "succeeded") return null;
  return tierFromAmountCents(Math.round(Number(p.amount) * 100), p.plan as Plan, mode);
}

/** True while the user's latest subscription is paid up. */
export async function hasActiveSubscription(db: Db, userId: number): Promise<boolean> {
  const sub = (await db.select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd }).from(subscriptions)
    .where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(1))[0];
  return !!sub && (sub.status === "active" || sub.status === "trialing") && (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date());
}

export type PlanContext = {
  mode: AccountMode;
  /** The plan whose features apply now. Null: a business account with no access (trial over, nothing paid). */
  tier: PlanTier | null;
  trial: boolean;
  admin: boolean;
};

/**
 * The plan that applies to this user right now:
 * - admins and the free trial get everything (the top plan of their mode);
 * - a paid-up subscription gets the plan it paid for (older payments count as Pro);
 * - otherwise personal accounts keep the free Básico, and business accounts get nothing.
 */
export async function getPlanContext(db: Db, user: PlanUser): Promise<PlanContext> {
  const mode = accountMode(user.modePreference);
  const admin = user.role === "admin";
  if (admin) return { mode, tier: topTier(mode), trial: false, admin };
  if (getTrialInfo(user.createdAt)?.active) return { mode, tier: topTier(mode), trial: true, admin };
  const userId = Number(user.id);
  if (await hasActiveSubscription(db, userId)) {
    return { mode, tier: (await lastPaidTier(db, userId, mode)) ?? defaultTier(), trial: false, admin };
  }
  return { mode, tier: mode === "personal" ? "basic" : null, trial: false, admin };
}

export function contextHas(ctx: PlanContext, feature: Feature): boolean {
  return ctx.admin || (ctx.tier !== null && planHas(ctx.mode, ctx.tier, feature));
}

/** Throws FORBIDDEN (with a message saying which plans include it) when the user's plan lacks the feature. */
export async function requireFeature(db: Db, user: PlanUser, feature: Feature, lang: Lang): Promise<PlanContext> {
  const ctx = await getPlanContext(db, user);
  if (!contextHas(ctx, feature)) throw new TRPCError({ code: "FORBIDDEN", message: msg(lang, "planMissingFeature") });
  return ctx;
}
