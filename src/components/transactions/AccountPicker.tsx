import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { BankLogo } from "@/components/brand/BankLogo";
import { accountLabel } from "./shared";

export type PickerAccount = { id: number; bankName: string; accountNumber: string | null; accountType: string | null; pending: number };

/** The prototype's account picker (.acct-dd): "Todas las cuentas" or one account, each with what's left to review. */
export function AccountPicker({ accounts, value, onChange, totalPending }: {
  accounts: PickerAccount[];
  value: number | "all";
  onChange: (v: number | "all") => void;
  totalPending: number;
}) {
  const t = useCopy(movimientosCopy);
  const r = t.rv;
  const uid = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const banks = [...new Set(accounts.map((a) => a.bankName))];
  const current = value === "all" ? null : accounts.find((a) => a.id === value) ?? null;
  const typeLabel = (type: string | null) => (type ? r.acctTypes[type.toLowerCase()] ?? r.acctOther : r.acctOther);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    // Focus the chosen option once the menu shows.
    const sel = wrap.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]') ?? wrap.current?.querySelector<HTMLButtonElement>('[role="option"]');
    sel?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const pick = (v: number | "all") => {
    setOpen(false);
    onChange(v);
    btn.current?.focus({ preventScroll: true });
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const opts = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const i = opts.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      opts[e.key === "ArrowDown" ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
      return;
    }
    if (open && (e.key === "Home" || e.key === "End")) { e.preventDefault(); opts[e.key === "Home" ? 0 : opts.length - 1]?.focus(); }
    if (open && e.key === "Tab") setOpen(false);
  };

  const stack = (size: number) => (
    <span className="inline-flex items-center">
      {banks.slice(0, 3).map((b, i) => (
        <BankLogo key={b} name={b} size={size} className={cn("rounded-full", i > 0 && "-ml-1.5 ring-2 ring-white")} />
      ))}
    </span>
  );

  const option = (v: number | "all", title: string, sub: string, n: number, logo: ReactNode) => {
    const selected = value === v;
    return (
      <button key={String(v)} type="button" role="option" aria-selected={selected} tabIndex={-1} onClick={() => pick(v)}
        className="grid w-full grid-cols-[18px_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:shadow-[inset_0_0_0_2px_theme(colors.blue.600)] focus-visible:outline-none [&+&]:mt-0.5">
        <Check className={cn("h-4 w-4 text-blue-600 transition", selected ? "scale-100 opacity-100" : "scale-50 opacity-0")} aria-hidden />
        <span className="flex">{logo}</span>
        <span className="min-w-0">
          <b className={cn("block truncate text-sm font-semibold", selected ? "text-blue-600" : "text-slate-900")}>{title}</b>
          <small className="block truncate text-xs text-slate-500">{sub}</small>
        </span>
        <span className="min-w-[22px] rounded-full bg-slate-100 px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums text-slate-500" title={r.acctPendingTitle}>{n}</span>
      </button>
    );
  };

  return (
    <div ref={wrap} className="relative w-full shrink-0 sm:w-auto" onKeyDown={onKey}>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${uid}-menu`}
        className={cn(
          "inline-flex min-h-11 w-full items-center gap-2 rounded-[10px] border bg-white py-1.5 pl-3 pr-2.5 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-9 sm:w-auto",
          open ? "border-blue-600 shadow-[0_0_0_3px_theme(colors.blue.50)]" : "border-slate-200",
        )}>
        {current ? <BankLogo name={current.bankName} size={20} className="rounded-full" /> : stack(18)}
        <span className="min-w-0 flex-1 truncate text-left">{current ? accountLabel(current.bankName, current.accountNumber, t) : r.acctAll}</span>
        <ChevronDown className={cn("ml-0.5 h-4 w-4 text-slate-500 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      <div id={`${uid}-menu`} role="listbox" aria-label={r.acctChoose}
        className={cn(
          "absolute right-0 top-[calc(100%+8px)] z-20 w-full origin-top-right rounded-[14px] border border-slate-200 bg-white p-1.5 shadow-[0_20px_44px_-16px_rgba(15,23,42,0.30),0_2px_6px_rgba(15,23,42,0.05)] transition duration-200 sm:w-[290px] motion-reduce:transition-none",
          open ? "visible scale-100 opacity-100" : "invisible -translate-y-1.5 scale-[0.97] opacity-0",
        )}>
        {option("all", r.acctAll, banks.join(` ${r.and} `), totalPending, stack(24))}
        {accounts.map((a) => option(a.id, accountLabel(a.bankName, a.accountNumber, t), typeLabel(a.accountType), a.pending, <BankLogo name={a.bankName} size={28} className="rounded-full" />))}
      </div>
    </div>
  );
}
