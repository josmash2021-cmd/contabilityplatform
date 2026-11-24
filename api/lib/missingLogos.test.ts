import { describe, expect, it } from "vitest";
import { businessLabel, groupMissing } from "./missingLogos";

describe("Comercios sin logo", () => {
  it("names the business from the bank's text", () => {
    expect(businessLabel("ATS ALABASTER AL")).toBe("Ats Alabaster");
    expect(businessLabel("PURCHASE AUTHORIZED ON 11/18 JACK'S FAMILY REST 1234 HOOVER AL")).toBe("Jack's Family Rest");
    expect(businessLabel("SQ *TACOS EL GUERO")).toBe("Tacos El Guero");
    expect(businessLabel("PIGGLY WIGGLY #12")).toBe("Piggly Wiggly");
  });
  it("one line per business, the ones with a logo left out, most people first", () => {
    const rows = [
      { merchantName: null, description: "JACK'S FAMILY REST 1234 HOOVER AL", n: 3, people: 1, last: "2026-11-02" },
      { merchantName: null, description: "JACK'S FAMILY REST 5678 PELHAM AL", n: 2, people: 2, last: "2026-11-20" },
      { merchantName: "Starbucks", description: "STARBUCKS STORE 1234", n: 9, people: 4, last: "2026-11-21" },
      { merchantName: null, description: "PIGGLY WIGGLY #12", n: 1, people: 1, last: "2026-10-01" },
      { merchantName: null, description: "MONTHLY SERVICE FEE", n: 5, people: 3, last: "2026-11-01" },
    ];
    const out = groupMissing(rows, [false, false, true, false, false]);
    expect(out.map((r) => r.name)).toEqual(["Jack's Family Rest", "Piggly Wiggly"]);
    expect(out[0]).toMatchObject({ count: 5, people: 2, last: "2026-11-20" });
  });
});
