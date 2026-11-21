// ── Por revisar: its own tables (created on first use by ensureReviewTables in api/lib/reviewStore.ts) ──
// They stay out of db/schema.ts and the drizzle-kit migrations; keep the CREATE TABLE statements in step.
import { bigint, boolean, decimal, index, int, mysqlEnum, mysqlTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * What the owner did with each movement in Por revisar, and when ("Revisados hoy", "Excluidos").
 * One row per movement; undo deletes it and puts back the category it had before (prevCategory/prevType).
 */
export const bankReviewLog = mysqlTable("bankReviewLog", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  bankTransactionId: bigint("bankTransactionId", { mode: "number", unsigned: true }).notNull(),
  action: mysqlEnum("action", ["approved", "changed", "answered", "bulk", "linked", "split", "excluded"]).notNull(),
  /** Only for "excluded". */
  reason: mysqlEnum("reason", ["duplicate", "transfer", "other"]),
  /** The other leg of a transfer, or the movement a duplicate repeats. */
  relatedId: bigint("relatedId", { mode: "number", unsigned: true }),
  prevCategory: varchar("prevCategory", { length: 40 }),
  prevType: mysqlEnum("prevType", ["income", "expense"]),
  reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("bankReviewLog_tx_idx").on(t.bankTransactionId),
  index("bankReviewLog_user_at_idx").on(t.userId, t.reviewedAt),
  index("bankReviewLog_user_action_idx").on(t.userId, t.action),
]);

/**
 * "Vincular" and "No es esto": a bank movement linked to (or turned down for) a pending sale, a cash sale
 * it deposited, or a vendor bill. A sale or bill is linked at most once (checked when linking).
 */
export const bankReviewMatches = mysqlTable("bankReviewMatches", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  bankTransactionId: bigint("bankTransactionId", { mode: "number", unsigned: true }).notNull(),
  targetType: mysqlEnum("targetType", ["sale", "cash", "bill"]).notNull(),
  targetId: bigint("targetId", { mode: "number", unsigned: true }).notNull(),
  status: mysqlEnum("status", ["linked", "dismissed"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("bankReviewMatches_tx_target_idx").on(t.bankTransactionId, t.targetType, t.targetId),
  index("bankReviewMatches_user_idx").on(t.userId, t.targetType, t.status),
]);

/**
 * "Dividir": the parts of one bank movement. The movement itself keeps its full amount (and its largest
 * business part as its category), so sums over bankTransactions count it once; reports that break money
 * down by category read the parts instead (categoryTotals in api/lib/reviewEngine.ts).
 */
export const bankTransactionSplits = mysqlTable("bankTransactionSplits", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  bankTransactionId: bigint("bankTransactionId", { mode: "number", unsigned: true }).notNull(),
  position: int("position").notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  /** The personal part: not a business expense. */
  personal: boolean("personal").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("bankTransactionSplits_tx_idx").on(t.bankTransactionId),
  index("bankTransactionSplits_user_idx").on(t.userId),
]);
