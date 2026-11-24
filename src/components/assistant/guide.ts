// ── The bubble's hands: it flies to what it shows, lights it, presses it, types into it ──
// "Hazlo por mí" (auto): it does each step with the app's own buttons while the person watches; any tap of theirs
// outside the bubble stops it. "Enséñame" (teach): it lights each step and waits for the person to do it; a tap
// outside what's lit ends it. Plain DOM on purpose (the elements are React's, but the bubble, its cloud and the glow
// are its own), ported from the prototype the owner approved: a soft curve, ~2 s a step, words one by one, the glow
// appears in place (never slides between buttons), one press, no darkening.

export type GuideMode = "auto" | "teach";
export type Step = {
  /** What it says while doing it (auto) and while showing it (teach). */
  auto: string;
  teach: string;
  /** A page from the menu: it taps the menu item when it's on screen, else it goes there. */
  nav?: string;
  /** A page with details (?month=…): it goes there itself. */
  go?: string;
  /** What it works on (CSS selector; the first one on screen). */
  el?: string;
  act?: "tap" | "type" | "pick" | "show";
  value?: string;
  /** Checked right before the step: false skips it. */
  when?: () => boolean;
  /** Extra time it stays (lit, with its words) after reading, for a last step that only shows where to go on. */
  hold?: number;
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
};

const WORD_MS = 150, PAUSE_MS = 400, MIN_READ_MS = 1700;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ease = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** On screen: has a size, not hidden, not behind an open dialog (aria-hidden). */
export function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !el.closest("[hidden],[aria-hidden='true'],[inert]");
}
const firstVisible = (sel: string) => [...document.querySelectorAll(sel)].find(visible) ?? null;

/** Sets a React-controlled input's value as if typed (React listens to the native setter + input event). */
function setNative(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
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
  private reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  /** Sine in-out on a soft arc; the farther, the longer (0.7–1.9 s). */
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
      const ms = msIn ?? Math.max(700, Math.min(1900, dist * 1.6));
      const bend = Math.min(120, dist * 0.3);
      const c = { x: (from.x + to.x) / 2 - (dy / dist) * bend, y: (from.y + to.y) / 2 + (dx / dist) * bend * 0.6 - 30 };
      const start = performance.now();
      b.classList.add("ab-flying");
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms), e = ease(t), u = 1 - e;
        this.setPos({ x: u * u * from.x + 2 * u * e * c.x + e * e * to.x, y: u * u * from.y + 2 * u * e * c.y + e * e * to.y });
        if (t < 1) this.flight = requestAnimationFrame(step);
        else { b.classList.remove("ab-flying", "ab-land"); void b.offsetWidth; b.classList.add("ab-land"); done(); }
      };
      this.flight = requestAnimationFrame(step);
    });
  }

  // ── Its cloud ──
  talk(html: string, at: P = this.pos) {
    const say = this.env.cloud, size = this.env.size();
    say.classList.remove("ab-on");
    say.innerHTML = html;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(270, vw - 24);
    say.style.width = `${w}px`;
    const h = say.offsetHeight;
    // To the right of the bubble; if there's no room, under it; else above it. Always next to it.
    let left = at.x + size + 10, top = at.y + 4;
    if (left + w > vw - 12) {
      left = Math.min(Math.max(12, at.x + size - w), vw - w - 12);
      top = at.y + size + 10;
      if (top + h > vh - 12) top = Math.max(12, at.y - h - 10);
    }
    top = Math.min(Math.max(12, top), vh - h - 12);
    say.style.left = `${left}px`;
    say.style.top = `${top}px`;
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
  /** The cloud's words fade in one by one; returns how many. */
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

  // ── The glow: appears in place; if lit elsewhere, that one fades out first ──
  private light(el: HTMLElement) {
    const tok = ++this.lightTok;
    const spot = this.env.spot;
    const put = () => {
      if (tok !== this.lightTok) return;
      this.follow(el);
      void spot.offsetWidth;
      spot.classList.add("ab-on");
    };
    if (spot.classList.contains("ab-on")) { spot.classList.remove("ab-on"); setTimeout(put, this.reduce ? 0 : 240); } else put();
  }
  /** Keeps the glow on its element while the page scrolls under it. */
  private follow(el: HTMLElement) {
    cancelAnimationFrame(this.track);
    this.tracking = true;
    const spot = this.env.spot, pad = 8;
    const tick = () => {
      const r = el.getBoundingClientRect();
      spot.style.transform = `translate(${Math.round(r.left - pad)}px, ${Math.round(r.top - pad)}px)`;
      spot.style.width = `${Math.round(r.width + pad * 2)}px`;
      spot.style.height = `${Math.round(r.height + pad * 2)}px`;
      if (this.tracking) this.track = requestAnimationFrame(tick);
    };
    tick();
  }
  private unlight() {
    this.lightTok++;
    this.env.spot.classList.remove("ab-on");
    const t = this.lightTok;
    setTimeout(() => { if (t === this.lightTok) { this.tracking = false; cancelAnimationFrame(this.track); } }, 300);
  }
  /** Beside what it shows, on its lower right corner, inside the screen. */
  private near(r: DOMRect): P {
    const size = this.env.size();
    return {
      x: Math.min(Math.max(10, r.right - size * 0.42), window.innerWidth - size - 10),
      y: Math.min(Math.max(10, r.bottom - size * 0.38), window.innerHeight - size - 10),
    };
  }
  private pointAt(r: DOMRect) {
    const size = this.env.size(), b = this.env.bubble;
    const bx = this.pos.x + size / 2, by = this.pos.y + size / 2, tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const d = Math.hypot(tx - bx, ty - by) || 1;
    b.style.setProperty("--nx", `${((tx - bx) / d * 11).toFixed(1)}px`);
    b.style.setProperty("--ny", `${((ty - by) / d * 11).toFixed(1)}px`);
    b.classList.remove("ab-point"); this.env.spot.classList.remove("ab-ping"); void b.offsetWidth;
    b.classList.add("ab-point"); this.env.spot.classList.add("ab-ping");
    setTimeout(() => { b.classList.remove("ab-point"); this.env.spot.classList.remove("ab-ping"); }, 2300);
  }
  /** One press you can see: it hops on, pushes down (the button sinks too), one ripple, the real click, then lifts off. */
  private async tapOn(el: HTMLElement) {
    const size = this.env.size(), b = this.env.bubble;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const back = { ...this.pos };
    await this.flyTo({ x: cx - size / 2 + 10, y: cy - size / 2 + 12 });
    await sleep(250);
    b.classList.add("ab-press"); el.classList.remove("ab-untap"); el.classList.add("ab-tapped");
    await sleep(380);
    const rip = document.createElement("span");
    rip.className = "ab-ripple"; rip.style.left = `${cx}px`; rip.style.top = `${cy}px`;
    document.body.appendChild(rip); setTimeout(() => rip.remove(), 1100);
    b.classList.remove("ab-press"); el.classList.remove("ab-tapped"); el.classList.add("ab-untap");
    setTimeout(() => el.classList.remove("ab-untap"), 600);
    this.unlight();
    await sleep(350);
    if (!this.alive()) return;
    el.click();
    await sleep(450);
    if (el.isConnected && visible(el)) await this.flyTo(back);
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
      await sleep(this.reduce ? 0 : 200);
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
  /** The first element on screen for a selector, waiting for the page to show it (a page change, a sheet opening). */
  private async waitEl(sel: string, ms = 8000): Promise<HTMLElement | null> {
    const until = performance.now() + ms;
    while (performance.now() < until && this.alive()) {
      const el = firstVisible(sel);
      if (el) return el;
      await sleep(100);
    }
    return null;
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
    if (this.env.own(target)) return;
    if (this.lastShow) { this.readDone?.(); return; }
    // Teach: inside what's lit is them doing the step; anywhere else ends it. Auto: any tap of theirs stops it.
    if (this.run.mode === "teach" && this.run.el && this.run.el.contains(target)) return;
    this.stop();
  };
  private onClick = (e: MouseEvent) => {
    if (!this.run || this.run.mode !== "teach" || !e.isTrusted || !this.run.el) return;
    if (this.run.el.contains(e.target as Node) && this.stepDone && this.currentAct === "tap") {
      const fin = this.stepDone;
      setTimeout(fin, 350);
    }
  };
  private currentAct: Step["act"] = undefined;
  /** On the last step that only shows where they go on: their tap there just ends the wait (it's what we asked). */
  private lastShow = false;
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
      const label = this.env.stepLabel(shown, steps.every((x) => !x.when) ? steps.length : null);

      // A page change
      if (s.go || s.nav) {
        const navEl = s.nav ? firstVisible(`[data-nav="${s.nav}"]`) : null;
        if (!navEl) {
          this.unlight();
          this.talk(`<div class="ab-step"><i></i>${esc(label)}</div><div class="ab-spoken">${esc(text)}</div>`);
          const words = this.speak();
          await this.waitRead(Math.min(2600, Math.max(1200, words * WORD_MS + PAUSE_MS)));
          if (!this.alive()) return "stopped";
          this.hush();
          const path = s.go ?? s.nav ?? "/";
          if (location.pathname + location.search !== path) this.env.navigate(path);
          await sleep(500);
          continue;
        }
        // The menu item is on screen: show it / press it like any button.
        await this.doEl(navEl, { ...s, act: "tap" }, mode, text, label);
        if (!this.alive()) return "stopped";
        continue;
      }
      if (!s.el) {
        this.talk(`<div class="ab-spoken">${esc(text)}</div>`);
        const words = this.speak();
        await this.waitRead(Math.max(MIN_READ_MS, words * WORD_MS + PAUSE_MS));
        continue;
      }
      const el = await this.waitEl(s.el);
      if (!this.alive()) return "stopped";
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

  private async doEl(el: HTMLElement, s: Step, mode: GuideMode, text: string, label: string) {
    const b = this.env.bubble;
    this.currentAct = s.act;
    if (this.run) this.run.el = el;
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: this.reduce ? "auto" : "smooth" });
    await sleep(this.reduce ? 50 : 420);
    if (!this.alive()) return;
    this.light(el);
    this.hush();
    // Teach: from the moment it's lit, their tap or typing counts (they may be quicker than the bubble).
    let early = false;
    const person = mode === "teach" && s.act && s.act !== "show" ? this.waitPerson(s, el).then(() => { early = true; }) : null;
    let r = el.getBoundingClientRect();
    const at = this.near(r);
    await this.flyTo(at);
    if (!this.alive()) return;
    if (person && early) return;
    r = el.getBoundingClientRect();
    if (s.act !== "tap" || mode === "teach") this.pointAt(r);
    this.talk(`<div class="ab-step"><i></i>${esc(label)}</div><div class="ab-spoken">${esc(text)}</div>`, at);
    await sleep(200);
    const words = this.speak();
    b.classList.add("ab-talking");
    setTimeout(() => b.classList.remove("ab-talking"), words * WORD_MS + 500);
    if (mode === "teach") {
      if (person) await person;
      else await this.waitRead(Math.max(MIN_READ_MS, words * WORD_MS + PAUSE_MS) + 600 + (s.hold ?? 0));
      b.classList.remove("ab-talking");
      this.hush();
      return;
    }
    await this.waitRead(Math.max(MIN_READ_MS, words * WORD_MS + PAUSE_MS) + (s.act === "show" ? s.hold ?? 0 : 0));
    b.classList.remove("ab-talking");
    if (!this.alive()) return;
    if (s.act === "tap") { this.hush(); await this.tapOn(el); }
    else if (s.act === "type" && el instanceof HTMLInputElement) { await this.typeIn(el, s.value ?? ""); await sleep(700); }
    else if (s.act === "pick" && el instanceof HTMLSelectElement) { setNative(el, s.value ?? ""); await sleep(900); }
    else await sleep(600);
  }

  private finishRun() {
    this.hush();
    this.unlight();
    this.env.bubble.classList.remove("ab-talking");
    this.run = null;
  }
}
