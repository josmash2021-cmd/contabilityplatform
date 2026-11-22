// "Primero, confirma que eres tú" (the 2.0 prototype's tax gate): Impuestos keeps IDs and Social Security numbers,
// so it opens with a 6-digit code sent to the account's email. Once confirmed, this tab keeps it open for 30
// minutes while it's being used (api/lib/taxGate.ts checks it on every tax call).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { taxesCopy } from "@/i18n/copy/taxes";
import { setTaxUnlock } from "@/lib/taxUnlock";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
const RESEND_SECONDS = 30;

export function TaxGate({ email }: { email: string | null }) {
  const g = useCopy(taxesCopy).p.gate;
  const utils = trpc.useUtils();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const send = trpc.tax.sendCode.useMutation({
    onSuccess: (r) => { setSentTo(r.sentTo); setMinutes(r.minutes); setCode(""); setErr(null); setWait(RESEND_SECONDS); },
    onError: (e) => setErr(e.message),
  });
  const verify = trpc.tax.verifyCode.useMutation({
    onSuccess: (r) => {
      setTaxUnlock(r.token);
      toast.success(g.open(r.minutes));
      void utils.tax.invalidate();
    },
    onError: (e) => { setErr(e.message); setCode(""); input.current?.focus(); },
  });

  // The "send another" countdown.
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);
  useEffect(() => { if (sentTo) input.current?.focus(); }, [sentTo]);

  const check = (value: string) => {
    if (!/^\d{6}$/.test(value)) { setErr(g.bad); return; }
    if (!verify.isPending) verify.mutate({ code: value });
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); check(code); };
  const onType = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    setErr(null);
    if (digits.length === 6) check(digits); // pasted or typed in full: no need to press Verificar
  };

  return (
    <section aria-labelledby="tax-gate-title" className="mx-auto max-w-xl rounded-[14px] border border-slate-200 bg-white p-6 text-center sm:p-8">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Lock className="h-6 w-6" aria-hidden="true" /></span>
      <h2 id="tax-gate-title" className="mt-4 text-lg font-bold tracking-tight text-slate-900">{g.title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">{g.text}</p>

      {!sentTo ? (
        <div className="mt-5">
          <button type="button" onClick={() => send.mutate()} disabled={send.isPending}
            className={`inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60 sm:w-auto ${FOCUS}`}>
            {send.isPending ? g.sending : g.send}
          </button>
          {email && <p className="mt-2.5 text-xs text-slate-500">{g.willSend(email)}</p>}
          {err && <p role="alert" className="mt-2.5 text-sm text-red-600">{err}</p>}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mx-auto mt-5 max-w-sm text-left">
          <label htmlFor="tax-code" className="block text-sm font-medium text-slate-700">{g.label(sentTo)}</label>
          <div className="mt-1.5 flex gap-2">
            <input id="tax-code" ref={input} value={code} onChange={(e) => onType(e.target.value)}
              inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={g.placeholder}
              aria-invalid={err ? true : undefined} aria-describedby="tax-code-help"
              className={`h-11 min-w-0 flex-1 rounded-[10px] border bg-white px-3 text-center text-lg font-semibold tabular-nums tracking-[0.3em] text-slate-900 placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 ${err ? "border-red-400" : "border-slate-300"} ${FOCUS}`} />
            <button type="submit" disabled={verify.isPending}
              className={`h-11 shrink-0 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60 ${FOCUS}`}>
              {verify.isPending ? g.verifying : g.verify}
            </button>
          </div>
          <p id="tax-code-help" role={err ? "alert" : undefined} className={`mt-2 ${err ? "text-sm text-red-600" : "text-xs text-slate-500"}`}>
            {err ?? g.expires(minutes)}
          </p>
          <button type="button" onClick={() => send.mutate()} disabled={wait > 0 || send.isPending}
            className={`mt-3 rounded text-sm font-semibold text-blue-600 hover:text-blue-500 disabled:cursor-default disabled:text-slate-400 ${FOCUS}`}>
            {send.isPending ? g.sending : wait > 0 ? g.resendIn(wait) : g.resend}
          </button>
        </form>
      )}
    </section>
  );
}
