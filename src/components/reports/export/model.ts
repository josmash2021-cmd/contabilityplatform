// What goes in the exported report (PDF and Excel). The page builds one ExportModel from the server's
// numbers; the PDF pages and the Excel sheets are both drawn from it, and so are their previews.
// Pure (no React, no DOM): tested in api/lib/reportExport.test.ts.
import type { ReportesCopy } from "../../../i18n/copy/reportes";
import { change, keptPerHundred, type BalanceLine, type CashFlow } from "../../../../api/lib/reportBooks";
import { fit, PAGE_W, type Op, type Page, type Rgb } from "./pdf";
import type { CellInput, SheetSpec } from "./xlsx";

export type ExportModel = {
  company: string;
  /** City, state and phone under the name, when the business has them. */
  companyLine: string | null;
  periodLabel: string;
  /** The period it's compared with, as it reads after "vs" ("octubre"). */
  vsLabel: string;
  /** Short names for the statement's two columns ("Nov" / "Oct", or "2026" / "2025"). */
  curCol: string;
  prevCol: string;
  generatedOn: string;
  asOfLabel: string;
  openingLabel: string;
  fileBase: string;
  moneyIn: number;
  prevIn: number;
  moneyOut: number;
  prevOut: number;
  salesCount: number;
  /** Everything spent by category (Gastos' computation): the bars and the Resumen sheet. Names already in words. */
  categories: Array<{ name: string; total: number; prev: number }>;
  /** The income statement's expense lines: what the books record, by category. */
  booked: Array<{ name: string; total: number; prev: number }>;
  /** Business bank charges that count as spending but no expense records yet (shown as their own line). */
  unbookedBank: { total: number; prev: number };
  /** Every spending item of the period (the Gastos sheet). `paid` is the payment method or the bank account, in words. */
  expenses: Array<{ date: string; description: string; category: string; paid: string; receipt: boolean | null; amount: number }>;
  services: Array<{ name: string; total: number }>;
  /** Null when the plan doesn't include reports by client. */
  clients: Array<{ name: string; total: number }> | null;
  balance: {
    assets: BalanceLine[]; liabilities: BalanceLine[]; equity: BalanceLine[]; unclosedEarnings: number;
    totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean; difference: number;
  };
  cashFlow: CashFlow;
  ar: Array<{ number: string; client: string; issued: string | null; due: string | null; late: number; balance: number }>;
  ap: Array<{ vendor: string; what: string; due: string; amount: number; late: boolean }>;
};

/** "$1,234.56" with a real minus (−) for negatives (the PDF prints it as "-"). */
export function money(n: number): string {
  const c = Math.round(n * 100);
  const abs = (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${c < 0 ? "−" : ""}$${abs}`;
}
const neg = (n: number) => money(-Math.abs(n));
const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: readonly number[]) => Math.round(xs.reduce((s, x) => s + Math.round(x * 100), 0)) / 100;

/** "Taller López" → "TL". */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? w[0]?.[1] ?? "")).toUpperCase() || "PB";
}

/** "Taller López", "noviembre 2026" → "Taller-Lopez-reporte-noviembre-2026". */
export function fileBaseFor(company: string, word: string, period: string): string {
  const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return [clean(company), clean(word), clean(period).toLowerCase()].filter(Boolean).join("-") || "reporte";
}

// ── The statement lines, shared by the page's table, the PDF and the Excel file ──
export function statementRows(M: Pick<ExportModel, "moneyIn" | "prevIn" | "moneyOut" | "prevOut" | "booked" | "unbookedBank">, c: ReportesCopy) {
  return {
    income: [{ label: c.pro.pl.sales, cur: M.moneyIn, prev: M.prevIn }],
    expenses: [
      ...M.booked.map((x) => ({ label: c.pro.pl.expenseLine(x.name || c.where.uncategorized), cur: x.total, prev: x.prev, bank: false })),
      ...(M.unbookedBank.total !== 0 || M.unbookedBank.prev !== 0 ? [{ label: c.pro.pl.unbookedBank, cur: M.unbookedBank.total, prev: M.unbookedBank.prev, bank: true }] : []),
    ],
    totalIn: M.moneyIn,
    prevTotalIn: M.prevIn,
    totalOut: M.moneyOut,
    prevTotalOut: M.prevOut,
    net: r2(M.moneyIn - M.moneyOut),
    prevNet: r2(M.prevIn - M.prevOut),
  };
}

// ── PDF ──
export type PdfCol = { h: string; w: number; right?: boolean };
export type PdfRow = { c: string[]; bold?: boolean; total?: boolean; red?: number };
type Col = PdfCol;
type Row = PdfRow;
/** One block of the PDF: a table (paginated, header repeated), a bar list, or a line of text. */
export type PdfSection =
  | { kind: "table"; title: string; sub?: string; cols: Col[]; rows: Row[]; empty?: string; breakBefore?: boolean }
  | { kind: "bars"; title: string; sub?: string; bars: Array<[string, number]>; empty?: string; breakBefore?: boolean }
  | { kind: "note"; text: string; color?: Rgb };

const INK: Rgb = [15, 23, 42];
const MUTED: Rgb = [100, 116, 139];
const LINE: Rgb = [226, 232, 240];
const SOFT: Rgb = [241, 245, 249];
const ACC: Rgb = [37, 99, 235];
const GOOD: Rgb = [5, 150, 105];
const BAD: Rgb = [220, 38, 38];
const WHITE: Rgb = [255, 255, 255];
const L = 48;
const R = PAGE_W - 48;
const BOTTOM = 728;

export function pdfSections(M: ExportModel, c: ReportesCopy, day: (iso: string) => string): PdfSection[] {
  const s = statementRows(M, c);
  const pl: Row[] = [
    ...s.income.map((x) => ({ c: [x.label, money(x.cur), money(x.prev)] })),
    { bold: true, c: [c.pro.pl.totalIn, money(s.totalIn), money(s.prevTotalIn)] },
    ...(s.expenses.length ? s.expenses.map((x) => ({ c: [x.label, neg(x.cur), neg(x.prev)] })) : [{ c: [c.pro.pl.noExpenses, neg(0), neg(0)] }]),
    { bold: true, c: [c.pro.pl.totalOut, neg(s.totalOut), neg(s.prevTotalOut)] },
    { total: true, c: [s.net < 0 ? c.pro.pl.netLoss : c.pro.pl.net, money(s.net), money(s.prevNet)] },
  ];
  const b = M.balance;
  const lines = (xs: BalanceLine[]) => xs.length ? xs.map((a) => ({ c: [`${a.code ? a.code + " " : ""}${a.name}`, money(a.balance)] })) : [{ c: [c.pro.bs.nothing, money(0)] }];
  const bs: Row[] = [
    { bold: true, c: [c.pro.bs.have, ""] }, ...lines(b.assets), { bold: true, c: [c.pro.bs.total, money(b.totalAssets)] },
    { bold: true, c: [c.pro.bs.owe, ""] }, ...lines(b.liabilities), { bold: true, c: [c.pro.bs.total, money(b.totalLiabilities)] },
    { bold: true, c: [c.pro.bs.equity, ""] },
    ...b.equity.map((a) => ({ c: [`${a.code ? a.code + " " : ""}${a.name}`, money(a.balance)] })),
    ...(b.unclosedEarnings !== 0 || b.equity.length === 0 ? [{ c: [b.unclosedEarnings < 0 ? c.pro.bs.unclosedLoss : c.pro.bs.unclosed, money(b.unclosedEarnings)] }] : []),
    { bold: true, c: [c.pro.bs.total, money(b.totalEquity)] },
    { total: true, c: [`${c.pro.bs.owe} + ${c.file.capital}`, money(r2(b.totalLiabilities + b.totalEquity))] },
  ];
  const f = M.cashFlow;
  const cf: Row[] = [
    { c: [c.pro.cf.opening(M.openingLabel), money(f.opening)] },
    { c: [c.pro.cf.sales, money(f.fromSales)] },
    { c: [c.pro.cf.expenses, neg(f.expensesPaid)] },
    ...(f.otherIn ? [{ c: [c.pro.cf.otherIn, money(f.otherIn)] }] : []),
    ...(f.otherOut ? [{ c: [c.pro.cf.otherOut, neg(f.otherOut)] }] : []),
    { total: true, c: [c.pro.cf.closing(M.asOfLabel), money(f.closing)] },
  ];
  const arTotal = sum(M.ar.map((a) => a.balance));
  const ar: Row[] = M.ar.length ? [
    ...M.ar.map((a) => ({ c: [a.number, a.client, a.due ? day(a.due) : "—", c.pro.ar.lateDays(a.late), money(a.balance)], red: a.late > 0 ? 3 : undefined })),
    { total: true, c: [c.pro.ar.total, "", "", "", money(arTotal)] },
  ] : [];
  const apTotal = sum(M.ap.map((x) => x.amount));
  const ap: Row[] = M.ap.length ? [
    ...M.ap.map((x) => ({ c: [x.vendor, x.what, x.late ? `${day(x.due)} · ${c.pro.ap.overdue}` : day(x.due), money(x.amount)], red: x.late ? 2 : undefined })),
    { total: true, c: [c.pro.ap.total, "", "", money(apTotal)] },
  ] : [];
  const sections: PdfSection[] = [
    { kind: "table", title: c.pro.pl.title, sub: c.file.plSub(M.periodLabel, M.vsLabel), cols: [{ h: c.pro.account, w: 0.56 }, { h: M.curCol, w: 0.22, right: true }, { h: M.prevCol, w: 0.22, right: true }], rows: pl },
    { kind: "bars", title: c.file.barsTitle, sub: c.file.barsSub(M.periodLabel), bars: M.categories.filter((x) => x.total > 0).map((x) => [x.name || c.where.uncategorized, x.total]), empty: c.where.empty },
    { kind: "table", breakBefore: true, title: c.pro.bs.title(M.asOfLabel), sub: c.pro.bs.sub, cols: [{ h: c.pro.account, w: 0.7 }, { h: c.pro.amount, w: 0.3, right: true }], rows: bs },
  ];
  if (M.unbookedBank.total !== 0 || M.unbookedBank.prev !== 0) sections.splice(1, 0, { kind: "note", text: c.pro.pl.unbookedNote });
  if (b.unclosedEarnings !== 0) sections.push({ kind: "note", text: c.pro.bs.unclosedNote });
  if (!b.balanced) sections.push({ kind: "note", text: c.pro.bs.off(money(b.difference)), color: BAD });
  sections.push(
    { kind: "table", title: c.pro.cf.title(M.periodLabel), sub: c.pro.cf.note, cols: [{ h: c.pro.concept, w: 0.7 }, { h: c.pro.amount, w: 0.3, right: true }], rows: cf },
    { kind: "table", title: c.pro.ar.title, sub: c.pro.ar.sub, cols: [{ h: c.pro.ar.invoice, w: 0.17 }, { h: c.pro.ar.client, w: 0.28 }, { h: c.pro.ar.due, w: 0.16 }, { h: c.pro.ar.late, w: 0.2 }, { h: c.pro.ar.balance, w: 0.19, right: true }], rows: ar, empty: c.pro.ar.empty },
    { kind: "table", title: c.pro.ap.title, cols: [{ h: c.pro.ap.vendor, w: 0.28 }, { h: c.pro.ap.what, w: 0.34 }, { h: c.pro.ap.due, w: 0.2 }, { h: c.pro.ap.amount, w: 0.18, right: true }], rows: ap, empty: c.pro.ap.empty },
  );
  return sections;
}

/** A KPI box at the top of page 1: label, amount, a line under it (green when good, red when not, gray when null). */
export type PdfKpi = { label: string; value: string; line: string; good: boolean | null; accent: boolean };

export function pdfKpis(M: ExportModel, c: ReportesCopy): PdfKpi[] {
  const profit = r2(M.moneyIn - M.moneyOut);
  const prevProfit = r2(M.prevIn - M.prevOut);
  const line = (cur: number, prev: number, upGood: boolean) => {
    const ch = change(cur, prev, upGood);
    return { line: ch.pct === null ? c.kpi.noPrev(M.vsLabel) : c.kpi.vs(ch.pct, ch.dir, M.vsLabel), good: ch.good };
  };
  const per = keptPerHundred(M.moneyIn, profit);
  const kept = line(profit, prevProfit, true);
  return [
    { label: c.kpi.in, value: money(M.moneyIn), ...line(M.moneyIn, M.prevIn, true), accent: false },
    { label: c.kpi.out, value: money(M.moneyOut), ...line(M.moneyOut, M.prevOut, false), accent: false },
    { label: profit < 0 ? c.kpi.lost : c.kpi.kept, value: money(profit), line: per !== null && profit >= 0 ? `${kept.line} · ${c.kpi.per100(per)}` : kept.line, good: kept.good, accent: true },
  ];
}

/** The report's letter pages. The same pages become the PDF file and its preview. */
export function pdfPages(M: ExportModel, c: ReportesCopy, day: (iso: string) => string): Page[] {
  return layoutPdf(
    { company: M.company, companyLine: M.companyLine, title: c.file.title, generated: c.file.generated(M.periodLabel, M.generatedOn) },
    pdfKpis(M, c),
    pdfSections(M, c, day),
    { footer: c.file.footer, page: c.file.page, cont: c.file.cont },
  );
}

/**
 * Lays any report out on letter pages: the header on every page (business initials and name, title, period),
 * KPI boxes, then the sections; tables continue on a new page with their header repeated; footer with
 * "Página n de N". Used by Reportes and by Contador (src/lib/accountantExport.ts).
 */
export function layoutPdf(
  head: { company: string; companyLine: string | null; title: string; generated: string },
  kpis: readonly PdfKpi[],
  sections: readonly PdfSection[],
  words: { footer: string; page: (n: number, of: number) => string; cont: string },
): Page[] {
  const pages: Page[] = [];
  let ops: Op[] = [];
  let y = 0;
  const text = (s: string, x: number, yy: number, size: number, opts: { bold?: boolean; color?: Rgb; align?: "left" | "right" | "center" } = {}) =>
    ops.push({ k: "text", x, y: yy, s, size, bold: opts.bold, color: opts.color ?? INK, align: opts.align });
  const header = () => {
    ops.push({ k: "rect", x: L, y: 40, w: 34, h: 34, r: 7, fill: INK });
    text(initials(head.company), L + 17, 61.5, 12, { bold: true, color: WHITE, align: "center" });
    text(fit(head.company, 230, 14, true), L + 46, 54, 14, { bold: true });
    if (head.companyLine) text(fit(head.companyLine, 230, 9), L + 46, 68, 9, { color: MUTED });
    text(head.title, R, 54, 16, { bold: true, align: "right" });
    text(fit(head.generated, 250, 9), R, 68, 9, { color: MUTED, align: "right" });
    ops.push({ k: "line", x1: L, y1: 88, x2: R, y2: 88, color: LINE, lw: 0.75 });
    y = 116;
  };
  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    header();
  };
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage(); };

  newPage();
  // KPIs
  const kw = (R - L - 12 * (kpis.length - 1)) / Math.max(1, kpis.length);
  if (kpis.length === 0) y -= 74;
  kpis.forEach((k, i) => {
    const kx = L + i * (kw + 12);
    ops.push({ k: "rect", x: kx, y: y - 14, w: kw, h: 62, r: 6, stroke: LINE, lw: 0.75 });
    text(k.label, kx + 10, y + 1, 8.5, { color: MUTED });
    text(fit(k.value, kw - 20, 17, true), kx + 10, y + 22, 17, { bold: true, color: k.accent ? GOOD : INK });
    text(fit(k.line, kw - 20, 8.5), kx + 10, y + 37, 8.5, { color: k.good === null ? MUTED : k.good ? GOOD : BAD });
  });
  y += 74;

  const tableHead = (cols: Col[], widths: number[]) => {
    ops.push({ k: "rect", x: L, y: y - 12, w: R - L, h: 18, fill: SOFT });
    let x = L;
    cols.forEach((col, i) => {
      const label = fit(col.h.toUpperCase(), widths[i] - 12, 8, true);
      text(label, col.right ? x + widths[i] - 6 : x + 6, y, 8, { bold: true, color: MUTED, align: col.right ? "right" : "left" });
      x += widths[i];
    });
    y += 20;
  };
  const title = (sec: { title: string; sub?: string }, cont = false) => {
    text(cont ? `${sec.title} ${words.cont}` : sec.title, L, y, 12, { bold: true });
    if (sec.sub && !cont) { text(fit(sec.sub, R - L, 8.5), L, y + 13, 8.5, { color: MUTED }); y += 13; }
    y += 16;
  };

  for (const sec of sections) {
    if (sec.kind === "note") {
      ensure(16);
      text(fit(sec.text, R - L, 8.5), L, y - 6, 8.5, { color: sec.color ?? MUTED });
      y += 12;
      continue;
    }
    if (sec.breakBefore) newPage();
    if (sec.kind === "bars") {
      ensure(36 + Math.min(sec.bars.length, 2) * 20);
      title(sec);
      if (sec.bars.length === 0) { text(sec.empty ?? "", L, y, 9, { color: MUTED }); y += 22; continue; }
      const max = Math.max(...sec.bars.map((x) => x[1]));
      const tot = sum(sec.bars.map((x) => x[1]));
      for (const [label, v] of sec.bars) {
        ensure(20);
        text(fit(label, 140, 9), L, y, 9);
        ops.push({ k: "rect", x: L + 150, y: y - 7, w: 230, h: 8, r: 4, fill: SOFT });
        ops.push({ k: "rect", x: L + 150, y: y - 7, w: Math.max(8, (230 * v) / max), h: 8, r: 4, fill: ACC });
        text(money(v), R - 44, y, 9, { bold: true, align: "right" });
        text(`${tot > 0 ? Math.round((v / tot) * 100) : 0}%`, R, y, 9, { color: MUTED, align: "right" });
        y += 20;
      }
      y += 8;
      continue;
    }
    const widths = sec.cols.map((col) => col.w * (R - L));
    ensure(36 + 20 + 18 * Math.min(Math.max(sec.rows.length, 1), 3));
    title(sec);
    tableHead(sec.cols, widths);
    if (sec.rows.length === 0) {
      text(sec.empty ?? "", L + 6, y, 9, { color: MUTED });
      y += 26;
      continue;
    }
    for (const row of sec.rows) {
      if (y + 18 > BOTTOM) {
        newPage();
        title(sec, true);
        tableHead(sec.cols, widths);
      }
      if (row.total) ops.push({ k: "line", x1: L, y1: y - 12, x2: R, y2: y - 12, color: INK, lw: 0.9 });
      let x = L;
      row.c.forEach((v, i) => {
        const col = sec.cols[i];
        const bold = !!(row.bold || row.total || row.red === i);
        const size = row.total ? 10 : 9;
        const s = fit(v, widths[i] - 12, size, bold);
        text(s, col.right ? x + widths[i] - 6 : x + 6, y, size, { bold, color: row.red === i ? BAD : INK, align: col.right ? "right" : "left" });
        x += widths[i];
      });
      if (!row.total) ops.push({ k: "line", x1: L, y1: y + 6, x2: R, y2: y + 6, color: LINE, lw: 0.5 });
      y += 18;
    }
    y += 14;
  }
  pages.push(ops);

  // Footer on every page, now that we know how many there are.
  pages.forEach((p, i) => {
    p.push({ k: "line", x1: L, y1: 748, x2: R, y2: 748, color: LINE, lw: 0.5 });
    p.push({ k: "text", x: L, y: 762, s: fit(words.footer, R - L - 80, 8), size: 8, color: MUTED });
    p.push({ k: "text", x: R, y: 762, s: words.page(i + 1, pages.length), size: 8, color: MUTED, align: "right" });
  });
  return pages;
}

// ── Excel ──
const chg: (v: number) => CellInput = (v) => ({ f: "IF(C{r}=0,0,(B{r}-C{r})/ABS(C{r}))", v });
const ratio = (cur: number, prev: number) => (prev === 0 ? 0 : (cur - prev) / Math.abs(prev));

export function xlsxSheets(M: ExportModel, c: ReportesCopy): SheetSpec[] {
  const F = c.file;
  const sub = F.subLine(M.company, M.periodLabel, M.generatedOn);
  const s = statementRows(M, c);
  const profit = s.net;
  const prevProfit = s.prevNet;
  const money2 = [{ h: c.pro.account }, { h: M.curCol, t: "money" as const }, { h: M.prevCol, t: "money" as const }];
  const out = M.moneyOut;
  const cats = M.categories.filter((x) => x.total !== 0);
  const pctOf = (whole: number) => (v: number): CellInput => ({ f: whole ? `B{r}/${whole.toFixed(2)}` : "0", v: whole ? v / whole : 0 });
  const svcTotal = sum(M.services.map((x) => x.total));
  const cliTotal = M.clients ? sum(M.clients.map((x) => x.total)) : 0;
  const b = M.balance;
  const acct = (a: BalanceLine) => `${a.code ? a.code + " " : ""}${a.name}`;
  const equityRows = [
    ...b.equity.map((a) => ({ c: [acct(a), a.balance] as CellInput[] })),
    ...(b.unclosedEarnings !== 0 || b.equity.length === 0 ? [{ c: [b.unclosedEarnings < 0 ? c.pro.bs.unclosedLoss : c.pro.bs.unclosed, b.unclosedEarnings] as CellInput[] }] : []),
  ];
  const f = M.cashFlow;
  const cfRows: Array<{ c: CellInput[] }> = [
    { c: [c.pro.cf.opening(M.openingLabel), f.opening] },
    { c: [c.pro.cf.sales, f.fromSales] },
    { c: [c.pro.cf.expenses, -f.expensesPaid] },
    { c: [c.pro.cf.otherIn, f.otherIn] },
    { c: [c.pro.cf.otherOut, -f.otherOut] },
  ];

  const sheets: SheetSpec[] = [
    {
      name: F.sheets.summary, title: F.summaryTitle(M.periodLabel), sub, widths: [34, 16, 16, 12], blocks: [
        {
          cols: [{ h: c.pro.concept }, { h: M.curCol, t: "money" }, { h: M.prevCol, t: "money" }, { h: F.change, t: "pct" }], rows: [
            { c: [c.kpi.in, M.moneyIn, M.prevIn, chg(ratio(M.moneyIn, M.prevIn))] },
            { c: [c.kpi.out, M.moneyOut, M.prevOut, chg(ratio(M.moneyOut, M.prevOut))] },
            { total: true, c: [c.kpi.kept, { f: "B{r-2}-B{r-1}", v: profit }, { f: "C{r-2}-C{r-1}", v: prevProfit }, chg(ratio(profit, prevProfit))] },
          ],
        },
        {
          sub: F.barsTitle, cols: [{ h: F.category }, { h: c.pro.amount, t: "money" }, { h: F.pctTotal, t: "pct" }],
          rows: [
            ...cats.map((x) => ({ c: [x.name || c.where.uncategorized, x.total, pctOf(out)(x.total)] })),
            { total: true, c: [c.pro.ar.total, { sum: true, v: out }, pctOf(out)(out)] },
          ],
        },
      ],
    },
    {
      name: F.sheets.pl, title: F.plTitle(M.curCol, M.prevCol), sub, widths: [42, 16, 16], blocks: [
        { sub: F.income, cols: money2, rows: [...s.income.map((x) => ({ c: [x.label, x.cur, x.prev] as CellInput[] })), { total: true, key: "inc", c: [c.pro.pl.totalIn, { sum: true, v: s.totalIn }, { sum: true, v: s.prevTotalIn }] }] },
        { sub: F.expensesSub, cols: money2, rows: [...s.expenses.map((x) => ({ c: [x.label, x.cur, x.prev] as CellInput[] })), { total: true, key: "gas", c: [c.pro.pl.totalOut, { sum: true, v: s.totalOut }, { sum: true, v: s.prevTotalOut }] }] },
        { sub: F.result, cols: money2, rows: [{ total: true, c: [profit < 0 ? c.pro.pl.netLoss : c.pro.pl.net, { f: "B{inc}-B{gas}", v: profit }, { f: "C{inc}-C{gas}", v: prevProfit }] }] },
      ],
    },
    {
      name: F.sheets.expenses, title: F.expensesTitle(M.periodLabel), sub, widths: [12, 32, 22, 12, 10, 14], freeze: 4, blocks: [{
        filter: true,
        cols: [{ h: F.date, t: "date" }, { h: F.expense }, { h: F.category }, { h: F.method }, { h: F.receipt }, { h: c.pro.amount, t: "money" }],
        rows: [
          ...M.expenses.map((e) => ({ c: [{ date: e.date }, e.description, e.category || c.where.uncategorized, e.paid, e.receipt === null ? "—" : e.receipt ? F.yes : F.missing, e.amount] as CellInput[], warn: e.receipt === false ? 4 : undefined })),
          { total: true, c: [c.pro.ar.total, "", "", "", "", { sum: true, v: sum(M.expenses.map((e) => e.amount)) }] },
        ],
      }],
    },
    {
      name: F.sheets.income, title: F.incomeTitle(M.periodLabel), sub, widths: [32, 16, 12], blocks: [
        {
          sub: F.byService, cols: [{ h: F.service }, { h: c.pro.amount, t: "money" }, { h: F.pctTotal, t: "pct" }],
          rows: [...M.services.map((x) => ({ c: [x.name, x.total, pctOf(svcTotal)(x.total)] as CellInput[] })), { total: true, c: [c.pro.ar.total, { sum: true, v: svcTotal }, pctOf(svcTotal)(svcTotal)] }],
        },
        ...(M.clients ? [{
          sub: F.byClient, cols: [{ h: F.client }, { h: c.pro.amount, t: "money" as const }, { h: F.pctTotal, t: "pct" as const }],
          rows: [...M.clients.map((x) => ({ c: [x.name, x.total, pctOf(cliTotal)(x.total)] as CellInput[] })), { total: true, c: [c.pro.ar.total, { sum: true as const, v: cliTotal }, pctOf(cliTotal)(cliTotal)] as CellInput[] }],
        }] : []),
      ],
    },
    {
      name: F.sheets.ar, title: c.pro.ar.title, sub, widths: [22, 26, 12, 12, 15, 14], freeze: 4, blocks: [{
        filter: true,
        cols: [{ h: c.pro.ar.invoice }, { h: c.pro.ar.client }, { h: F.issued, t: "date" }, { h: c.pro.ar.due, t: "date" }, { h: F.daysLate, t: "int" }, { h: c.pro.ar.balance, t: "money" }],
        rows: [
          ...M.ar.map((a) => ({ c: [a.number, a.client, a.issued ? { date: a.issued } : null, a.due ? { date: a.due } : null, Math.max(0, a.late), a.balance] as CellInput[], warn: a.late > 0 ? 4 : undefined })),
          { total: true, c: [c.pro.ar.total, "", "", "", "", { sum: true, v: sum(M.ar.map((a) => a.balance)) }] },
        ],
      }],
    },
    {
      name: F.sheets.ap, title: c.pro.ap.title, sub, widths: [24, 32, 12, 14, 12], freeze: 4, blocks: [{
        filter: true,
        cols: [{ h: c.pro.ap.vendor }, { h: c.pro.ap.what }, { h: c.pro.ap.due, t: "date" }, { h: c.pro.ap.amount, t: "money" }, { h: c.pro.ap.state }],
        rows: [
          ...M.ap.map((x) => ({ c: [x.vendor, x.what, { date: x.due }, x.amount, x.late ? c.pro.ap.late : c.pro.ap.toPay] as CellInput[], warn: x.late ? 4 : undefined })),
          { total: true, c: [c.pro.ap.total, "", "", { sum: true, v: sum(M.ap.map((x) => x.amount)) }, ""] },
        ],
      }],
    },
    {
      name: F.sheets.bs, title: c.pro.bs.title(M.asOfLabel), sub, widths: [44, 16], blocks: [
        { sub: c.pro.bs.have, cols: [{ h: c.pro.account }, { h: c.pro.amount, t: "money" }], rows: [...b.assets.map((a) => ({ c: [acct(a), a.balance] as CellInput[] })), { total: true, key: "act", c: [c.pro.bs.total, { sum: true, v: b.totalAssets }] }] },
        { sub: c.pro.bs.owe, cols: [{ h: c.pro.account }, { h: c.pro.amount, t: "money" }], rows: [...b.liabilities.map((a) => ({ c: [acct(a), a.balance] as CellInput[] })), { total: true, key: "pas", c: [c.pro.bs.total, { sum: true, v: b.totalLiabilities }] }] },
        { sub: c.pro.bs.equity, cols: [{ h: c.pro.account }, { h: c.pro.amount, t: "money" }], rows: [...equityRows, { total: true, key: "cap", c: [c.pro.bs.total, { sum: true, v: b.totalEquity }] }] },
        { sub: c.pro.bs.check, cols: [{ h: c.pro.concept }, { h: c.pro.amount, t: "money" }], rows: [
          { c: [c.pro.bs.have, { f: "B{act}", v: b.totalAssets }] },
          { total: true, c: [`${c.pro.bs.owe} + ${F.capital}`, { f: "B{pas}+B{cap}", v: r2(b.totalLiabilities + b.totalEquity) }] },
        ] },
      ],
    },
    {
      name: F.sheets.cf, title: c.pro.cf.title(M.periodLabel), sub, widths: [46, 16], blocks: [
        { cols: [{ h: c.pro.concept }, { h: c.pro.amount, t: "money" }], rows: [...cfRows, { total: true, c: [c.pro.cf.closing(M.asOfLabel), { sum: true, v: f.closing }] }] },
      ],
    },
  ];
  return sheets;
}

/** For tests and checks: every number a PDF page prints. */
export function pageTexts(p: Page): string[] {
  return p.filter((o): o is Extract<Op, { k: "text" }> => o.k === "text").map((o) => o.s);
}

