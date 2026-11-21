import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The section title inside the card (.set-body h3). */
export function SetTitle({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} className="mb-1 text-[17px] font-bold text-slate-900">{children}</h2>;
}

/** A label above its control (.fld): 13px label, optional 12px hint under it. */
export function Fld({ id, label, hint, className, children }: { id: string; label: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-slate-600">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** The prototype's status dot + label (.dst). */
export function Dst({ tone, children }: { tone: "good" | "warn" | "open" | "muted" | "bad"; children: ReactNode }) {
  const color = { good: "text-emerald-600", warn: "text-amber-700", open: "text-blue-600", muted: "text-slate-500", bad: "text-red-600" }[tone];
  return <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold", color)}><i className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" aria-hidden />{children}</span>;
}

/** A row in a list (.item): icon, text, and an action on the right. */
export function Item({ icon, title, meta, right }: { icon: ReactNode; title: ReactNode; meta?: ReactNode; right?: ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl bg-slate-100 px-3 py-[11px] sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <span className="grid w-[22px] place-items-center text-blue-600">{icon}</span>
      <div className="min-w-0">
        <b className="block text-sm font-semibold text-slate-900">{title}</b>
        {meta && <span className="block text-xs text-slate-500">{meta}</span>}
      </div>
      {right && <div className="col-start-2 justify-self-start sm:col-start-auto sm:justify-self-end">{right}</div>}
    </li>
  );
}
