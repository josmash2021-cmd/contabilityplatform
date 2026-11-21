// Excel download and display helpers for "Para tu contador" (src/pages/Accountant.tsx).
// The sheets are shaped in api/lib/accountant.ts (pure, tested); this file only turns
// them into SheetJS cells. SheetJS is loaded when the button is clicked, so it stays out
// of the page's bundle.
import type { WorkSheet } from "xlsx";
import type { AccountantCopy } from "@/i18n/copy/accountant";
import {
  buildWorkbookSheets,
  toXlsxCell,
  workbookFileName,
  type AccountantPeriod,
  type DateRange,
  type WorkbookLabels,
} from "../../api/lib/accountant";

/** The workbook's words, taken from the page copy in the person's language. */
export function workbookLabels(c: AccountantCopy): WorkbookLabels {
  const s = c.workbook.summary;
  return {
    sheets: c.workbook.sheets,
    summary: {
      ...s,
      salesCompleted: c.statement.salesCompleted,
      onlyCompleted: c.statement.onlyCompleted,
      bankNote: c.statement.bankNote,
      truncated: c.truncated,
    },
    sales: { ...c.sales.cols, totalCompleted: c.sales.totalCompleted },
    expenses: { ...c.expenses.cols, total: c.expenses.total },
    bank: {
      date: c.bank.cols.date,
      description: c.bank.cols.description,
      category: c.bank.cols.category,
      account: c.bank.cols.account,
      moneyIn: c.bank.cols.moneyIn,
      moneyOut: c.bank.cols.moneyOut,
      total: c.bank.total,
    },
    uncategorized: c.uncategorized,
    methods: c.methods,
    statuses: c.statuses,
    bankCategories: c.bankCategories,
  };
}

/** Builds the workbook in the browser and saves it as e.g. "Contabilidad_2026-11.xlsx". */
export async function downloadAccountantWorkbook(args: {
  data: AccountantPeriod;
  copy: AccountantCopy;
  company: string | null;
  periodLabel: string;
  dataAsOf: string;
}): Promise<string> {
  const { data, copy } = args;
  const XLSX = await import("xlsx");
  const sheets = buildWorkbookSheets(data, workbookLabels(copy), {
    company: args.company,
    periodLabel: args.periodLabel,
    dataAsOf: args.dataAsOf,
  });

  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws: WorkSheet = {};
    let lastCol = 0;
    sheet.rows.forEach((row, r) => {
      row.forEach((value, col) => {
        const cell = toXlsxCell(value, copy.workbook.dateFormat);
        if (!cell) return;
        ws[XLSX.utils.encode_cell({ r, c: col })] = cell;
        lastCol = Math.max(lastCol, col);
      });
    });
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(sheet.rows.length - 1, 0), c: lastCol } });
    ws["!cols"] = sheet.widths.map((wch) => ({ wch }));
    if (sheet.filter) {
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: sheet.filter.headerRow, c: 0 },
          e: { r: sheet.filter.lastRow, c: sheet.filter.columns - 1 },
        }),
      };
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  wb.Props = { Title: copy.workbook.summary.title, Company: args.company ?? undefined };

  const fileName = workbookFileName(copy.workbook.fileBase, data.period, copy.workbook.quarterLetter);
  XLSX.writeFile(wb, fileName, { bookType: "xlsx", compression: true });
  return fileName;
}

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
