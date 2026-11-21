import { useState, type KeyboardEvent } from "react";
import { Delete } from "lucide-react";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { PosSheet } from "./PosSheet";
import { money, padDisplay, padKey, toPadValue, type PadMode } from "./posTypes";

type Props = {
  mode: PadMode | null;
  onClose: () => void;
  /** Gets the amount (> 0) and, for a custom charge, what it is for. */
  onSubmit: (mode: PadMode, amount: number, label: string) => void;
  t: CobrarCopy["pos"];
  closeLabel: string;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

/** A big keypad for a custom amount, a service without a set price, or a new price for a line. Remount it (key) per use. */
export function AmountPad({ mode, onClose, onSubmit, t, closeLabel }: Props) {
  const [value, setValue] = useState(() => (mode?.kind === "price" ? toPadValue(mode.price) : "0"));
  const [label, setLabel] = useState("");
  const amount = parseFloat(value) || 0;

  const press = (k: string) => setValue((v) => padKey(v, k));
  const submit = () => { if (mode && amount > 0) onSubmit(mode, amount, label.trim()); };

  // Typing on a computer keyboard works too (but not while writing the description).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement) { if (e.key === "Enter") { e.preventDefault(); submit(); } return; }
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === "." || e.key === ",") { e.preventDefault(); press("."); }
    else if (e.key === "Backspace") { e.preventDefault(); press("back"); }
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  const title = !mode || mode.kind === "free" ? t.pad.title : t.pad.priceFor(mode.kind === "service" ? mode.service.name : mode.name);
  const sub = !mode || mode.kind === "free" ? t.pad.sub : mode.kind === "service" ? t.pad.variableSub : t.pad.editSub;

  return (
    <PosSheet
      open={!!mode} onOpenChange={(o) => { if (!o) onClose(); }}
      title={title} description={sub} closeLabel={closeLabel} onKeyDown={onKeyDown} focusSheet
      footer={
        <button
          onClick={submit} disabled={amount <= 0}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          <span className="tabular-nums">{mode?.kind === "price" ? t.pad.save(money(amount)) : t.pad.add(money(amount))}</span>
        </button>
      }
    >
      {mode?.kind === "free" && (
        <div className="mb-3">
          <label htmlFor="pos-pad-what" className="block text-xs font-medium text-slate-500">{t.pad.what} <span className="text-slate-400">({t.pad.optional})</span></label>
          <input
            id="pos-pad-what" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.pad.whatPh} maxLength={200} autoComplete="off"
            className="mt-1 h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:text-sm"
          />
        </div>
      )}

      <div className="rounded-2xl bg-slate-50 px-4 py-4 text-center">
        <p className="text-xs font-medium text-slate-500" id="pos-pad-amount">{t.pad.amount}</p>
        <p className="mt-1 truncate text-5xl font-bold tabular-nums tracking-tight text-slate-900" aria-labelledby="pos-pad-amount" aria-live="polite">{padDisplay(value)}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k} type="button" onClick={() => press(k)} aria-label={k === "back" ? t.pad.del : undefined}
            className={`grid h-14 place-items-center rounded-xl text-2xl font-semibold tabular-nums transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              k === "back" ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            {k === "back" ? <Delete className="h-6 w-6" aria-hidden /> : k}
          </button>
        ))}
      </div>
    </PosSheet>
  );
}
