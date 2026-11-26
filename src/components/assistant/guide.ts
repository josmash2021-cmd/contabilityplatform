// ── The bubble's hands: it flies to what it shows, lights it, presses it, types into it ──
// "Hazlo por mí" (auto): it does each step with the app's own buttons while the person watches. "Enséñame" (teach): it
// lights each step and waits for the person to do it. Only a tap on the bubble itself stops either (owner,
// 2026-11-25). Plain DOM on purpose (the elements are React's, but the bubble, its cloud and the glow
// are its own). From the prototype the owner approved, made more human (owner, 2026-11-24): soft arcs that start calm
// and land gently, the page and the bubble move together (it "pulls" the page), it presses where it stands (no going
// back and forth), the glow appears in place and follows its element if the page redraws, words come in one by one
// without blur, no darkening. On a phone it opens "Más" to reach the pages that aren't on the tab bar.

export type GuideMode = "auto" | "teach";
export type Step = {
  /** What it says while doing it (auto) and while showing it (teach). */
  auto: string;
  teach: string;
  /** A page from the menu: it taps the menu item (on a phone, through "Más" when needed), else it goes there. */
  nav?: string;
  /** A shortcut on the page they're on that gets there too (Home's "Crear una meta", "Confirmar"...): when it's on
   *  screen the bubble taps it instead of going through the menu (owner, 2026-11-25: whatever is more direct). */
  via?: string;
  /** What it says when it uses that shortcut (not the menu's words: it's pointing at Home's own button). */
  viaSay?: { auto: string; teach: string };
  /** A page with details (?month=…): it goes there itself. */
  go?: string;
  /** What it works on: a CSS selector (the first one on screen) or a finder (the tour: a section by its heading). */
  el?: string;
  find?: () => HTMLElement | null;
  act?: "tap" | "type" | "pick" | "show";
  value?: string;
  /** Checked right before the step: false skips it. */
  when?: () => boolean;
  /** Extra time it stays (lit, with its words) after reading, for a last step that only shows where to go on. */
  hold?: number;
  /** When what it shows isn't there: "say" its words anyway, or "skip" quietly (sections that a page may not have). */
  optional?: "say" | "skip";
  /** The tour: it goes down to the end of the page with the page, saying its words. */
  end?: boolean;
  /** The cloud's small line instead of "Paso 2 de 4" ("Página 2 de 7"). */
  label?: string;
};
export type GuideEnd = "done" | "stopped" | "missing";
/** An answer the bubble offers in its cloud ("→ $6,000 sugerido"). */
export type Choice = { label: string; value: string; hint?: string; kind?: "all" | "yes" };
/** What a scripted task (one that asks as it goes, like a goal) can do with the bubble's hands. */
export type ScriptKit = {
  mode: GuideMode;
  alive: () => boolean;
  /** Goes to a page from the menu (on a phone through "Más"). */
  nav: (path: string, words: { auto: string; teach: string }, label: string, via?: string) => Promise<void>;
  /** The first element on screen for a selector, waiting for it. */
  find: (sel: string, ms?: number) => Promise<HTMLElement | null>;
  /** Flies to it and says something (no answer needed). */
  show: (el: HTMLElement, label: string, text: string) => Promise<void>;
  /** Flies to it, asks in its cloud and waits: the value chosen, "dom" when `until` became true, null when stopped. */
  ask: (el: HTMLElement, label: string, text: string, choices: Choice[], opts?: { allow?: HTMLElement; until?: () => boolean }) => Promise<string | null>;
  /** Presses it (saying `text` first when given). */
  tap: (el: HTMLElement, label?: string, text?: string) => Promise<void>;
  /** Types into it, letter by letter. */
  type: (el: HTMLElement, value: string) => Promise<void>;
  /** Picks a value in a select. */
  pick: (el: HTMLElement, value: string) => Promise<void>;
};
type P = { x: number; y: number };

export type GuideEnv = {
  bubble: HTMLElement;
  cloud: HTMLElement;
  /** The drop that joins the bubble and its cloud (an svg with a <g> of three paths: fill, left side, right side). */
  neck: SVGSVGElement;
  /** Where the bubble rests (viewport coordinates of its top-left corner). */
  home: () => P;
  size: () => number;
  navigate: (path: string) => void;
  /** Pieces of the bubble's own UI: taps there never stop it. */
  own: (target: Node) => boolean;
  /** "Paso 2 de 4" (n: null when the steps depend on the page, e.g. a budget that's already listed). */
  stepLabel: (i: number, n: number | null) => string;
  /** What it says when it opens the phone's "Más" sheet. */
  moreWords: { auto: string; teach: string };
  /** The bubble moved by (dx, dy): its little companion moves with it in the same frame (buddy.ts). */
  onMove?: (dx: number, dy: number) => void;
  /** The drawn bubble (orb.ts): its star becomes a wave while the words come in, then a star again. */
  voice?: { say: (words: string[], wordMs: number) => void; hush: () => void };
};

// Its words come in one every WORD_MS; then it waits long enough to read the whole line calmly (owner, 2026-11-25:
// "los quita rápido, no se alcanza a leer"): a pause plus a little more per word, and never under MIN_READ_MS.
const WORD_MS = 150, PAUSE_MS = 1400, PER_WORD_MS = 110, MIN_READ_MS = 2600;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/**
 * How a hand moves (the "minimum jerk" curve of human reaching): it eases out of rest and into its spot with no jolt,
 * and its top speed stays low (1.9× the average; the old sine was 1.6×, a sharp ease-out 3×).
 */
const humanEase = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 - 15 * t + 6 * t * t));

/** On screen: has a real size, not hidden, not behind an open dialog (aria-hidden), not a screen-reader-only text. */
export function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2 && !el.closest("[hidden],[aria-hidden='true'],[inert],.sr-only");
}
const firstVisible = (sel: string) => [...document.querySelectorAll(sel)].find(visible) ?? null;

/** The box that scrolls this element: the nearest ancestor that really scrolls, else the page. */
function scrollBoxOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}
const isPage = (box: HTMLElement) => box === document.scrollingElement || box === document.documentElement || box === document.body;
/**
 * The part of the screen that's really seen, in the page's own coordinates (where fixed things are placed). On a phone
 * the keyboard or a pinch zoom shrink and pan it; placing by the whole window lost the bubble off screen (owner).
 */
export function viewArea(): { left: number; top: number; right: number; bottom: number } {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const left = vv ? vv.offsetLeft : 0, top = vv ? vv.offsetTop : 0;
  const right = left + (vv ? vv.width : window.innerWidth), bottom = top + (vv ? vv.height : window.innerHeight);
  return { left, top, right: Math.min(right, window.innerWidth), bottom: Math.min(bottom, window.innerHeight) };
}
/** The top of the phone's tab bar, or the bottom of what's seen. */
export function bottomLimit(): number {
  const tab = document.querySelector("nav[data-tabbar]");
  const seen = viewArea().bottom;
  return tab && visible(tab) ? Math.min(seen, tab.getBoundingClientRect().top) : seen;
}
/** The visible part of a scrolling box, above the tab bar. */
function areaOf(box: HTMLElement) {
  const limit = bottomLimit();
  const seenTop = viewArea().top;
  if (isPage(box)) return { top: seenTop, bottom: limit };
  const b = box.getBoundingClientRect();
  return { top: Math.max(seenTop, b.top), bottom: Math.min(b.bottom, limit) };
}
/** How far a box should scroll so the element sits comfortably in view (0: it already does). */
function scrollNeeded(el: HTMLElement): { box: HTMLElement; delta: number } {
  const box = scrollBoxOf(el);
  const r = el.getBoundingClientRect();
  const area = areaOf(box);
  const margin = 28;
  if (r.top >= area.top + margin && r.bottom <= area.bottom - margin) return { box, delta: 0 };
  // Big things: their top a third of the way down; small ones: in the middle.
  const want = r.height > (area.bottom - area.top) * 0.5 ? area.top + (area.bottom - area.top) * 0.18 : (area.top + area.bottom) / 2 - r.height / 2;
  const max = Math.max(0, box.scrollHeight - box.clientHeight);
  const to = Math.max(0, Math.min(max, box.scrollTop + (r.top - want)));
  return { box, delta: Math.round(to - box.scrollTop) };
}

/**
 * Scrolls a box to `to` with the bubble's own curve, frame by frame, instead of the browser's smooth scroll (which on
 * phones can jump in one go). A touch of the person's stops it.
 */
export function glide(box: HTMLElement, to: number, msIn?: number): Promise<void> {
  return new Promise((done) => {
    const from = box.scrollTop;
    const max = Math.max(0, box.scrollHeight - box.clientHeight);
    const target = Math.max(0, Math.min(max, Math.round(to)));
    const dist = target - from;
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (Math.abs(dist) < 2 || still) { box.scrollTop = target; done(); return; }
    const ms = msIn ?? Math.max(550, Math.min(1700, 350 + Math.abs(dist) * 1.0));
    const start = performance.now();
    let over = false;
    // Marked while it scrolls (the browser checks measure only this, not the page's own reflows).
    document.documentElement.dataset.abGlide = "1";
    const end = () => { delete document.documentElement.dataset.abGlide; done(); };
    const quit = () => { over = true; };
    box.addEventListener("touchstart", quit, { once: true, passive: true });
    box.addEventListener("wheel", quit, { once: true, passive: true });
    const step = (now: number) => {
      if (over) { end(); return; }
      const t = Math.min(1, (now - start) / ms);
      box.scrollTop = from + dist * humanEase(t);
      if (t < 1) requestAnimationFrame(step);
      else { box.removeEventListener("touchstart", quit); box.removeEventListener("wheel", quit); end(); }
    };
    requestAnimationFrame(step);
  });
}

/** Sets a React-controlled input's value as if typed (React listens to the native setter + input event). */
function setNative(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
/** Where a heading's words end (a block heading is wider than its text). */
function textBox(el: HTMLElement): DOMRect {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  } catch { /* fall back to the element */ }
  return el.getBoundingClientRect();
}

export class Guide {
  private env: GuideEnv;
  private pos: P = { x: 0, y: 0 };
  private flight = 0;
  /** The flight in progress ends (its promise resolves) when a new one starts or it's stopped. */
  private landed: (() => void) | null = null;
  private run: { mode: GuideMode; token: number; el: HTMLElement | null } | null = null;
  private token = 0;
  /** What it's working on now (marked data-ab-here; no frame is drawn, owner 2026-11-24). */
  private here: HTMLElement | null = null;
  private answer: ((v: string | null) => void) | null = null;
  private readDone: (() => void) | null = null;
  private stepDone: (() => void) | null = null;
  private stopped = false;
  private currentAct: Step["act"] = undefined;
  /** On the last step that only shows where they go on: their tap there just ends the wait (it's what we asked). */
  private lastShow = false;
  private reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** When the person last stopped it (a tap on the bubble itself stops it; that tap's click mustn't open the panel). */
  stoppedAt = 0;

  constructor(env: GuideEnv) {
    this.env = env;
    this.setPos(env.home());
    document.addEventListener("pointerdown", this.onDown, true);
    document.addEventListener("pointerup", this.onUp, true);
    // A touch on its cloud (an answer) or on the bubble is never "outside" for an open sheet: Radix closes a sheet
    // on a pointerdown outside it, and the cloud lives outside the sheet. That closed "Nueva meta" when they picked
    // an answer, and the bubble went to its corner (owner, 2026-11-25). Our own capture listener above still sees it.
    for (const el of [env.cloud, env.bubble]) {
      el.addEventListener("pointerdown", (e) => e.stopPropagation());
      // keep the focus where it is (tapping an answer mustn't pull it out of the sheet)
      el.addEventListener("mousedown", (e) => e.preventDefault());
    }
    document.addEventListener("pointercancel", this.onCancel, true);
    document.addEventListener("click", this.onClick, true);
    window.visualViewport?.addEventListener("resize", this.onView);
    window.visualViewport?.addEventListener("scroll", this.onView);
  }
  private viewFrame = 0;
  /** What's seen changed (keyboard, zoom, rotation): if it's working, it stays by what it works on, inside the view. */
  private onView = () => {
    cancelAnimationFrame(this.viewFrame);
    this.viewFrame = requestAnimationFrame(() => {
      if (!this.run) { this.rest(); return; }
      if (this.landed) return; // in flight: it lands where it's going
      const el = this.here;
      if (el && el.isConnected) this.setPos(this.spotFor(el.getBoundingClientRect(), el, this.currentAct === "tap" || this.currentAct === "type" || this.currentAct === "pick" ? this.currentAct : "show"));
      else this.setPos(this.clampPos(this.pos));
      if (this.env.cloud.classList.contains("ab-on") && this.cloudAt) this.placeCloud(this.pos, el?.getBoundingClientRect() ?? this.cloudAt.avoid ?? undefined, this.cloudAt.aboveFirst, false);
    });
  };

  destroy() {
    this.stop();
    document.removeEventListener("pointerdown", this.onDown, true);
    document.removeEventListener("pointerup", this.onUp, true);
    document.removeEventListener("pointercancel", this.onCancel, true);
    document.removeEventListener("click", this.onClick, true);
    window.visualViewport?.removeEventListener("resize", this.onView);
    window.visualViewport?.removeEventListener("scroll", this.onView);
    cancelAnimationFrame(this.flight);
    cancelAnimationFrame(this.viewFrame);
  }

  get busy() { return this.run !== null; }
  get position() { return { ...this.pos }; }

  // ── Moving ──
  setPos(p: P) {
    const dx = p.x - this.pos.x, dy = p.y - this.pos.y;
    this.pos = p;
    this.env.bubble.style.setProperty("--x", `${p.x}px`);
    this.env.bubble.style.setProperty("--y", `${p.y}px`);
    this.env.onMove?.(dx, dy);
  }
  /** Back to its corner (also after the window or the page changes). */
  rest(fly = false) {
    if (this.run) return;
    if (fly) void this.flyTo(this.env.home()); else this.setPos(this.env.home());
  }
  /** How long a flight of this length takes: calm, the farther the longer (0.75–2.4 s; a long one across the screen
   *  stays well under its top speed, so it never looks rushed). */
  private flightMs(dist: number) { return Math.max(750, Math.min(2400, 450 + dist * 1.4)); }
  /**
   * A soft arc that bows upward like a hand's gesture, tighter near the end so it lands straight on its spot, with a
   * calm start and a long gentle landing.
   */
  flyTo(to: P, msIn?: number): Promise<void> {
    return new Promise((resolve) => {
      cancelAnimationFrame(this.flight);
      this.landed?.();
      let over = false;
      const done = () => { if (over) return; over = true; if (this.landed === done) this.landed = null; resolve(); };
      this.landed = done;
      const from = { ...this.pos };
      const b = this.env.bubble;
      if (this.reduce) { this.setPos(to); done(); return; }
      const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1;
      if (dist < 2) { this.setPos(to); done(); return; }
      const ms = msIn ?? this.flightMs(dist);
      // The side of the arc: the one that bows upward (a vertical move bows outward, away from the screen's edge).
      let nx = -dy / dist, ny = dx / dist;
      if (ny > 0 || (Math.abs(ny) < 0.2 && (from.x + to.x) / 2 + nx * 40 > viewArea().right - 30)) { nx = -nx; ny = -ny; }
      const bend = Math.min(80, dist * 0.2);
      const c1 = { x: from.x + dx * 0.3 + nx * bend, y: from.y + dy * 0.3 + ny * bend };
      const c2 = { x: from.x + dx * 0.78 + nx * bend * 0.4, y: from.y + dy * 0.78 + ny * bend * 0.4 };
      const start = performance.now();
      b.classList.add("ab-flying");
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms), e = humanEase(t), u = 1 - e;
        this.setPos({
          x: u * u * u * from.x + 3 * u * u * e * c1.x + 3 * u * e * e * c2.x + e * e * e * to.x,
          y: u * u * u * from.y + 3 * u * u * e * c1.y + 3 * u * e * e * c2.y + e * e * e * to.y,
        });
        if (t < 1) this.flight = requestAnimationFrame(step);
        else { b.classList.remove("ab-flying", "ab-land"); void b.offsetWidth; b.classList.add("ab-land"); done(); }
      };
      this.flight = requestAnimationFrame(step);
    });
  }
  private clampPos(p: P): P {
    const size = this.env.size(), a = viewArea();
    return { x: Math.min(Math.max(a.left + 8, p.x), a.right - size - 8), y: Math.min(Math.max(a.top + 8, p.y), bottomLimit() - size - 8) };
  }
  /**
   * Where it stands for an element: for a button or a field, on its right end like a finger about to touch it (it
   * presses right there); for a heading, just after its words.
   */
  private spotFor(r: DOMRect, el: HTMLElement, act: Step["act"]): P {
    const size = this.env.size();
    if (act === "show" && /^H[1-6]$/.test(el.tagName)) {
      const tr = textBox(el);
      const dy = r.top - el.getBoundingClientRect().top;
      const top = tr.top + dy, right = tr.right;
      if (right + size + 12 < viewArea().right) return this.clampPos({ x: right + 10, y: top + tr.height / 2 - size / 2 });
      return this.clampPos({ x: right - size * 0.9, y: top + tr.height + 6 });
    }
    if (act === "show" && r.height > size * 2) return this.clampPos({ x: r.right - size * 0.75, y: r.top + 14 });
    // Like a finger pointing from below: on the lower right corner, mostly outside it (never over the words).
    return this.clampPos({ x: r.right - size * 0.3, y: r.bottom - size * 0.28 });
  }

  // ── Its cloud ──
  /**
   * Next to the bubble, on the side that doesn't cover what it's showing. For a heading it prefers going above it:
   * what the heading talks about comes right under it.
   */
  talk(html: string, at: P = this.pos, avoid?: DOMRect, aboveFirst = false, choices?: Choice[]) {
    const say = this.env.cloud;
    say.classList.remove("ab-on");
    say.innerHTML = html;
    say.classList.toggle("ab-asking", !!choices?.length);
    if (choices?.length) {
      const box = document.createElement("div");
      box.className = "ab-opts";
      for (const c of choices) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.value = c.value;
        if (c.kind) b.dataset.kind = c.kind;
        b.textContent = c.label;
        if (c.hint) { const h = document.createElement("small"); h.textContent = c.hint; b.append(" ", h); }
        b.addEventListener("click", () => { const a = this.answer; this.answer = null; a?.(c.value); });
        box.appendChild(b);
      }
      say.appendChild(box);
    }
    this.cloudAt = { avoid: avoid ?? null, aboveFirst };
    this.placeCloud(at, avoid, aboveFirst, true);
  }
  /** Where the cloud goes next to the bubble (inside what's seen), and the drop that joins them. */
  private cloudAt: { avoid: DOMRect | null; aboveFirst: boolean } | null = null;
  private placeCloud(at: P, avoid: DOMRect | undefined, aboveFirst: boolean, appear: boolean) {
    const say = this.env.cloud, size = this.env.size();
    const area = viewArea(), limit = bottomLimit();
    const vl = area.left, vr = area.right, vt = area.top;
    const w = Math.min(270, vr - vl - 24);
    say.style.width = `${w}px`;
    const h = say.offsetHeight;
    // Above a heading it may go up to the screen's top edge (over the app's top bar), not over what it explains.
    const fits = (x: number, y: number) => x >= vl + 12 && x + w <= vr - 12 && y >= vt + (aboveFirst ? 2 : 12) && y + h <= limit - 8;
    const hits = (x: number, y: number) => !!avoid && x < avoid.right + 6 && x + w > avoid.left - 6 && y < avoid.bottom + 6 && y + h > avoid.top - 6;
    // Room between the bubble and its cloud for the drop that joins them.
    const below = at.y + size + 24, above = at.y - h - 24;
    const side = { x: at.x + size + 22, y: at.y + 4 }, left = { x: at.x - w - 22, y: at.y + 4 };
    const under = { x: Math.min(Math.max(vl + 12, at.x + size - w), vr - w - 12), y: below };
    const over = { x: Math.min(Math.max(vl + 12, at.x + size - w), vr - w - 12), y: Math.min(at.y, avoid?.top ?? at.y) - h - 22 };
    const options: P[] = aboveFirst ? [over, side, left, under] : [side, under, over, left];
    const pick = options.find((o) => fits(o.x, o.y) && !hits(o.x, o.y)) ?? options.find((o) => fits(o.x, o.y))
      ?? { x: Math.min(Math.max(vl + 12, at.x + size - w), vr - w - 12), y: Math.min(Math.max(vt + 12, above), limit - h - 8) };
    say.style.left = `${Math.round(pick.x)}px`;
    say.style.top = `${Math.round(pick.y)}px`;
    if (!appear) { this.tie(at, pick, w, h, false); return; }
    // The drop grows out of the bubble first, then the cloud.
    requestAnimationFrame(() => { this.tie(at, pick, w, h); setTimeout(() => say.classList.add("ab-on"), this.reduce ? 0 : 130); });
  }
  hush() { this.env.cloud.classList.remove("ab-on"); this.env.neck.classList.remove("ab-on"); this.quietStar(); }
  /**
   * While its words come in, its star becomes a soft, slow wave that follows them (owner chose bubble "2",
   * 2026-11-25), then turns back into the star (orb.ts). Never in the way of its words.
   */
  private talkStar(words: string[]) {
    if (this.reduce || !words.length) return;
    try { this.env.voice?.say(words, WORD_MS); } catch { /* the words go on */ }
  }
  /** The cloud went (or it was stopped): the wave settles back into the star softly. */
  private quietStar() {
    try { this.env.voice?.hush(); } catch { /* nothing to settle */ }
  }
  /**
   * The drop (owner chose it, 2026-11-24): from just inside the bubble's rim to the cloud's nearest edge, narrow at the
   * bubble and wide at the cloud, with a soft waist; white like the cloud, with its border on the sides.
   */
  private tie(at: P, cloud: P, w: number, h: number, grow = true) {
    const neck = this.env.neck, size = this.env.size();
    const g = neck.querySelector("g"), [fill, l, r] = [...neck.querySelectorAll("path")];
    if (!g || !fill || !l || !r) return;
    const cx = at.x + size / 2, cy = at.y + size / 2;
    let sx = cx, sy = cy, ex: number, ey: number, horizontal = false;
    if (cloud.y > at.y + size - 4) { sy = cy + size * 0.34; ex = Math.min(Math.max(cx, cloud.x + 30), cloud.x + w - 30); ey = cloud.y + 1.5; }
    else if (cloud.y + h < at.y + 4) { sy = cy - size * 0.34; ex = Math.min(Math.max(cx, cloud.x + 30), cloud.x + w - 30); ey = cloud.y + h - 1.5; }
    else { horizontal = true; sx = cloud.x > cx ? cx + size * 0.34 : cx - size * 0.34; ex = cloud.x > cx ? cloud.x + 1.5 : cloud.x + w - 1.5; ey = Math.min(Math.max(cy, cloud.y + 24), cloud.y + h - 24); }
    const wT = 13, wB = 46;
    let d: (k: number) => string, base: string;
    if (!horizontal) {
      const span = ey - sy;
      d = (k) => `M${sx + k * wT / 2} ${sy} C${sx + k * wT / 2} ${sy + span * 0.55} ${ex + k * wB / 2} ${ey - span * 0.5} ${ex + k * wB / 2} ${ey}`;
      base = `L${ex + wB / 2} ${ey} C${ex + wB / 2} ${ey - span * 0.5} ${sx + wT / 2} ${sy + span * 0.55} ${sx + wT / 2} ${sy} Z`;
    } else {
      const span = ex - sx;
      d = (k) => `M${sx} ${cy + k * wT / 2} C${sx + span * 0.55} ${cy + k * wT / 2} ${ex - span * 0.5} ${ey + k * wB / 2} ${ex} ${ey + k * wB / 2}`;
      base = `L${ex} ${ey + wB / 2} C${ex - span * 0.5} ${ey + wB / 2} ${sx + span * 0.55} ${cy + wT / 2} ${sx} ${cy + wT / 2} Z`;
    }
    fill.setAttribute("d", `${d(-1)} ${base}`);
    l.setAttribute("d", d(-1));
    r.setAttribute("d", d(1));
    g.style.transformOrigin = `${sx}px ${sy}px`;
    neck.classList.add("ab-on");
    if (!grow) { g.style.transition = "none"; g.style.transform = "none"; return; }
    g.style.transition = "none";
    g.style.transform = horizontal ? "scaleX(0.05)" : "scaleY(0.05)";
    requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transition = ""; g.style.transform = "none"; }));
  }
  /** Says a line by itself (no steps), word by word, then goes quiet. */
  /** Once it's back in its corner, it says something there (why it stopped). */
  async noteAtHome(text: string) {
    for (let i = 0; i < 30 && this.landed; i++) await sleep(100);
    if (this.run) return;
    await this.note(text, this.pos, 5200);
  }
  async note(text: string, at: P = this.pos, holdMs = 4200) {
    this.talk(`<div class="ab-spoken">${esc(text)}</div>`, at);
    const words = this.speak();
    await sleep(Math.max(holdMs, words * (WORD_MS + PER_WORD_MS) + 2600));
    this.hush();
  }
  /** The cloud's words come in one by one (a fade, never a blur); returns how many. */
  private speak(): number {
    const box = this.env.cloud.querySelector(".ab-spoken");
    if (!box) return 0;
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    let n = 0;
    const said: string[] = [];
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of (node.textContent ?? "").split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const w = document.createElement("span");
        w.className = "ab-w";
        w.textContent = part;
        said.push(part);
        w.style.animationDelay = `${this.reduce ? 0 : n++ * WORD_MS}ms`;
        frag.appendChild(w);
      }
      node.replaceWith(frag);
    }
    this.talkStar(said);
    return n;
  }
  private say(label: string, text: string, at?: P, avoid?: DOMRect, aboveFirst = false, choices?: Choice[]) {
    this.talk(`${label ? `<div class="ab-step"><i></i>${esc(label)}</div>` : ""}<div class="ab-spoken">${esc(text)}</div>`, at, avoid, aboveFirst, choices);
    return this.speak();
  }
  private readMs(words: number) { return Math.max(MIN_READ_MS, words * (WORD_MS + PER_WORD_MS) + PAUSE_MS); }

  // ── What it works on: no frame around it (owner: "quítale los bordes"); the bubble and its cloud say it ──
  private light(el: HTMLElement) {
    this.unlight();
    this.here = el;
    el.setAttribute("data-ab-here", "");
  }
  private unlight() {
    this.here?.removeAttribute("data-ab-here");
    this.here = null;
  }
  /** It leans toward what it shows, once. */
  private pointAt(r: DOMRect) {
    const size = this.env.size(), b = this.env.bubble;
    const bx = this.pos.x + size / 2, by = this.pos.y + size / 2, tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const d = Math.hypot(tx - bx, ty - by) || 1;
    b.style.setProperty("--nx", `${((tx - bx) / d * 9).toFixed(1)}px`);
    b.style.setProperty("--ny", `${((ty - by) / d * 9).toFixed(1)}px`);
    b.classList.remove("ab-point"); void b.offsetWidth;
    b.classList.add("ab-point");
    setTimeout(() => b.classList.remove("ab-point"), 2300);
  }
  /** One press, where it stands: it dips toward the button (the button sinks too), one ripple, the real click. */
  private async tapOn(el: HTMLElement) {
    const size = this.env.size(), b = this.env.bubble;
    let r = el.getBoundingClientRect();
    // Its corner (where it waits, not over the words): back there first if the page moved.
    const corner = this.clampPos({ x: r.right - size * 0.3, y: r.bottom - size * 0.28 });
    if (Math.hypot(corner.x - this.pos.x, corner.y - this.pos.y) > 26) await this.flyTo(corner, 650);
    if (!this.alive()) return;
    r = el.getBoundingClientRect();
    // The point it really touches: inside the button, on its right part (owner: "presiona exactamente donde es").
    const a = viewArea();
    const tx = Math.min(Math.max(r.left + Math.min(r.width / 2, 22), r.right - Math.min(r.width * 0.28, 34)), a.right - 6);
    // (inside what's seen; a tab of the phone's bottom bar is pressed right on it)
    const ty = Math.min(Math.max(r.top + r.height / 2, a.top + 6), a.bottom - 6);
    // The press (owner chose "Gota", 2026-11-25): the bubble lets a little drop fall onto the point; where it lands the
    // button sinks a little and water rings open inside it (no ring around it, no lean). The real click as it lands.
    const R = size / 2, cx = this.pos.x + R, cy = this.pos.y + R;
    const ang = Math.atan2(ty - cy, tx - cx);
    const sx = cx + Math.cos(ang) * (R - 4), sy = cy + Math.sin(ang) * (R - 4);
    const ms = this.reduce ? 1 : 640;
    // the bubble gives a little as the drop leaves it
    b.querySelector<HTMLElement>(".ab-squash")?.animate?.([{ scale: "1" }, { scale: "0.95 1.03", offset: 0.35 }, { scale: "1.02 0.99", offset: 0.7 }, { scale: "1" }], { duration: this.reduce ? 1 : 720, easing: "ease-in-out" });
    const d = document.createElement("span");
    d.className = "ab-drop";
    d.style.setProperty("--ab-dsize", `${Math.round(size * 0.25)}px`);
    document.body.appendChild(d);
    const mid = { x: (sx + tx) / 2, y: Math.min(sy, ty) - 6 };
    d.animate?.([
      { translate: `${sx}px ${sy}px`, scale: "0.2" },
      { translate: `${sx}px ${sy}px`, scale: "1", offset: 0.3 },
      { translate: `${mid.x}px ${mid.y}px`, scale: "1", offset: 0.65, easing: "cubic-bezier(.55,0,1,.45)" },
      { translate: `${tx}px ${ty}px`, scale: "1.15" },
    ], { duration: ms, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" });
    await sleep(ms);
    if (!this.alive()) { d.remove(); return; }
    // it lands: it spreads and goes into the button
    d.animate?.([{ translate: `${tx}px ${ty}px`, scale: "1.15", opacity: 1 }, { translate: `${tx}px ${ty}px`, scale: "1.6", opacity: 0 }], { duration: this.reduce ? 1 : 200, fill: "forwards" });
    setTimeout(() => d.remove(), 260);
    el.classList.remove("ab-untap"); el.classList.add("ab-tapped");
    this.water(el, tx, ty);
    await sleep(this.reduce ? 0 : 150);
    el.classList.remove("ab-tapped"); el.classList.add("ab-untap");
    setTimeout(() => el.classList.remove("ab-untap"), 700);
    this.unlight();
    if (!this.alive()) return;
    el.click();
    await sleep(this.reduce ? 0 : 520);
  }
  /** Water rings inside what it pressed, from where the drop fell: a bright crest and a soft trough, clipped to the
   *  button's own shape (like the bubble's rings; nothing drawn around it). Marked with the point, for the checks. */
  private water(el: HTMLElement, tx: number, ty: number) {
    const r = el.getBoundingClientRect();
    const box = document.createElement("span");
    box.className = "ab-water";
    box.dataset.tx = String(Math.round(tx));
    box.dataset.ty = String(Math.round(ty));
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: getComputedStyle(el).borderRadius || "12px" });
    document.body.appendChild(box);
    if (this.reduce) { setTimeout(() => box.remove(), 300); return; }
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    box.appendChild(svg);
    const x = tx - r.left, y = ty - r.top;
    const reach = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) * 1.05;
    const rings = [0, 1].map((i) => {
      const g = document.createElementNS(NS, "g"), crest = document.createElementNS(NS, "circle"), trough = document.createElementNS(NS, "circle");
      crest.setAttribute("class", "ab-crest"); trough.setAttribute("class", "ab-trough");
      for (const c of [trough, crest]) { c.setAttribute("cx", x.toFixed(1)); c.setAttribute("cy", y.toFixed(1)); c.setAttribute("r", "0"); g.appendChild(c); }
      g.style.opacity = "0";
      svg.appendChild(g);
      return { g, crest, trough, delay: i * 170, dur: 1050 + i * 200, reach: reach * (1 - i * 0.25), a: 1 - i * 0.3 };
    });
    const t0 = performance.now();
    const step = (now: number) => {
      let left = 0;
      for (const w of rings) {
        const p = (now - t0 - w.delay) / w.dur;
        if (p < 0) { left++; continue; }
        if (p >= 1) { w.g.style.opacity = "0"; continue; }
        left++;
        const rad = 1 + w.reach * (1 - Math.pow(1 - p, 2.6)), thick = 1.9 - p * 1.1;
        w.crest.setAttribute("r", rad.toFixed(2)); w.crest.setAttribute("stroke-width", thick.toFixed(2));
        w.trough.setAttribute("r", (rad + thick + 0.4).toFixed(2)); w.trough.setAttribute("stroke-width", (thick * 0.8).toFixed(2));
        w.g.style.opacity = (w.a * (p < 0.1 ? p / 0.1 : Math.pow(1 - (p - 0.1) / 0.9, 1.6))).toFixed(3);
      }
      if (left) requestAnimationFrame(step); else box.remove();
    };
    requestAnimationFrame(step);
  }
  private touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  private async typeIn(el: HTMLInputElement, text: string) {
    // On a phone, focusing would open the keyboard: the bubble writes without it.
    if (!this.touch) el.focus({ preventScroll: true });
    setNative(el, "");
    el.classList.add("ab-caret");
    let v = "";
    for (const ch of text) {
      if (!this.alive()) break;
      v += ch;
      setNative(el, v);
      await sleep(this.reduce ? 0 : 190);
    }
    el.classList.remove("ab-caret");
  }

  // ── Waiting ──
  private waitRead(ms: number) {
    return new Promise<void>((done) => {
      const t = setTimeout(done, this.reduce ? 200 : ms);
      this.readDone = () => { clearTimeout(t); done(); };
    });
  }
  /** The first element on screen for a step, waiting for the page to show it (a page change, a sheet opening). */
  private async waitEl(locate: () => HTMLElement | null, ms = 8000): Promise<HTMLElement | null> {
    const until = performance.now() + ms;
    while (performance.now() < until && this.alive()) {
      const el = locate();
      if (el) return el;
      await sleep(100);
    }
    return null;
  }
  /** Waits until an element stops moving (a page that's still loading pushes things around). */
  private async settled(el: HTMLElement, ms = 900) {
    const until = performance.now() + ms;
    let last = el.getBoundingClientRect(), calm = 0;
    while (performance.now() < until && this.alive()) {
      await new Promise((r) => requestAnimationFrame(r));
      const r = el.getBoundingClientRect();
      calm = Math.abs(r.top - last.top) < 1 && Math.abs(r.left - last.left) < 1 && Math.abs(r.height - last.height) < 1 ? calm + 1 : 0;
      last = r;
      if (calm >= 6) return;
    }
  }
  /** After a page change: the new page is on, starts at its top (while it fades in) and has stopped loading. */
  private async arrived(path: string, oldPage: Element | null = null) {
    const want = path.split("?")[0];
    const until = performance.now() + 5000;
    while (performance.now() < until && this.alive() && location.pathname !== want) await sleep(60);
    // The address changes before the new page is drawn (its code may still be loading): wait for the page itself.
    while (oldPage && performance.now() < until && this.alive() && document.querySelector("main .page-fx > div") === oldPage) await sleep(60);
    const main = document.querySelector("main");
    if (main && main.scrollTop > 0) main.scrollTop = 0;
    let lastH = main?.scrollHeight ?? 0, calm = 0;
    const settle = performance.now() + 1800;
    while (performance.now() < settle && this.alive()) {
      await sleep(80);
      const h = main?.scrollHeight ?? 0;
      calm = h === lastH && !document.querySelector("main [role='status'][aria-busy='true'], main .animate-pulse") ? calm + 1 : 0;
      lastH = h;
      if (calm >= 3) break;
    }
  }
  /** Teach: waits until the person does the step (taps it, writes in it, picks it). */
  private waitPerson(step: Step, el: HTMLElement) {
    return new Promise<void>((done) => {
      let idle = 0;
      const finish = () => { clearTimeout(idle); el.removeEventListener("input", onInput); el.removeEventListener("change", onChange); this.stepDone = null; done(); };
      const onInput = () => { clearTimeout(idle); if ((el as HTMLInputElement).value) idle = window.setTimeout(finish, 1400); };
      const onChange = () => { if ((el as HTMLInputElement).value) finish(); };
      this.stepDone = finish;
      if (step.act === "type") { el.addEventListener("input", onInput); el.addEventListener("change", onChange); }
      if (step.act === "pick") el.addEventListener("change", onChange);
    });
  }

  // ── The person ──
  /**
   * The person's touch (owner, 2026-11-25): ONLY a tap on the bubble itself stops it. Touching anywhere else (the page,
   * scrolling to read, its cloud, the form it asks about) never cancels what it's doing; on the last step that only
   * shows where they go on, their tap just ends the wait.
   */
  /** Whether the last stop was the person's tap on the bubble (it then says why it stopped). */
  stoppedByPerson = false;
  private onDown = (e: PointerEvent) => {
    if (!this.run || !e.isTrusted) return;
    const target = e.target as Node;
    if (this.env.bubble.contains(target)) { this.stoppedAt = performance.now(); this.stop(true); return; }
    if (this.env.own(target)) return;
    if (this.lastShow) this.readDone?.();
  };
  private onUp = () => {};
  private onCancel = () => {};
  private onClick = (e: MouseEvent) => {
    if (!this.run || this.run.mode !== "teach" || !e.isTrusted || !this.run.el) return;
    if (this.run.el.contains(e.target as Node) && this.stepDone && this.currentAct === "tap") {
      const fin = this.stepDone;
      setTimeout(fin, 350);
    }
  };
  private alive() { return !!this.run && this.run.token === this.token && !this.stopped; }

  /** Stops whatever it's doing and goes back to its corner. */
  stop(byPerson = false) {
    if (!this.run) return;
    this.stopped = true;
    this.stoppedByPerson = byPerson;
    this.readDone?.();
    this.stepDone?.();
    const a = this.answer; this.answer = null; a?.(null);
    this.hush();
    this.unlight();
    this.env.bubble.classList.remove("ab-talking");
    this.run = null;
    void this.flyTo(this.env.home());
  }

  // ── Running a task ──
  async runSteps(steps: Step[], mode: GuideMode): Promise<GuideEnd> {
    this.stop();
    this.stopped = false;
    this.stoppedByPerson = false;
    const token = ++this.token;
    this.run = { mode, token, el: null };
    let shown = 0;
    await sleep(450);
    for (let i = 0; i < steps.length; i++) {
      if (!this.alive()) return "stopped";
      const s = steps[i];
      if (s.when && !s.when()) continue;
      shown++;
      const text = mode === "auto" ? s.auto : s.teach;
      const label = s.label ?? this.env.stepLabel(shown, steps.every((x) => !x.when) ? steps.length : null);

      // A page change: the menu item (on a phone through "Más"), or straight there. Already there: it knows, skips it
      // without a word. A shortcut on this page that gets there (Home's own links) goes first: fewer taps.
      if (s.go || s.nav) {
        if (this.onPage(s)) { shown--; continue; }
        const via = s.via ? firstVisible(s.via) : null;
        if (via) {
          const viaText = s.viaSay ? (mode === "auto" ? s.viaSay.auto : s.viaSay.teach) : text;
          await this.doEl(via, { ...s, act: "tap" }, mode, viaText, label);
          if (!this.alive()) return "stopped";
          await this.waitEl(() => (this.onPage({ ...s, go: undefined }) || this.onPage(s) ? document.body : null), 4000);
          continue;
        }
        await this.runNav(s, mode, text, label);
        if (!this.alive()) return "stopped";
        continue;
      }
      if (s.end) { await this.toTheEnd(label, text); continue; }
      const locate = s.find ?? (s.el ? () => firstVisible(s.el as string) : null);
      if (!locate) {
        const words = this.say(label, text);
        await this.waitRead(this.readMs(words));
        this.hush();
        continue;
      }
      const el = await this.waitEl(locate, s.optional ? 2200 : 8000);
      if (!this.alive()) return "stopped";
      if (!el && s.optional === "skip") { shown--; continue; }
      if (!el && s.optional === "say") {
        const words = this.say(label, text);
        await this.waitRead(this.readMs(words));
        this.hush();
        continue;
      }
      if (!el) { this.finishRun(); return "missing"; }
      this.lastShow = i === steps.length - 1 && s.act === "show";
      await this.doEl(el, s, mode, text, label);
      this.lastShow = false;
      if (!this.alive()) return "stopped";
    }
    if (!this.alive()) return "stopped";
    this.finishRun();
    await this.flyTo(this.env.home());
    return "done";
  }

  /** A page change: the menu item (on a phone through "Más"), or straight there; then the new page settles. */
  /** Whether it's already on the page a step goes to (a menu page with nothing else; or the very same address). */
  onPage(s: Step) {
    const path = s.go ?? s.nav ?? "";
    if (!path) return false;
    if (s.nav && !path.includes("?")) return location.pathname === path;
    return location.pathname + location.search === path;
  }
  private async runNav(s: Step, mode: GuideMode, text: string, label: string) {
    const path = s.go ?? s.nav ?? "/";
    const before = document.querySelector("main .page-fx > div");
    const samePage = location.pathname === path.split("?")[0];
    {
      {
        let navEl = s.nav ? firstVisible(`[data-nav="${s.nav}"]`) : null;
        if (!navEl && s.nav) {
          const more = firstVisible("[data-guide='nav-more']");
          if (more) {
            await this.doEl(more, { ...s, act: "tap" }, mode, mode === "auto" ? this.env.moreWords.auto : this.env.moreWords.teach, label);
            if (!this.alive()) return;
            navEl = await this.waitEl(() => firstVisible(`[data-nav="${s.nav}"]`), 3000);
          }
        }
        if (navEl) {
          await this.doEl(navEl, { ...s, act: "tap" }, mode, text, label);
        } else {
          this.unlight();
          const words = this.say(label, text);
          await this.waitRead(Math.min(3600, Math.max(2000, words * (WORD_MS + PER_WORD_MS) + 900)));
          if (!this.alive()) return;
          this.hush();
          if (location.pathname + location.search !== path) this.env.navigate(path);
        }
        if (!this.alive()) return;
        await this.arrived(path, samePage ? null : before);
      }
    }
  }

  /** Brings the bubble beside an element together with the page (it "pulls" the page), and marks it. */
  private async reach(el: HTMLElement, act: Step["act"]) {
    this.unlight();
    this.hush();
    await this.settled(el, 600);
    if (!this.alive()) return;
    const { box, delta } = scrollNeeded(el);
    const r0 = el.getBoundingClientRect();
    const at = this.spotFor(new DOMRect(r0.left, r0.top - delta, r0.width, r0.height), el, act);
    const ms = Math.max(this.flightMs(Math.hypot(at.x - this.pos.x, at.y - this.pos.y)), delta ? Math.min(1800, 500 + Math.abs(delta) * 1.0) : 0);
    await Promise.all([delta ? glide(box, box.scrollTop + delta, ms) : Promise.resolve(), this.flyTo(at, ms)]);
    if (this.alive()) this.light(el);
  }

  /** A task that asks as it goes (a goal): the script uses the bubble's hands; this keeps it stoppable. */
  async runScript(script: (k: ScriptKit) => Promise<"done" | "missing">, mode: GuideMode): Promise<GuideEnd> {
    this.stop();
    this.stopped = false;
    this.stoppedByPerson = false;
    const token = ++this.token;
    this.run = { mode, token, el: null };
    const kit: ScriptKit = {
      mode,
      alive: () => this.alive(),
      nav: async (path, words, label, via) => {
        if (!this.alive()) return;
        const one: Step = { ...words, nav: path, label };
        if (this.onPage(one)) return;
        // a shortcut on this page (Home's "Crear una meta"): it taps that instead of going through the menu
        const short = via ? firstVisible(via) : null;
        if (short) {
          await this.reach(short, "tap");
          if (this.alive()) await this.tapOn(short);
          await this.waitEl(() => (location.pathname === path ? document.body : null), 4000);
          return;
        }
        await this.runNav(one, mode, mode === "auto" ? words.auto : words.teach, label);
      },
      find: (sel, ms = 8000) => this.waitEl(() => firstVisible(sel), ms),
      show: async (el, label, text) => {
        if (!this.alive()) return;
        await this.reach(el, "show");
        if (!this.alive()) return;
        const words = this.say(label, text, this.pos, el.getBoundingClientRect());
        await this.waitRead(this.readMs(words));
        this.hush();
      },
      ask: async (el, label, text, choices, opts) => {
        if (!this.alive()) return null;
        await this.reach(el, "show");
        if (!this.alive()) return null;
        if (this.run) this.run.el = opts?.allow ?? el;
        const b = this.env.bubble;
        b.classList.add("ab-talking");
        const words = this.say(label, text, this.pos, el.getBoundingClientRect(), false, choices);
        setTimeout(() => b.classList.remove("ab-talking"), words * WORD_MS + 500);
        const value = await new Promise<string | null>((done) => {
          let poll = 0;
          this.answer = (v) => { clearInterval(poll); done(v); };
          if (opts?.until) poll = window.setInterval(() => { if (opts.until?.()) { const a = this.answer; this.answer = null; clearInterval(poll); a?.("dom"); } }, 150);
        });
        this.hush();
        return this.alive() ? value : null;
      },
      tap: async (el, label, text) => {
        if (!this.alive()) return;
        await this.reach(el, "tap");
        if (!this.alive()) return;
        if (text) {
          const words = this.say(label ?? "", text, this.pos, el.getBoundingClientRect());
          await this.waitRead(this.readMs(words));
          this.hush();
        }
        if (this.alive()) await this.tapOn(el);
      },
      type: async (el, value) => {
        if (!this.alive()) return;
        await this.reach(el, "type");
        if (this.alive() && el instanceof HTMLInputElement) { await this.typeIn(el, value); await sleep(350); }
      },
      pick: async (el, value) => {
        if (!this.alive()) return;
        await this.reach(el, "pick");
        if (this.alive() && el instanceof HTMLSelectElement) { setNative(el, value); await sleep(600); }
      },
    };
    await sleep(450);
    let end: "done" | "missing" = "done";
    try { end = await script(kit); } catch { end = "missing"; }
    if (!this.alive()) return "stopped";
    this.finishRun();
    await this.flyTo(this.env.home());
    return end;
  }

  /** The tour: down to the end of the page together with the page, then its words ("Esa es toda la página…"). */
  private async toTheEnd(label: string, text: string) {
    this.unlight();
    this.hush();
    const main = document.querySelector("main");
    const size = this.env.size();
    const at = this.clampPos({ x: viewArea().right - size - 16, y: bottomLimit() - size - 70 });
    if (main) {
      const max = Math.max(0, main.scrollHeight - main.clientHeight);
      const dist = max - main.scrollTop;
      if (dist > 40) {
        const ms = Math.max(1100, Math.min(3000, 600 + dist * 1.0));
        await Promise.all([glide(main, max, ms), this.flyTo(at, ms)]);
      } else await this.flyTo(at);
    }
    if (!this.alive()) return;
    const words = this.say(label, text, at);
    this.env.bubble.classList.add("ab-talking");
    await this.waitRead(this.readMs(words));
    this.env.bubble.classList.remove("ab-talking");
    this.hush();
  }

  private async doEl(el: HTMLElement, s: Step, mode: GuideMode, text: string, label: string) {
    const b = this.env.bubble;
    this.currentAct = s.act;
    if (this.run) this.run.el = el;
    // Teach: from the moment it's chosen, their tap or typing counts (they may be quicker than the bubble).
    let early = false;
    const person = mode === "teach" && s.act && s.act !== "show" ? this.waitPerson(s, el).then(() => { early = true; }) : null;
    // The page and the bubble move together: the page brings the element into view while the bubble flies to it.
    await this.reach(el, s.act);
    if (!this.alive()) return;
    if (person && early) return;
    const r = el.getBoundingClientRect();
    if (s.act !== "tap" || mode === "teach") this.pointAt(r);
    await sleep(120);
    const words = this.say(label, text, this.pos, r, s.act === "show" && /^H[1-6]$/.test(el.tagName));
    b.classList.add("ab-talking");
    setTimeout(() => b.classList.remove("ab-talking"), words * WORD_MS + 500);
    if (mode === "teach") {
      if (person) await person;
      else await this.waitRead(this.readMs(words) + 600 + (s.hold ?? 0));
      b.classList.remove("ab-talking");
      this.hush();
      return;
    }
    await this.waitRead(this.readMs(words) + (s.act === "show" ? s.hold ?? 0 : 0));
    b.classList.remove("ab-talking");
    if (!this.alive()) return;
    if (s.act === "tap") { this.hush(); await this.tapOn(el); }
    else if (s.act === "type" && el instanceof HTMLInputElement) { await this.typeIn(el, s.value ?? ""); await sleep(600); }
    else if (s.act === "pick" && el instanceof HTMLSelectElement) { setNative(el, s.value ?? ""); await sleep(800); }
    else await sleep(400);
  }

  private finishRun() {
    this.hush();
    this.unlight();
    this.env.bubble.classList.remove("ab-talking");
    this.run = null;
  }
}
