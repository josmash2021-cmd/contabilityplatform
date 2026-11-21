import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { accountantCopy } from "@/i18n/copy/accountant";
import { formatPercent } from "@/lib/accountantExport";
import type { BankTotals, IncomeStatement } from "../../../api/lib/accountant";

const CARD = "border-neutral-200 rounded-xl shadow-none";

/** One row of a <dl>; `strong` rows are totals, drawn under a rule. */
function Line({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "income" | "expense" | "auto" }) {
  const color =
    tone === "income" ? "text-green-600"
    : tone === "expense" ? "text-red-500"
    : tone === "auto" ? (value >= 0 ? "text-green-600" : "text-red-500")
    : "text-black";
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", strong && "border-t border-neutral-200 pt-2 font-semibold")}>
      <dt className={cn("min-w-0 break-words", strong ? "text-black" : "text-neutral-600")}>{label}</dt>
      <dd className={cn("shrink-0 tabular-nums", strong ? color : "font-medium text-black")}>{formatCurrency(value)}</dd>
    </div>
  );
}

/** Estado de resultados del periodo (same rules as the Reports page) and the bank totals beside it. */
export function IncomeStatementCard({ statement, bank, periodLabel }: { statement: IncomeStatement; bank: BankTotals; periodLabel: string }) {
  const c = useCopy(accountantCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const s = c.statement;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className={cn(CARD, "lg:col-span-2")}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-black">{s.title}</CardTitle>
          <p className="text-[11px] text-neutral-400">{periodLabel}</p>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <section aria-label={s.income}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.income}</p>
            <dl className="space-y-2">
              <Line label={s.salesCompleted(statement.salesCount)} value={statement.income} />
              <Line label={s.totalIncome} value={statement.income} strong tone="income" />
            </dl>
          </section>
          <Separator />
          <section aria-label={s.expenses}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.expenses}</p>
            {statement.expenseLines.length === 0 && <p className="mb-2 text-sm text-neutral-400">{s.noExpenses}</p>}
            <dl className="space-y-2">
              {statement.expenseLines.map((l) => (
                <Line key={l.category} label={l.category || c.uncategorized} value={l.total} />
              ))}
              <Line label={s.totalExpenses} value={statement.totalExpenses} strong tone="expense" />
            </dl>
          </section>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-black">{s.profit}</span>
            <div className="flex items-center gap-2">
              {statement.margin !== null && (
                <Badge variant="outline" className={cn("text-[10px]", statement.margin >= 0 ? "border-green-200 text-green-600" : "border-red-200 text-red-500")}>
                  {c.stats.margin(formatPercent(statement.margin, locale))}
                </Badge>
              )}
              <span className={cn("text-sm font-bold tabular-nums", statement.profit >= 0 ? "text-green-600" : "text-red-500")}>
                {formatCurrency(statement.profit)}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-neutral-400">{s.onlyCompleted}</p>
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-black">{c.workbook.summary.bank}</CardTitle>
          <p className="text-[11px] text-neutral-400">{periodLabel}</p>
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          <dl className="space-y-2">
            <Line label={c.bank.moneyIn} value={bank.moneyIn} />
            <Line label={c.bank.moneyOut} value={bank.moneyOut} />
            <Line label={c.bank.net} value={bank.net} strong tone="auto" />
          </dl>
          <p className="text-[11px] text-neutral-400">{s.bankNote}</p>
        </CardContent>
      </Card>
    </div>
  );
}
