import { useId, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BudgetsCopy } from "@/i18n/copy/budgets";
import { CategoryIcon } from "./CategoryIcon";
import { ProgressBar } from "./ProgressBar";
import { amountInput, moneyAuto, ui } from "./personalUtils";

export type BudgetStatus = "ok" | "near" | "over";
export type BudgetRowView = { category: string; limit: number | null; spent: number; percent: number | null; status: BudgetStatus | null; remaining: number | null };

/** Same ceiling as the server (api/lib/budgets.ts MAX_BUDGET_LIMIT). */
const MAX_LIMIT = 10_000_000;

const STATUS: Record<BudgetStatus, { badge: string; border: string; bar: "good" | "warn" | "bad"; icon: LucideIcon }> = {
  ok: { badge: "bg-emerald-50 text-emerald-700", border: "border-slate-200", bar: "good", icon: CheckCircle2 },
  near: { badge: "bg-amber-50 text-amber-800", border: "border-amber-300", bar: "warn", icon: AlertTriangle },
  over: { badge: "bg-red-50 text-red-700", border: "border-red-300", bar: "bad", icon: XCircle },
};

/** One budget: how much is left in words, a bar coloured by status (with the status in words), change or remove. */
export function BudgetCard({ item, label, t, editing, pending, onEdit, onCancel, onSave }: {
  item: BudgetRowView;
  label: string;
  t: BudgetsCopy;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (limit: number | null) => void;
}) {
  const status: BudgetStatus = item.status ?? "ok";
  const style = STATUS[status];
  const StatusIcon = style.icon;
  const percent = item.percent ?? 0;
  const remaining = item.remaining ?? 0;
  const limit = item.limit ?? 0;

  return (
    <article className={cn("flex h-full flex-col rounded-2xl border bg-white p-4 sm:p-5", style.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CategoryIcon category={item.category} type="expense" />
          <h3 className="truncate font-semibold text-slate-900">{label}</h3>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", style.badge)}>
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />{t.status[status]}
        </span>
      </div>

      <p className={cn("mt-4 text-base font-semibold tabular-nums", status === "over" ? "text-red-700" : "text-slate-900")}>
        {remaining < 0 ? t.overOf(moneyAuto(-remaining), moneyAuto(limit)) : t.leftOf(moneyAuto(remaining), moneyAuto(limit))}
      </p>
      <ProgressBar percent={percent} label={t.percentUsed(label, percent)} tone={style.bar} className="mt-2" />
      <p className="mt-1.5 text-xs tabular-nums text-slate-500">{t.spentPct(moneyAuto(item.spent), percent)}</p>

      {editing ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <LimitEditor label={label} initial={amountInput(item.limit)} t={t} pending={pending} onSave={onSave} onCancel={onCancel} />
        </div>
      ) : (
        <div className="mt-auto pt-4">
         <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
          <button type="button" onClick={onEdit} aria-label={t.editAria(label)}
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9">
            <Pencil className="h-4 w-4" aria-hidden="true" />{t.edit}
          </button>
          <button type="button" onClick={() => onSave(null)} disabled={pending} aria-label={t.removeAria(label)}
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 sm:h-9">
            <Trash2 className="h-4 w-4" aria-hidden="true" />{t.remove}
          </button>
         </div>
        </div>
      )}
    </article>
  );
}

/** The monthly limit input: Enter saves, Escape cancels. */
export function LimitEditor({ label, initial, t, pending, onSave, onCancel }: {
  label: string;
  initial: string;
  t: BudgetsCopy;
  pending: boolean;
  onSave: (limit: number) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0.01) return setError(t.form.invalid);
    if (n > MAX_LIMIT) return setError(t.form.tooBig);
    onSave(Math.round(n * 100) / 100);
  };

  return (
    <form onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{t.form.label(label)}</label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[8rem] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={value}
            placeholder={t.form.placeholder}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            autoFocus
            className={cn(ui.control, "pl-7 tabular-nums")}
          />
        </div>
        <button type="submit" disabled={pending} className={ui.primary}>{t.form.save}</button>
        <button type="button" onClick={onCancel} className={ui.secondary}>{t.form.cancel}</button>
      </div>
      {error && <p id={errorId} role="alert" className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
