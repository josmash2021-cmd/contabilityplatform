// Drizzle views of the logo tables (created on first use by api/lib/brandTables.ts, not by migrations).
import { bigint, mediumtext, mysqlTable, serial, timestamp, varchar } from "drizzle-orm/mysql-core";

export const bankInstitutionsTable = mysqlTable("bankInstitutions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  itemId: varchar("itemId", { length: 255 }).notNull(),
  institutionId: varchar("institutionId", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  logo: mediumtext("logo"),
  color: varchar("color", { length: 16 }),
  status: varchar("status", { length: 20 }).notNull().default("ok"),
  errorCode: varchar("errorCode", { length: 64 }),
  lastSuccessAt: timestamp("lastSuccessAt"),
  lastErrorAt: timestamp("lastErrorAt"),
  metaFetchedAt: timestamp("metaFetchedAt"),
  /** When Plaid last brought this bank's data (Plaid's last_successful_update). */
  bankUpdatedAt: timestamp("bankUpdatedAt"),
  /** The webhook address Plaid has for this connection. */
  webhook: varchar("webhook", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const merchantLogosTable = mysqlTable("merchantLogos", {
  id: serial("id").primaryKey(),
  merchantKey: varchar("merchantKey", { length: 120 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  logoUrl: varchar("logoUrl", { length: 1000 }),
  website: varchar("website", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BankInstitutionRow = typeof bankInstitutionsTable.$inferSelect;
