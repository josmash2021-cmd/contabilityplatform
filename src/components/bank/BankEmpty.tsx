import { Check, Landmark } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { bancosCopy } from "@/i18n/copy/bancos";
import { SecureLine } from "./BankBottom";

/** No bank yet, in the prototype's .empty style: what connecting does, how safe it is, and the plan's allowance. */
export function BankEmpty({ canConnect, limit, onConnect }: { canConnect: boolean; limit: number | null; onConnect: () => void }) {
  const t = useCopy(bancosCopy).empty;
  return (
    <section className="grid justify-items-center rounded-[14px] border border-dashed border-slate-200 bg-white px-4 py-9 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600"><Landmark className="h-6 w-6" aria-hidden="true" /></span>
      <h2 className="mt-3 text-base font-bold text-slate-900">{t.title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">{canConnect ? t.text : t.readOnly}</p>
      {canConnect && (
        <>
          <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[13px] text-slate-600">
            {t.points.map((p) => <li key={p} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />{p}</li>)}
          </ul>
          <button type="button" onClick={onConnect} data-guide="bank-connect"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:min-h-10">
            <Landmark className="h-4 w-4" aria-hidden="true" />{t.button}
          </button>
          {limit !== null && <p className="mt-2 text-xs text-slate-500">{t.plan(limit)}</p>}
        </>
      )}
      <SecureLine className="mt-5 justify-center" />
    </section>
  );
}
