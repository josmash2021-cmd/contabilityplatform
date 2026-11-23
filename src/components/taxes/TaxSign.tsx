import { useId, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PenLine } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { taxesCopy } from "@/i18n/copy/taxes";
import { normalizeName, sameName, type SignSpot } from "@contracts/taxRules";
import { SignaturePad } from "./SignaturePad";
import { TaxPdfPreview } from "./TaxPdfPreview";
import { TaxSignLive } from "./TaxSignLive";
import { taxMoney, type Doc, type Ret, type TaxResult } from "./taxView";

const signed = (r: TaxResult) => (r ? (r.kind === "refund" ? r.amount : -r.amount) : 0);
const money = (r: TaxResult) => (r ? `${r.kind === "owe" ? "−" : ""}${taxMoney(r.amount)}` : "—");

/**
 * "Revisa y firma" (option A): what comes back in total, big; the documents the preparer sent, half open with
 * "Vista previa" (tap for the whole PDF); "Revisé mi declaración"; and our own signature of the 8879: the 8879
 * live on its "Your signature" line (TaxSignLive), the drawn signature, and the full name typed by the client,
 * which must be the name on the return (`signName`: "María López" doesn't sign for "María José López").
 * Sends tax.sign with where the line is; the server stamps the same and adds the signed 8879 to the return.
 */
export function TaxSignForm({ ret, docs, preparerName, signName, onOpen, onAsk }: {
  ret: Ret; docs: readonly Doc[]; preparerName: string; signName: string | null; onOpen: (d: Doc) => void; onAsk: () => void;
}) {
  const t = useCopy(taxesCopy);
  const s = t.p.sign;
  const utils = trpc.useUtils();
  const nameId = useId();
  const [checked, setChecked] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [left, setLeft] = useState(false);
  const [spot, setSpot] = useState<SignSpot | null>(null);
  const sign = trpc.tax.sign.useMutation({
    onSuccess: () => { toast.success(s.done); void utils.tax.current.invalidate(); },
    onError: (e) => toast.error(e.message || t.errors.generic),
  });
  // The newest one of each (docs come oldest first), the same 8879 the server signs.
  const prep = (kind: string) => [...docs].reverse().find((d) => d.source === "preparer" && d.kind === kind);
  const files = (["final_fed", "final_state", "f8879"] as const).map((k) => prep(k)).filter((d): d is Doc => !!d);
  const f8879 = prep("f8879");
  const total = signed(ret.fedResult) + signed(ret.stateResult);
  const hasResult = !!(ret.fedResult || ret.stateResult);
  const nameOk = signName ? sameName(name, signName) : name.trim().length >= 3;
  // Wrong once they've left the box, or typed as much as the full name and it still isn't it.
  const typedAll = !!signName && normalizeName(name).length >= normalizeName(signName).length;
  const nameBad = !nameOk && name.trim().length > 0 && (left || typedAll);
  const ok = checked && !!signature && nameOk;

  return (
    <div className="mt-2.5 grid gap-3.5">
      {hasResult && (
        <div className={cn("grid justify-items-center gap-0.5 rounded-2xl px-4 py-4 text-center", total >= 0 ? "bg-gradient-to-b from-emerald-50 to-emerald-50/40" : "bg-gradient-to-b from-amber-50 to-amber-50/40")}>
          <span className="text-[13px] text-slate-500">{total >= 0 ? s.totalBack : s.totalOwe}</span>
          <span className={cn("text-[38px] font-extrabold leading-tight tracking-tight tabular-nums", total >= 0 ? "text-emerald-600" : "text-amber-700")}>{taxMoney(Math.abs(total))}</span>
          <span className="text-[13px] text-slate-500">{s.split(money(ret.fedResult), money(ret.stateResult))}</span>
        </div>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
        {ret.filingStatus && <><dt className="text-slate-500">{s.filing}</dt><dd className="text-right font-semibold text-slate-900">{ret.filingStatus}</dd></>}
        <dt className="text-slate-500">{s.by}</dt><dd className="text-right font-semibold text-slate-900">{preparerName}</dd>
      </dl>

      {files.length > 0 && (
        <section className="grid gap-2.5" aria-label={s.reviewTitle}>
          <h3 className="text-[14.5px] font-bold text-slate-900">{s.reviewTitle}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {files.map((d) => (
              <TaxPdfPreview key={d.id} doc={d} title={t.preparerDocs[d.kind] ?? d.fileName} previewLabel={s.preview} openLabel={s.openFull} loadingLabel={s.loading} onOpen={onOpen}
                // An odd one out (the 8879, the one to sign) takes the whole row instead of sitting alone.
                className={files.length % 2 === 1 && d.id === files[files.length - 1].id ? "sm:col-span-2" : undefined} />
            ))}
          </div>
        </section>
      )}

      <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-[14px] border px-3.5 py-3 text-sm text-slate-800 transition-colors", checked ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white")}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />{s.checked}
      </label>

      <section className="grid gap-2.5" aria-label={s.signTitle}>
        <h3 className="text-[14.5px] font-bold text-slate-900">{s.signTitle}</h3>
        {f8879 && <TaxSignLive doc={f8879} signature={signature} name={nameOk && signName ? signName : name} onSpot={setSpot}
          labels={{ title: s.liveTitle, live: s.live, here: s.liveHere, whole: s.liveWhole, zoom: s.liveZoom }} />}
        <SignaturePad onChange={setSignature} label={s.pad} clearLabel={s.clear} />
        <div className="grid gap-1">
          <label htmlFor={nameId} className="text-[13px] font-semibold text-slate-700">{s.nameLabel}</label>
          <div className="relative">
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setLeft(true)} maxLength={120} autoComplete="off" spellCheck={false}
              placeholder={s.namePh} aria-invalid={nameBad || undefined} aria-describedby={`${nameId}-help`}
              className={cn("h-11 w-full rounded-xl border bg-white px-3 pr-10 text-[15px] font-medium text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-slate-400 focus:ring-4",
                nameOk ? "border-emerald-400 focus:ring-emerald-100" : nameBad ? "border-amber-400 bg-amber-50/40 focus:ring-amber-100" : "border-slate-200 focus:border-blue-400 focus:ring-blue-100")} />
            {nameOk && <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" aria-hidden="true" />}
          </div>
          <p id={`${nameId}-help`} className={cn("text-xs", nameOk ? "font-semibold text-emerald-700" : nameBad ? "font-semibold text-amber-800" : "text-slate-500")} aria-live="polite">
            {nameOk ? s.nameOk : nameBad ? s.nameBad : s.nameHelp}
          </p>
          {nameBad && <button type="button" onClick={onAsk} className="w-fit text-xs font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800">{s.nameAsk(preparerName)}</button>}
        </div>
        <p className="text-xs leading-relaxed text-slate-500">{s.legal(preparerName)}</p>
        <button type="button" disabled={!ok || sign.isPending}
          onClick={() => signature && sign.mutate({ name: name.trim(), signature, agree: true, docId: f8879?.id, spot: spot ?? undefined })}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-semibold text-white shadow-[0_10px_22px_-12px_rgba(37,99,235,0.9)] transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          {sign.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PenLine className="h-4 w-4" aria-hidden="true" />}
          {sign.isPending ? s.signing : s.button}
        </button>
        {!ok && <p className="text-center text-xs text-slate-500">{s.needAll}</p>}
      </section>
    </div>
  );
}
