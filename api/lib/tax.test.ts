import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptTaxFile, encryptTaxFile, TaxKeyMissingError } from "./taxCrypto";
import { alabamaDay, canSend, currentTaxYear, isClientDocKind, missingToSend, shownDocKinds, taxReminder } from "@contracts/taxRules";
import { sniffTaxFile } from "../tax-router";

const KEY = randomBytes(32).toString("base64");

describe("tax file encryption", () => {
  it("gets back exactly what was stored", () => {
    const plain = Buffer.from("W-2 2026 · SSN 123-45-6789");
    const stored = encryptTaxFile(plain, KEY);
    expect(stored.includes(plain)).toBe(false);
    expect(decryptTaxFile(stored, KEY).equals(plain)).toBe(true);
  });

  it("uses a new IV every time", () => {
    const plain = Buffer.from("same file");
    expect(encryptTaxFile(plain, KEY).equals(encryptTaxFile(plain, KEY))).toBe(false);
  });

  it("refuses a changed file or the wrong key", () => {
    const stored = encryptTaxFile(Buffer.from("original"), KEY);
    const tampered = Buffer.from(stored);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptTaxFile(tampered, KEY)).toThrow();
    expect(() => decryptTaxFile(stored, randomBytes(32).toString("base64"))).toThrow();
  });

  it("won't store anything without a key", () => {
    expect(() => encryptTaxFile(Buffer.from("x"), "")).toThrow(TaxKeyMissingError);
    expect(() => encryptTaxFile(Buffer.from("x"), Buffer.alloc(16).toString("base64"))).toThrow();
  });
});

describe("tax year", () => {
  it("from October on, works on this year's taxes", () => {
    expect(currentTaxYear(new Date(2026, 10, 21))).toBe(2026);
    expect(currentTaxYear(new Date(2026, 9, 1))).toBe(2026);
  });
  it("before October, on last year's", () => {
    expect(currentTaxYear(new Date(2027, 1, 10))).toBe(2026);
    expect(currentTaxYear(new Date(2027, 3, 14))).toBe(2026);
  });
});

describe("Para hoy's tax reminder, by season", () => {
  // noon in Alabama (18:00 UTC in winter, 17:00 in spring)
  const at = (y: number, m: number, d: number, h = 18) => new Date(Date.UTC(y, m - 1, d, h));
  it("stays out from October to December: that year's documents don't exist yet", () => {
    expect(taxReminder(2026, at(2026, 10, 1)).phase).toBe("off");
    expect(taxReminder(2026, at(2026, 11, 25)).phase).toBe("off");
    expect(taxReminder(2026, at(2026, 12, 31)).phase).toBe("off");
  });
  it("uses Alabama's day: 11 pm on December 31 there is still December", () => {
    const lateNight = new Date(Date.UTC(2027, 0, 1, 5)); // 11 pm Dec 31 in Central time
    expect(alabamaDay(lateNight)).toBe("2026-12-31");
    expect(taxReminder(2026, lateNight).phase).toBe("off");
  });
  it("January says when the W-2s arrive; February on, the usual reminder", () => {
    expect(taxReminder(2026, at(2027, 1, 1)).phase).toBe("w2");
    expect(taxReminder(2026, at(2027, 1, 31)).phase).toBe("w2");
    expect(taxReminder(2026, at(2027, 2, 1)).phase).toBe("open");
    expect(taxReminder(2026, at(2027, 4, 1, 17)).phase).toBe("open");
  });
  it("the last two weeks count the days, then it goes", () => {
    expect(taxReminder(2026, at(2027, 4, 2, 17))).toEqual({ phase: "last", daysLeft: 13, deadline: "2027-04-15" });
    expect(taxReminder(2026, at(2027, 4, 14, 17)).daysLeft).toBe(1);
    expect(taxReminder(2026, at(2027, 4, 15, 17))).toEqual({ phase: "last", daysLeft: 0, deadline: "2027-04-15" });
    expect(taxReminder(2026, at(2027, 4, 16, 17)).phase).toBe("after");
    expect(taxReminder(2026, at(2027, 7, 1, 17)).phase).toBe("after");
  });
  it("a deadline moved off a weekend moves the last two weeks with it", () => {
    // April 15, 2028 is a Saturday: the deadline is Monday the 17th
    expect(taxReminder(2027, at(2028, 4, 4, 17))).toEqual({ phase: "last", daysLeft: 13, deadline: "2028-04-17" });
    expect(taxReminder(2027, at(2028, 4, 3, 17)).phase).toBe("open");
  });
});

describe("documents to send", () => {
  const all = { married: false, deps: false, self: false, home: false, mkt: false };

  it("asks for the spouse's documents only when married", () => {
    expect(shownDocKinds("personal", all).some((k) => k.id === "spouse")).toBe(false);
    expect(shownDocKinds("personal", { ...all, married: true }).some((k) => k.id === "spouse")).toBe(true);
  });

  it("needs every question answered, ID, Social Security and one income document", () => {
    const m = missingToSend("personal", { married: false }, {});
    expect(m.questions).toEqual(["deps", "self", "home", "mkt"]);
    expect(m.docs).toEqual(["id", "ssn"]);
    expect(m.income).toBe(true);
    expect(canSend(m)).toBe(false);
  });

  it("pay stubs are enough while the W-2 arrives", () => {
    expect(canSend(missingToSend("personal", all, { id: 1, ssn: 1, pay: 2 }))).toBe(true);
  });

  it("a married person also needs the spouse's documents", () => {
    const m = missingToSend("personal", { ...all, married: true }, { id: 1, ssn: 1, w2: 1 });
    expect(m.docs).toEqual(["spouse"]);
  });

  it("business doesn't require an income document (the app has the records)", () => {
    const biz = { married: false, deps: false, k1099: false, employees: false, vehicle: false };
    expect(canSend(missingToSend("business", biz, { id: 1, ssn: 1 }))).toBe(true);
    expect(missingToSend("business", { ...biz, employees: true }, { id: 1, ssn: 1 }).docs).toEqual(["payroll"]);
  });

  it("only accepts this mode's document types", () => {
    expect(isClientDocKind("personal", "w2")).toBe(true);
    expect(isClientDocKind("personal", "payroll")).toBe(false);
    expect(isClientDocKind("business", "final_fed")).toBe(false);
  });
});

describe("file type check", () => {
  it("accepts a real PDF, JPEG and PNG", () => {
    expect(sniffTaxFile(Buffer.from("%PDF-1.7 ..."), "application/pdf")).toBe(true);
    expect(sniffTaxFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "image/jpeg")).toBe(true);
    expect(sniffTaxFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "image/png")).toBe(true);
  });
  it("refuses HTML dressed up as a PDF or an image", () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    expect(sniffTaxFile(html, "application/pdf")).toBe(false);
    expect(sniffTaxFile(html, "image/jpeg")).toBe(false);
    expect(sniffTaxFile(html, "image/png")).toBe(false);
  });
});
