// ── The bubble's little companion (owner, 2026-11-25; the approved prototype "Burbuja que habla", v3) ──
// Now and then (not all the time, not fast) a small bubble jumps out of the big one somewhere around it, like a drop out
// of water: the surface rises in a hump, a neck holds the drop and pinches, the big one recoils and a ring opens there.
// It floats slowly around the big bubble, GLUED to it (owner: "no puede dejar la burbuja pequeña atrás": it moves in
// the very same frame as the big one, see `moved`). To go back it falls in like a drop into water (owner: "como cuando
// una gota cae o entra al agua"): it lifts a hair, falls speeding up, flattens as it touches and sinks in; the surface
// dents there and bounces back like jelly, rings open across the bubble, and a tiny drop jumps up and falls back in.
// Plain DOM, like the guide. It never takes taps (pointer-events: none) and it hides at once when the bubble does.
import { bottomLimit, viewArea } from "./guide";

type P = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number; cloud: DOMRect | null };

export type BuddyEnv = {
  /** The big bubble (its `.ab-squash` takes the jelly, its `.ab-waves` svg the rings). */
  bubble: HTMLElement;
  /** The little one (`.ab-buddy`, its <i> is the drop). */
  buddy: HTMLElement;
  /** The film between them while they join or part (a path in a fixed, full-screen svg). */
  skin: SVGPathElement;
  waves: SVGSVGElement;
  /** The bubble's cloud: while it shows, the little one keeps off it and off the drop that joins them. */
  cloud: HTMLElement;
  /** The big bubble's top-left corner (viewport coordinates) and size. */
  pos: () => P;
  size: () => number;
};

const NS = "http://www.w3.org/2000/svg";
const BUD_MS = 1400, JOIN_MS = 1500;
const smooth = (t: number) => t * t * t * (10 - 15 * t + 6 * t * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const between = (a: number, b: number) => a + Math.random() * (b - a);
const at = (c: P, ang: number, dist: number): P => ({ x: c.x + Math.cos(ang) * dist, y: c.y + Math.sin(ang) * dist });

type Wob = { t0: number; amp: number; ang: number; release: boolean };
type Ring = { g: SVGGElement; crest: SVGCircleElement; trough: SVGCircleElement; t0: number; dur: number; reach: number; a: number };

export class Buddy {
  private env: BuddyEnv;
  private drop: HTMLElement | null;
  private squash: HTMLElement | null;
  private state: "hidden" | "budding" | "out" | "joining" = "hidden";
  private t0 = 0;
  private dirA = -2.4;
  private orbitA = -2.4;
  private orbitDir = 1;
  /** Which of a move's one-time touches (kick + rings) already happened. */
  private marks = 0;
  private joinFrom = 0;
  private bpos: P = { x: 0, y: 0 };
  private bscale = 0;
  private wobs: Wob[] = [];
  private rings: Ring[] = [];
  private frame = 0;
  private lastT = 0;
  private timer = 0;
  private away = false;
  private dead = false;
  private lastBulge = "";
  private lastShape = "";
  private reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(env: BuddyEnv) {
    this.env = env;
    this.drop = env.buddy.querySelector("i");
    this.squash = env.bubble.querySelector(".ab-squash");
    // Calm (owner): the first one a while after the app opens, then out 14–20 s, then 18–28 s of rest.
    if (!this.reduce) this.later(between(6000, 10000), this.nextBud);
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.hideNow();
  }

  /** The bubble moved (any flight, the page scrolling it, its corner): the little one moves with it, same frame. */
  moved(dx: number, dy: number) {
    if (this.state === "hidden" || (!dx && !dy)) return;
    this.setBuddy({ x: this.bpos.x + dx, y: this.bpos.y + dy }, this.bscale);
  }

  /** The bubble is out of sight (the panel is open, or a page without it): the little one goes at once. */
  setAway(away: boolean) {
    this.away = away;
    if (away) this.hideNow();
  }

  // ── The rest cycle ──
  private later(ms: number, fn: () => void) {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(fn, ms);
  }
  private nextBud = () => {
    if (this.dead) return;
    if (this.away || document.hidden || !this.bud()) { this.later(8000, this.nextBud); return; }
    this.later(BUD_MS + between(14000, 20000), this.nextJoin);
  };
  private nextJoin = () => {
    if (this.dead) return;
    this.join();
    this.later(JOIN_MS + between(18000, 28000), this.nextBud);
  };

  /** Out it comes, somewhere around the big bubble where it fits (a different spot each time). */
  bud(): boolean {
    if (this.dead || this.reduce || this.away || this.state !== "hidden") return false;
    const c1 = this.center(), box = this.bounds();
    const ang = this.pickAngle(c1, box);
    if (ang === null) return false;
    this.dirA = ang; this.orbitA = ang; this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.go("budding"); this.t0 = performance.now(); this.marks = 0;
    this.wake();
    return true;
  }
  /** Back in, like a drop into water, from wherever it floats now. */
  join() {
    if (this.dead || this.state !== "out") return;
    const c1 = this.center(), r = this.r, c2 = { x: this.bpos.x + r, y: this.bpos.y + r };
    this.dirA = Math.atan2(c2.y - c1.y, c2.x - c1.x);
    this.joinFrom = Math.hypot(c2.x - c1.x, c2.y - c1.y);
    this.go("joining"); this.t0 = performance.now(); this.marks = 0;
    this.wake();
  }

  /** Its state, also on the element (data-state) for the app's checks. */
  private go(state: Buddy["state"]) { this.state = state; this.env.buddy.dataset.state = state; }

  // ── Sizes and places ──
  private get R() { return this.env.size() / 2; }
  private get r() { return Math.round(this.env.size() * 0.4) / 2; }
  private center(): P { const p = this.env.pos(), R = this.R; return { x: p.x + R, y: p.y + R }; }
  /** What's seen, above the phone's tab bar. */
  private bounds(): Box {
    const v = viewArea(), c = this.env.cloud;
    return { ...v, bottom: Math.min(v.bottom, bottomLimit()), cloud: c.classList.contains("ab-on") ? c.getBoundingClientRect() : null };
  }
  private fitsAt(ang: number, c1: P, box: Box) {
    const r = this.r, p = at(c1, ang, this.R + r + 8);
    if (!(p.x - r > box.left + 6 && p.y - r > box.top + 6 && p.x + r < box.right - 6 && p.y + r < box.bottom - 6)) return false;
    const k = box.cloud;
    if (!k) return true;
    // not on the cloud, and not on the drop between the bubble and the cloud's nearest edge
    if (p.x + r > k.left - 8 && p.x - r < k.right + 8 && p.y + r > k.top - 8 && p.y - r < k.bottom + 8) return false;
    const toCloud = Math.atan2(Math.max(k.top, Math.min(c1.y, k.bottom)) - c1.y, Math.max(k.left, Math.min(c1.x, k.right)) - c1.x);
    return Math.abs(Math.atan2(Math.sin(ang - toCloud), Math.cos(ang - toCloud))) > 0.85;
  }
  private pickAngle(c1: P, box: Box): number | null {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      if (this.fitsAt(a, c1, box) && Math.abs(Math.atan2(Math.sin(a - this.orbitA), Math.cos(a - this.orbitA))) > 0.8) return a;
    }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (this.fitsAt(a, c1, box)) return a; }
    return null;
  }
  private setBuddy(p: P, s: number) {
    this.bpos = p; this.bscale = s;
    const st = this.env.buddy.style;
    st.setProperty("--bx", `${p.x.toFixed(2)}px`);
    st.setProperty("--by", `${p.y.toFixed(2)}px`);
    st.setProperty("--bs", s.toFixed(3));
  }
  private place(c: P, scale: number) { const r = this.r; this.setBuddy({ x: c.x - r, y: c.y - r }, scale); }
  /** The big bubble's skin: stretched toward `ang` (amount > 0) or pressed in from that side (amount < 0); the near
   *  side moves more than the far one, so it reads as a dent where the drop went in, not a squeeze. */
  private setBulge(amount: number, ang: number) {
    const v = Math.abs(amount) > 0.0005
      ? `rotate(${ang.toFixed(4)}rad) translateX(${(amount * this.R * 0.45).toFixed(2)}px) scale(${(1 + amount).toFixed(4)}, ${(1 - amount * 0.5).toFixed(4)}) rotate(${(-ang).toFixed(4)}rad)`
      : "";
    if (v !== this.lastBulge && this.squash) { this.lastBulge = v; this.squash.style.transform = v; }
  }
  /** The little drop's own shape: long along `ang` while it falls or is pulled, flat when it hits. */
  private shape(sx: number, sy: number, ang: number) {
    const v = Math.abs(sx - 1) + Math.abs(sy - 1) < 0.002 ? "" : `rotate(${ang.toFixed(4)}rad) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${(-ang).toFixed(4)}rad)`;
    if (v !== this.lastShape && this.drop) { this.lastShape = v; this.drop.style.transform = v; }
  }
  /** The film between two circles: wide at the big one, narrowing to `waist`, wrapping the small one. */
  private skinPath(c1: P, c2: P, rb: number, waist: number) {
    const R = this.R, a = Math.atan2(c2.y - c1.y, c2.x - c1.x), d = Math.hypot(c2.x - c1.x, c2.y - c1.y);
    if (waist <= 0.5 || d < 1) return "";
    const s1 = Math.min(0.9, (waist / R) * 0.95), s2 = Math.min(1.35, (waist / Math.max(4, rb)) * 0.95);
    const p1 = at(c1, a + s1, R - 1), p2 = at(c1, a - s1, R - 1), q1 = at(c2, a + Math.PI - s2, rb - 1), q2 = at(c2, a + Math.PI + s2, rb - 1);
    const mid = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }, nx = -Math.sin(a), ny = Math.cos(a), h = waist / 2;
    const m1 = { x: mid.x + nx * h, y: mid.y + ny * h }, m2 = { x: mid.x - nx * h, y: mid.y - ny * h };
    const f = (n: number) => n.toFixed(2);
    return `M${f(p1.x)} ${f(p1.y)} Q${f(m1.x)} ${f(m1.y)} ${f(q1.x)} ${f(q1.y)} L${f(q2.x)} ${f(q2.y)} Q${f(m2.x)} ${f(m2.y)} ${f(p2.x)} ${f(p2.y)} Z`;
  }

  // ── Water: the jelly bounce and the rings ──
  /** A hit starts at rest and dents in (sin); a release starts stretched and springs back (cos). Damped, they overlap. */
  private kick(amp: number, ang: number, release: boolean) { this.wobs.push({ t0: performance.now(), amp, ang, release }); }
  private jiggle(now: number) {
    let sum = 0;
    for (let i = this.wobs.length - 1; i >= 0; i--) {
      const w = this.wobs[i], u = (now - w.t0) / 1000;
      if (u > 1.8) { this.wobs.splice(i, 1); continue; }
      sum += w.amp * Math.exp(-u * 3.6) * (w.release ? Math.cos(u * 15) : Math.sin(u * 15));
    }
    return sum;
  }
  /** Rings that open across the big bubble from where the drop touched it: a bright crest and a soft dark trough. */
  private ripple(ang: number, count: number, reach: number, strength: number) {
    const S = this.env.size(), R = S / 2, waves = this.env.waves, now = performance.now();
    waves.setAttribute("viewBox", `0 0 ${S} ${S}`);
    const x = (R + Math.cos(ang) * (R - 3)).toFixed(2), y = (R + Math.sin(ang) * (R - 3)).toFixed(2);
    for (let i = 0; i < count; i++) {
      const g = document.createElementNS(NS, "g"), crest = document.createElementNS(NS, "circle"), trough = document.createElementNS(NS, "circle");
      crest.setAttribute("class", "ab-crest"); trough.setAttribute("class", "ab-trough");
      for (const c of [trough, crest]) { c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", "0"); g.appendChild(c); }
      g.style.opacity = "0";
      waves.appendChild(g);
      this.rings.push({ g, crest, trough, t0: now + i * 190, dur: 1300 + i * 170, reach: reach * (S / 66) * (1 - i * 0.14), a: strength * (1 - i * 0.24) });
    }
  }
  private drawRings(now: number) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const w = this.rings[i], p = (now - w.t0) / w.dur;
      if (p < 0) continue;
      if (p >= 1) { w.g.remove(); this.rings.splice(i, 1); continue; }
      const rad = 1 + w.reach * (1 - Math.pow(1 - p, 2.6)), thick = 1.9 - p * 1.1;
      w.crest.setAttribute("r", rad.toFixed(2)); w.crest.setAttribute("stroke-width", thick.toFixed(2));
      w.trough.setAttribute("r", (rad + thick + 0.4).toFixed(2)); w.trough.setAttribute("stroke-width", (thick * 0.8).toFixed(2));
      w.g.style.opacity = (w.a * (p < 0.1 ? p / 0.1 : Math.pow(1 - (p - 0.1) / 0.9, 1.6))).toFixed(3);
    }
  }

  private hideNow() {
    this.go("hidden");
    this.wobs = [];
    for (const w of this.rings) w.g.remove();
    this.rings = [];
    this.env.skin.setAttribute("d", "");
    this.setBulge(0, 0);
    this.shape(1, 1, 0);
    this.place(this.center(), 0);
  }
  /** Frames only while something moves (at rest it costs nothing). */
  private wake() {
    if (this.frame || this.dead) return;
    this.lastT = 0;
    this.frame = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.frame = 0;
    if (this.dead) return;
    const c1 = this.center(), R = this.R, r = this.r, skin = this.env.skin;
    const dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    const phase = now / 1000;
    let hold = 0; // a stretch the drop holds on the big bubble while it comes out
    if (this.state === "out") {
      // it drifts slowly around the big bubble; where it wouldn't fit (an edge) it slides around the rim
      const box = this.bounds();
      if (!this.fitsAt(this.orbitA, c1, box)) {
        for (let d = 0.12; d <= Math.PI; d += 0.12) {
          if (this.fitsAt(this.orbitA + this.orbitDir * d, c1, box)) { this.orbitA += this.orbitDir * Math.min(d, dt * 2.4); break; }
          if (this.fitsAt(this.orbitA - this.orbitDir * d, c1, box)) { this.orbitA -= this.orbitDir * Math.min(d, dt * 2.4); break; }
        }
      } else {
        const next = this.orbitA + this.orbitDir * dt * (0.16 + Math.sin(phase * 0.37) * 0.06);
        if (this.fitsAt(next, c1, box)) this.orbitA = next; else this.orbitDir = -this.orbitDir;
      }
      const want = at(c1, this.orbitA, R + r + 6 + Math.sin(phase * 1.3) * 2.5);
      // glued: it moves with the big bubble, with only a hair of give (never left behind)
      const cur = { x: this.bpos.x + r, y: this.bpos.y + r }, nx = cur.x + (want.x - cur.x) * 0.55, ny = cur.y + (want.y - cur.y) * 0.55;
      const off = Math.hypot(nx - want.x, ny - want.y), cap = 2.5;
      this.place(off > cap ? { x: want.x + ((nx - want.x) * cap) / off, y: want.y + ((ny - want.y) * cap) / off } : { x: nx, y: ny }, this.bscale + (1 - this.bscale) * 0.12);
      this.shape(1, 1, 0);
      skin.setAttribute("d", "");
    } else if (this.state === "budding") {
      // like a drop jumping out of water: the surface rises in a hump, the drop forms on top held by a neck, the neck
      // pinches, the drop springs out a little and settles round; the big one recoils and a ring opens from there
      const t = clamp01((now - this.t0) / BUD_MS), PINCH = 0.72, d0 = R - r * 0.6, d1 = R + r + 6, a = this.dirA;
      const u = Math.max(0, ((t - PINCH) * BUD_MS) / 1000);
      const dist = t < PINCH ? d0 + (d1 - 3 - d0) * smooth(seg(t, 0.04, PINCH)) : d1 - 3 + 3 * (1 - Math.exp(-u * 7) * Math.cos(u * 13));
      const c2 = at(c1, a, dist), scale = 0.3 + 0.7 * smooth(seg(t, 0, 0.55));
      this.place(c2, scale);
      const k = t < PINCH ? 0.16 * smooth(seg(t, 0.35, PINCH)) : 0.16 * Math.exp(-u * 6) * Math.cos(u * 22);
      this.shape(1 + k, 1 - k * 0.6, a);
      skin.setAttribute("d", t < PINCH ? this.skinPath(c1, c2, r * scale, r * 1.35 * (1 - smooth(seg(t, 0.2, PINCH)))) : "");
      if (t < PINCH) hold = 0.07 * smooth(seg(t, 0, 0.45));
      else if (this.marks === 0) { this.marks = 1; this.kick(0.07, a, true); this.ripple(a, 2, 46, 0.85); }
      if (t >= 1) this.go("out");
    } else if (this.state === "joining") {
      // like a drop into water: it lifts a hair, falls in speeding up (long as it falls), flattens as it touches and
      // sinks in; the surface dents there and bounces back, rings open across the bubble, and a tiny drop jumps up
      // from that spot and falls back in with one more small ring
      const t = clamp01((now - this.t0) / JOIN_MS), TOUCH = 0.4, a = this.dirA;
      const touch = R + r - 4, inside = R - r * 0.7, lift = this.joinFrom + 5;
      if (t < 0.6) {
        let dist: number, scale = 1;
        if (t < 0.2) { dist = this.joinFrom + (lift - this.joinFrom) * smooth(seg(t, 0, 0.2)); this.shape(1, 1, a); }
        else if (t < TOUCH) { const f = seg(t, 0.2, TOUCH); dist = lift + (touch - lift) * f * f; this.shape(1 + 0.2 * f * f, 1 - 0.1 * f * f, a); }
        else {
          const k = seg(t, TOUCH, 0.58), fl = smooth(seg(t, TOUCH, 0.47));
          dist = touch + (inside - touch) * (1 - (1 - k) * (1 - k));
          scale = 1 - smooth(seg(t, TOUCH - 0.02, 0.6));
          this.shape(1.2 - 0.42 * fl, 0.9 + 0.22 * fl, a);
        }
        const c2 = at(c1, a, dist);
        this.place(c2, scale);
        const waist = r * 1.4 * smooth(seg(t, TOUCH - 0.03, TOUCH + 0.04)) * (1 - smooth(seg(t, 0.46, 0.6)));
        skin.setAttribute("d", this.skinPath(c1, c2, Math.max(2, r * scale), waist));
        if (t >= TOUCH && this.marks === 0) { this.marks = 1; this.kick(-0.13, a, false); this.ripple(a, 3, 70, 1); }
      } else if (t < 0.86) {
        // the little jump back up from where it went in (held by a thin neck on the way up), and its fall
        const js = seg(t, 0.6, 0.86), h = Math.sin(Math.PI * js), sc = 0.27 * Math.sqrt(h);
        const cj = at(c1, a, R - 3 + 9 * h);
        this.place(cj, sc);
        this.shape(1 + 0.25 * (1 - h), 1 - 0.1 * (1 - h), a);
        skin.setAttribute("d", js < 0.5 ? this.skinPath(c1, cj, Math.max(1.5, r * sc), r * 0.5 * (1 - js * 2)) : "");
      } else {
        this.place(c1, 0); this.shape(1, 1, 0); skin.setAttribute("d", "");
        if (this.marks === 1) { this.marks = 2; this.kick(-0.035, a, false); this.ripple(a, 1, 44, 0.55); }
      }
      if (t >= 1) this.go("hidden");
    }
    const last = this.wobs[this.wobs.length - 1];
    this.setBulge(hold + this.jiggle(now), last ? last.ang : this.dirA);
    this.drawRings(now);
    if (this.state !== "hidden" || this.wobs.length || this.rings.length) this.frame = requestAnimationFrame(this.loop);
    else { this.setBulge(0, 0); this.place(c1, 0); }
  };
}
