// /como-funciona: the real flow, step by step.
// Sections: hero (with links to each step) · timeline of 5 steps · a day with the app ·
// what happens after the trial · short FAQ.
import type { ComponentType } from "react";
import { Link } from "react-router";
import {
  ArrowRight, CalendarDays, Gift, Info, MousePointerClick,
  ShieldCheck, Sparkles, User, type LucideIcon,
} from "lucide-react";
import { SitePage, PageHero } from "@/components/marketing/SitePage";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHeading } from "@/components/marketing/LandingSections";
import { ConnectStepPreview, NumbersStepPreview, SignupStepPreview } from "@/components/marketing/Previews";
import { ChargeStepVisual, ReportsStepVisual } from "@/components/marketing/site/ComoFuncionaVisuals";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TRIAL_DAYS } from "@/components/marketing/content";
import { useCopy } from "@/i18n/useI18n";
import { comoFuncionaCopy, type ComoFuncionaCopy } from "@/i18n/copy/site/comoFunciona";
import { DayWithApp } from "@/components/marketing/site/DayWithApp";

type C = ComoFuncionaCopy;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

// ── Hero: links to each step ──
function StepJumps({ c, steps }: { c: C["hero"]; steps: C["steps"]["items"] }) {
  return (
    <nav aria-label={c.jumpLabel} className="mt-10">
      <ol className="flex flex-wrap justify-center gap-2">
        {steps.map((s, i) => (
          <li key={s.short}>
            <a
              href={`#paso-${i + 1}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1.5 pl-1.5 pr-4 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-200">{i + 1}</span>
              {s.short}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ── Timeline ──
const stepVisuals: ComponentType[] = [SignupStepPreview, ConnectStepPreview, NumbersStepPreview, ChargeStepVisual, ReportsStepVisual];

function Timeline({ c }: { c: C["steps"] }) {
  return (
    <section aria-labelledby="steps-title" className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="steps-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />
        <ol className="relative mt-16 sm:mt-20">
          {/* The line that joins the steps */}
          <span aria-hidden className="absolute bottom-10 left-5 top-10 w-px bg-gradient-to-b from-blue-300 via-slate-200 to-slate-200 sm:left-6" />
          {c.items.map((s, i) => {
            const Visual = stepVisuals[i];
            // Steps take turns: 1, 3 and 5 show their picture on the left; 2 and 4 on the right (computers).
            const pictureLeft = i % 2 === 0;
            return (
              <li key={s.title} id={`paso-${i + 1}`} className="relative scroll-mt-28 pb-16 pl-14 last:pb-0 sm:pb-24 sm:pl-20">
                <span aria-hidden className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-base font-bold text-white shadow-lg shadow-slate-900/20 ring-8 ring-white sm:h-12 sm:w-12 sm:text-lg">
                  {i + 1}
                </span>
                <Reveal>
                  <div className={`grid items-center gap-10 lg:gap-14 ${pictureLeft ? "lg:grid-cols-[1fr_1.1fr]" : "lg:grid-cols-[1.1fr_1fr]"}`}>
                    <div className={pictureLeft ? "lg:order-2" : ""}>
                      <p className="pt-1.5 text-sm font-semibold text-blue-600 sm:pt-3">{c.stepLabel(i + 1)}</p>
                      <h3 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem] sm:leading-tight">{s.title}</h3>
                      <p className="mt-3 text-lg leading-relaxed text-slate-600">{s.text}</p>
                      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                          <dt className="flex items-center gap-2 text-sm font-semibold text-slate-900"><User aria-hidden className="h-4 w-4 text-slate-500" />{c.you}</dt>
                          <dd className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{s.you}</dd>
                        </div>
                        <div className="rounded-2xl bg-blue-50/70 p-4 ring-1 ring-blue-100">
                          <dt className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Sparkles aria-hidden className="h-4 w-4 text-blue-600" />{c.app}</dt>
                          <dd className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{s.app}</dd>
                        </div>
                      </dl>
                      {s.plans && (
                        <p className="mt-4 flex gap-2 text-sm leading-relaxed text-slate-500">
                          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{s.plans}
                        </p>
                      )}
                      {s.note && (
                        <p className="mt-3 flex gap-2 rounded-2xl border border-dashed border-slate-300 p-3.5 text-sm leading-relaxed text-slate-600">
                          <User aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{s.note}
                        </p>
                      )}
                    </div>
                    <div className={pictureLeft ? "lg:order-1" : ""}><Visual /></div>
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

// ── After the trial ──
const afterIcons: LucideIcon[] = [CalendarDays, MousePointerClick, ShieldCheck, Gift];

function AfterTrial({ c }: { c: C["afterTrial"] }) {
  return (
    <section aria-labelledby="after-title" className="bg-slate-50 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="after-title" eyebrow={c.eyebrow} title={c.title(TRIAL_DAYS)} text={c.text} />

        {/* The trial at a glance: one bar per day, then you choose. Same facts as the cards below. */}
        <Reveal className="mx-auto mt-12 max-w-3xl">
          <div aria-hidden className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 sm:gap-x-3">
            <div className="flex gap-1.5 sm:gap-2">
              {Array.from({ length: TRIAL_DAYS }, (_, i) => (
                <span key={i} className="h-3 flex-1 rounded-full bg-blue-600" style={{ opacity: 0.45 + (0.55 * (i + 1)) / TRIAL_DAYS }} />
              ))}
            </div>
            <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white sm:text-sm">{c.pick}</span>
            <div className="flex justify-between text-xs font-semibold text-slate-500 sm:text-sm">
              <span>{c.dayLabel(1)}</span>
              <span>{c.dayLabel(TRIAL_DAYS)}</span>
            </div>
          </div>
        </Reveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {c.items(TRIAL_DAYS).map((it, i) => {
            const Icon = afterIcons[i];
            return (
              <li key={it.title}>
                <Reveal delay={i * 80} className="h-full">
                  <div className="h-full rounded-3xl bg-white p-6 ring-1 ring-slate-200 transition-shadow duration-300 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)]">
                    <span aria-hidden className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5" /></span>
                    <h3 className="mt-5 text-lg font-semibold text-slate-900">{it.title}</h3>
                    <p className="mt-2 leading-relaxed text-slate-600">{it.text}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>

        <Reveal className="mt-10 flex justify-center">
          <Link
            to="/precios"
            className={`group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-slate-800 ${focusRing}`}
          >
            {c.cta} <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

// ── FAQ ──
function ShortFaq({ c }: { c: C["faq"] }) {
  return (
    <section aria-labelledby="cf-faq-title" className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="cf-faq-title" eyebrow={c.eyebrow} title={c.title} />
        <Reveal className="mt-12">
          <Accordion type="single" collapsible className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-5 sm:px-6">
            {c.items.map((f, i) => (
              <AccordionItem key={f.q} value={`cf-faq-${i}`} className="border-0">
                <AccordionTrigger className="min-h-11 py-5 text-left text-base font-semibold text-slate-900 hover:no-underline focus-visible:ring-blue-500/50">{f.q}</AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed text-slate-600">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
        <Reveal className="mt-8 flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-center sm:gap-2">
          <span className="text-slate-600">{c.more}</span>
          <Link
            to="/preguntas"
            className={`group inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-blue-600 hover:text-blue-700 ${focusRing}`}
          >
            {c.moreLink} <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export default function ComoFunciona() {
  const c = useCopy(comoFuncionaCopy);
  return (
    <SitePage title={c.pageTitle}>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={<>{c.hero.titleA} <span className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">{c.hero.titleB}</span></>}
        text={c.hero.text}
        secondary={{ label: c.hero.secondary, to: "/producto" }}
      >
        <StepJumps c={c.hero} steps={c.steps.items} />
      </PageHero>
      <Timeline c={c.steps} />
      <DayWithApp c={c.day} />
      <AfterTrial c={c.afterTrial} />
      <ShortFaq c={c.faq} />
    </SitePage>
  );
}
