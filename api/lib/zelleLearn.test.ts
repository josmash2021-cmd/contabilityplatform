import { describe, expect, it } from "vitest";
import { buildHistory, buildHistoryLooks, classify, looksUsual, type EngineRow, type HistoryRow } from "./reviewEngine";

// Owner, 2026-11-24: "Zelle a Juan = Renta" — the app learns a payment to a person, by amount and day.
const past: HistoryRow[] = [
  { description: "ZELLE TO JUAN PEREZ ON 09/01 REF # A1", merchantName: null, category: "rent", type: "expense", amountCents: 95000, date: "2026-09-01" },
  { description: "ZELLE TO JUAN PEREZ ON 10/01 REF # B2", merchantName: null, category: "rent", type: "expense", amountCents: 95000, date: "2026-10-02" },
];
const row = (amountCents: number, date: string, description = "ZELLE TO JUAN PEREZ ON 11/01 REF # C3"): EngineRow => ({
  id: 1, date, description, merchantName: null, type: "expense", category: "zelle_sent", amountCents,
  plaidAmount: amountCents / 100, importedFrom: "plaid", bankAccountId: 1, reviewed: false,
});
const signals = (rows: HistoryRow[]) => ({ rules: [], history: buildHistory(rows), transfers: new Map(), duplicates: new Map(), matches: new Map(), looks: buildHistoryLooks(rows) });

describe("a payment to a person, learned", () => {
  it("after two the same, the next one like them is sure", () => {
    const v = classify(row(95000, "2026-11-01"), signals(past));
    expect(v).toMatchObject({ kind: "ready", conf: "high", category: "rent", why: { code: "history", n: 2 } });
  });
  it("a different amount asks again (it could be a loan or a gift)", () => {
    const v = classify(row(5000, "2026-11-01"), signals(past));
    expect(v).toMatchObject({ kind: "ask", category: "rent", why: { code: "historyDifferent", usual: 950 } });
  });
  it("rent on a very different day asks again; a few days late is fine", () => {
    expect(classify(row(95000, "2026-11-17"), signals(past)).kind).toBe("ask");
    expect(classify(row(95000, "2026-11-05"), signals(past)).kind).toBe("ready");
    // Around the month's end: the 30th and the 2nd are close.
    expect(looksUsual({ amountCents: 95000, date: "2026-11-30" }, { amounts: [95000, 95000], days: [1, 2] }).usual).toBe(true);
  });
  it("a small change in the amount is still the same thing", () => {
    expect(classify(row(96500, "2026-11-01"), signals(past)).kind).toBe("ready");
  });
  it("after only one, it suggests what it was but asks", () => {
    const v = classify(row(95000, "2026-11-01"), signals(past.slice(0, 1)));
    expect(v).toMatchObject({ kind: "ask", category: "rent" });
  });
  it("another person is another story", () => {
    const v = classify(row(95000, "2026-11-01", "ZELLE TO MARIA LOPEZ ON 11/01 REF # D4"), signals(past));
    expect(v.category).not.toBe("rent");
  });
  it("a store isn't a person: its history doesn't look at amounts", () => {
    const store: HistoryRow[] = [
      { description: "HOME DEPOT #4821", merchantName: null, category: "shopping", type: "expense", amountCents: 1200, date: "2026-10-03" },
      { description: "HOME DEPOT #4821", merchantName: null, category: "shopping", type: "expense", amountCents: 98000, date: "2026-10-20" },
    ];
    const v = classify({ ...row(5000, "2026-11-11"), description: "HOME DEPOT #4821" }, signals(store));
    expect(v.kind).toBe("ready");
  });
});
