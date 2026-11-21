import { useState, type FormEvent } from "react";
import { ChevronRight, ExternalLink, Landmark, Loader2, MapPin, MessageCircle, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Dst, pbtnSm, pbtnSmPrimary, pinput } from "@/components/personal/planKit";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy } from "@/i18n/copy/taxes";
import { TAX_STEP_COUNT, filingDeadline } from "@contracts/taxRules";
import { longDay, taxMoney, type Msg, type Ret } from "./taxView";

const card = "rounded-[14px] border border-slate-200 bg-white p-4";

/** A link to an official site, in a new tab (taxLink). */
export function TaxLink({ href, children }: { href: string; children: string }) {
  const t = useCopy(taxesCopy).p.agencies;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={pbtnSm}>
      <ExternalLink className="h-[15px] w-[15px]" aria-hidden="true" />{children}<span className="sr-only">{t.newTab}</span>
    </a>
  );
}

/**
 * Who it's filed with (taxAgStrip / taxAgencies): the IRS and the Alabama Department of Revenue, with the
 * deadline and their sites. Plain icons of our own: never a government logo or seal.
 */
export function TaxAgencies({ year, stack }: { year: number; stack?: boolean }) {
  const t = useCopy(taxesCopy).p.agencies;
  const locale = intlLocale(useLang().lang);
  const deadline = t.deadline(longDay(filingDeadline(year), locale));
  const rows = [
    { icon: Landmark, k: t.fedK, name: t.fedName, meta: t.fedMeta, href: "https://www.irs.gov/", label: "irs.gov" },
    { icon: MapPin, k: t.stateK, name: t.stateName, meta: t.stateMeta, href: "https://www.revenue.alabama.gov/", label: "revenue.alabama.gov" },
  ];
  if (stack) {
    return (
      <div className="grid gap-3">
        {rows.map((r) => (
          <div key={r.label} className={cn(card, "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 px-4 py-3.5")}>
            <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-blue-50 text-blue-600"><r.icon className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <span className="block text-xs text-slate-500">{r.k}</span>
              <b className="block text-[15px] text-slate-900">{r.name}</b>
              <span className="block text-[13px] text-slate-500">{deadline}</span>
            </div>
            <div className="col-span-2"><TaxLink href={r.href}>{r.label}</TaxLink></div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <section className={card} aria-labelledby="tax-ag-h">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="tax-ag-h" className="font-semibold text-slate-900">{t.title}</h2>
        <span className="text-xs text-slate-500">{deadline}</span>
      </div>
      <ul className="mt-2 divide-y divide-slate-200">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-blue-50 text-blue-600"><r.icon className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-[1_1_160px]">
              <b className="block text-sm text-slate-900">{r.name}</b>
              <span className="block text-[13px] text-slate-500">{r.meta}</span>
            </div>
            <TaxLink href={r.href}>{r.label}</TaxLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One card per earlier year (taxHistory); tapping opens that year's page. */
export function TaxHistory({ past, onOpen }: { past: readonly Ret[]; onOpen: (id: number) => void }) {
  const t = useCopy(taxesCopy);
  const h = t.p.history;
  return (
    <>
      {past.map((y) => {
        const fed = y.fedResult, st = y.stateResult;
        const refund = (fed?.kind === "refund" ? fed.amount : 0) + (st?.kind === "refund" ? st.amount : 0);
        const owe = (fed?.kind === "owe" ? fed.amount : 0) + (st?.kind === "owe" ? st.amount : 0);
        const text = refund > 0 ? h.refund(taxMoney(refund)) : owe > 0 ? h.owe(taxMoney(owe)) : null;
        const done = y.step >= TAX_STEP_COUNT - 1;
        return (
          <button key={y.id} type="button" onClick={() => onOpen(y.id)}
            className={cn(card, "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-left transition hover:border-blue-600 hover:shadow-[0_6px_18px_-10px_rgba(15,23,42,.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500")}>
            <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-emerald-50 text-emerald-600"><Receipt className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            <span className="grid min-w-0 gap-0.5">
              <b className="text-[15px] text-slate-900">{h.card(y.taxYear)}</b>
              {text && <span className="text-[13px] text-slate-500">{h.meta(text)}</span>}
              <Dst tone={done ? "good" : "open"} className="mt-1 justify-self-start">{done ? h.done : y.step >= 0 ? t.steps[y.step]?.[0] : t.draftStep}</Dst>
            </span>
            <ChevronRight className="h-[18px] w-[18px] text-slate-500" aria-hidden="true" />
          </button>
        );
      })}
    </>
  );
}

/**
 * "Tu preparador" (taxPrepCard): who prepares the return (the name the preparer signs messages with, once
 * they've written), the conversation, and "Escríbele" to send a message (tax.sendMessage).
 */
export function TaxPreparer({ messages, compact }: { messages: readonly Msg[]; compact?: boolean }) {
  const t = useCopy(taxesCopy);
  const p = t.p.prep;
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const send = trpc.tax.sendMessage.useMutation({
    onSuccess: () => { setBody(""); setOpen(false); toast.success(p.sent); void utils.tax.current.invalidate(); },
    onError: (e) => toast.error(e.message || t.errors.generic),
  });
  const markRead = trpc.tax.markRead.useMutation();
  const unread = messages.some((m) => m.fromRole === "preparer" && !m.readAt);
  const read = () => { if (unread && !markRead.isPending) markRead.mutate(undefined, { onSuccess: () => void utils.tax.current.invalidate() }); };
  const name = [...messages].reverse().find((m) => m.fromRole === "preparer" && m.authorName)?.authorName ?? p.name;
  const initials = name === p.name ? null : name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (body.trim()) send.mutate({ body: body.trim() }); };

  return (
    <section className={card} aria-labelledby="tax-prep-h" onPointerEnter={read} onFocus={read}>
      <h2 id="tax-prep-h" className="flex items-center gap-2 font-semibold text-slate-900">{p.title}{unread && <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />}</h2>
      <div className="mt-1 flex items-center gap-3">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-600" aria-hidden="true">
          {initials || <MessageCircle className="h-5 w-5" />}
        </span>
        <div className="min-w-0"><b className="block text-[15px] text-slate-900">{name}</b><span className="block text-[13px] text-slate-500">{p.meta}</span></div>
      </div>
      {!compact && <p className="mt-2.5 text-sm text-slate-500">{p.text}</p>}
      {messages.length > 0 && (
        <ul className="mt-2.5 grid max-h-[360px] gap-1.5 overflow-y-auto">
          {messages.map((m) => {
            const mine = m.fromRole === "client";
            return (
              <li key={m.id} className={cn("max-w-[90%] rounded-xl px-[11px] py-2 text-[13px] [overflow-wrap:anywhere]", mine ? "justify-self-end rounded-br-[4px] bg-blue-600 text-white" : "justify-self-start rounded-bl-[4px] bg-slate-100 text-slate-900")}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={cn("mt-0.5 text-[10px]", mine ? "text-white/75" : "text-slate-500")}>
                  {mine ? p.you : m.authorName || p.name} · {new Date(m.createdAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {open ? (
        <form onSubmit={submit} className="mt-3 grid gap-2" noValidate>
          <label htmlFor="tax-msg" className="sr-only">{p.label(name)}</label>
          <textarea id="tax-msg" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} placeholder={p.placeholder} autoFocus
            className={cn(pinput, "min-h-[76px] resize-y py-2")} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!body.trim() || send.isPending} className={pbtnSmPrimary}>{send.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{p.send}</button>
            <button type="button" onClick={() => setOpen(false)} className={pbtnSm}>{p.cancel}</button>
          </div>
        </form>
      ) : (
        <div className="mt-3"><button type="button" onClick={() => setOpen(true)} className={pbtnSm}><MessageCircle className="h-[15px] w-[15px]" aria-hidden="true" />{p.write}</button></div>
      )}
    </section>
  );
}
