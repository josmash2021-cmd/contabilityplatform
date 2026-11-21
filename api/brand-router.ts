// ── Original logos (brand.*) ──
// Banks and merchants show their real logos. This router lists the user's bank connections with the
// institution's original logo from Plaid and the connection's health (api/lib/bankInstitutions.ts).
// Merchant logos travel on the bank rows themselves (`logoUrl`, api/lib/merchantLogos.ts).
// Team access (api/lib/team.ts): it's a query, so the accountant may read it; it works on ctx.user, which
// for a member is already the owner (api/context.ts).
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { initPlaid } from "./bank-router";
import { listInstitutions, type Institution, type PlaidLike } from "./lib/bankInstitutions";

export const brandRouter = createRouter({
  /**
   * The caller's bank connections (one per Plaid item): institution name, Plaid's logo as a data URL,
   * Plaid's primary color, the app's account ids under it, and the health from the last Plaid calls.
   */
  institutions: authedQuery.query(async ({ ctx }): Promise<Institution[]> => {
    const db = getDb();
    let client: PlaidLike | null = null;
    try {
      client = ((await initPlaid()) as PlaidLike | null) ?? null;
    } catch {
      client = null;
    }
    try {
      return await listInstitutions(db, client, Number(ctx.user.id));
    } catch (e: unknown) {
      console.error("[brand.institutions] failed:", e instanceof Error ? e.message : e);
      throw e;
    }
  }),
});
