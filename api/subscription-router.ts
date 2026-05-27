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
  monthly: { amount: 8000, name: "AI AETHEL - Mensual" },  // $80 for business monthly
  annual: { amount: 80000, name: "AI AETHEL - Anual" },     // $800 for business annual
};

const STRIPE_MONTHLY_LOOKUP = "contability_monthly_80";
const STRIPE_ANNUAL_LOOKUP = "contability_annual_800";

// ── Shared: recover a subscription from past_due/unpaid/incomplete state ──
// Returns { success, finalSub? } where finalSub is the new Stripe subscription
async function recoverSubscription(db: any, stripe: Stripe, userId: number) {
  try {
    const subs = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    const sub = subs[0];
    if (!sub?.stripeSubscriptionId) return { success: false, error: "No hay suscripcion" };

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
      expand: ["latest_invoice"],
    }) as any;

    if (stripeSub.status !== "past_due" && stripeSub.status !== "incomplete" && stripeSub.status !== "unpaid") {
      return { success: false, error: "No necesita restauracion" };
    }

    const customerId = sub.stripeCustomerId;

    // Step 1: Void unpaid invoices
    try {
      const latestInvoiceId = stripeSub.latest_invoice?.id;
      if (latestInvoiceId) {
        const inv = await stripe.invoices.retrieve(latestInvoiceId) as any;
        if (inv.status === "open" || inv.status === "uncollectible") {
          await stripe.invoices.voidInvoice(latestInvoiceId);
        }
      }
      const openInvoices = await stripe.invoices.list({ customer: customerId, status: "open", limit: 10 });
      for (const invoice of openInvoices.data) {
        try { await stripe.invoices.voidInvoice(invoice.id); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    // Step 2: Cancel broken subscription
    try {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId, { invoice_now: false, prorate: false });
    } catch { /* may already be cancelled */ }

    // Step 3: Create fresh monthly subscription
    const monthlyPriceId = await getOrCreatePrice(stripe, "monthly");
    const customer = await stripe.customers.retrieve(customerId) as any;
    const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;

    const newSub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: monthlyPriceId }],
      default_payment_method: defaultPaymentMethod || undefined,
      collection_method: "charge_automatically",
      expand: ["latest_invoice"],
    }) as any;

    const finalSub = await stripe.subscriptions.retrieve(newSub.id) as any;

    // Step 4: Replace DB record
    await db.delete(subscriptions).where(eq(subscriptions.id, sub.id));
    await db.insert(subscriptions).values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: finalSub.id,
      plan: "monthly" as const,
      status: finalSub.status,
      currentPeriodStart: finalSub.current_period_start ? new Date(finalSub.current_period_start * 1000) : new Date(),
      currentPeriodEnd: finalSub.current_period_end ? new Date(finalSub.current_period_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    });

    return { success: true, finalSub };
  } catch (err: any) {
    console.error("[recoverSubscription] Error:", err.message);
    return { success: false, error: err.message };
  }
}

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

    let sub = subs[0];
    if (!sub) return { active: false, plan: null, status: "no_subscription", currentPeriodEnd: null };

    // Step 3: Verify with Stripe — ALWAYS check ALL subscriptions for this customer
    try {
      const stripe = getStripe();

      // Get the customer ID (from DB or search)
      let customerId = sub.stripeCustomerId;
      if (!customerId) {
        // Search for customer by email
        if (ctx.user.email) {
          const byEmail = await stripe.customers.search({
            query: `email:'${ctx.user.email}'`,
          });
          if (byEmail.data.length > 0) customerId = byEmail.data[0].id;
        }
        if (!customerId) {
          const allCusts = await stripe.customers.list({ limit: 100 });
          const found = allCusts.data.find((c: any) =>
            c.metadata?.platformUserId === String(userId) || c.email === ctx.user?.email
          );
          if (found) customerId = found.id;
        }
      }

      if (customerId) {
        // List ALL subscriptions for this customer — not just the one in DB
        const stripeSubsList = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 10,
        });

        // Find the BEST subscription: active/trialing first, then newest
        const allSubs = stripeSubsList.data;
        let bestSub = allSubs.find((s: any) =>
          s.status === "active" || s.status === "trialing"
        );

        // If no active sub found, check if the DB sub is still valid
        if (!bestSub && sub.stripeSubscriptionId) {
          const dbSubInStripe = allSubs.find((s: any) => s.id === sub.stripeSubscriptionId);
          if (dbSubInStripe) bestSub = dbSubInStripe;
        }

        // If still no sub found but there are subs, take the newest
        if (!bestSub && allSubs.length > 0) {
          bestSub = allSubs[0]; // Stripe returns newest first
        }

        if (bestSub) {
          const priceId = bestSub.items?.data?.[0]?.price?.id;
          let plan: "monthly" | "annual" = sub.plan;
          if (priceId) {
            try {
              const priceData = await stripe.prices.retrieve(priceId);
              plan = priceData.unit_amount === 80000 ? "annual" : "monthly";
            } catch { /* keep existing plan */ }
          }

          // If the best sub is different from what's in DB, update DB
          if (bestSub.id !== sub.stripeSubscriptionId) {

            // Delete old records for this user and insert the correct one
            await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
            await db.insert(subscriptions).values({
              userId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: bestSub.id,
              plan,
              status: bestSub.status,
              currentPeriodStart: bestSub.current_period_start ? new Date(bestSub.current_period_start * 1000) : new Date(),
              currentPeriodEnd: bestSub.current_period_end ? new Date(bestSub.current_period_end * 1000) : new Date(),
              cancelAtPeriodEnd: bestSub.cancel_at_period_end || false,
            });
          } else {
            // Same sub, just update it
            await db.update(subscriptions).set({
              status: bestSub.status,
              plan,
              currentPeriodEnd: bestSub.current_period_end ? new Date(bestSub.current_period_end * 1000) : sub.currentPeriodEnd,
              currentPeriodStart: bestSub.current_period_start ? new Date(bestSub.current_period_start * 1000) : sub.currentPeriodStart,
              cancelAtPeriodEnd: bestSub.cancel_at_period_end,
              updatedAt: new Date(),
            }).where(eq(subscriptions.id, sub.id));
          }

          const isActive = bestSub.status === "active" || bestSub.status === "trialing";

          // If broken (past_due/unpaid/incomplete), auto-recover
          if (!isActive && (bestSub.status === "past_due" || bestSub.status === "unpaid" || bestSub.status === "incomplete")) {

            const recovered = await recoverSubscription(db, stripe, userId);
            if (recovered.success && recovered.finalSub) {
              const recStatus = recovered.finalSub.status;
              const recActive = recStatus === "active" || recStatus === "trialing";
              return {
                active: recActive,
                plan: "monthly" as const,
                status: recStatus,
                currentPeriodEnd: recovered.finalSub.current_period_end ? new Date(recovered.finalSub.current_period_end * 1000).toISOString() : null,
                cancelAtPeriodEnd: recovered.finalSub.cancel_at_period_end,
              };
            }
          }

          return {
            active: isActive,
            plan: plan,
            status: bestSub.status,
            currentPeriodEnd: bestSub.current_period_end ? new Date(bestSub.current_period_end * 1000).toISOString() : null,
            cancelAtPeriodEnd: bestSub.cancel_at_period_end,
          };
        }
      }
    } catch (err: any) {
      console.error("[status] Stripe verification error:", err.message);
    }

    // Fallback to DB state
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
  // Delegates to the shared recoverSubscription function.
  restoreMonthly: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const stripe = getStripe();
    const userId = Number(ctx.user.id);

    const result = await recoverSubscription(db, stripe, userId);
    if (result.success) {
      return { success: true, message: "Tu suscripcion mensual ha sido restaurada. Puede tomar unos segundos en activarse." };
    }
    return { success: false, error: result.error || "Error al restaurar" };
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

  // ── Upgrade subscription (monthly → annual) via Stripe Checkout ──
  // Instead of charging directly (which fails with Apple Pay/3D Secure),
  // we redirect the user to Stripe Checkout where they can pay with
  // Link, Apple Pay, Google Pay, or any saved card.
  upgrade: authedQuery
    .input(z.object({ from: z.enum(["monthly"]), to: z.enum(["annual"]) }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const db = getDb();

      const userId = Number(ctx.user.id);
      const subs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      const sub = subs[0];
      if (!sub) return { success: false, error: "No tienes una suscripcion activa" };
      if (sub.plan !== "monthly") return { success: false, error: "Solo puedes hacer upgrade desde el plan mensual" };
      if (!sub.stripeSubscriptionId) return { success: false, error: "No se encontro la suscripcion en Stripe" };

      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId) as any;
        if (stripeSub.status !== "active" && stripeSub.status !== "trialing") {
          return { success: false, error: "Tu suscripcion mensual no esta activa" };
        }

        // Get annual price and calculate difference: $800 - $1 already paid = $799
        const annualPriceId = await getOrCreatePrice(stripe, "annual");
        const annualPrice = await stripe.prices.retrieve(annualPriceId);
        const annualAmount = (annualPrice.unit_amount || 80000); // $800 in cents
        const monthlyAmount = 100; // $1 in cents (already paid)
        const amountDue = annualAmount - monthlyAmount; // $79900 cents = $799

        // Create a Stripe Checkout Session for the upgrade difference
        // User pays via Stripe Checkout (supports Link, Apple Pay, Google Pay)
        const appUrl = getAppUrl();
        const session = await stripe.checkout.sessions.create({
          customer: sub.stripeCustomerId,
          mode: "payment",
          line_items: [{
            price_data: {
              currency: "usd",
              unit_amount: amountDue,
              product_data: {
                name: "Upgrade a Plan Anual - AI Aethel Accountant",
                description: `Pago de diferencia para upgrade a plan anual. Incluye todo lo del plan mensual + beneficios anuales.`,
              },
            },
            quantity: 1,
          }],
          success_url: `${appUrl}/settings?upgrade=success`,
          cancel_url: `${appUrl}/settings?upgrade=cancelled`,
          metadata: {
            platformUserId: String(userId),
            type: "upgrade",
            subscriptionId: sub.stripeSubscriptionId,
            annualPriceId: annualPriceId,
            originalPlan: "monthly",
            amount: String(amountDue),
          },
        });

        return { success: true, url: session.url, amountDue: amountDue / 100 };
      } catch (err: any) {
        console.error("[upgrade] Error:", err.message, err.code);
        return { success: false, error: (err.message || "Error al procesar el upgrade") + ". Tu suscripcion mensual sigue activa." };
      }
    }),

  // ── Complete upgrade after Stripe Checkout payment ──
  completeUpgrade: authedQuery.mutation(async ({ ctx }) => {
    const stripe = getStripe();
    const db = getDb();
    const userId = Number(ctx.user.id);

    try {
      // Find the most recent checkout session for this user
      const sessions = await stripe.checkout.sessions.list({
        limit: 5,
      });

      // Find our upgrade session
      const upgradeSession = sessions.data.find((s: any) =>
        s.metadata?.platformUserId === String(userId) &&
        s.metadata?.type === "upgrade" &&
        s.payment_status === "paid"
      );

      if (!upgradeSession) {
        return { success: false, error: "No se encontro un pago de upgrade completado" };
      }

      const subscriptionId = upgradeSession.metadata?.subscriptionId;
      const annualPriceId = upgradeSession.metadata?.annualPriceId;

      if (!subscriptionId || !annualPriceId) {
        return { success: false, error: "Datos de upgrade incompletos" };
      }

      // Update the subscription to annual
      const updatedSub = await stripe.subscriptions.update(subscriptionId, {
        items: [{
          price: annualPriceId,
        }],
        proration_behavior: "none",
        billing_cycle_anchor: "now",
      });

      // Update DB
      const subs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      if (subs[0]) {
        await db.update(subscriptions).set({
          plan: "annual",
          status: updatedSub.status,
          currentPeriodEnd: updatedSub.current_period_end ? new Date(updatedSub.current_period_end * 1000) : null,
          updatedAt: new Date(),
        }).where(eq(subscriptions.id, subs[0].id));
      }

      return { success: true, message: "Upgrade completado. Ahora tienes el plan Anual." };
    } catch (err: any) {
      console.error("[completeUpgrade] Error:", err.message);
      return { success: false, error: err.message || "Error al completar el upgrade" };
    }
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

  // ── Create Stripe Checkout for direct subscription ──
  createCheckout: authedQuery
    .input(z.object({ plan: z.enum(["monthly", "annual"]), mode: z.enum(["business", "personal"]).optional() }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const db = getDb();
      const userId = Number(ctx.user.id);
      const userMode = input.mode || "business";

      // Get or create Stripe customer
      let customerId: string;
      const existingSubs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (existingSubs[0]?.stripeCustomerId) {
        customerId = existingSubs[0].stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: ctx.user.email || undefined,
          metadata: { platformUserId: String(userId) },
        });
        customerId = customer.id;
      }

      const appUrl = getAppUrl();
      const planConfig = PLAN_PRICES[input.plan];
      const productName = userMode === "personal"
        ? (input.plan === "monthly" ? "AI Aethel - Personal Mensual" : "AI Aethel - Personal Anual")
        : planConfig.name;

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment", // Use "payment" for one-time charges
        line_items: [{
          price_data: {
            currency: "usd",
            unit_amount: planConfig.amount,
            product_data: {
              name: productName,
              description: input.plan === "monthly" ? "Suscripcion mensual - Cancela cuando quieras" : "Suscripcion anual - Ahorra $400",
            },
          },
          quantity: 1,
        }],
        success_url: `${appUrl}/settings?subscription=success&plan=${input.plan}`,
        cancel_url: `${appUrl}/settings?subscription=cancelled`,
        metadata: {
          platformUserId: String(userId),
          plan: input.plan,
          mode: userMode,
        },
      });



      if (!session.url) {
        return { success: false, error: "No se pudo crear la sesion de pago" };
      }

      return { success: true, url: session.url };
    }),

});
