// The files for "Para tu contador" (src/pages/Accountant.tsx): a real PDF and a styled Excel workbook of the
// period's books, drawn with the same engine as Reportes' Exportar (src/components/reports/export/*), so both
// screens preview and download the same way. Data: accountant.period (api/accountant-router.ts).
import type { AccountantCopy } from "@/i18n/copy/accountant";
import type { ReceiptsCopy } from "@/i18n/copy/receipts";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import { expenseCategoryLabel } from "@/components/accountant/labels";
import { layoutPdf, money, type PdfKpi, type PdfRow, type PdfSection } from "@/components/reports/export/model";
import type { CellInput, SheetSpec } from "@/components/reports/export/xlsx";
import type { ExportDoc } from "@/components/reports/ExportDialog";
import { workbookFileName, type AccountantPeriod, type DateRange } from "../../api/lib/accountant";

/** "2026-11-21" → "21 nov 2026" in the person's language (no time zone shifts). */
export function formatDay(iso: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatPeriod(range: DateRange, locale: string, join: (from: string, to: string) => string): string {
  return join(formatDay(range.startDate, locale), formatDay(range.endDate, locale));
}

export function formatPercent(fraction: number, locale: string): string {
  return fraction.toLocaleString(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const neg = (n: number) => money(-Math.abs(n));

/** The Contador export: PDF pages and Excel sheets of the period, from accountant.period. */
export function accountantDoc(args: {
  data: AccountantPeriod;
  c: AccountantCopy;
  rc: ReceiptsCopy;
  rp: ReportesCopy;
  company: string;
  companyLine: string | null;
  periodLabel: string;
  dataAsOf: string;
  locale: string;
}): ExportDoc {
  const { data, c, rc, rp, locale } = args;
  const s = data.incomeStatement;
  const W = c.workbook.summary;
  const day = (iso: string) => formatDay(iso, locale);
  const cat = (k: string) => expenseCategoryLabel(k, c, rc);
  const method = (m: string) => c.methods[m] ?? m;
  const status = (x: string) => c.statuses[x] ?? x;
  const bankCat = (x: string) => c.bankCategories[x] ?? x;
  const margin = s.margin !== null ? formatPercent(s.margin, locale) : null;

  // ── PDF ──
  const kpis: PdfKpi[] = [
    { label: c.stats.income, value: money(s.income), line: c.ui.salesCount(s.salesCount), good: null, accent: false },
    { label: c.stats.expenses, value: money(s.totalExpenses), line: c.ui.expenseCount(s.expensesCount), good: null, accent: false },
    { label: s.profit >= 0 ? c.stats.profit : c.ui.loss, value: money(s.profit), line: margin ? c.stats.margin(margin) : c.ui.noMargin, good: s.profit >= 0, accent: s.profit >= 0 },
    { label: c.stats.bank, value: `${data.bank.net > 0 ? "+" : ""}${money(data.bank.net)}`, line: c.ui.bankSub(money(data.bank.moneyIn), money(data.bank.moneyOut)), good: null, accent: false },
  ];
  const statement: PdfRow[] = [
    { c: [c.statement.salesCompleted(s.salesCount), money(s.income)] },
    { bold: true, c: [c.statement.totalIncome, money(s.income)] },
    ...(s.expenseLines.length ? s.expenseLines.map((l) => ({ c: [cat(l.category), neg(l.total)] })) : [{ c: [c.statement.noExpenses, neg(0)] }]),
    { bold: true, c: [c.statement.totalExpenses, neg(s.totalExpenses)] },
    { total: true, c: [s.profit >= 0 ? c.statement.profit : c.ui.lossNet, money(s.profit)] },
    ...(margin ? [{ c: [c.statement.margin, margin] }] : []),
  ];
  const sales = data.sales;
  const salesRows: PdfRow[] = sales.rows.length ? [
    ...sales.rows.map((r) => ({ c: [day(r.date), r.invoice, r.client ?? c.sales.noClient, method(r.method), status(r.status), money(r.total)], red: r.status === "completed" ? undefined : 4 })),
    { total: true, c: [c.sales.totalCompleted, "", "", "", "", money(sales.completedTotal)] },
  ] : [];
  const exp = data.expenses;
  const expRows: PdfRow[] = exp.rows.length ? [
    ...exp.rows.map((r) => ({ c: [day(r.date), r.description, cat(r.category), method(r.method), money(r.amount)] })),
    { total: true, c: [c.expenses.total, "", "", "", money(exp.total)] },
  ] : [];
  const bank = data.bank;
  const bankRows: PdfRow[] = bank.rows.length ? [
    ...bank.rows.map((r) => ({ c: [day(r.date), r.description, bankCat(r.category), r.type === "income" ? money(r.amount) : "", r.type === "expense" ? neg(r.amount) : ""] })),
    { total: true, c: [c.bank.total, "", "", money(bank.moneyIn), neg(bank.moneyOut)] },
  ] : [];
  const notes = (xs: string[]): PdfSection[] => xs.map((text) => ({ kind: "note", text }));
  const sections: PdfSection[] = [
    { kind: "table", title: c.statement.title, sub: args.periodLabel, cols: [{ h: W.concept, w: 0.72 }, { h: W.amount, w: 0.28, right: true }], rows: statement },
    ...notes([c.statement.onlyCompleted]),
    { kind: "table", title: W.bank, cols: [{ h: W.concept, w: 0.72 }, { h: W.amount, w: 0.28, right: true }], rows: [
      { c: [W.bankIn, money(bank.moneyIn)] }, { c: [W.bankOut, neg(bank.moneyOut)] }, { total: true, c: [W.bankNet, money(bank.net)] },
    ] },
    ...notes([c.statement.bankNote]),
    { kind: "table", breakBefore: true, title: c.sales.caption, cols: [{ h: c.sales.cols.date, w: 0.13 }, { h: c.sales.cols.invoice, w: 0.21 }, { h: c.sales.cols.client, w: 0.22 }, { h: c.sales.cols.method, w: 0.12 }, { h: c.sales.cols.status, w: 0.14 }, { h: c.sales.cols.total, w: 0.18, right: true }], rows: salesRows, empty: c.sales.empty },
    ...notes([
      ...(sales.otherCount > 0 ? [c.sales.otherNote(sales.otherCount, money(sales.otherTotal))] : []),
      ...(sales.truncated ? [c.truncated(c.tabs.sales, sales.rows.length, sales.count)] : []),
    ]),
    { kind: "table", title: c.expenses.caption, cols: [{ h: c.expenses.cols.date, w: 0.13 }, { h: c.expenses.cols.description, w: 0.35 }, { h: c.expenses.cols.category, w: 0.2 }, { h: c.expenses.cols.method, w: 0.13 }, { h: c.expenses.cols.amount, w: 0.19, right: true }], rows: expRows, empty: c.expenses.empty },
    ...notes(exp.truncated ? [c.truncated(c.tabs.expenses, exp.rows.length, exp.count)] : []),
    { kind: "table", title: c.bank.caption, cols: [{ h: c.bank.cols.date, w: 0.13 }, { h: c.bank.cols.description, w: 0.37 }, { h: c.bank.cols.category, w: 0.18 }, { h: c.bank.cols.moneyIn, w: 0.16, right: true }, { h: c.bank.cols.moneyOut, w: 0.16, right: true }], rows: bankRows, empty: c.bank.empty },
    ...notes(bank.truncated ? [c.truncated(c.tabs.bank, bank.rows.length, bank.count)] : []),
  ];
  const pages = layoutPdf(
    { company: args.company, companyLine: args.companyLine, title: W.title, generated: `${args.periodLabel} · ${c.dataAsOf(args.dataAsOf)}` },
    kpis, sections, { footer: rp.file.footer, page: rp.file.page, cont: rp.file.cont },
  );

  // ── Excel ──
  const sub = `${args.company} · ${args.periodLabel} · ${c.dataAsOf(args.dataAsOf)}`;
  const moneyCols = [{ h: W.concept }, { h: W.amount, t: "money" as const }];
  const first = 5; // title, subtitle, blank row, header
  const lastSale = first + sales.rows.length - 1;
  const completedLabel = status("completed");
  const sheets: SheetSpec[] = [
    {
      name: c.workbook.sheets.summary, title: W.title, sub, widths: [44, 18], blocks: [
        { sub: W.income, cols: moneyCols, rows: [{ c: [c.statement.salesCompleted(s.salesCount), s.income] }, { total: true, key: "inc", c: [W.totalIncome, { sum: true, v: s.income }] }] },
        { sub: W.expenses, cols: moneyCols, rows: [...s.expenseLines.map((l) => ({ c: [cat(l.category), l.total] as CellInput[] })), { total: true, key: "gas", c: [W.totalExpenses, { sum: true, v: s.totalExpenses }] }] },
        { sub: W.profit, cols: moneyCols, rows: [{ total: true, key: "net", c: [s.profit >= 0 ? W.profit : c.ui.lossNet, { f: "B{inc}-B{gas}", v: s.profit }] }] },
        ...(s.margin !== null ? [{ cols: [{ h: W.margin }, { h: "%", t: "pct" as const }], rows: [{ c: [W.margin, { f: "IF(B{inc}=0,0,B{net}/B{inc})", v: s.margin }] as CellInput[] }] }] : []),
        { sub: W.bank, cols: moneyCols, rows: [{ c: [W.bankIn, bank.moneyIn] }, { c: [W.bankOut, bank.moneyOut] }, { total: true, c: [W.bankNet, { f: "B{r-2}-B{r-1}", v: bank.net }] }] },
      ],
    },
    {
      name: c.workbook.sheets.sales, title: c.sales.caption, sub, widths: [12, 24, 24, 30, 12, 13, 14], freeze: 4, blocks: [{
        filter: true,
        cols: [{ h: c.sales.cols.date, t: "date" }, { h: c.sales.cols.invoice }, { h: c.sales.cols.client }, { h: c.sales.cols.items }, { h: c.sales.cols.method }, { h: c.sales.cols.status }, { h: c.sales.cols.total, t: "money" }],
        rows: [
          ...sales.rows.map((r) => ({ c: [{ date: r.date }, r.invoice, r.client ?? "", r.items ?? "", method(r.method), status(r.status), r.total] as CellInput[], warn: r.status === "completed" ? undefined : 5 })),
          { total: true, c: [c.sales.totalCompleted, "", "", "", "", "", sales.rows.length ? { f: `SUMIF(F${first}:F${lastSale},"${completedLabel.replace(/"/g, '""')}",G${first}:G${lastSale})`, v: sales.completedTotal } : 0] },
        ],
      }],
    },
    {
      name: c.workbook.sheets.expenses, title: c.expenses.caption, sub, widths: [12, 34, 22, 12, 14], freeze: 4, blocks: [{
        filter: true,
        cols: [{ h: c.expenses.cols.date, t: "date" }, { h: c.expenses.cols.description }, { h: c.expenses.cols.category }, { h: c.expenses.cols.method }, { h: c.expenses.cols.amount, t: "money" }],
        rows: [
          ...exp.rows.map((r) => ({ c: [{ date: r.date }, r.description, cat(r.category), method(r.method), r.amount] as CellInput[] })),
          { total: true, c: [c.expenses.total, "", "", "", { sum: true, v: exp.total }] },
        ],
      }],
    },
    {
      name: c.workbook.sheets.bank, title: c.bank.caption, sub, widths: [12, 36, 20, 18, 14, 14], freeze: 4, blocks: [{
        filter: true,
        cols: [{ h: c.bank.cols.date, t: "date" }, { h: c.bank.cols.description }, { h: c.bank.cols.category }, { h: c.bank.cols.account }, { h: c.bank.cols.moneyIn, t: "money" }, { h: c.bank.cols.moneyOut, t: "money" }],
        rows: [
          ...bank.rows.map((r) => ({ c: [{ date: r.date }, r.description, bankCat(r.category), r.account ?? "", r.type === "income" ? r.amount : null, r.type === "expense" ? r.amount : null] as CellInput[] })),
          { total: true, c: [c.bank.total, "", "", "", { sum: true, v: bank.moneyIn }, { sum: true, v: bank.moneyOut }] },
        ],
      }],
    },
  ];

  const fileBase = workbookFileName(c.workbook.fileBase, data.period, c.workbook.quarterLetter).replace(/\.xlsx$/, "");
  return { pages, sheets, fileBase, pdfTitle: `${W.title} · ${args.periodLabel} · ${args.company}`, xlsxTitle: `${W.title} · ${args.periodLabel}`, author: args.company };
}
