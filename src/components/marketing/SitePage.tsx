// Shared frame for the public site pages (/producto, /como-funciona, /seguridad, /precios, /preguntas):
// the same nav, dark hero, closing call to action and footer as the home page.
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FinalCta, primaryCta } from "@/components/marketing/LandingSections";
import { TRIAL_DAYS } from "@/components/marketing/content";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy } from "@/i18n/copy/marketing";

type Cta = { label: string; to: string };

/** The page's opening: dark like the home hero (the nav is transparent over it). */
export function PageHero({ eyebrow, title, text, primary, secondary, visual, children }: {
  eyebrow: string;
  title: ReactNode;
  text: ReactNode;
  primary?: Cta;
  secondary?: Cta;
  /** Shown to the right on large screens, below on phones. */
  visual?: ReactNode;
  /** Extra content under the text (badges, a search box…). */
  children?: ReactNode;
}) {
  const c = useCopy(marketingCopy);
  const first = primary ?? { label: c.nav.cta(TRIAL_DAYS), to: "/register" };
  return (
    <section className="relative overflow-hidden bg-[#060B18] pb-20 pt-32 text-white sm:pb-24 sm:pt-40" aria-labelledby="page-title">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-0 -m-[150px] h-[820px] w-[820px] bg-[radial-gradient(closest-side,rgba(37,99,235,0.3),rgba(37,99,235,0.105)_55%,transparent)]" />
        <div className="absolute -right-32 bottom-0 -m-[150px] h-[720px] w-[720px] bg-[radial-gradient(closest-side,rgba(124,58,237,0.24),rgba(124,58,237,0.084)_55%,transparent)]" />
      </div>
      <div className={`relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:px-8 ${visual ? "lg:grid-cols-2" : ""}`}>
        <div className={visual ? "" : "mx-auto max-w-3xl text-center"}>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-300">{eyebrow}</p>
          <h1 id="page-title" className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-300">{text}</p>
          <div className={`mt-9 flex flex-col gap-3 sm:flex-row ${visual ? "" : "sm:justify-center"}`}>
            <Link to={first.to} className={primaryCta}>
              {first.label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            {secondary && (
              <Link to={secondary.to} className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                {secondary.label}
              </Link>
            )}
          </div>
          {children}
        </div>
        {visual && <div className="relative">{visual}</div>}
      </div>
    </section>
  );
}

/** A full site page: nav, the page's sections, the closing call to action and the footer. */
export function SitePage({ children, title }: { children: ReactNode; /** Browser tab title. */ title: string }) {
  const c = useCopy(marketingCopy);
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Personal & Business Solutions`;
    window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, [title]);
  return (
    <div className="font-brand min-h-screen bg-white text-slate-900">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow">
        {c.skip}
      </a>
      <MarketingNav />
      <main id="contenido">
        {children}
        <FinalCta c={c.finalCta} />
      </main>
      <MarketingFooter />
    </div>
  );
}
