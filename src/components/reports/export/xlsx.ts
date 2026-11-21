// Excel files with the prototype's look (dark header row, bold totals, frozen header, filters, money,
// date and percent formats, totals as real formulas) written as plain Office Open XML. The zip is made
// with the zip writer inside SheetJS (the `xlsx` package the app already uses, passed in as `cfb`),
// because SheetJS's community edition can't write cell styles. The same laid-out grid draws the
// on-screen preview (XlsxPreview.tsx). Pure: runs in the browser and in Node (tests).

export type ColType = "text" | "money" | "pct" | "date" | "int";
/** A formula with the value it has now (shown in the preview, cached in the file). `{r}`/`{r-1}` = this row, `{key}` = a keyed row. */
export type FormulaCell = { f: string; v: number };
/** SUM of the block's rows above, in this column. */
export type SumCell = { sum: true; v: number };
export type DateCell = { date: string };
export type CellInput = string | number | null | FormulaCell | SumCell | DateCell;

export type SheetBlock = {
  sub?: string;
  cols: Array<{ h: string; t?: ColType }>;
  rows: Array<{ c: CellInput[]; total?: boolean; key?: string; warn?: number }>;
  /** Add Excel's filter buttons to this block's header. */
  filter?: boolean;
};
export type SheetSpec = {
  name: string;
  title: string;
  sub: string;
  widths: number[];
  /** Rows to keep visible while scrolling (the header). */
  freeze?: number;
  blocks: SheetBlock[];
};

export type Role = "title" | "sub" | "bsub" | "head" | "body" | "total" | "warn" | "plain";
export type GridCell = {
  /** What Excel shows: text, a number, or a date (YYYY-MM-DD). */
  value: string | number | null;
  type: ColType;
  role: Role;
  formula?: string;
  isDate?: boolean;
};
export type SheetGrid = {
  name: string;
  widths: number[];
  rows: Array<{ cells: GridCell[]; height?: number }>;
  merges: string[];
  freeze: number | null;
  filter: string | null;
};

export const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const isObj = (v: CellInput): v is FormulaCell | SumCell | DateCell => v !== null && typeof v === "object";

/** Excel's sheet-name rules: at most 31 characters, none of []:*?/\, unique. */
export function sheetName(name: string, taken: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Hoja";
  let out = base;
  for (let i = 2; taken.has(out.toLowerCase()); i++) out = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  taken.add(out.toLowerCase());
  return out;
}

/** Lays a sheet out cell by cell (rows start at 1 like Excel). Formulas get their real row numbers here. */
export function layoutSheet(sh: SheetSpec, name: string): SheetGrid {
  const nc = sh.widths.length;
  const rows: SheetGrid["rows"] = [];
  const blank = (role: Role = "plain"): GridCell => ({ value: null, type: "text", role });
  const pad = (cells: GridCell[]) => { while (cells.length < nc) cells.push(blank()); return cells; };
  rows.push({ cells: pad([{ value: sh.title, type: "text", role: "title" }]), height: 24 });
  rows.push({ cells: pad([{ value: sh.sub, type: "text", role: "sub" }]) });
  rows.push({ cells: pad([]) });
  const merges = [`A1:${colName(nc - 1)}1`, `A2:${colName(nc - 1)}2`];
  const keys: Record<string, number> = {};
  let filter: string | null = null;
  for (const bl of sh.blocks) {
    if (bl.sub) rows.push({ cells: pad([{ value: bl.sub, type: "text", role: "bsub" }]) });
    rows.push({ cells: pad(bl.cols.map((c) => ({ value: c.h, type: c.t ?? "text", role: "head" as Role }))), height: 20 });
    const headerRow = rows.length;
    const first = headerRow + 1;
    for (const row of bl.rows) {
      const r = rows.length + 1;
      const cells = row.c.map((v, i): GridCell => {
        const type = bl.cols[i]?.t ?? "text";
        const role: Role = row.total ? "total" : row.warn === i ? "warn" : "body";
        if (!isObj(v)) return { value: v, type, role };
        if ("date" in v) return { value: v.date, type: "date", role, isDate: true };
        const col = colName(i);
        const formula = "sum" in v
          ? `SUM(${col}${first}:${col}${r - 1})`
          : v.f.replace(/\{r(-\d+)?\}/g, (_m, d: string | undefined) => String(r + (d ? Number(d) : 0))).replace(/\{(\w+)\}/g, (_m, k: string) => String(keys[k]));
        return { value: v.v, type, role, formula };
      });
      if (row.key) keys[row.key] = r;
      rows.push({ cells: pad(cells) });
    }
    if (bl.filter && bl.rows.length > 0) {
      const lastData = rows.length - (bl.rows[bl.rows.length - 1].total ? 1 : 0);
      filter = `A${headerRow}:${colName(bl.cols.length - 1)}${Math.max(lastData, headerRow)}`;
    }
    rows.push({ cells: pad([]) });
  }
  return { name, widths: sh.widths, rows, merges, freeze: sh.freeze ?? null, filter };
}

export function layoutWorkbook(sheets: readonly SheetSpec[]): SheetGrid[] {
  const taken = new Set<string>();
  return sheets.map((s) => layoutSheet(s, sheetName(s.name, taken)));
}

// ── Styles ──
const ROLES: Role[] = ["plain", "title", "sub", "bsub", "head", "body", "total", "warn"];
const TYPES: ColType[] = ["text", "money", "pct", "date", "int"];
/** cellXfs index for a role and type: 1 + role × types + type (0 is Excel's default). */
export const styleIndex = (role: Role, type: ColType) => 1 + ROLES.indexOf(role) * TYPES.length + TYPES.indexOf(type);

export const MONEY_FMT = '"$"#,##0.00;[Red]-"$"#,##0.00';
export const PCT_FMT = "0.0%";

function stylesXml(dateFmt: string): string {
  const numFmt: Record<ColType, number> = { text: 0, money: 164, pct: 165, date: 166, int: 1 };
  // fonts: 0 normal, 1 bold, 2 title, 3 small muted, 4 bold white, 5 bold red, 6 bold section
  const fontOf: Record<Role, number> = { plain: 0, title: 2, sub: 3, bsub: 6, head: 4, body: 0, total: 1, warn: 5 };
  const fillOf: Record<Role, number> = { plain: 0, title: 0, sub: 0, bsub: 0, head: 2, body: 0, total: 3, warn: 0 };
  const borderOf: Record<Role, number> = { plain: 0, title: 0, sub: 0, bsub: 0, head: 0, body: 1, total: 2, warn: 1 };
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  for (const role of ROLES) {
    for (const type of TYPES) {
      const right = type !== "text";
      const align = right || role === "head" ? `<alignment horizontal="${right ? "right" : "left"}" vertical="center"/>` : "";
      xfs.push(`<xf numFmtId="${numFmt[type]}" fontId="${fontOf[role]}" fillId="${fillOf[role]}" borderId="${borderOf[role]}" xfId="0"${numFmt[type] ? ' applyNumberFormat="1"' : ""}${fontOf[role] ? ' applyFont="1"' : ""}${fillOf[role] ? ' applyFill="1"' : ""}${borderOf[role] ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1">' + align + "</xf>" : "/>"}`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="${esc(MONEY_FMT)}"/><numFmt numFmtId="165" formatCode="${PCT_FMT}"/><numFmt numFmtId="166" formatCode="${esc(dateFmt)}"/></numFmts>
<fonts count="7">
<font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFDC2626"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF0F172A"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

// ── Sheets ──
function esc(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Days since 1899-12-30: how Excel stores a date. */
export function excelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function sheetXml(g: SheetGrid, selected: boolean): string {
  const last = `${colName(g.widths.length - 1)}${g.rows.length}`;
  const pane = g.freeze
    ? `<pane ySplit="${g.freeze}" topLeftCell="A${g.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${g.freeze + 1}" sqref="A${g.freeze + 1}"/>`
    : "";
  const cols = g.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const rows = g.rows.map((row, ri) => {
    const r = ri + 1;
    const cells = row.cells.map((c, ci) => {
      const ref = `${colName(ci)}${r}`;
      const s = styleIndex(c.role, c.type);
      if (c.formula) {
        const v = typeof c.value === "number" ? `<v>${c.value}</v>` : "";
        return `<c r="${ref}" s="${s}"><f>${esc(c.formula)}</f>${v}</c>`;
      }
      if (c.value === null || c.value === "") return c.role === "plain" ? "" : `<c r="${ref}" s="${s}"/>`;
      if (c.isDate && typeof c.value === "string") return `<c r="${ref}" s="${s}"><v>${excelSerial(c.value)}</v></c>`;
      if (typeof c.value === "number") return `<c r="${ref}" s="${s}"><v>${Number.isFinite(c.value) ? c.value : 0}</v></c>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(c.value)}</t></is></c>`;
    }).join("");
    const ht = row.height ? ` ht="${row.height}" customHeight="1"` : "";
    return `<row r="${r}"${ht}>${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${last}"/>
<sheetViews><sheetView ${selected ? 'tabSelected="1" ' : ""}workbookViewId="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows}</sheetData>
${g.filter ? `<autoFilter ref="${g.filter}"/>` : ""}
<mergeCells count="${g.merges.length}">${g.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

/** The parts of SheetJS's zip writer we use (`XLSX.CFB`). */
export type CfbLike = {
  utils: { cfb_new: () => unknown; cfb_add: (cfb: unknown, name: string, content: Uint8Array) => unknown };
  write: (cfb: unknown, opts: { fileType: "zip"; type: "array" | "buffer"; compression: boolean }) => ArrayLike<number> | ArrayBuffer;
};

export function writeXlsx(
  sheets: readonly SheetSpec[],
  meta: { title: string; creator: string; created: Date; dateFormat: string },
  cfb: CfbLike,
): Uint8Array {
  const grids = layoutWorkbook(sheets);
  const enc = new TextEncoder();
  const zip = cfb.utils.cfb_new();
  const add = (path: string, xml: string) => cfb.utils.cfb_add(zip, path, enc.encode(xml));
  const iso = meta.created.toISOString().replace(/\.\d{3}Z$/, "Z");
  add("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${grids.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  add("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  add("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title)}</dc:title><dc:creator>${esc(meta.creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`);
  const defined = grids
    .map((g, i) => (g.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${g.name.replace(/'/g, "''")}'!$${g.filter.replace(/([A-Z]+)(\d+)/g, "$1$$$2").replace(":", ":$")}</definedName>` : ""))
    .join("");
  add("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${grids.map((g, i) => `<sheet name="${esc(g.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ""}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  add("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${grids.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${grids.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add("xl/styles.xml", stylesXml(meta.dateFormat));
  grids.forEach((g, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(g, i === 0)));
  const out = cfb.write(zip, { fileType: "zip", type: "array", compression: true });
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayLike<number>);
}

/** The value as Excel would show it with the cell's format. */
export function shownValue(cell: GridCell, dateFormat: string): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (cell.isDate && typeof v === "string") {
    const [y, m, d] = v.split("-");
    return dateFormat.startsWith("mm") ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
  }
  if (typeof v === "number") {
    if (cell.type === "money") return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (cell.type === "pct") return `${(v * 100).toFixed(1)}%`;
    if (cell.type === "int") return String(Math.round(v));
    return String(v);
  }
  return v;
}

