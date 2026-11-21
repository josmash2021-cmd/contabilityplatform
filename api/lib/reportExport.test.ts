// The exported report (src/components/reports/export/*): the PDF and the Excel file carry the same
// totals as the page, the PDF is a real PDF (parsed back), and the Excel totals are real formulas.
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { PDFParse } from "pdf-parse";
import { reportesCopy } from "../../src/i18n/copy/reportes";
import { fileBaseFor, initials, money, pdfPages, xlsxSheets, type ExportModel } from "../../src/components/reports/export/model";
import { fit, measure, printable, renderPdf } from "../../src/components/reports/export/pdf";
import { colName, excelSerial, layoutWorkbook, sheetName, writeXlsx, type CfbLike } from "../../src/components/reports/export/xlsx";
import { buildBalanceSheet, buildCashFlow } from "./reportBooks";

const c = reportesCopy.es;
const day = (iso: string) => iso.split("-").reverse().join("/");

function model(over: Partial<ExportModel> = {}): ExportModel {
  return {
    company: "Taller López", companyLine: "Houston, TX · (555) 100-2000", periodLabel: "Noviembre 2026", vsLabel: "octubre",
    curCol: "Nov", prevCol: "Oct", generatedOn: "21 nov 2026", asOfLabel: "30 nov 2026", openingLabel: "1 nov 2026", fileBase: "x",
    moneyIn: 24580, prevIn: 22550, moneyOut: 9135.4, prevOut: 9418, salesCount: 40,
    categories: [{ name: "Materiales", total: 4210.4, prev: 4480 }, { name: "Nómina", total: 3600, prev: 3600 }, { name: "Gasolina", total: 1325, prev: 1338 }],
    booked: [{ name: "Materiales", total: 4210.4, prev: 4480 }, { name: "Nómina", total: 3600, prev: 3600 }, { name: "Gasolina", total: 1200, prev: 1338 }],
    unbookedBank: { total: 125, prev: 0 },
    expenses: [
      { date: "2026-11-03", description: "Home Depot", category: "Materiales", paid: "Tarjeta", receipt: true, amount: 4210.4 },
      { date: "2026-11-15", description: "Nómina quincena", category: "Nómina", paid: "Zelle", receipt: false, amount: 3600 },
      { date: "2026-11-18", description: "Shell", category: "Gasolina", paid: "Efectivo", receipt: true, amount: 1200 },
      { date: "2026-11-19", description: "Shell", category: "Gasolina", paid: "Chase ••4410", receipt: null, amount: 125 },
    ],
    services: [{ name: "Afinación completa", total: 15000 }, { name: "Frenos (par)", total: 9580 }],
    clients: [{ name: "María González", total: 20000 }, { name: "Sin cliente", total: 4580 }],
    balance: buildBalanceSheet([
      { accountId: 1, code: "1110", name: "Caja / Efectivo", type: "asset", debit: 30000, credit: 9135.4 },
      { accountId: 2, code: "4100", name: "Ingresos", type: "revenue", debit: 0, credit: 24580 },
      { accountId: 3, code: "5100", name: "Gastos", type: "expense", debit: 9135.4, credit: 0 },
      { accountId: 4, code: "3110", name: "Capital Social", type: "equity", debit: 0, credit: 5420 },
    ]),
    cashFlow: buildCashFlow(5420, []),
    ar: Array.from({ length: 40 }, (_, i) => ({ number: `FAC-${1000 + i}`, client: `Cliente ${i}`, issued: "2026-10-01", due: "2026-10-15", late: 37, balance: 100 })),
    ap: [{ vendor: "AutoZone", what: "Refacciones", due: "2026-11-10", amount: 520.5, late: true }],
    ...over,
  };
}

const textOfPdf = async (bytes: Uint8Array) => {
  const parser = new PDFParse({ data: bytes });
  const r = await parser.getText();
  await parser.destroy();
  return r.text;
};

describe("PDF", () => {
  it("is a real PDF whose text has the period's totals, accents and page numbers", async () => {
    const M = model();
    const pages = pdfPages(M, c, day);
    expect(pages.length).toBeGreaterThanOrEqual(3); // 40 invoices push the report past two pages
    const bytes = renderPdf(pages, { title: "Reporte", author: M.company, creator: "PBS", created: new Date("2026-11-21T12:00:00Z") });
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe("%PDF-1.4");
    const text = await textOfPdf(bytes);
    expect(text).toContain("Taller López");
    expect(text).toContain("$24,580.00");
    expect(text).toContain("$9,135.40");
    expect(text).toContain("$15,444.60"); // te quedó
    expect(text).toContain("Utilidad neta");
    expect(text).toContain("Cargos del banco sin registrar");
    expect(text).toContain("$125.00");
    expect(text).toContain("¿En qué se fue el dinero?");
    expect(text).toContain("$4,000.00"); // 40 × $100 owed
    expect(text).toContain(`Página 1 de ${pages.length}`);
    expect(text).toContain(`Página ${pages.length} de ${pages.length}`);
    expect(text).toContain("Quién te debe y desde cuándo (continúa)");
  });
  it("the balance sheet in the PDF adds up", async () => {
    const M = model();
    expect(M.balance.balanced).toBe(true);
    const text = await textOfPdf(renderPdf(pdfPages(M, c, day), { title: "R", author: "A", creator: "C", created: new Date() }));
    expect(text).toContain(money(M.balance.totalAssets).replace("−", "-"));
    expect(text).toContain("Ganancia del periodo (por cerrar)");
  });
  it("measures, cuts and prints like the standard fonts", () => {
    expect(measure("Hola", 10)).toBeCloseTo(((722 + 556 + 222 + 556) * 10) / 1000);
    expect(measure("ñ", 10, true)).toBe(measure("n", 10, true));
    const cut = fit("Una descripción muy larga que no cabe en la columna", 60, 9);
    expect(cut.endsWith("…")).toBe(true);
    expect(measure(cut, 9)).toBeLessThanOrEqual(60);
    expect(printable("−$5 ↑ 3%")).toBe("-$5 + 3%");
  });
});

describe("Excel", () => {
  it("one sheet per report, totals as formulas with the same values as the page", () => {
    const M = model();
    const bytes = writeXlsx(xlsxSheets(M, c), { title: "R", creator: "PBS", created: new Date("2026-11-21T12:00:00Z"), dateFormat: "dd/mm/yyyy" }, XLSX.CFB as unknown as CfbLike);
    const wb = XLSX.read(bytes, { type: "array", cellFormula: true, cellDates: false });
    expect(wb.SheetNames).toEqual(["Resumen", "Estado de resultados", "Gastos", "Ingresos", "Quién te debe", "Proveedores", "Balance general", "Flujo de efectivo"]);
    const cell = (sheet: string, ref: string) => wb.Sheets[sheet][ref];
    // Resumen: Entró, Salió and the profit formula.
    expect(cell("Resumen", "B5").v).toBe(24580);
    expect(cell("Resumen", "B6").v).toBe(9135.4);
    expect(cell("Resumen", "B7").f).toBe("B5-B6");
    expect(cell("Resumen", "B7").v).toBeCloseTo(15444.6, 2);
    // Estado de resultados: totals are SUMs, net = income − expenses.
    const pl = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Estado de resultados"], { header: 1, blankrows: true });
    const netRow = pl.findIndex((r) => Array.isArray(r) && r[0] === "Utilidad neta") + 1;
    expect(cell("Estado de resultados", `B${netRow}`).f).toMatch(/^B\d+-B\d+$/);
    expect(cell("Estado de resultados", `B${netRow}`).v).toBeCloseTo(15444.6, 2);
    // Gastos: dates are real dates, total = SUM of the rows.
    const g = wb.Sheets["Gastos"];
    expect(g["A5"].v).toBe(excelSerial("2026-11-03"));
    expect(g["F9"].f).toBe("SUM(F5:F8)");
    expect(g["F9"].v).toBeCloseTo(9135.4, 2);
    expect(g["!autofilter"]?.ref).toBe("A4:F8");
    expect(g["E8"].v).toBe("—"); // a bank charge has no receipt to ask for
    // Balance: assets = liabilities + equity, as formulas.
    const bs = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Balance general"], { header: 1, blankrows: true });
    const checkRow = bs.findIndex((r) => Array.isArray(r) && typeof r[0] === "string" && (r[0] as string).startsWith("Lo que debes +")) + 1;
    expect(cell("Balance general", `B${checkRow}`).f).toMatch(/^B\d+\+B\d+$/);
    expect(cell("Balance general", `B${checkRow}`).v).toBeCloseTo(M.balance.totalAssets, 2);
  });
  it("the file has the prototype's styles: dark header, frozen header row", () => {
    const bytes = writeXlsx(xlsxSheets(model(), c), { title: "R", creator: "PBS", created: new Date(), dateFormat: "dd/mm/yyyy" }, XLSX.CFB as unknown as CfbLike);
    const zip = XLSX.CFB.read(bytes, { type: "array" });
    const read = (p: string) => {
      const i = (zip.FullPaths as string[]).findIndex((x) => x.endsWith(p));
      return new TextDecoder().decode(zip.FileIndex[i].content as Uint8Array);
    };
    expect(read("xl/styles.xml")).toContain('fgColor rgb="FF0F172A"');
    expect(read("xl/worksheets/sheet3.xml")).toContain('state="frozen"');
    expect(read("xl/workbook.xml")).toContain('fullCalcOnLoad="1"');
  });
  it("layout: formulas get real row numbers; names follow Excel's rules", () => {
    const [g] = layoutWorkbook([{ name: "A/B", title: "T", sub: "S", widths: [10, 10], blocks: [{ cols: [{ h: "x" }, { h: "y", t: "money" }], rows: [{ c: ["a", 1] }, { c: ["b", 2] }, { total: true, c: ["t", { sum: true, v: 3 }] }] }] }]);
    expect(g.name).toBe("A B");
    expect(g.rows[6].cells[1].formula).toBe("SUM(B5:B6)");
    expect(sheetName("x".repeat(40), new Set())).toHaveLength(31);
    expect(colName(0) + colName(25) + colName(26)).toBe("AZAA");
  });
});

describe("names", () => {
  it("initials and a safe file name", () => {
    expect(initials("Taller López")).toBe("TL");
    expect(initials("Ana")).toBe("AN");
    expect(fileBaseFor("Taller López", "reporte", "Noviembre 2026")).toBe("Taller-Lopez-reporte-noviembre-2026");
  });
});
