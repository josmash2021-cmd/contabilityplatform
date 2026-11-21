// ── Proveedores y facturas por pagar (business Pro and Negocio) ──
// These tables are created on first use by api/vendors-router.ts (CREATE TABLE IF NOT EXISTS),
// so they stay out of db/schema.ts and the drizzle-kit migrations. Keep both definitions in step.
import { bigint, boolean, date, decimal, index, mysqlEnum, mysqlTable, serial, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const vendors = mysqlTable("vendors", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  notes: text("notes"),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("vendors_userId_idx").on(table.userId),
]);

export const bills = mysqlTable("bills", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  vendorId: bigint("vendorId", { mode: "number", unsigned: true }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  // Calendar days, not instants: read them with DATE_FORMAT(col, '%Y-%m-%d') so no time zone shifts them.
  dueDate: date("dueDate", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["unpaid", "paid"]).default("unpaid").notNull(),
  /** The day it was paid (the expense carries the same date). */
  paidAt: date("paidAt", { mode: "string" }),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "zelle", "card"]),
  /** The expense recorded when it was paid (expenses.id). */
  expenseId: bigint("expenseId", { mode: "number", unsigned: true }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("bills_user_status_due_idx").on(table.userId, table.status, table.dueDate),
  index("bills_vendorId_idx").on(table.vendorId),
]);

export type Vendor = typeof vendors.$inferSelect;
export type Bill = typeof bills.$inferSelect;
