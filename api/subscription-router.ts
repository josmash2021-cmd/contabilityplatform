import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { subscriptions, subscriptionPayments } from "@db/schema";
import { eq, desc } from "drizzle-orm";
import Stripe from "stripe";

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

function getAppUrl() {
  return process.env.APP_URL || "https://aethelaccountingplatform.com";
}

const PLAN_PRICES = {
  monthly: { amount: 8000, name: "AI AETHEL - Mensual" },
  annual: { amount: 80000, name: "AI AETHEL - Anual" },
};

const STRIPE_MONTHLY_LOOKUP = "contability_monthly_80";
const STRIPE_ANNUAL_LOOKUP = "contability_annual_800";

// Cache price IDs in memory to avoid repeated Stripe API calls
let _monthlyPriceId: string | null = null;
let _annualPriceId: string | null = null;

async function getOrCreatePrice(stripe: any, plan: "monthly" | "annual"): Promise<string> {
  const cached = plan === "monthly" ? _monthlyPriceId : _annualPriceId;
  if (cached) return cached;

  const lookupKey = plan === "monthly" ? STRIPE_MONTHLY_LOOKUP : STRIPE_ANNUAL_LOOKUP;
  const amount = plan === "monthly" ? PLAN_PRICES.monthly.amount : PLAN_PRICES.annual.amount;
  const interval = plan === "monthly" ? "month" : "year";
  const productName = plan === "monthly" ? "AI AETHEL - Mensual" : "AI AETHEL - Anual";
  const productDesc = plan === "monthly"
    ? "Acceso completo a Accounting Platform - Facturado mensualmente"
    : "Acceso completo a Accounting Platform - Facturado anualmente";

  // Try to find existing price by lookup_key via list
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data.length > 0) {
    const priceId = existing.data[0].id;
    if (plan === "monthly") _monthlyPriceId = priceId;
    else _annualPriceId = priceId;
    return priceId;
  }

  // Create product and price
  const product = await stripe.products.create({
    name: productName,
    description: productDesc,
  });

  const price = await stripe.prices.create({
    unit_amount: amount,
    currency: "usd",
    recurring: { interval },
    product: product.id,
  });

  // Store the lookup key separately (Stripe doesn't accept it in create)
  // We'll just cache the ID
  if (plan === "monthly") _monthlyPriceId = price.id;
  else _annualPriceId = price.id;

  return price.id;
}

export const subscriptionRouter = createRouter({
  // ── Get subscription status ──
  status: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { active: false, plan: null, status: "no_user", currentPeriodEnd: null };
    const db = getDb();

    const subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    const sub = subs[0];
    if (!sub) return { active: false, plan: null, status: "no_subscription", currentPeriodEnd: null };

    // Check if Stripe subscription is still valid (monthly or annual)
    if (sub.stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;
        if (stripeSub.status === "active" || stripeSub.status === "trialing") {
          return {
            active: true,
            plan: sub.plan,
            status: stripeSub.status,
            currentPeriodEnd: stripeSub.current_period_end
              ? new Date(stripeSub.current_period_end * 1000).toISOString()
              : sub.currentPeriodEnd?.toISOString() || null,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          };
        }
      } catch {
        // Stripe check failed, fallback to DB
      }
    }

    const isActive = sub.status === "active" || sub.status === "trialing";
    return {
      active: isActive,
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }),

  // ── Create checkout session ──
  createCheckoutSession: authedQuery
    .input(z.object({ plan: z.enum(["monthly", "annual"]) }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const priceId = await getOrCreatePrice(stripe, input.plan);
      if (!priceId) throw new Error("No se pudo crear el plan de precios");

      // Create or get Stripe customer
      const db = getDb();
      let stripeCustomerId: string | undefined;
      const existing = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, ctx.user.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (existing[0]?.stripeCustomerId) {
        stripeCustomerId = existing[0].stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: ctx.user.email || undefined,
          name: ctx.user.name || undefined,
          metadata: { platformUserId: String(ctx.user.id) },
        });
        stripeCustomerId = customer.id;
      }

      const appUrl = getAppUrl();

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/settings?subscription=success&plan=${input.plan}`,
        cancel_url: `${appUrl}/settings?subscription=cancelled`,
        subscription_data: {
          metadata: { platformUserId: String(ctx.user.id) },
        },
        metadata: { platformUserId: String(ctx.user.id), plan: input.plan },
      });
      return { url: session.url!, sessionId: session.id };
    }),

  // ── Get payment history ──
  payments: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return [];
    const db = getDb();
    return db.select().from(subscriptionPayments)
      .where(eq(subscriptionPayments.userId, ctx.user.id))
      .orderBy(desc(subscriptionPayments.paidAt))
      .limit(50);
  }),

  // ── Cancel subscription ──
  cancel: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    const sub = subs[0];
    if (!sub) throw new Error("No tienes una suscripcion activa");

    if (sub.stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } catch {
        // Already cancelled or not found
      }
    }

    await db.update(subscriptions).set({
      status: "cancelled",
      cancelAtPeriodEnd: true,
    }).where(eq(subscriptions.id, sub.id));

    return { success: true };
  }),

  // ── Create Stripe Customer Portal session ──
  createPortalSession: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    const sub = subs[0];
    if (!sub?.stripeCustomerId) {
      throw new Error("No tienes un metodo de pago registrado");
    }

    const stripe = getStripe();
    const appUrl = getAppUrl();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });

    return { url: portalSession.url };
  }),
});
