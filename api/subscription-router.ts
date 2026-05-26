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
  monthly: { amount: 100, name: "AI AETHEL - Mensual" },
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
    const userId = ctx.user.id;

    // Step 1: Check DB
    let subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    // Step 2: If no subscription in DB, search Stripe
    if (subs.length === 0) {
      try {
        const stripe = getStripe();
        const customers = await stripe.customers.search({
          query: `metadata['platformUserId']:'${userId}'`,
        });
        if (customers.data.length > 0) {
          const customer = customers.data[0];
          const stripeSubs = await stripe.subscriptions.list({
            customer: customer.id, status: "all", limit: 1,
          });
          if (stripeSubs.data.length > 0) {
            const stripeSub = stripeSubs.data[0] as any;
            const plan = stripeSub.items?.data?.[0]?.price?.unit_amount === 100 ? "monthly" :
                         stripeSub.items?.data?.[0]?.price?.unit_amount === 80000 ? "annual" : "monthly";
            // Insert into DB
            await db.insert(subscriptions).values({
              userId,
              stripeCustomerId: customer.id,
              stripeSubscriptionId: stripeSub.id,
              plan: plan as "monthly" | "annual",
              status: stripeSub.status,
              currentPeriodStart: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : new Date(),
              currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : new Date(),
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
            });
            // Re-fetch
            subs = await db.select().from(subscriptions)
              .where(eq(subscriptions.userId, userId))
              .orderBy(desc(subscriptions.createdAt))
              .limit(1);
          }
        }
      } catch (err: any) {
        console.error("[status] Stripe search error:", err.message);
      }
    }

    const sub = subs[0];
    if (!sub) return { active: false, plan: null, status: "no_subscription", currentPeriodEnd: null };

    // Step 3: Verify with Stripe
    if (sub.stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;
        const isActive = stripeSub.status === "active" || stripeSub.status === "trialing";
        const plan = stripeSub.items?.data?.[0]?.price?.unit_amount === 100 ? "monthly" :
                     stripeSub.items?.data?.[0]?.price?.unit_amount === 80000 ? "annual" : sub.plan;

        // Update DB
        await db.update(subscriptions).set({
          status: stripeSub.status,
          plan: plan as "monthly" | "annual",
          currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : sub.currentPeriodEnd,
          currentPeriodStart: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : sub.currentPeriodStart,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          updatedAt: new Date(),
        }).where(eq(subscriptions.id, sub.id));

        return {
          active: isActive,
          plan: plan,
          status: stripeSub.status,
          currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000).toISOString() : null,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        };
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

  // ── Verify subscription with Stripe (called on return from checkout) ──
  verify: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { active: false, plan: null };
    const db = getDb();
    const userId = ctx.user.id;

    // Step 1: Check DB first
    const subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    let sub = subs[0];

    const stripe = getStripe();

    // Step 2: If no subscription in DB, search Stripe by customer
    if (!sub) {
      try {
        // Search for customer by user ID in metadata
        const customers = await stripe.customers.search({
          query: `metadata['platformUserId']:'${userId}'`,
        });
        if (customers.data.length === 0) return { active: false, plan: null };

        const customer = customers.data[0];

        // List subscriptions for this customer
        const stripeSubs = await stripe.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 1,
        });
        if (stripeSubs.data.length === 0) return { active: false, plan: null };

        const stripeSub = stripeSubs.data[0] as any;
        const plan = stripeSub.items?.data?.[0]?.price?.unit_amount === 100 ? "monthly" :
                     stripeSub.items?.data?.[0]?.price?.unit_amount === 80000 ? "annual" : "monthly";

        // Create subscription in DB
        await db.insert(subscriptions).values({
          userId,
          stripeCustomerId: customer.id,
          stripeSubscriptionId: stripeSub.id,
          plan: plan as "monthly" | "annual",
          status: stripeSub.status,
          currentPeriodStart: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : new Date(),
          currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : new Date(),
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
        });

        // Re-fetch
        const newSubs = await db.select().from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1);
        sub = newSubs[0];
      } catch (err: any) {
        console.error("[verify] Search Stripe error:", err.message);
        return { active: false, plan: null };
      }
    }

    // Step 3: Verify with Stripe using subscription ID
    try {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;

      const isActive = stripeSub.status === "active" || stripeSub.status === "trialing";
      const plan = stripeSub.items?.data?.[0]?.price?.unit_amount === 100 ? "monthly" :
                   stripeSub.items?.data?.[0]?.price?.unit_amount === 80000 ? "annual" : sub.plan;

      // Update DB with fresh data
      await db.update(subscriptions).set({
        status: stripeSub.status,
        plan: plan as "monthly" | "annual",
        currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : sub.currentPeriodEnd,
        currentPeriodStart: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : sub.currentPeriodStart,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));

      return {
        active: isActive,
        plan: plan,
        status: stripeSub.status,
        currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000).toISOString() : null,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      };
    } catch (err: any) {
      console.error("[verify] Stripe retrieve error:", err.message);
      // Return DB state as fallback
      const isActive = sub.status === "active" || sub.status === "trialing";
      return {
        active: isActive,
        plan: sub.plan,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      };
    }
  }),

  // ── Upgrade subscription (monthly → annual) ──
  upgrade: authedQuery
    .input(z.object({ from: z.enum(["monthly"]), to: z.enum(["annual"]) }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const db = getDb();

      // Get current subscription
      const subs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, ctx.user.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      const sub = subs[0];
      if (!sub) throw new Error("No tienes una suscripcion activa");
      if (sub.plan !== "monthly") throw new Error("Solo puedes hacer upgrade desde el plan mensual");

      // Get Stripe subscription
      if (!sub.stripeSubscriptionId) throw new Error("No se encontro la suscripcion en Stripe");

      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;
      if (stripeSub.status !== "active" && stripeSub.status !== "trialing") {
        throw new Error("Tu suscripcion mensual no esta activa");
      }

      // Get annual price ID
      const annualPriceId = await getOrCreatePrice(stripe, "annual");

      // Update subscription: change from monthly to annual with proration
      // This creates a proration invoice automatically — Stripe charges the difference
      const updatedSub = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{
          id: stripeSub.items.data[0].id,
          price: annualPriceId,
        }],
        proration_behavior: "create_prorations",
        billing_cycle_anchor: "now",
      });

      // Update DB
      await db.update(subscriptions).set({
        plan: "annual",
        status: updatedSub.status,
        currentPeriodEnd: updatedSub.current_period_end ? new Date(updatedSub.current_period_end * 1000) : null,
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));

      return {
        success: true,
        plan: "annual",
        message: "Upgrade completado. Se te cobro la diferencia prorrateada.",
      };
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
