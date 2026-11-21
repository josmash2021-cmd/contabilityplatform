import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Plus, Printer, ReceiptText } from "lucide-react";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { PosSheet } from "./PosSheet";
import { money, type DoneSale } from "./posTypes";

export type Company = { name: string; lines: string[] };

type Props = {
  sale: DoneSale;
  company: Company;
  locale: string;
  onNew: () => void;
  t: CobrarCopy["pos"];
  methods: Record<string, string>;
  closeLabel: string;
};

/** After charging: a clear "done", the receipt, and a fresh sale. */
export function SaleDone({ sale, company, locale, onNew, t, methods, closeLabel }: Props) {
  const [receipt, setReceipt] = useState(false);
  const count = sale.items.reduce((a, i) => a + i.quantity, 0);
  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8" aria-labelledby="pos-done">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-9 w-9" aria-hidden /></span>
      <h2 id="pos-done" className="mt-4 text-lg font-semibold text-slate-900">{t.done.title}</h2>
      <p className="mt-1 text-5xl font-bold tabular-nums tracking-tight text-slate-900">{money(sale.total)}</p>
      <p className="mt-2 text-sm font-medium text-emerald-700">{t.done.paid(t.done.via[sale.method] ?? sale.method)}</p>
      <p className="mt-1 text-sm text-slate-500">
        {t.done.receiptNo(sale.invoiceNumber)} · {t.done.items(count)}
        {sale.customerName ? <><br />{t.done.client(sale.customerName)}</> : null}
      </p>
      <div className="mt-6 grid gap-2">
        <button onClick={onNew} autoFocus className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2">
          <Plus className="h-5 w-5" aria-hidden />{t.done.newSale}
        </button>
        <button onClick={() => setReceipt(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ReceiptText className="h-5 w-5" aria-hidden />{t.done.receipt}
        </button>
      </div>

      <PosSheet
        open={receipt} onOpenChange={setReceipt} wide title={t.receipt.title} description={t.receipt.hint} closeLabel={closeLabel}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setReceipt(false)} className="h-12 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">{closeLabel}</button>
            <button onClick={() => window.print()} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500">
              <Printer className="h-4 w-4" aria-hidden />{t.receipt.print}
            </button>
          </div>
        }
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-left sm:p-5">
          <ReceiptDoc sale={sale} company={company} locale={locale} t={t} methods={methods} />
        </div>
        {receipt && <PrintOnly><ReceiptDoc sale={sale} company={company} locale={locale} t={t} methods={methods} /></PrintOnly>}
      </PosSheet>
    </section>
  );
}

/** The receipt as a small document (on screen and on paper). */
function ReceiptDoc({ sale, company, locale, t, methods }: { sale: DoneSale; company: Company; locale: string; t: CobrarCopy["pos"]; methods: Record<string, string> }) {
  const r = t.receipt;
  const when = new Date(sale.at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <article className="mx-auto max-w-sm text-[13px] leading-relaxed text-slate-900">
      <header className="border-b border-dashed border-slate-300 pb-3 text-center">
        {company.name && <p className="text-base font-bold">{company.name}</p>}
        {company.lines.map((l) => <p key={l} className="text-slate-600 [overflow-wrap:anywhere]">{l}</p>)}
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 py-3 text-xs">
        <dt className="text-slate-500">{r.number}</dt><dd className="text-right font-medium">{sale.invoiceNumber}</dd>
        <dt className="text-slate-500">{r.date}</dt><dd className="text-right">{when}</dd>
        {sale.customerName && <><dt className="text-slate-500">{r.client}</dt><dd className="text-right [overflow-wrap:anywhere]">{sale.customerName}</dd></>}
      </dl>
      <table className="w-full border-collapse border-y border-dashed border-slate-300">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-500">
            <th scope="col" className="py-2 pr-2 text-left font-medium">{r.item}</th>
            <th scope="col" className="px-1 py-2 text-right font-medium">{r.qty}</th>
            <th scope="col" className="py-2 pl-1 text-right font-medium">{r.amount}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((i, idx) => (
            <tr key={idx} className="align-top">
              <td className="py-1 pr-2 [overflow-wrap:anywhere]">{i.name}<span className="block text-[11px] text-slate-500">{t.cart.each(money(i.price))}</span></td>
              <td className="px-1 py-1 text-right tabular-nums">{i.quantity}</td>
              <td className="py-1 pl-1 text-right tabular-nums">{money(i.price * i.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-3 space-y-0.5">
        {sale.discount > 0 && (
          <>
            <div className="flex justify-between gap-4"><dt className="text-slate-600">{r.subtotal}</dt><dd className="tabular-nums">{money(sale.subtotal)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-600">{r.discount}</dt><dd className="tabular-nums">{money(-sale.discount)}</dd></div>
          </>
        )}
        <div className="flex justify-between gap-4 pt-1 text-base font-bold"><dt>{r.total}</dt><dd className="tabular-nums">{money(sale.total)}</dd></div>
        <div className="flex justify-between gap-4 text-xs"><dt className="text-slate-600">{r.paidWith}</dt><dd>{methods[sale.method] ?? sale.method}</dd></div>
      </dl>
      <p className="mt-4 border-t border-dashed border-slate-300 pt-3 text-center text-xs text-slate-500">{r.thanks}</p>
    </article>
  );
}

// While mounted, printing shows only the receipt (the rest of the app is hidden on paper).
const PRINT_CSS = `
.pos-print-root { display: none; }
@media print {
  @page { margin: 10mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(.pos-print-root) { display: none !important; }
  .pos-print-root { display: block !important; }
}
`;

function PrintOnly({ children }: { children: ReactNode }) {
  return createPortal(<div className="pos-print-root"><style>{PRINT_CSS}</style>{children}</div>, document.body);
}
