import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/utils";
import type { QuotesCopy } from "@/i18n/copy/quotes";
import { formatDate, formatDay, type CompanyInfo, type QuoteDetail } from "./shared";

/** The quote as a document: what the print view shows and what gets printed or saved as PDF. */
export function QuoteDocument({ q, company, t, locale }: { q: QuoteDetail; company: CompanyInfo; t: QuotesCopy; locale: string }) {
  const doc = t.print.doc;
  return (
    <article className="bg-white text-[13px] leading-relaxed text-black">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-300 pb-4">
        <div className="min-w-0">
          {company.logo && <img src={company.logo} alt="" className="mb-2 h-12 w-auto max-w-[10rem] object-contain" />}
          {company.name && <p className="text-base font-semibold">{company.name}</p>}
          {company.lines.map((l) => <p key={l} className="break-words text-neutral-600">{l}</p>)}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold uppercase tracking-wide">{doc.quote}</p>
          <p className="font-medium">{doc.number} {q.number}</p>
          <p className="text-neutral-600">{doc.date}: {formatDate(q.createdAt, locale)}</p>
          {q.validUntil && <p className="text-neutral-600">{doc.validUntil}: {formatDay(q.validUntil, locale)}</p>}
        </div>
      </header>

      {q.customerName && (
        <section className="py-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">{doc.to}</p>
          <p className="break-words font-medium">{q.customerName}</p>
        </section>
      )}

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
            <th scope="col" className="py-2 pr-2 text-left font-medium">{doc.description}</th>
            <th scope="col" className="whitespace-nowrap px-1 py-2 text-right font-medium">{doc.quantity}</th>
            <th scope="col" className="whitespace-nowrap px-1 py-2 text-right font-medium">{doc.unitPrice}</th>
            <th scope="col" className="whitespace-nowrap py-2 pl-1 text-right font-medium">{doc.amount}</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((it) => (
            <tr key={it.id} className="border-b border-neutral-100 align-top">
              <td className="break-words py-2 pr-2 [overflow-wrap:anywhere]">{it.description}</td>
              <td className="whitespace-nowrap px-1 py-2 text-right">{it.quantity}</td>
              <td className="whitespace-nowrap px-1 py-2 text-right">{formatCurrency(it.unitPrice)}</td>
              <td className="whitespace-nowrap py-2 pl-1 text-right">{formatCurrency(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-3 w-full max-w-[16rem] space-y-1">
        {q.discount > 0 && (
          <>
            <div className="flex justify-between gap-4"><dt className="text-neutral-600">{doc.subtotal}</dt><dd>{formatCurrency(q.subtotal)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-neutral-600">{doc.discount}</dt><dd>-{formatCurrency(q.discount)}</dd></div>
          </>
        )}
        <div className="flex justify-between gap-4 border-t border-neutral-300 pt-1 text-base font-semibold">
          <dt>{doc.total}</dt><dd>{formatCurrency(q.total)}</dd>
        </div>
      </dl>

      {q.notes && (
        <section className="mt-6">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">{doc.notes}</p>
          <p className="whitespace-pre-wrap break-words">{q.notes}</p>
        </section>
      )}
    </article>
  );
}

// While it's mounted, printing shows only its content (the rest of the app is hidden on paper).
const PRINT_CSS = `
.quote-print-root { display: none; }
@media print {
  @page { margin: 14mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(.quote-print-root) { display: none !important; }
  .quote-print-root { display: block !important; }
}
`;

/** Puts its children straight under <body>, visible only when printing. */
export function PrintPortal({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="quote-print-root">
      <style>{PRINT_CSS}</style>
      {children}
    </div>,
    document.body,
  );
}
