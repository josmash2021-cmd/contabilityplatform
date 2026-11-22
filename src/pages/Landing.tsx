import { useEffect } from "react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Hero, TrustStrip, ValueProps, Product, HowItWorks, Security, Pricing, Faq, FinalCta } from "@/components/marketing/LandingSections";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy } from "@/i18n/copy/marketing";
import { useNoZoom } from "@/hooks/useNoZoom";
import { SupportBubble } from "@/components/support/SupportBubble";

function usePauseOffscreenSections() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("#contenido > section"));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.target as HTMLElement).toggleAttribute("data-offscreen", !e.isIntersecting)),
      { rootMargin: "120px 0px" },
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function Landing() {
  const c = useCopy(marketingCopy);
  usePauseOffscreenSections();
  useNoZoom(); // The site doesn't zoom (the app does).
  return (
    <div className="font-brand min-h-screen bg-white text-slate-900">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow">
        {c.skip}
      </a>
      <MarketingNav />
      <main id="contenido">
        <Hero c={c.hero} />
        <TrustStrip c={c.trust} />
        <ValueProps c={c.value} />
        <Product c={c.product} />
        <HowItWorks c={c.how} />
        <Security c={c.security} />
        <Pricing c={c.pricing} />
        <Faq c={c.faq} />
        <FinalCta c={c.finalCta} />
      </main>
      <MarketingFooter />
      <SupportBubble />
    </div>
  );
}
