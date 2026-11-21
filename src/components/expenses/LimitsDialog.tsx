// "Límites del mes" → Cambiar: a monthly cap per category (empty = no limit).
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { expensesCopy, spendCategoryLabel } from "@/i18n/copy/expenses";
import { SPEND_CATEGORIES, type SpendCategory } from "../../../api/lib/expenses";
import { parseAmount } from "../../../api/lib/receipts";
import { FIELD, btn, fmt0 } from "./ui";
import { amountText, serverText, type Overview } from "./shared";

type Props = { overview: Overview; onClose: () => void };

export function LimitsDialog({ overview, onClose }: Props) {
  const t = useCopy(expensesCopy);
  const f = t.limitsForm;
  const uid = useId();
  const utils = trpc.useUtils();
  const setLimit = trpc.expenses.setLimit.useMutation();
  const spent = new Map(overview.byCategory.map((c) => [c.category, c.total]));
  const had = new Map(overview.limits.map((l) => [l.category, l.limit]));
  // The categories with a limit or with spending this month; more can be added.
  const [shown, setShown] = useState<SpendCategory[]>(() => {
    const list = [...new Set<SpendCategory>([...overview.limits.map((l) => l.category), ...overview.byCategory.map((c) => c.category)])];
    return list.length ? list : ["supplies"];
  });
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(overview.limits.map((l) => [l.category, amountText(l.limit)])));
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const rest = SPEND_CATEGORIES.filter((c) => !shown.includes(c));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const wrong = new Set<string>();
    const changes: Array<{ category: SpendCategory; amount: number | null }> = [];
    for (const c of shown) {
      const raw = (values[c] ?? "").trim();
      const amount = raw ? parseAmount(raw) : null;
      if (raw && amount === null) { wrong.add(c); continue; }
      if ((had.get(c) ?? null) !== amount) changes.push({ category: c, amount });
    }
    setBad(wrong);
    if (wrong.size) {
      document.getElementById(`${uid}-${[...wrong][0]}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      for (const ch of changes) await setLimit.mutateAsync(ch);
      toast.success(f.saved);
      await utils.expenses.overview.invalidate();
      onClose();
    } catch (err) {
      toast.error(serverText(t, err as { message?: string }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[100dvh] content-start gap-0 overflow-y-auto bg-white p-0 sm:max-w-[440px] sm:rounded-2xl">
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left sm:px-5">
          <DialogTitle className="text-[17px] font-bold text-slate-900">{f.title}</DialogTitle>
          <DialogDescription className="text-[13px] text-slate-500">{f.text}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-3 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          {shown.map((c) => {
            const label = spendCategoryLabel(t, c);
            const err = bad.has(c);
            return (
              <div key={c} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3">
                <label htmlFor={`${uid}-${c}`} className="min-w-0 text-sm">
                  <span className="block font-semibold text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-500">{f.spent(fmt0(spent.get(c) ?? 0))}</span>
                </label>
                <span className="relative block">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-slate-500" aria-hidden="true">$</span>
                  <input
                    id={`${uid}-${c}`} inputMode="decimal" autoComplete="off" placeholder="—" value={values[c] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
                    aria-label={f.amount(label)} aria-invalid={err || undefined} aria-describedby={err ? `${uid}-err` : undefined}
                    className={cn(FIELD, "pl-6 text-right tabular-nums", err && "border-red-400")}
                  />
                </span>
              </div>
            );
          })}
          {bad.size > 0 && <p id={`${uid}-err`} className="text-xs text-red-700">{f.bad}</p>}
          {rest.length > 0 && (
            <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
              <Plus className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <span className="sr-only">{f.more}</span>
              <select
                value="" onChange={(e) => { const v = e.target.value as SpendCategory; if (v) setShown((s) => [...s, v]); }}
                className={cn(FIELD, "w-auto flex-1")}
              >
                <option value="">{f.more}…</option>
                {rest.map((c) => <option key={c} value={c}>{spendCategoryLabel(t, c)}</option>)}
              </select>
            </label>
          )}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" className={btn()} onClick={onClose} disabled={saving}>{f.cancel}</button>
            <button type="submit" className={btn("primary")} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? f.saving : f.save}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
