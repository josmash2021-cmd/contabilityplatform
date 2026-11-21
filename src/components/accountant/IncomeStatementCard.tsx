import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { accountantCopy } from "@/i18n/copy/accountant";
import { receiptsCopy } from "@/i18n/copy/receipts";
import { formatPercent } from "@/lib/accountantExport";
import type { BankTotals, IncomeStatement } from "../../../api/lib/accountant";
import { CARD, H3, SUB, TD, TH } from "@/components/reports/ui";
import { money } from "./ui";
import { expenseCategoryLabel } from "./labels";

type Line = { label: string; value: ReactNode; strong?: boolean; total?: boolean; onClick?: () => void };

/** The prototype's statement table (.stmt): concept left, amount right, totals in bold; lines can open their movements. */
function Stmt({ head, rows }: { head: [string, string]; rows: Line[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead><tr><th scope="col" className={TH}>{head[0]}</th><th scope="col" className={cn(TH, "text-right")}>{head[1]}</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cn(r.onClick && "hover:bg-slate-50")}>
              <td className={cn(TD, "pr-3", (r.strong || r.total) && "font-bold", r.total && "border-b-0 font-[750]")}>
                {r.onClick ? (
                  <button type="button" onClick={r.onClick} className="inline-flex min-h-11 items-center gap-1 text-left text-slate-900 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0">
                    {r.label}<ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  </button>
                ) : r.label}
              </td>
              <td className={cn(TD, "text-right tabular-nums", (r.strong || r.total) && "font-bold", r.total && "border-b-0 font-[750]")}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Estado de resultados del periodo (same rules as Reportes) and the bank totals beside it. */
export function IncomeStatementCard({ statement, bank, periodLabel, onDrillIncome, onDrillCategory }: {
  statement: IncomeStatement;
  bank: BankTotals;
  periodLabel: string;
  onDrillIncome: () => void;
  onDrillCategory: (category: string, label: string) => void;
}) {
  const c = useCopy(accountantCopy);
  const rc = useCopy(receiptsCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const s = c.statement;
  const gain = statement.profit >= 0;

  const rows: Line[] = [
    { label: s.salesCompleted(statement.salesCount), value: money(statement.income), onClick: statement.salesCount > 0 ? onDrillIncome : undefined },
    { label: s.totalIncome, value: money(statement.income), strong: true },
    ...(statement.expenseLines.length === 0
      ? [{ label: s.noExpenses, value: money(0) }]
      : statement.expenseLines.map((l) => {
          const label = expenseCategoryLabel(l.category, c, rc);
          return { label, value: money(-l.total), onClick: () => onDrillCategory(l.category, label) };
        })),
    { label: s.totalExpenses, value: money(-statement.totalExpenses), strong: true },
    {
      label: gain ? s.profit : c.ui.lossNet,
      total: true,
      value: <span className={gain ? "text-emerald-600" : "text-red-600"}>{money(statement.profit)}</span>,
    },
  ];
  if (statement.margin !== null) rows.push({ label: s.margin, value: formatPercent(statement.margin, locale) });

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className={CARD} aria-labelledby="acc-statement">
        <h2 id="acc-statement" className={H3}>{s.title}</h2>
        <p className={SUB}>{periodLabel} · {c.ui.statementSub}</p>
        <Stmt head={[c.workbook.summary.concept, c.workbook.summary.amount]} rows={rows} />
        <p className="mt-2 text-xs text-slate-500">{s.onlyCompleted}</p>
      </section>

      <section className={CARD} aria-labelledby="acc-bank">
        <h2 id="acc-bank" className={H3}>{c.workbook.summary.bank}</h2>
        <p className={SUB}>{periodLabel}</p>
        <Stmt
          head={[c.workbook.summary.concept, c.workbook.summary.amount]}
          rows={[
            { label: c.bank.moneyIn, value: money(bank.moneyIn) },
            { label: c.bank.moneyOut, value: money(-bank.moneyOut) },
            { label: c.bank.net, total: true, value: `${bank.net > 0 ? "+" : ""}${money(bank.net)}` },
          ]}
        />
        <p className="mt-2 text-xs text-slate-500">{s.bankNote}</p>
      </section>
    </div>
  );
}
