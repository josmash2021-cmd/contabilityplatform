import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { getDb } from "./queries/connection";
import { subscriptions, subscriptionPayments } from "@db/schema";
import { eq, desc } from "drizzle-orm";
import Stripe from "stripe";

const app = new Hono<{ Bindings: HttpBindings }>();

// CORS - allow frontend to send x-auth-token header
app.use(cors({
  origin: env.isProduction ? "https://aethelaccountingplatform.com" : "http://localhost:5173",
  allowHeaders: ["Content-Type", "Authorization", "x-auth-token"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());

// Health check endpoint
app.get("/api/health", (c) => c.json({ status: "ok", version: "1.0.4-final-fix" }));

// Temporary endpoint to fix database schema
app.get("/api/fix-db", async (c) => {
  try {
    const db = getDb();
    // Try to query companySettings to see if it works
    await db.select().from(subscriptions).limit(1);
    return c.json({ status: "ok", message: "DB connection works" });
  } catch (e: any) {
    return c.json({ status: "error", message: e.message }, 500);
  }
});

// ── Stripe Webhook (raw body needed for signature verification) ──
app.post("/api/webhooks/stripe", async (c) => {
  const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!stripeSecret || !endpointSecret) {
    return c.json({ error: "Stripe not configured" }, 400);
  }

  try {
    const stripe = new Stripe(stripeSecret, { apiVersion: "2026-04-22.dahlia" });
    const body = await c.req.text();
    const signature = c.req.header("stripe-signature") || "";
    let event: any;

    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
    } catch (err: any) {
      
      return c.json({ error: err.message }, 400);
    }

    const db = getDb();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.platformUserId;
        const plan = session.metadata?.plan;
        if (!userId || !plan) break;
        const numericUserId = Number(userId);

        {
          const subscriptionId = session.subscription;
          const customerId = session.customer;
          const existing = await db.select().from(subscriptions)
            .where(eq(subscriptions.userId, numericUserId)).limit(1);
          if (existing.length > 0) {
            await db.update(subscriptions).set({
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              plan: plan as "monthly" | "annual",
              status: "active",
              cancelAtPeriodEnd: false,
            }).where(eq(subscriptions.id, existing[0].id));
          } else {
            await db.insert(subscriptions).values({
              userId: numericUserId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              plan: plan as "monthly" | "annual",
              status: "active",
            });
          }
          await db.insert(subscriptionPayments).values({
            userId: numericUserId,
            stripePaymentIntentId: session.payment_intent,
            amount: plan === "monthly" ? "1.00" : "800.00",
            plan: plan as "monthly" | "annual",
            status: "succeeded",
          });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;
        const subs = await db.select().from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId)).limit(1);
        if (subs[0]) {
          await db.update(subscriptions).set({
            currentPeriodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : new Date(),
            currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : new Date(),
            status: "active",
          }).where(eq(subscriptions.id, subs[0].id));
          await db.insert(subscriptionPayments).values({
            userId: subs[0].userId, subscriptionId: subs[0].id,
            stripeInvoiceId: invoice.id,
            amount: String((invoice.amount_paid / 100).toFixed(2)),
            plan: subs[0].plan, status: "succeeded",
            receiptUrl: invoice.hosted_invoice_url,
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          await db.update(subscriptions).set({ status: "past_due" })
            .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
        }
        break;
      }
      case "customer.subscription.deleted": {
        const stripeSub = event.data.object;
        await db.update(subscriptions).set({ status: "cancelled" })
          .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id));
        break;
      }
      case "customer.subscription.updated": {
        const stripeSub = event.data.object;
        const subs = await db.select().from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id)).limit(1);
        if (subs[0]) {
          await db.update(subscriptions).set({
            status: stripeSub.status,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            currentPeriodEnd: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : subs[0].currentPeriodEnd,
          }).where(eq(subscriptions.id, subs[0].id));
        }
        break;
      }
    }
    return c.json({ received: true });
  } catch (err: any) {
    
    return c.json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// BACKGROUND BALANCE SYNC — runs every 5 minutes
// Updates all users' bank balances without requiring them to be online
// ═══════════════════════════════════════════════════════════
let plaidClient: any = null;

async function initPlaid() {
  if (plaidClient) return plaidClient;
  try {
    const { Configuration, PlaidApi, PlaidEnvironments } = await import("plaid");
    const config = new Configuration({
      basePath: PlaidEnvironments[process.env.PLAID_ENV === "production" ? "production" : "sandbox"],
      baseOptions: { headers: { "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID, "PLAID-SECRET": process.env.PLAID_SECRET } },
    });
    plaidClient = new PlaidApi(config);
    return plaidClient;
  } catch { return null; }
}

async function syncAllBalances() {
  const started = Date.now();
  try {
    const client = await initPlaid();
    if (!client) { console.log("[bg-sync] Plaid not initialized"); return; }

    const { bankAccounts } = await import("@db/schema");
    const { getDb } = await import("./queries/connection");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    // Get all unique access tokens (one per bank connection)
    const allAccounts = await db.select().from(bankAccounts);
    const accessTokenMap = new Map<string, number[]>();
    for (const acc of allAccounts) {
      if (!acc.plaidAccessToken) continue;
      const ids = accessTokenMap.get(acc.plaidAccessToken) || [];
      ids.push(acc.id);
      accessTokenMap.set(acc.plaidAccessToken, ids);
    }

    let updatedCount = 0;
    let userCount = 0;

    for (const [token, accountIds] of accessTokenMap) {
      try {
        const res = await client.accountsGet({ access_token: token });
        const freshBalances = new Map<string, string>();
        for (const plaidAcc of res.data.accounts || []) {
          const bal = plaidAcc.balances.available != null
            ? String(plaidAcc.balances.available)
            : plaidAcc.balances.current != null
              ? String(plaidAcc.balances.current)
              : null;
          if (bal != null) freshBalances.set(plaidAcc.account_id, bal);
        }

        for (const dbAcc of allAccounts) {
          if (!accountIds.includes(dbAcc.id)) continue;
          if (!dbAcc.plaidAccountId) continue;
          const freshBal = freshBalances.get(dbAcc.plaidAccountId);
          if (freshBal != null && freshBal !== dbAcc.currentBalance) {
            await db.update(bankAccounts).set({
              currentBalance: freshBal,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            }).where(eq(bankAccounts.id, dbAcc.id));
            updatedCount++;
            userCount = new Set([...Array.from(allAccounts).map(a => a.userId)]).size;
          }
        }
      } catch (e: any) {
        console.log(`[bg-sync] Error syncing token: ${e.message}`);
      }
    }

    console.log(`[bg-sync] Completed in ${Date.now() - started}ms. Updated ${updatedCount} accounts for ${userCount} users.`);
  } catch (e: any) {
    console.error("[bg-sync] Fatal error:", e.message);
  }
}

// Run every 5 minutes in production
if (env.isProduction) {
  setInterval(syncAllBalances, 5 * 60 * 1000); // 5 minutes
  // Also run immediately on startup (after 10s delay to let server init)
  setTimeout(syncAllBalances, 10000);
  console.log("[bg-sync] Background balance sync scheduled every 5 minutes");
}

// Endpoint for Railway cron job (calls every X minutes)
app.get("/api/sync-all", async (c) => {
  const secret = c.req.header("x-sync-secret");
  if (secret !== process.env.SYNC_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  syncAllBalances();
  return c.json({ status: "sync started" });
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    
  });
}
