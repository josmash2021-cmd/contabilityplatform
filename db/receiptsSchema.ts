// ── Recibos: receipt photos for business expenses ──
// Kept apart from db/schema.ts on purpose: the table is created on first use by
// api/receipts-router.ts (CREATE TABLE IF NOT EXISTS, see ensureReceiptsTable), so
// drizzle-kit migrations don't need to know about it. Keep both in step.
import { bigint, boolean, customType, date, decimal, index, int, mysqlEnum, mysqlTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Encrypted file bytes (api/lib/taxCrypto.ts), up to 4 GB. */
const longblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "longblob";
  },
});

/** Encrypted preview bytes, up to 16 MB (in practice a few KB). */
const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "mediumblob";
  },
});

export const receipts = mysqlTable("receipts", {
  id: serial("id").primaryKey(),
  /** The business owner (for a team member, the owner whose books they work on). */
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  /** The expense this receipt created (its `receipt` column holds this receipt's id). */
  expenseId: bigint("expenseId", { mode: "number", unsigned: true }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  size: int("size").notNull(),
  data: longblob("data").notNull(),
  /** Small JPEG preview made by the phone; null for PDFs or photos the browser couldn't read (HEIC). */
  thumb: mediumblob("thumb"),
  merchant: varchar("merchant", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  /** "YYYY-MM-DD": string mode so no time zone moves the day. */
  date: date("date", { mode: "string" }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "zelle", "card"]).notNull(),
  notes: text("notes"),
  /**
   * True when the photo was added to an expense that already existed (a cash expense or a paid bill in Gastos →
   * "Subir recibo"): that expense isn't the receipt's own, so editing the receipt doesn't change it and removing the
   * receipt only removes the photo. Added by ensureReceiptsTable on older databases.
   */
  attached: boolean("attached").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("receipts_userId_date_idx").on(table.userId, table.date),
  index("receipts_userId_createdAt_idx").on(table.userId, table.createdAt),
]);

export type Receipt = typeof receipts.$inferSelect;

// ── Gastos (api/expenses-router.ts): also created on first use, there. Keep both in step ──

/** "Límites del mes": a monthly ceiling per Gastos category (api/lib/expenses.ts SPEND_CATEGORIES). */
export const expenseLimits = mysqlTable("expenseLimits", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("expenseLimits_user_category_idx").on(table.userId, table.category),
]);

/**
 * An expense and the bank movement that is the same money (api/lib/expenses.ts, rule 2):
 * "linked" when the owner joined them (a receipt photo added to a bank charge), "dismissed" when
 * they said an automatic match was wrong ("No es el mismo cargo").
 */
export const expenseBankLinks = mysqlTable("expenseBankLinks", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  expenseId: bigint("expenseId", { mode: "number", unsigned: true }).notNull(),
  bankTransactionId: bigint("bankTransactionId", { mode: "number", unsigned: true }).notNull(),
  status: mysqlEnum("status", ["linked", "dismissed"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("expenseBankLinks_pair_idx").on(table.expenseId, table.bankTransactionId),
  index("expenseBankLinks_user_idx").on(table.userId),
  index("expenseBankLinks_tx_idx").on(table.bankTransactionId),
]);

export type ExpenseLimit = typeof expenseLimits.$inferSelect;
export type ExpenseBankLink = typeof expenseBankLinks.$inferSelect;
