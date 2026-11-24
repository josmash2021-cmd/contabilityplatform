// ── The bubble's hands: it flies to what it shows, lights it, presses it, types into it ──
// "Hazlo por mí" (auto): it does each step with the app's own buttons while the person watches; any tap of theirs
// outside the bubble stops it. "Enséñame" (teach): it lights each step and waits for the person to do it; a tap
// outside what's lit ends it. Plain DOM on purpose (the elements are React's, but the bubble, its cloud and the glow
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
type P = { x: number; y: number };

export type GuideEnv = {
  bubble: HTMLElement;
  cloud: HTMLElement;
  spot: HTMLElement;
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
};

const WORD_MS = 150, PAUSE_MS = 450, MIN_READ_MS = 1800;
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
/** The top of the phone's tab bar (or the bottom of the screen). */
function bottomLimit(): number {
  const tab = document.querySelector("nav[data-tabbar]");
  return tab && visible(tab) ? tab.getBoundingClientRect().top : window.innerHeight;
}
/** The visible part of a scrolling box, above the tab bar. */
function areaOf(box: HTMLElement) {
  const limit = bottomLimit();
  if (isPage(box)) return { top: 0, bottom: limit };
  const b = box.getBoundingClientRect();
  return { top: Math.max(0, b.top), bottom: Math.min(b.bottom, limit) };
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
  private lightTok = 0;
  private track = 0;
  private tracking = false;
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
    document.addEventListener("click", this.onClick, true);
  }

  destroy() {
    this.stop();
    document.removeEventListener("pointerdown", this.onDown, true);
    document.removeEventListener("click", this.onClick, true);
    cancelAnimationFrame(this.flight);
    cancelAnimationFrame(this.track);
  }

  get busy() { return this.run !== null; }
  get position() { return { ...this.pos }; }

  // ── Moving ──
  setPos(p: P) {
    this.pos = p;
    this.env.bubble.style.setProperty("--x", `${p.x}px`);
    this.env.bubble.style.setProperty("--y", `${p.y}px`);
  }
  /** Back to its corner (also after the window or the page changes). */
  rest(fly = false) {
    if (this.run) return;
    if (fly) void this.flyTo(this.env.home()); else this.setPos(this.env.home());
  }
  /** How long a flight of this length takes: calm, the farther the longer (0.75–2 s). */
  private flightMs(dist: number) { return Math.max(750, Math.min(2000, 450 + dist * 1.15)); }
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
      if (ny > 0 || (Math.abs(ny) < 0.2 && (from.x + to.x) / 2 + nx * 40 > window.innerWidth - 30)) { nx = -nx; ny = -ny; }
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
    const size = this.env.size();
    return { x: Math.min(Math.max(8, p.x), window.innerWidth - size - 8), y: Math.min(Math.max(8, p.y), bottomLimit() - size - 8) };
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
      if (right + size + 12 < window.innerWidth) return this.clampPos({ x: right + 10, y: top + tr.height / 2 - size / 2 });
      return this.clampPos({ x: right - size * 0.9, y: top + tr.height + 6 });
    }
    if (act === "show" && r.height > size * 2) return this.clampPos({ x: r.right - size * 0.75, y: r.top + 14 });
    const touchX = r.left + Math.max(Math.min(r.width - 20, r.width * 0.78), Math.min(r.width / 2, 24));
    const touchY = r.top + r.height / 2;
    return this.clampPos({ x: touchX - size * 0.22, y: touchY - size * 0.28 });
  }

  // ── Its cloud ──
  /**
   * Next to the bubble, on the side that doesn't cover what it's showing. For a heading it prefers going above it:
   * what the heading talks about comes right under it.
   */
  talk(html: string, at: P = this.pos, avoid?: DOMRect, aboveFirst = false) {
    const say = this.env.cloud, size = this.env.size();
    say.classList.remove("ab-on");
    say.innerHTML = html;
    const vw = window.innerWidth, limit = bottomLimit();
    const w = Math.min(270, vw - 24);
    say.style.width = `${w}px`;
    const h = say.offsetHeight;
    // Above a heading it may go up to the screen's top edge (over the app's top bar), not over what it explains.
    const fits = (x: number, y: number) => x >= 12 && x + w <= vw - 12 && y >= (aboveFirst ? 2 : 12) && y + h <= limit - 8;
    const hits = (x: number, y: number) => !!avoid && x < avoid.right + 6 && x + w > avoid.left - 6 && y < avoid.bottom + 6 && y + h > avoid.top - 6;
    const below = at.y + size + 10, above = at.y - h - 10;
    const side = { x: at.x + size + 10, y: at.y + 4 }, left = { x: at.x - w - 10, y: at.y + 4 };
    const under = { x: Math.min(Math.max(12, at.x + size - w), vw - w - 12), y: below };
    const over = { x: Math.min(Math.max(12, at.x + size - w), vw - w - 12), y: Math.min(at.y, avoid?.top ?? at.y) - h - 6 };
    const options: P[] = aboveFirst ? [over, side, left, under] : [side, under, over, left];
    const pick = options.find((o) => fits(o.x, o.y) && !hits(o.x, o.y)) ?? options.find((o) => fits(o.x, o.y))
      ?? { x: Math.min(Math.max(12, at.x + size - w), vw - w - 12), y: Math.min(Math.max(12, above), limit - h - 8) };
    say.style.left = `${Math.round(pick.x)}px`;
    say.style.top = `${Math.round(pick.y)}px`;
    requestAnimationFrame(() => say.classList.add("ab-on"));
  }
  hush() { this.env.cloud.classList.remove("ab-on"); }
  /** Says a line by itself (no steps), word by word, then goes quiet. */
  async note(text: string, at: P = this.pos, holdMs = 4200) {
    this.talk(`<div class="ab-spoken">${esc(text)}</div>`, at);
    const words = this.speak();
    await sleep(Math.max(holdMs, words * WORD_MS + 1800));
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
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of (node.textContent ?? "").split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const w = document.createElement("span");
        w.className = "ab-w";
        w.textContent = part;
        w.style.animationDelay = `${this.reduce ? 0 : n++ * WORD_MS}ms`;
        frag.appendChild(w);
      }
      node.replaceWith(frag);
    }
    return n;
  }
  private say(label: string, text: string, at?: P, avoid?: DOMRect, aboveFirst = false) {
    this.talk(`${label ? `<div class="ab-step"><i></i>${esc(label)}</div>` : ""}<div class="ab-spoken">${esc(text)}</div>`, at, avoid, aboveFirst);
    return this.speak();
  }
  private readMs(words: number) { return Math.max(MIN_READ_MS, words * WORD_MS + PAUSE_MS); }

  // ── The glow: appears in place; if lit elsewhere, that one fades out first; it follows its element ──
  private light(el: HTMLElement, again: () => HTMLElement | null) {
    const tok = ++this.lightTok;
    const spot = this.env.spot;
    const put = () => {
      if (tok !== this.lightTok) return;
      this.follow(el, again);
      void spot.offsetWidth;
      spot.classList.add("ab-on");
    };
    if (spot.classList.contains("ab-on")) { spot.classList.remove("ab-on"); setTimeout(put, this.reduce ? 0 : 240); } else put();
  }
  /** Keeps the glow on its element while the page scrolls; if the page redraws it, finds it again (never a stale spot). */
  private follow(first: HTMLElement, again: () => HTMLElement | null) {
    cancelAnimationFrame(this.track);
    this.tracking = true;
    let el: HTMLElement | null = first;
    const spot = this.env.spot, pad = 8;
    const tick = () => {
      if (!el || !el.isConnected || !visible(el)) {
        el = again();
        if (this.run && el) this.run.el = el;
      }
      if (!el) spot.style.opacity = "0";
      else {
        spot.style.opacity = "";
        const r = el.getBoundingClientRect();
        spot.style.transform = `translate(${Math.round(r.left - pad)}px, ${Math.round(r.top - pad)}px)`;
        spot.style.width = `${Math.round(r.width + pad * 2)}px`;
        spot.style.height = `${Math.round(r.height + pad * 2)}px`;
      }
      if (this.tracking) this.track = requestAnimationFrame(tick);
    };
    tick();
  }
  private unlight() {
    this.lightTok++;
    this.env.spot.classList.remove("ab-on");
    const t = this.lightTok;
    setTimeout(() => { if (t === this.lightTok) { this.tracking = false; cancelAnimationFrame(this.track); this.env.spot.style.opacity = ""; } }, 300);
  }
  /** It leans toward what it shows, once, and the glow gives one soft pulse. */
  private pointAt(r: DOMRect) {
    const size = this.env.size(), b = this.env.bubble;
    const bx = this.pos.x + size / 2, by = this.pos.y + size / 2, tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const d = Math.hypot(tx - bx, ty - by) || 1;
    b.style.setProperty("--nx", `${((tx - bx) / d * 9).toFixed(1)}px`);
    b.style.setProperty("--ny", `${((ty - by) / d * 9).toFixed(1)}px`);
    b.classList.remove("ab-point"); this.env.spot.classList.remove("ab-ping"); void b.offsetWidth;
    b.classList.add("ab-point"); this.env.spot.classList.add("ab-ping");
    setTimeout(() => { b.classList.remove("ab-point"); this.env.spot.classList.remove("ab-ping"); }, 2300);
  }
  /** One press, where it stands: it dips toward the button (the button sinks too), one ripple, the real click. */
  private async tapOn(el: HTMLElement) {
    const size = this.env.size(), b = this.env.bubble;
    const r = el.getBoundingClientRect();
    const tx = r.left + Math.max(Math.min(r.width - 20, r.width * 0.78), Math.min(r.width / 2, 24)), ty = r.top + r.height / 2;
    // Too far (the page moved): a short, calm approach first.
    const here = { x: this.pos.x + size * 0.22, y: this.pos.y + size * 0.28 };
    if (Math.hypot(here.x - tx, here.y - ty) > 26) await this.flyTo(this.clampPos({ x: tx - size * 0.22, y: ty - size * 0.28 }), 650);
    if (!this.alive()) return;
    const cx = this.pos.x + size / 2, cy = this.pos.y + size / 2, d = Math.hypot(tx - cx, ty - cy) || 1;
    b.style.setProperty("--px", `${((tx - cx) / d * 10).toFixed(1)}px`);
    b.style.setProperty("--py", `${((ty - cy) / d * 10).toFixed(1)}px`);
    await sleep(160);
    b.classList.add("ab-press"); el.classList.remove("ab-untap"); el.classList.add("ab-tapped");
    await sleep(360);
    const rip = document.createElement("span");
    rip.className = "ab-ripple"; rip.style.left = `${tx}px`; rip.style.top = `${ty}px`;
    document.body.appendChild(rip); setTimeout(() => rip.remove(), 1100);
    b.classList.remove("ab-press"); el.classList.remove("ab-tapped"); el.classList.add("ab-untap");
    setTimeout(() => el.classList.remove("ab-untap"), 600);
    this.unlight();
    await sleep(300);
    if (!this.alive()) return;
    el.click();
    await sleep(500);
  }
  private async typeIn(el: HTMLInputElement, text: string) {
    el.focus({ preventScroll: true });
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
  private async arrived(path: string) {
    const want = path.split("?")[0];
    const until = performance.now() + 5000;
    while (performance.now() < until && this.alive() && location.pathname !== want) await sleep(60);
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
  private onDown = (e: PointerEvent) => {
    if (!this.run || !e.isTrusted) return;
    const target = e.target as Node;
    // A tap on the bubble while it works stops it, like a tap anywhere else; its cloud and panel never do.
    if (this.env.own(target) && !this.env.bubble.contains(target)) return;
    if (this.lastShow && !this.env.bubble.contains(target)) { this.readDone?.(); return; }
    // Teach: inside what's lit is them doing the step; anywhere else ends it. Auto: any tap of theirs stops it.
    if (this.run.mode === "teach" && this.run.el && this.run.el.contains(target)) return;
    this.stoppedAt = performance.now();
    this.stop();
  };
  private onClick = (e: MouseEvent) => {
    if (!this.run || this.run.mode !== "teach" || !e.isTrusted || !this.run.el) return;
    if (this.run.el.contains(e.target as Node) && this.stepDone && this.currentAct === "tap") {
      const fin = this.stepDone;
      setTimeout(fin, 350);
    }
  };
  private alive() { return !!this.run && this.run.token === this.token && !this.stopped; }

  /** Stops whatever it's doing and goes back to its corner. */
  stop() {
    if (!this.run) return;
    this.stopped = true;
    this.readDone?.();
    this.stepDone?.();
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

      // A page change: the menu item (on a phone through "Más"), or straight there.
      if (s.go || s.nav) {
        const path = s.go ?? s.nav ?? "/";
        let navEl = s.nav ? firstVisible(`[data-nav="${s.nav}"]`) : null;
        if (!navEl && s.nav) {
          const more = firstVisible("[data-guide='nav-more']");
          if (more) {
            await this.doEl(more, { ...s, act: "tap" }, mode, mode === "auto" ? this.env.moreWords.auto : this.env.moreWords.teach, label, () => firstVisible("[data-guide='nav-more']"));
            if (!this.alive()) return "stopped";
            navEl = await this.waitEl(() => firstVisible(`[data-nav="${s.nav}"]`), 3000);
          }
        }
        if (navEl) {
          const sel = `[data-nav="${s.nav}"]`;
          await this.doEl(navEl, { ...s, act: "tap" }, mode, text, label, () => firstVisible(sel));
        } else {
          this.unlight();
          const words = this.say(label, text);
          await this.waitRead(Math.min(2600, Math.max(1300, words * WORD_MS + PAUSE_MS)));
          if (!this.alive()) return "stopped";
          this.hush();
          if (location.pathname + location.search !== path) this.env.navigate(path);
        }
        if (!this.alive()) return "stopped";
        await this.arrived(path);
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
      await this.doEl(el, s, mode, text, label, locate);
      this.lastShow = false;
      if (!this.alive()) return "stopped";
    }
    if (!this.alive()) return "stopped";
    this.finishRun();
    await this.flyTo(this.env.home());
    return "done";
  }

  /** The tour: down to the end of the page together with the page, then its words ("Esa es toda la página…"). */
  private async toTheEnd(label: string, text: string) {
    this.unlight();
    this.hush();
    const main = document.querySelector("main");
    const size = this.env.size();
    const at = this.clampPos({ x: window.innerWidth - size - 16, y: bottomLimit() - size - 70 });
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

  private async doEl(el: HTMLElement, s: Step, mode: GuideMode, text: string, label: string, locate: () => HTMLElement | null) {
    const b = this.env.bubble;
    this.currentAct = s.act;
    if (this.run) this.run.el = el;
    this.unlight();
    this.hush();
    await this.settled(el, 600);
    if (!this.alive()) return;
    // Teach: from the moment it's chosen, their tap or typing counts (they may be quicker than the bubble).
    let early = false;
    const person = mode === "teach" && s.act && s.act !== "show" ? this.waitPerson(s, el).then(() => { early = true; }) : null;
    // The page and the bubble move together: the page brings the element into view while the bubble flies to it.
    const { box, delta } = scrollNeeded(el);
    const r0 = el.getBoundingClientRect();
    const rAfter = new DOMRect(r0.left, r0.top - delta, r0.width, r0.height);
    const at = this.spotFor(rAfter, el, s.act);
    const ms = Math.max(this.flightMs(Math.hypot(at.x - this.pos.x, at.y - this.pos.y)), delta ? Math.min(1800, 500 + Math.abs(delta) * 1.0) : 0);
    await Promise.all([delta ? glide(box, box.scrollTop + delta, ms) : Promise.resolve(), this.flyTo(at, ms)]);
    if (!this.alive()) return;
    if (person && early) return;
    this.light(el, locate);
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
