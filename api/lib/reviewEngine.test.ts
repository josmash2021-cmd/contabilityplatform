import { describe, expect, it } from "vitest";
import {
  HISTORY_SURE, SPLIT_MIN_CENTS, buildHistory, categoryFits, categoryTotals, classify, cleanPattern, detectDuplicates, detectTransfers,
  displayNameOf, findRule, historyFor, isCashDeposit, mainCategoryOf, matchBill, matchCashSales, matchReceivable, merchantKeyOf,
  nameInText, ruleMatches, rulePatternFor, signedCents, splitProblem, subsetSum, toCents, topCategories,
  type EngineRow, type Signals,
} from "./reviewEngine";

let nextId = 1;
const row = (p: Partial<EngineRow> & { description: string; amount: number }): EngineRow => {
  const { amount, ...rest } = p;
  const type = rest.type ?? (amount < 0 ? "income" : "expense");
  return {
    id: nextId++, date: "2026-11-18", merchantName: null, category: "other", importedFrom: "plaid", bankAccountId: 1, reviewed: false,
    plaidAmount: amount.toFixed(2), amountCents: Math.abs(toCents(amount)), type, ...rest,
  };
};
const none: Signals = { rules: [], history: new Map(), transfers: new Map(), duplicates: new Map(), matches: new Map() };

describe("merchant keys and names", () => {
  it("keeps the merchant and drops store numbers, cities and references", () => {
    expect(merchantKeyOf("THE HOME DEPOT #4821 HOUSTON TX")).toBe("home depot");
    expect(merchantKeyOf("SHELL OIL 57134 HOUSTON")).toBe("shell oil");
    expect(merchantKeyOf("SHELL OIL 57444 BIRMINGHAM AL")).toBe("shell oil");
    expect(merchantKeyOf("ZELLE FROM CARLOS RUIZ CONF# 88412")).toBe("zelle from carlos ruiz");
    expect(merchantKeyOf("AMZN MKTP US*2K4LD0")).toBe("amzn mktp us");
    expect(merchantKeyOf("SQ *JOE'S TACOS 123")).toBe("joe's tacos");
    expect(merchantKeyOf("PURCHASE AUTHORIZED ON 11/18 COSTCO WHSE #0688")).toBe("costco whse");
    expect(merchantKeyOf("SEGUROS DEL VALLE AUTOPAY")).toBe("seguros del valle");
    expect(merchantKeyOf("ONLINE TRANSFER TO SAV ••4411")).toBe("online transfer to sav");
  });
  it("prefers Plaid's merchant name when it differs from the description", () => {
    expect(merchantKeyOf("THE HOME DEPOT #4821", "The Home Depot")).toBe("home depot");
    expect(displayNameOf("THE HOME DEPOT #4821", "Home Depot")).toBe("Home Depot");
  });
  it("shows a readable name", () => {
    expect(displayNameOf("ZELLE FROM CARLOS RUIZ CONF# 88412")).toBe("Zelle · Carlos Ruiz");
    expect(displayNameOf("AMZN MKTP US*2K4LD0")).toBe("Amazon");
    expect(displayNameOf("NETFLIX.COM 866-579-7172")).toBe("Netflix");
    expect(displayNameOf("SEGUROS DEL VALLE AUTOPAY")).toBe("Seguros del Valle");
    expect(displayNameOf("")).toBe("");
    // Rows saved by the old sync carry a lowercase, half-tidied name: shown readable, not as is.
    expect(displayNameOf("AMAZON MKTPL*7T2RD1 AMZN.COM/BILL WA", "amazon mktpl amzn/bill wa")).toBe("Amazon");
    expect(displayNameOf("PURCHASE AUTHORIZED ON 11/18 TARGET T-1234 AUSTIN TX", "target t-1234 austin tx")).toBe("Target");
    expect(displayNameOf("SHELL OIL 57134 HOUSTON", "shell oil")).toBe("Shell");
    expect(displayNameOf("JOE'S TIRE SHOP 2231", "joe's tire shop")).toBe("Joe's Tire Shop");
    expect(displayNameOf("PROVISIONAL CREDIT ADJUSTMENT 1118", "provisional")).toBe("Provisional Credit Adjustment");
  });
  it("finds a person's or company's name in a description", () => {
    expect(nameInText("Carlos Ruiz", "ZELLE FROM CARLOS RUIZ CONF# 88412")).toBe(true);
    expect(nameInText("Carlos Ruíz", "ZELLE FROM CARLOS RUIZ")).toBe(true);
    expect(nameInText("Carlos Ruiz", "ZELLE FROM CARLOS MENA")).toBe(false);
    expect(nameInText("Seguros del Valle S.A.", "SEGUROS DEL VALLE AUTOPAY")).toBe(true);
    expect(nameInText("", "anything")).toBe(false);
  });
});

describe("rules", () => {
  const rules = [
    { id: 1, pattern: "Shell", category: "gasolina" },
    { id: 2, pattern: "shell oil 57134", category: "business_expense" },
    { id: 3, pattern: "Zelle from carlos", category: "zelle_income" },
  ];
  it("match inside the description or merchant name, any case", () => {
    expect(ruleMatches("shell", "SHELL OIL 57134 HOUSTON")).toBe(true);
    expect(ruleMatches("home depot", "X", "The Home Depot")).toBe(true);
    expect(ruleMatches("x", "x")).toBe(false); // too short
  });
  it("the most specific rule wins, and only when the category fits the direction", () => {
    expect(findRule(rules, { description: "SHELL OIL 57134 HOUSTON", type: "expense" })?.id).toBe(2);
    expect(findRule(rules, { description: "SHELL OIL 99999", type: "expense" })?.id).toBe(1);
    expect(findRule(rules, { description: "SHELL OIL REFUND", type: "income" })).toBeNull(); // gasolina is money out
    expect(findRule(rules, { description: "ZELLE FROM CARLOS RUIZ", type: "income" })?.id).toBe(3);
  });
  it("offers a pattern that really matches the movement", () => {
    expect(rulePatternFor("SHELL OIL 57134 HOUSTON")).toBe("Shell");
    expect(rulePatternFor("AMZN MKTP US*2K4LD0")).toBe("amzn mktp us");
    expect(rulePatternFor("ZELLE FROM CARLOS RUIZ CONF# 88412")).toBe("zelle from carlos ruiz");
    expect(cleanPattern("  Home   Depot ")).toBe("Home Depot");
  });
  it("categories fit directions", () => {
    expect(categoryFits("gasolina", "expense")).toBe(true);
    expect(categoryFits("gasolina", "income")).toBe(false);
    expect(categoryFits("other", "income")).toBe(true);
  });
});

describe("grouping", () => {
  it("a rule makes it sure", () => {
    const v = classify(row({ description: "SHELL OIL 57134", amount: 62.1, category: "food" }), { ...none, rules: [{ id: 9, pattern: "Shell", category: "gasolina" }] });
    expect(v).toMatchObject({ kind: "ready", conf: "high", category: "gasolina", why: { code: "rule", pattern: "Shell", category: "gasolina" }, ruleId: 9 });
  });
  it("the owner's history makes it sure from HISTORY_SURE times with one category", () => {
    const history = buildHistory(Array.from({ length: 12 }, () => ({ description: "THE HOME DEPOT #1", category: "business_expense", type: "expense" as const })));
    const v = classify(row({ description: "THE HOME DEPOT #4821 HOUSTON TX", amount: 184.32, category: "shopping" }), { ...none, history });
    expect(v).toMatchObject({ kind: "ready", conf: "high", category: "business_expense", why: { code: "history", n: 12 } });
    expect(HISTORY_SURE).toBeGreaterThanOrEqual(2);
  });
  it("mixed or single history asks", () => {
    const history = buildHistory([
      { description: "OFFICE DEPOT 1", category: "business_expense", type: "expense" },
      { description: "OFFICE DEPOT 2", category: "home_expense", type: "expense" },
    ]);
    expect(classify(row({ description: "OFFICE DEPOT 3", amount: 20 }), { ...none, history })).toMatchObject({ kind: "ask", conf: "mid", why: { code: "historyMixed", total: 2 } });
    expect(historyFor(history, "office depot", "income")).toBeNull();
  });
  it("only a keyword guess asks with 'Revisa'", () => {
    expect(classify(row({ description: "AMZN MKTP US*2K4LD0", amount: 89.99, category: "shopping" }), none)).toMatchObject({ kind: "ask", ask: null, conf: "mid", why: { code: "keyword" } });
  });
  it("big purchases at mixed stores ask to split; streaming and food ask business or personal", () => {
    expect(classify(row({ description: "COSTCO WHSE #0688", amount: 248.6, category: "wholesale" }), none)).toMatchObject({ kind: "ask", ask: "split" });
    expect(classify(row({ description: "COSTCO WHSE #0688", amount: SPLIT_MIN_CENTS / 100 - 1, category: "wholesale" }), none).ask).not.toBe("split");
    expect(classify(row({ description: "NETFLIX.COM 866-579-7172", amount: 15.49, category: "shopping" }), none)).toMatchObject({ kind: "ask", ask: "bizpersonal" });
    expect(classify(row({ description: "TACO PLACE", amount: 12, category: "food" }), none).ask).toBe("bizpersonal");
  });
  it("a match comes first", () => {
    const r = row({ description: "BRANCH DEPOSIT 0417", amount: -320, category: "deposit" });
    const v = classify(r, { ...none, matches: new Map([[r.id, { type: "cash" as const, saleIds: [1, 2], amounts: [200, 120], day: "2026-11-17" }]]) });
    expect(v).toMatchObject({ kind: "match", category: "cash_deposit", why: { code: "matchCash", amounts: [200, 120] } });
  });
});

describe("transfers and duplicates", () => {
  it("pairs a transfer: same amount, opposite sign, two accounts, within 3 days", () => {
    const out = row({ description: "ONLINE TRANSFER TO SAV ••4411", amount: 500, bankAccountId: 1, date: "2026-11-17" });
    const inn = row({ description: "ONLINE TRANSFER FROM CHK ••4410", amount: -500, bankAccountId: 2, date: "2026-11-18" });
    const t = detectTransfers([out, inn]);
    expect(t.get(out.id)).toMatchObject({ otherId: inn.id, direction: "to", otherAccountId: 2 });
    expect(t.get(inn.id)).toMatchObject({ otherId: out.id, direction: "from" });
    expect(classify(out, { ...none, transfers: t })).toMatchObject({ kind: "ready", category: "transfer", why: { code: "transfer", direction: "to" } });
    expect(classify(inn, { ...none, transfers: t }).category).toBe("transfer_income");
  });
  it("doesn't pair the same account, far apart days, or two unrelated movements", () => {
    const a = row({ description: "ONLINE TRANSFER", amount: 500, bankAccountId: 1, date: "2026-11-10" });
    const b = row({ description: "ONLINE TRANSFER", amount: -500, bankAccountId: 1, date: "2026-11-10" });
    const c = row({ description: "ONLINE TRANSFER", amount: -500, bankAccountId: 2, date: "2026-11-15" });
    expect(detectTransfers([a, b, c]).size).toBe(0);
    const d = row({ description: "TACO PLACE", amount: 50, bankAccountId: 1 });
    const e = row({ description: "ZELLE FROM ANA", amount: -50, bankAccountId: 2 });
    expect(detectTransfers([d, e]).size).toBe(0);
  });
  it("flags the later copy of a repeated charge as a possible duplicate", () => {
    const first = row({ description: "SHELL OIL 57134 HOUSTON", amount: 62.1, date: "2026-11-16", reviewed: true });
    const again = row({ description: "SHELL OIL 57134", amount: 62.1, date: "2026-11-18" });
    const other = row({ description: "SHELL OIL 57134", amount: 40, date: "2026-11-18" });
    const d = detectDuplicates([first, again, other]);
    expect(d.get(again.id)).toEqual({ otherId: first.id, otherDate: "2026-11-16" });
    expect(d.has(first.id)).toBe(false);
    expect(d.has(other.id)).toBe(false);
  });
  it("signs come from Plaid when present", () => {
    expect(signedCents(row({ description: "x", amount: -10 }))).toBe(-1000);
    expect(signedCents({ amountCents: 1000, plaidAmount: null, importedFrom: "csv", type: "income" })).toBe(-1000);
  });
});

describe("matching", () => {
  it("a deposit with the client's name and the exact amount matches the pending sale", () => {
    const r = row({ description: "ZELLE FROM CARLOS RUIZ CONF# 88412", amount: -850 });
    const list = [
      { saleId: 7, invoiceNumber: "INV-7", customerName: "Ana Torres", totalCents: 85000, day: "2026-11-01", quoteNumber: null },
      { saleId: 8, invoiceNumber: "INV-8", customerName: "Carlos Ruiz", totalCents: 85000, day: "2026-11-02", quoteNumber: "COT-0003" },
    ];
    expect(matchReceivable(r, list, new Set(), new Set())).toMatchObject({ type: "sale", saleId: 8, byName: true });
    expect(matchReceivable(r, list, new Set([8]), new Set())).toBeNull(); // two left by amount only: ambiguous
    expect(matchReceivable(r, list.slice(0, 1), new Set(), new Set())).toBeNull(); // the bank names another payer
    expect(matchReceivable(row({ description: "MOBILE DEPOSIT REF 4471", amount: -850 }), list.slice(0, 1), new Set(), new Set())).toMatchObject({ saleId: 7, byName: false });
    expect(matchReceivable(r, list, new Set(), new Set(["sale:8"]))).toBeNull();
    expect(matchReceivable(row({ description: "ZELLE TO CARLOS RUIZ", amount: 850 }), list, new Set(), new Set())).toBeNull(); // money out
  });
  it("a cash deposit matches the day's cash sales that add up exactly", () => {
    const r = row({ description: "BRANCH DEPOSIT 0417", amount: -320, date: "2026-11-17", category: "deposit" });
    const sales = [
      { saleId: 1, totalCents: 20000, day: "2026-11-16" },
      { saleId: 2, totalCents: 12000, day: "2026-11-16" },
      { saleId: 3, totalCents: 5000, day: "2026-11-16" },
      { saleId: 4, totalCents: 32000, day: "2026-11-10" },
    ];
    expect(matchCashSales(r, sales, new Set(), new Set())).toEqual({ type: "cash", saleIds: [1, 2], amounts: [200, 120], day: "2026-11-16" });
    expect(matchCashSales(r, sales, new Set([1]), new Set())).toBeNull();
    expect(matchCashSales(row({ description: "ZELLE FROM X", amount: -320, date: "2026-11-17" }), sales, new Set(), new Set())).toBeNull();
    expect(isCashDeposit({ category: "cash_deposit", description: "DEPOSIT" })).toBe(true);
    expect(isCashDeposit({ category: "deposit", description: "MOBILE DEPOSIT CHECK" })).toBe(false);
  });
  it("subset sum finds the fewest sales", () => {
    expect(subsetSum([100, 200, 300], 300)).toEqual([2]);
    expect(subsetSum([100, 250], 300)).toBeNull();
    expect(subsetSum([], 1)).toBeNull();
  });
  it("money out matches an unpaid bill by vendor and exact amount", () => {
    const r = row({ description: "SEGUROS DEL VALLE AUTOPAY", amount: 540 });
    const bills = [{ billId: 5, vendorName: "Seguros del Valle", description: "Seguro", amountCents: 54000, dueDate: "2026-12-01" }];
    expect(matchBill(r, bills, new Set(), new Set())).toMatchObject({ type: "bill", billId: 5 });
    expect(matchBill(row({ description: "SEGUROS DEL VALLE", amount: 541 }), bills, new Set(), new Set())).toBeNull();
    expect(matchBill(row({ description: "OTRO PROVEEDOR", amount: 540 }), bills, new Set(), new Set())).toBeNull();
    expect(matchBill(r, bills, new Set([5]), new Set())).toBeNull();
  });
});

describe("splits", () => {
  it("parts must be 2+, above zero, and add up to the cent", () => {
    expect(splitProblem([{ category: "shopping", amountCents: 18000 }, { category: "home_expense", amountCents: 6860 }], 24860)).toBeNull();
    expect(splitProblem([{ category: "shopping", amountCents: 24860 }], 24860)).toBe("parts");
    expect(splitProblem([{ category: "shopping", amountCents: 24860 }, { category: "home_expense", amountCents: 0 }], 24860)).toBe("zero");
    expect(splitProblem([{ category: "shopping", amountCents: 18000 }, { category: "home_expense", amountCents: 6800 }], 24860)).toBe("sum");
  });
  it("the movement keeps its largest business part as category", () => {
    expect(mainCategoryOf([{ category: "home_expense", amountCents: 20000 }, { category: "shopping", amountCents: 4860 }])).toBe("shopping");
    expect(mainCategoryOf([{ category: "home_expense", amountCents: 1 }, { category: "home_expense", amountCents: 2 }])).toBe("home_expense");
  });
  it("category totals count a split by its parts and never change the grand total", () => {
    const rows = [{ id: 1, category: "shopping", amountCents: 24860 }, { id: 2, category: "gasolina", amountCents: 6210 }];
    const totals = categoryTotals(rows, new Map([[1, [{ category: "shopping", amountCents: 18000 }, { category: "home_expense", amountCents: 6860 }]]]));
    expect(Object.fromEntries(totals)).toEqual({ shopping: 18000, home_expense: 6860, gasolina: 6210 });
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(24860 + 6210);
  });
});

describe("most used categories", () => {
  it("counts per direction, most used first", () => {
    const h = buildHistory([
      { description: "A 1", category: "gasolina", type: "expense" },
      { description: "B 1", category: "gasolina", type: "expense" },
      { description: "C 1", category: "shopping", type: "expense" },
      { description: "D 1", category: "zelle_income", type: "income" },
    ]);
    expect(topCategories(h, "expense")).toEqual(["gasolina", "shopping"]);
    expect(topCategories(h, "income")).toEqual(["zelle_income"]);
  });
});
