// The prototype's building blocks as Tailwind classes, shared by the Reports page pieces.
import type { ReportPeriod } from "../../../api/lib/reportBooks";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import { receiptCategoryLabel, type ReceiptsCopy } from "@/i18n/copy/receipts";

/** A Gastos category ("supplies", "vendors"…) in words, as the Gastos page shows it. */
export function spendLabel(category: string, rc: ReceiptsCopy, c: ReportesCopy): string {
  if (!category) return c.where.uncategorized;
  if (category === "vendors") return c.where.vendors;
  return receiptCategoryLabel(rc, category);
}

export const CARD = "min-w-0 rounded-[14px] border border-slate-200 bg-white p-4";
export const H3 = "text-[15px] font-bold text-slate-900";
export const SUB = "mt-0.5 text-[13px] text-slate-500";
const BTN_BASE = "inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";
export const BTN = `${BTN_BASE} min-h-11 border-slate-200 bg-white px-3.5 py-2 text-slate-900 hover:bg-slate-100 sm:min-h-10`;
export const BTN_SM = `${BTN_BASE} min-h-11 border-slate-200 bg-white px-[11px] py-1.5 text-[13px] text-slate-900 hover:bg-slate-100 sm:min-h-[34px]`;
export const BTN_PRIMARY = `${BTN_BASE} min-h-11 border-blue-600 bg-blue-600 px-3.5 py-2 text-white hover:brightness-110 sm:min-h-10`;
export const BTN_LOCKED = `${BTN_BASE} min-h-11 border-dashed border-slate-200 bg-slate-100 px-3.5 py-2 text-slate-500 sm:min-h-10`;
/** Segmented control (.seg) and its buttons. */
export const SEG = "inline-grid max-w-full auto-cols-fr grid-flow-col rounded-xl border border-slate-200 bg-slate-100 p-[3px]";
export const SEG_BTN = "inline-flex min-h-10 items-center justify-center gap-1 whitespace-nowrap rounded-[9px] px-3.5 py-[7px] text-[13px] font-semibold text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 aria-pressed:bg-white aria-pressed:text-slate-900 aria-pressed:shadow-[0_1px_3px_rgba(11,18,32,0.14)] sm:min-h-0";
/** Statement table (.stmt). */
export const TH = "border-b border-slate-200 py-[9px] text-left text-xs font-semibold text-slate-500";
export const TD = "border-b border-slate-200 py-[9px] text-left";

/** "$1,234.56", with a real minus (−) for negatives. */
export function money(n: number): string {
  const c = Math.round(n * 100);
  return `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** "$24,580" (no cents) for the big numbers and the bars. */
export function money0(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? "−" : ""}$${Math.abs(r).toLocaleString("en-US")}`;
}

/** "2026-11-05" → "5 nov 2026" (no time zone shifts). */
export function dayLabel(iso: string, locale: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).toLocaleDateString(locale, opts).replace(/\./g, "");
}
/** "5 nov" for lists. */
export const shortDay = (iso: string, locale: string) => dayLabel(iso, locale, { day: "numeric", month: "short" });

const mPart = (iso: string) => Number(iso.slice(5, 7));
const yPart = (iso: string) => Number(iso.slice(0, 4));

/** The words for a period: its label ("Noviembre 2026"), what it's compared with ("octubre"), and the statement's column names. */
export function periodWords(p: ReportPeriod, c: ReportesCopy) {
  const { range, prev } = p;
  const label = p.kind === "month" ? c.period.month(yPart(range.startDate), mPart(range.startDate))
    : p.kind === "months" ? c.period.months(yPart(range.startDate), mPart(range.startDate), yPart(range.endDate), mPart(range.endDate))
    : p.kind === "ytd" ? c.period.ytd(yPart(range.endDate), mPart(range.endDate))
    : p.kind === "year" ? c.period.year(yPart(range.startDate))
    : p.kind === "day" ? c.period.day
    : c.period.week;
  const vs = p.kind === "month" ? c.period.vsMonth(mPart(prev.startDate))
    : p.kind === "months" ? c.period.vsMonths(mPart(prev.startDate), mPart(prev.endDate))
    : p.kind === "ytd" ? c.period.vsYtd(yPart(prev.endDate), mPart(prev.endDate))
    : p.kind === "year" ? c.period.vsYear(yPart(prev.startDate))
    : p.kind === "day" ? c.period.vsDay
    : c.period.vsWeek;
  const col = (r: { startDate: string; endDate: string }) => p.kind === "month" ? c.monthShort(mPart(r.startDate)).replace(/^./, (x) => x.toUpperCase())
    : p.kind === "year" || p.kind === "ytd" ? String(yPart(r.startDate))
    : p.kind === "months" ? `${c.monthShort(mPart(r.startDate))} – ${c.monthShort(mPart(r.endDate))}`
    : r.startDate === r.endDate ? r.startDate.slice(5).split("-").reverse().join("/") : `${r.startDate.slice(5).split("-").reverse().join("/")} – ${r.endDate.slice(5).split("-").reverse().join("/")}`;
  return { label, vs, curCol: col(range), prevCol: col(prev) };
}

/** Saves bytes as a file through the browser's normal download. */
export function saveFile(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

