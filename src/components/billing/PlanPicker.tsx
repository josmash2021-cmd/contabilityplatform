import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy } from "@/i18n/copy/marketing";
import { billingCopy } from "@/i18n/copy/billing";
import { CHOSEN_PLAN_KEY, LANDING_PLAN_GROUPS, annualPerMonth, type PlanKey, type PlanTier } from "@/components/marketing/content";

export type Billing = "monthly" | "annual";

function readChosenPlan(): string | null {
  try {
    return localStorage.getItem(CHOSEN_PLAN_KEY);
  } catch {
    return null;
  }
}

type Props = {
  mode: PlanKey;
  /** Called with the period and plan the person chose. Free plans have no button. */
  onPick: (billing: Billing, tier: PlanTier) => void;
  /** The tier being sent to checkout, to show a spinner on its button. */
  pendingTier?: PlanTier | null;
  /** Starting period, e.g. from a "renew annual" link. */
  initialBilling?: Billing;
  /** Light text for the billing toggle when the picker sits on a dark overlay. */
  onDark?: boolean;
};

/**
 * Plan cards for the person's account type, with the same names, prices and
 * features as the landing page. The plan picked on the landing page is marked.
 */
export function PlanPicker({ mode, onPick, pendingTier = null, initialBilling = "monthly", onDark = false }: Props) {
  const p = useCopy(marketingCopy).pricing;
  const g = useCopy(billingCopy).gate;
  const [billing, setBilling] = useState<Billing>(initialBilling);
  const [chosenKey] = useState(readChosenPlan);
  const plans = LANDING_PLAN_GROUPS[mode];

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div role="radiogroup" aria-label={p.billingLabel} className={`relative grid max-w-full grid-cols-2 rounded-xl p-1 ${onDark ? "bg-white/10 ring-1 ring-white/15" : "bg-white shadow-sm ring-1 ring-slate-200"}`}>
          <span
            aria-hidden
            className={`absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-lg transition-transform duration-300 ease-out ${onDark ? "bg-white" : "bg-slate-900"}`}
            style={{ transform: billing === "monthly" ? "translateX(4px)" : "translateX(calc(100% + 4px))" }}
          />
          {(["monthly", "annual"] as const).map((b) => {
            const on = billing === b;
            const color = onDark ? (on ? "text-slate-900" : "text-white/80 hover:text-white") : on ? "text-white" : "text-slate-600 hover:text-slate-900";
            return (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setBilling(b)}
                className={`relative z-10 inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10 sm:gap-2 sm:px-5 ${color}`}
              >
                {b === "monthly" ? p.monthly : p.annual}
                {b === "annual" && (
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${on === onDark ? "bg-emerald-50 text-emerald-700" : "bg-emerald-400/20 text-emerald-300"}`}>{p.twoMonthsFree}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`grid gap-4 ${plans.length === 3 ? "md:grid-cols-3" : "mx-auto max-w-3xl md:grid-cols-2"}`}>
        {plans.map((plan) => {
          const c = p.plans[plan.key];
          const chosen = chosenKey === plan.key;
          const price = billing === "monthly" ? plan.monthly : plan.annual;
          const pending = pendingTier === plan.tier;
          const ring = chosen ? "ring-2 ring-blue-600" : plan.featured ? "ring-2 ring-slate-900" : "ring-1 ring-slate-200";
          const badge = chosen ? g.chosen : plan.featured ? p.featured : null;
          return (
            <div key={plan.key} className={`relative flex flex-col rounded-2xl bg-white p-5 text-slate-900 shadow-sm sm:p-6 ${ring}`}>
              {badge && (
                <span className={`absolute -top-2.5 right-5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${chosen ? "bg-blue-600" : "bg-slate-900"}`}>{badge}</span>
              )}
              <h3 className="text-lg font-semibold">{c.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-slate-600">{c.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1.5">
                {plan.free ? (
                  <span className="text-4xl font-bold tracking-tight text-slate-900">{p.free}</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold tracking-tight tabular-nums">${price.toLocaleString("en-US")}</span>
                    <span className="text-slate-500">{billing === "monthly" ? p.perMonth : p.perYear}</span>
                  </>
                )}
              </div>
              <p className="mt-1 min-h-5 text-sm text-emerald-700">
                {plan.free ? p.freeNote : billing === "annual" ? p.equivalent(annualPerMonth(plan.annual)) : p.orAnnual(plan.annual)}
              </p>

              {plan.free ? (
                <div className="mt-5 grid gap-2">
                  <Link
                    to="/personal/taxes"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-white text-sm font-semibold text-slate-900 ring-1 ring-slate-300 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {g.goTaxes} <ArrowRight className="h-4 w-4" />
                  </Link>
                  <p className="text-center text-xs text-slate-500">{g.freeStays}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onPick(billing, plan.tier)}
                  disabled={pendingTier !== null}
                  className={`mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 ${chosen || plan.featured ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-900 hover:bg-slate-800"}`}
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {g.choose(c.name)}
                </button>
              )}

              {c.lead && <p className="mt-5 text-sm font-semibold">{c.lead}</p>}
              <ul className={`${c.lead ? "mt-2.5" : "mt-5"} space-y-2 text-sm`}>
                {c.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-slate-700">{f}</span>
                  </li>
                ))}
                {c.soon.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                    <span className="text-slate-500">
                      {f} <span className="ml-1 inline-block rounded-full bg-slate-100 px-1.5 py-px align-middle text-[10px] font-semibold text-slate-500">{p.soonTag}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {c.note && <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{c.note}</p>}
            </div>
          );
        })}
      </div>
      <p className={`text-center text-xs ${onDark ? "text-white/70" : "text-slate-500"}`}>{p.footnote}</p>
    </div>
  );
}
