import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Maximize2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import type { Doc } from "./taxView";

/** The first page of a PDF, drawn by pdf.js (loaded only when a preview is shown). */
async function renderFirstPage(bytes: Uint8Array, canvas: HTMLCanvasElement, width: number): Promise<void> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: (width / base.width) * dpr });
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } finally {
    void doc.destroy();
  }
}

function toBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * A document the preparer sent (the 1040, Alabama's Form 40, the 8879), half open: the top of its first page
 * with a "Vista previa" tag and a soft fade. Tapping it opens the whole PDF (`onOpen`). Photos show the same way.
 */
export function TaxPdfPreview({ doc, title, previewLabel, openLabel, loadingLabel, onOpen, className }: {
  doc: Doc; title: string; previewLabel: string; openLabel: string; loadingLabel: string; onOpen: (d: Doc) => void; className?: string;
}) {
  const { data, isError } = trpc.tax.file.useQuery({ id: doc.id }, { staleTime: 5 * 60_000 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLButtonElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const isPdf = data?.mimeType === "application/pdf";
  const imgSrc = data && !isPdf ? `data:${data.mimeType};base64,${data.dataBase64}` : null;

  useEffect(() => {
    if (!data || !isPdf || !canvasRef.current || !boxRef.current) return;
    let alive = true;
    const width = Math.max(280, boxRef.current.getBoundingClientRect().width);
    renderFirstPage(toBytes(data.dataBase64), canvasRef.current, width)
      .then(() => { if (alive) setDrawn(true); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [data, isPdf]);

  const loading = !isError && !failed && (!data || (isPdf && !drawn));
  return (
    <button ref={boxRef} type="button" onClick={() => onOpen(doc)} aria-label={`${openLabel}: ${title}`}
      className={cn("group relative block w-full overflow-hidden rounded-[14px] border border-slate-200 bg-white text-left transition hover:border-blue-300 hover:shadow-[0_12px_28px_-18px_rgba(15,23,42,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500", className)}>
      {/* Half of the first page */}
      <div className="relative h-[190px] overflow-hidden bg-slate-100 sm:h-[220px]">
        {isPdf && <canvas ref={canvasRef} className={cn("block w-full transition-[opacity,transform] duration-500 group-hover:scale-[1.015]", drawn ? "opacity-100" : "opacity-0")} />}
        {imgSrc && <img src={imgSrc} alt="" className="block w-full object-cover object-top" />}
        {loading && <span className="absolute inset-0 grid place-items-center text-xs text-slate-500"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{loadingLabel}</span></span>}
        {(isError || failed) && <span className="absolute inset-0 grid place-items-center text-slate-400"><FileText className="h-8 w-8" aria-hidden="true" /></span>}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-white/0 to-white" aria-hidden="true" />
        <span className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">{previewLabel}</span>
      </div>
      <div className="grid justify-items-start gap-2 px-3.5 pb-3.5 pt-1">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{title}</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors group-hover:bg-blue-100">
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />{openLabel}
        </span>
      </div>
    </button>
  );
}
