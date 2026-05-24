import { relations } from "drizzle-orm";
import {
  users,
  services,
  customers,
  sales,
  saleServices,
  paymentRecords,
  accounts,
  journalEntries,
  journalEntryLines,
  expenses,
  bankAccounts,
  bankTransactions,
  subscriptions,
  subscriptionPayments,
  companySettings,
  cloverAccounts,
  cloverTransactions,
  periodClosures,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  sales: many(sales),
  expenses: many(expenses),
  journalEntries: many(journalEntries),
  services: many(services),
  customers: many(customers),
  accounts: many(accounts),
  subscriptions: many(subscriptions),
  subscriptionPayments: many(subscriptionPayments),
  companySettings: many(companySettings),
  bankAccounts: many(bankAccounts),
  cloverAccounts: many(cloverAccounts),
  periodClosures: many(periodClosures),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  user: one(users, {
    fields: [services.userId],
    references: [users.id],
  }),
  saleServices: many(saleServices),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(users, {
    fields: [customers.userId],
    references: [users.id],
  }),
  sales: many(sales),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  creator: one(users, {
    fields: [sales.createdBy],
    references: [users.id],
  }),
  items: many(saleServices),
  payments: many(paymentRecords),
}));

export const saleServicesRelations = relations(saleServices, ({ one }) => ({
  sale: one(sales, {
    fields: [saleServices.saleId],
    references: [sales.id],
  }),
  service: one(services, {
    fields: [saleServices.serviceId],
    references: [services.id],
  }),
}));

export const paymentRecordsRelations = relations(paymentRecords, ({ one }) => ({
  sale: one(sales, {
    fields: [paymentRecords.saleId],
    references: [sales.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  parent: one(accounts, {
    fields: [accounts.parentId],
    references: [accounts.id],
  }),
  children: many(accounts),
  journalEntryLines: many(journalEntryLines),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
  creator: one(users, {
    fields: [journalEntries.createdBy],
    references: [users.id],
  }),
  lines: many(journalEntryLines),
}));

export const journalEntryLinesRelations = relations(journalEntryLines, ({ one }) => ({
  journalEntry: one(journalEntries, {
    fields: [journalEntryLines.journalEntryId],
    references: [journalEntries.id],
  }),
  account: one(accounts, {
    fields: [journalEntryLines.accountId],
    references: [accounts.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  creator: one(users, {
    fields: [expenses.createdBy],
    references: [users.id],
  }),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [bankAccounts.userId],
    references: [users.id],
  }),
  transactions: many(bankTransactions),
}));

export const bankTransactionsRelations = relations(bankTransactions, ({ one }) => ({
  user: one(users, {
    fields: [bankTransactions.userId],
    references: [users.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [bankTransactions.bankAccountId],
    references: [bankAccounts.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  payments: many(subscriptionPayments),
}));

export const subscriptionPaymentsRelations = relations(subscriptionPayments, ({ one }) => ({
  user: one(users, {
    fields: [subscriptionPayments.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [subscriptionPayments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const companySettingsRelations = relations(companySettings, ({ one }) => ({
  user: one(users, {
    fields: [companySettings.userId],
    references: [users.id],
  }),
}));

export const cloverAccountsRelations = relations(cloverAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [cloverAccounts.userId],
    references: [users.id],
  }),
  transactions: many(cloverTransactions),
}));

export const cloverTransactionsRelations = relations(cloverTransactions, ({ one }) => ({
  user: one(users, {
    fields: [cloverTransactions.userId],
    references: [users.id],
  }),
  cloverAccount: one(cloverAccounts, {
    fields: [cloverTransactions.cloverAccountId],
    references: [cloverAccounts.id],
  }),
  sale: one(sales, {
    fields: [cloverTransactions.saleId],
    references: [sales.id],
  }),
}));

export const periodClosuresRelations = relations(periodClosures, ({ one }) => ({
  user: one(users, {
    fields: [periodClosures.userId],
    references: [users.id],
  }),
  closedByUser: one(users, {
    fields: [periodClosures.closedBy],
    references: [users.id],
  }),
}));
