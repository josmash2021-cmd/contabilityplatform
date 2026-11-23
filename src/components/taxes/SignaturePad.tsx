import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Pt = { x: number; y: number };
type PadState = { drawing: boolean; strokes: Pt[][]; w: number; h: number; ink: boolean; minX: number; minY: number; maxX: number; maxY: number };
const INK = "#0F172A";
const fresh = (): PadState => ({ drawing: false, strokes: [], w: 0, h: 0, ink: false, minX: 1e9, minY: 1e9, maxX: -1, maxY: -1 });

const mark = (s: PadState, p: Pt) => {
  s.minX = Math.min(s.minX, p.x); s.minY = Math.min(s.minY, p.y); s.maxX = Math.max(s.maxX, p.x); s.maxY = Math.max(s.maxY, p.y);
};
const dot = (ctx: CanvasRenderingContext2D, p: Pt) => { ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill(); };
/** One smooth piece of a stroke: a curve through the midpoints around point i-1. */
const piece = (ctx: CanvasRenderingContext2D, pts: Pt[], i: number) => {
  const a = pts[i - 2], b = pts[i - 1], c = pts[i];
  ctx.beginPath();
  ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
  ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
  ctx.stroke();
};

/**
 * Our own signature box: draw with a finger, a pen or the mouse. Smooth strokes (a curve through the
 * midpoints), sharp on any screen (drawn at the device's pixel ratio), and the result as a PNG data URL with a
 * transparent background, cropped to the ink. The strokes are kept, so when the box changes size (turning the
 * phone, a scrollbar showing up) the same signature is drawn again at the new size instead of being lost.
 * `onChange(null)` when it's empty again.
 */
export function SignaturePad({ onChange, label, clearLabel, className }: {
  onChange: (png: string | null) => void;
  label: string;
  clearLabel: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef<PadState>(fresh());
  const changeRef = useRef(onChange);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  /** The ink only (plus a margin), as PNG. */
  const crop = (): string | null => {
    const c = canvasRef.current;
    const s = state.current;
    if (!c) return null;
    const dpr = c.width / c.getBoundingClientRect().width || 1;
    const pad = 8;
    const x = Math.max(0, (s.minX - pad) * dpr), y = Math.max(0, (s.minY - pad) * dpr);
    const w = Math.min(c.width - x, (s.maxX - s.minX + pad * 2) * dpr), h = Math.min(c.height - y, (s.maxY - s.minY + pad * 2) * dpr);
    if (w < 4 || h < 4) return null;
    const out = document.createElement("canvas");
    const k = Math.min(1, 900 / w);
    out.width = Math.round(w * k); out.height = Math.round(h * k);
    out.getContext("2d")?.drawImage(c, x, y, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };
  const cropRef = useRef(crop);
  useEffect(() => { cropRef.current = crop; });

  // Size the drawing surface to the box (sharp at the pixel ratio); on a new size, draw the kept strokes again.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const s = state.current;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      if (W === c.width && H === c.height) return;
      const kx = s.w ? r.width / s.w : 1, ky = s.h ? r.height / s.h : 1;
      s.w = r.width; s.h = r.height;
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      if (!s.strokes.length) return;
      s.minX = 1e9; s.minY = 1e9; s.maxX = -1; s.maxY = -1;
      for (const pts of s.strokes) {
        for (const p of pts) { p.x *= kx; p.y *= ky; mark(s, p); }
        dot(ctx, pts[0]);
        for (let i = 2; i < pts.length; i++) piece(ctx, pts, i);
      }
      if (s.ink) changeRef.current(cropRef.current());
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = state.current;
    s.drawing = true;
    const p = pos(e);
    s.strokes.push([p]);
    mark(s, p);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) dot(ctx, p);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = state.current;
    if (!s.drawing) return;
    const ctx = e.currentTarget.getContext("2d");
    const pts = s.strokes[s.strokes.length - 1];
    if (!ctx || !pts) return;
    const p = pos(e);
    pts.push(p);
    mark(s, p);
    if (pts.length >= 3) piece(ctx, pts, pts.length - 1);
  };
  const up = () => {
    const s = state.current;
    if (!s.drawing) return;
    s.drawing = false;
    // A real signature, not a tap: some ink across some width.
    if (s.maxX - s.minX < 24 && s.maxY - s.minY < 12) return;
    s.ink = true;
    changeRef.current(crop());
  };
  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    const s = state.current;
    state.current = { ...fresh(), w: s.w, h: s.h };
    changeRef.current(null);
  };

  return (
    <div className={cn("relative h-[132px] touch-none select-none rounded-[14px] border-2 border-dashed border-slate-300 bg-slate-50/60 transition-colors focus-within:border-blue-400 hover:border-slate-400", className)}>
      <canvas ref={canvasRef} aria-label={label} role="img"
        className="absolute inset-0 h-full w-full cursor-crosshair rounded-[12px]"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-400">{label}</span>
      <span className="pointer-events-none absolute bottom-[34px] left-3 right-3 border-b border-slate-300" aria-hidden="true" />
      <button type="button" onClick={clear} className="absolute right-2 top-2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {clearLabel}
      </button>
    </div>
  );
}
