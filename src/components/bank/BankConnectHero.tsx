import { Landmark, ShieldCheck } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { bancoNegocioCopy } from "@/i18n/copy/bancoNegocio";

/** No bank yet: what connecting does, how safe it is, and the plan's bank allowance. */
export function BankConnectHero({ canConnect, limit, onConnect }: { canConnect: boolean; limit: number | null | undefined; onConnect: () => void }) {
  const t = useCopy(bancoNegocioCopy).connect;
  return (
    <section className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Landmark className="h-6 w-6" /></span>
      <h2 className="mt-5 text-xl font-bold tracking-tight">{t.title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">{canConnect ? t.text : t.readOnly}</p>
      {canConnect && (
        <>
          <ul className="mt-5 space-y-2">
            {t.points.map((p) => <li key={p} className="flex items-start gap-2 text-sm text-slate-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{p}</li>)}
          </ul>
          <button onClick={onConnect} className="mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
            <Landmark className="h-4 w-4" />{t.button}
          </button>
          {typeof limit === "number" && <p className="mt-3 text-xs text-slate-400">{t.plan(limit)}</p>}
        </>
      )}
    </section>
  );
}
