import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Mail, MessageCircle, Printer } from "lucide-react";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { mailtoLink, whatsappLink } from "../../../api/lib/ventas";
import { PosSheet } from "./PosSheet";
import { CARD, btn } from "./ui";
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

/** After charging (the prototype's `.receipt` card): what was charged, the change, the receipt three ways, a new sale. */
export function ReceiptCard({ sale, company, locale, onNew, t, methods, closeLabel }: Props) {
  const [receipt, setReceipt] = useState(false);
  const d = t.done;
  const how = sale.method === "mixed" && sale.payments.length === 2
    ? d.split(money(sale.payments[0].amount), money(sale.payments[1].amount), t.pay.restWord[sale.payments[1].method] ?? sale.payments[1].method)
    : d.how[sale.method] ?? methods[sale.method] ?? sale.method;
  const firstName = (sale.customerName ?? "").split(" ")[0];
  const text = `${d.msgHello(firstName)}${d.msgBody(company.name, money(sale.total), sale.invoiceNumber)}`;
  const message = whatsappLink(sale.customerPhone, text.charAt(0).toUpperCase() + text.slice(1));
  const mail = mailtoLink(sale.customerEmail, d.mailSubject(company.name, sale.invoiceNumber), receiptText(sale, company, locale, t, methods));

  return (
    <section className={`${CARD} grid animate-in fade-in-0 slide-in-from-bottom-2 justify-items-center gap-2 px-[18px] py-[26px] text-center duration-300`} aria-labelledby="pos-done">
      <CheckCircle2 className="h-11 w-11 text-emerald-600" aria-hidden />
      <h2 id="pos-done" className="text-[15px] font-bold text-slate-900">{d.title(money(sale.total))}</h2>
      <p className="text-slate-500">{how}</p>
      {sale.change > 0 && (
        <div className="rounded-xl bg-emerald-50 px-3.5 py-2 text-sm text-emerald-600" aria-live="polite">
          {d.change} <b className="text-lg tabular-nums">{money(sale.change)}</b>
        </div>
      )}
      {sale.customerName && <p className="text-[13px] text-slate-500">{d.inHistory(sale.customerName)}</p>}
      <p className="text-xs text-slate-400">{d.receiptNo(sale.invoiceNumber)}</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        <a href={message} target="_blank" rel="noopener noreferrer" className={btn("sm")}><MessageCircle className="h-[15px] w-[15px]" aria-hidden />{d.byMessage}</a>
        <a href={mail} className={btn("sm")}><Mail className="h-[15px] w-[15px]" aria-hidden />{d.byEmail}</a>
        <button type="button" onClick={() => setReceipt(true)} className={btn("sm")}><Printer className="h-[15px] w-[15px]" aria-hidden />{d.print}</button>
      </div>
      <button type="button" onClick={onNew} autoFocus className={btn("primary")}>{d.newSale}</button>

      <PosSheet
        open={receipt} onOpenChange={setReceipt} wide title={t.receipt.title} description={t.receipt.hint} closeLabel={closeLabel}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setReceipt(false)} className={btn()}>{closeLabel}</button>
            <button type="button" onClick={() => window.print()} className={btn("primary")}><Printer className="h-4 w-4" aria-hidden />{t.receipt.print}</button>
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

/** The receipt as plain text (for the email). */
function receiptText(sale: DoneSale, company: Company, locale: string, t: CobrarCopy["pos"], methods: Record<string, string>): string {
  const r = t.receipt;
  const when = new Date(sale.at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const lines = [
    company.name, ...company.lines, "",
    `${r.number}: ${sale.invoiceNumber}`, `${r.date}: ${when}`, ...(sale.customerName ? [`${r.client}: ${sale.customerName}`] : []), "",
    ...sale.items.map((i) => `${i.quantity} × ${i.name} — ${money(i.price * i.quantity)}`), "",
    ...(sale.discount > 0 ? [`${r.subtotal}: ${money(sale.subtotal)}`, `${r.discount}: ${money(-sale.discount)}`] : []),
    `${r.total}: ${money(sale.total)}`,
    `${r.paidWith}: ${sale.payments.length > 1 ? sale.payments.map((p) => `${methods[p.method]} ${money(p.amount)}`).join(" + ") : methods[sale.method] ?? sale.method}`,
    "", r.thanks,
  ];
  return lines.filter((l, i) => l !== "" || (i > 0 && lines[i - 1] !== "")).join("\n").trim();
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
              <td className="py-1 pr-2 [overflow-wrap:anywhere]">{i.name}<span className="block text-[11px] text-slate-500">{r.each(money(i.price))}</span></td>
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
        {sale.payments.length > 1 ? sale.payments.map((p) => (
          <div key={p.method} className="flex justify-between gap-4 text-xs"><dt className="text-slate-600">{r.paidWith} {methods[p.method]}</dt><dd className="tabular-nums">{money(p.amount)}</dd></div>
        )) : (
          <div className="flex justify-between gap-4 text-xs"><dt className="text-slate-600">{r.paidWith}</dt><dd>{methods[sale.method] ?? sale.method}</dd></div>
        )}
        {sale.change > 0 && <div className="flex justify-between gap-4 text-xs"><dt className="text-slate-600">{r.change}</dt><dd className="tabular-nums">{money(sale.change)}</dd></div>}
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
