import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { STAMP, STAMP_HEAD, findSignSpot, signMoment, stampId, type PdfTextItem, type SignSpot } from "@contracts/taxRules";
import type { Doc } from "./taxView";

type Sheet = { spot: SignSpot; vpW: number; vpH: number; transform: number[] };

function toBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Finds the "Your signature" line (first pages' text) and draws that page sharp enough to zoom in on it. */
async function loadSheet(bytes: Uint8Array, canvas: HTMLCanvasElement): Promise<Sheet> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const pages: { items: PdfTextItem[]; width: number; height: number }[] = [];
    for (let n = 1; n <= Math.min(3, doc.numPages); n++) {
      const pg = await doc.getPage(n);
      const [x0, y0, x1, y1] = pg.view;
      const text = await pg.getTextContent();
      const items = text.items.flatMap((it): PdfTextItem[] => ("str" in it ? [{ str: it.str, transform: it.transform, width: it.width }] : []));
      pages.push({ items, width: x1 - x0, height: y1 - y0 });
    }
    const spot = findSignSpot(pages);
    const page = await doc.getPage(spot.page);
    const vp1 = page.getViewport({ scale: 1 });
    // Sharp when zoomed in on the line (about 2x the page's width on screen).
    const vp = page.getViewport({ scale: Math.min(4, 2400 / vp1.width) });
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d");
    if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { spot, vpW: vp1.width, vpH: vp1.height, transform: vp1.transform };
  } finally {
    void doc.destroy();
  }
}

/** Width of a text at 1pt in a Helvetica-like font (to shrink a long name like the PDF does). */
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(s: string, bold: boolean): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * 0.55;
  measureCtx.font = `${bold ? 700 : 400} 100px Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(s).width / 100;
}

/**
 * The 8879 the client is signing, live: zoomed in on its "Your signature" line (or the whole page), with the
 * drawn signature on the line as it's drawn, "Electronically signed by", the name, Alabama's date and time and
 * the ID's place beside it, and the date in "Date": the same boxes the server stamps (STAMP). Clearing the pad clears
 * it here. Tells the form where the line is (`onSpot`), which goes with tax.sign.
 */
export function TaxSignLive({ doc, signature, name, labels, onSpot }: {
  doc: Doc; signature: string | null; name: string;
  labels: { title: string; live: string; here: string; whole: string; zoom: string };
  onSpot: (s: SignSpot | null) => void;
}) {
  const { data } = trpc.tax.file.useQuery({ id: doc.id }, { staleTime: 5 * 60_000 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef(onSpot);
  useEffect(() => { spotRef.current = onSpot; }, [onSpot]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [failed, setFailed] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [whole, setWhole] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [ink, setInk] = useState<{ src: string; w: number; h: number } | null>(null);
  const isPdf = data?.mimeType === "application/pdf";

  useEffect(() => {
    if (!data || !isPdf || !canvasRef.current) return;
    let alive = true;
    loadSheet(toBytes(data.dataBase64), canvasRef.current)
      .then((s) => { if (alive) { setSheet(s); spotRef.current(s.spot); } })
      .catch(() => { if (alive) { setFailed(true); spotRef.current(null); } });
    return () => { alive = false; };
  }, [data, isPdf]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The time beside the signature keeps up with the clock.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  // The signature's own size, to sit it on the line like the PDF does.
  useEffect(() => {
    if (!signature) return;
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setInk({ src: signature, w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = signature;
    return () => { alive = false; };
  }, [signature]);

  if (data && !isPdf) return null;
  if (failed) return null;

  const sp = sheet?.spot;
  // The zoomed window around the line, in viewport points (the transform also handles turned pages).
  const tf = sheet?.transform ?? [1, 0, 0, -1, 0, 0];
  const toVp = (x: number, y: number): [number, number] => [tf[0] * x + tf[2] * y + tf[4], tf[1] * x + tf[3] * y + tf[5]];
  let view = { x: 0, y: 0, w: sheet?.vpW ?? 612, h: sheet?.vpH ?? 792 };
  if (sheet && sp && !whole) {
    const right = Math.max(sp.x + sp.w, (sp.dateX ?? 0) + 64);
    // From the line above the PIN boxes down to the next part's title, without cutting a line of text in half.
    const [ax, ay] = toVp(sp.labelX - 10, sp.y + 97);
    const [bx, by] = toVp(Math.min(sheet.vpW, right), sp.y - 27);
    view = { x: Math.max(0, Math.min(ax, bx)), y: Math.max(0, Math.min(ay, by)), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  }
  const k = boxW && view.w ? boxW / view.w : 0;
  const shown = signature && ink?.src === signature ? ink : null;
  const fit = shown ? Math.min(STAMP.sigMaxW / shown.w, STAMP.sigH / shown.h) : 0;
  const sw = shown ? shown.w * fit : 0, sh = shown ? shown.h * fit : 0;
  const { date, time } = signMoment(now);
  const head = STAMP_HEAD;
  // The ID is made when signing; here, its place.
  const idLine = stampId("····-····");
  const who = name.trim();
  const when = `${date} ${time}`;
  const tx = sp ? sp.x + STAMP.sigLeft + sw + STAMP.gap : 0;
  const room = sp ? Math.max(36, sp.x + sp.w - tx) : 0;
  const size = (s: string, bold: boolean, max: number) => Math.min(max, room / Math.max(1, textWidth(s, bold)));
  // A piece of text written upright at a PDF point (the page's own coordinates go up).
  const at = (x: number, y: number) => `translate(${x} ${y}) scale(1 -1)`;
  const ink8879 = "#17338c";

  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-[13px] font-semibold text-slate-800">
        <span className="min-w-0 truncate">{labels.title}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" aria-hidden="true" />{labels.live}
        </span>
      </div>
      <div ref={boxRef} data-sign-live="" className="relative overflow-hidden bg-slate-100 transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ height: k ? view.h * k : 120 }}>
        <div className="absolute left-0 top-0 origin-top-left transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ width: sheet?.vpW ?? 612, height: sheet?.vpH ?? 792, transform: `translate(${-view.x * k}px, ${-view.y * k}px) scale(${k || 1})`, opacity: sheet && k ? 1 : 0 }}>
          <canvas ref={canvasRef} className="block h-full w-full bg-white" />
          {sheet && sp && (
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${sheet.vpW} ${sheet.vpH}`} aria-hidden="true">
              <g transform={`matrix(${tf.join(" ")})`}>
                {shown ? (
                  <>
                    <g transform={at(sp.x + STAMP.sigLeft, sp.y - STAMP.sigBelow + sh)}>
                      <image href={shown.src} x={0} y={0} width={sw} height={sh} preserveAspectRatio="none" data-sign-ink="" />
                    </g>
                    <g fill={ink8879} fontFamily="Helvetica, Arial, sans-serif" data-sign-stamp="">
                      <text transform={at(tx, sp.y + 16)} fontSize={size(head, false, STAMP.headSize)}>{head}</text>
                      {who && <text transform={at(tx, sp.y + 8)} fontSize={size(who, true, STAMP.nameSize)} fontWeight={700}>{who}</text>}
                      <text transform={at(tx, sp.y + 1)} fontSize={size(when, false, STAMP.timeSize)}>{when}</text>
                      <text transform={at(tx, sp.y - 7)} fontSize={STAMP.idSize} opacity={0.55}>{idLine}</text>
                      {sp.dateX !== null && <text transform={at(sp.dateX, sp.y + 1)} fontSize={STAMP.dateSize}>{date}</text>}
                    </g>
                  </>
                ) : (
                  <g data-sign-here="">
                    <rect x={sp.x + 1} y={sp.y - STAMP.sigBelow - 1} width={Math.min(sp.w - 2, STAMP.sigMaxW + 30)} height={STAMP.sigH + 2} rx={3}
                      fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={0.8} strokeDasharray="3 2" className="animate-pulse motion-reduce:animate-none" />
                    <text transform={at(sp.x + 8, sp.y + 8)} fontSize={8} fontWeight={700} fill="#1d4ed8" fontFamily="Helvetica, Arial, sans-serif">{labels.here}</text>
                  </g>
                )}
              </g>
            </svg>
          )}
        </div>
        {!sheet && <span className="absolute inset-0 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden="true" /></span>}
        {/* Whole page / back to the line: a small pill floating on the document. */}
        {sheet && (
          <button type="button" onClick={() => setWhole((w) => !w)} aria-label={whole ? labels.zoom : labels.whole} title={whole ? labels.zoom : labels.whole}
            className={cn("absolute right-2 top-2 inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full bg-white/90 px-2 text-[11.5px] sm:px-2.5 font-semibold text-blue-700 shadow-[0_6px_16px_-8px_rgba(15,23,42,0.45)] ring-1 ring-slate-200 backdrop-blur-sm transition-colors hover:bg-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500")}>
            {whole ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {/* Just the icon on a phone, so the pill doesn't cover the form. */}
            <span className="hidden sm:inline">{whole ? labels.zoom : labels.whole}</span>
          </button>
        )}
      </div>
    </div>
  );
}
