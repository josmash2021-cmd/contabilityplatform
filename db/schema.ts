import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  int,
  decimal,
  bigint,
  boolean,
  date,
  time,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";

// ─── Users ───
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).unique(),
  email: varchar("email", { length: 320 }).unique(),
  password: varchar("password", { length: 255 }),
  name: varchar("name", { length: 255 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  hasPersonalMode: boolean("hasPersonalMode").default(false),
  modePreference: mysqlEnum("modePreference", ["business", "personal"]).default("business"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
}, (table) => [
  index("users_email_idx").on(table.email),
  index("users_unionId_idx").on(table.unionId),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Password Reset Codes ───
export const passwordResetCodes = mysqlTable("passwordResetCodes", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("reset_codes_email_idx").on(table.email),
  index("reset_codes_email_used_idx").on(table.email, table.used),
]);

export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;
export type InsertPasswordResetCode = typeof passwordResetCodes.$inferInsert;

// ─── Services ───
export const services = mysqlTable("services", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0"),
  image: text("image"),
  categoryId: bigint("categoryId", { mode: "number", unsigned: true }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("services_userId_idx").on(table.userId),
  index("services_userId_isActive_idx").on(table.userId, table.isActive),
]);

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

// ─── Customers ───
export const customers = mysqlTable("customers", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  lastName: varchar("lastName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  zelleEmail: varchar("zelleEmail", { length: 320 }),
  carBrand: varchar("carBrand", { length: 100 }),
  carModel: varchar("carModel", { length: 100 }),
  carYear: varchar("carYear", { length: 20 }),
  plateNumber: varchar("plateNumber", { length: 50 }),
  plateExpiryDate: date("plateExpiryDate"),
  transactionDate: date("transactionDate"),
  clientType: mysqlEnum("clientType", ["placas", "titulos"]).default("placas").notNull(),
  paymentAmount: decimal("paymentAmount", { precision: 12, scale: 2 }).default("0"),
  paymentHistory: text("paymentHistory"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("customers_userId_idx").on(table.userId),
  index("customers_userId_clientType_idx").on(table.userId, table.clientType),
  index("customers_name_idx").on(table.name),
]);

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// ─── Sales ───
export const sales = mysqlTable("sales", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull(),
  customerId: bigint("customerId", { mode: "number", unsigned: true }).references(() => customers.id, { onDelete: "set null" }),
  customerName: varchar("customerName", { length: 255 }),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "zelle", "card", "mixed"]).notNull(),
  status: mysqlEnum("status", ["completed", "pending", "cancelled", "refunded"]).default("completed").notNull(),
  notes: text("notes"),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("sales_invoiceNumber_idx").on(table.invoiceNumber),
  index("sales_createdBy_idx").on(table.createdBy),
  index("sales_createdBy_createdAt_idx").on(table.createdBy, table.createdAt),
  index("sales_status_idx").on(table.status),
  index("sales_customerId_idx").on(table.customerId),
]);

export type Sale = typeof sales.$inferSelect;
export type InsertSale = typeof sales.$inferInsert;

// ─── Sale Services ───
export const saleServices = mysqlTable("saleServices", {
  id: serial("id").primaryKey(),
  saleId: bigint("saleId", { mode: "number", unsigned: true }).notNull().references(() => sales.id, { onDelete: "cascade" }),
  serviceId: bigint("serviceId", { mode: "number", unsigned: true }).notNull().references(() => services.id, { onDelete: "restrict" }),
  serviceName: varchar("serviceName", { length: 255 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("saleServices_saleId_idx").on(table.saleId),
  index("saleServices_serviceId_idx").on(table.serviceId),
]);

export type SaleService = typeof saleServices.$inferSelect;
export type InsertSaleService = typeof saleServices.$inferInsert;

// ─── Payment Records ───
export const paymentRecords = mysqlTable("paymentRecords", {
  id: serial("id").primaryKey(),
  saleId: bigint("saleId", { mode: "number", unsigned: true }).references(() => sales.id, { onDelete: "cascade" }),
  method: mysqlEnum("method", ["cash", "zelle", "card"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  reference: varchar("reference", { length: 255 }),
  status: mysqlEnum("status", ["completed", "pending", "failed", "refunded"]).default("completed").notNull(),
  confirmedAt: timestamp("confirmedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("paymentRecords_saleId_idx").on(table.saleId),
]);

export type PaymentRecord = typeof paymentRecords.$inferSelect;
export type InsertPaymentRecord = typeof paymentRecords.$inferInsert;

// ─── Accounts ───
export const accounts = mysqlTable("accounts", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  parentId: bigint("parentId", { mode: "number", unsigned: true }).references((): AnyMySqlColumn => accounts.id, { onDelete: "set null" }),
  balance: decimal("balance", { precision: 14, scale: 2 }).default("0"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("accounts_userId_code_idx").on(table.userId, table.code),
  index("accounts_userId_idx").on(table.userId),
]);

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

// ─── Journal Entries ───
export const journalEntries = mysqlTable("journalEntries", {
  id: serial("id").primaryKey(),
  entryNumber: varchar("entryNumber", { length: 50 }).notNull(),
  date: date("date").notNull(),
  description: text("description").notNull(),
  reference: varchar("reference", { length: 100 }),
  referenceId: bigint("referenceId", { mode: "number", unsigned: true }),
  referenceType: mysqlEnum("referenceType", ["sale", "purchase", "payment", "adjustment", "opening"]),
  debitTotal: decimal("debitTotal", { precision: 14, scale: 2 }).notNull(),
  creditTotal: decimal("creditTotal", { precision: 14, scale: 2 }).notNull(),
  isPosted: boolean("isPosted").default(true),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("journalEntries_entryNumber_idx").on(table.entryNumber),
  index("journalEntries_createdBy_idx").on(table.createdBy),
  index("journalEntries_createdAt_idx").on(table.createdAt),
]);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = typeof journalEntries.$inferInsert;

// ─── Period Closures ───
export const periodClosures = mysqlTable("periodClosures", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  year: int("year").notNull(),
  month: int("month").notNull(),
  closedAt: timestamp("closedAt").defaultNow().notNull(),
  closedBy: bigint("closedBy", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "restrict" }),
}, (table) => [
  index("periodClosures_userId_year_month_idx").on(table.userId, table.year, table.month),
]);

export type PeriodClosure = typeof periodClosures.$inferSelect;
export type InsertPeriodClosure = typeof periodClosures.$inferInsert;

// ─── Journal Entry Lines ───
export const journalEntryLines = mysqlTable("journalEntryLines", {
  id: serial("id").primaryKey(),
  journalEntryId: bigint("journalEntryId", { mode: "number", unsigned: true }).notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
  accountId: bigint("accountId", { mode: "number", unsigned: true }).notNull().references(() => accounts.id, { onDelete: "restrict" }),
  debit: decimal("debit", { precision: 14, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 14, scale: 2 }).default("0"),
  description: text("description"),
}, (table) => [
  index("journalEntryLines_journalEntryId_idx").on(table.journalEntryId),
  index("journalEntryLines_accountId_idx").on(table.accountId),
]);

export type JournalEntryLine = typeof journalEntryLines.$inferSelect;
export type InsertJournalEntryLine = typeof journalEntryLines.$inferInsert;

// ─── Expenses ───
export const expenses = mysqlTable("expenses", {
  id: serial("id").primaryKey(),
  description: varchar("description", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  subcategory: varchar("subcategory", { length: 100 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "zelle", "card"]).notNull(),
  date: date("date").notNull(),
  reference: varchar("reference", { length: 255 }),
  receipt: text("receipt"),
  notes: text("notes"),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("expenses_createdBy_idx").on(table.createdBy),
  index("expenses_date_idx").on(table.date),
  index("expenses_createdBy_date_idx").on(table.createdBy, table.date),
  index("expenses_category_idx").on(table.category),
]);

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

// ─── Bank Accounts ───
export const bankAccounts = mysqlTable("bankAccounts", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  bankName: varchar("bankName", { length: 100 }).notNull(),
  accountNumber: varchar("accountNumber", { length: 50 }),
  accountType: varchar("accountType", { length: 50 }).default("checking"),
  currentBalance: decimal("currentBalance", { precision: 14, scale: 2 }).default("0"),
  isActive: boolean("isActive").default(true),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  plaidAccessToken: text("plaidAccessToken"),
  plaidItemId: varchar("plaidItemId", { length: 255 }),
  plaidAccountId: varchar("plaidAccountId", { length: 255 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
}, (table) => [
  index("bankAccounts_userId_idx").on(table.userId),
]);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;

// ─── Bank Transactions ───
export const bankTransactions = mysqlTable("bankTransactions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  bankAccountId: bigint("bankAccountId", { mode: "number", unsigned: true }).references(() => bankAccounts.id, { onDelete: "set null" }),
  bankName: varchar("bankName", { length: 100 }),
  accountNumber: varchar("accountNumber", { length: 50 }),
  transactionDate: date("transactionDate").notNull(),
  transactionTime: time("transactionTime"),
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  category: mysqlEnum("category", [
    "business_expense",
    "home_expense",
    "shopping",
    "subscription",
    "zelle_income",
    "cash_income",
    "transfer",
    "other",
    "zelle_sent",
    "cash_withdrawal",
    "deposit",
    "cash_deposit",
    "gasolina",
  ]).default("other").notNull(),
  subcategory: varchar("subcategory", { length: 100 }),
  reference: varchar("reference", { length: 255 }),
  plaidAmount: decimal("plaidAmount", { precision: 12, scale: 2 }),
  balanceAfter: decimal("balanceAfter", { precision: 14, scale: 2 }),
  // --- ELITE ACCOUNTING FIELDS ---
  plaidTransactionId: varchar("plaidTransactionId", { length: 255 }),
  plaidCategory: text("plaidCategory"),
  merchantName: varchar("merchantName", { length: 255 }),
  isDuplicate: boolean("isDuplicate").default(false),
  syncStatus: mysqlEnum("syncStatus", ["pending", "synced", "error", "retrying"]).default("synced"),
  syncError: text("syncError"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  journalEntryId: bigint("journalEntryId", { mode: "number", unsigned: true }),
  // --- END ELITE ---
  isReconciled: boolean("isReconciled").default(false),
  notes: text("notes"),
  importedFrom: varchar("importedFrom", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("bankTransactions_userId_idx").on(table.userId),
  index("bankTransactions_userId_transactionDate_idx").on(table.userId, table.transactionDate),
  index("bankTransactions_userId_type_idx").on(table.userId, table.type),
  index("bankTransactions_userId_category_idx").on(table.userId, table.category),
  index("bankTransactions_bankAccountId_idx").on(table.bankAccountId),
  index("bankTransactions_userId_bankAccountId_idx").on(table.userId, table.bankAccountId),
  uniqueIndex("bankTransactions_plaidTxId_idx").on(table.plaidTransactionId),
  index("bankTransactions_merchantName_idx").on(table.merchantName),
  index("bankTransactions_syncStatus_idx").on(table.syncStatus),
]);

export type BankTransaction = typeof bankTransactions.$inferSelect;
export type InsertBankTransaction = typeof bankTransactions.$inferInsert;

// ─── Subscriptions ───
export const subscriptions = mysqlTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  stripePriceId: varchar("stripePriceId", { length: 255 }),
  plan: mysqlEnum("plan", ["monthly", "annual"]).notNull(),
  status: mysqlEnum("status", ["active", "cancelled", "past_due", "unpaid", "trialing"]).default("active").notNull(),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("subscriptions_userId_idx").on(table.userId),
  index("subscriptions_stripeSubscriptionId_idx").on(table.stripeSubscriptionId),
]);

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── User Cancelled Bank Subscriptions ───
export const userCancelledSubscriptions = mysqlTable("userCancelledSubscriptions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  merchantName: varchar("merchantName", { length: 255 }).notNull(),
  originalMonthlyAmount: decimal("originalMonthlyAmount", { precision: 10, scale: 2 }).notNull(),
  cancelledAt: timestamp("cancelledAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("userCancelledSubscriptions_userId_idx").on(table.userId),
]);

export type UserCancelledSubscription = typeof userCancelledSubscriptions.$inferSelect;

// ─── Subscription Payments ───
export const subscriptionPayments = mysqlTable("subscriptionPayments", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: bigint("subscriptionId", { mode: "number", unsigned: true }).references(() => subscriptions.id, { onDelete: "set null" }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeInvoiceId: varchar("stripeInvoiceId", { length: 255 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  plan: mysqlEnum("plan", ["monthly", "annual"]).notNull(),
  status: mysqlEnum("status", ["succeeded", "pending", "failed"]).default("pending").notNull(),
  receiptUrl: text("receiptUrl"),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
}, (table) => [
  index("subscriptionPayments_userId_idx").on(table.userId),
]);

export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;
export type InsertSubscriptionPayment = typeof subscriptionPayments.$inferInsert;

// ─── Company Settings ───
export const companySettings = mysqlTable("companySettings", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  companyName: varchar("companyName", { length: 255 }).default("Tu Placa"),
  rif: varchar("rif", { length: 50 }),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  zelleEmail: varchar("zelleEmail", { length: 320 }),
  bankName: varchar("bankName", { length: 100 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 50 }),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("0.00"),
  currency: varchar("currency", { length: 10 }).default("USD"),
  logo: text("logo"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("companySettings_userId_idx").on(table.userId),
]);

export type CompanySetting = typeof companySettings.$inferSelect;
export type InsertCompanySetting = typeof companySettings.$inferInsert;

// ─── Clover Accounts ───
export const cloverAccounts = mysqlTable("cloverAccounts", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  merchantId: varchar("merchantId", { length: 255 }).notNull(),
  merchantName: varchar("merchantName", { length: 255 }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  deviceId: varchar("deviceId", { length: 255 }),
  deviceName: varchar("deviceName", { length: 255 }),
  tenderId: varchar("tenderId", { length: 255 }),
  isActive: boolean("isActive").default(true),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSyncedAt: timestamp("lastSyncedAt"),
}, (table) => [
  index("cloverAccounts_userId_idx").on(table.userId),
]);

export type CloverAccount = typeof cloverAccounts.$inferSelect;
export type InsertCloverAccount = typeof cloverAccounts.$inferInsert;

// ─── Clover Transactions ───
export const cloverTransactions = mysqlTable("cloverTransactions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  cloverAccountId: bigint("cloverAccountId", { mode: "number", unsigned: true }).references(() => cloverAccounts.id, { onDelete: "set null" }),
  saleId: bigint("saleId", { mode: "number", unsigned: true }).references(() => sales.id, { onDelete: "set null" }),
  cloverPaymentId: varchar("cloverPaymentId", { length: 255 }),
  cloverOrderId: varchar("cloverOrderId", { length: 255 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "cancelled", "refunded"]).default("pending"),
  cardLastFour: varchar("cardLastFour", { length: 4 }),
  cardType: varchar("cardType", { length: 50 }),
  deviceName: varchar("deviceName", { length: 255 }),
  receiptUrl: text("receiptUrl"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("cloverTransactions_userId_idx").on(table.userId),
]);

export type CloverTransaction = typeof cloverTransactions.$inferSelect;
export type InsertCloverTransaction = typeof cloverTransactions.$inferInsert;
// ─── PERSONAL MODE TABLES ───
// Separate accounting system for personal finances

export const personalTransactions = mysqlTable("personalTransactions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("other"),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "transfer", "zelle", "other"]).default("cash").notNull(),
  transactionDate: date("transactionDate").notNull(),
  notes: text("notes"),
  isRecurring: boolean("isRecurring").default(false),
  recurringFrequency: mysqlEnum("recurringFrequency", ["weekly", "biweekly", "monthly", "quarterly", "yearly"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("personalTx_userId_idx").on(table.userId),
  index("personalTx_date_idx").on(table.transactionDate),
  index("personalTx_type_idx").on(table.type),
]);

export const personalCategories = mysqlTable("personalCategories", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  color: varchar("color", { length: 7 }).default("#000000"),
  icon: varchar("icon", { length: 30 }).default("circle"),
  budgetLimit: decimal("budgetLimit", { precision: 12, scale: 2 }),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("personalCat_userId_idx").on(table.userId),
  uniqueIndex("personalCat_user_name_idx").on(table.userId, table.name),
]);

export const personalGoals = mysqlTable("personalGoals", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  targetAmount: decimal("targetAmount", { precision: 12, scale: 2 }).notNull(),
  currentAmount: decimal("currentAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  deadline: date("deadline"),
  category: varchar("category", { length: 50 }).default("savings"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("personalGoal_userId_idx").on(table.userId),
]);

export type PersonalTransaction = typeof personalTransactions.$inferSelect;
export type InsertPersonalTransaction = typeof personalTransactions.$inferInsert;
export type PersonalCategory = typeof personalCategories.$inferSelect;
export type PersonalGoal = typeof personalGoals.$inferSelect;

// ═══════════════════════════════════════════════════════════
// ELITE ACCOUNTING TABLES
// ═══════════════════════════════════════════════════════════

// ─── Sync Logs ───
export const syncLogs = mysqlTable("syncLogs", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  bankAccountId: bigint("bankAccountId", { mode: "number", unsigned: true }).references(() => bankAccounts.id, { onDelete: "set null" }),
  syncType: mysqlEnum("syncType", ["auto", "manual", "webhook", "retry"]).default("manual").notNull(),
  status: mysqlEnum("status", ["started", "success", "partial", "failed"]).notNull(),
  transactionsFound: int("transactionsFound").default(0),
  transactionsAdded: int("transactionsAdded").default(0),
  transactionsUpdated: int("transactionsUpdated").default(0),
  transactionsSkipped: int("transactionsSkipped").default(0),
  duplicatesDetected: int("duplicatesDetected").default(0),
  errors: text("errors"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
}, (table) => [
  index("syncLogs_userId_idx").on(table.userId),
  index("syncLogs_userId_startedAt_idx").on(table.userId, table.startedAt),
  index("syncLogs_status_idx").on(table.status),
]);

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;

// ─── Smart Category Rules ───
export const smartCategoryRules = mysqlTable("smartCategoryRules", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  merchantPattern: varchar("merchantPattern", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  subcategory: varchar("subcategory", { length: 100 }),
  confidence: int("confidence").default(100),
  source: mysqlEnum("source", ["user", "auto", "system"]).default("system").notNull(),
  usageCount: int("usageCount").default(0),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("smartCatRules_userId_idx").on(table.userId),
  uniqueIndex("smartCatRules_user_pattern_idx").on(table.userId, table.merchantPattern),
]);

export type SmartCategoryRule = typeof smartCategoryRules.$inferSelect;
export type InsertSmartCategoryRule = typeof smartCategoryRules.$inferInsert;

// ─── Reconciliation Logs ───
export const reconciliationLogs = mysqlTable("reconciliationLogs", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().references(() => users.id, { onDelete: "cascade" }),
  bankAccountId: bigint("bankAccountId", { mode: "number", unsigned: true }).references(() => bankAccounts.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ["matched", "unmatched_bank", "unmatched_book", "discrepancy"]).notNull(),
  bankTransactionId: bigint("bankTransactionId", { mode: "number", unsigned: true }).references(() => bankTransactions.id, { onDelete: "set null" }),
  description: varchar("description", { length: 255 }),
  bankAmount: decimal("bankAmount", { precision: 12, scale: 2 }),
  bookAmount: decimal("bookAmount", { precision: 12, scale: 2 }),
  difference: decimal("difference", { precision: 12, scale: 2 }),
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
  resolved: boolean("resolved").default(false),
}, (table) => [
  index("reconLogs_userId_idx").on(table.userId),
  index("reconLogs_status_idx").on(table.status),
]);

export type ReconciliationLog = typeof reconciliationLogs.$inferSelect;
