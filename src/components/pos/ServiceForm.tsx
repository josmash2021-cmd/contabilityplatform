import { useState, type FormEvent } from "react";
import { Loader2, Package, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { PosSheet } from "./PosSheet";

export type ServiceFormValues = {
  name: string;
  description: string;
  price: string;
  cost: string;
  /** Only changes the labels (the server has no type column). */
  type: "service" | "product";
  isActive: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ServiceFormValues;
  editing: boolean;
  pending: boolean;
  onSubmit: (v: ServiceFormValues) => void;
  t: CobrarCopy["services"];
  closeLabel: string;
};

const MONEY_RE = /^(\d+\.?\d{0,2}|\.\d{1,2})$/;
/** Same cleanup as before: only digits and a dot. */
const clean = (v: string) => v.replace(/[^0-9.]/g, "");

/** Create or edit one service. Remount it (key) each time it opens. */
export function ServiceForm({ open, onOpenChange, initial, editing, pending, onSubmit, t, closeLabel }: Props) {
  const [form, setForm] = useState<ServiceFormValues>(initial);
  const [tried, setTried] = useState(false);
  const f = t.form;
  const isProduct = form.type === "product";
  const priceBad = !MONEY_RE.test(form.price);
  const costBad = form.cost !== "" && !MONEY_RE.test(form.cost);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!form.name || priceBad || costBad) return;
    onSubmit(form);
  };

  const input = "mt-1 h-11 w-full rounded-[10px] border bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 sm:text-sm";
  const ok = "border-slate-200 focus:border-blue-500 focus:ring-blue-500/30";
  const bad = "border-red-300 focus:border-red-500 focus:ring-red-500/30";

  return (
    <PosSheet
      open={open} onOpenChange={onOpenChange} closeLabel={closeLabel}
      title={editing ? f.editTitle(isProduct) : f.newTitle(isProduct)}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="h-12 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">{f.cancel}</button>
          <button type="submit" form="service-form" disabled={pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 disabled:bg-slate-300">
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{f.saving}</> : editing ? f.update : f.create}
          </button>
        </div>
      }
    >
      <form id="service-form" onSubmit={submit} noValidate className="space-y-4">
        <fieldset>
          <legend className="text-xs font-medium text-slate-500">{f.kind}</legend>
          <div role="radiogroup" className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(["service", "product"] as const).map((k) => {
              const Icon = k === "product" ? Package : Wrench;
              const on = form.type === k;
              return (
                <button
                  key={k} type="button" role="radio" aria-checked={on} onClick={() => setForm({ ...form, type: k })}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden />{k === "product" ? f.product : f.service}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="svc-name" className="block text-sm font-medium text-slate-700">{f.name(isProduct)} <span className="text-xs font-normal text-slate-400">({f.required})</span></label>
          <input
            id="svc-name" required value={form.name} placeholder={f.namePh(isProduct)} maxLength={255} autoComplete="off"
            onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={tried && !form.name}
            className={`${input} ${tried && !form.name ? bad : ok}`}
          />
        </div>

        <div>
          <label htmlFor="svc-desc" className="block text-sm font-medium text-slate-700">{f.description} <span className="text-xs font-normal text-slate-400">({f.optional})</span></label>
          <input
            id="svc-desc" value={form.description} placeholder={f.descriptionPh(isProduct)} autoComplete="off"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={`${input} ${ok}`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField id="svc-price" label={f.price} note={`(${f.required})`} hint={f.priceHint} value={form.price} onChange={(v) => setForm({ ...form, price: v })} error={tried && priceBad ? f.badPrice : undefined} required />
          <MoneyField id="svc-cost" label={f.cost} note={`(${f.optional})`} hint={f.costHint} value={form.cost} onChange={(v) => setForm({ ...form, cost: v })} error={tried && costBad ? f.badCost : undefined} />
        </div>

        {editing && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3">
            <div>
              <label htmlFor="svc-active" className="block text-sm font-medium text-slate-800">{f.active}</label>
              <p className="text-xs text-slate-500">{f.activeHint}</p>
            </div>
            <Switch id="svc-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} className="data-[state=checked]:bg-blue-600" />
          </div>
        )}
      </form>
    </PosSheet>
  );
}

function MoneyField({ id, label, note, hint, value, onChange, error, required }: {
  id: string; label: string; note: string; hint: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label} <span className="text-xs font-normal text-slate-400">{note}</span></label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden>$</span>
        <input
          id={id} type="text" inputMode="decimal" placeholder="0.00" value={value} required={required} autoComplete="off"
          onChange={(e) => onChange(clean(e.target.value))} aria-invalid={!!error} aria-describedby={`${id}-hint`}
          className={`h-11 w-full rounded-[10px] border bg-white pl-7 pr-3 text-base tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 sm:text-sm ${error ? "border-red-300 focus:border-red-500 focus:ring-red-500/30" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/30"}`}
        />
      </div>
      <p id={`${id}-hint`} className={`mt-1 text-xs ${error ? "text-red-700" : "text-slate-500"}`}>{error ?? hint}</p>
    </div>
  );
}
