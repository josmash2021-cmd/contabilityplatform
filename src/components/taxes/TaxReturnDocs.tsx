import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, Eye, FileText } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy } from "@/i18n/copy/taxes";
import { taxLiveCopy } from "@/i18n/copy/taxLive";
import { renderFirstPage, toBytes } from "@/lib/pdfThumb";
import { formatFileSize, saveTaxFile } from "@/lib/taxFiles";
import { PAPER_8879, type TaxMode } from "@contracts/taxRules";
import type { Doc } from "./taxView";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

/** The top of a document's first page (drawn by pdf.js), or the photo. */
function DocThumb({ doc, tag, sealed }: { doc: Doc; tag: string; sealed: boolean }) {
  const { data, isError } = trpc.tax.file.useQuery({ id: doc.id }, { staleTime: 5 * 60_000 });
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const isPdf = data?.mimeType === "application/pdf";
  useEffect(() => {
    if (!data || !isPdf || !canvas.current || !box.current) return;
    let alive = true;
    renderFirstPage(toBytes(data.dataBase64), canvas.current, Math.max(220, box.current.getBoundingClientRect().width))
      .then(() => { if (alive) setDrawn(true); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [data, isPdf]);
  return (
    <div ref={box} className="relative aspect-[4/3.1] overflow-hidden rounded-[11px] bg-gradient-to-b from-slate-100 to-slate-200">
      {isPdf && <canvas ref={canvas} className={cn("block w-full transition-opacity duration-700", drawn ? "opacity-100" : "opacity-0")} aria-hidden="true" />}
      {data && !isPdf && <img src={`data:${data.mimeType};base64,${data.dataBase64}`} alt="" className="h-full w-full object-cover object-top" />}
      {!drawn && isPdf && <span className="absolute inset-0 animate-pulse bg-slate-200/60" aria-hidden="true" />}
      {isError && <span className="absolute inset-0 grid place-items-center text-slate-400"><FileText className="h-8 w-8" aria-hidden="true" /></span>}
      <span className="absolute left-2 top-2 rounded-md bg-white px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide text-slate-900 shadow-sm">{tag}</span>
      {sealed && <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_4px_10px_-3px_rgba(5,150,105,0.6)]" aria-hidden="true"><Check className="h-4 w-4" strokeWidth={3} /></span>}
    </div>
  );
}

/**
 * "Tu declaración, lista": the forms the preparer sent (1040, Alabama 40, the 8879, signed once it is) as tiles with
 * the top of their first page, "Ver" and "Guardar". After filing, what the client sent goes folded underneath.
 */
export function TaxReturnDocs({ mode, year, docs, approvedAt, showMine, onOpen }: {
  mode: TaxMode; year: number; docs: readonly Doc[]; approvedAt: Date | string | null; showMine: boolean; onOpen: (d: Doc) => void;
}) {
  const t = useCopy(taxLiveCopy).docs;
  const tt = useCopy(taxesCopy);
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const [openMine, setOpenMine] = useState(false);
  const prep = docs.filter((d) => d.source === "preparer");
  const signed = prep.find((d) => d.kind === "f8879_signed") ?? docs.find((d) => d.kind === PAPER_8879 && d.status === "ok");
  const list = [
    prep.find((d) => d.kind === "final_fed"),
    prep.find((d) => d.kind === "final_state"),
    signed ?? prep.find((d) => d.kind === "f8879"),
    ...prep.filter((d) => d.kind === "prep_other"),
  ].filter((d): d is Doc => !!d);
  const mine = docs.filter((d) => d.source === "client" && d.kind !== PAPER_8879);
  if (!list.length && !(showMine && mine.length)) return null;

  const signedOn = approvedAt ? new Date(approvedAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "";
  const meta = (d: Doc) => {
    if (d.kind === "final_fed") return `${t.fed(year)} · PDF`;
    if (d.kind === "final_state") return `${t.state(year)} · PDF`;
    if (d.kind === "f8879") return t.toSign;
    if (d === signed) return t.signed(signedOn || new Date(d.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short" }));
    return t.other;
  };
  const save = async (d: Doc) => {
    try { saveTaxFile(await utils.tax.file.fetch({ id: d.id })); } catch { /* the viewer has its own button too */ }
  };

  return (
    <section className="rounded-[16px] border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="tax-ready-h">
      {list.length > 0 && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="tax-ready-h" className="text-base font-bold text-slate-900">{t.title}</h2>
            <span className="text-[12.5px] text-slate-500">{t.count(list.length)}</span>
          </div>
          <ul className="mt-3.5 grid gap-3 sm:grid-cols-3">
            {list.map((d) => {
              const title = t.short[d.kind] ?? tt.preparerDocs[d.kind] ?? d.fileName;
              return (
                <li key={d.id} className="grid content-start gap-2.5 rounded-[14px] border border-slate-200 p-2.5 transition-[box-shadow,transform] duration-300 hover:-translate-y-px hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,0.35)]">
                  <button type="button" onClick={() => onOpen(d)} className={cn("block rounded-[11px]", FOCUS)} aria-label={`${t.view}: ${title}`}>
                    <DocThumb doc={d} tag={t.tag[d.kind] ?? "PDF"} sealed={d === signed} />
                  </button>
                  <div className="min-w-0 px-0.5">
                    <b className="block truncate text-[13.5px] font-semibold text-slate-900">{title}</b>
                    <small className={cn("block text-xs", d === signed ? "font-semibold text-emerald-700" : "text-slate-500")}>{meta(d)}</small>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => onOpen(d)} className={cn("inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-blue-600 text-[13px] font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98]", FOCUS)}>
                      <Eye className="h-4 w-4" aria-hidden="true" />{t.view}
                    </button>
                    <button type="button" onClick={() => void save(d)} aria-label={t.saveAria(title)} title={t.save}
                      className={cn("grid h-9 w-9 place-items-center rounded-[10px] text-slate-700 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50", FOCUS)}>
                      <Download className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {showMine && mine.length > 0 && (
        <div className={cn(list.length > 0 && "mt-3")}>
          <button type="button" onClick={() => setOpenMine((v) => !v)} aria-expanded={openMine}
            className={cn("flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[13.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-100", FOCUS)}>
            {t.yours}
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">{t.yoursCount(mine.length)}<ChevronDown className={cn("h-4 w-4 transition-transform duration-300", openMine && "rotate-180")} aria-hidden="true" /></span>
          </button>
          <div className={cn("grid transition-[grid-template-rows] duration-500 [transition-timing-function:cubic-bezier(0.33,0,0.15,1)]", openMine ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
            <ul className="min-h-0 overflow-hidden">
              {mine.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-b border-slate-100 px-1 py-2.5 last:border-0">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] font-semibold text-slate-900">{tt.docs[mode][d.kind]?.title ?? d.fileName}</b>
                    <small className="block truncate text-xs text-slate-500">{d.fileName} · {formatFileSize(d.size)}</small>
                  </span>
                  <button type="button" onClick={() => onOpen(d)} tabIndex={openMine ? 0 : -1} className={cn("rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50", FOCUS)}>{t.view}</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
