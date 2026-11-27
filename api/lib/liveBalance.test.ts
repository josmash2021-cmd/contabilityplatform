import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./brandTables", () => ({ ensureBrandTables: async () => {} }));
import { askBanksNow, balancesNow, EVERY_MS, heldBanks, liveOn, resetLive, usedToday } from "./liveBalance";

// A database standing in for bankInstitutions: one user's rows by item key (the queries here filter by user).
type Row = { itemId: string; bankUpdatedAt: Date | null; liveBalanceAt: Date | null; txRefreshAt: Date | null };
function fakeDb(rows: Record<string, Partial<Row>> = {}) {
  const table = new Map<string, Row>(Object.entries(rows).map(([k, r]) => [k, { itemId: k, bankUpdatedAt: null, liveBalanceAt: null, txRefreshAt: null, ...r }]));
  const db = {
    select: () => ({ from: () => ({ where: async () => [...table.values()].map((r) => ({ itemId: r.itemId, bankAt: r.bankUpdatedAt, liveAt: r.liveBalanceAt, refreshAt: r.txRefreshAt })) }) }),
    insert: () => ({
      values: (v: { itemId: string } & Partial<Row>) => ({
        onDuplicateKeyUpdate: async ({ set }: { set: Partial<Row> }) => {
          const r = table.get(v.itemId);
          if (r) Object.assign(r, set);
          else table.set(v.itemId, { bankUpdatedAt: null, liveBalanceAt: null, txRefreshAt: null, ...v });
        },
      }),
    }),
  };
  return { db: db as never, table };
}

const CACHED = { data: { accounts: [{ account_id: "a1", balances: { current: 100 } }] } };
const LIVE = { data: { accounts: [{ account_id: "a1", balances: { current: 350 } }] } };
const T0 = Date.parse("2026-11-26T12:00:00Z");
const plaidError = (code: string) => Object.assign(new Error(code), { response: { data: { error_code: code } } });

const env = { ...process.env };
beforeEach(() => { resetLive(); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

describe("the bank's balance at this moment (paid): off until Railway switches it on", () => {
  it("off: always Plaid's copy, never the paid call, and nothing is held", async () => {
    delete process.env.PLAID_LIVE_BALANCE;
    expect(liveOn("balance")).toBe(false);
    const { db } = fakeDb({ "item-1": { liveBalanceAt: new Date(T0), bankUpdatedAt: new Date(T0 - 3600e3) } });
    const client = { accountsBalanceGet: vi.fn(async () => LIVE) };
    const r = await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0);
    expect(r).toEqual({ ...CACHED, live: false });
    expect(client.accountsBalanceGet).not.toHaveBeenCalled();
    expect((await heldBanks(db, 7, T0)).size).toBe(0);
  });

  it("on: from the bank, then Plaid's copy for 15 minutes, then from the bank again", async () => {
    process.env.PLAID_LIVE_BALANCE = "on";
    const { db, table } = fakeDb();
    const client = { accountsBalanceGet: vi.fn(async () => LIVE) };
    expect(await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0)).toEqual({ ...LIVE, live: true });
    expect(table.get("item-1")?.liveBalanceAt?.getTime()).toBe(T0);
    expect(await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0 + EVERY_MS.balance - 1000)).toEqual({ ...CACHED, live: false });
    expect(await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0 + EVERY_MS.balance + 1000)).toEqual({ ...LIVE, live: true });
    expect(client.accountsBalanceGet).toHaveBeenCalledTimes(2);
    expect(usedToday("balance", T0)).toBe(2);
  });

  it("two screens opening at once: one paid call", async () => {
    process.env.PLAID_LIVE_BALANCE = "on";
    const { db } = fakeDb();
    const client = { accountsBalanceGet: vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return LIVE; }) };
    const both = await Promise.all([1, 2].map(() => balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0)));
    expect(both.map((r) => r.live).sort()).toEqual([false, true]);
    expect(client.accountsBalanceGet).toHaveBeenCalledTimes(1);
  });

  it("a failed call isn't counted and can be tried again; Plaid's copy is used meanwhile", async () => {
    process.env.PLAID_LIVE_BALANCE = "on";
    const { db, table } = fakeDb({ "item-1": { liveBalanceAt: new Date(T0 - 3600e3) } });
    const client = { accountsBalanceGet: vi.fn().mockRejectedValueOnce(plaidError("INSTITUTION_DOWN")).mockResolvedValue(LIVE) };
    expect(await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0)).toEqual({ ...CACHED, live: false });
    expect(table.get("item-1")?.liveBalanceAt?.getTime()).toBe(T0 - 3600e3);
    expect(usedToday("balance", T0)).toBe(0);
    expect(await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0 + 1000)).toEqual({ ...LIVE, live: true });
  });

  it("Plaid says the product isn't enabled: pauses 6 hours instead of asking again and again", async () => {
    process.env.PLAID_LIVE_BALANCE = "on";
    const { db } = fakeDb();
    const client = { accountsBalanceGet: vi.fn(async () => { throw plaidError("INVALID_PRODUCT"); }) };
    await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0);
    await balancesNow(db, client, 7, "item-2", "tok", async () => CACHED, T0 + 60_000);
    await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0 + 5 * 3600e3);
    expect(client.accountsBalanceGet).toHaveBeenCalledTimes(1);
    await balancesNow(db, client, 7, "item-1", "tok", async () => CACHED, T0 + 6 * 3600e3 + 1000);
    expect(client.accountsBalanceGet).toHaveBeenCalledTimes(2);
  });

  it("never more than the daily cap for the whole app", async () => {
    process.env.PLAID_LIVE_BALANCE = "on";
    process.env.PLAID_LIVE_BALANCE_DAILY_CAP = "2";
    const { db } = fakeDb();
    const client = { accountsBalanceGet: vi.fn(async () => LIVE) };
    for (const k of ["item-1", "item-2", "item-3", "item-4"]) await balancesNow(db, client, 7, k, "tok", async () => CACHED, T0);
    expect(client.accountsBalanceGet).toHaveBeenCalledTimes(2);
    // a new day (UTC) starts the count again
    await balancesNow(db, client, 7, "item-3", "tok", async () => CACHED, T0 + 24 * 3600e3);
    expect(client.accountsBalanceGet).toHaveBeenCalledTimes(3);
  });
});

describe("Plaid's copy never goes over a newer balance from the bank", () => {
  it("held while Plaid's copy is older than the live balance; free again once Plaid's copy is newer", async () => {
    process.env.PLAID_LIVE_BALANCE = "on";
    const { db, table } = fakeDb({
      "item-1": { liveBalanceAt: new Date(T0), bankUpdatedAt: new Date(T0 - 3 * 24 * 3600e3) },
      "item-2": { liveBalanceAt: new Date(T0 - 3600e3), bankUpdatedAt: new Date(T0) },
      "item-3": { bankUpdatedAt: new Date(T0) },
    });
    expect([...(await heldBanks(db, 7, T0))]).toEqual(["item-1"]);
    table.get("item-1")!.bankUpdatedAt = new Date(T0 + 60_000);
    expect((await heldBanks(db, 7, T0 + 60_000)).size).toBe(0);
  });
  it("no date for Plaid's copy: the live balance is kept 6 hours at most", async () => {
    process.env.PLAID_LIVE_BALANCE = "on";
    const { db } = fakeDb({ "item-1": { liveBalanceAt: new Date(T0) } });
    expect((await heldBanks(db, 7, T0 + 5 * 3600e3)).has("item-1")).toBe(true);
    expect((await heldBanks(db, 7, T0 + 7 * 3600e3)).has("item-1")).toBe(false);
  });
});

describe("asking Plaid to go to the bank now (paid): only on a pull, once per bank per hour", () => {
  it("off: never asks", async () => {
    delete process.env.PLAID_TX_REFRESH;
    const { db } = fakeDb();
    const client = { transactionsRefresh: vi.fn(async () => ({ data: {} })) };
    expect(await askBanksNow(db, client, 7, [{ key: "item-1", token: "tok" }], T0)).toBe(0);
    expect(client.transactionsRefresh).not.toHaveBeenCalled();
  });
  it("on: once per bank, again only after an hour", async () => {
    process.env.PLAID_TX_REFRESH = "on";
    const { db } = fakeDb();
    const client = { transactionsRefresh: vi.fn(async () => ({ data: {} })) };
    const banks = [{ key: "item-1", token: "t1" }, { key: "item-2", token: "t2" }];
    expect(await askBanksNow(db, client, 7, banks, T0)).toBe(2);
    expect(await askBanksNow(db, client, 7, banks, T0 + 30 * 60_000)).toBe(0);
    expect(await askBanksNow(db, client, 7, banks, T0 + EVERY_MS.refresh + 1000)).toBe(2);
    expect(client.transactionsRefresh).toHaveBeenCalledTimes(4);
  });
  it("switching on the refresh doesn't switch on the balance (each one is its own)", () => {
    process.env.PLAID_TX_REFRESH = "on";
    delete process.env.PLAID_LIVE_BALANCE;
    expect(liveOn("refresh")).toBe(true);
    expect(liveOn("balance")).toBe(false);
  });
});

describe("on by default only in production with the real Plaid (owner, 2026-11-27)", () => {
  const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  it("production, real Plaid, nothing set in Railway: both on", () => {
    expect(liveOn("balance", prod)).toBe(true);
    expect(liveOn("refresh", prod)).toBe(true);
  });
  it("Railway can switch each one off", () => {
    expect(liveOn("balance", { ...prod, PLAID_LIVE_BALANCE: "off" })).toBe(false);
    expect(liveOn("refresh", { ...prod, PLAID_TX_REFRESH: "0" })).toBe(false);
    expect(liveOn("balance", { ...prod, PLAID_TX_REFRESH: "off" })).toBe(true);
  });
  it("a local server with a fake Plaid, or tests: off unless switched on", () => {
    expect(liveOn("balance", { ...prod, PLAID_BASE_URL: "http://127.0.0.1:4998" })).toBe(false);
    expect(liveOn("balance", { ...prod, PLAID_BASE_URL: "http://127.0.0.1:4998", PLAID_LIVE_BALANCE: "on" })).toBe(true);
    expect(liveOn("refresh", { NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
