// ── Free trial ──
// New accounts get full access for TRIAL_DAYS days, no card required.
// Only accounts created on/after TRIAL_LAUNCH qualify: older accounts never
// had a trial, so they must not be told "your trial ended".

export const TRIAL_DAYS = 7;
export const TRIAL_LAUNCH = new Date("2026-11-20T00:00:00Z");

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialInfo = {
  /** True while the trial is running. */
  active: boolean;
  /** ISO date when the trial ends (or ended). */
  endsAt: string;
  /** Whole days left, rounded up (0 once it ended). */
  daysLeft: number;
};

/** Returns the trial for an account, or null if the account doesn't qualify. */
export function getTrialInfo(
  createdAt: Date | string | null | undefined,
  now: Date = new Date(),
): TrialInfo | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime()) || created.getTime() < TRIAL_LAUNCH.getTime()) return null;

  const endsAt = new Date(created.getTime() + TRIAL_DAYS * DAY_MS);
  const msLeft = endsAt.getTime() - now.getTime();
  return {
    active: msLeft > 0,
    endsAt: endsAt.toISOString(),
    daysLeft: msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : 0,
  };
}
