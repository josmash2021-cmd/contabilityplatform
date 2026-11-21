import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { accountantCopy } from "@/i18n/copy/accountant";
import { receiptsCopy } from "@/i18n/copy/receipts";
import { formatPercent } from "@/lib/accountantExport";
import type { BankTotals, IncomeStatement } from "../../../api/lib/accountant";
import { CARD, money } from "./ui";
import { expenseCategoryLabel } from "./labels";

/** One row of a <dl>; `strong` rows are totals, drawn under a rule. Negative amounts carry a minus sign, not only a color. */
function Line({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "income" | "expense" | "auto" }) {
  const color =
    tone === "income" ? "text-emerald-700"
    : tone === "expense" ? "text-red-700"
    : tone === "auto" ? (value >= 0 ? "text-emerald-700" : "text-red-700")
    : "text-slate-900";
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", strong && "border-t border-slate-200 pt-2 font-semibold")}>
      <dt className={cn("min-w-0 break-words", strong ? "text-slate-900" : "text-slate-600")}>{label}</dt>
      <dd className={cn("shrink-0 tabular-nums", strong ? color : "font-medium text-slate-900")}>{tone === "auto" && value > 0 ? "+" : ""}{money(value)}</dd>
    </div>
  );
}

/** Estado de resultados del periodo (same rules as the Reports page) and the bank totals beside it. */
export function IncomeStatementCard({ statement, bank, periodLabel }: { statement: IncomeStatement; bank: BankTotals; periodLabel: string }) {
  const c = useCopy(accountantCopy);
  const rc = useCopy(receiptsCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const s = c.statement;
  const gain = statement.profit >= 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className={cn(CARD, "lg:col-span-2")} aria-labelledby="acc-statement">
        <h2 id="acc-statement" className="font-semibold text-slate-900">{s.title}</h2>
        <p className="text-xs text-slate-500">{periodLabel}</p>
        <div className="mt-4 space-y-4">
          <section aria-label={s.income}>
            <h3 className="mb-2 text-xs font-medium text-slate-500">{s.income}</h3>
            <dl className="space-y-2">
              <Line label={s.salesCompleted(statement.salesCount)} value={statement.income} />
              <Line label={s.totalIncome} value={statement.income} strong tone="income" />
            </dl>
          </section>
          <section aria-label={s.expenses} className="border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-xs font-medium text-slate-500">{s.expenses}</h3>
            {statement.expenseLines.length === 0 && <p className="mb-2 text-sm text-slate-500">{s.noExpenses}</p>}
            <dl className="space-y-2">
              {statement.expenseLines.map((l) => (
                <Line key={l.category} label={expenseCategoryLabel(l.category, c, rc)} value={l.total} />
              ))}
              <Line label={s.totalExpenses} value={statement.totalExpenses} strong tone="expense" />
            </dl>
          </section>
          <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3", gain ? "bg-emerald-50" : "bg-red-50")}>
            <span className={cn("font-bold", gain ? "text-emerald-900" : "text-red-900")}>{gain ? s.profit : c.ui.lossNet}</span>
            <div className="flex items-center gap-2">
              {statement.margin !== null && (
                <span className={cn("rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums", gain ? "text-emerald-700" : "text-red-700")}>
                  {c.stats.margin(formatPercent(statement.margin, locale))}
                </span>
              )}
              <span className={cn("text-lg font-bold tabular-nums", gain ? "text-emerald-700" : "text-red-700")}>{money(statement.profit)}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">{s.onlyCompleted}</p>
        </div>
      </section>

      <section className={CARD} aria-labelledby="acc-bank">
        <h2 id="acc-bank" className="font-semibold text-slate-900">{c.workbook.summary.bank}</h2>
        <p className="text-xs text-slate-500">{periodLabel}</p>
        <dl className="mt-4 space-y-2">
          <Line label={c.bank.moneyIn} value={bank.moneyIn} />
          <Line label={c.bank.moneyOut} value={bank.moneyOut} />
          <Line label={c.bank.net} value={bank.net} strong tone="auto" />
        </dl>
        <p className="mt-3 text-xs text-slate-500">{s.bankNote}</p>
      </section>
    </div>
  );
}
