// ── Recibos: receipt photos for business expenses ──
// Kept apart from db/schema.ts on purpose: the table is created on first use by
// api/receipts-router.ts (CREATE TABLE IF NOT EXISTS, see ensureReceiptsTable), so
// drizzle-kit migrations don't need to know about it. Keep both in step.
import { bigint, customType, date, decimal, index, int, mysqlEnum, mysqlTable, serial, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("receipts_userId_date_idx").on(table.userId, table.date),
  index("receipts_userId_createdAt_idx").on(table.userId, table.createdAt),
]);

export type Receipt = typeof receipts.$inferSelect;
