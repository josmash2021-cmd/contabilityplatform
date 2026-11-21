import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { quotesCopy, type QuotesCopy } from "@/i18n/copy/quotes";
import { LinesEditor } from "@/components/invoices/LinesEditor";
import { FIELD, LABEL, btn } from "@/components/invoices/ui";
import { fmtDay } from "@/components/invoices/shared";
import { addDays, localIsoDate } from "../../../api/lib/quotes";
import { CustomerField } from "./CustomerField";
import {
  draftTotals, filledLines, firstLine, money, parseLines, parseMoney, priceInput, toDraftLines, useRefreshQuotes,
  type CustomerOption, type CustomerValue, type DraftLine, type QuoteDetail, type ServiceOption,
} from "./shared";

export type BuilderState = { mode: "create" } | { mode: "edit"; id: number };

const VALID_DAYS = [7, 15, 30] as const;
const DEFAULT_VALID = "d15";

/** "Nueva cotización" (the prototype's panel with `.form`); also edits one. Full screen on phones. */
export function QuoteBuilderDialog({ state, onClose, onSaved, services, customers }: {
  state: BuilderState | null;
  onClose: () => void;
  /** `send`: open the send options next. */
  onSaved: (id: number, send: boolean) => void;
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
}) {
  const t = useCopy(quotesCopy);
  const editId = state?.mode === "edit" ? state.id : null;
  const existing = trpc.quotes.get.useQuery({ id: editId ?? 0 }, { enabled: editId !== null });
  const initial = editId !== null ? existing.data ?? null : null;

  return (
    <Dialog open={state !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-h-[90vh] sm:max-w-[520px] sm:rounded-2xl">
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left">
          <DialogTitle className="text-[17px] font-[750] text-slate-900">{editId !== null ? t.form.editTitle(initial?.number ?? "") : t.form.createTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.form.intro}</DialogDescription>
        </DialogHeader>
        {state === null ? null : editId !== null && !initial ? (
          existing.isError ? (
            <div className="grid justify-items-center gap-3 p-8 text-center">
              <p className="text-sm text-slate-600" role="alert">{existing.error.message || t.error}</p>
              <button type="button" className={btn()} onClick={() => void existing.refetch()}>{t.retry}</button>
            </div>
          ) : (
            <div className="grid gap-3 p-6" role="status" aria-label={t.detail.loading}>
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
            </div>
          )
        ) : (
          <QuoteForm
            key={editId !== null ? `edit-${editId}` : "create"}
            initial={initial}
            services={services}
            customers={customers}
            t={t}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuoteForm({ initial, services, customers, t, onSaved }: {
  initial: QuoteDetail | null;
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
  t: QuotesCopy;
  onSaved: (id: number, send: boolean) => void;
}) {
  const id = useId();
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefreshQuotes();
  const [today] = useState(() => localIsoDate(new Date()));
  const [customer, setCustomer] = useState<CustomerValue>(() => ({ id: initial?.customerId ?? null, name: initial?.customerName ?? "" }));
  const [lines, setLines] = useState<DraftLine[]>(() => (initial ? toDraftLines(initial.items) : [firstLine(services)]));
  const [discount, setDiscount] = useState(() => (initial && initial.discount > 0 ? priceInput(initial.discount) : ""));
  // "d7" / "d15" / "d30": days from today; "keep": the date it already has; "none": no deadline.
  const [valid, setValid] = useState<string>(() => (initial ? (initial.validUntil ? "keep" : "none") : DEFAULT_VALID));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const onError = (e: { message: string }) => setError(e.message || t.toasts.error);
  const create = trpc.quotes.create.useMutation({ onError });
  const update = trpc.quotes.update.useMutation({ onError });
  const pending = create.isPending || update.isPending;
  const totals = draftTotals(filledLines(lines), discount);
  const validUntil = valid === "keep" ? initial?.validUntil ?? null : valid === "none" ? null : addDays(today, Number(valid.slice(1)));

  const submit = (send: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    const parsed = parseLines(filledLines(lines), t.form);
    if ("error" in parsed) return setError(parsed.error);
    const disc = discount.trim() === "" ? 0 : parseMoney(discount);
    if (disc === null) return setError(t.form.errors.discount);
    setError(null);
    const payload = {
      customerId: customer.id,
      customerName: customer.name.trim() || null,
      items: parsed.items,
      discount: disc,
      validUntil,
      notes: notes.trim() || null,
    };
    if (initial) {
      update.mutate({ id: initial.id, ...payload }, { onSuccess: (r) => { toast.success(t.toasts.updated); refresh(); onSaved(r.id, false); } });
    } else {
      create.mutate(payload, { onSuccess: (r) => { toast.success(t.toasts.created(r.number)); refresh(); onSaved(r.id, send); } });
    }
  };

  return (
    <form onSubmit={submit(true)} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto px-4 pb-4 pt-2">
        <CustomerField value={customer} onChange={setCustomer} customers={customers} t={t.form} />
        <LinesEditor lines={lines} onChange={(l) => { setLines(l); setError(null); }} services={services} t={t.lines} />
        <label htmlFor={`${id}-valid`} className={LABEL}>
          {t.form.validFor}
          <select id={`${id}-valid`} value={valid} onChange={(e) => setValid(e.target.value)} className={FIELD} aria-describedby={`${id}-valid-hint`}>
            {initial?.validUntil && <option value="keep">{t.form.validKeep(fmtDay(initial.validUntil, locale, today))}</option>}
            {VALID_DAYS.map((d) => <option key={d} value={`d${d}`}>{t.form.validOptions[d]}</option>)}
            <option value="none">{t.form.validNone}</option>
          </select>
          {validUntil && <span id={`${id}-valid-hint`} className="text-xs font-normal text-slate-500">{t.form.validUntil(fmtDay(validUntil, locale, today))}</span>}
        </label>
        <details className="group grid gap-2" open={Boolean(initial && (initial.discount > 0 || initial.notes))}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-blue-600 sm:min-h-0 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
            {t.form.more}
          </summary>
          <div className="mt-2 grid gap-2.5">
            <label htmlFor={`${id}-disc`} className={LABEL}>
              {t.form.discount}
              <span className="relative block">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
                <input id={`${id}-disc`} inputMode="decimal" autoComplete="off" placeholder="0.00" value={discount} onChange={(e) => { setDiscount(e.target.value); setError(null); }} className={cn(FIELD, "pl-6")} />
              </span>
            </label>
            <label htmlFor={`${id}-notes`} className={LABEL}>
              {t.form.notes}
              <textarea
                id={`${id}-notes`} rows={2} maxLength={2000} value={notes} placeholder={t.form.notesPlaceholder}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full resize-y rounded-[10px] border border-slate-200 bg-white px-2.5 py-2 text-base font-normal text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-sm"
              />
            </label>
          </div>
        </details>
      </div>
      <div className="grid gap-2.5 border-t border-slate-100 bg-white px-4 py-3">
        <div className="flex items-baseline justify-between rounded-[10px] bg-slate-100 px-3 py-2.5 text-sm">
          <span>{t.form.total}</span>
          <b className="text-xl font-bold tabular-nums" aria-live="polite">{money(totals.totalCents)}</b>
        </div>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {initial ? (
          <button type="button" className={btn("primary", "w-full")} disabled={pending} onClick={() => submit(false)()}>{pending ? t.form.saving : t.form.save}</button>
        ) : (
          <>
            <button type="submit" className={btn("primary", "w-full")} disabled={pending}>{pending ? t.form.saving : t.form.send}</button>
            <button type="button" className={btn("w-full")} disabled={pending} onClick={() => submit(false)()}>{t.form.draft}</button>
          </>
        )}
        <p className="text-xs text-slate-500">{t.form.foot}</p>
      </div>
    </form>
  );
}
