// "Compara los planes": every plan of a group side by side, feature by feature.
// The cells come from contracts/planFeatures.ts (what the server enforces) and, for what
// it doesn't gate, from the plan cards in src/i18n/copy/marketing.ts. Words: precios.ts.
// Computers: a real table whose plan header sticks under the nav while scrolling.
// Phones: the same table with one plan column at a time, picked with a sticky switch,
// so the page never scrolls sideways.
import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight, Building2, Check, FileBarChart, FileText, Landmark, LifeBuoy, ShoppingCart, Sparkles, User, Users,
  type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "@/components/marketing/LandingSections";
import { Reveal } from "@/components/marketing/Reveal";
import { LANDING_PLAN_GROUPS, type LandingGroup, type LandingPlan, type LandingPlanKey } from "@/components/marketing/content";
import {
  BUSINESS_BANK_LIMITS, PERSONAL_BANK_LIMITS, assistantX, planHas, prioritySupport, receiptPhotosPerMonth, teamSeats,
  type Feature, type PlanMode, type PlanTier,
} from "@contracts/planFeatures";
import { Logo } from "@/components/Logo";
import type { MarketingCopy } from "@/i18n/copy/marketing";
import type { PreciosCopy } from "@/i18n/copy/site/precios";
import { PreciosSwitch } from "./PreciosSwitch";

type C = PreciosCopy["compare"];
type Values = C["values"];
type RowId = keyof C["rows"];
type SectionId = keyof C["sections"];
/** true: included · false: not included · text: how much (e.g. "Hasta 3 bancos"). */
type Cell = boolean | string;
type Row = { id: RowId; cell: (tier: PlanTier, v: Values) => Cell };
type Section = { id: SectionId; rows: Row[] };

/** Gated by the server: the plan has it when planFeatures.ts says so. */
const has = (mode: PlanMode, feature: Feature) => (tier: PlanTier) => planHas(mode, tier, feature);
/** Not gated by the server: every plan of the group has it. */
const every = () => true;
/** Personal Pro adds these to Básico (its card: "Todo lo de Básico, más:"). */
const personalPro = (tier: PlanTier) => tier === "pro";
const photos = (n: number | null, v: Values) => (n === null ? v.unlimited : v.perMonth(n));

const SECTIONS: Record<LandingGroup, Section[]> = {
  personal: [
    {
      id: "taxes",
      rows: [
        { id: "taxDocs", cell: has("personal", "taxes") },
        { id: "taxPrep", cell: has("personal", "taxes") },
        { id: "taxTracking", cell: has("personal", "taxes") },
        { id: "taxPast", cell: has("personal", "taxes") },
      ],
    },
    {
      id: "bank",
      rows: [
        // Básico connects no bank; Pro up to 4 (api/lib/plans.ts bankLimit).
        { id: "banks", cell: (t, v) => personalPro(t) && v.banks(PERSONAL_BANK_LIMITS.pro) },
        { id: "autoCategories", cell: personalPro },
        { id: "subscriptions", cell: personalPro },
        { id: "budgets", cell: has("personal", "budgets") },
        { id: "savingsGoals", cell: personalPro },
      ],
    },
    { id: "reports", rows: [{ id: "monthlySummary", cell: personalPro }] },
    { id: "assistant", rows: [{ id: "questions", cell: (t, v) => v.questions(assistantX("personal", t)) }] },
  ],
  business: [
    {
      id: "sales",
      rows: [
        { id: "pos", cell: every },
        { id: "clients", cell: every },
        { id: "salesDashboard", cell: every },
        { id: "quotes", cell: has("business", "quotes") },
      ],
    },
    {
      id: "bank",
      rows: [
        { id: "banks", cell: (t, v) => v.banks(BUSINESS_BANK_LIMITS[t]) },
        { id: "bankTransactions", cell: every },
        { id: "expenses", cell: every },
        { id: "receipts", cell: (t, v) => planHas("business", t, "receipts") && photos(receiptPhotosPerMonth(t), v) },
        { id: "vendors", cell: has("business", "vendors") },
      ],
    },
    {
      id: "reports",
      rows: [
        { id: "incomeStatement", cell: every },
        { id: "accountantView", cell: has("business", "accountant") },
        { id: "clientReports", cell: has("business", "clientReports") },
      ],
    },
    {
      id: "taxes",
      rows: [
        { id: "taxDocs", cell: has("business", "taxes") },
        { id: "taxPrep", cell: has("business", "taxes") },
        { id: "taxTracking", cell: has("business", "taxes") },
      ],
    },
    { id: "assistant", rows: [{ id: "questions", cell: (t, v) => v.questions(assistantX("business", t)) }] },
    {
      id: "team",
      rows: [
        { id: "users", cell: (t, v) => v.users(teamSeats(t)) },
        { id: "accountantAccess", cell: has("business", "team") },
      ],
    },
    // From the Pro and Negocio cards ("Soporte prioritario").
    { id: "support", rows: [{ id: "prioritySupport", cell: (t) => prioritySupport("business", t) }] },
  ],
};

const SECTION_ICONS: Record<SectionId, LucideIcon> = {
  sales: ShoppingCart,
  bank: Landmark,
  reports: FileBarChart,
  taxes: FileText,
  assistant: Sparkles,
  team: Users,
  support: LifeBuoy,
};

/** On phones only this plan's column shows; start on the recommended one. */
function featuredKey(group: LandingGroup): LandingPlanKey {
  const plans = LANDING_PLAN_GROUPS[group];
  return (plans.find((p) => p.featured) ?? plans[0]).key;
}

export function PreciosCompare({ c, pricing }: { c: C; pricing: MarketingCopy["pricing"] }) {
  const [group, setGroup] = useState<LandingGroup>("personal");
  const [picked, setPicked] = useState<Record<LandingGroup, LandingPlanKey>>(() => ({
    personal: featuredKey("personal"),
    business: featuredKey("business"),
  }));
  const plans = LANDING_PLAN_GROUPS[group];
  const shown = picked[group];
  const groupLabel = pricing.groups[group];
  const sections = SECTIONS[group];

  // Every plan column on computers; only the picked one on phones.
  const colVisibility = (p: LandingPlan) => (p.key === shown ? "" : "hidden md:table-cell");
  const tint = (p: LandingPlan) => (p.featured ? "bg-blue-50/50" : "");

  return (
    <section id="comparar" className="scroll-mt-nav bg-white py-24 sm:py-28" aria-labelledby="compare-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="compare-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />

        <Reveal className="mt-10 flex justify-center">
          <PreciosSwitch
            label={pricing.groupsLabel}
            value={group}
            onChange={setGroup}
            options={[
              { value: "personal", label: pricing.groups.personal, icon: User },
              { value: "business", label: pricing.groups.business, icon: Building2 },
            ]}
          />
        </Reveal>

        <div className={`mx-auto mt-10 ${plans.length === 2 ? "max-w-4xl" : "max-w-5xl"}`}>
          {/* Phones: which plan to show, kept in reach while scrolling the table. */}
          <div className="sticky top-16 z-20 -mx-4 bg-white/95 px-4 pb-3 pt-2 shadow-[0_10px_14px_-14px_rgba(15,23,42,0.35)] sm:-mx-6 sm:px-6 md:hidden">
            <PreciosSwitch
              label={c.planPicker}
              value={shown}
              onChange={(key) => setPicked((prev) => ({ ...prev, [group]: key }))}
              options={plans.map((p) => ({ value: p.key, label: pricing.plans[p.key].name }))}
              className="w-full"
            />
          </div>

          {/* overflow-clip (not hidden) rounds the corners without breaking the sticky header. */}
          <div
            key={group}
            className="mt-3 overflow-clip rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 md:mt-0"
          >
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <caption className="sr-only">{c.caption(groupLabel)}</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className={`relative w-[56%] border-b border-slate-200 bg-white px-4 pb-4 pt-5 align-bottom text-sm font-semibold text-slate-500 sm:px-6 md:sticky md:top-16 md:z-10 ${plans.length === 2 ? "md:w-[46%]" : "md:w-[37%]"}`}
                  >
                    {/* The brand fills the corner above the feature names. */}
                    <span className="absolute left-4 top-5 flex items-center gap-2.5 sm:left-6">
                      <Logo className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
                      <span className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">{c.brand}</span>
                    </span>
                    <span className="block pt-14">{c.featureCol}</span>
                  </th>
                  {plans.map((p) => (
                    <th
                      key={p.key}
                      scope="col"
                      className={`${colVisibility(p)} border-b border-slate-200 px-3 pb-4 pt-5 align-bottom md:sticky md:top-16 md:z-10 ${p.featured ? "bg-blue-50" : "bg-white"}`}
                    >
                      <PlanHead plan={p} name={pricing.plans[p.key].name} pricing={pricing} c={c} groupLabel={groupLabel} />
                    </th>
                  ))}
                </tr>
              </thead>

              {sections.map((s, si) => {
                const Icon = SECTION_ICONS[s.id];
                return (
                  <tbody key={s.id}>
                    {/* One cell per column, not a colSpan: a span would keep the phone's hidden columns in the layout. */}
                    <tr>
                      <th
                        scope="rowgroup"
                        className={`bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-900 sm:px-6 ${si ? "border-t border-slate-200" : ""}`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                          {c.sections[s.id]}
                        </span>
                      </th>
                      {plans.map((p) => (
                        <td key={p.key} className={`${colVisibility(p)} bg-slate-50 ${si ? "border-t border-slate-200" : ""}`} />
                      ))}
                    </tr>
                    {s.rows.map((r) => {
                      const row = c.rows[r.id];
                      return (
                        <tr key={r.id} className="transition-colors md:hover:bg-slate-50/70">
                          <th scope="row" className="border-t border-slate-100 px-4 py-4 align-middle text-sm font-normal text-slate-700 sm:px-6 sm:text-[15px]">
                            {row.label}
                            {row.hint && <span className="mt-1 block text-xs leading-snug text-slate-500 sm:text-[13px]">{row.hint}</span>}
                          </th>
                          {plans.map((p) => (
                            <td key={p.key} className={`${colVisibility(p)} ${tint(p)} border-t border-slate-100 px-3 py-4 text-center align-middle`}>
                              <CellView value={r.cell(p.tier, c.values)} c={c} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}

              <tfoot>
                <tr>
                  <td className="border-t border-slate-200 px-4 py-5 sm:px-6" />
                  {plans.map((p) => (
                    <td key={p.key} className={`${colVisibility(p)} ${tint(p)} border-t border-slate-200 px-3 py-5 text-center`}>
                      <PlanCta plan={p} name={pricing.plans[p.key].name} c={c} groupLabel={groupLabel} />
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanHead({ plan, name, pricing, c, groupLabel }: {
  plan: LandingPlan;
  name: string;
  pricing: MarketingCopy["pricing"];
  c: C;
  groupLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="text-base font-semibold text-slate-900 sm:text-lg">{name}</span>
        {plan.featured && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold leading-4 text-white">{pricing.featured}</span>
        )}
      </span>
      <span className="text-sm font-normal text-slate-500">
        {plan.free ? (
          <span className="text-xl font-bold text-slate-900">{pricing.free}</span>
        ) : (
          <>
            <span className="text-xl font-bold tabular-nums text-slate-900">${plan.monthly.toLocaleString("en-US")}</span>
            {pricing.perMonth}
          </>
        )}
      </span>
      <PlanCta plan={plan} name={name} c={c} groupLabel={groupLabel} className="mt-2" />
    </div>
  );
}

function PlanCta({ plan, name, c, groupLabel, className = "" }: {
  plan: LandingPlan;
  name: string;
  c: C;
  groupLabel: string;
  className?: string;
}) {
  const label = plan.free ? c.freeCta : c.tryCta;
  return (
    <Link
      to={`/register?mode=${plan.mode}&plan=${plan.key}`}
      aria-label={c.ctaAria(label, name, groupLabel)}
      className={`group inline-flex h-11 w-full max-w-[12rem] items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        plan.featured ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-900 hover:bg-slate-800"
      } ${className}`}
    >
      {label}
      <ArrowRight className="hidden h-4 w-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5 sm:block" aria-hidden />
    </Link>
  );
}

function CellView({ value, c }: { value: Cell; c: C }) {
  if (value === true) {
    return (
      <>
        <span aria-hidden className="mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span className="sr-only">{c.included}</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden className="text-lg leading-none text-slate-300">—</span>
        <span className="sr-only">{c.notIncluded}</span>
      </>
    );
  }
  return <span className="text-sm font-semibold text-slate-900">{value}</span>;
}
