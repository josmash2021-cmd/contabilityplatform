import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertCircle, CalendarX2, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { quotesCopy, type QuotesCopy } from "@/i18n/copy/quotes";
import { FREQUENCIES, anchorDayOf, isValidIsoDate, localIsoDate, nextPeriodDate, type Frequency } from "../../../api/lib/quotes";
import { Chip } from "./StatusChip";
import { CustomerField } from "./CustomerField";
import { LinesEditor } from "@/components/invoices/LinesEditor";
import {
  draftTotals, filledLines, firstLine, formatDay, money, parseLines, toDraftLines, useRefreshQuotes,
  type CustomerOption, type CustomerValue, type DraftLine, type RecurringInvoice, type ServiceOption,
} from "./shared";
import { BTN, CARD, FIELD, LABEL } from "./ui";

export type RecurringFormState = { mode: "create" } | { mode: "edit"; item: RecurringInvoice };

/** The "Recurrentes" tab: the list with pause / resume, and the form to create or edit one (opened from here or the page header). */
export function RecurringTab({ services, customers, canChange, form, onForm: setForm }: {
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
  /** False for a read-only team member (the accountant). */
  canChange: boolean;
  form: RecurringFormState | null;
  onForm: (f: RecurringFormState | null) => void;
}) {
  const t = useCopy(quotesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefreshQuotes();
  const [toDelete, setToDelete] = useState<RecurringInvoice | null>(null);
  const list = trpc.quotes.recurring.list.useQuery(undefined, { retry: (count, err) => err.data?.code !== "FORBIDDEN" && count < 1 });

  const onError = (e: { message: string }) => toast.error(e.message || t.toasts.error);
  const pause = trpc.quotes.recurring.pause.useMutation({ onSuccess: () => { toast.success(t.recurring.toasts.paused); refresh(); }, onError });
  const resume = trpc.quotes.recurring.resume.useMutation({
    onSuccess: (r) => {
      toast.success(r.created > 0 ? `${t.recurring.toasts.resumed}. ${t.toasts.ranDue(r.created)}` : t.recurring.toasts.resumed);
      refresh(r.created > 0);
    },
    onError,
  });
  const remove = trpc.quotes.recurring.delete.useMutation({
    onSuccess: () => { toast.success(t.recurring.toasts.deleted); setToDelete(null); refresh(); },
    onError,
  });
  const busy = pause.isPending || resume.isPending || remove.isPending;
  const items = list.data ?? [];

  return (
    <div className="space-y-4">

      {list.isLoading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" role="status" aria-label={t.loading}>
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : list.isError ? (
        <section className="rounded-2xl border border-red-200 bg-white p-5 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-red-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900" role="alert">{list.error.message || t.error}</p>
          <button type="button" className={cn(BTN.secondary, "mt-3")} onClick={() => void list.refetch()}>{t.retry}</button>
        </section>
      ) : items.length === 0 ? (
        <section className={cn(CARD, "px-5 py-10 text-center")}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600" aria-hidden="true">
            <Repeat className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold tracking-tight text-slate-900">{t.recurring.emptyTitle}</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">{t.recurring.emptyText}</p>
          {canChange && (
            <button type="button" className={cn(BTN.primary, "mt-5")} onClick={() => setForm({ mode: "create" })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {t.recurring.new}
            </button>
          )}
        </section>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((r) => {
            const name = r.customerName || t.noCustomer;
            const state = r.finished ? "finished" : r.active ? "active" : "paused";
            return (
              <li key={r.id} className="min-w-0">
                <article className={cn(CARD, "flex h-full flex-col p-4 sm:p-4", state === "paused" && "border-amber-200")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900">{name}</h3>
                      <p className="truncate text-xs text-slate-500">{r.items.map((i) => i.description).join(", ")}</p>
                    </div>
                    <p className="shrink-0 text-right text-lg font-bold tabular-nums tracking-tight text-slate-900">
                      {formatCurrency(r.total)}
                      <span className="block text-xs font-medium tracking-normal text-slate-500">{t.recurring.frequency[r.frequency]}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {state === "active" && <Chip icon={Repeat} label={t.recurring.state.active} className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" />}
                    {state === "paused" && <Chip icon={Pause} label={t.recurring.state.paused} className="bg-amber-50 text-amber-800 ring-1 ring-amber-200" />}
                    {state === "finished" && <Chip icon={CalendarX2} label={t.recurring.state.finished} className="bg-slate-100 text-slate-700" />}
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    {state !== "finished" && <span className="font-semibold text-slate-900">{t.recurring.next(formatDay(r.nextDate, locale))}</span>}
                    {state !== "finished" && " · "}
                    {r.endDate ? t.recurring.ends(formatDay(r.endDate, locale)) : t.recurring.noEnd}
                    {r.invoiced > 0 && ` · ${t.recurring.invoiced(r.invoiced)}`}
                  </p>
                  {state === "paused" && <p className="mt-1 text-xs text-amber-800">{t.recurring.resumeNote}</p>}
                  {canChange && (
                    <div className="mt-auto pt-3">
                    <div className="grid grid-cols-3 gap-1 border-t border-slate-100 pt-2 sm:flex sm:justify-end" role="group" aria-label={t.recurring.actionsAria(name)}>
                      {state === "active" && (
                        <button type="button" className={cn(BTN.ghost, "px-2")} disabled={busy} onClick={() => pause.mutate({ id: r.id })}>
                          <Pause className="h-4 w-4" aria-hidden="true" /> {t.recurring.pause}
                        </button>
                      )}
                      {state === "paused" && (
                        <button type="button" className={cn(BTN.ghost, "px-2 text-blue-700")} disabled={busy} onClick={() => resume.mutate({ id: r.id })}>
                          <Play className="h-4 w-4" aria-hidden="true" /> {t.recurring.resume}
                        </button>
                      )}
                      <button type="button" className={cn(BTN.ghost, "px-2", state === "finished" && "col-start-2")} onClick={() => setForm({ mode: "edit", item: r })}>
                        <Pencil className="h-4 w-4" aria-hidden="true" /> {t.recurring.edit}
                      </button>
                      <button type="button" className={cn(BTN.ghost, "px-2 hover:bg-red-50 hover:text-red-700")} disabled={busy} onClick={() => setToDelete(r)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> {t.recurring.delete}
                      </button>
                    </div>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
          <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
            <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{form?.mode === "edit" ? t.recurring.form.editTitle : t.recurring.form.createTitle}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">{t.recurring.form.intro}</DialogDescription>
          </DialogHeader>
          {form && (
            <RecurringForm
              key={form.mode === "edit" ? `edit-${form.item.id}` : "create"}
              initial={form.mode === "edit" ? form.item : null}
              services={services}
              customers={customers}
              t={t}
              locale={locale}
              onDone={() => setForm(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent className="bg-white sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">{t.recurring.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">{t.recurring.deleteText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10">{t.recurring.cancel}</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-red-600 text-white hover:bg-red-700 sm:h-10" onClick={() => { if (toDelete) remove.mutate({ id: toDelete.id }); }}>
              {t.recurring.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The next few invoice dates from `from`, keeping to `anchor` and stopping at the end date. */
function upcomingDates(from: string, frequency: Frequency, anchor: number, endDate: string | null, count: number): string[] {
  const out: string[] = [];
  let d = from;
  while (out.length < count && (endDate === null || d <= endDate)) {
    out.push(d);
    d = nextPeriodDate(d, frequency, anchor);
  }
  return out;
}

function RecurringForm({ initial, services, customers, t, locale, onDone }: {
  initial: RecurringInvoice | null;
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
  t: QuotesCopy;
  locale: string;
  onDone: () => void;
}) {
  const id = useId();
  const f = t.recurring.form;
  const refresh = useRefreshQuotes();
  const [today] = useState(() => localIsoDate(new Date()));
  const [customer, setCustomer] = useState<CustomerValue>(() => ({ id: initial?.customerId ?? null, name: initial?.customerName ?? "" }));
  const [lines, setLines] = useState<DraftLine[]>(() => (initial ? toDraftLines(initial.items) : [firstLine(services)]));
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "monthly");
  const [date, setDate] = useState(() => initial?.nextDate ?? localIsoDate(new Date()));
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const onError = (e: { message: string }) => setError(e.message || t.toasts.error);
  const create = trpc.quotes.recurring.create.useMutation({
    onSuccess: (r) => { toast.success(t.recurring.toasts.created(r.created)); refresh(r.created > 0); onDone(); },
    onError,
  });
  const update = trpc.quotes.recurring.update.useMutation({
    onSuccess: (r) => {
      toast.success(r.created > 0 ? `${t.recurring.toasts.updated}. ${t.toasts.ranDue(r.created)}` : t.recurring.toasts.updated);
      refresh(r.created > 0);
      onDone();
    },
    onError,
  });
  const pending = create.isPending || update.isPending;
  const totals = draftTotals(filledLines(lines), "");

  // Unchanged schedule: keeps its original anchor day; a new date or frequency anchors on the new date.
  const rescheduled = !initial || date !== initial.nextDate || frequency !== initial.frequency;
  const dateOk = isValidIsoDate(date);
  const end = endDate && isValidIsoDate(endDate) ? endDate : null;
  const anchor = dateOk ? anchorDayOf(rescheduled || !initial ? date : initial.startDate) : 1;
  const preview = dateOk ? upcomingDates(date, frequency, anchor, end, 3) : [];
  const longMonthAnchor = dateOk && anchor >= 29 && frequency !== "weekly";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLines(filledLines(lines), t.form);
    if ("error" in parsed) return setError(parsed.error);
    if (totals.totalCents <= 0) return setError(f.errors.total);
    if (!dateOk) return setError(f.errors.start);
    if (rescheduled && date < today) return setError(f.errors.pastStart);
    if (endDate && !isValidIsoDate(endDate)) return setError(t.form.errors.date);
    if (end && end < (rescheduled ? date : initial?.startDate ?? date)) return setError(f.errors.end);
    setError(null);
    const payload = {
      customerId: customer.id,
      customerName: customer.name.trim() || null,
      items: parsed.items,
      frequency,
      endDate: end,
      notes: notes.trim() || null,
    };
    if (initial) update.mutate({ id: initial.id, nextDate: date, ...payload });
    else create.mutate({ startDate: date, ...payload });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
        <CustomerField value={customer} onChange={setCustomer} customers={customers} t={t.form} />
        <LinesEditor lines={lines} onChange={(l) => { setLines(l); setError(null); }} services={services} t={t.lines} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-freq`} className={LABEL}>{f.frequency}</Label>
            <Select value={frequency} onValueChange={(v) => { setFrequency(v as Frequency); setError(null); }}>
              <SelectTrigger id={`${id}-freq`} className={cn(FIELD, "w-full data-[size=default]:h-11 sm:data-[size=default]:h-10")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((fr) => <SelectItem key={fr} value={fr}>{t.recurring.frequency[fr]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-date`} className={LABEL}>{initial ? f.nextDate : f.startDate}</Label>
            <Input
              id={`${id}-date`}
              type="date"
              value={date}
              min={rescheduled ? today : undefined}
              onChange={(e) => { setDate(e.target.value); setError(null); }}
              aria-describedby={initial ? `${id}-date-hint` : undefined}
              className={FIELD}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-end`} className={LABEL}>{f.endDate}</Label>
            <Input
              id={`${id}-end`}
              type="date"
              value={endDate}
              min={dateOk ? date : undefined}
              onChange={(e) => { setEndDate(e.target.value); setError(null); }}
              aria-describedby={`${id}-end-hint`}
              className={FIELD}
            />
          </div>
        </div>
        <div className="-mt-2 space-y-1 text-xs text-slate-500">
          {initial && <p id={`${id}-date-hint`}>{f.nextDateHint}</p>}
          <p id={`${id}-end-hint`}>{f.endHint}</p>
          {preview.length > 0 && (
            <p className="text-slate-700" aria-live="polite">{f.preview(preview.map((d) => formatDay(d, locale)).join(" · "))}</p>
          )}
          {longMonthAnchor && <p>{f.monthEnd}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-notes`} className={LABEL}>{f.notes}</Label>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            maxLength={1000}
            rows={2}
            placeholder={f.notesPlaceholder}
            onChange={(e) => setNotes(e.target.value)}
            className={cn(FIELD, "min-h-[4.5rem] py-2")}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-baseline justify-between text-lg font-bold tabular-nums text-slate-900">
          <span>{t.form.total}</span>
          <span aria-live="polite" className="tabular-nums">{money(totals.totalCents)} <span className="text-xs font-normal text-slate-500">· {t.recurring.frequency[frequency]}</span></span>
        </div>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone} className={BTN.ghost}>{f.cancel}</Button>
          <Button type="submit" disabled={pending} className={BTN.primary}>{pending ? f.saving : f.save}</Button>
        </div>
      </div>
    </form>
  );
}
