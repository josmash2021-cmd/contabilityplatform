import { useId } from "react";
import { Trash2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { blankLine, priceInput, type DraftLine, type ServiceOption } from "@/components/quotes/shared";
import { FIELD, LINK_BTN } from "./ui";

export type LinesCopy = {
  label: string;
  service: string;
  qty: string;
  price: string;
  choose: string;
  other: string;
  description: string;
  descriptionPlaceholder: string;
  add: string;
  remove: (n: number) => string;
  lineAria: (n: number) => string;
};

const CUSTOM = "custom";

/**
 * The prototype's `.flines`: one row per service from Productos y servicios (with its quantity
 * and price, which can be changed), "Otro" for a free-text line, and "+ Agregar otro servicio".
 */
export function LinesEditor({ lines, onChange, services, t }: {
  lines: readonly DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  services: readonly ServiceOption[];
  t: LinesCopy;
}) {
  const update = (key: string, patch: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <fieldset className="grid min-w-0 gap-1.5">
      <legend className="mb-1.5 text-[13px] font-semibold text-slate-900">{t.label}</legend>
      <div className="hidden grid-cols-[minmax(0,1fr)_76px_110px_40px] gap-1.5 text-xs font-medium text-slate-500 sm:grid" aria-hidden="true">
        <span>{t.service}</span><span>{t.qty}</span><span>{t.price}</span><span />
      </div>
      {lines.map((l, i) => (
        <LineRow
          key={l.key}
          line={l}
          n={i + 1}
          services={services}
          t={t}
          canRemove={lines.length > 1}
          onChange={(patch) => update(l.key, patch)}
          onRemove={() => onChange(lines.filter((x) => x.key !== l.key))}
        />
      ))}
      <button type="button" className={cn(LINK_BTN, "justify-self-start text-sm")} onClick={() => onChange([...lines, blankLine()])}>
        {t.add}
      </button>
    </fieldset>
  );
}

function LineRow({ line, n, services, t, canRemove, onChange, onRemove }: {
  line: DraftLine;
  n: number;
  services: readonly ServiceOption[];
  t: LinesCopy;
  canRemove: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const known = line.serviceId !== null && services.some((s) => s.id === line.serviceId);
  const isCustom = !known && (line.custom || line.serviceId !== null || line.description.trim() !== "");
  const value = known ? String(line.serviceId) : isCustom ? CUSTOM : "";

  const pick = (v: string) => {
    if (v === CUSTOM) return onChange({ serviceId: null, custom: true, description: known ? "" : line.description });
    const s = services.find((x) => String(x.id) === v);
    if (s) onChange({ serviceId: s.id, custom: false, description: s.name, unitPrice: priceInput(s.price) });
    else onChange({ serviceId: null, custom: false, description: "", unitPrice: "" });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_76px_44px] gap-1.5 rounded-xl border border-slate-200 p-2 sm:grid-cols-[minmax(0,1fr)_76px_110px_40px] sm:rounded-none sm:border-0 sm:p-0">
      <select
        aria-label={t.lineAria(n)}
        value={value}
        onChange={(e) => pick(e.target.value)}
        className={cn(FIELD, "col-span-3 sm:col-span-1")}
      >
        <option value="">{t.choose}</option>
        {services.map((s) => <option key={s.id} value={String(s.id)}>{s.name} · {formatCurrency(s.price)}</option>)}
        <option value={CUSTOM}>{t.other}</option>
      </select>
      <label className="order-2 grid gap-0.5 text-[11px] font-medium text-slate-500 sm:order-none sm:block">
        <span className="sm:sr-only">{t.qty}</span>
        <input
          id={`${id}-qty`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={line.quantity}
          aria-label={`${t.qty} · ${t.lineAria(n)}`}
          onChange={(e) => onChange({ quantity: e.target.value })}
          className={cn(FIELD, "px-2 tabular-nums")}
        />
      </label>
      <label className="order-1 col-span-1 grid gap-0.5 text-[11px] font-medium text-slate-500 sm:order-none sm:block">
        <span className="sm:sr-only">{t.price}</span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={line.unitPrice}
            placeholder="0.00"
            aria-label={`${t.price} · ${t.lineAria(n)}`}
            onChange={(e) => onChange({ unitPrice: e.target.value })}
            className={cn(FIELD, "pl-6 tabular-nums")}
          />
        </span>
      </label>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={t.remove(n)}
        className="order-3 grid h-11 w-11 place-items-center self-end rounded-[10px] text-slate-500 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30 sm:order-none sm:h-[42px] sm:w-10"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
      {isCustom && (
        <label className="order-4 col-span-3 grid gap-0.5 text-[11px] font-medium text-slate-500 sm:col-span-4">
          <span>{t.description}</span>
          <input
            value={line.description}
            maxLength={255}
            placeholder={t.descriptionPlaceholder}
            onChange={(e) => onChange({ description: e.target.value })}
            className={FIELD}
          />
        </label>
      )}
    </div>
  );
}
