import { useId } from "react";
import { Banknote, Clock, CreditCard, Smartphone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { pending: Clock, cash: Banknote, zelle: Smartphone, card: CreditCard };

/** Radio buttons for how a sale is (or isn't yet) paid. */
export function PaymentChoice<T extends string>({ legend, options, value, onChange }: {
  legend: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-black">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const Icon = ICONS[o.value] ?? Banknote;
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 text-sm transition-colors",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neutral-400 has-[:focus-visible]:ring-offset-1",
                checked ? "border-black bg-black text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
              )}
            >
              <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
