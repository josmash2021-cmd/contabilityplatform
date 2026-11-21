import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { bankDirection, categoriesFor } from "../../../api/lib/bankReview";
import { categoryLabel, dayLabel, errorText, signedMoney, type MoneyType, type Movement } from "./shared";

type Props = {
  movement: Movement;
  onClose: () => void;
  /** Called with what was saved, so the page can update the lists it shows. */
  onSaved?: (saved: { id: number; category: string; type: MoneyType }) => void;
  /**
   * Por revisar's "Más categorías…": only pick, nothing is saved here. The row keeps the choice until the
   * owner approves it (and may offer a rule).
   */
  onPick?: (picked: { category: string; type: MoneyType }) => void;
};

/** "Cambiar": which way the money went, and its category. Saving also marks the movement reviewed. */
export function CategoryDialog({ movement, onClose, onSaved, onPick }: Props) {
  const t = useCopy(movimientosCopy);
  const p = t.picker;
  const locale = intlLocale(useLang().lang);
  const uid = useId();
  const [type, setType] = useState<MoneyType>(movement.type);
  const [category, setCategory] = useState(movement.category);
  const [missing, setMissing] = useState(false);

  const save = trpc.review.setCategory.useMutation({
    onSuccess: (saved) => {
      toast.success(p.saved);
      onSaved?.(saved);
      onClose();
    },
    onError: (e) => toast.error(errorText(e, t.error)),
  });

  // The categories for this direction; the movement's own category stays available even if it isn't one of them.
  const offered = categoriesFor(type);
  const options = offered.includes(movement.category) || type !== movement.type ? offered : [movement.category, ...offered];
  const bank = bankDirection(movement.plaidAmount, movement.importedFrom);

  const pickType = (next: MoneyType) => {
    setType(next);
    // Keep the choice if it also fits the other direction; otherwise ask again.
    const nextOffered = categoriesFor(next);
    if (!nextOffered.includes(category) && !(next === movement.type && category === movement.category)) setCategory("");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!category) { setMissing(true); return; }
    if (onPick) { onPick({ category, type }); onClose(); return; }
    save.mutate({ id: movement.id, category, type });
  };

  const dirOption = (value: MoneyType, label: string, Icon: typeof ArrowDownLeft) => (
    <label className="relative block">
      <input type="radio" name={`${uid}-dir`} value={value} checked={type === value} onChange={() => pickType(value)} className="peer sr-only" />
      <span className={cn(
        "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border text-sm font-semibold transition peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500",
        type === value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      )}>
        <Icon className="h-4 w-4" aria-hidden />{label}
      </span>
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent className="flex max-h-[100dvh] flex-col gap-0 overflow-y-auto bg-white p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-slate-100 p-5 pr-12 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{p.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="mt-1 text-sm text-slate-600">
              <p className="line-clamp-2 break-words font-medium text-slate-900">{movement.description}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {dayLabel(movement.date, locale, true)} · <span className={cn("font-semibold tabular-nums", movement.type === "income" ? "text-emerald-700" : "text-slate-900")}>{signedMoney(movement.amount, movement.type)}</span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 p-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">{p.direction}</legend>
              <div className="grid grid-cols-2 gap-2">
                {dirOption("income", p.in, ArrowDownLeft)}
                {dirOption("expense", p.out, ArrowUpRight)}
              </div>
              {bank && bank !== type && (
                <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{p.bankSays[bank]}
                </p>
              )}
            </fieldset>

            <fieldset aria-describedby={missing && !category ? `${uid}-missing` : undefined}>
              <legend className="mb-2 text-sm font-medium text-slate-700">{p.categories}</legend>
              <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                {options.map((key) => {
                  const on = category === key;
                  const isCurrent = key === movement.category && type === movement.type;
                  return (
                    <label key={key} className="relative block">
                      <input type="radio" name={`${uid}-cat`} value={key} checked={on} onChange={() => { setCategory(key); setMissing(false); }} className="peer sr-only" />
                      <span className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500",
                        on ? "border-blue-600 bg-blue-50 font-semibold text-blue-800" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                      )}>
                        <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300")} aria-hidden>
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 leading-snug">{categoryLabel(key, t)}</span>
                        {isCurrent && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{p.current}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
              {missing && !category && <p id={`${uid}-missing`} className="mt-2 text-sm text-red-700" role="alert">{p.pick}</p>}
            </fieldset>
          </div>

          <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white p-4 sm:justify-end">
            <button type="button" onClick={onClose} disabled={save.isPending}
              className="h-11 flex-1 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 sm:h-10 sm:flex-none">
              {p.cancel}
            </button>
            <button type="submit" disabled={save.isPending} aria-busy={save.isPending}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:h-10 sm:flex-none">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{save.isPending ? p.saving : p.save}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
