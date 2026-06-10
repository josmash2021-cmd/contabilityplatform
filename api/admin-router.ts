import { z } from "zod";
import { createRouter, adminQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, subscriptions, subscriptionPayments, bankAccounts, bankTransactions, sales, systemSettings } from "@db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

// ── DB-based Maintenance Mode (persists across restarts) ──
const MAINTENANCE_KEY = "maintenance_mode";
const MAINTENANCE_MSG_KEY = "maintenance_message";
const DEFAULT_MSG = "Estamos en mantenimiento. Volveremos pronto.";

async function getSetting(db: any, key: string, fallback: string = ""): Promise<string> {
  try {
    const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    return rows[0]?.value ?? fallback;
  } catch { return fallback; }
}

async function setSetting(db: any, key: string, value: string) {
  try {
    await db.insert(systemSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  } catch { /* table may not exist yet */ }
}

export const adminRouter = createRouter({
  // ── List all users with pagination, search, and mode filter ──
  listUsers: adminQuery
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
      search: z.string().optional(),
      mode: z.enum(["all", "business", "personal"]).default("all"),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;

      // Build where conditions
      const conditions = [];
      if (input?.search) {
        const searchTerm = `%${input.search}%`;
        conditions.push(sql`(${users.name} LIKE ${searchTerm} OR ${users.email} LIKE ${searchTerm})`);
      }
      if (input?.mode && input.mode !== "all") {
        conditions.push(eq(users.modePreference, input.mode));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count for pagination
      const countResult = await db.select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(whereClause);
      const total = countResult[0]?.count ?? 0;

      // Get paginated users
      const allUsers = await db.select().from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

    // Get all subscriptions
    const allSubs = await db.select().from(subscriptions);
    const subMap = new Map<number, typeof allSubs[0]>();
    for (const s of allSubs) {
      subMap.set(s.userId, s);
    }

    // Get bank account counts per user
    const bankCounts = await db.select({
      userId: bankAccounts.userId,
      count: sql<number>`COUNT(*)`,
    }).from(bankAccounts).groupBy(bankAccounts.userId);
    const bankCountMap = new Map<number, number>();
    for (const b of bankCounts) {
      bankCountMap.set(b.userId, b.count);
    }

    // Combine
    const result = allUsers.map((u) => {
      const sub = subMap.get(u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isBlocked: u.role === "blocked",
        isAdmin: u.role === "admin",
        modePreference: u.modePreference,
        hasPersonalMode: u.hasPersonalMode,
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
        subscription: sub ? {
          plan: sub.plan,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        } : null,
        bankAccountCount: bankCountMap.get(u.id) || 0,
      };
    });

    return {
      users: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }),

  // ── List all active subscriptions ──
  listSubscriptions: adminQuery.query(async () => {
    const db = getDb();

    const allSubs = await db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));

    // Get user info for each subscription
    const result = [];
    for (const sub of allSubs) {
      const userRows = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      }).from(users).where(eq(users.id, sub.userId)).limit(1);

      const user = userRows[0];
      if (!user) continue;

      // Get payment history
      const payments = await db.select().from(subscriptionPayments)
        .where(eq(subscriptionPayments.userId, sub.userId))
        .orderBy(desc(subscriptionPayments.paidAt))
        .limit(5);

      result.push({
        ...sub,
        userName: user.name,
        userEmail: user.email,
        isBlocked: user.role === "blocked",
        payments: payments.map((p) => ({
          amount: p.amount,
          plan: p.plan,
          status: p.status,
          paidAt: p.paidAt,
        })),
      });
    }

    return result;
  }),

  // ── Toggle user block status ──
  toggleUserBlock: adminQuery
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const adminId = ctx.user.id;

      // Prevent blocking yourself
      if (input.userId === adminId) {
        return { success: false, error: "No puedes bloquearte a ti mismo" };
      }

      // Get target user
      const rows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (rows.length === 0) {
        return { success: false, error: "Usuario no encontrado" };
      }

      const targetUser = rows[0];

      // Prevent blocking other admins
      if (targetUser.role === "admin") {
        return { success: false, error: "No puedes bloquear a otro administrador" };
      }

      const newRole = targetUser.role === "blocked" ? "user" : "blocked";

      await db.update(users).set({ role: newRole }).where(eq(users.id, input.userId));

      return {
        success: true,
        message: newRole === "blocked" ? "Usuario bloqueado" : "Usuario desbloqueado",
        isBlocked: newRole === "blocked",
      };
    }),

  // ── Get dashboard stats ──
  stats: adminQuery.query(async () => {
    const db = getDb();

    const allUsers = await db.select().from(users);
    const totalUsers = allUsers.length;
    const blockedUsers = allUsers.filter((u) => u.role === "blocked").length;
    const adminUsers = allUsers.filter((u) => u.role === "admin").length;

    const allSubs = await db.select().from(subscriptions);
    const activeSubs = allSubs.filter((s) => s.status === "active" || s.status === "trialing").length;
    const monthlySubs = allSubs.filter((s) => s.plan === "monthly").length;
    const annualSubs = allSubs.filter((s) => s.plan === "annual").length;

    const bankAccountsCount = await db.select({ count: sql<number>`COUNT(*)` }).from(bankAccounts);

    // Revenue from payments
    const allPayments = await db.select().from(subscriptionPayments);
    const totalRevenue = allPayments
      .filter((p) => p.status === "succeeded")
      .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

    return {
      totalUsers,
      blockedUsers,
      adminUsers,
      activeSubscriptions: activeSubs,
      monthlySubscriptions: monthlySubs,
      annualSubscriptions: annualSubs,
      totalBankAccounts: bankAccountsCount[0]?.count || 0,
      totalRevenue: totalRevenue.toFixed(2),
    };
  }),

  // ── Export users to CSV ──
  exportUsers: adminQuery.query(async () => {
    const db = getDb();
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    const allSubs = await db.select().from(subscriptions);
    const subMap = new Map<number, typeof allSubs[0]>();
    for (const s of allSubs) subMap.set(s.userId, s);

    // Build CSV
    const headers = ["ID", "Nombre", "Email", "Rol", "Modo", "Suscripcion", "Estado", "Fecha Registro"];
    const rows = allUsers.map((u) => {
      const sub = subMap.get(u.id);
      return [
        String(u.id),
        u.name || "",
        u.email || "",
        u.role || "user",
        u.modePreference || "business",
        sub?.plan || "ninguna",
        sub?.status || "n/a",
        u.createdAt ? new Date(u.createdAt).toLocaleDateString("es") : "",
      ];
    });

    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    return { csv, count: allUsers.length };
  }),

  // ── Get recent activity for a user (bank transactions + sales) ──
  userActivity: adminQuery
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const userId = input.userId;

      // Get recent bank transactions
      const bankTxs = await db.select().from(bankTransactions)
        .where(eq(bankTransactions.userId, userId))
        .orderBy(desc(bankTransactions.transactionDate))
        .limit(20);

      // Get recent sales
      const userSales = await db.select().from(sales)
        .where(eq(sales.createdBy, userId))
        .orderBy(desc(sales.createdAt))
        .limit(20);

      // Combine and sort by date
      const activities = [
        ...bankTxs.map((tx) => ({
          type: "bank" as const,
          description: tx.description,
          amount: tx.amount,
          date: tx.transactionDate,
          category: tx.category,
        })),
        ...userSales.map((s) => ({
          type: "sale" as const,
          description: `Venta #${s.saleNumber || s.id}`,
          amount: s.total,
          date: s.createdAt,
          category: null,
        })),
      ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
       .slice(0, 30);

      return activities;
    }),

  // ── Revoke a user's subscription ──
  revokeSubscription: adminQuery
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const userId = input.userId;

      // Find the subscription
      const subs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      const sub = subs[0];
      if (!sub) throw new Error("El usuario no tiene una suscripcion");

      // Cancel in Stripe if exists
      if (sub.stripeSubscriptionId) {
        try {
          const stripe = getStripe();
          await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        } catch (err: any) {
          console.error("[revoke] Stripe error:", err.message);
          // Continue even if Stripe fails — we still update our DB
        }
      }

      // Update DB to inactive
      await db.update(subscriptions).set({
        status: "canceled",
        cancelAtPeriodEnd: false,
      }).where(eq(subscriptions.id, sub.id));

      return { success: true, message: "Suscripcion revocada correctamente" };
    }),

  // ── Toggle maintenance mode (persisted in DB) ──
  toggleMaintenance: adminQuery
    .input(z.object({
      enabled: z.boolean(),
      message: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const db = getDb();
      const current = (await getSetting(db, MAINTENANCE_KEY)) === "true";
      const newEnabled = input?.enabled ?? !current;
      await setSetting(db, MAINTENANCE_KEY, String(newEnabled));
      if (input?.message) await setSetting(db, MAINTENANCE_MSG_KEY, input.message);
      const msg = await getSetting(db, MAINTENANCE_MSG_KEY, DEFAULT_MSG);
      return {
        success: true,
        enabled: newEnabled,
        message: msg,
      };
    }),

  // ── Get maintenance status (public, from DB) ──
  maintenanceStatus: publicQuery.query(async () => {
    const db = getDb();
    const enabled = (await getSetting(db, MAINTENANCE_KEY)) === "true";
    const message = await getSetting(db, MAINTENANCE_MSG_KEY, DEFAULT_MSG);
    return { enabled, message };
  }),
});
