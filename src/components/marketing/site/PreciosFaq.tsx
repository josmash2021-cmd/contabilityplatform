// Billing questions for /precios, with a way to the full list at /preguntas.
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SectionHeading } from "@/components/marketing/LandingSections";
import { Reveal } from "@/components/marketing/Reveal";
import type { PreciosCopy, PreciosFaqData } from "@/i18n/copy/site/precios";

export function PreciosFaq({ c, data }: { c: PreciosCopy["faq"]; data: PreciosFaqData }) {
  return (
    <section id="preguntas-precios" className="scroll-mt-nav bg-white py-24 sm:py-28" aria-labelledby="pricing-faq-title">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="pricing-faq-title" eyebrow={c.eyebrow} title={c.title} />
        <Reveal className="mt-12">
          <Accordion type="single" collapsible className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-5 sm:px-6">
            {c.items(data).map((f, i) => (
              <AccordionItem key={f.q} value={`precios-faq-${i}`} className="border-0">
                <AccordionTrigger className="min-h-11 py-5 text-left text-base font-semibold text-slate-900 hover:no-underline focus-visible:ring-blue-500/50">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed text-slate-600">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
        <Reveal className="mt-8 flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-center sm:gap-2">
          <p className="text-[15px] text-slate-600">{c.more}</p>
          <Link
            to="/preguntas"
            className="group inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[15px] font-semibold text-blue-600 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {c.moreLink}
            <ArrowRight className="h-4 w-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
