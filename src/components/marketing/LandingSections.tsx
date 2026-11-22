// The landing page's sections, shared with the site pages (/producto, /precios, …).
import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight, Check, ShieldCheck, Lock, Languages, PiggyBank, Rocket, TrendingUp, type LucideIcon, Eye, CreditCard, Unplug, Landmark, Layers, Zap, FileBarChart,
  ShoppingCart, Users, Receipt, Smartphone, Wallet, Tags, Tv, Target, CalendarCheck, Building2, User, Store,
  Sparkles, LayoutDashboard, FileText,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "@/components/marketing/Reveal";
import { BusinessPhonePreview, ConnectStepPreview, DashboardPreview, NumbersStepPreview, PhonePreview, SignupStepPreview } from "@/components/marketing/Previews";
import { LANDING_PLAN_GROUPS, TRIAL_DAYS, annualPerMonth, type LandingGroup } from "@/components/marketing/content";
import type { MarketingCopy } from "@/i18n/copy/marketing";

export const primaryCta =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 hover:bg-blue-500 hover:shadow-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060B18]";

export type C = MarketingCopy;

export function SectionHeading({ eyebrow, title, text, id }: { eyebrow: string; title: string; text?: string; id?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-blue-600">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-lg leading-relaxed text-slate-600">{text}</p>}
    </Reveal>
  );
}

// ── Hero ──
export function Hero({ c }: { c: C["hero"] }) {
  return (
    <section className="relative overflow-hidden bg-[#060B18] pb-20 pt-32 sm:pb-28 sm:pt-36 lg:pt-40" aria-labelledby="hero-title">
      {/* Background: deep navy with soft lights that drift slowly (still when motion is off). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_-10%,#152a57_0%,#0a1633_40%,#060B18_75%)]" />
        <div className="absolute -top-56 left-[6%] -m-[160px] h-[880px] w-[1000px] bg-[radial-gradient(closest-side,rgba(37,99,235,0.3),rgba(37,99,235,0.105)_55%,transparent)] will-change-transform motion-safe:animate-aurora" />
        <div className="absolute right-[-8%] top-[14%] -m-[160px] h-[800px] w-[920px] bg-[radial-gradient(closest-side,rgba(99,102,241,0.24),rgba(99,102,241,0.084)_55%,transparent)] will-change-transform motion-safe:animate-aurora motion-safe:[animation-delay:-8s]" />
        <div className="absolute bottom-[-24%] left-[28%] -m-[170px] h-[780px] w-[1020px] bg-[radial-gradient(closest-side,rgba(34,211,238,0.12),rgba(34,211,238,0.042)_55%,transparent)] will-change-transform motion-safe:animate-aurora motion-safe:[animation-delay:-15s]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8">
        <div className="text-center lg:text-left">
          <h1 id="hero-title" className="animate-hero-in text-4xl font-bold leading-[1.08] tracking-tight text-white [animation-delay:80ms] sm:text-5xl lg:text-[3.6rem]">
            {c.titleA}{" "}
            <span className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">{c.titleB}</span>
          </h1>
          <p className="animate-hero-in mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 [animation-delay:160ms] lg:mx-0">{c.text}</p>
          <div className="animate-hero-in mt-9 flex flex-col items-center gap-3 [animation-delay:240ms] sm:flex-row sm:justify-center lg:justify-start">
            <Link to="/register" className={primaryCta}>
              {c.primary}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              {c.secondary}
            </a>
          </div>
          <ul className="animate-hero-in mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400 [animation-delay:320ms] lg:justify-start">
            {c.bullets(TRIAL_DAYS).map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-400" />{t}</li>
            ))}
          </ul>
        </div>

        <div className="animate-hero-in mx-auto w-full max-w-xl [animation-delay:200ms] lg:max-w-none">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}

// ── Trust strip ──
// 1: Plaid's symbol, 2: the logos of the biggest banks, 3 and 4: icons.
const TRUST_BANKS = ["/brands/banks/chase.png", "/brands/banks/bank-of-america.png", "/brands/banks/wells-fargo.png"];
const trustMarks = [
  { logo: "/brands/plaid-mark.svg", w: 22, h: 22 },
  { banks: true },
  { Icon: Languages },
  { Icon: Lock },
] as const;
export function TrustStrip({ c }: { c: C["trust"] }) {
  return (
    <section className="border-b border-slate-200 bg-white" aria-label={c.label}>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {c.items.map((it, i) => {
          const m = trustMarks[i];
          return (
            <Reveal key={it.title} delay={i * 70} className="flex items-start gap-3">
              <span className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 px-2 text-slate-700">
                {"logo" in m ? (
                  <img src={m.logo} alt="" width={m.w} height={m.h} className="block" style={{ width: m.w, height: m.h }} />
                ) : "banks" in m ? (
                  <span className="flex items-center gap-1">
                    {TRUST_BANKS.map((src) => (
                      <img key={src} src={src} alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-md bg-white object-contain" />
                    ))}
                  </span>
                ) : (
                  <m.Icon className="h-5 w-5" />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{it.title}</p>
                <p className="mt-0.5 text-sm text-slate-500">{it.text}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// ── Value props ──
const valueIcons = [Layers, Zap, FileBarChart];
export function ValueProps({ c }: { c: C["value"] }) {
  return (
    <section className="bg-white py-24 sm:py-28" aria-labelledby="value-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="value-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {c.items.map((it, i) => {
            const Icon = valueIcons[i];
            return (
              <Reveal key={it.title} delay={i * 90}>
                <div className="group h-full rounded-2xl border border-slate-200 bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white"><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">{it.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{it.text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Product (business / personal tabs) ──
const productIcons = {
  business: { tab: Building2, features: [ShoppingCart, Users, Receipt, Landmark, FileBarChart, LayoutDashboard] },
  personal: { tab: User, features: [Wallet, Tags, Tv, Target, CalendarCheck, Smartphone] },
} as const;

export function Product({ c }: { c: C["product"] }) {
  const [tab, setTab] = useState<"business" | "personal">("business");
  const t = c[tab];
  return (
    <section id="producto" className="scroll-mt-nav bg-slate-50 py-24 sm:py-28" aria-labelledby="product-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="product-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />

        <Reveal className="mt-10 flex justify-center">
          <div role="tablist" aria-label={c.tabsLabel} className="relative grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <span
              aria-hidden
              className="absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-lg bg-slate-900 transition-transform duration-300 ease-out"
              style={{ transform: tab === "business" ? "translateX(4px)" : "translateX(calc(100% + 4px))" }}
            />
            {(["business", "personal"] as const).map((k) => {
              const Icon = productIcons[k].tab;
              const active = tab === k;
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(k)}
                  className={`relative z-10 inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-7 ${active ? "text-white" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <Icon className="h-4 w-4" /> {c[k].label}
                </button>
              );
            })}
          </div>
        </Reveal>

        <div key={tab} role="tabpanel" className="mt-14 grid items-center gap-14 animate-in fade-in slide-in-from-bottom-2 duration-500 lg:grid-cols-2">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t.title}</h3>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">{t.text}</p>
            <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {t.features.map((f, i) => {
                const Icon = productIcons[tab].features[i];
                return (
                  <div key={f.title} className="flex gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"><Icon className="h-5 w-5" /></span>
                    <div>
                      <p className="font-semibold text-slate-900">{f.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-lg">{tab === "business" ? <BusinessPhonePreview /> : <PhonePreview />}</div>
        </div>
      </div>
    </section>
  );
}

// ── How it works: each step with a picture of what you'll see ──
const stepVisuals = [SignupStepPreview, ConnectStepPreview, NumbersStepPreview];
export function HowItWorks({ c }: { c: C["how"] }) {
  return (
    <section id="como-funciona" className="scroll-mt-nav bg-white py-24 sm:py-28" aria-labelledby="how-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="how-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />
        <ol className="mt-16 grid gap-14 md:grid-cols-3 md:gap-8">
          {c.steps.map((s, i) => {
            const Visual = stepVisuals[i];
            return (
              <li key={s.title}>
                <Reveal delay={i * 120}>
                  {/* On computers the steps zigzag: text above the picture for steps 1 and 3, below it for step 2. */}
                  <div className={`flex flex-col gap-6 ${i % 2 === 0 ? "md:flex-col-reverse" : ""}`}>
                    <Visual />
                    <div className="mx-auto flex w-full max-w-sm items-start gap-3.5 px-1">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white shadow-md shadow-slate-900/15">{i + 1}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{s.title}</h3>
                        <p className="mt-1.5 leading-relaxed text-slate-600">{s.text}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ── Security ──
const securityIcons = [Landmark, Eye, CreditCard, Unplug];
export function Security({ c }: { c: C["security"] }) {
  return (
    <section id="seguridad" className="scroll-mt-nav relative overflow-hidden bg-[#060B18] py-24 sm:py-28" aria-labelledby="security-title">
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <Reveal>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-400/20"><ShieldCheck className="h-7 w-7" /></span>
          <p className="mt-6 text-sm font-semibold text-blue-400">{c.eyebrow}</p>
          <h2 id="security-title" className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{c.title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">{c.text}</p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {c.points.map((p, i) => {
            const Icon = securityIcons[i];
            return (
              <Reveal key={p.title} delay={i * 80}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.05]">
                  <Icon className="h-5 w-5 text-blue-400" />
                  <h3 className="mt-4 font-semibold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ──
// Each plan's icon turns into the next one in its set, smoothly (still when motion is off).
const PLAN_ICON_SETS = {
  personal: [Receipt, FileText, ShieldCheck],
  personalPro: [Wallet, PiggyBank, Sparkles],
  basic: [Store, ShoppingCart, Receipt],
  pro: [TrendingUp, Building2, Sparkles],
  business: [Layers, Rocket, Users],
} as const;
export function PlanIcon({ icons, offset, className }: { icons: readonly LucideIcon[]; offset: number; className: string }) {
  return (
    <span className="relative inline-grid h-6 w-6 shrink-0 place-items-center" aria-hidden>
      {icons.map((Icon, k) => (
        <Icon
          key={k}
          className={`absolute h-5 w-5 ${className} motion-safe:animate-icon-cycle ${k ? "opacity-0 motion-safe:opacity-100" : ""}`}
          style={{ animationDelay: `${-(offset + [0, 4, 2][k])}s` }}
        />
      ))}
    </span>
  );
}

export function Pricing({ c }: { c: C["pricing"] }) {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [group, setGroup] = useState<LandingGroup>("personal");
  const planIcons = PLAN_ICON_SETS;
  const plans = LANDING_PLAN_GROUPS[group];
  return (
    <section id="precios" className="scroll-mt-nav bg-slate-50 py-24 sm:py-28" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="pricing-title" eyebrow={c.eyebrow} title={c.title} text={c.text(TRIAL_DAYS)} />

        <Reveal className="mt-10 flex flex-col items-center gap-4">
          <div role="radiogroup" aria-label={c.groupsLabel} className="relative grid grid-cols-2 rounded-2xl bg-slate-200/70 p-1">
            <span
              aria-hidden
              className="absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: group === "personal" ? "translateX(4px)" : "translateX(calc(100% + 4px))" }}
            />
            {(["personal", "business"] as const).map((g) => {
              const GIcon = g === "personal" ? User : Building2;
              return (
                <button
                  key={g}
                  role="radio"
                  aria-checked={group === g}
                  onClick={() => setGroup(g)}
                  className={`relative z-10 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-8 ${group === g ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <GIcon className="h-4 w-4" />
                  {c.groups[g]}
                </button>
              );
            })}
          </div>
          <div role="radiogroup" aria-label={c.billingLabel} className="relative grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <span
              aria-hidden
              className="absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-lg bg-slate-900 transition-transform duration-300 ease-out"
              style={{ transform: billing === "monthly" ? "translateX(4px)" : "translateX(calc(100% + 4px))" }}
            />
            {(["monthly", "annual"] as const).map((b) => (
              <button
                key={b}
                role="radio"
                aria-checked={billing === b}
                onClick={() => setBilling(b)}
                className={`relative z-10 inline-flex h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${billing === b ? "text-white" : "text-slate-600 hover:text-slate-900"}`}
              >
                {b === "monthly" ? c.monthly : c.annual}
                {b === "annual" && (
                  <span className={`hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-block ${billing === "annual" ? "bg-emerald-400/20 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>{c.twoMonthsFree}</span>
                )}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-medium text-emerald-700 sm:hidden">{c.annualNoteMobile}</p>
        </Reveal>

        <div key={group} className={`mx-auto mt-12 grid gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 ${plans.length === 2 ? "max-w-4xl md:grid-cols-2" : "max-w-6xl md:grid-cols-2 lg:grid-cols-3"}`}>
          {plans.map((plan, i) => {
            const p = c.plans[plan.key];
            const featured = !!plan.featured;
            const price = billing === "monthly" ? plan.monthly : plan.annual;
            const icons = planIcons[plan.key];
            return (
              <Reveal key={plan.key} delay={i * 90} className={plans.length === 3 && i === 2 ? "md:col-span-2 md:mx-auto md:w-1/2 lg:col-span-1 lg:mx-0 lg:w-auto" : ""}>
                {/* Set into the page like the plans table on Precios: the shadow falls inside, short and dark under
                    the top edge, with a light line at the bottom. The recommended plan keeps its dark color. */}
                <div
                  className={`relative flex h-full flex-col rounded-3xl border p-7 ${
                    featured
                      ? "border-b-white/10 border-t-black/60 border-x-black/40 bg-[#0B1224] text-white shadow-[inset_0_12px_16px_-8px_rgba(0,0,0,0.75),inset_0_3px_4px_-1px_rgba(0,0,0,0.6),inset_4px_0_8px_-4px_rgba(0,0,0,0.5),inset_-4px_0_8px_-4px_rgba(0,0,0,0.5),inset_0_-1px_0_rgba(255,255,255,0.10)]"
                      : "border-b-[#F1F4F8] border-t-[#BAC4D2] border-x-[#CFD7E2] bg-[#EBEFF5] text-slate-900 shadow-[inset_0_10px_14px_-8px_rgba(15,23,42,0.42),inset_0_3px_4px_-1px_rgba(15,23,42,0.26),inset_4px_0_6px_-4px_rgba(15,23,42,0.16),inset_-4px_0_6px_-4px_rgba(15,23,42,0.16),inset_0_-1px_0_rgba(255,255,255,1)]"
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 right-7 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-md">{c.featured}</span>
                  )}
                  <div className="flex items-center gap-2.5">
                    <PlanIcon icons={icons} offset={i * 0.6} className={featured ? "text-blue-400" : "text-blue-600"} />
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                  </div>
                  <p className={`mt-2 min-h-10 text-sm ${featured ? "text-slate-400" : "text-slate-600"}`}>{p.tagline}</p>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    {plan.free ? (
                      <span className="text-5xl font-bold tracking-tight">{c.free}</span>
                    ) : (
                      <>
                        <span className="text-5xl font-bold tracking-tight tabular-nums">${price.toLocaleString("en-US")}</span>
                        <span className={featured ? "text-slate-400" : "text-slate-500"}>{billing === "monthly" ? c.perMonth : c.perYear}</span>
                      </>
                    )}
                  </div>
                  <p className={`mt-2 min-h-5 text-sm ${featured ? "text-emerald-300" : "text-emerald-700"}`}>
                    {plan.free ? c.freeNote : billing === "annual" ? c.equivalent(annualPerMonth(plan.annual)) : c.orAnnual(plan.annual)}
                  </p>

                  <Link
                    to={`/register?mode=${plan.mode}&plan=${plan.key}`}
                    className={`group mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
                      featured ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    {plan.free ? c.freeCta : c.cta(TRIAL_DAYS)}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>

                  {p.lead && <p className={`mt-7 text-sm font-semibold ${featured ? "text-white" : "text-slate-900"}`}>{p.lead}</p>}
                  <ul className={`${p.lead ? "mt-3" : "mt-7"} space-y-3 text-sm`}>
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-3">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-emerald-400" : "text-emerald-600"}`} />
                        <span className={featured ? "text-slate-300" : "text-slate-700"}>{f}</span>
                      </li>
                    ))}
                    {p.soon.map((f) => (
                      <li key={f} className="flex gap-3">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-slate-600" : "text-slate-300"}`} />
                        <span className={featured ? "text-slate-400" : "text-slate-500"}>
                          {f}{" "}
                          <span className={`ml-1 inline-block rounded-full px-1.5 py-px align-middle text-[10px] font-semibold ${featured ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}>{c.soonTag}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {p.note && <p className={`mt-5 border-t pt-4 text-xs ${featured ? "border-white/10 text-slate-400" : "border-slate-100 text-slate-500"}`}>{p.note}</p>}
                </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-10 text-center text-sm text-slate-500">{c.footnote}</Reveal>
      </div>
    </section>
  );
}

// ── FAQ ──
export function Faq({ c }: { c: C["faq"] }) {
  return (
    <section id="preguntas" className="scroll-mt-nav bg-white py-24 sm:py-28" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="faq-title" eyebrow={c.eyebrow} title={c.title} />
        <Reveal className="mt-12">
          <Accordion type="single" collapsible className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">
            {c.items(TRIAL_DAYS).map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`} className="border-0">
                <AccordionTrigger className="py-5 text-left text-base font-semibold text-slate-900 hover:no-underline">{f.q}</AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed text-slate-600">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

// ── Final CTA ──
export function FinalCta({ c }: { c: C["finalCta"] }) {
  return (
    <section className="bg-white pb-24 sm:pb-28" aria-labelledby="cta-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-[#0B1224] px-6 py-16 text-center sm:px-16">
            <div className="pointer-events-none absolute -bottom-32 left-1/2 -my-[120px] h-[528px] w-[940px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(37,99,235,0.34),rgba(37,99,235,0.119)_55%,transparent)]" />
            <div className="relative">
              <h2 id="cta-title" className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">{c.title(TRIAL_DAYS)}</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">{c.text}</p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/register" className={primaryCta}>
                  {c.primary}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link to="/login" className="inline-flex h-12 items-center justify-center rounded-xl px-6 text-[15px] font-medium text-slate-300 transition-colors hover:text-white">
                  {c.secondary}
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// Sections that are off screen pause their CSS animations (data-offscreen), so phones only
// spend effort on what is visible and the moving parts stay smooth.
