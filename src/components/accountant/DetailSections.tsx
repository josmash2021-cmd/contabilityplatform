import { useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark, Receipt, Wallet, type LucideIcon } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { accountantCopy } from "@/i18n/copy/accountant";
import { receiptsCopy } from "@/i18n/copy/receipts";
import { formatDay } from "@/lib/accountantExport";
import type { AccountantPeriod, BankRow, ExpenseRow, SaleRow } from "../../../api/lib/accountant";
import { CARD, H3 } from "@/components/reports/ui";
import { BTN } from "./ui";
import { expenseCategoryLabel } from "./labels";

/** Rows drawn at first and per "show more", so long periods stay quick. */
const PAGE = 100;

type Column<R> = { key: string; label: string; numeric?: boolean; className?: string; cell: (r: R) => ReactNode; foot?: ReactNode };

/** One section: a table on wider screens, cards on phones, totals, "show more" and the truncation note. */
function Section<R extends { id: number }>(props: {
  caption: string;
  columns: ReadonlyArray<Column<R>>;
  rows: readonly R[];
  card: (r: R) => ReactNode;
  mobileTotals: ReadonlyArray<{ label: string; value: ReactNode }>;
  notes: string[];
  empty: { icon: LucideIcon; text: string };
}) {
  const c = useCopy(accountantCopy);
  const [limit, setLimit] = useState(PAGE);
  const visible = props.rows.slice(0, limit);
  const hasFoot = props.columns.some((col) => col.foot !== undefined);
  const remaining = props.rows.length - visible.length;

  return (
    <section className={cn(CARD, "space-y-3")} aria-label={props.caption}>
      <h2 className={H3}>{props.caption}</h2>
        {props.rows.length === 0 ? (
          <div className="py-8 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600" aria-hidden="true"><props.empty.icon className="h-6 w-6" /></span>
            <p className="mt-3 text-sm text-slate-500">{props.empty.text}</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-[14px] border border-slate-200 md:block">
              <Table>
                <TableCaption className="sr-only">{props.caption}</TableCaption>
                <TableHeader>
                  <TableRow className="bg-slate-100 hover:bg-slate-100">
                    {props.columns.map((col) => (
                      <TableHead key={col.key} scope="col" className={cn("h-9 px-4 text-xs font-semibold text-slate-500", col.numeric && "text-right", col.className)}>
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.id}>
                      {props.columns.map((col) => (
                        <TableCell key={col.key} className={cn("px-4 py-3 text-sm", col.numeric && "text-right tabular-nums", col.className)}>
                          {col.cell(r)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                {hasFoot && (
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      {props.columns.map((col) => (
                        <TableCell key={col.key} className={cn("px-4 text-sm font-[750]", col.numeric && "text-right tabular-nums", col.className)}>
                          {col.foot}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            <div className="md:hidden">
              <ul aria-label={props.caption} className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <li key={r.id} className="py-3">{props.card(r)}</li>
                ))}
              </ul>
              <dl className="mt-1 space-y-1 border-t border-slate-200 pt-3">
                {props.mobileTotals.map((t) => (
                  <div key={t.label} className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                    <dt className="min-w-0 text-slate-900">{t.label}</dt>
                    <dd className="shrink-0 tabular-nums">{t.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {remaining > 0 && (
              <div className="flex flex-col items-center gap-2 pt-1 sm:flex-row sm:justify-between">
                <p className="text-xs text-slate-500">{c.shown(visible.length, props.rows.length)}</p>
                <button
                  type="button"
                  className={cn(BTN.secondary, "w-full sm:w-auto")}
                  onClick={() => setLimit((n) => n + PAGE * 2)}
                >
                  {c.showMore(Math.min(remaining, PAGE * 2))}
                </button>
              </div>
            )}
          </>
        )}
        {props.notes.map((n) => (
          <p key={n} className="text-xs text-slate-500">{n}</p>
        ))}
    </section>
  );
}

function statusClass(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "pending") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function SalesSection({ data, locale }: { data: AccountantPeriod["sales"]; locale: string }) {
  const c = useCopy(accountantCopy);
  const t = c.sales;
  const method = (m: string) => c.methods[m] ?? m;
  const status = (r: SaleRow) => (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", statusClass(r.status))}>{c.statuses[r.status] ?? r.status}</span>
  );
  const amount = (r: SaleRow) => (
    <span className={r.status === "completed" ? "font-medium text-slate-900" : "text-slate-400 line-through"}>{formatCurrency(r.total)}</span>
  );
  const columns: Array<Column<SaleRow>> = [
    { key: "date", label: t.cols.date, className: "whitespace-nowrap", cell: (r) => formatDay(r.date, locale), foot: t.totalCompleted },
    { key: "invoice", label: t.cols.invoice, className: "whitespace-nowrap", cell: (r) => r.invoice },
    { key: "client", label: t.cols.client, cell: (r) => r.client ?? <span className="text-slate-400">{t.noClient}</span> },
    { key: "items", label: t.cols.items, className: "max-w-[16rem]", cell: (r) => <span className="line-clamp-2 text-slate-600">{r.items ?? "—"}</span> },
    { key: "method", label: t.cols.method, cell: (r) => method(r.method) },
    { key: "status", label: t.cols.status, cell: status },
    { key: "total", label: t.cols.total, numeric: true, cell: amount, foot: formatCurrency(data.completedTotal) },
  ];
  const notes: string[] = [];
  if (data.otherCount > 0) notes.push(t.otherNote(data.otherCount, formatCurrency(data.otherTotal)));
  if (data.truncated) notes.push(c.truncated(c.tabs.sales, data.rows.length, data.count));

  return (
    <Section
      caption={t.caption}
      columns={columns}
      rows={data.rows}
      notes={notes}
      empty={{ icon: Receipt, text: t.empty }}
      mobileTotals={[{ label: t.totalCompleted, value: formatCurrency(data.completedTotal) }]}
      card={(r) => (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 break-words text-sm font-medium text-slate-900">{r.client ?? t.noClient}</p>
            <span className="shrink-0 text-sm tabular-nums">{amount(r)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{formatDay(r.date, locale)}</span>
            <span aria-hidden="true">·</span>
            <span>{r.invoice}</span>
            <span aria-hidden="true">·</span>
            <span>{method(r.method)}</span>
            {status(r)}
          </div>
          {r.items && <p className="line-clamp-2 break-words text-xs text-slate-500">{r.items}</p>}
        </div>
      )}
    />
  );
}

function ExpensesSection({ data, locale }: { data: AccountantPeriod["expenses"]; locale: string }) {
  const c = useCopy(accountantCopy);
  const t = c.expenses;
  const rc = useCopy(receiptsCopy);
  const category = (r: ExpenseRow) => expenseCategoryLabel(r.category, c, rc);
  const method = (m: string) => c.methods[m] ?? m;
  const columns: Array<Column<ExpenseRow>> = [
    { key: "date", label: t.cols.date, className: "whitespace-nowrap", cell: (r) => formatDay(r.date, locale), foot: t.total },
    { key: "description", label: t.cols.description, cell: (r) => <span className="break-words">{r.description}</span> },
    { key: "category", label: t.cols.category, cell: category },
    { key: "method", label: t.cols.method, cell: (r) => method(r.method) },
    { key: "amount", label: t.cols.amount, numeric: true, cell: (r) => <span className="font-medium text-slate-900">{formatCurrency(r.amount)}</span>, foot: formatCurrency(data.total) },
  ];
  const notes = data.truncated ? [c.truncated(c.tabs.expenses, data.rows.length, data.count)] : [];

  return (
    <Section
      caption={t.caption}
      columns={columns}
      rows={data.rows}
      notes={notes}
      empty={{ icon: Wallet, text: t.empty }}
      mobileTotals={[{ label: t.total, value: formatCurrency(data.total) }]}
      card={(r) => (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 break-words text-sm font-medium text-slate-900">{r.description}</p>
            <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900">{formatCurrency(r.amount)}</span>
          </div>
          <p className="text-xs text-slate-500">
            {formatDay(r.date, locale)} · {category(r)} · {method(r.method)}
          </p>
        </div>
      )}
    />
  );
}

function BankSection({ data, locale }: { data: AccountantPeriod["bank"]; locale: string }) {
  const c = useCopy(accountantCopy);
  const t = c.bank;
  const category = (r: BankRow) => c.bankCategories[r.category] ?? r.category;
  const columns: Array<Column<BankRow>> = [
    { key: "date", label: t.cols.date, className: "whitespace-nowrap", cell: (r) => formatDay(r.date, locale), foot: t.total },
    { key: "description", label: t.cols.description, cell: (r) => <span className="break-words">{r.description}</span> },
    { key: "category", label: t.cols.category, cell: category },
    { key: "account", label: t.cols.account, cell: (r) => r.account ?? "—" },
    { key: "in", label: t.cols.moneyIn, numeric: true, cell: (r) => (r.type === "income" ? <span className="font-semibold text-emerald-700">+{formatCurrency(r.amount)}</span> : ""), foot: formatCurrency(data.moneyIn) },
    { key: "out", label: t.cols.moneyOut, numeric: true, cell: (r) => (r.type === "expense" ? <span className="font-semibold text-red-700">−{formatCurrency(r.amount)}</span> : ""), foot: formatCurrency(data.moneyOut) },
  ];
  const notes = [c.statement.bankNote];
  if (data.truncated) notes.push(c.truncated(c.tabs.bank, data.rows.length, data.count));

  return (
    <Section
      caption={t.caption}
      columns={columns}
      rows={data.rows}
      notes={notes}
      empty={{ icon: Landmark, text: t.empty }}
      mobileTotals={[
        { label: t.moneyIn, value: formatCurrency(data.moneyIn) },
        { label: t.moneyOut, value: formatCurrency(data.moneyOut) },
      ]}
      card={(r) => {
        const isIn = r.type === "income";
        const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
        return (
          <div className="flex items-start gap-3">
            <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full", isIn ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-medium text-slate-900">{r.description}</p>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", isIn ? "text-emerald-700" : "text-red-700")}>
                  <span className="sr-only">{isIn ? t.cols.moneyIn : t.cols.moneyOut}: </span>
                  {isIn ? "+" : "−"}{formatCurrency(r.amount)}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {formatDay(r.date, locale)} · {category(r)}{r.account ? ` · ${r.account}` : ""}
              </p>
            </div>
          </div>
        );
      }}
    />
  );
}

/** Ventas, gastos y banco del periodo, one tab each. */
export function DetailSections({ data }: { data: AccountantPeriod }) {
  const c = useCopy(accountantCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const [tab, setTab] = useState("sales");
  const tabs = [
    { key: "sales", label: c.tabs.sales, count: data.sales.count },
    { key: "expenses", label: c.tabs.expenses, count: data.expenses.count },
    { key: "bank", label: c.tabs.bank, count: data.bank.count },
  ];
  // A new period starts each list from its first page.
  const periodKey = `${data.period.startDate}_${data.period.endDate}`;

  return (
    <div className="space-y-3.5">
      <div role="tablist" aria-label={c.tabs.label} className="flex gap-6 overflow-x-auto border-b border-slate-200 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`acc-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`acc-panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className="group relative inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap pb-3 pt-2.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 aria-selected:text-slate-900 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:scale-x-0 after:rounded-sm after:bg-blue-600 after:transition-transform aria-selected:after:scale-x-100"
          >
            {t.label}
            <span className="min-w-5 rounded-full bg-slate-100 px-1.5 py-px text-center text-[11px] font-bold tabular-nums text-slate-500 group-aria-selected:bg-blue-50 group-aria-selected:text-blue-600">{t.count.toLocaleString(locale)}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`acc-panel-${tab}`} aria-labelledby={`acc-tab-${tab}`}>
        {tab === "sales" && <SalesSection key={periodKey} data={data.sales} locale={locale} />}
        {tab === "expenses" && <ExpensesSection key={periodKey} data={data.expenses} locale={locale} />}
        {tab === "bank" && <BankSection key={periodKey} data={data.bank} locale={locale} />}
      </div>
    </div>
  );
}
