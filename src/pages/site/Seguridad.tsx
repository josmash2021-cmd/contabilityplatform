// /seguridad: how the product protects people's money and data, in plain words.
// Every claim is backed by the code; see src/i18n/copy/site/seguridad.ts.
import { PageHero, SitePage } from "@/components/marketing/SitePage";
import {
  SeguridadAccess, SeguridadControl, SeguridadHeroVisual, SeguridadNever, SeguridadPillars, SeguridadTrust,
} from "@/components/marketing/site/SeguridadSections";
import { useCopy } from "@/i18n/useI18n";
import { seguridadCopy } from "@/i18n/copy/site/seguridad";

export default function Seguridad() {
  const c = useCopy(seguridadCopy);
  return (
    <SitePage title={c.pageTitle}>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={
          <>
            {c.hero.titleA}
            <br />
            <span className="bg-gradient-to-r from-blue-300 to-emerald-300 bg-clip-text text-transparent">{c.hero.titleB}</span>
          </>
        }
        text={c.hero.text}
        secondary={{ label: c.hero.secondary, to: "/privacy" }}
        visual={<SeguridadHeroVisual c={c.hero.visual} />}
      />
      <SeguridadTrust c={c.trust} />
      <SeguridadPillars c={c.pillars} />
      <SeguridadAccess c={c.access} />
      <SeguridadNever c={c.never} />
      <SeguridadControl c={c.control} />
    </SitePage>
  );
}
