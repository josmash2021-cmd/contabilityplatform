// What each team role can do, worked out from the server's real rules (api/lib/team.ts → memberCan),
// and which sections of the menu each role sees. STAFF_PATHS / ACCOUNTANT_HIDDEN / BUSINESS_MENU copy
// AppLayout's lists (so "Ver como" shows what a real member sees); AppLayout can import them from here.
// Pure: no React, no browser APIs (tested in api/lib/teamRoles.test.ts).
import { memberCan, type TeamRole } from "../../../api/lib/team";

export type { TeamRole };
/** The columns of the permissions table: the owner plus the two roles a member can have. */
export type PermColumn = "owner" | TeamRole;
export const PERM_COLUMNS: PermColumn[] = ["owner", "accountant", "staff"];

/** ✓ = sees and changes · read = sees only ("solo ver") · none = can't open it. */
export type PermLevel = "full" | "read" | "none";

export type PermKey = "sales" | "invoices" | "quotes" | "customers" | "receipts" | "vendors" | "bank" | "reports" | "taxes" | "assistant" | "admin";

/**
 * Each row is a part of the app, with one API procedure that reads it and one that changes it.
 * Those are the calls the screens make, so the table says exactly what the server lets each role do.
 */
export const PERM_ROWS: ReadonlyArray<{ key: PermKey; read: string; write: string | null }> = [
  { key: "sales", read: "sales.list", write: "sales.create" },
  { key: "invoices", read: "invoices.list", write: "invoices.create" },
  { key: "quotes", read: "quotes.list", write: "quotes.create" },
  { key: "customers", read: "customers.list", write: "customers.create" },
  { key: "receipts", read: "receipts.list", write: "receipts.create" },
  { key: "vendors", read: "vendors.list", write: "vendors.bills.create" },
  { key: "bank", read: "bank.listAccounts", write: "review.confirm" },
  { key: "reports", read: "reports.incomeStatement", write: null },
  { key: "taxes", read: "tax.current", write: "tax.upload" },
  { key: "assistant", read: "assistant.status", write: "assistant.ask" },
  { key: "admin", read: "team.list", write: "settings.update" },
];

/** What one column can do in one row. The owner can do everything. */
export function permLevel(column: PermColumn, row: { read: string; write: string | null }): PermLevel {
  if (column === "owner") return "full";
  const canRead = memberCan(column, row.read, "query");
  const canWrite = row.write !== null && memberCan(column, row.write, "mutation");
  if (canWrite) return "full";
  if (canRead) return row.write === null ? "full" : "read";
  return "none";
}

/** The whole table: one row per part of the app, one level per column. */
export function permTable(): Array<{ key: PermKey; levels: Record<PermColumn, PermLevel> }> {
  return PERM_ROWS.map((r) => ({
    key: r.key,
    levels: { owner: permLevel("owner", r), accountant: permLevel("accountant", r), staff: permLevel("staff", r) },
  }));
}

// ── Menu sections each role sees (kept in step with AppLayout's member rules) ──

/** An employee: takes payments, invoices, serves clients, photographs receipts (Gastos shows them only that). */
export const STAFF_PATHS: ReadonlySet<string> = new Set(["/pos", "/invoices", "/customers", "/receipts", "/expenses"]);
/** The accountant reads the books; these are the owner's alone. */
export const ACCOUNTANT_HIDDEN: ReadonlySet<string> = new Set(["/taxes", "/assistant", "/team", "/settings"]);
/** Where each role lands. */
export const ROLE_HOME: Record<TeamRole, string> = { staff: "/pos", accountant: "/" };

/** True when that role sees this menu section (business mode). */
export function roleSeesPath(role: TeamRole, path: string): boolean {
  return role === "staff" ? STAFF_PATHS.has(path) : !ACCOUNTANT_HIDDEN.has(path);
}

/** The business menu, in order (same sections and order as AppLayout's BUSINESS_GROUPS). */
export const BUSINESS_MENU: ReadonlyArray<{ group: "" | "sales" | "spend" | "money" | "general"; paths: string[] }> = [
  { group: "", paths: ["/", "/transactions"] },
  { group: "sales", paths: ["/pos", "/invoices", "/quotes", "/customers", "/services"] },
  { group: "spend", paths: ["/expenses", "/vendors"] },
  { group: "money", paths: ["/bank", "/reports", "/accountant", "/taxes"] },
  { group: "general", paths: ["/assistant", "/team", "/settings"] },
];

/** The menu that role sees: the same groups, only the sections it can open. */
export function roleMenu(role: TeamRole): Array<{ group: "" | "sales" | "spend" | "money" | "general"; paths: string[] }> {
  return BUSINESS_MENU.map((g) => ({ group: g.group, paths: g.paths.filter((p) => roleSeesPath(role, p)) })).filter((g) => g.paths.length > 0);
}
