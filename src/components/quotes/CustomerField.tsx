import { useId } from "react";
import { UserCheck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { QuotesCopy } from "@/i18n/copy/quotes";
import { FIELD, LABEL } from "./ui";
import type { CustomerOption, CustomerValue } from "./shared";

/**
 * The client of a quote or recurring invoice: type any name, or pick one of the user's
 * clients from the matches shown under the field. Editing the name unlinks the client.
 */
export function CustomerField({ value, onChange, customers, t }: {
  value: CustomerValue;
  onChange: (v: CustomerValue) => void;
  customers: readonly CustomerOption[];
  t: QuotesCopy["form"];
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const listId = `${id}-matches`;
  const q = value.name.trim().toLowerCase();
  const matches = value.id === null && q.length > 0
    ? customers.filter((c) => c.label.toLowerCase().includes(q) && c.label.toLowerCase() !== q).slice(0, 5)
    : [];
  const exact = value.id === null ? customers.find((c) => c.label.toLowerCase() === q && q.length > 0) : undefined;
  const shown = exact ? [exact, ...matches].slice(0, 5) : matches;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={LABEL}>{t.customer}</Label>
      <Input
        id={id}
        value={value.name}
        maxLength={255}
        autoComplete="off"
        placeholder={t.customerPlaceholder}
        aria-describedby={hintId}
        onChange={(e) => onChange({ id: null, name: e.target.value })}
        className={FIELD}
      />
      {value.id !== null ? (
        <p id={hintId} className="flex items-center gap-1.5 text-xs text-emerald-700">
          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t.linked}
          <button
            type="button"
            onClick={() => onChange({ id: null, name: value.name })}
            aria-label={t.unlink}
            className="ml-1 grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </p>
      ) : (
        <p id={hintId} className="text-xs text-slate-500">{t.customerHint}</p>
      )}
      {shown.length > 0 && (
        <div>
          <p id={listId} className="sr-only">{t.customerMatches}</p>
          <ul aria-labelledby={listId} className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onChange({ id: c.id, name: c.label })}
                  aria-label={t.pickCustomer(c.label)}
                  className="flex min-h-[44px] w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
                >
                  <span className="truncate text-slate-900">{c.label}</span>
                  {c.detail && <span className="shrink-0 truncate text-xs text-slate-500">{c.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
