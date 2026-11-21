import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import type { QuotesCopy } from "@/i18n/copy/quotes";
import { blankLine, money, newKey, parseMoney, priceInput, type DraftLine, type ServiceOption } from "./shared";

/** The lines of a quote or recurring invoice: from the services catalog or free text. */
export function ItemsEditor({ lines, onChange, services, t }: {
  lines: readonly DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  services: readonly ServiceOption[];
  t: QuotesCopy["form"];
}) {
  const update = (key: string, patch: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));
  const addService = (value: string) => {
    const s = services.find((x) => String(x.id) === value);
    if (s) onChange([...lines, { key: newKey(), serviceId: s.id, description: s.name, quantity: "1", unitPrice: priceInput(s.price) }]);
  };

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-1.5 text-xs font-medium text-neutral-600">{t.lines}</legend>
      {lines.length > 0 && (
        <ol className="space-y-2">
          {lines.map((l, i) => (
            <li key={l.key}>
              <LineRow line={l} n={i + 1} t={t} onChange={(patch) => update(l.key, patch)} onRemove={() => remove(l.key)} />
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value="" onValueChange={addService} disabled={services.length === 0}>
          <SelectTrigger aria-label={t.addService} className="h-10 w-full min-w-0 sm:flex-1">
            <SelectValue placeholder={services.length > 0 ? t.addService : t.noServices} />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name} · {formatCurrency(s.price)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" className="h-10 shrink-0 border-neutral-200" onClick={() => onChange([...lines, blankLine()])}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t.addLine}
        </Button>
      </div>
    </fieldset>
  );
}

function LineRow({ line, n, t, onChange, onRemove }: {
  line: DraftLine;
  n: number;
  t: QuotesCopy["form"];
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const qty = Number(line.quantity);
  const price = parseMoney(line.unitPrice) ?? 0;
  const lineCents = Number.isInteger(qty) && qty > 0 ? Math.round(price * 100) * qty : 0;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`${id}-desc`} className="text-[11px] text-neutral-500">
            <span className="sr-only">{t.line(n)}: </span>{t.lineDescription}
          </Label>
          <Input
            id={`${id}-desc`}
            value={line.description}
            maxLength={255}
            placeholder={t.linePlaceholder}
            onChange={(e) => onChange({ description: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <Button
          type="button" variant="ghost" size="icon" aria-label={t.removeLine(n)} onClick={onRemove}
          className="h-9 w-9 shrink-0 text-neutral-500 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-qty`} className="text-[11px] text-neutral-500">{t.quantity}</Label>
          <Input
            id={`${id}-qty`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className="h-9 px-2 text-sm"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-price`} className="text-[11px] text-neutral-500">{t.unitPrice}</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400" aria-hidden="true">$</span>
            <Input
              id={`${id}-price`}
              inputMode="decimal"
              autoComplete="off"
              value={line.unitPrice}
              placeholder="0.00"
              onChange={(e) => onChange({ unitPrice: e.target.value })}
              className="h-9 pl-6 text-sm"
            />
          </div>
        </div>
        <div className="min-w-0 space-y-1 text-right">
          <p className="text-[11px] text-neutral-500">{t.amount}</p>
          <p className="flex h-9 items-center justify-end truncate text-sm font-medium text-black">{money(lineCents)}</p>
        </div>
      </div>
    </div>
  );
}
