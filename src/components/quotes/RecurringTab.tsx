import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CalendarX2, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { quotesCopy, type QuotesCopy } from "@/i18n/copy/quotes";
import { FREQUENCIES, anchorDayOf, isValidIsoDate, localIsoDate, nextPeriodDate, type Frequency } from "../../../api/lib/quotes";
import { Chip } from "./StatusChip";
import { CustomerField } from "./CustomerField";
import { ItemsEditor } from "./ItemsEditor";
import {
  blankLine, draftTotals, formatDay, money, parseLines, toDraftLines, useRefreshQuotes,
  type CustomerOption, type CustomerValue, type DraftLine, type RecurringInvoice, type ServiceOption,
} from "./shared";

type FormState = { mode: "create" } | { mode: "edit"; item: RecurringInvoice };

/** The "Recurrentes" tab: the list with pause / resume, and the form to create or edit one. */
export function RecurringTab({ services, customers }: { services: readonly ServiceOption[]; customers: readonly CustomerOption[] }) {
  const t = useCopy(quotesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefreshQuotes();
  const [form, setForm] = useState<FormState | null>(null);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl text-xs text-neutral-500">{t.recurring.intro}</p>
        <Button className="h-9 shrink-0 bg-black text-white hover:bg-neutral-800" onClick={() => setForm({ mode: "create" })}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t.recurring.new}
        </Button>
      </div>

      {list.isLoading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" role="status" aria-label={t.loading}>
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : list.isError ? (
        <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-neutral-600" role="alert">{list.error.message || t.error}</p>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>{t.retry}</Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-neutral-100" aria-hidden="true">
              <Repeat className="h-5 w-5 text-neutral-500" />
            </span>
            <h2 className="text-sm font-semibold text-black">{t.recurring.emptyTitle}</h2>
            <p className="max-w-sm text-xs text-neutral-500">{t.recurring.emptyText}</p>
            <Button className="mt-1 bg-black text-white hover:bg-neutral-800" onClick={() => setForm({ mode: "create" })}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t.recurring.new}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((r) => {
            const name = r.customerName || t.quotes.noCustomer;
            const state = r.finished ? "finished" : r.active ? "active" : "paused";
            return (
              <li key={r.id} className="min-w-0">
                <Card className="h-full gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium text-black">{name}</h3>
                        <p className="truncate text-[11px] text-neutral-500">{r.items.map((i) => i.description).join(", ")}</p>
                      </div>
                      <p className="shrink-0 text-right text-base font-semibold text-black">
                        {formatCurrency(r.total)}
                        <span className="block text-[11px] font-normal text-neutral-500">{t.recurring.frequency[r.frequency]}</span>
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {state === "active" && <Chip icon={Repeat} label={t.recurring.state.active} className="bg-emerald-50 text-emerald-700" />}
                      {state === "paused" && <Chip icon={Pause} label={t.recurring.state.paused} className="bg-amber-50 text-amber-800" />}
                      {state === "finished" && <Chip icon={CalendarX2} label={t.recurring.state.finished} className="bg-neutral-100 text-neutral-700" />}
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      {state !== "finished" && `${t.recurring.next(formatDay(r.nextDate, locale))} · `}
                      {r.endDate ? t.recurring.ends(formatDay(r.endDate, locale)) : t.recurring.noEnd}
                      {r.invoiced > 0 && ` · ${t.recurring.invoiced(r.invoiced)}`}
                    </p>
                    {state === "paused" && <p className="mt-1 text-[11px] text-amber-800">{t.recurring.resumeNote}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-neutral-100 pt-2" role="group" aria-label={t.recurring.actionsAria(name)}>
                      {state === "active" && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-neutral-600 hover:text-black" disabled={busy} onClick={() => pause.mutate({ id: r.id })}>
                          <Pause className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t.recurring.pause}
                        </Button>
                      )}
                      {state === "paused" && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-neutral-600 hover:text-black" disabled={busy} onClick={() => resume.mutate({ id: r.id })}>
                          <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t.recurring.resume}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-neutral-600 hover:text-black" onClick={() => setForm({ mode: "edit", item: r })}>
                        <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t.recurring.edit}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-neutral-500 hover:text-red-600" disabled={busy} onClick={() => setToDelete(r)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t.recurring.delete}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh] sm:max-w-2xl">
          <DialogHeader className="border-b border-neutral-100 px-4 py-3 pr-12 text-left sm:px-6">
            <DialogTitle className="text-base">{form?.mode === "edit" ? t.recurring.form.editTitle : t.recurring.form.createTitle}</DialogTitle>
            <DialogDescription className="text-xs">{t.recurring.form.intro}</DialogDescription>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.recurring.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.recurring.deleteText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.recurring.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => { if (toDelete) remove.mutate({ id: toDelete.id }); }}>
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
  const [lines, setLines] = useState<DraftLine[]>(() => (initial ? toDraftLines(initial.items) : [blankLine()]));
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
  const totals = draftTotals(lines, "");

  // Unchanged schedule: keeps its original anchor day; a new date or frequency anchors on the new date.
  const rescheduled = !initial || date !== initial.nextDate || frequency !== initial.frequency;
  const dateOk = isValidIsoDate(date);
  const end = endDate && isValidIsoDate(endDate) ? endDate : null;
  const anchor = dateOk ? anchorDayOf(rescheduled || !initial ? date : initial.startDate) : 1;
  const preview = dateOk ? upcomingDates(date, frequency, anchor, end, 3) : [];
  const longMonthAnchor = dateOk && anchor >= 29 && frequency !== "weekly";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLines(lines, t.form);
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
        <ItemsEditor lines={lines} onChange={(l) => { setLines(l); setError(null); }} services={services} t={t.form} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-freq`} className="text-xs text-neutral-600">{f.frequency}</Label>
            <Select value={frequency} onValueChange={(v) => { setFrequency(v as Frequency); setError(null); }}>
              <SelectTrigger id={`${id}-freq`} className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((fr) => <SelectItem key={fr} value={fr}>{t.recurring.frequency[fr]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-date`} className="text-xs text-neutral-600">{initial ? f.nextDate : f.startDate}</Label>
            <Input
              id={`${id}-date`}
              type="date"
              value={date}
              min={rescheduled ? today : undefined}
              onChange={(e) => { setDate(e.target.value); setError(null); }}
              aria-describedby={initial ? `${id}-date-hint` : undefined}
              className="h-10 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-end`} className="text-xs text-neutral-600">{f.endDate}</Label>
            <Input
              id={`${id}-end`}
              type="date"
              value={endDate}
              min={dateOk ? date : undefined}
              onChange={(e) => { setEndDate(e.target.value); setError(null); }}
              aria-describedby={`${id}-end-hint`}
              className="h-10 text-sm"
            />
          </div>
        </div>
        <div className="-mt-2 space-y-1 text-[11px] text-neutral-500">
          {initial && <p id={`${id}-date-hint`}>{f.nextDateHint}</p>}
          <p id={`${id}-end-hint`}>{f.endHint}</p>
          {preview.length > 0 && (
            <p className="text-neutral-700" aria-live="polite">{f.preview(preview.map((d) => formatDay(d, locale)).join(" · "))}</p>
          )}
          {longMonthAnchor && <p>{f.monthEnd}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-notes`} className="text-xs text-neutral-600">{f.notes}</Label>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            maxLength={1000}
            rows={2}
            placeholder={f.notesPlaceholder}
            onChange={(e) => setNotes(e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-neutral-100 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-baseline justify-between text-base font-semibold text-black">
          <span>{t.form.total}</span>
          <span aria-live="polite">{money(totals.totalCents)} <span className="text-xs font-normal text-neutral-500">· {t.recurring.frequency[frequency]}</span></span>
        </div>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone} className="text-neutral-600">{f.cancel}</Button>
          <Button type="submit" disabled={pending} className="bg-black text-white hover:bg-neutral-800">{pending ? f.saving : f.save}</Button>
        </div>
      </div>
    </form>
  );
}
