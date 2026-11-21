import { describe, expect, it } from "vitest";
import { assistantMonthlyLimit, cheapestTierWith, planHas, receiptPhotosPerMonth, topTier } from "@contracts/planFeatures";
import { monthStart, systemPrompt } from "../assistant-router";

describe("what each plan includes", () => {
  it("assistant: each x is 20 questions a month", () => {
    expect(assistantMonthlyLimit("personal", "basic")).toBe(100); // x5
    expect(assistantMonthlyLimit("personal", "pro")).toBe(300); // x15
    expect(assistantMonthlyLimit("business", "basic")).toBe(100); // x5
    expect(assistantMonthlyLimit("business", "pro")).toBe(200); // x10
    expect(assistantMonthlyLimit("business", "business")).toBe(400); // x20
  });

  it("matches the landing cards", () => {
    expect(planHas("personal", "basic", "taxes")).toBe(true);
    expect(planHas("personal", "basic", "budgets")).toBe(false);
    expect(planHas("personal", "pro", "budgets")).toBe(true);
    expect(planHas("business", "basic", "taxes")).toBe(false);
    expect(planHas("business", "pro", "taxes")).toBe(true);
    expect(planHas("business", "pro", "clientReports")).toBe(false);
    expect(planHas("business", "business", "clientReports")).toBe(true);
    expect(cheapestTierWith("business", "vendors")).toBe("pro");
    expect(cheapestTierWith("business", "team")).toBe("business");
  });

  it("receipt photos: 20 a month on Básico, no limit above", () => {
    expect(receiptPhotosPerMonth("basic")).toBe(20);
    expect(receiptPhotosPerMonth("pro")).toBeNull();
  });

  it("the trial gets the top plan", () => {
    expect(topTier("business")).toBe("business");
    expect(topTier("personal")).toBe("pro");
  });
});

describe("assistant", () => {
  it("counts questions from the 1st of the month", () => {
    expect(monthStart(new Date("2026-11-21T15:00:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("tells the model the date and never to invent numbers", () => {
    const p = systemPrompt("business", "2026-11-21");
    expect(p).toContain("Today is 2026-11-21");
    expect(p).toContain("Never guess or invent amounts");
    expect(systemPrompt("personal", "2026-11-21")).toContain("household");
  });
});
