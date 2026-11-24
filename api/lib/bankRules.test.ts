import { describe, expect, it } from "vitest";
import { billFromPlaid, knownBill } from "./bankRules";

const k = (desc: string, detailed: string | null = null, amount = 50) => knownBill(desc, detailed, amount);

describe("knownBill: what a bank movement is, by its name", () => {
  it("paying a credit card (minimum, monthly, autopay), from checking and on the card", () => {
    for (const d of ["CAPITAL ONE MOBILE PMT", "CAPITAL ONE AUTOPAY PYMT", "DISCOVER E-PAYMENT 1234", "CHASE CREDIT CRD AUTOPAY", "AMEX EPAYMENT ACH PMT",
      "SYNCHRONY BANK PAYMENT", "CREDIT ONE BANK PAYMENT", "CITI CARD ONLINE PAYMENT", "MISSION LANE PAYMENT", "APPLE CARD GSBANK PAYMENT", "MERRICK BANK PAYMENT"]) {
      expect(k(d), d).toBe("card_payment");
    }
    expect(k("PAYMENT - THANK YOU", null, -120)).toBe("card_payment");
    expect(k("AUTOPAY PAYMENT - THANK YOU", null, -35)).toBe("card_payment");
    expect(k("ONLINE TRANSFER", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")).toBe("card_payment");
  });
  it("loans, buy now pay later and cash advances", () => {
    for (const d of ["UPSTART NETWORK PAYMENT", "ADVANCE AMERICA 1234", "AFFIRM * PAY 8XYZ", "KLARNA* NEWEGG", "AFTERPAY US", "ONEMAIN FINANCIAL", "SPEEDY CASH", "EARNIN ACTIVEHOURS", "WORLD FINANCE CORP"]) {
      expect(k(d), d).toBe("loan");
    }
  });
  it("rent: Flex, apartments, property managers", () => {
    for (const d of ["FLEX FINANCE", "GETFLEX.COM", "FLEX RENT 11/01", "THE RESERVE APARTMENTS", "ABC PROPERTY MANAGEMENT", "APPFOLIO RENT", "RENT PAYMENT NOV"]) {
      expect(k(d), d).toBe("rent");
    }
    expect(k("RENT-A-CENTER #1234")).toBeNull();
    expect(k("ENTERPRISE RENT-A-CAR")).toBeNull();
  });
  it("utilities: power, gas, water, phone, internet", () => {
    for (const d of ["ALABAMA POWER CO BILL PAY", "SPIRE ALABAMA", "BIRMINGHAM WATER WORKS", "HUNTSVILLE UTILITIES", "AT&T BILL PAYMENT", "ATT*BILL PAYMENT", "VERIZON WRLS PAYMENT",
      "T-MOBILE AUTO PAY", "CRICKET WIRELESS", "SPECTRUM", "JOE WHEELER EMC", "REPUBLIC SERVICES TRASH"]) {
      expect(k(d), d).toBe("utilities");
    }
  });
  it("health insurance", () => {
    for (const d of ["BLUE CROSS BLUE SHIELD AL", "BCBS OF ALABAMA PREMIUM", "BLUECROSS AL", "HUMANA INC", "AMBETTER HEALTH", "DELTA DENTAL"]) {
      expect(k(d), d).toBe("health_insurance");
    }
    expect(k("GEICO AUTO")).toBe("car_insurance");
  });
  it("government: Secretary of State, revenue, tags, IRS, courts (money out only)", () => {
    for (const d of ["ALABAMA SECRETARY OF STATE", "AL SOS ONLINE FILING", "ALABAMA DEPT OF REVENUE", "IRS USATAXPYMT", "SHELBY COUNTY TAG OFFICE", "CITY OF HOOVER MUNICIPAL COURT"]) {
      expect(k(d), d).toBe("government");
    }
    expect(k("IRS TREAS 310 TAX REF", null, -800)).toBeNull();
  });
  it("leaves everyone else alone (Plaid's guess and the other rules decide)", () => {
    for (const d of ["ATS ALABASTER AL", "AMAZON.COM*2K3AB", "NETFLIX.COM", "WALMART SUPERCENTER", "PLANET FITNESS", "CURRENT CARD", "PARENTS CLUB", "STARBUCKS STORE 1234",
      "ZELLE TO DAVE SMITH", "MATT JONES", "DISCOVERY KIDS"]) {
      expect(k(d), d).toBeNull();
    }
  });
});

describe("billFromPlaid: Plaid's category when the name says nothing", () => {
  it("rent and utilities apart (they used to land in Compras)", () => {
    expect(billFromPlaid("RENT_AND_UTILITIES_RENT", "PURCHASE 11/02", 900)).toBe("rent");
    expect(billFromPlaid("RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "ONLINE PMT", 140)).toBe("utilities");
    expect(billFromPlaid("RENT_AND_UTILITIES_TELEPHONE", "PMT", 80)).toBe("utilities");
  });
  it("card payments and other loans", () => {
    expect(billFromPlaid("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "ONLINE PMT", 200)).toBe("card_payment");
    expect(billFromPlaid("LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT", "ACH", 150)).toBe("loan");
  });
  it("health and car insurance among insurance; government fees and donations apart", () => {
    expect(billFromPlaid("GENERAL_SERVICES_INSURANCE", "BLUE CROSS AL", 300)).toBe("health_insurance");
    expect(billFromPlaid("GENERAL_SERVICES_INSURANCE", "PROGRESSIVE", 120)).toBe("car_insurance");
    expect(billFromPlaid("GENERAL_SERVICES_INSURANCE", "LEMONADE RENTERS", 20)).toBeNull();
    expect(billFromPlaid("GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES", "SOS", 50)).toBe("government");
    expect(billFromPlaid("GOVERNMENT_AND_NON_PROFIT_DONATIONS", "CHURCH", 50)).toBe("donations");
  });
});
