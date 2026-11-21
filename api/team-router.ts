// ── Equipo (Negocio plan): up to 10 users plus the accountant ──
// The owner invites people by link. Each person keeps their own login; while they
// are on the team, the server works on the owner's data with their role's limits
// (api/context.ts swaps the user, api/middleware.ts enforces api/lib/team.ts).
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { companySettings, users } from "@db/schema";
import { teamInvites, teamMembers } from "@db/teamSchema";
import { requireFeature } from "./lib/planAccess";
import { TEAM_STAFF_SEATS, type TeamRole } from "./lib/team";
import { teamTablesExist } from "./lib/teamContext";
import { companyLogoDataUrl } from "./settings-router";
import type { Lang } from "./lib/i18n";

type Db = ReturnType<typeof getDb>;
const INVITE_DAYS = 7;

const M = {
  es: {
    seats: "Ya usaste los lugares de tu plan (10 usuarios). Quita a alguien para invitar a otra persona.",
    oneAccountant: "Ya tienes un contador en tu equipo.",
    already: "Esa persona ya está en tu equipo.",
    badInvite: "Esta invitación no es válida o ya venció. Pide una nueva.",
    wrongEmail: "Esta invitación es para otro correo. Entra con el correo que te invitaron.",
    ownTeam: "No puedes unirte a tu propio equipo.",
    otherTeam: "Ya perteneces a otro equipo. Sal de ese equipo primero.",
    notFound: "No lo encontramos.",
  },
  en: {
    seats: "You've used your plan's seats (10 users). Remove someone to invite another person.",
    oneAccountant: "You already have an accountant on your team.",
    already: "That person is already on your team.",
    badInvite: "This invitation isn't valid or has expired. Ask for a new one.",
    wrongEmail: "This invitation is for another email. Log in with the email you were invited with.",
    ownTeam: "You can't join your own team.",
    otherTeam: "You already belong to another team. Leave that team first.",
    notFound: "We couldn't find it.",
  },
} as const;
const fail = (lang: Lang, key: keyof (typeof M)["es"], code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" = "BAD_REQUEST") =>
  new TRPCError({ code, message: M[lang][key] });

let tablesReady: Promise<void> | null = null;
export function ensureTeamTables(db: Db): Promise<void> {
  tablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS teamMembers (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        ownerId BIGINT UNSIGNED NOT NULL,
        memberUserId BIGINT UNSIGNED NOT NULL,
        role ENUM('staff', 'accountant') NOT NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE INDEX teamMembers_member (memberUserId),
        INDEX teamMembers_owner (ownerId)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS teamInvites (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        ownerId BIGINT UNSIGNED NOT NULL,
        email VARCHAR(320) NOT NULL,
        role ENUM('staff', 'accountant') NOT NULL,
        tokenHash CHAR(64) NOT NULL,
        expiresAt TIMESTAMP NOT NULL,
        acceptedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE INDEX teamInvites_token (tokenHash),
        INDEX teamInvites_owner (ownerId)
      )
    `);
    // The invited person's name (optional), for the list and the message. Additive; "duplicate column" means it's there.
    try {
      await db.execute(sql`ALTER TABLE teamInvites ADD COLUMN name VARCHAR(255) NULL`);
    } catch (e: unknown) {
      if (!isDuplicateColumn(e)) throw e;
    }
    teamTablesExist();
  })().catch((e) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

function isDuplicateColumn(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
    const err = cur as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (err.code === "ER_DUP_FIELDNAME" || err.errno === 1060) return true;
    if (typeof err.message === "string" && /Duplicate column/i.test(err.message)) return true;
    cur = err.cause;
  }
  return false;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const norm = (email: string) => email.trim().toLowerCase();

function appUrl() {
  return process.env.APP_URL || "https://aethelaccountingplatform.com";
}

/** What happened on the team, newest first: invitations, people joining, last time each one came in. */
export type TeamActivity = { kind: "invited" | "joined" | "signedIn"; at: Date; name: string | null; email: string | null; role: TeamRole };

/** The owner's team: members with their names and last sign-in, open invitations, seats and recent activity. */
async function teamOf(db: Db, ownerId: number) {
  type Member = { id: number; userId: number; role: TeamRole; name: string | null; email: string | null; createdAt: Date; lastSignInAt: Date | null };
  const members: Member[] = await db.select({ id: teamMembers.id, userId: teamMembers.memberUserId, role: teamMembers.role, name: users.name, email: users.email, createdAt: teamMembers.createdAt, lastSignInAt: users.lastSignInAt })
    .from(teamMembers).leftJoin(users, eq(users.id, teamMembers.memberUserId)).where(eq(teamMembers.ownerId, ownerId));
  type InviteRow = { id: number; email: string; role: TeamRole; name: string | null; expiresAt: Date; createdAt: Date; acceptedAt: Date | null };
  const all = (await db.execute(sql`
    SELECT id, email, role, name, expiresAt, createdAt, acceptedAt FROM teamInvites
    WHERE ownerId = ${ownerId} ORDER BY id DESC LIMIT 100`) as unknown as [InviteRow[]])[0];
  const now = Date.now();
  const invites = all.filter((i) => !i.acceptedAt && new Date(i.expiresAt).getTime() > now)
    .map((i) => ({ id: Number(i.id), email: i.email, role: i.role, name: i.name ?? null, expiresAt: i.expiresAt, createdAt: i.createdAt }));
  const staffUsed = members.filter((m) => m.role === "staff").length + invites.filter((i) => i.role === "staff").length;
  const accountantUsed = members.some((m) => m.role === "accountant") || invites.some((i) => i.role === "accountant");

  const byEmail = new Map(members.map((m) => [norm(m.email ?? ""), m]));
  const activity: TeamActivity[] = [];
  for (const i of all) {
    const m = byEmail.get(norm(i.email));
    activity.push({ kind: "invited", at: i.createdAt, name: i.name ?? m?.name ?? null, email: i.email, role: i.role });
    if (i.acceptedAt) activity.push({ kind: "joined", at: i.acceptedAt, name: m?.name ?? i.name ?? null, email: i.email, role: m?.role ?? i.role });
  }
  for (const m of members) {
    // Someone who joined without an invitation row left (older data): their joining date still shows.
    if (!all.some((i) => i.acceptedAt && norm(i.email) === norm(m.email ?? ""))) activity.push({ kind: "joined", at: m.createdAt, name: m.name, email: m.email, role: m.role });
    // Their last sign-in, if it came after they joined (a sign-in before that was in their own account).
    if (m.lastSignInAt && new Date(m.lastSignInAt).getTime() > new Date(m.createdAt).getTime()) activity.push({ kind: "signedIn", at: m.lastSignInAt, name: m.name, email: m.email, role: m.role });
  }
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    members: members.map((m) => ({ ...m, id: Number(m.id), userId: Number(m.userId) })),
    invites, staffSeats: TEAM_STAFF_SEATS, staffUsed, accountantUsed, activity: activity.slice(0, 8),
  };
}

export const teamRouter = createRouter({
  // ── Owner ──
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    await requireFeature(db, ctx.user, "team", ctx.lang);
    await ensureTeamTables(db);
    return teamOf(db, Number(ctx.user.id));
  }),

  invite: authedQuery
    .input(z.object({ email: z.string().trim().email().max(320), role: z.enum(["staff", "accountant"]), name: z.string().trim().max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "team", ctx.lang);
      await ensureTeamTables(db);
      const ownerId = Number(ctx.user.id);
      const email = norm(input.email);
      if (email === norm(ctx.user.email ?? "")) throw fail(ctx.lang, "ownTeam");
      const team = await teamOf(db, ownerId);
      if (team.members.some((m) => norm(m.email ?? "") === email)) throw fail(ctx.lang, "already");
      // A new link for someone already invited replaces theirs: their open invitation doesn't count against the seat.
      const open = team.invites.find((i) => norm(i.email) === email);
      const staffUsed = team.staffUsed - (open?.role === "staff" ? 1 : 0);
      const accountantTaken = team.members.some((m) => m.role === "accountant") || team.invites.some((i) => i.role === "accountant" && norm(i.email) !== email);
      if (input.role === "staff" && staffUsed >= TEAM_STAFF_SEATS) throw fail(ctx.lang, "seats", "FORBIDDEN");
      if (input.role === "accountant" && accountantTaken) throw fail(ctx.lang, "oneAccountant", "FORBIDDEN");
      // A new link replaces any open invitation for the same email.
      await db.delete(teamInvites).where(and(eq(teamInvites.ownerId, ownerId), eq(teamInvites.email, email), isNull(teamInvites.acceptedAt)));
      const token = randomBytes(24).toString("base64url");
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
      await db.insert(teamInvites).values({ ownerId, email, role: input.role, tokenHash, expiresAt });
      const name = input.name?.trim() || null;
      if (name) await db.execute(sql`UPDATE teamInvites SET name = ${name} WHERE tokenHash = ${tokenHash}`);
      return { link: `${appUrl()}/join?invite=${token}`, expiresInDays: INVITE_DAYS, expiresAt, email, role: input.role, name };
    }),

  revokeInvite: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await requireFeature(db, ctx.user, "team", ctx.lang);
    await ensureTeamTables(db);
    await db.delete(teamInvites).where(and(eq(teamInvites.id, input.id), eq(teamInvites.ownerId, Number(ctx.user.id))));
    return { ok: true };
  }),

  /** Removing someone takes effect on their next request. They keep their own (empty) account. */
  removeMember: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await ensureTeamTables(db);
    await db.delete(teamMembers).where(and(eq(teamMembers.id, input.id), eq(teamMembers.ownerId, Number(ctx.user.id))));
    return { ok: true };
  }),

  changeRole: authedQuery
    .input(z.object({ id: z.number().int().positive(), role: z.enum(["staff", "accountant"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requireFeature(db, ctx.user, "team", ctx.lang);
      await ensureTeamTables(db);
      const ownerId = Number(ctx.user.id);
      const team = await teamOf(db, ownerId);
      const member = team.members.find((m) => m.id === input.id);
      if (!member) throw fail(ctx.lang, "notFound", "NOT_FOUND");
      if (member.role !== input.role) {
        if (input.role === "accountant" && team.accountantUsed) throw fail(ctx.lang, "oneAccountant", "FORBIDDEN");
        if (input.role === "staff" && team.staffUsed >= TEAM_STAFF_SEATS) throw fail(ctx.lang, "seats", "FORBIDDEN");
        await db.update(teamMembers).set({ role: input.role }).where(and(eq(teamMembers.id, input.id), eq(teamMembers.ownerId, ownerId)));
      }
      return { ok: true };
    }),

  // ── The invited person ──
  /** What an invitation link is for, so the sign-up page can say who invited them. No login needed. */
  invitePreview: publicQuery.input(z.object({ token: z.string().min(10).max(100) })).query(async ({ input }) => {
    const db = getDb();
    await ensureTeamTables(db);
    type Row = { ownerId: number; email: string; role: TeamRole; expiresAt: Date; acceptedAt: Date | null; ownerName: string | null; companyName: string | null };
    const row: Row | undefined = (await db.select({ ownerId: teamInvites.ownerId, email: teamInvites.email, role: teamInvites.role, expiresAt: teamInvites.expiresAt, acceptedAt: teamInvites.acceptedAt, ownerName: users.name, companyName: companySettings.companyName })
      .from(teamInvites).leftJoin(users, eq(users.id, teamInvites.ownerId)).leftJoin(companySettings, eq(companySettings.userId, teamInvites.ownerId))
      .where(eq(teamInvites.tokenHash, hashToken(input.token))).limit(1))[0];
    if (!row || row.acceptedAt || new Date(row.expiresAt) < new Date()) return { valid: false as const };
    // The name they were invited with (to start the sign-up form), and the business's name and logo, as on its invoices.
    const named = (await db.execute(sql`SELECT name FROM teamInvites WHERE tokenHash = ${hashToken(input.token)} LIMIT 1`) as unknown as [Array<{ name: string | null }>])[0][0];
    return {
      valid: true as const, email: row.email, role: row.role, ownerName: row.ownerName, name: named?.name ?? null,
      companyName: row.companyName?.trim() || null, logo: await companyLogoDataUrl(db, Number(row.ownerId)), expiresAt: row.expiresAt,
    };
  }),

  acceptInvite: authedQuery.input(z.object({ token: z.string().min(10).max(100) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await ensureTeamTables(db);
    const me = ctx.member ? Number(ctx.member.userId) : Number(ctx.user.id);
    if (ctx.member) throw fail(ctx.lang, "otherTeam");
    type Row = { id: number; ownerId: number; email: string; role: TeamRole; expiresAt: Date; acceptedAt: Date | null };
    const inv: Row | undefined = (await db.select().from(teamInvites).where(eq(teamInvites.tokenHash, hashToken(input.token))).limit(1))[0];
    if (!inv || inv.acceptedAt || new Date(inv.expiresAt) < new Date()) throw fail(ctx.lang, "badInvite");
    if (norm(ctx.user.email ?? "") !== norm(inv.email)) throw fail(ctx.lang, "wrongEmail", "FORBIDDEN");
    if (Number(inv.ownerId) === me) throw fail(ctx.lang, "ownTeam");
    if (ctx.user.role === "admin") throw fail(ctx.lang, "otherTeam", "FORBIDDEN");
    const existing = (await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.memberUserId, me)).limit(1))[0];
    if (existing) throw fail(ctx.lang, "otherTeam");
    await db.insert(teamMembers).values({ ownerId: inv.ownerId, memberUserId: me, role: inv.role });
    await db.update(teamInvites).set({ acceptedAt: new Date() }).where(eq(teamInvites.id, inv.id));
    return { ok: true };
  }),

  /** For a member: whose team they're on and their role. Null for everyone else. */
  myMembership: authedQuery.query(({ ctx }) => {
    if (!ctx.member) return null;
    return { role: ctx.member.role, ownerName: ctx.user.name ?? null, memberName: ctx.member.name, memberEmail: ctx.member.email };
  }),

  leave: authedQuery.mutation(async ({ ctx }) => {
    if (!ctx.member) return { ok: true };
    const db = getDb();
    await db.delete(teamMembers).where(eq(teamMembers.memberUserId, Number(ctx.member.userId)));
    return { ok: true };
  }),
});
