// ── Team access (Pro and Negocio plans): who can call what ──
// A team member logs in with their own account; the server then works on the
// owner's data (see api/context.ts). These rules decide which API procedures
// each role may call. Anything not allowed here is refused.

import { teamSeats, type PlanTier } from "@contracts/planFeatures";

export type TeamRole = "staff" | "accountant";
export type ProcType = "query" | "mutation" | "subscription";

/** Background upkeep the app runs on every page (bank sync, accounting repair). Harmless for any member. */
const UPKEEP = new Set([
  "bank.autoSync", "bank.syncRecent", "bank.syncTransactions", "bank.autoFixCategories", "bank.refreshAllBalances",
  "bank.checkConnection", "accounting.rebuild", "admin.maintenanceStatus",
]);

/** What every member may call: who they are, the plan's state, logging out, their membership. */
const ALWAYS = new Set([
  "auth.me", "auth.logout", "subscription.status", "subscription.planInfo", "subscription.currentTier",
  "team.myMembership", "team.leave", "ping",
]);

/**
 * Never for members: the owner's billing, account, team, tax documents (IDs, Social Security),
 * personal finances, assistant chat, admin and debugging tools.
 */
const NEVER_PREFIXES = ["admin.", "team.", "tax.", "subscription.", "auth.", "setup.", "debug.", "clover.", "personal.", "assistant."];

/** An employee: sells, looks after clients, photographs receipts. Reads only what that needs. */
// Like the prototype's sales role, employees also invoice and collect.
const STAFF_QUERY_PREFIXES = ["sales.", "customers.", "services.", "receipts.", "invoices."];
/** Staff can search too; the search only returns clients, sales and services for them. */
const STAFF_QUERIES = new Set(["settings.get", "search.global"]);
// sales.cashCount.save: counting the drawer at the end of the day (Cobrar → Cierre del día) is part of selling.
/** Voiding, refunding, writing off, due dates and invoice settings stay with the owner. */
const STAFF_MUTATIONS = new Set([
  "sales.create", "sales.cashCount.save", "customers.create", "customers.update", "receipts.create",
  "invoices.create", "invoices.issue", "invoices.pay", "invoices.markSent", "invoices.markReminded",
]);

export function memberCan(role: TeamRole, path: string, type: ProcType): boolean {
  if (ALWAYS.has(path) || UPKEEP.has(path)) return true;
  if (NEVER_PREFIXES.some((p) => path.startsWith(p)) || /\.debug/i.test(path)) return false;
  if (role === "accountant") {
    // Reads everything (except the above); changes nothing.
    return type === "query";
  }
  // staff
  if (type === "query") return STAFF_QUERY_PREFIXES.some((p) => path.startsWith(p)) || STAFF_QUERIES.has(path);
  return STAFF_MUTATIONS.has(path);
}

/** Seats for employees: the plan's users minus the owner (Pro 5 → 4, Negocio 20 → 19). The accountant doesn't take one. */
export function staffSeatsFor(tier: PlanTier | null): number {
  return Math.max(0, teamSeats(tier ?? "business") - 1);
}
