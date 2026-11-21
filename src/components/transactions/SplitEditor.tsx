import { useId, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { categoriesFor } from "../../../api/lib/bankReview";
import { PERSONAL_CATEGORY, SPLIT_MAX_PARTS, businessCategoryFor } from "../../../api/lib/reviewEngine";
import { categoryLabel, money, type MoneyType } from "./shared";

type Line = { category: string; amount: string };

const cents = (s: string) => {
  const n = Number.parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/**
 * "Dividir": spreads one movement across categories (the prototype's .split-ed). The personal part goes to the
 * personal category, which doesn't count as a business expense. Saving needs the parts to add up exactly.
 */
export function SplitEditor({ amount, type, category, saving, onSave }: {
  amount: number;
  type: MoneyType;
  category: string;
  saving: boolean;
  onSave: (parts: Array<{ category: string; amount: number }>) => void;
}) {
  const t = useCopy(movimientosCopy);
  const r = t.rv;
  const uid = useId();
  const options = categoriesFor(type);
  const first = options.includes(businessCategoryFor(category)) && category !== PERSONAL_CATEGORY ? businessCategoryFor(category) : type === "expense" ? "business_expense" : options[0];
  const [lines, setLines] = useState<Line[]>(() => [
    { category: first, amount: amount.toFixed(2) },
    { category: type === "expense" ? PERSONAL_CATEGORY : "other", amount: "0.00" },
  ]);
  const total = Math.round(amount * 100);
  const sum = lines.reduce((a, l) => a + cents(l.amount), 0);
  const diff = total - sum;
  const emptyPart = lines.some((l) => cents(l.amount) <= 0);
  const valid = diff === 0 && lines.length >= 2 && !emptyPart;

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const label = (key: string) => (key === PERSONAL_CATEGORY ? r.splitPersonal : categoryLabel(key, t));
  const control = "min-h-[38px] min-w-0 rounded-[9px] border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

  return (
    <div className="mt-2.5 grid gap-2 rounded-xl bg-slate-100 p-3">
      <p className="text-xs text-slate-500">{r.splitLead(money(amount))}</p>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2">
          <select id={`${uid}-c${i}`} value={l.category} onChange={(e) => set(i, { category: e.target.value })} aria-label={r.splitCat(i + 1)} className={control}>
            {options.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
          <input inputMode="decimal" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label={r.splitAmt(i + 1)}
            className={cn(control, "text-right tabular-nums")} />
          {lines.length > 2 ? (
            <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label={r.splitRemove(i + 1)}
              className="grid h-[38px] w-9 place-items-center rounded-[9px] text-slate-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : <span className="w-0" />}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold">
        <span className={valid ? "text-emerald-600" : "text-amber-700"} aria-live="polite">
          {diff > 0 ? r.splitMissing(money(diff / 100)) : diff < 0 ? r.splitOver(money(-diff / 100)) : emptyPart ? r.splitEmpty : r.splitOk(money(amount))}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {lines.length < SPLIT_MAX_PARTS && (
            <button type="button" onClick={() => setLines((ls) => [...ls, { category: first, amount: diff > 0 ? (diff / 100).toFixed(2) : "0.00" }])}
              className="inline-flex min-h-9 items-center rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {r.splitAdd}
            </button>
          )}
          <button type="button" disabled={!valid || saving} onClick={() => onSave(lines.map((l) => ({ category: l.category, amount: cents(l.amount) / 100 })))}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}{r.splitSave}
          </button>
        </span>
      </div>
    </div>
  );
}
