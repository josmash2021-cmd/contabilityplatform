import { describe, expect, it } from "vitest";
import { buildOverview, monthlyValue, userStatus, weekStart, zonedDay, type AdminPayRow, type AdminSubRow, type AdminUserRow } from "./adminOverview";
import { getTrialInfo } from "./trial";

const NOW = new Date("2026-11-23T16:00:00Z"); // Monday 10 a.m. in Alabama
const day = (iso: string) => new Date(iso);
const user = (id: number, over: Partial<AdminUserRow> = {}): AdminUserRow => ({
  id, name: `U${id}`, email: `u${id}@x.com`, role: "user", modePreference: "business", createdAt: day("2026-11-01T12:00:00Z"), ...over,
});
const sub = (userId: number, over: Partial<AdminSubRow> = {}): AdminSubRow => ({
  userId, plan: "monthly", status: "active", currentPeriodStart: day("2026-11-10T00:00:00Z"), currentPeriodEnd: day("2026-12-10T00:00:00Z"),
  cancelAtPeriodEnd: false, stripeSubscriptionId: "sub_1", createdAt: day("2026-10-10T00:00:00Z"), updatedAt: day("2026-11-10T00:00:00Z"), ...over,
});
const pay = (userId: number, amount: number, paidAt: string, over: Partial<AdminPayRow> = {}): AdminPayRow => ({ userId, amount: amount.toFixed(2), plan: "monthly", status: "succeeded", paidAt: day(paidAt), ...over });

describe("getTrialInfo with extra days", () => {
  it("keeps the 7 days, and the extension only makes it longer", () => {
    const created = day("2026-11-21T00:00:00Z");
    expect(getTrialInfo(created, NOW)?.daysLeft).toBe(5);
    expect(getTrialInfo(created, NOW, day("2026-11-25T00:00:00Z"))?.daysLeft).toBe(5); // earlier than the 7 days: no change
    expect(getTrialInfo(created, NOW, day("2026-12-03T00:00:00Z"))?.daysLeft).toBe(10);
  });
  it("gives a trial to an account older than the trial itself", () => {
    const old = day("2026-08-01T00:00:00Z");
    expect(getTrialInfo(old, NOW)).toBeNull();
    expect(getTrialInfo(old, NOW, day("2026-11-30T16:00:00Z"))).toMatchObject({ active: true, daysLeft: 7 });
  });
});

describe("userStatus", () => {
  it("admin, blocked", () => {
    expect(userStatus(user(1, { role: "admin" }), [], [], null, NOW).kind).toBe("admin");
    expect(userStatus(user(1, { role: "blocked" }), [], [], null, NOW).kind).toBe("blocked");
  });
  it("in the trial, with days left", () => {
    expect(userStatus(user(1, { createdAt: day("2026-11-21T00:00:00Z") }), [], [], null, NOW)).toMatchObject({ kind: "trial", daysLeft: 5 });
  });
  it("paying: plan, what was charged and the plan it matches", () => {
    const s = userStatus(user(1), [sub(1)], [pay(1, 80, "2026-11-10T00:00:00Z")], null, NOW);
    expect(s).toMatchObject({ kind: "paying", plan: "monthly", amount: 80, tier: "pro", cancels: false });
    expect(monthlyValue(s)).toBe(80);
    const a = userStatus(user(2), [sub(2, { plan: "annual" })], [pay(2, 1500, "2026-11-10T00:00:00Z", { plan: "annual" })], null, NOW);
    expect(a).toMatchObject({ kind: "paying", tier: "business" });
    expect(monthlyValue(a)).toBe(125);
  });
  it("paying during the trial counts as paying", () => {
    expect(userStatus(user(1, { createdAt: day("2026-11-21T00:00:00Z") }), [sub(1)], [pay(1, 40, "2026-11-22T00:00:00Z")], null, NOW).kind).toBe("paying");
  });
  it("the last charge failed, or Stripe says past due", () => {
    expect(userStatus(user(1), [sub(1)], [pay(1, 80, "2026-10-10T00:00:00Z"), pay(1, 80, "2026-11-10T00:00:00Z", { status: "failed" })], null, NOW)).toMatchObject({ kind: "failed", amount: 80 });
    expect(userStatus(user(1), [sub(1, { status: "past_due" })], [pay(1, 80, "2026-11-10T00:00:00Z", { status: "failed" })], null, NOW).kind).toBe("failed");
  });
  it("access given by the admin is a gift, not a payment", () => {
    const g = sub(1, { stripeSubscriptionId: "ADMIN_GRANT_1", currentPeriodStart: day("2026-11-10T00:00:00Z") });
    expect(userStatus(user(1), [g], [pay(1, 800, "2026-11-10T00:00:30Z", { plan: "annual" })], null, NOW).kind).toBe("gift");
  });
  it("canceled, ended period, free personal, business with nothing", () => {
    expect(userStatus(user(1), [sub(1, { status: "cancelled" })], [], null, NOW).kind).toBe("canceled");
    expect(userStatus(user(1), [sub(1, { currentPeriodEnd: day("2026-11-01T00:00:00Z") })], [], null, NOW).kind).toBe("canceled");
    expect(userStatus(user(1, { modePreference: "personal" }), [], [], null, NOW).kind).toBe("free");
    expect(userStatus(user(1), [], [], null, NOW).kind).toBe("ended");
  });
  it("more free days bring an ended trial back", () => {
    expect(userStatus(user(1), [], [], day("2026-11-26T16:00:00Z"), NOW)).toMatchObject({ kind: "trial", daysLeft: 3 });
  });
});

describe("days and weeks in Alabama", () => {
  it("a late-evening UTC time is still the day before in Alabama", () => {
    expect(zonedDay(day("2026-11-23T03:00:00Z"))).toBe("2026-11-22");
  });
  it("weeks start on Monday", () => {
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
  });
});

describe("buildOverview: the numbers add up", () => {
  const users = [
    user(1, { role: "admin" }),
    user(2), // pays Pro monthly
    user(3, { modePreference: "personal" }), // pays Personal Pro annual
    user(4, { createdAt: day("2026-11-21T00:00:00Z") }), // trial, 5 days left
    user(5), // older account: the admin gave free days until Nov 25 (2 days left)
    user(6), // payment failed
    user(7), // canceled this month
    user(8, { createdAt: day("2026-11-12T00:00:00Z") }), // business, before the trial existed, never paid
    user(9, { modePreference: "personal", createdAt: day("2026-11-23T14:00:00Z") }), // signed up today
  ];
  const subs = [sub(2), sub(3, { plan: "annual" }), sub(6, { status: "past_due" }), sub(7, { status: "cancelled", updatedAt: day("2026-11-15T00:00:00Z") })];
  const pays = [
    pay(2, 80, "2026-10-10T00:00:00Z"), pay(2, 80, "2026-11-10T00:00:00Z"),
    pay(3, 400, "2026-11-05T00:00:00Z", { plan: "annual" }),
    pay(6, 80, "2026-11-10T00:00:00Z", { status: "failed" }),
    pay(1, 999, "2026-11-10T00:00:00Z"), // admin's own test payment: still money in, but the admin isn't a customer
  ];
  const o = buildOverview({ users, subs, pays, trialUntil: new Map([[5, day("2026-11-25T16:00:00Z")]]), taxes: [], support: { chats: 2, oldestAt: day("2026-11-23T15:35:00Z") }, now: NOW });

  it("paying: only those paid up (no trials, no canceled, no failed)", () => {
    expect(o.paying).toMatchObject({ count: 2, monthly: 1, annual: 1, canceledThisMonth: 1 });
    expect(o.money.mrr).toBeCloseTo(80 + 400 / 12, 2);
  });
  it("collected per month counts succeeded payments", () => {
    expect(o.money.collectedThisMonth).toBe(80 + 400 + 999);
    expect(o.money.collectedLastMonth).toBe(80);
  });
  it("trials, and who ends soon", () => {
    expect(o.trials.count).toBe(3); // users 4, 5 and 9
    expect(o.trials.endingSoon).toEqual([expect.objectContaining({ id: 5, daysLeft: 2 })]);
    expect(o.trials.ended).toBe(0);
  });
  it("sign-ups this week (Monday, Alabama) and last week", () => {
    expect(o.signups).toMatchObject({ thisWeek: 1, personal: 1, business: 0 });
    expect(o.signups.lastWeek).toBe(1); // user 4 (Nov 21)
  });
  it("12 weeks, the last one is this week", () => {
    expect(o.weeks).toHaveLength(12);
    expect(o.weeks[11].start).toBe("2026-11-23");
  });
  it("for today: failed payments and support", () => {
    expect(o.today.failed.map((f) => f.id)).toEqual([6]);
    expect(o.today.support.chats).toBe(2);
  });
  it("recent activity is newest first", () => {
    expect(o.activity[0]).toMatchObject({ kind: "signup", userId: 9 });
  });
});
