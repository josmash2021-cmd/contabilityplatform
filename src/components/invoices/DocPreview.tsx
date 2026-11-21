import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CompanyInfo } from "@/components/quotes/shared";
import { money } from "./shared";

export type DocLine = { key: string; description: string; quantity: number; unitPriceCents: number; lineCents: number };
export type DocRow = { label: string; cents: number; minus?: boolean; strong?: boolean };
export type DocLabels = { to: string; service: string; qty: string; price: string; amount: string; subtotal: string; discount: string; total: string };

/** Initials for the logo square when the business has no logo ("Taller López" → "TL"). */
function initials(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)).toUpperCase();
}

/**
 * The invoice or quote as the client sees it (the prototype's `.doc`): the business from Ajustes,
 * the client, the lines, the totals, notes and how to pay. Used on screen and for printing / PDF.
 */
export function DocPreview({ company, title, meta, customerName, lines, subtotalCents, discountCents, totalCents, extra = [], notes, pay, labels, print = false }: {
  company: CompanyInfo;
  /** "Factura FAC-20261121-0003" */
  title: string;
  /** "Fecha: 6 nov", "Vence: 20 nov"… */
  meta: readonly string[];
  customerName: string | null;
  lines: readonly DocLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  /** Rows after the total: paid, balance, refunded. */
  extra?: readonly DocRow[];
  notes: string | null;
  pay?: ReactNode;
  labels: DocLabels;
  /** Paper version: no card shadow, black text. */
  print?: boolean;
}) {
  const row = (r: DocRow, key: string) => (
    <div key={key} className={cn("flex justify-between gap-2.5", r.strong && "border-t border-slate-200 pt-1.5 text-[15px] font-[750]")}>
      <span>{r.label}</span>
      <span className="tabular-nums">{r.minus ? "−" : ""}{money(r.cents)}</span>
    </div>
  );
  return (
    <article
      className={cn(
        "min-w-0 rounded-[14px] border border-slate-200 bg-white p-4 text-slate-900 sm:p-[22px]",
        print ? "border-0 p-0 text-black sm:p-0" : "shadow-[0_12px_30px_-20px_rgba(15,23,42,0.3)]",
      )}
    >
      <header className="flex flex-wrap justify-between gap-3.5 border-b border-slate-200 pb-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {company.logo ? (
            <img src={company.logo} alt="" className="h-10 w-auto max-w-[7rem] flex-none rounded-[10px] object-contain" />
          ) : (
            <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-slate-900 text-sm font-extrabold text-white" aria-hidden="true">
              {initials(company.name) || "·"}
            </span>
          )}
          <div className="min-w-0">
            {company.name && <b className="block text-[15px] font-bold">{company.name}</b>}
            {company.lines.length > 0 && <span className="block break-words text-xs text-slate-500">{company.lines.join(" · ")}</span>}
          </div>
        </div>
        <div className="text-right">
          <b className="block break-all text-[15px] font-bold">{title}</b>
          {meta.map((m) => <span key={m} className="block text-xs text-slate-500">{m}</span>)}
        </div>
      </header>

      {customerName && (
        <div className="mb-2.5 mt-3.5 text-sm">
          <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{labels.to}</span>
          <b className="break-words font-bold">{customerName}</b>
        </div>
      )}

      <table className="mt-2 w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th scope="col" className="border-b border-slate-200 py-1.5 text-left text-[11px] font-bold text-slate-500">{labels.service}</th>
            <th scope="col" className="border-b border-slate-200 py-1.5 pl-2 text-right text-[11px] font-bold text-slate-500">{labels.qty}</th>
            <th scope="col" className="border-b border-slate-200 py-1.5 pl-2 text-right text-[11px] font-bold text-slate-500">{labels.price}</th>
            <th scope="col" className="border-b border-slate-200 py-1.5 pl-2 text-right text-[11px] font-bold text-slate-500">{labels.amount}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td className="break-words border-b border-slate-200 py-2 [overflow-wrap:anywhere]">{l.description}</td>
              <td className="border-b border-slate-200 py-2 pl-2 text-right tabular-nums">{l.quantity}</td>
              <td className="whitespace-nowrap border-b border-slate-200 py-2 pl-2 text-right tabular-nums">{money(l.unitPriceCents)}</td>
              <td className="whitespace-nowrap border-b border-slate-200 py-2 pl-2 text-right tabular-nums">{money(l.lineCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-2.5 grid max-w-[260px] gap-1 text-[13px]">
        {row({ label: labels.subtotal, cents: subtotalCents }, "sub")}
        {discountCents > 0 && row({ label: labels.discount, cents: discountCents, minus: true }, "disc")}
        {row({ label: labels.total, cents: totalCents, strong: true }, "total")}
        {extra.map((r, i) => row(r, `x${i}`))}
      </div>

      {notes && <p className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-500">{notes}</p>}
      {pay && <div className="mt-4 grid justify-items-start gap-2 rounded-xl bg-slate-100 p-3 text-xs text-slate-500">{pay}</div>}
    </article>
  );
}
