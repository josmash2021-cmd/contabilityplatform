// ── Facturas (every business plan) ──
// An invoice is a bill to a client. Once issued it IS a sale (status "pending" while unpaid,
// "completed" once paid); these tables add what a sale doesn't have: the due date and terms,
// the sent / reminder history, partial payments and refunds, and the reminder settings.
// A draft has no sale yet: its lines are kept here as JSON until it's issued.
// The tables are created on first use (ensureInvoicesTables in api/invoices-router.ts);
// keep the CREATE TABLE statements there in step with these definitions.
import {
  mysqlTable, mysqlEnum, serial, varchar, text, timestamp, int, decimal, bigint, boolean, date, json, index, uniqueIndex,
} from "drizzle-orm/mysql-core";
import type { RecurringItem } from "./quotesSchema";

/** One line of a draft invoice (same shape as a recurring invoice's lines). */
export type InvoiceDraftItem = RecurringItem;

export const invoices = mysqlTable("invoices", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  /** The sale it is (null while it's a draft). */
  saleId: bigint("saleId", { mode: "number", unsigned: true }),
  /** Where it came from: made here, from a quote, from a recurring invoice, or an earlier pending sale. */
  source: mysqlEnum("source", ["invoice", "quote", "recurring", "sale"]).default("invoice").notNull(),
  quoteId: bigint("quoteId", { mode: "number", unsigned: true }),
  // Draft contents (once issued, the sale's lines and totals are the truth).
  customerId: bigint("customerId", { mode: "number", unsigned: true }),
  customerName: varchar("customerName", { length: 255 }),
  items: json("items").$type<InvoiceDraftItem[]>(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  /** The total it was issued for (kept when a write-off lowers the sale to what was collected). */
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  termsDays: int("termsDays").default(14).notNull(),
  issueDate: date("issueDate", { mode: "string" }),
  dueDate: date("dueDate", { mode: "string" }),
  sentAt: timestamp("sentAt"),
  lastReminderOn: date("lastReminderOn", { mode: "string" }),
  voidedAt: timestamp("voidedAt"),
  writtenOffAt: timestamp("writtenOffAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("invoices_saleId_idx").on(table.saleId),
  index("invoices_userId_idx").on(table.userId),
  index("invoices_userId_dueDate_idx").on(table.userId, table.dueDate),
]);

/** Money the client paid on an invoice, or that was given back. Each row has its journal entry. */
export const invoicePayments = mysqlTable("invoicePayments", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  invoiceId: bigint("invoiceId", { mode: "number", unsigned: true }).notNull(),
  saleId: bigint("saleId", { mode: "number", unsigned: true }).notNull(),
  kind: mysqlEnum("kind", ["payment", "refund"]).notNull(),
  method: mysqlEnum("method", ["cash", "zelle", "card"]).notNull(),
  /** Always positive; `kind` says which way the money went. */
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paidOn: date("paidOn", { mode: "string" }).notNull(),
  note: varchar("note", { length: 255 }),
  journalEntryId: bigint("journalEntryId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("invoicePayments_invoiceId_idx").on(table.invoiceId),
  index("invoicePayments_userId_paidOn_idx").on(table.userId, table.paidOn),
]);

/** The invoice's history: created, sent, reminders, payments, refunds, void… */
export const invoiceEvents = mysqlTable("invoiceEvents", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  invoiceId: bigint("invoiceId", { mode: "number", unsigned: true }).notNull(),
  type: mysqlEnum("type", ["created", "draft", "issued", "sent", "reminder", "payment", "refund", "void", "writeoff", "due"]).notNull(),
  /** Details as JSON: amount (cents), method, channel, quote number, due date. */
  detail: json("detail").$type<Record<string, string | number | null>>(),
  at: timestamp("at").defaultNow().notNull(),
}, (table) => [
  index("invoiceEvents_invoiceId_idx").on(table.invoiceId),
  index("invoiceEvents_userId_idx").on(table.userId),
]);

/** Per business: which payment reminders to prepare. */
export const invoiceSettings = mysqlTable("invoiceSettings", {
  userId: bigint("userId", { mode: "number", unsigned: true }).primaryKey(),
  remindBefore: boolean("remindBefore").default(true).notNull(),
  remindOnDue: boolean("remindOnDue").default(true).notNull(),
  remindAfter: boolean("remindAfter").default(true).notNull(),
  remindWeekly: boolean("remindWeekly").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});
