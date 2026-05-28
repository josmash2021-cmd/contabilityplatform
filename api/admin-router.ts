import { z } from "zod";
import { createRouter, adminQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, subscriptions, subscriptionPayments, bankAccounts } from "@db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

// ── Maintenance Mode (in-memory, persists until server restart) ──
let maintenanceMode = false;
let maintenanceMessage = "Estamos en mantenimiento. Volveremos pronto.";

export const adminRouter = createRouter({
  // ── List all users with their subscription status ──
  listUsers: adminQuery.query(async () => {
    const db = getDb();

    // Get all users
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

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

    return result;
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

  // ── Toggle maintenance mode ──
  toggleMaintenance: adminQuery
    .input(z.object({
      enabled: z.boolean(),
      message: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      maintenanceMode = input?.enabled ?? !maintenanceMode;
      if (input?.message) maintenanceMessage = input.message;
      return {
        success: true,
        enabled: maintenanceMode,
        message: maintenanceMessage,
      };
    }),

  // ── Get maintenance status (public) ──
  maintenanceStatus: publicQuery.query(async () => {
    return {
      enabled: maintenanceMode,
      message: maintenanceMessage,
    };
  }),
});
