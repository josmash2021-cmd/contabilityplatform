import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import { Panel } from "./Panel";
import { BTN, BTN_PRIMARY, SEG, SEG_BTN, saveFile } from "./ui";
import { printable, renderPdf, textLeft, PAGE_H, PAGE_W, type Page } from "./export/pdf";
import { layoutWorkbook, colName, shownValue, writeXlsx, type CfbLike, type GridCell, type SheetGrid, type SheetSpec } from "./export/xlsx";
import { FileLogo } from "@/components/FileLogo";

export type ExportTab = "pdf" | "xlsx";

/** One PDF page drawn from the same operations as the file (positions measured the same way). */
function PdfPagePreview({ page, n }: { page: Page; n: number }) {
  const rgb = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
  return (
    <svg viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} role="img" aria-label={`PDF ${n}`} className="block h-auto w-full max-w-[612px] bg-white shadow-[0_10px_28px_-14px_rgba(15,23,42,0.45)]" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      {page.map((op, i) => {
        if (op.k === "text") return <text key={i} x={textLeft(op)} y={op.y} fontSize={op.size} fontWeight={op.bold ? 700 : 400} fill={rgb(op.color)} style={{ whiteSpace: "pre" }}>{printable(op.s)}</text>;
        if (op.k === "line") return <line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={rgb(op.color)} strokeWidth={op.lw} />;
        return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} rx={op.r} fill={op.fill ? rgb(op.fill) : "none"} stroke={op.stroke ? rgb(op.stroke) : undefined} strokeWidth={op.stroke ? op.lw ?? 0.75 : undefined} />;
      })}
    </svg>
  );
}

const ROLE_CLASS: Record<GridCell["role"], string> = {
  title: "text-[15px] font-bold",
  sub: "text-[10px] text-slate-500",
  bsub: "font-bold",
  head: "bg-slate-900 font-bold text-white",
  body: "",
  total: "border-t border-t-slate-900 bg-slate-100 font-bold",
  warn: "font-bold text-red-600",
  plain: "",
};

function XlsxPreview({ grids, idx, onIdx, file, note, dateFormat, sheetsLabel }: { grids: SheetGrid[]; idx: number; onIdx: (i: number) => void; file: string; note: string; dateFormat: string; sheetsLabel: string }) {
  const g = grids[idx] ?? grids[0];
  const merged = new Set(g.merges.map((m) => Number(m.slice(1, m.indexOf(":")))));
  return (
    <div className="overflow-hidden rounded-lg bg-white text-slate-900 shadow-[0_10px_28px_-14px_rgba(15,23,42,0.45)]">
      <div className="flex flex-wrap justify-between gap-2.5 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs">
        <b className="min-w-0 break-all">{file}</b>
        <span className="text-slate-500">{note}</span>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-xs" style={{ fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif' }}>
          <thead>
            <tr>
              <th className="w-[30px] border border-slate-200 bg-slate-100 px-1 py-0.5 text-[11px] font-medium text-slate-500" />
              {g.widths.map((w, i) => <th key={i} className="border border-slate-200 bg-slate-100 px-1 py-0.5 text-center text-[11px] font-medium text-slate-500" style={{ minWidth: Math.round(w * 7.2) }}>{colName(i)}</th>)}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((row, ri) => {
              const r = ri + 1;
              const span = merged.has(r);
              return (
                <tr key={ri}>
                  <th className="border border-slate-200 bg-slate-100 px-1 py-0.5 text-center text-[11px] font-medium text-slate-500">{r}</th>
                  {span
                    ? <td colSpan={g.widths.length} className={cn("h-[21px] whitespace-nowrap border border-[#EEF2F6] px-[7px] py-0.5", ROLE_CLASS[row.cells[0].role])}>{shownValue(row.cells[0], dateFormat)}</td>
                    : row.cells.map((cell, ci) => (
                      <td key={ci} title={cell.formula ? `=${cell.formula}` : undefined} className={cn("h-[21px] whitespace-nowrap border border-[#EEF2F6] px-[7px] py-0.5", cell.type !== "text" && "text-right tabular-nums", ROLE_CLASS[cell.role])}>
                        {shownValue(cell, dateFormat)}
                      </td>
                    ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div role="tablist" aria-label={sheetsLabel} className="flex gap-0.5 overflow-x-auto border-t border-slate-200 bg-slate-100 px-2 [scrollbar-width:none]">
        {grids.map((s, k) => (
          <button key={s.name} type="button" role="tab" aria-selected={k === idx} onClick={() => onIdx(k)}
            className="min-h-11 whitespace-nowrap border-b-2 border-transparent px-3 py-[7px] text-xs text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 aria-selected:border-b-emerald-600 aria-selected:bg-white aria-selected:font-[650] aria-selected:text-slate-900 sm:min-h-0">
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What one export is made of: the PDF pages and the Excel sheets (both previews draw from them too). */
export type ExportDoc = {
  pages: Page[];
  sheets: SheetSpec[];
  /** File name without the extension. */
  fileBase: string;
  /** Document properties. */
  pdfTitle: string;
  xlsxTitle: string;
  author: string;
};

/** Exportar: the PDF pages and the Excel grid with sheet tabs, from the same data the files are made of. */
export function ExportDialog({ open, onOpenChange, tab, onTab, title, doc, loading, error, onRetry, c, generated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tab: ExportTab;
  onTab: (t: ExportTab) => void;
  title: string;
  doc: ExportDoc | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  c: ReportesCopy;
  generated: Date;
}) {
  const [sheet, setSheet] = useState(0);
  const [busy, setBusy] = useState(false);
  const pages = doc?.pages ?? [];
  const grids = useMemo(() => layoutWorkbook(doc?.sheets ?? []), [doc]);
  const file = doc ? `${doc.fileBase}.${tab === "pdf" ? "pdf" : "xlsx"}` : "";

  async function download() {
    if (!doc || busy) return;
    setBusy(true);
    try {
      if (tab === "pdf") {
        const bytes = renderPdf(doc.pages, { title: doc.pdfTitle, author: doc.author, creator: c.file.creator, created: generated });
        saveFile(bytes, file, "application/pdf");
      } else {
        const XLSX = await import("xlsx");
        const bytes = writeXlsx(doc.sheets, { title: doc.xlsxTitle, creator: c.file.creator, created: generated, dateFormat: c.file.dateFormat }, XLSX.CFB as unknown as CfbLike);
        saveFile(bytes, file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }
      toast.success(c.export.done(file));
    } catch (e) {
      console.error("[export]", e);
      toast.error(c.export.failed);
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (error) {
    body = (
      <div className="grid justify-items-center gap-2 rounded-xl bg-slate-200 py-10 text-center">
        <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
        <p className="text-sm text-slate-900" role="alert">{c.export.error}</p>
        <button type="button" className={BTN} onClick={onRetry}>{c.drill.retry}</button>
      </div>
    );
  } else if (!doc || loading) {
    body = (
      <div className="grid justify-items-center gap-4 rounded-xl bg-slate-200 p-4" role="status" aria-label={c.export.loading}>
        <Skeleton className="aspect-[8.5/11] w-full max-w-[612px] rounded-none bg-white/70" />
      </div>
    );
  } else {
    body = (
      <div className="max-h-[min(62vh,640px)] overflow-auto rounded-xl bg-slate-200 p-2.5 sm:p-4" aria-label={c.export.preview}>
        {tab === "pdf"
          ? <div className="grid justify-items-center gap-4">{pages.map((p, i) => <PdfPagePreview key={i} page={p} n={i + 1} />)}</div>
          : <XlsxPreview grids={grids} idx={Math.min(sheet, grids.length - 1)} onIdx={setSheet} file={file} note={c.export.formulas(grids.length)} dateFormat={c.file.dateFormat} sheetsLabel={c.export.sheets} />}
      </div>
    );
  }

  return (
    <Panel open={open} onOpenChange={onOpenChange} title={title} closeLabel={c.drill.close} wide="xwide">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className={SEG} role="group" aria-label={c.export.format}>
          <button type="button" aria-pressed={tab === "pdf"} className={SEG_BTN} onClick={() => onTab("pdf")}><FileLogo kind="pdf" className="h-4 w-4" />{c.export.pdf}</button>
          <button type="button" aria-pressed={tab === "xlsx"} className={SEG_BTN} onClick={() => onTab("xlsx")}><FileLogo kind="excel" className="h-4 w-4" />{c.export.excel}</button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {doc && !loading && <span className="text-xs text-slate-500">{tab === "pdf" ? c.export.pdfNote(pages.length) : c.export.xlsxNote(grids.length)}</span>}
          <button type="button" className={BTN_PRIMARY} disabled={!doc || loading || busy} onClick={() => void download()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {busy ? c.export.preparing : tab === "pdf" ? c.export.dlPdf : c.export.dlExcel}
          </button>
        </div>
      </div>
      {body}
    </Panel>
  );
}
