// ── Cotizaciones y facturas recurrentes (business Pro and Negocio) ──
// The tables are created on first use (ensureQuotesTables in api/quotes-router.ts);
// keep the CREATE TABLE statements there in step with these definitions.
import {
  mysqlTable, mysqlEnum, serial, varchar, text, timestamp, int, decimal, bigint, boolean, date, json, index, uniqueIndex,
} from "drizzle-orm/mysql-core";

/** One line of a recurring invoice, stored as JSON. */
export type RecurringItem = {
  serviceId: number | null;
  description: string;
  quantity: number;
  /** Dollars as a decimal string ("120.00"). */
  unitPrice: string;
};

export const quotes = mysqlTable("quotes", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  /** The user's own running number; `number` is its label ("COT-0007"). */
  seq: int("seq").notNull(),
  number: varchar("number", { length: 30 }).notNull(),
  customerId: bigint("customerId", { mode: "number", unsigned: true }),
  customerName: varchar("customerName", { length: 255 }),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "rejected", "converted"]).default("draft").notNull(),
  validUntil: date("validUntil", { mode: "string" }),
  notes: text("notes"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  /** The sale it became (status "converted"). */
  saleId: bigint("saleId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("quotes_userId_seq_idx").on(table.userId, table.seq),
  index("quotes_userId_status_idx").on(table.userId, table.status),
  index("quotes_saleId_idx").on(table.saleId),
]);

export const quoteItems = mysqlTable("quoteItems", {
  id: serial("id").primaryKey(),
  quoteId: bigint("quoteId", { mode: "number", unsigned: true }).notNull(),
  /** From the services catalog; null for a free-text line. */
  serviceId: bigint("serviceId", { mode: "number", unsigned: true }),
  description: varchar("description", { length: 255 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  position: int("position").default(0).notNull(),
}, (table) => [
  index("quoteItems_quoteId_idx").on(table.quoteId),
]);

export const recurringInvoices = mysqlTable("recurringInvoices", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  customerId: bigint("customerId", { mode: "number", unsigned: true }),
  customerName: varchar("customerName", { length: 255 }),
  items: json("items").$type<RecurringItem[]>().notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  frequency: mysqlEnum("frequency", ["weekly", "monthly", "quarterly", "yearly"]).notNull(),
  /** First invoice date: its day of the month anchors the schedule (the 31st stays the 31st). */
  startDate: date("startDate", { mode: "string" }).notNull(),
  /** The next period not invoiced yet. */
  nextDate: date("nextDate", { mode: "string" }).notNull(),
  /** Last day an invoice may fall on; null = no end. */
  endDate: date("endDate", { mode: "string" }),
  /** False while paused. */
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("recurringInvoices_userId_idx").on(table.userId),
  index("recurringInvoices_active_nextDate_idx").on(table.active, table.nextDate),
]);

/** One row per invoiced period: the unique key makes sure a period is never invoiced twice. */
export const recurringInvoiceRuns = mysqlTable("recurringInvoiceRuns", {
  id: serial("id").primaryKey(),
  recurringId: bigint("recurringId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  periodDate: date("periodDate", { mode: "string" }).notNull(),
  saleId: bigint("saleId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("recurringInvoiceRuns_period_idx").on(table.recurringId, table.periodDate),
  index("recurringInvoiceRuns_userId_idx").on(table.userId),
  index("recurringInvoiceRuns_saleId_idx").on(table.saleId),
]);
