// Works out, for each request, whether the logged-in person is on someone's team.
// If so, the request runs as the team owner (whose data it is) and remembers who the
// member really is, so api/middleware.ts can apply their role's limits.
import { eq } from "drizzle-orm";
import { users, type User } from "@db/schema";
import { teamMembers } from "@db/teamSchema";
import { getDb } from "../queries/connection";
import { contextHas, getPlanContext } from "./planAccess";
import type { TeamRole } from "./team";
import { isMissingTable } from "./dbErrors";

export type TeamMemberCtx = { userId: number; name: string | null; email: string | null; role: TeamRole };

/** Until the team tables exist (nobody used Equipo yet), skip the lookup for a minute at a time. */
let missingUntil = 0;

/** Called once the team tables are created: look memberships up again right away. Otherwise someone who
 * joins a team in the same minute the tables appear would keep working in their own account for that minute. */
export function teamTablesExist(): void {
  missingUntil = 0;
}

export async function resolveMembership(user: User): Promise<{ owner: User; member: TeamMemberCtx } | null> {
  if (Date.now() < missingUntil) return null;
  try {
    const db = getDb();
    type Row = { ownerId: number; role: TeamRole };
    const row: Row | undefined = (await db.select({ ownerId: teamMembers.ownerId, role: teamMembers.role }).from(teamMembers)
      .where(eq(teamMembers.memberUserId, Number(user.id))).limit(1))[0];
    if (!row) return null;
    const owner: User | undefined = (await db.select().from(users).where(eq(users.id, row.ownerId)).limit(1))[0];
    if (!owner) return null;
    // The owner's plan must still include the team (Negocio or the trial).
    if (!contextHas(await getPlanContext(db, owner), "team")) return null;
    return { owner, member: { userId: Number(user.id), name: user.name ?? null, email: user.email ?? null, role: row.role } };
  } catch (e: unknown) {
    if (isMissingTable(e)) missingUntil = Date.now() + 60_000;
    // On any error the person simply acts as themselves (their own account): never more access.
    return null;
  }
}
