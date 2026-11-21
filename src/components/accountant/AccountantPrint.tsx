import { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { accountantCopy } from "@/i18n/copy/accountant";
import { formatDay, formatPercent } from "@/lib/accountantExport";
import type { AccountantPeriod } from "../../../api/lib/accountant";

/**
 * The printable report behind "Descargar PDF". It lives in a portal straight under <body>,
 * hidden on screen; while it is mounted, src/styles/print.css (imported by the page) hides the rest of the
 * app when printing, so the browser's "Save as PDF" gets only this.
 */
function AccountantPrintView({ data, company, periodLabel, dataAsOf }: {
  data: AccountantPeriod;
  company: string | null;
  periodLabel: string;
  dataAsOf: string;
}) {
  const c = useCopy(accountantCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);

  useEffect(() => {
    document.body.classList.add("accountant-print-page");
    return () => document.body.classList.remove("accountant-print-page");
  }, []);

  const s = data.incomeStatement;
  const method = (m: string) => c.methods[m] ?? m;
  const day = (iso: string) => formatDay(iso, locale);
  const money = (n: number) => formatCurrency(n);
  const truncatedNote = (section: string, part: { truncated: boolean; rows: unknown[]; count: number }) =>
    part.truncated ? <p className="ap-note">{c.truncated(section, part.rows.length, part.count)}</p> : null;

  return createPortal(
    <div className="accountant-print-root" lang={lang}>
      <header className="ap-header">
        {company && <p className="ap-company">{company}</p>}
        <h1>{c.print.title}</h1>
        <p className="ap-muted">
          {c.print.period}: {periodLabel} · {c.print.generated(dataAsOf)}
        </p>
      </header>

      <section className="ap-section ap-keep">
        <h2>{c.statement.title}</h2>
        <table className="ap-table ap-summary">
          <tbody>
            <tr className="ap-group"><th scope="rowgroup" colSpan={2}>{c.statement.income}</th></tr>
            <tr><th scope="row">{c.statement.salesCompleted(s.salesCount)}</th><td className="ap-num">{money(s.income)}</td></tr>
            <tr className="ap-total"><th scope="row">{c.statement.totalIncome}</th><td className="ap-num">{money(s.income)}</td></tr>
            <tr className="ap-group"><th scope="rowgroup" colSpan={2}>{c.statement.expenses}</th></tr>
            {s.expenseLines.length === 0 && (
              <tr><th scope="row" className="ap-muted">{c.statement.noExpenses}</th><td className="ap-num">{money(0)}</td></tr>
            )}
            {s.expenseLines.map((l) => (
              <tr key={l.category}><th scope="row">{l.category || c.uncategorized}</th><td className="ap-num">{money(l.total)}</td></tr>
            ))}
            <tr className="ap-total"><th scope="row">{c.statement.totalExpenses}</th><td className="ap-num">{money(s.totalExpenses)}</td></tr>
            <tr className="ap-grand"><th scope="row">{c.statement.profit}</th><td className="ap-num">{money(s.profit)}</td></tr>
            {s.margin !== null && (
              <tr><th scope="row">{c.statement.margin}</th><td className="ap-num">{formatPercent(s.margin, locale)}</td></tr>
            )}
          </tbody>
        </table>
        <p className="ap-note">{c.statement.onlyCompleted}</p>
      </section>

      <section className="ap-section ap-keep">
        <h2>{c.workbook.summary.bank}</h2>
        <table className="ap-table ap-summary">
          <tbody>
            <tr><th scope="row">{c.bank.moneyIn}</th><td className="ap-num">{money(data.bank.moneyIn)}</td></tr>
            <tr><th scope="row">{c.bank.moneyOut}</th><td className="ap-num">{money(data.bank.moneyOut)}</td></tr>
            <tr className="ap-total"><th scope="row">{c.bank.net}</th><td className="ap-num">{money(data.bank.net)}</td></tr>
          </tbody>
        </table>
        <p className="ap-note">{c.statement.bankNote}</p>
      </section>

      <section className="ap-section">
        <h2>{c.sales.caption}</h2>
        {data.sales.rows.length === 0 ? <p className="ap-muted">{c.sales.empty}</p> : (
          <table className="ap-table">
            <thead>
              <tr>
                <th scope="col">{c.sales.cols.date}</th>
                <th scope="col">{c.sales.cols.invoice}</th>
                <th scope="col">{c.sales.cols.client}</th>
                <th scope="col">{c.sales.cols.items}</th>
                <th scope="col">{c.sales.cols.method}</th>
                <th scope="col">{c.sales.cols.status}</th>
                <th scope="col" className="ap-num">{c.sales.cols.total}</th>
              </tr>
            </thead>
            <tbody>
              {data.sales.rows.map((r) => (
                <tr key={r.id} className={r.status === "completed" ? undefined : "ap-muted"}>
                  <td className="ap-nowrap">{day(r.date)}</td>
                  <td className="ap-nowrap">{r.invoice}</td>
                  <td>{r.client ?? c.sales.noClient}</td>
                  <td>{r.items ?? ""}</td>
                  <td>{method(r.method)}</td>
                  <td>{c.statuses[r.status] ?? r.status}</td>
                  <td className="ap-num">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ap-total">
                <th scope="row" colSpan={6}>{c.sales.totalCompleted}</th>
                <td className="ap-num">{money(data.sales.completedTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        {data.sales.otherCount > 0 && <p className="ap-note">{c.sales.otherNote(data.sales.otherCount, money(data.sales.otherTotal))}</p>}
        {truncatedNote(c.tabs.sales, data.sales)}
      </section>

      <section className="ap-section">
        <h2>{c.expenses.caption}</h2>
        {data.expenses.rows.length === 0 ? <p className="ap-muted">{c.expenses.empty}</p> : (
          <table className="ap-table">
            <thead>
              <tr>
                <th scope="col">{c.expenses.cols.date}</th>
                <th scope="col">{c.expenses.cols.description}</th>
                <th scope="col">{c.expenses.cols.category}</th>
                <th scope="col">{c.expenses.cols.method}</th>
                <th scope="col" className="ap-num">{c.expenses.cols.amount}</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.rows.map((r) => (
                <tr key={r.id}>
                  <td className="ap-nowrap">{day(r.date)}</td>
                  <td>{r.description}</td>
                  <td>{r.category.trim() || c.uncategorized}</td>
                  <td>{method(r.method)}</td>
                  <td className="ap-num">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ap-total">
                <th scope="row" colSpan={4}>{c.expenses.total}</th>
                <td className="ap-num">{money(data.expenses.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        {truncatedNote(c.tabs.expenses, data.expenses)}
      </section>

      <section className="ap-section">
        <h2>{c.bank.caption}</h2>
        {data.bank.rows.length === 0 ? <p className="ap-muted">{c.bank.empty}</p> : (
          <table className="ap-table">
            <thead>
              <tr>
                <th scope="col">{c.bank.cols.date}</th>
                <th scope="col">{c.bank.cols.description}</th>
                <th scope="col">{c.bank.cols.category}</th>
                <th scope="col">{c.bank.cols.account}</th>
                <th scope="col" className="ap-num">{c.bank.cols.moneyIn}</th>
                <th scope="col" className="ap-num">{c.bank.cols.moneyOut}</th>
              </tr>
            </thead>
            <tbody>
              {data.bank.rows.map((r) => (
                <tr key={r.id}>
                  <td className="ap-nowrap">{day(r.date)}</td>
                  <td>{r.description}</td>
                  <td>{c.bankCategories[r.category] ?? r.category}</td>
                  <td>{r.account ?? ""}</td>
                  <td className="ap-num">{r.type === "income" ? money(r.amount) : ""}</td>
                  <td className="ap-num">{r.type === "expense" ? money(r.amount) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ap-total">
                <th scope="row" colSpan={4}>{c.bank.total}</th>
                <td className="ap-num">{money(data.bank.moneyIn)}</td>
                <td className="ap-num">{money(data.bank.moneyOut)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        {truncatedNote(c.tabs.bank, data.bank)}
      </section>
    </div>,
    document.body,
  );
}

export const AccountantPrint = memo(AccountantPrintView);
