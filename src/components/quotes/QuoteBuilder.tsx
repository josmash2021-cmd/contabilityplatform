import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCopy } from "@/i18n/useI18n";
import { quotesCopy, type QuotesCopy } from "@/i18n/copy/quotes";
import { addDays, isValidIsoDate, localIsoDate } from "../../../api/lib/quotes";
import { CustomerField } from "./CustomerField";
import { ItemsEditor } from "./ItemsEditor";
import {
  blankLine, draftTotals, money, parseLines, parseMoney, priceInput, toDraftLines, useRefreshQuotes,
  type CustomerOption, type CustomerValue, type DraftLine, type QuoteDetail, type ServiceOption,
} from "./shared";

export type BuilderState = { mode: "create" } | { mode: "edit"; id: number };

/** Days a new quote stays valid by default. */
const DEFAULT_VALID_DAYS = 15;

/** Create or edit a quote, in a dialog (full screen on phones). */
export function QuoteBuilderDialog({ state, onClose, onSaved, services, customers }: {
  state: BuilderState | null;
  onClose: () => void;
  onSaved: (id: number) => void;
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
}) {
  const t = useCopy(quotesCopy);
  const editId = state?.mode === "edit" ? state.id : null;
  const existing = trpc.quotes.get.useQuery({ id: editId ?? 0 }, { enabled: editId !== null });
  const initial = editId !== null ? existing.data ?? null : null;

  return (
    <Dialog open={state !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh] sm:max-w-2xl">
        <DialogHeader className="border-b border-neutral-100 px-4 py-3 pr-12 text-left sm:px-6">
          <DialogTitle className="text-base">{editId !== null ? t.form.editTitle(initial?.number ?? "") : t.form.createTitle}</DialogTitle>
          <DialogDescription className="text-xs">{t.form.intro}</DialogDescription>
        </DialogHeader>
        {state === null ? null : editId !== null && !initial ? (
          existing.isError ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-neutral-600" role="alert">{existing.error.message || t.error}</p>
              <Button variant="outline" size="sm" onClick={() => void existing.refetch()}>{t.retry}</Button>
            </div>
          ) : (
            <div className="space-y-3 p-6" role="status" aria-label={t.detail.loading}>
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          )
        ) : (
          <QuoteForm
            key={editId !== null ? `edit-${editId}` : "create"}
            initial={initial}
            services={services}
            customers={customers}
            t={t}
            onCancel={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuoteForm({ initial, services, customers, t, onCancel, onSaved }: {
  initial: QuoteDetail | null;
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
  t: QuotesCopy;
  onCancel: () => void;
  onSaved: (id: number) => void;
}) {
  const id = useId();
  const refresh = useRefreshQuotes();
  const [customer, setCustomer] = useState<CustomerValue>(() => ({ id: initial?.customerId ?? null, name: initial?.customerName ?? "" }));
  const [lines, setLines] = useState<DraftLine[]>(() => (initial ? toDraftLines(initial.items) : [blankLine()]));
  const [discount, setDiscount] = useState(() => (initial && initial.discount > 0 ? priceInput(initial.discount) : ""));
  const [validUntil, setValidUntil] = useState(() => (initial ? initial.validUntil ?? "" : addDays(localIsoDate(new Date()), DEFAULT_VALID_DAYS)));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const onError = (e: { message: string }) => setError(e.message || t.toasts.error);
  const create = trpc.quotes.create.useMutation({
    onSuccess: (r) => { toast.success(t.toasts.created(r.number)); refresh(); onSaved(r.id); },
    onError,
  });
  const update = trpc.quotes.update.useMutation({
    onSuccess: (r) => { toast.success(t.toasts.updated); refresh(); onSaved(r.id); },
    onError,
  });
  const pending = create.isPending || update.isPending;
  const totals = draftTotals(lines, discount);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLines(lines, t.form);
    if ("error" in parsed) return setError(parsed.error);
    const disc = discount.trim() === "" ? 0 : parseMoney(discount);
    if (disc === null) return setError(t.form.errors.discount);
    if (validUntil && !isValidIsoDate(validUntil)) return setError(t.form.errors.date);
    setError(null);
    const payload = {
      customerId: customer.id,
      customerName: customer.name.trim() || null,
      items: parsed.items,
      discount: disc,
      validUntil: validUntil || null,
      notes: notes.trim() || null,
    };
    if (initial) update.mutate({ id: initial.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
        <CustomerField value={customer} onChange={setCustomer} customers={customers} t={t.form} />
        <ItemsEditor lines={lines} onChange={(l) => { setLines(l); setError(null); }} services={services} t={t.form} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-discount`} className="text-xs text-neutral-600">{t.form.discount}</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400" aria-hidden="true">$</span>
              <Input
                id={`${id}-discount`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={discount}
                onChange={(e) => { setDiscount(e.target.value); setError(null); }}
                className="h-10 pl-6 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-valid`} className="text-xs text-neutral-600">{t.form.validUntil}</Label>
            <Input
              id={`${id}-valid`}
              type="date"
              value={validUntil}
              onChange={(e) => { setValidUntil(e.target.value); setError(null); }}
              className="h-10 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-notes`} className="text-xs text-neutral-600">{t.form.notes}</Label>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            maxLength={2000}
            rows={3}
            placeholder={t.form.notesPlaceholder}
            onChange={(e) => setNotes(e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-neutral-100 bg-white px-4 py-3 sm:px-6">
        <dl className="space-y-0.5 text-sm">
          {totals.discountCents > 0 && (
            <>
              <div className="flex justify-between text-neutral-600"><dt>{t.form.subtotal}</dt><dd>{money(totals.subtotalCents)}</dd></div>
              <div className="flex justify-between text-neutral-600"><dt>{t.form.discountLine}</dt><dd>-{money(totals.discountCents)}</dd></div>
            </>
          )}
          <div className="flex justify-between text-base font-semibold text-black"><dt>{t.form.total}</dt><dd aria-live="polite">{money(totals.totalCents)}</dd></div>
        </dl>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} className="text-neutral-600">{t.form.cancel}</Button>
          <Button type="submit" disabled={pending} className="bg-black text-white hover:bg-neutral-800">
            {pending ? t.form.saving : t.form.save}
          </Button>
        </div>
      </div>
    </form>
  );
}
