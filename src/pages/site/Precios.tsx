// /precios: the plans, a full comparison, what every plan shares and billing questions.
// Prices and plan names: src/components/marketing/content.ts and src/i18n/copy/marketing.ts.
// What each plan includes: contracts/planFeatures.ts. Words: src/i18n/copy/site/precios.ts.
import { ArrowDown, Check } from "lucide-react";
import { PageHero, SitePage } from "@/components/marketing/SitePage";
import { Pricing } from "@/components/marketing/LandingSections";
import { PreciosCompare } from "@/components/marketing/site/PreciosCompare";
import { PreciosIncluded } from "@/components/marketing/site/PreciosIncluded";
import { PreciosFaq } from "@/components/marketing/site/PreciosFaq";
import { LANDING_PLAN_GROUPS, TRIAL_DAYS, type LandingGroup, type LandingPlan, type PlanTier } from "@/components/marketing/content";
import { BUSINESS_BANK_LIMITS, assistantMonthlyLimit, planHas, teamSeats, topTier } from "@contracts/planFeatures";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy, type MarketingCopy } from "@/i18n/copy/marketing";
import { preciosCopy, type PreciosCopy, type PreciosFaqData } from "@/i18n/copy/site/precios";

function planOf(group: LandingGroup, tier: PlanTier): LandingPlan {
  const plan = LANDING_PLAN_GROUPS[group].find((p) => p.tier === tier);
  if (!plan) throw new Error(`No ${group} plan with tier ${tier}`);
  return plan;
}

const PERSONAL_FREE = planOf("personal", "basic");
const PERSONAL_TOP = planOf("personal", topTier("personal"));
const BUSINESS_BASIC = planOf("business", "basic");
const BUSINESS_PRO = planOf("business", "pro");
const BUSINESS_TEAM = planOf("business", "business");
const BUSINESS_TOP = planOf("business", topTier("business"));

/** The numbers and names the page's texts quote, all from the plan data. */
function pricingFacts(pricing: MarketingCopy["pricing"], c: PreciosCopy): { freeName: string; taxPlans: string; faq: PreciosFaqData } {
  const name = (p: LandingPlan) => pricing.plans[p.key].name;
  const withTaxes = (g: LandingGroup) => LANDING_PLAN_GROUPS[g].filter((p) => planHas(p.mode, p.tier, "taxes")).map(name);
  const taxPlans = c.included.taxPlans(withTaxes("personal"), withTaxes("business"));
  return {
    freeName: name(PERSONAL_FREE),
    taxPlans,
    faq: {
      days: TRIAL_DAYS,
      personalFree: name(PERSONAL_FREE),
      personalTop: name(PERSONAL_TOP),
      businessTop: name(BUSINESS_TOP),
      freeQuestions: assistantMonthlyLimit("personal", PERSONAL_FREE.tier),
      taxPlans,
      basic: { name: name(BUSINESS_BASIC), monthly: BUSINESS_BASIC.monthly, banks: BUSINESS_BANK_LIMITS.basic },
      pro: { name: name(BUSINESS_PRO), monthly: BUSINESS_PRO.monthly, annual: BUSINESS_PRO.annual, banks: BUSINESS_BANK_LIMITS.pro },
      team: { name: name(BUSINESS_TEAM), monthly: BUSINESS_TEAM.monthly, banks: BUSINESS_BANK_LIMITS.business, users: teamSeats("business") },
    },
  };
}

export default function Precios() {
  const m = useCopy(marketingCopy);
  const c = useCopy(preciosCopy);
  const facts = pricingFacts(m.pricing, c);
  return (
    <SitePage title={c.pageTitle}>
      <PageHero eyebrow={c.hero.eyebrow} title={c.hero.title} text={c.hero.text(TRIAL_DAYS, facts.freeName)}>
        <ul aria-label={c.hero.pointsLabel} className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-300">
          {c.hero.points.map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        <a
          href="#comparar"
          className="group mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {c.hero.compareLink}
          <ArrowDown className="h-4 w-4 motion-safe:transition-transform motion-safe:group-hover:translate-y-0.5" aria-hidden />
        </a>
      </PageHero>

      {/* The home page's plan cards, under this page's own heading. */}
      <Pricing c={{ ...m.pricing, eyebrow: c.plans.eyebrow, title: c.plans.title, text: c.plans.text }} />

      <PreciosCompare c={c.compare} pricing={m.pricing} />
      <PreciosIncluded c={c.included} days={TRIAL_DAYS} taxPlans={facts.taxPlans} />
      <PreciosFaq c={c.faq} data={facts.faq} />
    </SitePage>
  );
}
