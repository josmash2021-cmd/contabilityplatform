// /producto: everything the app does, in a tour with a Negocio / Personal switch.
// Sections: hero · tour (overview + one deep dive per area) · made for you · compare the plans.
import { Link } from "react-router";
import { ArrowRight, Check, Gift, Languages, Smartphone, type LucideIcon } from "lucide-react";
import { SitePage, PageHero } from "@/components/marketing/SitePage";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHeading } from "@/components/marketing/LandingSections";
import { DashboardPreview } from "@/components/marketing/Previews";
import { ProductoTour } from "@/components/marketing/site/ProductoTour";
import { LANDING_PLAN_GROUPS, TRIAL_DAYS, type LandingGroup } from "@/components/marketing/content";
import { useCopy } from "@/i18n/useI18n";
import { productoCopy, type ProductoCopy } from "@/i18n/copy/site/producto";

const madeIcons: LucideIcon[] = [Languages, Smartphone, Gift];

function MadeForYou({ c }: { c: ProductoCopy["madeForYou"] }) {
  return (
    <section aria-labelledby="hecho-title" className="relative overflow-hidden bg-[#060B18] py-24 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[720px] max-w-full -translate-x-1/2 rounded-full bg-blue-600/20 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-blue-400">{c.eyebrow}</p>
          <h2 id="hecho-title" className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{c.title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">{c.text}</p>
        </Reveal>
        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {c.items(TRIAL_DAYS).map((it, i) => {
            const Icon = madeIcons[i];
            return (
              <li key={it.title}>
                <Reveal delay={i * 90} className="h-full">
                  <div className="h-full rounded-3xl border border-white/10 bg-white/[0.04] p-7 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.06]">
                    <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20"><Icon className="h-6 w-6" /></span>
                    <h3 className="mt-6 text-xl font-semibold text-white">{it.title}</h3>
                    <p className="mt-2.5 leading-relaxed text-slate-400">{it.text}</p>
                    <ul aria-hidden className="mt-5 flex flex-wrap gap-1.5">
                      {it.chips.map((chip, k) => (
                        <li key={chip} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${k === 0 ? "bg-blue-500/15 text-blue-200 ring-1 ring-blue-400/30" : "bg-white/[0.06] text-slate-300 ring-1 ring-white/10"}`}>{chip}</li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const GROUPS: LandingGroup[] = ["personal", "business"];

function ComparePlans({ c }: { c: ProductoCopy["compare"] }) {
  return (
    <section aria-labelledby="compare-title" className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="compare-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />
        <div className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-[2fr_3fr]">
          {GROUPS.map((g, gi) => (
            <Reveal key={g} delay={gi * 100} className="h-full">
              <div className="h-full rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200 sm:p-8">
                <h3 className="text-lg font-bold text-slate-900">{c.groups[g]}</h3>
                <ul className="mt-5 space-y-3">
                  {LANDING_PLAN_GROUPS[g].map((plan) => (
                    <li key={plan.key} className={`rounded-2xl bg-white p-4 sm:p-5 ${plan.featured ? "ring-2 ring-blue-500" : "ring-1 ring-slate-200"}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="flex items-center gap-2 font-semibold text-slate-900">
                          {c.names[plan.key]}
                          {plan.featured && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">{c.featured}</span>}
                        </p>
                        <p className="font-bold tabular-nums text-slate-900">
                          {plan.free ? c.free : <>${plan.monthly}<span className="text-sm font-medium text-slate-500">{c.perMonth}</span></>}
                        </p>
                      </div>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{c.summaries[plan.key]}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 flex flex-col items-center gap-4 text-center">
          <Link
            to="/precios"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {c.cta} <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <p className="text-sm text-slate-500">{c.note(TRIAL_DAYS)}</p>
        </Reveal>
      </div>
    </section>
  );
}

export default function Producto() {
  const c = useCopy(productoCopy);
  return (
    <SitePage title={c.pageTitle}>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={<>{c.hero.titleA} <span className="whitespace-nowrap bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">{c.hero.titleB}</span></>}
        text={c.hero.text}
        secondary={{ label: c.hero.secondary, to: "/precios" }}
        visual={<div className="mx-auto w-full max-w-xl lg:max-w-none"><DashboardPreview /></div>}
      >
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
          {c.hero.checks(TRIAL_DAYS).map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5"><Check aria-hidden className="h-4 w-4 text-emerald-400" />{t}</li>
          ))}
        </ul>
      </PageHero>
      <ProductoTour />
      <MadeForYou c={c.madeForYou} />
      <ComparePlans c={c.compare} />
    </SitePage>
  );
}
