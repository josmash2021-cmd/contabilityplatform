import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { personalCopy } from "@/i18n/copy/personal";
import { budgetCategoryLabel } from "@/i18n/copy/budgets";
import { personalPagesCopy } from "@/i18n/copy/personalPages";
import { ConfirmDialog } from "./ConfirmDialog";
import { MANUAL_CATEGORIES, PAYMENT_METHODS, dayKey, num, ui, type ManualTx, type PaymentMethod } from "./personalUtils";

type Kind = "income" | "expense";

/**
 * Add, change or delete a movement the person enters by hand (cash and anything the bank doesn't see):
 * personal.createTransaction / updateTransaction / deleteTransaction.
 * Mount it only while it's open, so each opening starts from `editing` or `defaultDate`.
 */
export function ManualTxDialog({ editing, defaultDate, onClose }: { editing: ManualTx | null; defaultDate: string; onClose: () => void }) {
  const all = useCopy(personalPagesCopy);
  const t = all.manual;
  const shared = all.shared;
  const { categories } = useCopy(personalCopy);
  const uid = useId();
  const utils = trpc.useUtils();

  const [kind, setKind] = useState<Kind>(editing?.type ?? "expense");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(() => (editing ? String(num(editing.amount)) : ""));
  const [date, setDate] = useState(() => (editing ? dayKey(editing.transactionDate) : defaultDate));
  const [category, setCategory] = useState(editing?.category ?? MANUAL_CATEGORIES.expense[0]);
  const [method, setMethod] = useState<PaymentMethod>(editing?.paymentMethod ?? "cash");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [errors, setErrors] = useState<Partial<Record<"description" | "amount" | "date", string>>>({});
  const [confirming, setConfirming] = useState(false);

  const refresh = () => utils.personal.listTransactions.invalidate();
  const create = trpc.personal.createTransaction.useMutation({
    onSuccess: () => { toast.success(t.created); void refresh(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.personal.updateTransaction.useMutation({
    onSuccess: () => { toast.success(t.updated); void refresh(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.personal.deleteTransaction.useMutation({
    onSuccess: () => { toast.success(t.deleted); setConfirming(false); void refresh(); onClose(); },
    onError: (e) => { setConfirming(false); toast.error(e.message); },
  });
  const busy = create.isPending || update.isPending || remove.isPending;

  const labels = kind === "income" ? categories.income : categories.expense;
  const options: string[] = [...MANUAL_CATEGORIES[kind]];
  if (!options.includes(category)) options.push(category);

  const pickKind = (k: Kind) => {
    setKind(k);
    if (!(MANUAL_CATEGORIES[k] as readonly string[]).includes(category)) setCategory(MANUAL_CATEGORIES[k][0]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount.replace(/[$,\s]/g, ""));
    const next: typeof errors = {};
    if (!description.trim()) next.description = t.needDescription;
    if (!Number.isFinite(n) || n < 0.01 || n > 99_999_999) next.amount = t.invalidAmount;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = t.needDate;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body = {
      description: description.trim(), amount: Math.round(n * 100) / 100, type: kind, category,
      paymentMethod: method, transactionDate: date, notes: notes.trim(),
    };
    if (editing) update.mutate({ id: editing.id, ...body });
    else create.mutate({ ...body, notes: body.notes || undefined });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent showCloseButton={false} className="grid-cols-1 content-start gap-0 overflow-y-auto bg-white p-0 sm:max-h-[calc(100dvh-4rem)] sm:max-w-lg sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{editing ? t.editTitle : t.newTitle}</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-slate-500">{t.hint}</DialogDescription>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={shared.close}
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit} noValidate className="space-y-4 px-4 py-5 sm:px-6">
          <fieldset>
            <legend className={ui.label}>{t.kind}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((k) => (
                <button key={k} type="button" onClick={() => pickKind(k)} aria-pressed={kind === k}
                  className={cn(
                    "h-11 rounded-[10px] border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    kind === k
                      ? k === "income" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}>
                  {k === "income" ? `+ ${t.in}` : `− ${t.out}`}
                </button>
              ))}
            </div>
          </fieldset>

          <Field id={`${uid}-d`} label={t.description} error={errors.description}>
            <input id={`${uid}-d`} value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} placeholder={t.descriptionPh}
              aria-invalid={errors.description ? true : undefined} aria-describedby={errors.description ? `${uid}-d-err` : undefined} className={ui.control} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id={`${uid}-a`} label={t.amount} error={errors.amount}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
                <input id={`${uid}-a`} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={errors.amount ? true : undefined} aria-describedby={errors.amount ? `${uid}-a-err` : undefined} className={cn(ui.control, "pl-7 tabular-nums")} />
              </div>
            </Field>
            <Field id={`${uid}-t`} label={t.date} error={errors.date}>
              <input id={`${uid}-t`} type="date" value={date} onChange={(e) => setDate(e.target.value)}
                aria-invalid={errors.date ? true : undefined} aria-describedby={errors.date ? `${uid}-t-err` : undefined} className={ui.control} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${uid}-c`} label={t.category}>
              <select id={`${uid}-c`} value={category} onChange={(e) => setCategory(e.target.value)} className={ui.control}>
                {options.map((k) => <option key={k} value={k}>{budgetCategoryLabel(k, labels)}</option>)}
              </select>
            </Field>
            <Field id={`${uid}-m`} label={kind === "income" ? t.methodIn : t.methodOut}>
              <select id={`${uid}-m`} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={ui.control}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}
              </select>
            </Field>
          </div>

          <Field id={`${uid}-n`} label={t.notes} hint={t.optional}>
            <textarea id={`${uid}-n`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:text-sm" />
          </Field>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className={ui.secondary}>{shared.cancel}</button>
            <button type="submit" disabled={busy} className={ui.primary}>
              {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {create.isPending || update.isPending ? t.saving : editing ? t.save : t.add}
            </button>
          </div>
        </form>

        {editing && (
          <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
            <button type="button" onClick={() => setConfirming(true)} disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 sm:h-10">
              <Trash2 className="h-4 w-4" aria-hidden="true" />{t.delete}
            </button>
          </div>
        )}
      </DialogContent>

      {editing && (
        <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={t.confirmTitle} text={t.confirmText(editing.description)}
          confirmLabel={t.confirm} cancelLabel={shared.cancel} busy={remove.isPending}
          onConfirm={() => remove.mutate({ id: editing.id })} />
      )}
    </Dialog>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={ui.label}>{label}{hint && <span className="ml-1 font-normal text-slate-500">{hint}</span>}</label>
      {children}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
