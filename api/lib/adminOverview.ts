// The admin's numbers, from one rule per person (userStatus), so every count on the panel adds up:
// who is in the free trial, who pays (and how much a month), whose payment failed, who canceled.
// Pure functions over plain rows (api/admin-router.ts loads them); days and weeks are Alabama time.
import { accountMode, tierFromAmountCents, type Plan, type Tier } from "./plans";
import { getTrialInfo, TRIAL_LAUNCH } from "./trial";

export const TZ = "America/Chicago";
/** Payments before this were tests (same cut as the total revenue). */
export const REVENUE_SINCE = new Date("2026-07-23T00:00:00Z");
const DAY_MS = 86_400_000;

export type AdminUserRow = {
  id: number; name: string | null; email: string | null; role: string | null; modePreference: string | null;
  createdAt: Date | string; lastSignInAt?: Date | string | null;
};
export type AdminSubRow = {
  userId: number; plan: Plan; status: string; currentPeriodStart?: Date | string | null; currentPeriodEnd: Date | string | null;
  cancelAtPeriodEnd: boolean | null; stripeSubscriptionId: string | null; createdAt: Date | string; updatedAt: Date | string;
};
export type AdminPayRow = {
  id?: number; userId: number; amount: string | number; plan: Plan; status: string; paidAt: Date | string;
  stripeInvoiceId?: string | null; stripePaymentIntentId?: string | null; receiptUrl?: string | null;
};

export type UserStatus =
  | { kind: "admin" }
  | { kind: "blocked" }
  | { kind: "trial"; daysLeft: number; endsAt: string }
  | { kind: "paying"; plan: Plan; amount: number; tier: Tier | null; cancels: boolean; periodEnd: string | null }
  | { kind: "gift"; plan: Plan; periodEnd: string | null }
  | { kind: "failed"; plan: Plan; amount: number; tier: Tier | null }
  | { kind: "canceled" }
  /** Personal Básico, free. */
  | { kind: "free" }
  /** A business account with no access: the trial ended (or it never had one) and nothing is paid. */
  | { kind: "ended" };

export type StatusKind = UserStatus["kind"];

const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : NaN);
const money = (v: string | number) => Math.round(Number(v) * 100) / 100;
export const isGrant = (s: Pick<AdminSubRow, "stripeSubscriptionId"> | null | undefined) => !!s?.stripeSubscriptionId?.startsWith("ADMIN_GRANT_");

/** The payment the admin's "grant access" writes with a granted subscription: not money that came in. */
export function isGiftPayment(p: AdminPayRow, subs: readonly AdminSubRow[]): boolean {
  return subs.some((s) => s.userId === p.userId && isGrant(s) && Math.abs(time(p.paidAt) - time(s.currentPeriodStart ?? s.createdAt)) < 5 * 60_000);
}

/** Latest row by a date field. */
function latest<T>(rows: readonly T[], at: (r: T) => Date | string | null | undefined): T | null {
  let best: T | null = null;
  for (const r of rows) if (!best || time(at(r)) > time(at(best))) best = r;
  return best;
}

/** The one rule: what this person is right now. */
export function userStatus(
  u: AdminUserRow,
  subs: readonly AdminSubRow[],
  pays: readonly AdminPayRow[],
  until: Date | null,
  now: Date = new Date(),
): UserStatus {
  if (u.role === "admin") return { kind: "admin" };
  if (u.role === "blocked") return { kind: "blocked" };
  const mine = subs.filter((s) => s.userId === u.id);
  const sub = latest(mine, (s) => s.createdAt);
  const myPays = pays.filter((p) => p.userId === u.id && !isGiftPayment(p, mine));
  const lastPay = latest(myPays, (p) => p.paidAt);
  const lastOk = latest(myPays.filter((p) => p.status === "succeeded"), (p) => p.paidAt);
  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : null;
  const paidUp = !!sub && (sub.status === "active" || sub.status === "trialing") && (!sub.currentPeriodEnd || time(sub.currentPeriodEnd) > now.getTime());
  const mode = accountMode(u.modePreference);

  if (paidUp && isGrant(sub)) return { kind: "gift", plan: sub!.plan, periodEnd };
  if (paidUp) {
    if (lastPay?.status === "failed") return { kind: "failed", plan: sub!.plan, amount: money(lastPay.amount), tier: tierFromAmountCents(Math.round(money(lastPay.amount) * 100), lastPay.plan, mode) };
    const amount = lastOk ? money(lastOk.amount) : 0;
    const tier = lastOk ? tierFromAmountCents(Math.round(amount * 100), lastOk.plan, mode) : null;
    return { kind: "paying", plan: sub!.plan, amount, tier, cancels: !!sub!.cancelAtPeriodEnd, periodEnd };
  }
  if (sub && (sub.status === "past_due" || sub.status === "unpaid")) {
    const amount = lastPay ? money(lastPay.amount) : 0;
    return { kind: "failed", plan: sub.plan, amount, tier: lastPay ? tierFromAmountCents(Math.round(amount * 100), lastPay.plan, mode) : null };
  }
  const trial = getTrialInfo(u.createdAt, now, until);
  if (trial?.active) return { kind: "trial", daysLeft: trial.daysLeft, endsAt: trial.endsAt };
  if (sub) return { kind: "canceled" };
  return mode === "personal" ? { kind: "free" } : { kind: "ended" };
}

/** What a paying person brings in a month (annual plans count a twelfth). */
export function monthlyValue(s: UserStatus): number {
  if (s.kind !== "paying") return 0;
  return s.plan === "annual" ? s.amount / 12 : s.amount;
}

/** "YYYY-MM-DD" of this moment in Alabama. */
export function zonedDay(d: Date | string, tz: string = TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
/** The Monday (Alabama) of the week this day is in, "YYYY-MM-DD". */
export function weekStart(day: string): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  const dow = new Date(t).getUTCDay();
  return new Date(t - ((dow + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}
function addDays(day: string, n: number): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}
function prevMonth(month: string): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export type TaxRow = { id: number; userId: number; name: string | null; step: number; submittedAt: Date | string | null; unread: number; pendingDocs: number };
export type SupportInfo = { chats: number; oldestAt: Date | null };
export type ActivityItem = {
  kind: "signup" | "payment" | "paymentFailed" | "taxSent" | "canceled" | "trialStarted";
  at: string; userId: number; name: string | null; mode: "business" | "personal"; amount?: number; plan?: Plan;
};

export type Overview = ReturnType<typeof buildOverview>;

/**
 * Where a payment came from: Stripe charged it, the admin wrote it down ("A mano": Zelle, cash), it's the row the
 * admin's "grant access" writes ("Regalo"), or it's from before REVENUE_SINCE ("Prueba", the owner's tests).
 * Only Stripe and A mano, when paid, count as income.
 */
export type PaySource = "stripe" | "manual" | "gift" | "test";
export function paymentSource(p: AdminPayRow, subs: readonly AdminSubRow[]): PaySource {
  if (isGiftPayment(p, subs)) return "gift";
  if (time(p.paidAt) < REVENUE_SINCE.getTime()) return "test";
  if (p.stripeInvoiceId || p.stripePaymentIntentId) return "stripe";
  return "manual";
}
/** Only what the admin wrote down (or an old test) can be edited or deleted: Stripe's and gifts stay as they are. */
export const editablePayment = (src: PaySource) => src === "manual" || src === "test";

/** The Pagos page: every payment with its source and month, the four numbers and the counts of each filter. */
export function buildPayments(input: {
  users: readonly AdminUserRow[]; subs: readonly AdminSubRow[]; pays: readonly (AdminPayRow & { id: number })[];
  trialUntil: ReadonlyMap<number, Date>; now?: Date;
}) {
  const now = input.now ?? new Date();
  const byId = new Map(input.users.map((u) => [u.id, u]));
  const rows = input.pays
    .map((p) => {
      const u = byId.get(p.userId);
      const source = paymentSource(p, input.subs);
      const amount = money(p.amount);
      const mode = accountMode(u?.modePreference);
      return {
        id: p.id, userId: p.userId, name: u?.name ?? null, email: u?.email ?? null, mode,
        amount, plan: p.plan, status: p.status, paidAt: new Date(p.paidAt).toISOString(), month: zonedDay(p.paidAt).slice(0, 7),
        source, counts: p.status === "succeeded" && (source === "stripe" || source === "manual"),
        tier: tierFromAmountCents(Math.round(amount * 100), p.plan, mode),
        receiptUrl: source === "stripe" ? p.receiptUrl ?? null : null,
        editable: editablePayment(source),
      };
    })
    .sort((a, b) => time(b.paidAt) - time(a.paidAt));
  const o = buildOverview({ users: input.users, subs: input.subs, pays: input.pays, trialUntil: input.trialUntil, taxes: [], support: { chats: 0, oldestAt: null }, now });
  const counted = rows.filter((r) => r.counts);
  const first = counted.length ? counted[counted.length - 1].paidAt : null;
  return {
    rows,
    money: {
      thisMonth: o.money.collectedThisMonth, lastMonth: o.money.collectedLastMonth, mrr: o.money.mrr,
      total: Math.round(counted.reduce((n, r) => n + r.amount, 0) * 100) / 100, since: first,
      thisMonthCount: counted.filter((r) => r.month === zonedDay(now).slice(0, 7)).length,
    },
    counts: {
      all: rows.length,
      paid: counted.length,
      failed: rows.filter((r) => r.status === "failed" && r.source !== "test").length,
      gift: rows.filter((r) => r.source === "gift").length,
      manual: rows.filter((r) => r.source === "manual").length,
      test: rows.filter((r) => r.source === "test").length,
    },
  };
}

/** Everything on the Resumen page. */
export function buildOverview(input: {
  users: readonly AdminUserRow[]; subs: readonly AdminSubRow[]; pays: readonly AdminPayRow[];
  trialUntil: ReadonlyMap<number, Date>; taxes: readonly TaxRow[]; support: SupportInfo; now?: Date;
}) {
  const now = input.now ?? new Date();
  const { users, subs, pays } = input;
  const people = users.map((u) => ({ u, s: userStatus(u, subs, pays, input.trialUntil.get(u.id) ?? null, now) }));
  const customers = people.filter((p) => p.s.kind !== "admin");
  const realPays = pays.filter((p) => !isGiftPayment(p, subs) && time(p.paidAt) >= REVENUE_SINCE.getTime());
  const okPays = realPays.filter((p) => p.status === "succeeded");

  const today = zonedDay(now);
  const month = today.slice(0, 7);
  const lastMonth = prevMonth(month);
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const mode = (u: AdminUserRow) => accountMode(u.modePreference);

  // Money
  const paying = customers.filter((p) => p.s.kind === "paying");
  const mrr = Math.round(paying.reduce((n, p) => n + monthlyValue(p.s), 0) * 100) / 100;
  const collected = (m: string) => Math.round(okPays.filter((p) => zonedDay(p.paidAt).startsWith(m)).reduce((n, p) => n + money(p.amount), 0) * 100) / 100;
  const firstOk = new Map<number, string>();
  for (const p of [...okPays].sort((a, b) => time(a.paidAt) - time(b.paidAt))) if (!firstOk.has(p.userId)) firstOk.set(p.userId, zonedDay(p.paidAt));
  const newPayingThisMonth = paying.filter((p) => firstOk.get(p.u.id)?.startsWith(month)).length;
  const canceledThisMonth = subs.filter((s) => s.status === "cancelled" && !isGrant(s) && zonedDay(s.updatedAt).startsWith(month)).length;

  // Free trial
  const trials = customers.filter((p) => p.s.kind === "trial");
  const endingSoon = trials
    .filter((p) => p.s.kind === "trial" && p.s.daysLeft <= 3)
    .map((p) => ({ id: p.u.id, name: p.u.name, email: p.u.email, daysLeft: (p.s as { daysLeft: number }).daysLeft }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const trialEnded = customers.filter((p) => {
    const c = time(p.u.createdAt);
    return c >= TRIAL_LAUNCH.getTime() && p.s.kind !== "trial" && c + 7 * DAY_MS < now.getTime();
  });
  const trialPaid = trialEnded.filter((p) => firstOk.has(p.u.id)).length;

  // Sign-ups
  const signupDay = (u: AdminUserRow) => zonedDay(u.createdAt);
  const weekOf = (u: AdminUserRow) => weekStart(signupDay(u));
  const signupsThisWeek = customers.filter((p) => weekOf(p.u) === thisWeek);
  const signupsLastWeek = customers.filter((p) => weekOf(p.u) === lastWeek).length;

  // The last 12 weeks
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(thisWeek, -7 * (11 - i))).map((start) => ({
    start,
    signups: customers.filter((p) => weekOf(p.u) === start).length,
    payments: okPays.filter((p) => weekStart(zonedDay(p.paidAt)) === start).length,
  }));

  // For today
  const failed = customers
    .filter((p) => p.s.kind === "failed")
    .map((p) => ({ id: p.u.id, name: p.u.name, email: p.u.email, amount: (p.s as { amount: number }).amount, plan: (p.s as { plan: Plan }).plan }));
  const taxWaiting = input.taxes.filter((r) => r.submittedAt && r.step < 4 && (r.step <= 2 || r.unread > 0 || r.pendingDocs > 0));

  // Recent activity
  const nameOf = new Map(users.map((u) => [u.id, u]));
  const act: ActivityItem[] = [];
  for (const p of customers) act.push({ kind: "signup", at: new Date(p.u.createdAt).toISOString(), userId: p.u.id, name: p.u.name, mode: mode(p.u) });
  for (const p of realPays) {
    const u = nameOf.get(p.userId);
    if (!u || u.role === "admin" || (p.status !== "succeeded" && p.status !== "failed")) continue;
    act.push({ kind: p.status === "succeeded" ? "payment" : "paymentFailed", at: new Date(p.paidAt).toISOString(), userId: p.userId, name: u.name, mode: mode(u), amount: money(p.amount), plan: p.plan });
  }
  for (const r of input.taxes) {
    const u = nameOf.get(r.userId);
    if (r.submittedAt && u) act.push({ kind: "taxSent", at: new Date(r.submittedAt).toISOString(), userId: r.userId, name: u.name, mode: mode(u) });
  }
  for (const s of subs) {
    const u = nameOf.get(s.userId);
    if (s.status === "cancelled" && !isGrant(s) && u) act.push({ kind: "canceled", at: new Date(s.updatedAt).toISOString(), userId: s.userId, name: u.name, mode: mode(u), plan: s.plan });
  }
  act.sort((a, b) => time(b.at) - time(a.at));

  return {
    now: now.toISOString(),
    money: { mrr, collectedThisMonth: collected(month), collectedLastMonth: collected(lastMonth) },
    paying: {
      count: paying.length,
      monthly: paying.filter((p) => p.s.kind === "paying" && p.s.plan === "monthly").length,
      annual: paying.filter((p) => p.s.kind === "paying" && p.s.plan === "annual").length,
      newThisMonth: newPayingThisMonth,
      canceledThisMonth,
      gifts: customers.filter((p) => p.s.kind === "gift").length,
    },
    trials: { count: trials.length, endingSoon, ended: trialEnded.length, paidAfter: trialPaid },
    signups: {
      thisWeek: signupsThisWeek.length,
      lastWeek: signupsLastWeek,
      business: signupsThisWeek.filter((p) => mode(p.u) === "business").length,
      personal: signupsThisWeek.filter((p) => mode(p.u) === "personal").length,
      total: customers.length,
    },
    weeks,
    today: {
      support: { chats: input.support.chats, oldestAt: input.support.oldestAt ? input.support.oldestAt.toISOString() : null },
      tax: { count: taxWaiting.length, first: taxWaiting[0] ? { id: taxWaiting[0].id, name: taxWaiting[0].name, step: taxWaiting[0].step } : null },
      trialsEnding: endingSoon,
      failed,
    },
    activity: act.slice(0, 12),
  };
}
