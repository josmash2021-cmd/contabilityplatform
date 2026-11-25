// ── The assistant's bubble, drawn ──
// The owner chose "2" (2026-11-25, artifact "Tres burbujas"): a real soap bubble in blue, gray and clear. The color
// lives in the film at the rim (big soft spots that turn slowly), curved window highlights, the app's star inside
// turning slowly. While it speaks, the star becomes a soft, slow wave (three fine lines that follow the words) and
// turns back into the star when the words are done. It never deforms. One canvas; frames only while it's seen.

const TAU = Math.PI * 2;
/** The soft layers cover [-EXT, EXT] so the blur isn't cut at the rim. */
const EXT = 1.2;
const STAR_D = "M12 2 C12.6 7.4 16.6 11.4 22 12 C16.6 12.6 12.6 16.6 12 22 C11.4 16.6 7.4 12.6 2 12 C7.4 11.4 11.4 7.4 12 2 Z";

/** The film's spots: color, start angle, turn speed, distance from the center, size, strength, wobble speed. */
const BLOBS = [
  { c: "rgb(59,130,246)", a0: 0.3, sp: 0.25, r: 0.74, s: 0.56, al: 0.5, w: 0.31 },
  { c: "rgb(148,163,184)", a0: 2.3, sp: 0.25, r: 0.78, s: 0.5, al: 0.46, w: 0.27 },
  { c: "rgb(96,165,250)", a0: 4.2, sp: 0.25, r: 0.76, s: 0.48, al: 0.44, w: 0.23 },
  { c: "rgb(100,116,139)", a0: 1.2, sp: -0.17, r: 0.86, s: 0.36, al: 0.34, w: 0.29 },
  { c: "rgb(191,219,254)", a0: 5.3, sp: -0.17, r: 0.86, s: 0.34, al: 0.5, w: 0.37 },
  { c: "rgb(203,213,225)", a0: 3.3, sp: -0.17, r: 0.88, s: 0.3, al: 0.45, w: 0.33 },
];
/** The wave's lines: height factor, phase, color, strength, width. */
const LINES: [number, number, string, number, number][] = [
  [1, 0, "59,130,246", 0.95, 0.055],
  [-0.62, 1.1, "148,163,184", 0.6, 0.04],
  [0.38, 2.3, "96,165,250", 0.45, 0.034],
];

/** What moves the drawing: time, the film's turn, the voice (level, slow energy), the wave and its own phase. */
export type OrbState = { t: number; ph: number; lvl: number; en: number; wave: number; wph: number };
/** At rest and in still pictures: the star stands straight (a quarter turn = 3.5 s of its 14 s turn). */
const STILL: OrbState = { t: 3.5, ph: 1.2, lvl: 0, en: 0, wave: 0, wph: 1.4 };

function mk(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function ctx2d(c: HTMLCanvasElement) { return c.getContext("2d"); }

let filterOk: boolean | null = null;
function hasFilter() {
  if (filterOk === null) {
    try { const c = ctx2d(mk(1, 1)); filterOk = !!c && "filter" in c && typeof c.filter === "string"; } catch { filterOk = false; }
  }
  return filterOk;
}
let starPath: Path2D | null | undefined;
function starShape() {
  if (starPath === undefined) { try { starPath = new Path2D(STAR_D); } catch { starPath = null; } }
  return starPath;
}

/** A curved light (an arc) that fades out at its ends. */
function band(x: CanvasRenderingContext2D, r: number, a0: number, a1: number, lw: number, rgb: string, alpha: number) {
  const g = x.createLinearGradient(r * Math.cos(a0), r * Math.sin(a0), r * Math.cos(a1), r * Math.sin(a1));
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.28, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.72, `rgba(${rgb},${alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.strokeStyle = g; x.lineWidth = lw; x.beginPath(); x.arc(0, 0, r, a0, a1); x.stroke();
}

/** One bubble drawn on one canvas, at its css size (with or without the star). */
export class OrbDrawing {
  css = 0;
  dpr = 0;
  private c: CanvasRenderingContext2D | null;
  private S = 2; private R = 1; private m = 2; private u = 1;
  private tmp = mk(1, 1); private soft = mk(1, 1); private h1 = mk(1, 1); private h2 = mk(1, 1);
  private under = mk(1, 1); private over = mk(1, 1);
  private fBig = "none";
  private maskGrad: CanvasGradient | null = null;
  private glowGrad: CanvasGradient | null = null;
  private starGrad: CanvasGradient | null = null;

  private cv: HTMLCanvasElement;
  private withStar: boolean;

  constructor(cv: HTMLCanvasElement, withStar = true) { this.cv = cv; this.withStar = withStar; this.c = ctx2d(cv); }

  build(css: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const S = Math.max(2, Math.round(css * dpr));
    this.css = css; this.dpr = dpr; this.S = S; this.R = S / 2;
    this.cv.width = S; this.cv.height = S;
    const R = this.R, uu = Math.min(R, Math.max(30, R / 2.5));
    this.m = Math.ceil(uu * 2 * EXT); this.u = this.m / (2 * EXT);
    const m = this.m;
    this.tmp = mk(m, m); this.soft = mk(m, m);
    this.h1 = mk(Math.max(2, Math.ceil(m / 2)), Math.max(2, Math.ceil(m / 2)));
    this.h2 = mk(Math.max(2, Math.ceil(m / 4)), Math.max(2, Math.ceil(m / 4)));
    this.fBig = `blur(${(0.13 * this.u).toFixed(2)}px)`;
    const sx = ctx2d(this.soft), c = this.c;
    if (!sx || !c) return;
    // the film shows at the rim and barely in the middle
    let g = sx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(0,0,0,.05)"); g.addColorStop(0.5, "rgba(0,0,0,.10)"); g.addColorStop(0.74, "rgba(0,0,0,.34)");
    g.addColorStop(0.92, "rgba(0,0,0,.92)"); g.addColorStop(1, "rgba(0,0,0,1)");
    this.maskGrad = g;
    g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    this.glowGrad = g;
    g = c.createLinearGradient(0, 0, 24, 24);
    g.addColorStop(0, "#60a5fa"); g.addColorStop(0.5, "#3b82f6"); g.addColorStop(1, "#64748b");
    this.starGrad = g;
    this.buildStatic();
  }

  /** Under: the body (clear in the middle, blue toward the rim). Over: the rim, its color reflections, the highlights. */
  private buildStatic() {
    const S = this.S, R = this.R, PI = Math.PI;
    this.under = mk(S, S);
    let x = ctx2d(this.under);
    if (!x) return;
    x.setTransform(R, 0, 0, R, R, R);
    x.beginPath(); x.arc(0, 0, 0.992, 0, TAU); x.clip();
    let g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(219,234,254,.05)"); g.addColorStop(0.55, "rgba(191,219,254,.08)"); g.addColorStop(0.8, "rgba(147,197,253,.17)");
    g.addColorStop(0.93, "rgba(96,165,250,.32)"); g.addColorStop(1, "rgba(59,130,246,.5)");
    x.fillStyle = g; x.fillRect(-1, -1, 2, 2);
    // the back wall gives back the light from below
    g = x.createRadialGradient(0.08, 0.6, 0, 0.08, 0.6, 0.62);
    g.addColorStop(0, "rgba(255,255,255,.34)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(-1, -1, 2, 2);

    this.over = mk(S, S);
    x = ctx2d(this.over);
    if (!x) return;
    x.setTransform(R, 0, 0, R, R, R);
    const lw = Math.max(0.028, 1.3 / R);
    g = x.createRadialGradient(0, 0, 0.8, 0, 0, 0.985);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.7, "rgba(255,255,255,.10)"); g.addColorStop(1, "rgba(255,255,255,.36)");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 0.985, 0, TAU); x.fill();
    g = x.createLinearGradient(-0.75, -0.75, 0.75, 0.75);
    g.addColorStop(0, "rgba(255,255,255,.98)"); g.addColorStop(0.28, "rgba(147,197,253,.85)"); g.addColorStop(0.55, "rgba(59,130,246,.6)");
    g.addColorStop(0.8, "rgba(148,163,184,.75)"); g.addColorStop(1, "rgba(255,255,255,.95)");
    x.strokeStyle = g; x.lineWidth = lw;
    x.beginPath(); x.arc(0, 0, 0.992 - lw / 2, 0, TAU); x.stroke();
    x.lineCap = "round";
    band(x, 0.935, -0.42 * PI, -0.12 * PI, 0.036, "147,197,253", 0.6);
    band(x, 0.935, 0.62 * PI, 0.92 * PI, 0.036, "148,163,184", 0.5);
    band(x, 0.935, 0.42 * PI, 0.58 * PI, 0.03, "219,234,254", 0.5);
    // the window reflected up left (curved, like on a real bubble), its thin companion, and a small one down right
    if (hasFilter()) x.filter = `blur(${Math.max(0.3, 0.012 * R).toFixed(2)}px)`;
    band(x, 0.74, 1.12 * PI, 1.38 * PI, 0.1, "255,255,255", 0.95);
    band(x, 0.6, 1.17 * PI, 1.31 * PI, 0.035, "255,255,255", 0.5);
    band(x, 0.78, 0.16 * PI, 0.32 * PI, 0.05, "255,255,255", 0.6);
    if (hasFilter()) x.filter = "none";
    x.fillStyle = "rgba(255,255,255,.9)";
    x.beginPath(); x.arc(0.74 * Math.cos(1.06 * PI), 0.74 * Math.sin(1.06 * PI), Math.max(0.03, 1 / R), 0, TAU); x.fill();
  }

  private blur(d: CanvasRenderingContext2D) {
    const m = this.m;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.clearRect(0, 0, m, m);
    if (hasFilter()) { d.filter = this.fBig; d.drawImage(this.tmp, 0, 0); d.filter = "none"; return; }
    // no ctx.filter: shrinking and growing in steps gives a smooth blur
    const a = ctx2d(this.h1), b = ctx2d(this.h2), w1 = this.h1.width, w2 = this.h2.width;
    if (!a || !b) return;
    a.clearRect(0, 0, w1, w1); a.drawImage(this.tmp, 0, 0, m, m, 0, 0, w1, w1);
    b.clearRect(0, 0, w2, w2); b.drawImage(this.h1, 0, 0, w1, w1, 0, 0, w2, w2);
    a.clearRect(0, 0, w1, w1); a.drawImage(this.h2, 0, 0, w2, w2, 0, 0, w1, w1);
    d.drawImage(this.h1, 0, 0, w1, w1, 0, 0, m, m);
  }

  render(g: OrbState = STILL) {
    const c = this.c, t = ctx2d(this.tmp), sx = ctx2d(this.soft);
    if (!c || !t || !sx || !this.maskGrad || !this.glowGrad || !this.starGrad) return;
    const u = this.u, m = this.m, R = this.R, S = this.S;

    // 1) the film: its colors turn slowly around the rim; with the voice they run and shine a little more
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = 1; t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, m, m);
    t.setTransform(u, 0, 0, u, m / 2, m / 2);
    BLOBS.forEach((b, i) => {
      const a = b.a0 + b.sp * g.ph + 0.3 * Math.sin(g.t * b.w + i);
      const rr = b.r + 0.07 * Math.sin(g.t * b.w * 1.3 + i * 2);
      t.globalAlpha = Math.min(1, b.al * (0.8 + 0.5 * g.en));
      t.fillStyle = b.c;
      t.beginPath(); t.arc(rr * Math.cos(a), rr * Math.sin(a), b.s, 0, TAU); t.fill();
    });
    this.blur(sx);
    sx.setTransform(u, 0, 0, u, m / 2, m / 2);
    sx.globalCompositeOperation = "destination-in";
    sx.fillStyle = this.maskGrad; sx.fillRect(-EXT, -EXT, 2 * EXT, 2 * EXT);
    sx.globalCompositeOperation = "source-over";

    // 2) all together at full resolution
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, S, S);
    c.drawImage(this.under, 0, 0);
    c.save();
    c.setTransform(R, 0, 0, R, R, R);
    c.beginPath(); c.arc(0, 0, 0.986, 0, TAU); c.clip();
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
    c.drawImage(this.soft, -EXT, -EXT, 2 * EXT, 2 * EXT);
    // the light inside comes on with the voice
    c.save(); c.scale(0.8, 0.8);
    c.globalAlpha = Math.min(1, 0.05 + 0.28 * g.lvl);
    c.fillStyle = this.glowGrad;
    c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
    c.restore();

    const wv = this.withStar ? g.wave : 0;
    // while it speaks, the star becomes a soft, slow wave
    if (wv > 0.01) {
      const A = (0.05 + 0.17 * g.en) * wv, N = 56;
      c.save(); c.lineCap = "round";
      c.shadowColor = `rgba(59,130,246,${(0.35 * wv).toFixed(3)})`; c.shadowBlur = Math.max(2, 0.12 * R);
      for (const [k, off, rgb, alpha, width] of LINES) {
        const wg = c.createLinearGradient(-0.72, 0, 0.72, 0);
        wg.addColorStop(0, `rgba(${rgb},0)`); wg.addColorStop(0.5, `rgba(${rgb},${(alpha * wv).toFixed(3)})`); wg.addColorStop(1, `rgba(${rgb},0)`);
        c.beginPath();
        for (let i = 0; i <= N; i++) {
          const px = -0.72 + (1.44 * i) / N, X = (px / 0.72) * 2, att = Math.pow(2 / (2 + X * X * X * X), 2);
          const py = A * k * att * Math.sin(2.1 * X - g.wph + off);
          if (i) c.lineTo(px, py); else c.moveTo(px, py);
        }
        c.strokeStyle = wg; c.lineWidth = width; c.stroke();
      }
      c.restore();
    }
    // the app's star inside: it turns slowly and steps aside while the wave is there
    const star = this.withStar ? starShape() : null;
    if (star && wv < 0.99) {
      const k = (0.92 / 24) * (1 - 0.45 * wv);
      c.save();
      c.rotate((g.t * TAU) / 14);
      c.scale(k, k);
      c.translate(-12, -12);
      c.globalAlpha = 0.96 * (1 - wv);
      c.shadowColor = "rgba(37,99,235,.4)"; c.shadowBlur = Math.max(2, 0.14 * R); c.shadowOffsetY = Math.max(1, 0.04 * R);
      c.fillStyle = this.starGrad; c.fill(star);
      c.restore();
    }
    c.restore();

    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    c.drawImage(this.over, 0, 0);
  }
}

/** A still bubble (the panel's little one, the companion): drawn once at its size. */
export function drawStill(cv: HTMLCanvasElement, css: number, withStar: boolean) {
  const d = new OrbDrawing(cv, withStar);
  d.build(css);
  d.render(STILL);
}

const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The big bubble, alive: the film and the star turn (30 frames a second is plenty for that), and while words come in
 * (`say`, one word every `wordMs`, as the cloud shows them) the star becomes the wave, a little taller on each word,
 * then the star again. No frames while it's away (panel open, another page) or the tab is hidden; with reduced
 * motion it's a still star. `data-wave` on the canvas says "1" while the wave is there (for the checks).
 */
export class BubbleOrb {
  private d: OrbDrawing;
  private g: OrbState = { ...STILL };
  private raf = 0;
  private last = 0;
  private lastDraw = 0;
  private clock = 0;
  private away = false;
  private hot = 0;
  private hotTo = 0;
  private talk = 0;
  private words: { at: number; dur: number; pk: number }[] = [];
  private from = -9;
  private until = -9;
  private waveOn = false;
  private reduce = reduceMotion();
  private host: HTMLElement | null;

  private cv: HTMLCanvasElement;

  constructor(cv: HTMLCanvasElement, css: number) {
    this.cv = cv;
    this.d = new OrbDrawing(cv, true);
    this.d.build(css);
    this.d.render(this.g);
    this.host = cv.closest("button");
    this.host?.addEventListener("pointerenter", this.onEnter);
    this.host?.addEventListener("pointerleave", this.onLeave);
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("resize", this.onResize);
    this.start();
  }

  /** Its size changed (phone 56, computer 66), or the screen's pixel density. */
  setSize(css: number) {
    if (css === this.d.css && Math.min(window.devicePixelRatio || 1, 3) === this.d.dpr) return;
    this.d.build(css);
    this.d.render(this.g);
  }
  /** Out of sight: no frames. */
  setAway(away: boolean) {
    this.away = away;
    if (away) this.stop(); else this.start();
  }
  /** The cloud's words come in: the wave follows them, one small rise a word. */
  say(words: string[], wordMs: number) {
    if (this.reduce || !words.length) return;
    const step = wordMs / 1000, t0 = this.clock + 0.06;
    this.words = words.map((w, i) => ({ at: t0 + i * step, dur: step * 1.15, pk: 0.55 + Math.min(0.3, w.length / 30) + ((i * 37) % 10) / 50 }));
    this.from = this.clock;
    this.until = t0 + words.length * step;
    this.start();
  }
  /** The cloud went: the wave settles back into the star, softly. */
  hush() {
    this.words = [];
    this.until = Math.min(this.until, this.clock);
  }
  destroy() {
    this.stop();
    this.host?.removeEventListener("pointerenter", this.onEnter);
    this.host?.removeEventListener("pointerleave", this.onLeave);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("resize", this.onResize);
  }

  private onEnter = () => { this.hotTo = 1; };
  private onLeave = () => { this.hotTo = 0; };
  private onVis = () => { if (document.hidden) this.stop(); else this.start(); };
  private onResize = () => this.setSize(this.d.css);

  private start() {
    if (this.raf || this.away || this.reduce || document.hidden) return;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }
  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  /** How loud it is right now: each word a soft rise and fall. */
  private level() {
    let v = 0;
    for (const w of this.words) {
      const p = (this.clock - w.at) / w.dur;
      if (p > 0 && p < 1) v = Math.max(v, w.pk * Math.pow(Math.sin(Math.PI * p), 0.8));
    }
    return v;
  }
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    let dt = this.last ? (now - this.last) / 1000 : 0.016;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    this.clock += dt;
    const g = this.g;
    g.t += dt;
    const raw = this.level();
    g.lvl += (raw - g.lvl) * (1 - Math.exp(-dt * (raw > g.lvl ? 16 : 8))); // quick to rise, soft to fall
    g.en += (g.lvl - g.en) * (1 - Math.exp(-dt * 3.5)); // slow energy: moves the wave without trembling
    const saying = this.clock > this.from + 0.12 && this.clock < this.until + 0.25;
    this.talk += ((saying ? 1 : 0) - this.talk) * (1 - Math.exp(-dt * 3));
    this.hot += (this.hotTo - this.hot) * (1 - Math.exp(-dt * 4));
    g.ph += dt * (0.3 + 0.9 * this.talk + 1.2 * g.en + 0.9 * this.hot);
    g.wave += ((saying ? 1 : 0) - g.wave) * (1 - Math.exp(-dt * 2.6));
    if (Math.abs((saying ? 1 : 0) - g.wave) < 0.002) g.wave = saying ? 1 : 0;
    g.wph += dt * (1.1 + 0.9 * g.en);
    const on = g.wave > 0.5;
    if (on !== this.waveOn) { this.waveOn = on; if (on) this.cv.dataset.wave = "1"; else delete this.cv.dataset.wave; }
    // only the film and the star turning: 30 frames a second is enough
    const busy = saying || (g.wave > 0 && g.wave < 1) || g.lvl > 0.01;
    if (!busy && now - this.lastDraw < 31) return;
    this.lastDraw = now;
    this.d.render(g);
  };
}
