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
    const userId = Number(ctx.user.id); // Ensure numeric to match webhook

    // Step 1: Check DB
    let subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    // Step 2: If no subscription in DB, search Stripe aggressively
    if (subs.length === 0) {
      try {
        const stripe = getStripe();
        let foundCustomer: any = null;

        // Method 1: Search by metadata userId
        try {
          const byMeta = await stripe.customers.search({
            query: `metadata['platformUserId']:'${userId}'`,
          });
          if (byMeta.data.length > 0) foundCustomer = byMeta.data[0];
        } catch { /* search not available */ }

        // Method 2: Search by email
        if (!foundCustomer && ctx.user.email) {
          try {
            const byEmail = await stripe.customers.search({
              query: `email:'${ctx.user.email}'`,
            });
            if (byEmail.data.length > 0) foundCustomer = byEmail.data[0];
          } catch { /* ignore */ }
        }

        // Method 3: List all and filter
        if (!foundCustomer) {
          const allCusts = await stripe.customers.list({ limit: 100 });
          foundCustomer = allCusts.data.find((c: any) =>
            c.metadata?.platformUserId === String(userId) || c.email === ctx.user?.email
          );
        }

        if (foundCustomer) {
          const stripeSubsList = await stripe.subscriptions.list({
            customer: foundCustomer.id, status: "all", limit: 5,
          });
          const stripeSub = stripeSubsList.data.find((s: any) =>
            s.status === "active" || s.status === "trialing"
          ) || stripeSubsList.data[0];

          if (stripeSub) {
            const priceId = stripeSub.items?.data?.[0]?.price?.id;
            let plan = "monthly";
            if (priceId) {
              try {
                const priceData = await stripe.prices.retrieve(priceId);
                plan = priceData.unit_amount === 80000 ? "annual" : "monthly";
              } catch { /* default monthly */ }
            }
            // Insert into DB
            await db.insert(subscriptions).values({
              userId,
              stripeCustomerId: foundCustomer.id,
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

  // ── Force sync: find subscription in Stripe by user email and sync to DB ──
  forceSync: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) return { found: false, message: "No autenticado" };
    const db = getDb();
    const stripe = getStripe();
    const userId = Number(ctx.user.id); // Ensure numeric to match webhook
    const userEmail = ctx.user.email;

    try {
      // Search for customer by userId in metadata
      const allCustomers = await stripe.customers.list({ limit: 100 });
      let customer = allCustomers.data.find((c: any) =>
        c.metadata?.platformUserId === String(userId)
      );

      // Fallback: search by email
      if (!customer && userEmail) {
        customer = allCustomers.data.find((c: any) => c.email === userEmail);
      }

      if (!customer) return { found: false, message: "No se encontro cliente en Stripe" };

      // List subscriptions
      const stripeSubsList = await stripe.subscriptions.list({
        customer: customer.id, status: "all", limit: 10,
      });

      if (stripeSubsList.data.length === 0) {
        return { found: false, message: "No se encontraron suscripciones en Stripe" };
      }

      // Find active/trialing subscription
      const activeSub = stripeSubsList.data.find((s: any) =>
        s.status === "active" || s.status === "trialing"
      );

      if (!activeSub) {
        return { found: false, message: "No hay suscripcion activa en Stripe" };
      }

      // Determine plan
      const priceId = activeSub.items?.data?.[0]?.price?.id;
      let plan = "monthly";
      if (priceId) {
        try {
          const priceData = await stripe.prices.retrieve(priceId);
          plan = priceData.unit_amount === 80000 ? "annual" : "monthly";
        } catch { /* default monthly */ }
      }

      // Upsert into DB
      const existing = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId)).limit(1);

      if (existing.length > 0) {
        await db.update(subscriptions).set({
          stripeCustomerId: customer.id,
          stripeSubscriptionId: activeSub.id,
          plan: plan as "monthly" | "annual",
          status: activeSub.status,
          currentPeriodStart: activeSub.current_period_start ? new Date(activeSub.current_period_start * 1000) : new Date(),
          currentPeriodEnd: activeSub.current_period_end ? new Date(activeSub.current_period_end * 1000) : new Date(),
          cancelAtPeriodEnd: activeSub.cancel_at_period_end || false,
          updatedAt: new Date(),
        }).where(eq(subscriptions.id, existing[0].id));
      } else {
        await db.insert(subscriptions).values({
          userId,
          stripeCustomerId: customer.id,
          stripeSubscriptionId: activeSub.id,
          plan: plan as "monthly" | "annual",
          status: activeSub.status,
          currentPeriodStart: activeSub.current_period_start ? new Date(activeSub.current_period_start * 1000) : new Date(),
          currentPeriodEnd: activeSub.current_period_end ? new Date(activeSub.current_period_end * 1000) : new Date(),
          cancelAtPeriodEnd: activeSub.cancel_at_period_end || false,
        });
      }

      return {
        found: true,
        plan,
        status: activeSub.status,
        message: `Suscripcion ${plan} sincronizada correctamente`,
      };
    } catch (err: any) {
      console.error("[forceSync] Error:", err.message);
      return { found: false, message: err.message || "Error al sincronizar" };
    }
  }),

  // ── Restore monthly subscription after failed upgrade ──
  restoreMonthly: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const stripe = getStripe();
    const userId = Number(ctx.user.id);

    try {
      // Get current subscription
      const subs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      const sub = subs[0];
      if (!sub?.stripeSubscriptionId) return { success: false, error: "No hay suscripcion" };

      // Get Stripe subscription
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;

      // Only allow restore if subscription is past_due or incomplete
      if (stripeSub.status !== "past_due" && stripeSub.status !== "incomplete") {
        return { success: false, error: "Tu suscripcion no necesita ser restaurada" };
      }

      // Get monthly price ID
      const monthlyPriceId = await getOrCreatePrice(stripe, "monthly");

      // Revert to monthly plan in Stripe
      const updatedSub = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{
          id: stripeSub.items.data[0].id,
          price: monthlyPriceId,
        }],
        proration_behavior: "none",
      });

      // Update DB
      await db.update(subscriptions).set({
        plan: "monthly",
        status: updatedSub.status,
        currentPeriodEnd: updatedSub.current_period_end ? new Date(updatedSub.current_period_end * 1000) : null,
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));

      return {
        success: true,
        message: "Tu suscripcion mensual ha sido restaurada.",
      };
    } catch (err: any) {
      console.error("[restoreMonthly] Error:", err.message);
      return { success: false, error: err.message || "Error al restaurar" };
    }
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
      const userId = Number(ctx.user.id);
      const existing = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId))
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
    const userId = Number(ctx.user.id);
    return db.select().from(subscriptionPayments)
      .where(eq(subscriptionPayments.userId, userId))
      .orderBy(desc(subscriptionPayments.paidAt))
      .limit(50);
  }),

  // ── Cancel subscription ──
  cancel: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const userId = Number(ctx.user.id);
    const subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
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

  // ── Verify subscription — Agent finds lost subscriptions ──
  verify: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { active: false, plan: null };
    const db = getDb();
    const userId = Number(ctx.user.id); // Ensure numeric to match webhook
    const stripe = getStripe();

    // Step 1: Check DB first
    const subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    let sub = subs[0];

    // Step 2: If no subscription in DB, search Stripe aggressively
    if (!sub) {
      try {
        let foundCustomer: any = null;

        // Method 1: Search by metadata userId
        try {
          const byMeta = await stripe.customers.search({
            query: `metadata['platformUserId']:'${userId}'`,
          });
          if (byMeta.data.length > 0) foundCustomer = byMeta.data[0];
        } catch { /* ignore */ }

        // Method 2: Search by email
        if (!foundCustomer && ctx.user.email) {
          try {
            const byEmail = await stripe.customers.search({
              query: `email:'${ctx.user.email}'`,
            });
            if (byEmail.data.length > 0) foundCustomer = byEmail.data[0];
          } catch { /* ignore */ }
        }

        // Method 3: List all and filter
        if (!foundCustomer) {
          const allCusts = await stripe.customers.list({ limit: 100 });
          foundCustomer = allCusts.data.find((c: any) =>
            c.metadata?.platformUserId === String(userId) || c.email === ctx.user?.email
          );
        }

        if (!foundCustomer) return { active: false, plan: null };

        // Find active subscription for this customer
        const stripeSubsList = await stripe.subscriptions.list({
          customer: foundCustomer.id,
          status: "all",
          limit: 5,
        });

        const stripeSub = stripeSubsList.data.find((s: any) =>
          s.status === "active" || s.status === "trialing"
        ) || stripeSubsList.data[0];

        if (!stripeSub) return { active: false, plan: null };

        // Determine plan
        const priceId = stripeSub.items?.data?.[0]?.price?.id;
        let plan = "monthly";
        if (priceId) {
          try {
            const priceData = await stripe.prices.retrieve(priceId);
            plan = priceData.unit_amount === 80000 ? "annual" : "monthly";
          } catch { /* default monthly */ }
        }

        // Create subscription record in DB
        await db.insert(subscriptions).values({
          userId,
          stripeCustomerId: foundCustomer.id,
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
        console.error("[verify] Agent search error:", err.message);
        return { active: false, plan: null };
      }
    }

    // Step 3: Verify with Stripe
    try {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;
      const isActive = stripeSub.status === "active" || stripeSub.status === "trialing";

      // Determine plan from actual Stripe price
      const priceId = stripeSub.items?.data?.[0]?.price?.id;
      let plan = sub.plan;
      if (priceId) {
        try {
          const priceData = await stripe.prices.retrieve(priceId);
          plan = priceData.unit_amount === 80000 ? "annual" : "monthly";
        } catch { /* keep existing plan */ }
      }

      // Update DB
      await db.update(subscriptions).set({
        status: stripeSub.status,
        plan: plan as "monthly" | "annual",
        currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : sub.currentPeriodEnd,
        currentPeriodStart: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : sub.currentPeriodStart,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));

      return { active: isActive, plan, status: stripeSub.status };
    } catch (err: any) {
      // Fallback to DB state
      const isActive = sub.status === "active" || sub.status === "trialing";
      return { active: isActive, plan: sub.plan, status: sub.status };
    }
  }),

  // ── Upgrade subscription (monthly → annual) ──
  upgrade: authedQuery
    .input(z.object({ from: z.enum(["monthly"]), to: z.enum(["annual"]) }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const db = getDb();

      // Get current subscription
      const userId = Number(ctx.user.id);
      const subs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      const sub = subs[0];
      if (!sub) return { success: false, error: "No tienes una suscripcion activa" };
      if (sub.plan !== "monthly") return { success: false, error: "Solo puedes hacer upgrade desde el plan mensual" };

      // Get Stripe subscription
      if (!sub.stripeSubscriptionId) return { success: false, error: "No se encontro la suscripcion en Stripe" };

      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;
        if (stripeSub.status !== "active" && stripeSub.status !== "trialing") {
          return { success: false, error: "Tu suscripcion mensual no esta activa" };
        }

        // Get annual price ID
        const annualPriceId = await getOrCreatePrice(stripe, "annual");

        // Step 1: Preview the proration WITHOUT changing the subscription
        const preview = await stripe.invoices.retrieveUpcoming({
          customer: sub.stripeCustomerId,
          subscription: sub.stripeSubscriptionId,
          subscription_items: [{
            id: stripeSub.items.data[0].id,
            price: annualPriceId,
          }],
        });

        const amountDue = preview.amount_due;
        console.log(`[upgrade] Preview: amount_due=${amountDue}`);

        // Step 2: Create a separate payment intent for the upgrade amount
        // This way if payment fails, the original subscription is untouched
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountDue,
          currency: "usd",
          customer: sub.stripeCustomerId,
          description: "Upgrade a plan Anual - AI Aethel Accountant",
          confirm: true,
          payment_method: stripeSub.default_payment_method,
          error_on_requires_action: true,
        });

        // Step 3: If payment succeeded, update the subscription
        if (paymentIntent.status === "succeeded") {
          const updatedSub = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
            items: [{
              id: stripeSub.items.data[0].id,
              price: annualPriceId,
            }],
            proration_behavior: "always_invoice",
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
            message: "Suscripcion aplicada con exito. Ahora tienes el plan Anual.",
          };
        } else {
          // Payment did not succeed — monthly subscription remains untouched
          return { success: false, error: "El pago no pudo completarse. Tu suscripcion mensual sigue activa. Intenta de nuevo mas tarde." };
        }
      } catch (err: any) {
        console.error("[upgrade] Error:", err.message, err.code);
        // If ANY error occurs, the monthly subscription is untouched
        if (err.code === "card_declined" || err.decline_code) {
          return { success: false, error: "Tarjeta declinada. Tu suscripcion mensual sigue activa. Por favor verifica tu metodo de pago e intenta de nuevo." };
        }
        return { success: false, error: (err.message || "Error al procesar el upgrade") + ". Tu suscripcion mensual sigue activa." };
      }
    }),

  // ── Get payment status from Stripe ──
  paymentStatus: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { error: "No auth" };
    const db = getDb();
    const stripe = getStripe();
    const userId = Number(ctx.user.id);

    try {
      // Find subscription
      const subs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      const sub = subs[0];
      if (!sub?.stripeSubscriptionId) return { error: "No subscription" };

      // Get subscription from Stripe
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;

      // Get latest invoice
      let latestInvoice: any = null;
      if (stripeSub.latest_invoice) {
        latestInvoice = await stripe.invoices.retrieve(stripeSub.latest_invoice as string);
      }

      // Get payment intent if exists
      let paymentIntent: any = null;
      if (latestInvoice?.payment_intent) {
        paymentIntent = await stripe.paymentIntents.retrieve(latestInvoice.payment_intent as string);
      }

      return {
        subscriptionStatus: stripeSub.status,
        plan: sub.plan,
        amountDue: latestInvoice?.amount_due ? (latestInvoice.amount_due / 100).toFixed(2) : null,
        amountPaid: latestInvoice?.amount_paid ? (latestInvoice.amount_paid / 100).toFixed(2) : null,
        invoiceStatus: latestInvoice?.status,
        paymentStatus: paymentIntent?.status,
        paymentMethod: paymentIntent?.payment_method_types?.[0] || null,
        chargeStatus: paymentIntent?.charges?.data?.[0]?.status || null,
        receiptUrl: paymentIntent?.charges?.data?.[0]?.receipt_url || null,
        failureMessage: paymentIntent?.last_payment_error?.message || null,
        created: stripeSub.created ? new Date(stripeSub.created * 1000).toISOString() : null,
      };
    } catch (err: any) {
      return { error: err.message };
    }
  }),

  // ── DEBUG: Show raw DB + Stripe data for this user ──
  debug: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return { error: "No auth" };
    const db = getDb();
    const stripe = getStripe();
    const userId = Number(ctx.user.id);
    const userEmail = ctx.user.email;

    // 1. DB contents
    const dbSubs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId));
    const dbPayments = await db.select().from(subscriptionPayments)
      .where(eq(subscriptionPayments.userId, userId));

    // 2. Search Stripe by all methods
    let stripeCustomer: any = null;
    let stripeSubs: any = [];
    try {
      const allCusts = await stripe.customers.list({ limit: 100 });
      stripeCustomer = allCusts.data.find((c: any) =>
        c.metadata?.platformUserId === String(userId) ||
        (userEmail && c.email === userEmail)
      );

      if (stripeCustomer) {
        const subsList = await stripe.subscriptions.list({
          customer: stripeCustomer.id,
          status: "all",
          limit: 5,
        });
        stripeSubs = subsList.data.map((s: any) => ({
          id: s.id,
          status: s.status,
          plan: s.items?.data?.[0]?.price?.unit_amount,
          metadata: s.metadata,
        }));
      }
    } catch (err: any) {
      return {
        userId,
        userIdType: typeof userId,
        userEmail,
        dbSubs,
        dbPayments,
        stripeError: err.message,
      };
    }

    return {
      userId,
      userIdType: typeof userId,
      userEmail,
      dbSubs: dbSubs.map((s: any) => ({ id: s.id, plan: s.plan, status: s.status, stripeSubId: s.stripeSubscriptionId, stripeCustId: s.stripeCustomerId })),
      dbPayments: dbPayments.map((p: any) => ({ id: p.id, plan: p.plan, amount: p.amount, status: p.status })),
      stripeFound: !!stripeCustomer,
      stripeCustomerId: stripeCustomer?.id,
      stripeCustomerEmail: stripeCustomer?.email,
      stripeCustomerMeta: stripeCustomer?.metadata,
      stripeSubs,
    };
  }),

  // ── Create Stripe Customer Portal session ──
  createPortalSession: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const userId = Number(ctx.user.id);
    const subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
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
