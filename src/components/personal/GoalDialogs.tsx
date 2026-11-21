import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { personalPagesCopy } from "@/i18n/copy/personalPages";
import { ui } from "./personalUtils";

/** Parses "$1,250.50" / "1250.5"; null when it isn't an amount above $0. */
const parseAmount = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0.01 && n <= 9_999_999_999 ? Math.round(n * 100) / 100 : null;
};

function Shell({ title, hint, busy, onClose, children }: { title: string; hint: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const { shared } = useCopy(personalPagesCopy);
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent showCloseButton={false} className="grid-cols-1 content-start gap-0 overflow-y-auto bg-white p-0 sm:max-h-[calc(100dvh-4rem)] sm:max-w-md sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-slate-500">{hint}</DialogDescription>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={shared.close}
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Actions({ busy, label, busyLabel, onClose }: { busy: boolean; label: string; busyLabel: string; onClose: () => void }) {
  const { shared } = useCopy(personalPagesCopy);
  return (
    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} disabled={busy} className={ui.secondary}>{shared.cancel}</button>
      <button type="submit" disabled={busy} className={ui.primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{busy ? busyLabel : label}</button>
    </div>
  );
}

const errorText = (id: string, text?: string) => (text ? <p id={id} role="alert" className="mt-1 text-xs text-red-700">{text}</p> : null);

/** New saving goal: name, how much, and an optional date (personal.createGoal). */
export function NewGoalDialog({ busy, onClose, onCreate }: {
  busy: boolean;
  onClose: () => void;
  onCreate: (goal: { name: string; targetAmount: number; deadline?: string }) => void;
}) {
  const t = useCopy(personalPagesCopy).goals.form;
  const uid = useId();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [errors, setErrors] = useState<{ name?: string; target?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(target);
    const next = { name: name.trim() ? undefined : t.needName, target: amount === null ? t.invalidAmount : undefined };
    setErrors(next);
    if (next.name || next.target || amount === null) return;
    onCreate({ name: name.trim(), targetAmount: amount, deadline: deadline || undefined });
  };

  return (
    <Shell title={t.title} hint={t.hint} busy={busy} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4 px-4 py-5 sm:px-6">
        <div>
          <label htmlFor={`${uid}-n`} className={ui.label}>{t.name}</label>
          <input id={`${uid}-n`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} autoFocus
            aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? `${uid}-n-e` : undefined} className={ui.control} />
          {errorText(`${uid}-n-e`, errors.name)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-a`} className={ui.label}>{t.target}</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
              <input id={`${uid}-a`} type="number" inputMode="decimal" min="0.01" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)}
                aria-invalid={errors.target ? true : undefined} aria-describedby={errors.target ? `${uid}-a-e` : undefined} className={cn(ui.control, "pl-7 tabular-nums")} />
            </div>
            {errorText(`${uid}-a-e`, errors.target)}
          </div>
          <div>
            <label htmlFor={`${uid}-d`} className={ui.label}>{t.deadline} <span className="font-normal text-slate-500">{t.optional}</span></label>
            <input id={`${uid}-d`} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={ui.control} />
          </div>
        </div>
        <Actions busy={busy} label={t.create} busyLabel={t.creating} onClose={onClose} />
      </form>
    </Shell>
  );
}

/** Adds money to a goal: the new total goes to personal.updateGoal as currentAmount. */
export function AddMoneyDialog({ name, saved, target, busy, onClose, onAdd }: {
  name: string;
  saved: string;
  target: string;
  busy: boolean;
  onClose: () => void;
  onAdd: (amount: number) => void;
}) {
  const t = useCopy(personalPagesCopy).goals;
  const uid = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(value);
    if (amount === null) return setError(t.form.invalidAmount);
    onAdd(amount);
  };

  return (
    <Shell title={t.addTitle(name)} hint={t.addHint(saved, target)} busy={busy} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4 px-4 py-5 sm:px-6">
        <div>
          <label htmlFor={`${uid}-a`} className={ui.label}>{t.amount}</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
            <input id={`${uid}-a`} type="number" inputMode="decimal" min="0.01" step="0.01" value={value} autoFocus
              onChange={(e) => { setValue(e.target.value); setError(undefined); }}
              aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-a-e` : undefined} className={cn(ui.control, "pl-7 tabular-nums")} />
          </div>
          {errorText(`${uid}-a-e`, error)}
        </div>
        <Actions busy={busy} label={t.add} busyLabel={t.adding} onClose={onClose} />
      </form>
    </Shell>
  );
}
