import { describe, expect, it } from "vitest";
import { memberCan } from "./team";

describe("team permissions", () => {
  it("the accountant reads but never changes anything", () => {
    expect(memberCan("accountant", "reports.incomeStatement", "query")).toBe(true);
    expect(memberCan("accountant", "bank.getMonthData", "query")).toBe(true);
    expect(memberCan("accountant", "accountant.period", "query")).toBe(true);
    expect(memberCan("accountant", "sales.create", "mutation")).toBe(false);
    expect(memberCan("accountant", "customers.delete", "mutation")).toBe(false);
    expect(memberCan("accountant", "vendors.markPaid", "mutation")).toBe(false);
  });

  it("an employee sells and handles clients, nothing else", () => {
    expect(memberCan("staff", "sales.create", "mutation")).toBe(true);
    expect(memberCan("staff", "customers.update", "mutation")).toBe(true);
    expect(memberCan("staff", "services.list", "query")).toBe(true);
    expect(memberCan("staff", "receipts.create", "mutation")).toBe(true);
    expect(memberCan("staff", "customers.delete", "mutation")).toBe(false);
    expect(memberCan("staff", "services.update", "mutation")).toBe(false);
    expect(memberCan("staff", "bank.getMonthData", "query")).toBe(false);
    expect(memberCan("staff", "reports.incomeStatement", "query")).toBe(false);
    expect(memberCan("staff", "dashboard.summary", "query")).toBe(false);
  });

  it("no member touches tax documents, billing, the team, admin tools or the owner's account", () => {
    for (const role of ["staff", "accountant"] as const) {
      expect(memberCan(role, "tax.current", "query")).toBe(false);
      expect(memberCan(role, "tax.file", "query")).toBe(false);
      expect(memberCan(role, "subscription.createCheckout", "mutation")).toBe(false);
      expect(memberCan(role, "subscription.payments", "query")).toBe(false);
      expect(memberCan(role, "team.invite", "mutation")).toBe(false);
      expect(memberCan(role, "admin.listUsers", "query")).toBe(false);
      expect(memberCan(role, "auth.changePassword", "mutation")).toBe(false);
      expect(memberCan(role, "settings.update", "mutation")).toBe(false);
      expect(memberCan(role, "bank.disconnect", "mutation")).toBe(false);
      expect(memberCan(role, "bank.exchangePublicToken", "mutation")).toBe(false);
      expect(memberCan(role, "bank.debugAccounts", "query")).toBe(false);
      expect(memberCan(role, "personal.getTransactions", "query")).toBe(false);
      expect(memberCan(role, "assistant.status", "query")).toBe(false);
    }
  });

  it("everyone keeps the basics and the background upkeep", () => {
    for (const role of ["staff", "accountant"] as const) {
      expect(memberCan(role, "auth.me", "query")).toBe(true);
      expect(memberCan(role, "auth.logout", "mutation")).toBe(true);
      expect(memberCan(role, "subscription.status", "query")).toBe(true);
      expect(memberCan(role, "team.myMembership", "query")).toBe(true);
      expect(memberCan(role, "bank.autoSync", "mutation")).toBe(true);
    }
  });
});
