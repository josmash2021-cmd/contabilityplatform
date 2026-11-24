import type { ReactNode } from "react";
import { Landmark, ShieldCheck } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { personalPagesCopy } from "@/i18n/copy/personalPages";

/** The dark "connect your bank" card from the personal home, with one clear next step. */
export function ConnectBankHero({ onConnect, children }: { onConnect: () => void; children?: ReactNode }) {
  const { connect: t } = useCopy(personalPagesCopy).shared;
  return (
    <section className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Landmark className="h-6 w-6" aria-hidden="true" /></span>
      <h2 className="mt-5 text-xl font-bold tracking-tight sm:text-2xl">{t.title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">{t.text}</p>
      <ul className="mt-5 space-y-2">
        {t.points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-slate-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />{p}</li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onConnect} data-guide="bank-connect"
          className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
          <Landmark className="h-4 w-4" aria-hidden="true" />{t.button}
        </button>
        {children}
      </div>
    </section>
  );
}
