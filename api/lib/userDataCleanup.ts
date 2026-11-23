// When an account is deleted: remove its rows from every table the app creates on first use.
// Those tables are made with plain SQL and have no foreign key to `users`, so nothing cascades.
// A table that doesn't exist yet (nobody used that feature) is simply skipped.
import { sql } from "drizzle-orm";
import { isMissingTable } from "./dbErrors";

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

/** Table → the columns that point at a user. A row matching any of them goes. */
export const USER_TABLES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["assistantMessages", ["userId"]],
  ["assistantChats", ["userId"]],
  ["assistantPrefs", ["userId"]],
  ["taxAccessCodes", ["userId"]],
  ["taxUnlocks", ["userId"]],
  ["taxSignatures", ["userId"]],
  ["taxIdChecks", ["userId"]],
  ["bankReviewLog", ["userId"]],
  ["bankReviewMatches", ["userId"]],
  ["bankTransactionSplits", ["userId"]],
  ["expenseBankLinks", ["userId"]],
  ["expenseLimits", ["userId"]],
  ["personalBudgetMonths", ["userId"]],
  ["personalGoalDeposits", ["userId"]],
  ["personalGoalPlans", ["userId"]],
  ["personalManualSubs", ["userId"]],
  ["personalSubPrefs", ["userId"]],
  ["personalSubStates", ["userId"]],
  ["serviceExtras", ["userId"]],
  ["companyLogos", ["userId"]],
  ["cashCounts", ["userId"]],
  ["noticeReads", ["userId"]],
  ["bankInstitutions", ["userId"]],
  // The team: invitations they sent, and memberships as owner or as member.
  ["teamInvites", ["ownerId"]],
  ["teamMembers", ["ownerId", "memberUserId"]],
];

/** Deletes the user's rows in every first-use table. Returns how many tables were cleaned. */
export async function deleteUserFirstUseData(db: Db, userId: number): Promise<number> {
  let cleaned = 0;
  for (const [table, cols] of USER_TABLES) {
    const where = sql.join(cols.map((c) => sql`${sql.identifier(c)} = ${userId}`), sql` OR `);
    try {
      await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE ${where}`);
      cleaned++;
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }
  }
  return cleaned;
}
