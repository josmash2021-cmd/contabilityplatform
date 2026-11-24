import { z } from "zod";
import { createRouter, adminQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { deleteUserTaxData } from "./tax-router";
import { deleteUserReceipts } from "./receipts-router";
import { deleteUserVendorsData } from "./vendors-router";
import { deleteUserQuotesData } from "./quotes-router";
import { deleteUserReconcileData } from "./reconcile-router";
import { deleteUserFirstUseData } from "./lib/userDataCleanup";
import { deleteUserSupportData } from "./lib/support";
import { users, subscriptions, subscriptionPayments, bankAccounts, bankTransactions, sales, payouts } from "@db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { buildOverview, buildPayments, editablePayment, isGiftPayment, paymentSource, userStatus, type AdminSubRow, type AdminPayRow, type StatusKind, type TaxRow } from "./lib/adminOverview";
import { allTrialUntil, setTrialUntil, trialUntil } from "./lib/trialExtensions";
import { getTrialInfo } from "./lib/trial";
import { accountMode } from "./lib/plans";
import { rowsOf, utcDate } from "./lib/support";
import { readMaintenance, writeMaintenance } from "./lib/maintenance";

// Maintenance mode lives in api/lib/maintenance.ts (settings, cache and what customers can't do while it's on).

type Db = ReturnType<typeof getDb>;
// getDb() is untyped here: the rows are typed by hand.
type UserRow = typeof users.$inferSelect;
type PayRow = typeof subscriptionPayments.$inferSelect;

/** Everyone, their subscriptions and payments, and the extra free days: what userStatus needs. */
async function loadPeople(db: Db) {
  const [us, subs, pays, until] = await Promise.all([
    db.select().from(users) as Promise<UserRow[]>,
    db.select().from(subscriptions) as Promise<AdminSubRow[]>,
    db.select().from(subscriptionPayments) as Promise<PayRow[]>,
    allTrialUntil(db).catch(() => new Map<number, Date>()),
  ]);
  return { us, subs, pays, until };
}

/** A payment the admin wrote down (or an old test): the only kind that can be edited or deleted. */
async function canEditPayment(db: Db, id: number): Promise<boolean> {
  const p = ((await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, id)).limit(1)) as PayRow[])[0];
  if (!p) return false;
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, p.userId)) as AdminSubRow[];
  return editablePayment(paymentSource(p as AdminPayRow, subs));
}

/** The filter of the users list ("En prueba", "Pagan"...). */
const STATUS_FILTER: Record<string, StatusKind[]> = {
  trial: ["trial"], paying: ["paying", "gift"], failed: ["failed"], canceled: ["canceled", "ended"], blocked: ["blocked"], free: ["free"],
};

export const adminRouter = createRouter({
  // ── Resumen: the four numbers, the weeks, what's for today, recent activity and the system ──
  overview: adminQuery.query(async () => {
    const db = getDb();
    const { us, subs, pays, until } = await loadPeople(db);
    let taxes: TaxRow[] = [];
    try {
      taxes = rowsOf<{ id: number; userId: number; step: number; submittedAt: string | null; name: string | null; unread: number; pendingDocs: number }>(await db.execute(sql`
        SELECT r.id, r.userId, r.step, r.submittedAt, u.name,
          (SELECT COUNT(*) FROM taxMessages m WHERE m.returnId = r.id AND m.fromRole = 'client' AND m.readAt IS NULL) AS unread,
          (SELECT COUNT(*) FROM taxDocuments d WHERE d.returnId = r.id AND d.source = 'client' AND d.status = 'pending') AS pendingDocs
        FROM taxReturns r LEFT JOIN users u ON u.id = r.userId
        ORDER BY r.submittedAt IS NULL, r.submittedAt ASC, r.id ASC`)).map((r) => ({
        id: Number(r.id), userId: Number(r.userId), name: r.name, step: Number(r.step), submittedAt: utcDate(r.submittedAt), unread: Number(r.unread), pendingDocs: Number(r.pendingDocs),
      }));
    } catch { /* no tax tables yet */ }
    let support = { chats: 0, oldestAt: null as Date | null };
    try {
      const row = rowsOf<{ chats: number; oldest: string | null }>(await db.execute(sql`
        SELECT COUNT(DISTINCT c.id) AS chats, MIN(m.createdAt) AS oldest
        FROM supportChats c JOIN supportMessages m ON m.chatId = c.id AND m.fromRole = 'visitor' AND m.id > c.adminReadId`))[0];
      support = { chats: Number(row?.chats ?? 0), oldestAt: utcDate(row?.oldest) };
    } catch { /* no support tables yet */ }
    const system = {
      maintenance: (await readMaintenance(db)).enabled,
      email: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
      bank: !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      payments: !!process.env.STRIPE_SECRET_KEY,
    };
    return { ...buildOverview({ users: us, subs, pays, trialUntil: until, taxes, support }), system };
  }),

  // ── One person's card ("Ver"): their status, payments, banks, team, taxes ──
  userDetail: adminQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const u = ((await db.select().from(users).where(eq(users.id, input.userId)).limit(1)) as UserRow[])[0];
      if (!u) return null;
      const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, u.id)) as AdminSubRow[];
      const pays = await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.userId, u.id)).orderBy(desc(subscriptionPayments.paidAt)) as PayRow[];
      const until = await trialUntil(db, u.id).catch(() => null);
      const status = userStatus(u, subs, pays as AdminPayRow[], until);
      const banks = await db.select({ bankName: bankAccounts.bankName, isActive: bankAccounts.isActive }).from(bankAccounts).where(eq(bankAccounts.userId, u.id)) as { bankName: string; isActive: boolean | null }[];
      let team = 0;
      let memberOf = 0;
      try {
        team = Number(rowsOf<{ n: number }>(await db.execute(sql`SELECT COUNT(*) AS n FROM teamMembers WHERE ownerId = ${u.id}`))[0]?.n ?? 0);
        memberOf = Number(rowsOf<{ n: number }>(await db.execute(sql`SELECT COUNT(*) AS n FROM teamMembers WHERE memberUserId = ${u.id}`))[0]?.n ?? 0);
      } catch { /* no team table */ }
      let tax: { id: number; year: number; step: number; submitted: boolean } | null = null;
      try {
        const r = rowsOf<{ id: number; taxYear: number; step: number; submittedAt: string | null }>(await db.execute(sql`SELECT id, taxYear, step, submittedAt FROM taxReturns WHERE userId = ${u.id} ORDER BY taxYear DESC, id DESC LIMIT 1`))[0];
        if (r) tax = { id: Number(r.id), year: Number(r.taxYear), step: Number(r.step), submitted: !!r.submittedAt };
      } catch { /* no tax tables */ }
      const paidTotal = pays.filter((p) => p.status === "succeeded" && !isGiftPayment(p as AdminPayRow, subs)).reduce((n, p) => n + Number(p.amount), 0);
      return {
        user: { id: u.id, name: u.name, email: u.email, role: u.role, mode: accountMode(u.modePreference), createdAt: u.createdAt, lastSignInAt: u.lastSignInAt },
        status,
        trialUntil: until ? until.toISOString() : null,
        payments: pays.slice(0, 24).map((p) => ({ id: p.id, amount: Number(p.amount), plan: p.plan, status: p.status, paidAt: p.paidAt, gift: isGiftPayment(p as AdminPayRow, subs), receiptUrl: p.receiptUrl })),
        paidTotal: Math.round(paidTotal * 100) / 100,
        banks: [...new Set(banks.filter((b) => b.isActive !== false).map((b) => b.bankName))],
        team,
        memberOf,
        tax,
      };
    }),

  // ── "Cambiar a Personal / Negocio": the type of account. Nothing is deleted: business data stays and shows
  //    again if it goes back. Not for admins, nor (to Personal) for someone in a team: the team is business-only. ──
  setMode: adminQuery
    .input(z.object({ userId: z.number().int().positive(), mode: z.enum(["business", "personal"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const u = ((await db.select().from(users).where(eq(users.id, input.userId)).limit(1)) as UserRow[])[0];
      if (!u) return { success: false as const, error: "notFound" as const };
      if (u.role === "admin") return { success: false as const, error: "admin" as const };
      if (input.mode === "personal") {
        let asMember = 0, asOwner = 0;
        try {
          asMember = Number(rowsOf<{ n: number }>(await db.execute(sql`SELECT COUNT(*) AS n FROM teamMembers WHERE memberUserId = ${u.id}`))[0]?.n ?? 0);
          asOwner = Number(rowsOf<{ n: number }>(await db.execute(sql`SELECT COUNT(*) AS n FROM teamMembers WHERE ownerId = ${u.id}`))[0]?.n ?? 0);
        } catch { /* no team table: no team */ }
        if (asMember) return { success: false as const, error: "teamMember" as const };
        if (asOwner) return { success: false as const, error: "hasTeam" as const };
      }
      await db.update(users).set({ modePreference: input.mode, hasPersonalMode: true }).where(eq(users.id, u.id));
      return { success: true as const, mode: input.mode };
    }),

  // ── Pagos: every payment, where it came from (Stripe, A mano, Regalo, Prueba), the four numbers ──
  payments: adminQuery.query(async () => {
    const db = getDb();
    const { us, subs, pays, until } = await loadPeople(db);
    return buildPayments({ users: us, subs, pays: pays as (AdminPayRow & { id: number })[], trialUntil: until });
  }),

  // ── "Dar más días gratis": the trial runs N more days (from today, or from when it would end) ──
  extendTrial: adminQuery
    .input(z.object({ userId: z.number().int().positive(), days: z.number().int().min(1).max(60) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const u = ((await db.select().from(users).where(eq(users.id, input.userId)).limit(1)) as UserRow[])[0];
      if (!u) return { success: false as const, error: "notFound" as const };
      if (u.role === "admin") return { success: false as const, error: "admin" as const };
      const cur = getTrialInfo(u.createdAt, new Date(), await trialUntil(db, u.id).catch(() => null));
      const from = Math.max(Date.now(), cur?.active ? new Date(cur.endsAt).getTime() : 0);
      const until = new Date(from + input.days * 86_400_000);
      await setTrialUntil(db, u.id, until, Number(ctx.user.id));
      return { success: true as const, until: until.toISOString() };
    }),

  // ── List all users with pagination, search, and mode filter ──
  listUsers: adminQuery
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
      search: z.string().optional(),
      mode: z.enum(["all", "business", "personal"]).default("all"),
      status: z.enum(["all", "trial", "paying", "failed", "canceled", "blocked", "free"]).default("all"),
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

      // Everyone who matches, with their status (the same rule as the Resumen), then the filter, then the page.
      const matching = await db.select().from(users).where(whereClause).orderBy(desc(users.createdAt)) as UserRow[];
      const { subs: subRows, pays: payRows, until } = await loadPeople(db);
      const withStatus = matching.map((u) => ({ u, status: userStatus(u, subRows, payRows, until.get(u.id) ?? null) }));
      const wanted = input?.status && input.status !== "all" ? STATUS_FILTER[input.status] : null;
      const filtered = wanted ? withStatus.filter((x) => wanted.includes(x.status.kind)) : withStatus;
      const total = filtered.length;
      const pageRows = filtered.slice(offset, offset + limit);
      const allUsers = pageRows.map((x) => x.u);
      const statusOf = new Map(pageRows.map((x) => [x.u.id, x.status]));

    // Get all subscriptions
    const allSubs = subRows;
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
        isBlocked: (u.role as string) === "blocked",
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
        status: statusOf.get(u.id)!,
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

  // ── Eliminar usuario (permanente, borra sus datos por cascade) ──
  deleteUser: adminQuery
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const adminId = ctx.user.id;

      if (input.userId === adminId) {
        return { success: false, error: "No puedes eliminarte a ti mismo" };
      }

      const rows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (rows.length === 0) {
        return { success: false, error: "Usuario no encontrado" };
      }
      const targetUser = rows[0];
      if (targetUser.role === "admin") {
        return { success: false, error: "No puedes eliminar a otro administrador" };
      }

      try {
        // Tax documents (IDs, Social Security) go first: their tables have no cascade.
        await deleteUserTaxData(db, input.userId);
        await deleteUserReceipts(db, input.userId);
        await deleteUserVendorsData(db, input.userId);
        await deleteUserQuotesData(db, input.userId);
        await deleteUserReconcileData(db, input.userId);
        await deleteUserFirstUseData(db, input.userId); // review, expenses, budgets, goals, subscriptions, logo, team, notices…
        await deleteUserSupportData(db, input.userId); // support chats written while signed in
        await db.delete(users).where(eq(users.id, input.userId));
        return { success: true, message: `Usuario ${targetUser.name || targetUser.email} eliminado` };
      } catch (e: any) {
        return { success: false, error: "No se pudo eliminar: el usuario tiene registros protegidos asociados." };
      }
    }),

  // ── Get dashboard stats ──
  stats: adminQuery.query(async () => {
    const db = getDb();

    const { us: allUsers, subs: subRows, pays: payRows, until } = await loadPeople(db);
    const totalUsers = allUsers.length;
    const blockedUsers = allUsers.filter((u) => (u.role as string) === "blocked").length;
    const adminUsers = allUsers.filter((u) => u.role === "admin").length;

    // Paying now (the same rule as the Resumen): no free trials, no canceled, no access given as a gift.
    const statuses = allUsers.map((u) => userStatus(u, subRows, payRows, until.get(u.id) ?? null));
    const payingNow = statuses.filter((st) => st.kind === "paying");
    const activeSubs = payingNow.length;
    const monthlySubs = payingNow.filter((st) => st.kind === "paying" && st.plan === "monthly").length;
    const annualSubs = payingNow.filter((st) => st.kind === "paying" && st.plan === "annual").length;

    const bankAccountsCount = await db.select({ count: sql<number>`COUNT(*)` }).from(bankAccounts);

    // Revenue from payments.
    // Partimos de una BASE fija ($495): los pagos historicos de prueba (anteriores
    // al corte) no cuentan. Desde REVENUE_SINCE se suman los pagos reales nuevos, y
    // como el panel refresca en vivo (polling 5s) el total sube en tiempo real con
    // cada suscripcion nueva.
    const REVENUE_BASELINE = 0;
    const REVENUE_SINCE = new Date("2026-07-23T00:00:00Z");
    const allPayments = await db.select().from(subscriptionPayments);
    const totalRevenue = REVENUE_BASELINE + allPayments
      .filter((p) => p.status === "succeeded" && p.paidAt && new Date(p.paidAt) >= REVENUE_SINCE)
      .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

    // Payouts (withdrawals) — auto-migration if table doesn't exist yet
    let totalPayouts = 0;
    try {
      const allPayouts = await db.select().from(payouts);
      totalPayouts = allPayouts.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
    } catch { /* table may not exist yet — ignore */ }

    const available = Math.max(0, totalRevenue - totalPayouts);

    return {
      totalUsers,
      blockedUsers,
      adminUsers,
      activeSubscriptions: activeSubs,
      monthlySubscriptions: monthlySubs,
      annualSubscriptions: annualSubs,
      totalBankAccounts: bankAccountsCount[0]?.count || 0,
      totalRevenue: totalRevenue.toFixed(2),
      totalPayouts: totalPayouts.toFixed(2),
      available: available.toFixed(2),
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

      // User info + subscription (para el encabezado de la pagina)
      const urows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const u = urows[0];
      const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
      const sub = subRows[0];
      const user = u ? {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        modePreference: u.modePreference,
        createdAt: u.createdAt,
        isBlocked: u.role === "blocked",
        isAdmin: u.role === "admin",
        subscription: sub ? { plan: sub.plan, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd } : null,
      } : null;

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

      // Get subscription payments (para ver cuando pago la suscripcion)
      const subPayments = await db.select().from(subscriptionPayments)
        .where(eq(subscriptionPayments.userId, userId))
        .orderBy(desc(subscriptionPayments.paidAt))
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
        ...subPayments.map((p) => ({
          type: "subscription" as const,
          description: `Pago suscripcion ${p.plan === "annual" ? "Anual" : "Mensual"}${p.status !== "succeeded" ? ` (${p.status})` : ""}`,
          amount: p.amount,
          date: p.paidAt,
          category: p.status,
        })),
      ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
       .slice(0, 30);

      return { user, activities };
    }),

  // ── Payment history (para el detalle de "Ingresos totales") ──
  paymentHistory: adminQuery.query(async () => {
    const db = getDb();
    const pays = await db.select().from(subscriptionPayments)
      .orderBy(desc(subscriptionPayments.paidAt))
      .limit(200);

    // Map user info in one pass
    const allUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
    const userMap = new Map<number, { name: string | null; email: string | null }>();
    for (const u of allUsers) userMap.set(u.id, { name: u.name, email: u.email });

    return pays.map((p) => ({
      id: p.id,
      userName: userMap.get(p.userId)?.name ?? null,
      userEmail: userMap.get(p.userId)?.email ?? null,
      amount: p.amount,
      plan: p.plan,
      status: p.status,
      paidAt: p.paidAt,
      receiptUrl: p.receiptUrl,
    }));
  }),

  // ── Registrar un pago manualmente ──
  recordPayment: adminQuery
    .input(z.object({
      userId: z.number(),
      amount: z.number().positive(),
      plan: z.enum(["monthly", "annual"]).default("monthly"),
      paidAt: z.string().optional(), // ISO date (yyyy-mm-dd)
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(subscriptionPayments).values({
        userId: input.userId,
        amount: input.amount.toFixed(2),
        plan: input.plan,
        status: "succeeded",
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      });
      return { success: true, message: "Pago registrado" };
    }),

  // ── Editar un pago (monto y/o fecha) ──
  updatePayment: adminQuery
    .input(z.object({
      id: z.number(),
      amount: z.number().positive().optional(),
      paidAt: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!(await canEditPayment(db, input.id))) return { success: false, error: "Ese pago lo cobró Stripe o es un regalo: no se edita" };
      const set: any = {};
      if (input.amount != null) set.amount = input.amount.toFixed(2);
      if (input.paidAt) set.paidAt = new Date(input.paidAt);
      if (Object.keys(set).length === 0) return { success: false, error: "Nada que actualizar" };
      await db.update(subscriptionPayments).set(set).where(eq(subscriptionPayments.id, input.id));
      return { success: true, message: "Pago actualizado" };
    }),

  // ── Eliminar un pago ──
  deletePayment: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!(await canEditPayment(db, input.id))) return { success: false, error: "Ese pago lo cobró Stripe o es un regalo: no se borra" };
      await db.delete(subscriptionPayments).where(eq(subscriptionPayments.id, input.id));
      return { success: true, message: "Pago eliminado" };
    }),

  // ── Maintenance mode: on/off, the admin's message (optional) and when it's expected back (optional) ──
  toggleMaintenance: adminQuery
    .input(z.object({
      enabled: z.boolean(),
      message: z.string().max(300).nullable().optional(),
      minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const state = await writeMaintenance(getDb(), input);
      return { success: true, ...state };
    }),

  // ── Create a payout (withdrawal) ──
  createPayout: adminQuery
    .input(z.object({
      amount: z.number().positive(),
      method: z.string().min(1),
      destination: z.string().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Verify there are sufficient funds
      const allPayments = await db.select().from(subscriptionPayments);
      const totalRevenue = allPayments
        .filter((p) => p.status === "succeeded")
        .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

      let totalPayouts = 0;
      try {
        const allPayouts = await db.select().from(payouts);
        totalPayouts = allPayouts.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
      } catch { /* table may not exist yet */ }

      const available = Math.max(0, totalRevenue - totalPayouts);
      if (input.amount > available) {
        return { success: false, error: `Fondos insuficientes. Disponible: $${available.toFixed(2)}` };
      }

      await db.insert(payouts).values({
        amount: String(input.amount.toFixed(2)),
        method: input.method,
        destination: input.destination || null,
        note: input.note || null,
      });

      return { success: true, message: `Retiro de $${input.amount.toFixed(2)} registrado` };
    }),

  // ── List all payouts ──
  listPayouts: adminQuery.query(async () => {
    const db = getDb();
    try {
      return await db.select().from(payouts).orderBy(desc(payouts.createdAt));
    } catch { return []; }
  }),

  // ── Delete a payout (if needed) ──
  deletePayout: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(payouts).where(eq(payouts.id, input.id));
      return { success: true, message: "Retiro eliminado" };
    }),

  // ── Maintenance status (public: the customer's screen asks for it) ──
  maintenanceStatus: publicQuery.query(async () => readMaintenance(getDb())),
});
