import { describe, expect, it } from "vitest";
import { isoDate, tzOffsetHours, RateLimiter, normalizeEmail } from "./security";

describe("isoDate", () => {
  it("accepts the format the frontend sends", () => {
    expect(isoDate.safeParse("2026-11-19").success).toBe(true);
  });

  it.each([
    "x' UNION SELECT password FROM users-- ",
    "2026-11-19' OR '1'='1",
    "2026-11-19;DROP TABLE users",
    "2026/11/19",
    "",
  ])("rejects %j", (value) => {
    expect(isoDate.safeParse(value).success).toBe(false);
  });
});

describe("tzOffsetHours", () => {
  it.each([-5, -4, 0, 1, 5.5, 5.75, 14, -12])("accepts %d", (v) => {
    expect(tzOffsetHours.safeParse(v).success).toBe(true);
  });
  it.each([15, -15, Infinity, NaN])("rejects %d", (v) => {
    expect(tzOffsetHours.safeParse(v).success).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("allows up to max attempts per window, then blocks", () => {
    let t = 0;
    const rl = new RateLimiter(3, 1000, () => t);
    expect([rl.consume("a"), rl.consume("a"), rl.consume("a")]).toEqual([true, true, true]);
    expect(rl.consume("a")).toBe(false);
    expect(rl.consume("b")).toBe(true); // other keys unaffected
    t = 1000;
    expect(rl.consume("a")).toBe(true); // window expired
  });

  it("reset clears the counter", () => {
    const rl = new RateLimiter(1, 1000, () => 0);
    expect(rl.consume("a")).toBe(true);
    expect(rl.consume("a")).toBe(false);
    rl.reset("a");
    expect(rl.consume("a")).toBe(true);
  });

  it("blocks a burst of concurrent attempts (tRPC batch)", () => {
    const rl = new RateLimiter(5, 60_000, () => 0);
    const results = Array.from({ length: 1000 }, () => rl.consume("reset:victim@x.com"));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });
});
