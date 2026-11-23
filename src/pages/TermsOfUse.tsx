import { ArrowLeft, ScrollText } from "lucide-react";
import { Link } from "react-router";
import { AnimatedPage } from "@/components/AnimatedPage";
import { useCopy } from "@/i18n/useI18n";
import { termsOfUseCopy } from "@/i18n/copy/termsOfUse";
import { useNoZoom } from "@/hooks/useNoZoom";
import { useBack } from "@/hooks/useBack";
import { CONTACT_EMAIL } from "@contracts/constants";


/** "Términos de uso" (/terminos-de-uso, /terms-of-use): the app's terms, accepted when creating an account. */
export default function TermsOfUse() {
  const back = useBack(); // opened on its own (new tab, a link), it goes to the home page
  const t = useCopy(termsOfUseCopy);
  useNoZoom(); // Part of the public site: no zoom.

  return (
    <AnimatedPage className="mx-auto max-w-3xl p-4 lg:p-8">
      <div className="mb-6 flex items-start gap-3">
        <button type="button" onClick={back} aria-label={t.back}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"><ScrollText className="h-5 w-5 text-blue-600" aria-hidden="true" />{t.title}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{t.updated}</p>
        </div>
      </div>

      <article className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-[15px] leading-relaxed text-slate-700 sm:p-7">
        <p className="text-slate-600">{t.intro}</p>
        {t.sections.map((s, i) => (
          <section key={s.h} className="grid gap-1.5 border-t border-slate-100 pt-4">
            <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{i + 1}</span>{s.h}
            </h2>
            {s.p && <p>{s.p}</p>}
            {s.list && <ul className="ml-5 grid list-disc gap-1 marker:text-blue-500">{s.list.map((x) => <li key={x}>{x}</li>)}</ul>}
          </section>
        ))}
        <section className="grid gap-1.5 border-t border-slate-100 pt-4">
          <h2 className="text-base font-bold text-slate-900">{t.contactTitle}</h2>
          <p>{t.contact} <span className="select-all font-semibold text-slate-900">{CONTACT_EMAIL}</span> {t.orChat}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link to="/privacy" className="w-fit font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700">{t.privacyLink}</Link>
            <Link to="/terminos" className="w-fit font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700">{t.taxLink}</Link>
          </div>
        </section>
      </article>
    </AnimatedPage>
  );
}
