import { useId, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { invoicesCopy } from "@/i18n/copy/invoices";
import { quotesCopy } from "@/i18n/copy/quotes";
import { CustomerField } from "@/components/quotes/CustomerField";
import {
  draftTotals, filledLines, firstLine, money, parseLines, parseMoney, priceInput,
  type CustomerOption, type CustomerValue, type DraftLine, type ServiceOption,
} from "@/components/quotes/shared";
import { TERMS_OPTIONS, DEFAULT_TERMS, dueDateFor } from "../../../api/lib/invoices";
import { localIsoDate } from "../../../api/lib/quotes";
import { LinesEditor } from "./LinesEditor";
import { FIELD, LABEL, btn } from "./ui";
import { fmtDay } from "./shared";

/** What a new invoice starts with (from "Duplicar", or a client chosen elsewhere). */
export type InvoicePreset = { customer: CustomerValue; lines: DraftLine[]; discount: number; notes: string | null; termsDays: number };

/** "Nueva factura" (the prototype's panel with `.form`): full screen on phones. */
export function InvoiceFormDialog({ open, preset, onClose, onCreated, services, customers }: {
  open: boolean;
  preset: InvoicePreset | null;
  onClose: () => void;
  /** `issued`: false for a draft. */
  onCreated: (ref: string, issued: boolean) => void;
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
}) {
  const t = useCopy(invoicesCopy);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-h-[90vh] sm:max-w-[520px] sm:rounded-2xl">
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left">
          <DialogTitle className="text-[17px] font-[750] text-slate-900">{preset ? t.form.duplicateTitle : t.form.title}</DialogTitle>
          <DialogDescription className="sr-only">{t.form.intro}</DialogDescription>
        </DialogHeader>
        {open && <FormBody preset={preset} services={services} customers={customers} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function FormBody({ preset, services, customers, onCreated }: {
  preset: InvoicePreset | null;
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
  onCreated: (ref: string, issued: boolean) => void;
}) {
  const t = useCopy(invoicesCopy);
  const q = useCopy(quotesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const id = useId();
  const [today] = useState(() => localIsoDate(new Date()));
  const [customer, setCustomer] = useState<CustomerValue>(() => preset?.customer ?? { id: null, name: "" });
  const [lines, setLines] = useState<DraftLine[]>(() => preset?.lines ?? [firstLine(services)]);
  const [termsDays, setTermsDays] = useState<number>(preset?.termsDays ?? DEFAULT_TERMS);
  const [discount, setDiscount] = useState(() => (preset && preset.discount > 0 ? priceInput(preset.discount) : ""));
  const [notes, setNotes] = useState(preset?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const totals = draftTotals(filledLines(lines), discount);
  const termOptions = useMemo(() => (TERMS_OPTIONS.includes(termsDays as (typeof TERMS_OPTIONS)[number]) ? [...TERMS_OPTIONS] : [...TERMS_OPTIONS, termsDays].sort((a, b) => a - b)), [termsDays]);

  const create = trpc.invoices.create.useMutation({
    onError: (e) => setError(e.message || t.toasts.error),
  });

  const submit = (draft: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    const parsed = parseLines(filledLines(lines), q.form);
    if ("error" in parsed) return setError(parsed.error);
    const disc = discount.trim() === "" ? 0 : parseMoney(discount);
    if (disc === null) return setError(t.form.errors.discount);
    if (draftTotals(filledLines(lines), discount).totalCents <= 0) return setError(t.form.errors.total);
    setError(null);
    create.mutate({
      customerId: customer.id,
      customerName: customer.name.trim() || null,
      items: parsed.items,
      discount: disc,
      notes: notes.trim() || null,
      termsDays,
      draft,
    }, {
      onSuccess: (r) => {
        if (draft) toast.success(t.toasts.draft);
        onCreated(r.ref, !draft);
      },
    });
  };

  return (
    <form onSubmit={submit(false)} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto px-4 pb-4 pt-2">
        <CustomerField value={customer} onChange={setCustomer} customers={customers} t={q.form} />
        <LinesEditor lines={lines} onChange={(l) => { setLines(l); setError(null); }} services={services} t={q.lines} />
        <label htmlFor={`${id}-when`} className={LABEL}>
          {t.form.when}
          <select id={`${id}-when`} value={termsDays} onChange={(e) => setTermsDays(Number(e.target.value))} className={FIELD} aria-describedby={`${id}-due`}>
            {termOptions.map((d) => <option key={d} value={d}>{t.form.terms[d] ?? `${d}`}</option>)}
          </select>
          <span id={`${id}-due`} className="text-xs font-normal text-slate-500">{t.form.dueOn(fmtDay(dueDateFor(today, termsDays), locale, today))}</span>
        </label>
        <details className="group grid gap-2" open={Boolean(preset && (preset.discount > 0 || preset.notes))}>
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
        <button type="submit" className={btn("primary", "w-full")} disabled={create.isPending}>
          {create.isPending ? t.form.saving : t.form.submit}
        </button>
        <button type="button" className={btn("w-full")} disabled={create.isPending} onClick={() => submit(true)()}>
          {t.form.draft}
        </button>
        <p className="text-xs text-slate-500">{t.form.foot}</p>
      </div>
    </form>
  );
}
