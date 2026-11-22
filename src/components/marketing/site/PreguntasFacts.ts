// The product's numbers quoted in the /preguntas answers, read from the same places the app uses,
// so prices and limits can't drift from what's sold and enforced.
import { LANDING_PLAN_GROUPS, TRIAL_DAYS, type LandingPlanKey } from "@/components/marketing/content";
import { BUSINESS_BANK_LIMITS, QUESTIONS_PER_X, assistantMonthlyLimit, teamSeats } from "@contracts/planFeatures";
import { TAX_MAX_FILE_BYTES } from "@contracts/taxRules";
import type { PreguntasFacts } from "@/i18n/copy/site/preguntas";

function price(key: LandingPlanKey): { monthly: number; annual: number } {
  const plan = [...LANDING_PLAN_GROUPS.personal, ...LANDING_PLAN_GROUPS.business].find((p) => p.key === key);
  if (!plan) throw new Error(`Unknown plan: ${key}`);
  return { monthly: plan.monthly, annual: plan.annual };
}

/** How long a team invitation link lasts. Keep in step with INVITE_DAYS in api/team-router.ts. */
const INVITE_DAYS = 7;

export const PREGUNTAS_FACTS: PreguntasFacts = {
  days: TRIAL_DAYS,
  prices: { personalPro: price("personalPro"), basic: price("basic"), pro: price("pro"), business: price("business") },
  questions: {
    perX: QUESTIONS_PER_X,
    personalBasic: assistantMonthlyLimit("personal", "basic"),
    personalPro: assistantMonthlyLimit("personal", "pro"),
    basic: assistantMonthlyLimit("business", "basic"),
    pro: assistantMonthlyLimit("business", "pro"),
    business: assistantMonthlyLimit("business", "business"),
  },
  banks: { basic: BUSINESS_BANK_LIMITS.basic, pro: BUSINESS_BANK_LIMITS.pro, business: BUSINESS_BANK_LIMITS.business },
  seats: { pro: teamSeats("pro"), business: teamSeats("business") },
  maxFileMb: Math.round(TAX_MAX_FILE_BYTES / (1024 * 1024)),
  inviteDays: INVITE_DAYS,
};
