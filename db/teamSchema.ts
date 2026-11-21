// Team tables (Negocio plan). Created with CREATE TABLE IF NOT EXISTS in api/team-router.ts.
import { bigint, index, mysqlEnum, mysqlTable, serial, timestamp, uniqueIndex, varchar, char } from "drizzle-orm/mysql-core";

export const teamMembers = mysqlTable("teamMembers", {
  id: serial("id").primaryKey(),
  ownerId: bigint("ownerId", { mode: "number", unsigned: true }).notNull(),
  memberUserId: bigint("memberUserId", { mode: "number", unsigned: true }).notNull(),
  role: mysqlEnum("role", ["staff", "accountant"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [uniqueIndex("teamMembers_member").on(t.memberUserId), index("teamMembers_owner").on(t.ownerId)]);

export const teamInvites = mysqlTable("teamInvites", {
  id: serial("id").primaryKey(),
  ownerId: bigint("ownerId", { mode: "number", unsigned: true }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["staff", "accountant"]).notNull(),
  tokenHash: char("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [uniqueIndex("teamInvites_token").on(t.tokenHash), index("teamInvites_owner").on(t.ownerId)]);
