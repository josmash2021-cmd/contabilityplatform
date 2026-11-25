// ── The assistant's bubble: on every page of the app ──
// A soap bubble in blue, gray and clear with the app's star (orb.ts; owner chose "2", 2026-11-25). Tap it: a small panel (a sheet from
// below on phones) where they ask anything; the same assistant answers with their own data and knows the page they're
// on (api/lib/bubble.ts). When it's something done in the app, the answer comes with "Hazlo por mí" (the bubble does it
// with the app's own buttons while they watch; only a tap on the bubble stops it) and "Enséñame" (it lights each step and
// waits for them). Only the closed list of tasks (contracts/bubble.ts, ./tasks.ts). When the fault is the app's, the
// answer comes with "Avisar a soporte". It never opens by itself; with it closed nothing shows over the page.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { ArrowRight, X } from "lucide-react";
import type { BubbleReport, BubbleTask } from "@contracts/bubble";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useMedia } from "@/hooks/useMedia";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { bubbleCopy } from "@/i18n/copy/bubble";
import { settingsCopy } from "@/i18n/copy/settings";
import { personalCopy } from "@/i18n/copy/personal";
import type { Lang } from "@/i18n/lang";
import { useCatLabel } from "@/components/personal/txKit";
import { moneyAuto } from "@/components/personal/personalUtils";
import { Guide, glide, viewArea, visible, type GuideMode } from "./guide";
import { offerLine, planFor, type TaskCtx } from "./tasks";
import { goalScript, type GoalResult } from "./goalScript";
import { Buddy } from "./buddy";
import { BubbleOrb, drawStill } from "./orb";
import "./bubble.css";

/** "Hazlo por mí" in their own words: the task starts at once, without the buttons. */
const DO_IT = /\bh[aá]z(lo|melo|me)\b|\bpor m[ií]\b|\bdo it\b|\bfor me\b/i;

type Msg = { id: number; role: "me" | "bot"; text: string; task?: BubbleTask | null; report?: BubbleReport | null; used?: boolean; reported?: "sending" | "sent"; lang?: Lang };

let nextId = 1;

/** Where it rests: the lower right corner, above the phone's tab bar and above the tax preparer's bubble. */
function homeOf(size: number): { x: number; y: number } {
  // What's really seen (a phone's keyboard or a zoom shrink it), so its corner is always on screen.
  const seen = viewArea();
  const vw = seen.right, vh = seen.bottom;
  const tab = document.querySelector("nav[data-tabbar]");
  const tabH = tab && visible(tab) ? tab.getBoundingClientRect().height : 0;
  const dock = document.querySelector("[data-tax-dock]");
  const dockH = dock && visible(dock) ? Math.max(0, vh - tabH - dock.getBoundingClientRect().top) + 8 : 0;
  const gap = vw < 1024 ? 14 : 24;
  const x = vw - size - gap;
  let y = vh - size - gap - tabH - dockH;
  // A notice at the bottom (sonner): above it while it shows, so it never covers the bubble (owner, 2026-11-25).
  for (const n of document.querySelectorAll<HTMLElement>("[data-sonner-toast]")) {
    if (n.dataset.removed === "true" || n.dataset.visible === "false") continue;
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.right < x || r.left > x + size) continue;
    // where it ends up (its rise in may still be under way): its own height above the toaster's bottom line
    const line = n.closest("[data-sonner-toaster]")?.getBoundingClientRect().bottom ?? r.bottom;
    const top = Math.min(r.top, line - n.offsetHeight);
    if (y + size > top - 10) y = top - size - 10;
  }
  return { x, y };
}

export function AssistantBubble({ mode, onGo, hidden }: { mode: "business" | "personal"; onGo: (path: string) => void; hidden: boolean }) {
  const t = useCopy(bubbleCopy);
  const { lang } = useLang();
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const phone = useMedia("(max-width: 1023px)");
  const catLabel = useCatLabel();
  const utils = trpc.useUtils();

  const bubbleRef = useRef<HTMLButtonElement>(null);
  const cloudRef = useRef<HTMLDivElement>(null);
  const neckRef = useRef<SVGSVGElement>(null);
  const budRef = useRef<HTMLDivElement>(null);
  const skinRef = useRef<SVGPathElement>(null);
  const wavesRef = useRef<SVGSVGElement>(null);
  const buddyRef = useRef<Buddy | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const guideRef = useRef<Guide | null>(null);
  // The bubble itself, drawn (owner chose "2", 2026-11-25: orb.ts), the companion's and the panel's little ones.
  const orbRef = useRef<HTMLCanvasElement>(null);
  const budOrbRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const liveOrb = useRef<BubbleOrb | null>(null);
  const goRef = useRef(onGo);
  // The language the bubble speaks in while it works: the one of the answer (they wrote in it), not always the app's.
  const talkLang = useRef<Lang>(lang);
  useEffect(() => { goRef.current = onGo; }, [onGo]);

  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [chatId, setChatId] = useState<number | null>(null);
  const status = trpc.assistant.status.useQuery({ chatId: null }, { enabled: open, staleTime: 60_000 });
  const ask = trpc.assistant.ask.useMutation();
  const report = trpc.assistant.report.useMutation();
  const size = phone ? 56 : 66;

  // The bubble's hands (made once; reads the latest size/navigation through refs).
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
    guideRef.current?.rest();
    liveOrb.current?.setSize(size);
    if (budOrbRef.current) drawStill(budOrbRef.current, Math.round(size * 0.4), false);
  }, [size]);
  // The panel's little bubble: drawn once, still.
  useEffect(() => { if (miniRef.current) drawStill(miniRef.current, 36, true); }, []);
  useEffect(() => {
    if (!bubbleRef.current || !cloudRef.current || !neckRef.current || !budRef.current || !skinRef.current || !wavesRef.current || !orbRef.current) return;
    const own = (n: Node) => [bubbleRef.current, cloudRef.current, panelRef.current, scrimRef.current].some((el) => !!el && el.contains(n));
    let bd: Buddy | null = null;
    const orb = new BubbleOrb(orbRef.current, sizeRef.current);
    liveOrb.current = orb;
    const g = new Guide({
      bubble: bubbleRef.current, cloud: cloudRef.current, neck: neckRef.current,
      home: () => homeOf(sizeRef.current), size: () => sizeRef.current,
      navigate: (p) => goRef.current(p), own, stepLabel: (i, n) => bubbleCopy[talkLang.current].step(i, n),
      get moreWords() { return bubbleCopy[talkLang.current].more; },
      onMove: (dx, dy) => bd?.moved(dx, dy),
      voice: orb,
    });
    guideRef.current = g;
    // Its little companion (owner, 2026-11-25): now and then it jumps out, floats glued to it, falls back in like a drop.
    bd = new Buddy({ bubble: bubbleRef.current, buddy: budRef.current, skin: skinRef.current, waves: wavesRef.current, cloud: cloudRef.current, pos: () => g.position, size: () => sizeRef.current });
    buddyRef.current = bd;
    const onResize = () => g.rest();
    window.addEventListener("resize", onResize);
    // A notice comes or goes: back to its corner (above the notice while it shows), flying softly.
    const toaster = document.querySelector("section[aria-label^='Notifications']");
    let moveId = 0;
    const onNotes = () => { window.clearTimeout(moveId); moveId = window.setTimeout(() => g.rest(true), 90); };
    const notes = toaster ? new MutationObserver(onNotes) : null;
    if (toaster) notes?.observe(toaster, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-removed", "data-visible"] });
    return () => { window.removeEventListener("resize", onResize); notes?.disconnect(); window.clearTimeout(moveId); bd?.destroy(); buddyRef.current = null; g.destroy(); guideRef.current = null; orb.destroy(); liveOrb.current = null; };
    // Made once: the step words follow talkLang (a ref), the size and navigation follow their refs.
  }, []);
  // A new page: back to its corner (the tax preparer's bubble may be there now).
  useEffect(() => {
    const id = window.setTimeout(() => guideRef.current?.rest(true), 350);
    return () => window.clearTimeout(id);
  }, [pathname]);
  useEffect(() => { if (hidden) guideRef.current?.stop(); }, [hidden]);
  // Out of sight (panel open, a page without it): its little companion goes at once too.
  const gone = hidden || (open && !running);
  useEffect(() => { buddyRef.current?.setAway(gone); liveOrb.current?.setAway(gone); }, [gone]);

  /** The task's words in one language (the answer's). */
  const ctxIn = (l: Lang): TaskCtx => ({
    t: bubbleCopy[l].tasks, mode,
    money: (n) => moneyAuto(n),
    catLabel: (c, type) => {
      const cats = personalCopy[l].categories;
      return (type === "income" ? cats.income : cats.expense)[c] ?? cats.short[c] ?? catLabel(c, type);
    },
    colorName: (c) => (settingsCopy[l].account.colors[c] ?? c).toLowerCase(),
    monthName: (iso) => {
      const [y, m] = iso.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString(intlLocale(l), { month: "long" });
    },
  });
  const ctx = ctxIn(lang);

  const add = (m: Omit<Msg, "id">) => { const id = nextId++; setMsgs((list) => [...list, { ...m, id }]); return id; };
  const firstName = (user?.name || "").trim().split(/\s+/)[0] ?? "";

  const toggle = () => {
    const g = guideRef.current;
    if (g?.busy) { g.stop(); return; }
    // The tap that just stopped it (on the bubble) isn't a tap to open the panel.
    if (g && performance.now() - g.stoppedAt < 600) return;
    if (!open && msgs.length === 0) add({ role: "bot", text: t.hello(firstName) });
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    if (!phone) window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 350);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phone]);
  // Phones: with the keyboard open the sheet rides just above it (no jump of the page under it).
  useEffect(() => {
    const vv = window.visualViewport, panel = panelRef.current;
    if (!open || !phone || !vv || !panel) return;
    const fit = () => {
      panel.style.setProperty("--ab-kb", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
      panel.style.setProperty("--ab-vh", `${Math.round(vv.height)}px`);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); panel.style.removeProperty("--ab-kb"); panel.style.removeProperty("--ab-vh"); };
  }, [open, phone]);
  // The newest line (and its buttons) always in view.
  useEffect(() => {
    const box = msgsRef.current;
    if (box) window.requestAnimationFrame(() => void glide(box, box.scrollHeight));
  }, [msgs, ask.isPending, open]);

  const st = status.data;
  const blocked = !st ? null : st.limit <= 0 ? t.noPlan : !st.ready ? t.notReady : st.remaining <= 0 ? t.noneLeft : null;

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending || blocked) return;
    add({ role: "me", text: question });
    setText("");
    try {
      const r = await ask.mutateAsync({ question, chatId, bubble: { page: `${pathname}${search}` } });
      setChatId(r.chatId);
      // They said "hazlo por mí" (or the assistant saw a direct order): "Okey, empiezo a hacerlo" and it starts.
      const now = !!r.task && (r.start || DO_IT.test(question));
      const said: Lang = r.lang === "es" || r.lang === "en" ? r.lang : lang;
      const id = add({ role: "bot", text: r.answer, task: r.task ?? null, report: r.report ?? null, used: now, lang: said });
      void utils.assistant.status.invalidate();
      if (now && r.task) { const task = r.task; window.setTimeout(() => void runTask(id, task, "auto", said), 1300); }
    } catch (e) {
      add({ role: "bot", text: e instanceof Error ? e.message : t.notReady });
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void send(text); };

  const runTask = async (id: number, task: BubbleTask, how: GuideMode, l: Lang = lang) => {
    const g = guideRef.current;
    if (!g) return;
    setMsgs((list) => list.map((m) => (m.id === id ? { ...m, used: true } : m)));
    setOpen(false);
    setRunning(true);
    talkLang.current = l;
    const w = bubbleCopy[l];
    const tctx = ctxIn(l);
    const plan = planFor(task, tctx);
    let end;
    if (task.task === "goal" && how === "auto") {
      // It asks as it goes, with suggestions from their own numbers (Metas' goalOptions).
      const o = await utils.personal.goalOptions.fetch().catch(() => null);
      const result: GoalResult = { name: task.name ?? "", amount: task.amount ?? 0, created: false };
      end = await g.runScript(goalScript(task, tctx, { monthIn: o?.monthlyIncome ?? null, monthOut: o?.monthlySpending ?? null, savings: o?.savings ?? [] }, result), how);
      plan.done = end === "done" && result.created ? w.tasks.goal.done(result.name, moneyAuto(result.amount)) : null;
      if (end === "done" && !result.created) end = "stopped";
      if (end === "missing") plan.missing = w.tasks.goalAsk.notCreated;
    } else end = await g.runSteps(plan.steps, how);
    setRunning(false);
    if (end === "done") {
      if (plan.quiet) void g.note(plan.quiet);
      if (plan.done) {
        // A sheet the task left open (a movement's detail) closes, so the panel can be used.
        if (document.querySelector("[role='dialog'][data-state='open']")) document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        add({ role: "bot", text: plan.done });
        window.setTimeout(() => setOpen(true), 300);
      }
    } else if (end === "missing") {
      add({ role: "bot", text: plan.missing ?? w.missing });
      window.setTimeout(() => setOpen(true), 300);
    } else if (g.stoppedByPerson) {
      // It went back to its corner because they tapped: it says so, and the chat offers to go on.
      void g.noteAtHome(w.stoppedNote);
      add({ role: "bot", text: w.goOn, task, lang: l });
    } else {
      add({ role: "bot", text: w.stopped });
    }
  };

  const sendReport = (id: number, r: BubbleReport) => {
    setMsgs((list) => list.map((m) => (m.id === id ? { ...m, reported: "sending" } : m)));
    report.mutate({ summary: r.summary, page: `${pathname}${search}` }, {
      onSuccess: () => {
        setMsgs((list) => list.map((m) => (m.id === id ? { ...m, reported: "sent" } : m)));
        add({ role: "bot", text: t.reported });
      },
      onError: (e) => {
        setMsgs((list) => list.map((m) => (m.id === id ? { ...m, reported: undefined } : m)));
        add({ role: "bot", text: e.message });
      },
    });
  };

  const asked = msgs.some((m) => m.role === "me");
  const sugg = t.sugg[pathname] ?? t.sugg[mode] ?? [];
  const left = st && st.limit > 0 && st.remaining > 0 && st.remaining <= 5 ? t.left(st.remaining) : null;

  return (
    <div className="ab-root" data-assistant-bubble="">
      {/* The drop that joins the bubble and its cloud (no frame around what it shows: owner, 2026-11-24) */}
      <svg ref={neckRef} className="ab-neck" aria-hidden="true"><g><path className="ab-neck-fill" /><path className="ab-neck-side" /><path className="ab-neck-side" /></g></svg>
      <div ref={cloudRef} className="ab-say" aria-live="polite" />
      {/* Its little companion and the film that joins them for a moment (buddy.ts); never takes taps */}
      <svg className="ab-skin" aria-hidden="true"><path ref={skinRef} /></svg>
      <div ref={budRef} className={cn("ab-buddy", gone && "ab-gone")} aria-hidden="true" style={{ ["--ab-bsize" as string]: `${Math.round(size * 0.4)}px` }}><i><canvas ref={budOrbRef} /></i></div>
      <button
        ref={bubbleRef} type="button" onClick={toggle} aria-label={t.open} aria-expanded={open} data-running={running ? "1" : undefined}
        className={cn("ab-bubble", gone && "ab-gone")}
        style={{ ["--ab-size" as string]: `${size}px` }}
      >
        <span className="ab-squash">
          <canvas ref={orbRef} className="ab-orb" aria-hidden="true" />
          <span className="ab-waves"><svg ref={wavesRef} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" /></span>
        </span>
      </button>

      <div ref={scrimRef} className={cn("ab-scrim", open && !hidden && "ab-on")} onClick={() => setOpen(false)} aria-hidden="true" />
      <section ref={panelRef} data-ab-panel="" role="dialog" aria-label={t.title} aria-hidden={!open || hidden}
        className={cn("ab-panel", (!open || hidden) && "ab-closed")}>
        <div className="ab-head">
          <span className="ab-mini" aria-hidden="true"><canvas ref={miniRef} /></span>
          <span className="min-w-0"><b className="block text-[15px] font-bold">{t.title}</b><small className="block text-xs text-slate-500">{t.sub}</small></span>
          <button type="button" className="ab-x" onClick={() => setOpen(false)} aria-label={t.close}><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div ref={msgsRef} className="ab-msgs" aria-live="polite">
          {msgs.map((m) => (
            <div key={m.id} className={cn("ab-m", m.role === "me" ? "ab-me" : "ab-bot")}>
              {m.text}
              {m.task && !m.used && (
                <div>
                  {offerLine(m.task, m.lang ? ctxIn(m.lang) : ctx) && <span className="mt-1.5 block text-[12.5px] font-medium text-slate-500">{offerLine(m.task, m.lang ? ctxIn(m.lang) : ctx)}</span>}
                  <button type="button" className="ab-go" data-bubble-do="auto" onClick={() => void runTask(m.id, m.task as BubbleTask, "auto", m.lang)}>{bubbleCopy[m.lang ?? lang].doIt}</button>
                  <button type="button" className="ab-go ab-alt" data-bubble-do="teach" onClick={() => void runTask(m.id, m.task as BubbleTask, "teach", m.lang)}>{bubbleCopy[m.lang ?? lang].teach}</button>
                </div>
              )}
              {m.report && m.reported !== "sent" && (
                <div><button type="button" className="ab-link" data-bubble-report="" disabled={m.reported === "sending"} onClick={() => sendReport(m.id, m.report as BubbleReport)}>
                  {m.reported === "sending" ? t.reporting : t.report}
                </button></div>
              )}
            </div>
          ))}
          {ask.isPending && <div className="ab-m ab-bot ab-typing" aria-label="…"><i /><i /><i /></div>}
          {blocked && <div className="ab-m ab-bot">{blocked}</div>}
        </div>
        <div>
          <div className={cn("ab-sugg", (asked || !!blocked) && "ab-folded")}>
            {sugg.map((q) => <button key={q} type="button" onClick={() => void send(q)} tabIndex={asked ? -1 : 0}>{q}</button>)}
          </div>
          {left && <p className="px-[18px] pb-1 text-xs text-slate-500">{left}</p>}
          <form className="ab-ask" onSubmit={submit}>
            <label htmlFor="ab-q" className="sr-only">{t.askLabel}</label>
            <input ref={inputRef} id="ab-q" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.ask} maxLength={1000} disabled={!!blocked} enterKeyHint="send" />
            <button type="submit" aria-label={t.send} disabled={!text.trim() || ask.isPending || !!blocked}><ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" /></button>
          </form>
        </div>
      </section>
    </div>
  );
}
