import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { syncAllBankBalances, syncAllBankTransactions } from "./bank-router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { invoicePeriod, invoiceSubscriptionId, subscriptionPeriod } from "./lib/stripePeriod";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { getDb } from "./queries/connection";
import { subscriptions, subscriptionPayments, users } from "@db/schema";
import { eq, desc, and } from "drizzle-orm";
import Stripe from "stripe";
import { normalizeSubStatus } from "./lib/subscriptionStatus";
import { liveStream } from "./lib/taxLive";
import { clientReturnId } from "./tax-router";

const app = new Hono<{ Bindings: HttpBindings }>();

// CORS - allow frontend to send x-auth-token header
app.use(cors({
  origin: env.isProduction ? "https://aethelaccountingplatform.com" : "http://localhost:5173",
  allowHeaders: ["Content-Type", "Authorization", "x-auth-token", "x-lang"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());

// Health check endpoint
app.get("/api/health", (c) => c.json({ status: "ok", version: "1.0.7-security" }));

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
      console.error("[stripe-webhook] signature verification FAILED:", err.message);
      return c.json({ error: err.message }, 400);
    }

    console.log("[stripe-webhook] received event:", event.type, "id:", event.id);

    const db = getDb();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.platformUserId;
        const plan = session.metadata?.plan;
        if (!userId || !plan) {
          console.warn("[stripe-webhook] checkout.session.completed sin metadata (platformUserId/plan) — se ignora. session:", session.id);
          break;
        }
        const numericUserId = Number(userId);

        {
          const subscriptionId = session.subscription;
          const customerId = session.customer;
          const existing = await db.select().from(subscriptions)
            .where(eq(subscriptions.userId, numericUserId)).limit(1);

          // One-time payment checkouts (mode: "payment") have no Stripe subscription,
          // so they never receive invoice.paid / customer.subscription.updated events.
          // We must compute the access period here, or the "Hasta" date never advances
          // after a client pays. Renewals extend from the later of now or the current
          // still-valid end so leftover days are not lost.
          const isOneTime = !subscriptionId;
          const now = new Date();
          const currentEnd = existing[0]?.currentPeriodEnd ? new Date(existing[0].currentPeriodEnd) : null;
          const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
          const periodEnd = new Date(base);
          if (plan === "annual") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          else periodEnd.setMonth(periodEnd.getMonth() + 1);

          if (existing.length > 0) {
            await db.update(subscriptions).set({
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId || existing[0].stripeSubscriptionId,
              plan: plan as "monthly" | "annual",
              status: "active",
              cancelAtPeriodEnd: false,
              ...(isOneTime ? { currentPeriodStart: now, currentPeriodEnd: periodEnd } : {}),
            }).where(eq(subscriptions.id, existing[0].id));
          } else {
            await db.insert(subscriptions).values({
              userId: numericUserId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              plan: plan as "monthly" | "annual",
              status: "active",
              ...(isOneTime ? { currentPeriodStart: now, currentPeriodEnd: periodEnd } : {}),
            });
          }
          // Prevent duplicate payments from webhook retries
          const paymentIntentId = session.payment_intent;
          if (paymentIntentId) {
            const existingPayment = await db.select().from(subscriptionPayments)
              .where(eq(subscriptionPayments.stripePaymentIntentId, paymentIntentId)).limit(1);
            if (existingPayment.length > 0) break; // Already recorded, skip
          }

          // Record what Stripe actually charged (personal plans cost less than business).
          const recordedAmount = typeof session.amount_total === "number"
            ? (session.amount_total / 100).toFixed(2)
            : (plan === "monthly" ? "80.00" : "800.00");
          await db.insert(subscriptionPayments).values({
            userId: numericUserId,
            stripePaymentIntentId: paymentIntentId,
            amount: recordedAmount,
            plan: plan as "monthly" | "annual",
            status: "succeeded",
          });
          console.log(`[stripe-webhook] pago registrado: user ${numericUserId}, plan ${plan}, $${recordedAmount} — ingresos totales actualizados`);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) break;
        const subs = await db.select().from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId)).limit(1);
        if (subs[0]) {
          // The paid period comes from the invoice lines; if Stripe sent none, keep what we had.
          const paid = invoicePeriod(invoice);
          await db.update(subscriptions).set({
            currentPeriodStart: paid.start ?? subs[0].currentPeriodStart,
            currentPeriodEnd: paid.end ?? subs[0].currentPeriodEnd,
            status: "active",
          }).where(eq(subscriptions.id, subs[0].id));
          // Prevent duplicate payments from webhook retries
          const existingInvoice = await db.select().from(subscriptionPayments)
            .where(eq(subscriptionPayments.stripeInvoiceId, invoice.id)).limit(1);
          if (existingInvoice.length > 0) break; // Already recorded, skip

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
        const subscriptionId = invoiceSubscriptionId(invoice);
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
            status: normalizeSubStatus(stripeSub.status),
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            currentPeriodEnd: subscriptionPeriod(stripeSub).end ?? subs[0].currentPeriodEnd,
          }).where(eq(subscriptions.id, subs[0].id));
        }
        break;
      }
    }
    return c.json({ received: true });
  } catch (err: any) {
    console.error("[stripe-webhook] handler error:", err?.message, err?.stack);
    return c.json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// BACKGROUND BANK SYNC — every user's banks, without anyone online
// Balances every 5 minutes, new movements every 3 minutes. The jobs live next to the main sync
// (api/bank-router.ts syncAllBankBalances / syncAllBankTransactions) so they use the same Plaid client
// (initPlaid, honors PLAID_BASE_URL), one call per bank connection (a failing bank never stops the rest,
// its status is recorded), the same balance rule (plaidBalance) and the same categorization and saved shape.
// The movement job only adds what isn't saved yet (last 30 days, dedup by plaidTransactionId, a per-run cap),
// never changes a saved row (except a movement saved while pending, which becomes the settled one: takeOverPending),
// and two runs never overlap.
// ═══════════════════════════════════════════════════════════
async function syncAllBalances() {
  const started = Date.now();
  const r = await syncAllBankBalances();
  if (r.failed > 0 || r.updated > 0) {
    console.log(`[bg-sync] balances: ${r.updated} updated, ${r.failed} of ${r.banks} bank(s) unreachable (${Date.now() - started}ms)`);
  }
}

async function syncAllTransactions() {
  const started = Date.now();
  const r = await syncAllBankTransactions();
  if (r.added > 0 || r.failed > 0) {
    console.log(`[tx-sync] ${r.added} new movement(s)${r.capped ? " (capped, more next run)" : ""}, ${r.failed} of ${r.banks} bank(s) unreachable (${Date.now() - started}ms)`);
  }
}

// Run every 3 minutes in production
if (env.isProduction) {
  // Balance sync every 5 minutes
  setInterval(syncAllBalances, 5 * 60 * 1000);
  setTimeout(syncAllBalances, 10000);

  // Transaction sync every 3 minutes
  setInterval(syncAllTransactions, 3 * 60 * 1000);
  setTimeout(syncAllTransactions, 15000); // 5s after balance sync

  // Recurring invoices: create the sales that came due (safe to repeat; see api/quotes-router.ts)
  const runRecurring = async () => {
    try {
      const { runRecurringInvoices } = await import("./quotes-router");
      const { created } = await runRecurringInvoices(getDb());
      if (created) console.log(`[recurring] created ${created} sale(s)`);
    } catch (e: unknown) {
      console.error("[recurring] failed:", e instanceof Error ? e.message : e);
    }
  };
  setInterval(runRecurring, 60 * 60 * 1000);
  setTimeout(runRecurring, 60_000);

  // "Tu resumen del lunes" by email (Asistente): checks every hour, sends on Monday mornings, once per person.
  const runWeekly = async () => {
    try {
      const { runWeeklyEmails } = await import("./lib/weeklyEmail");
      const r = await runWeeklyEmails(getDb());
      if (r.sent || r.failed) console.log(`[weekly-email] sent ${r.sent}, failed ${r.failed}`);
    } catch (e: unknown) {
      console.error("[weekly-email] failed:", e instanceof Error ? e.message : e);
    }
  };
  setInterval(runWeekly, 60 * 60 * 1000);
  setTimeout(runWeekly, 90_000);
}

// Endpoint for Railway cron job (calls every X minutes)
app.get("/api/sync-all", async (c) => {
  const secret = c.req.header("x-sync-secret");
  // If SYNC_SECRET isn't configured, undefined === undefined used to let anyone in.
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  syncAllBalances();
  return c.json({ status: "sync started" });
});

// Impuestos, live (api/lib/taxLive.ts): the page hears at once when something changes, who's typing and who has
// the chat open. ?returnId=N is one return's preparer page, ?list=1 the preparers' list; else a client's own page.
app.get("/api/tax/live", async (c) => {
  const ctx = await createContext({ req: c.req.raw, resHeaders: new Headers(), info: {} } as unknown as Parameters<typeof createContext>[0]);
  const user = ctx.user;
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const returnId = c.req.query("returnId");
  if (returnId !== undefined || c.req.query("list") !== undefined) {
    // Preparers only (a team member never gets the owner's role).
    if (user.role !== "admin" || ctx.member) return c.json({ error: "Forbidden" }, 403);
    const id = returnId ? Number(returnId) : null;
    if (id !== null && !(Number.isInteger(id) && id > 0)) return c.json({ error: "Bad request" }, 400);
    return liveStream(c, { kind: "preparer", returnId: id });
  }
  if (ctx.member) return c.json({ error: "Forbidden" }, 403);
  return liveStream(c, { kind: "client", userId: Number(user.id), returnId: await clientReturnId(user) });
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

  // Additive fixes to existing tables (each checks first; see api/lib/dbFixes.ts).
  const { runStartupDbFixes } = await import("./lib/dbFixes");
  void runStartupDbFixes(getDb());

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    
  });
}
