// "Todos los planes incluyen": what every plan shares (words in src/i18n/copy/site/precios.ts).
import { BadgeCheck, CalendarCheck, FileCheck, Languages, ShieldCheck, Smartphone } from "lucide-react";
import { SectionHeading } from "@/components/marketing/LandingSections";
import { Reveal } from "@/components/marketing/Reveal";
import type { PreciosCopy } from "@/i18n/copy/site/precios";

// Same order as included.items: Plaid, languages, phone, trial, cancel, taxes.
const ICONS = [ShieldCheck, Languages, Smartphone, CalendarCheck, BadgeCheck, FileCheck];

export function PreciosIncluded({ c, days, taxPlans }: { c: PreciosCopy["included"]; days: number; taxPlans: string }) {
  return (
    <section id="incluido" className="scroll-mt-nav bg-slate-50 py-24 sm:py-28" aria-labelledby="included-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="included-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />
        <ul className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {c.items(days, taxPlans).map((it, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <li key={it.title}>
                <Reveal delay={(i % 3) * 80} className="h-full">
                  <div className="group h-full rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200 transition-all duration-300 motion-safe:hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)]">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors duration-300 group-hover:bg-blue-600 group-hover:text-white">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-slate-900">{it.title}</h3>
                    <p className="mt-2 leading-relaxed text-slate-600">{it.text}</p>
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
