import { describe, expect, it } from "vitest";
import {
  bundledBankLogo, bundledMerchantLogo, candidateKeys, isBankOwnMovement, cleanAccountName, cleanWebsite, contrast, directLogoOf, institutionLogoDataUrl,
  looksMangled, merchantBrandOf, merchantKey, monogram, monogramColors, normalizeColor, plaidErrorCode,
  repairedName, safeLogoUrl, statusForError,
} from "./brand";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("connection status from Plaid errors", () => {
  it("login problems need a reconnect", () => {
    for (const c of ["ITEM_LOGIN_REQUIRED", "INVALID_CREDENTIALS", "ITEM_LOCKED", "PENDING_EXPIRATION", "INVALID_ACCESS_TOKEN", "item_login_required"]) {
      expect(statusForError(c)).toBe("needs_reconnect");
    }
  });
  it("bank or Plaid outages are plain errors", () => {
    expect(statusForError("INSTITUTION_DOWN")).toBe("error");
    expect(statusForError("INTERNAL_SERVER_ERROR")).toBe("error");
  });
  it("no code (our own timeout) and neutral answers are not recorded", () => {
    expect(statusForError(null)).toBeNull();
    expect(statusForError("")).toBeNull();
    expect(statusForError("PRODUCT_NOT_READY")).toBeNull();
    expect(statusForError("RATE_LIMIT_EXCEEDED")).toBeNull();
  });
  it("reads the code from the SDK's axios error only", () => {
    expect(plaidErrorCode({ response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } } })).toBe("ITEM_LOGIN_REQUIRED");
    expect(plaidErrorCode(new Error("timeout"))).toBeNull();
    expect(plaidErrorCode({ response: { data: { error_code: "<script>" } } })).toBeNull();
    expect(plaidErrorCode(null)).toBeNull();
  });
});

describe("institution logo and color", () => {
  it("turns Plaid's bare base64 PNG into a data URL", () => {
    expect(institutionLogoDataUrl(PNG)).toBe(`data:image/png;base64,${PNG}`);
    expect(institutionLogoDataUrl(` ${PNG.slice(0, 20)}\n${PNG.slice(20)} `)).toBe(`data:image/png;base64,${PNG}`);
  });
  it("refuses anything that isn't a PNG", () => {
    expect(institutionLogoDataUrl(null)).toBeNull();
    expect(institutionLogoDataUrl("PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=")).toBeNull(); // an SVG
    expect(institutionLogoDataUrl("iVBORw0KGgo<script>")).toBeNull();
  });
  it("normalizes colors", () => {
    expect(normalizeColor("#d71e28")).toBe("#D71E28");
    expect(normalizeColor("117aca")).toBe("#117ACA");
    expect(normalizeColor("#abc")).toBe("#AABBCC");
    expect(normalizeColor("red")).toBeNull();
    expect(normalizeColor("#d71e28; background:url(x)")).toBeNull();
  });
});

describe("bundled originals and monogram", () => {
  it("matches the three bundled banks by institution name", () => {
    expect(bundledBankLogo("Chase")?.src).toBe("/brands/banks/chase.png");
    expect(bundledBankLogo("JPMorgan Chase Bank")?.src).toBe("/brands/banks/chase.png");
    expect(bundledBankLogo("Bank of America")?.src).toBe("/brands/banks/bank-of-america.png");
    expect(bundledBankLogo("Wells Fargo")?.src).toBe("/brands/banks/wells-fargo.png");
    expect(bundledBankLogo("Regions Bank")).toBeNull();
    expect(bundledBankLogo("Purchase")).toBeNull(); // "chase" inside another word
    expect(bundledBankLogo(null)).toBeNull();
  });
  it("uses the first letter or digit", () => {
    expect(monogram("Regions Bank")).toBe("R");
    expect(monogram("ñandú")).toBe("Ñ");
    expect(monogram("7-Eleven")).toBe("7");
    expect(monogram("  ")).toBe("?");
  });
  it("tints the bank's color and keeps the letter readable", () => {
    const toRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    for (const c of ["#D71E28", "#117ACA", "#FFCD41", "#5A9E3A", "#000000", "#FFFFFF"]) {
      const { bg, fg } = monogramColors(c);
      expect(contrast(toRgb(fg), toRgb(bg))).toBeGreaterThanOrEqual(4.5);
    }
    expect(monogramColors(null)).toEqual({ bg: "#F1F5F9", fg: "#334155" });
    expect(monogramColors("nope")).toEqual({ bg: "#F1F5F9", fg: "#334155" });
  });
});

describe("merchant logos", () => {
  it("accepts https and inline images only", () => {
    expect(safeLogoUrl("https://plaid-merchant-logos.plaid.com/starbucks_956.png")).toBe("https://plaid-merchant-logos.plaid.com/starbucks_956.png");
    expect(safeLogoUrl("http://example.com/x.png")).toBeNull();
    expect(safeLogoUrl("javascript:alert(1)")).toBeNull();
    expect(safeLogoUrl("https://user:pw@example.com/x.png")).toBeNull();
    expect(safeLogoUrl(`data:image/png;base64,${PNG}`)).toBe(`data:image/png;base64,${PNG}`);
    expect(safeLogoUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(safeLogoUrl(`https://x.com/${"a".repeat(1200)}`)).toBeNull();
  });
  it("keeps plain websites", () => {
    expect(cleanWebsite("https://www.Starbucks.com/store")).toBe("starbucks.com");
    expect(cleanWebsite("costco.com")).toBe("costco.com");
    expect(cleanWebsite("not a site")).toBeNull();
  });
  it("normalizes merchant keys", () => {
    expect(merchantKey("Starbucks")).toBe("starbucks");
    expect(merchantKey("AT&T")).toBe("att");
    expect(merchantKey("Café Olé #12")).toBe("cafeole12");
    expect(merchantKey(null)).toBe("");
  });
  it("takes the brand from Plaid's merchant fields, never the raw description", () => {
    expect(merchantBrandOf({ merchant_name: "Starbucks", logo_url: "https://cdn.plaid.com/s.png", website: "starbucks.com" }))
      .toEqual({ key: "starbucks", name: "Starbucks", logoUrl: "https://cdn.plaid.com/s.png", website: "starbucks.com" });
    // Only the counterparty carries it.
    expect(merchantBrandOf({ merchant_name: null, counterparties: [{ name: "Shell", type: "merchant", logo_url: "https://cdn.plaid.com/shell.png", website: "shell.com" }] }))
      .toEqual({ key: "shell", name: "Shell", logoUrl: "https://cdn.plaid.com/shell.png", website: "shell.com" });
    // A counterparty that is another business doesn't lend its logo.
    expect(merchantBrandOf({ merchant_name: "Netflix", counterparties: [{ name: "PayPal", logo_url: "https://cdn.plaid.com/pp.png" }] })).toBeNull();
    // Nothing worth keeping.
    expect(merchantBrandOf({ merchant_name: "Tacos El Pastor" })).toBeNull();
    expect(merchantBrandOf({ merchant_name: null, logo_url: "https://cdn.plaid.com/x.png" })).toBeNull();
    expect(merchantBrandOf({ merchant_name: "Evil", logo_url: "javascript:alert(1)" })).toBeNull();
    expect(directLogoOf({ merchant_name: "Target", logo_url: "https://cdn.plaid.com/t.png" })).toBe("https://cdn.plaid.com/t.png");
  });
  it("finds keys in bank descriptions, best first", () => {
    expect(candidateKeys({ merchantName: "Starbucks", description: "STARBUCKS STORE 12345 AUSTIN TX" })[0]).toBe("starbucks");
    expect(candidateKeys({ description: "PURCHASE AUTHORIZED ON 11/18 TARGET T-1234 AUSTIN TX" })).toContain("target");
    expect(candidateKeys({ description: "SHELL OIL 57444211 AUSTIN TX" })).toContain("shell");
    expect(candidateKeys({ description: "AMAZON.COM*2K4LM0 AMZN.COM/BILL WA" })).toContain("amazon");
    expect(candidateKeys({ description: "AT&T*BILL PAYMENT" })).toContain("att");
    // A lone short first word doesn't count unless it's the whole name.
    expect(candidateKeys({ description: "BP 1234 GAS" })).not.toContain("bp");
    expect(candidateKeys({ merchantName: "BP" })).toContain("bp");
    expect(candidateKeys({})).toEqual([]);
  });
});

describe("account names", () => {
  it("keeps ® and other characters", () => {
    expect(cleanAccountName("Way2Save® Savings")).toBe("Way2Save® Savings");
    // NFD (R + combining) stored as NFC.
    expect(cleanAccountName("Café Checking")).toBe("Café Checking");
  });
  it("never stores replacement characters", () => {
    expect(cleanAccountName("Way2Save�� Savings", "Wells Fargo Way2Save® Savings")).toBe("Wells Fargo Way2Save® Savings");
    expect(cleanAccountName("Way2Save�� Savings", null)).toBe("Way2Save Savings");
    expect(cleanAccountName("x".repeat(150)).length).toBe(100);
  });
  it("repairs a broken stored name from Plaid", () => {
    expect(repairedName("Way2Save�� Savings", { name: "Way2Save® Savings" })).toBe("Way2Save® Savings");
    expect(repairedName("Way2Save® Savings", { name: "Way2Save® Savings" })).toBeNull();
    expect(repairedName("Old", { name: null })).toBeNull();
    expect(looksMangled("Way2Save�� Savings")).toBe(true);
    expect(looksMangled("Way2SaveÂ® Savings")).toBe(true);
    expect(looksMangled("Way2Save® Savings")).toBe(false);
  });
});

describe("the bank's own movements (shown with the bank's logo)", () => {
  it("provisional credits, fees, interest and adjustments are the bank's", () => {
    for (const d of ["PROVISIONAL CREDIT ADJUSTMENT 1118", "provisional", "MONTHLY SERVICE FEE", "OVERDRAFT FEE FOR A $45.00 ITEM",
      "NON-WF ATM FEE", "INTEREST PAYMENT", "WIRE TRANSFER FEE", "FOREIGN TRANSACTION FEE", "NSF RETURNED ITEM FEE"]) {
      expect(isBankOwnMovement(d), d).toBe(true);
    }
  });
  it("Plaid's bank-fee category counts too", () => {
    expect(isBankOwnMovement("SOMETHING", JSON.stringify({ primary: "BANK_FEES", detailed: "BANK_FEES_OTHER_BANK_FEES" }))).toBe(true);
  });
  it("a Zelle, a store or a local business is not", () => {
    for (const d of ["ZELLE TO CLEANING SERVICE", "TACOS EL PASTOR 2231", "STARBUCKS STORE 12345 AUSTIN TX", "AMAZON MKTPL*7T2RD1",
      "ONLINE TRANSFER TO SAVINGS", "Joe's Tire Shop", ""]) {
      expect(isBankOwnMovement(d), d).toBe(false);
    }
    expect(isBankOwnMovement("SHELL OIL", JSON.stringify({ primary: "TRANSPORTATION", detailed: "TRANSPORTATION_GAS" }))).toBe(false);
  });
});

describe("payment apps' saved originals", () => {
  it("a Zelle movement gets Zelle's own icon", () => {
    expect(bundledMerchantLogo("ZELLE TO CLEANING SERVICE")).toBe("/brands/merchants/zelle.png");
    expect(bundledMerchantLogo("Zelle payment from Rosa Diaz")).toBe("/brands/merchants/zelle.png");
  });
  it("nothing else does", () => {
    expect(bundledMerchantLogo("TACOS EL PASTOR LLC")).toBeNull();
    expect(bundledMerchantLogo("TACO BELL #1234")).toBeNull();
    expect(bundledMerchantLogo("")).toBeNull();
  });
  it("only our saved originals pass as a local path", () => {
    expect(safeLogoUrl("/brands/merchants/zelle.png")).toBe("/brands/merchants/zelle.png");
    expect(safeLogoUrl("/brands/../secret.png")).toBeNull();
    expect(safeLogoUrl("/api/trpc/x.png")).toBeNull();
    expect(safeLogoUrl("//evil.example/x.png")).toBeNull();
  });
});
