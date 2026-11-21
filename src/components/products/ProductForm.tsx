import { useState, type FormEvent } from "react";
import { Loader2, Package, Trash2, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { marginPct, toCents } from "../../../api/lib/ventas";
import { PosSheet } from "@/components/pos/PosSheet";
import { FIELD, LABEL, SEG, btn, segBtn } from "@/components/pos/ui";
import { moneyC } from "@/components/pos/posTypes";

export type ProductFormValues = {
  name: string;
  description: string;
  price: string;
  cost: string;
  kind: "service" | "product";
  /** Units on hand ("" = don't keep count). Only for products. */
  stock: string;
  isActive: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ProductFormValues;
  editing: boolean;
  pending: boolean;
  onSubmit: (v: ProductFormValues) => void;
  /** Editing, owner: the delete button. */
  onDelete?: () => void;
  t: CobrarCopy["services"];
  closeLabel: string;
};

const MONEY_RE = /^(\d+\.?\d{0,2}|\.\d{1,2})$/;
const STOCK_RE = /^-?\d{1,7}$/;
/** Same cleanup as before: only digits and a dot. */
const clean = (v: string) => v.replace(/[^0-9.]/g, "");

/** Add or edit one item of the catalog: service or product, price, cost (→ margin), stock. Remount it (key) each time it opens. */
export function ProductForm({ open, onOpenChange, initial, editing, pending, onSubmit, onDelete, t, closeLabel }: Props) {
  const [form, setForm] = useState<ProductFormValues>(initial);
  const [tried, setTried] = useState(false);
  const f = t.form;
  const isProduct = form.kind === "product";
  const priceBad = !MONEY_RE.test(form.price);
  const costBad = form.cost !== "" && !MONEY_RE.test(form.cost);
  const stockBad = isProduct && form.stock.trim() !== "" && !STOCK_RE.test(form.stock.trim());
  const priceC = priceBad ? 0 : toCents(form.price);
  const costC = costBad ? 0 : toCents(form.cost);
  const margin = form.cost !== "" && !costBad ? marginPct(priceC, costC) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!form.name.trim() || priceBad || costBad || stockBad) return;
    onSubmit(form);
  };
  const set = <K extends keyof ProductFormValues>(k: K, v: ProductFormValues[K]) => setForm((x) => ({ ...x, [k]: v }));
  const bad = "border-red-300 focus-visible:ring-red-500";

  return (
    <PosSheet
      open={open} onOpenChange={onOpenChange} closeLabel={closeLabel}
      title={editing ? f.editTitle(isProduct) : f.newTitle(isProduct)}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {onDelete && (
            <button type="button" onClick={onDelete} className={cn(btn(), "mr-auto text-red-600 hover:text-red-700")}><Trash2 className="h-4 w-4" aria-hidden />{f.delete}</button>
          )}
          <button type="button" onClick={() => onOpenChange(false)} className={cn(btn(), !onDelete && "flex-1 sm:flex-none")}>{f.cancel}</button>
          <button type="submit" form="product-form" disabled={pending} className={cn(btn("primary"), "flex-1 sm:flex-none")}>
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{f.saving}</> : editing ? f.update : f.create}
          </button>
        </div>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate className="grid gap-3.5">
        <fieldset>
          <legend className="mb-1 text-[13px] font-semibold text-slate-900">{f.kind}</legend>
          <div role="radiogroup" className={cn(SEG, "w-full grid-cols-2")}>
            {(["service", "product"] as const).map((k) => {
              const Icon = k === "product" ? Package : Wrench;
              return (
                <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => set("kind", k)} className={cn(segBtn(form.kind === k), "inline-flex items-center justify-center gap-2 text-sm")}>
                  <Icon className="h-4 w-4" aria-hidden />{k === "product" ? f.product : f.service}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className={LABEL}>
          <span>{f.name(isProduct)} <small className="font-normal text-slate-500">({f.required})</small></span>
          <input
            required value={form.name} placeholder={f.namePh(isProduct)} maxLength={255} autoComplete="off" aria-invalid={tried && !form.name.trim()}
            onChange={(e) => set("name", e.target.value)} className={cn(FIELD, tried && !form.name.trim() && bad)}
          />
        </label>

        <label className={LABEL}>
          <span>{f.description} <small className="font-normal text-slate-500">({f.optional})</small></span>
          <input value={form.description} placeholder={f.descriptionPh(isProduct)} autoComplete="off" onChange={(e) => set("description", e.target.value)} className={FIELD} />
        </label>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <MoneyField label={f.price} note={f.required} hint={f.priceHint} value={form.price} onChange={(v) => set("price", v)} error={tried && priceBad ? f.badPrice : undefined} />
          <MoneyField label={f.cost} note={f.optional} hint={f.costHint} value={form.cost} onChange={(v) => set("cost", v)} error={tried && costBad ? f.badCost : undefined} />
        </div>
        {margin !== null && (
          <p className={cn("-mt-1.5 text-[13px] font-semibold tabular-nums", margin >= 0 ? "text-emerald-600" : "text-red-600")} aria-live="polite">
            {f.margin(`${margin < 0 ? "−" : ""}${Math.abs(margin)}%`, moneyC(priceC - costC))}
          </p>
        )}

        {isProduct && (
          <label className={LABEL}>
            <span>{f.stock} <small className="font-normal text-slate-500">({f.optional})</small></span>
            <input
              inputMode="numeric" autoComplete="off" value={form.stock} placeholder={f.stockPh} aria-invalid={tried && stockBad}
              onChange={(e) => set("stock", e.target.value.replace(/[^0-9-]/g, ""))} className={cn(FIELD, "max-w-[160px] tabular-nums", tried && stockBad && bad)}
            />
            <small className={cn("text-xs font-normal", tried && stockBad ? "text-red-700" : "text-slate-500")}>{tried && stockBad ? f.badStock : f.stockHint}</small>
          </label>
        )}

        {editing && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-100 p-3">
            <div>
              <label htmlFor="product-active" className="block text-sm font-semibold text-slate-900">{f.active}</label>
              <p className="text-xs text-slate-500">{f.activeHint}</p>
            </div>
            <Switch id="product-active" checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} className="data-[state=checked]:bg-blue-600" />
          </div>
        )}
      </form>
    </PosSheet>
  );
}

function MoneyField({ label, note, hint, value, onChange, error }: { label: string; note: string; hint: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <label className={LABEL}>
      <span>{label} <small className="font-normal text-slate-500">({note})</small></span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500" aria-hidden>$</span>
        <input
          type="text" inputMode="decimal" placeholder="0.00" value={value} autoComplete="off" aria-invalid={!!error}
          onChange={(e) => onChange(clean(e.target.value))}
          className={cn(FIELD, "pl-6 tabular-nums", error && "border-red-300 focus-visible:ring-red-500")}
        />
      </span>
      <small className={cn("text-xs font-normal", error ? "text-red-700" : "text-slate-500")}>{error ?? hint}</small>
    </label>
  );
}
