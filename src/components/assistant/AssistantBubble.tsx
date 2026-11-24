// ── The assistant's bubble: on every page of the app ──
// A clear soap bubble with a star (the prototype the owner approved, 2026-11-24). Tap it: a small panel (a sheet from
// below on phones) where they ask anything; the same assistant answers with their own data and knows the page they're
// on (api/lib/bubble.ts). When it's something done in the app, the answer comes with "Hazlo por mí" (the bubble does it
// with the app's own buttons while they watch; any tap of theirs stops it) and "Enséñame" (it lights each step and
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
import { Guide, glide, visible, type GuideMode } from "./guide";
import { offerLine, planFor, type TaskCtx } from "./tasks";
import "./bubble.css";

/** "Hazlo por mí" in their own words: the task starts at once, without the buttons. */
const DO_IT = /\bh[aá]z(lo|melo|me)\b|\bpor m[ií]\b|\bdo it\b|\bfor me\b/i;

type Msg = { id: number; role: "me" | "bot"; text: string; task?: BubbleTask | null; report?: BubbleReport | null; used?: boolean; reported?: "sending" | "sent"; lang?: Lang };

let nextId = 1;
const STAR = "M12 2 C12.6 7.4 16.6 11.4 22 12 C16.6 12.6 12.6 16.6 12 22 C11.4 16.6 7.4 12.6 2 12 C7.4 11.4 11.4 7.4 12 2 Z";
const STAR_SOFT = "M12 4.5 C13.6 8.8 15.2 10.4 19.5 12 C15.2 13.6 13.6 15.2 12 19.5 C10.4 15.2 8.8 13.6 4.5 12 C8.8 10.4 10.4 8.8 12 4.5 Z";

/** Where it rests: the lower right corner, above the phone's tab bar and above the tax preparer's bubble. */
function homeOf(size: number): { x: number; y: number } {
  const vw = window.innerWidth, vh = window.innerHeight;
  const tab = document.querySelector("nav[data-tabbar]");
  const tabH = tab && visible(tab) ? tab.getBoundingClientRect().height : 0;
  const dock = document.querySelector("[data-tax-dock]");
  const dockH = dock && visible(dock) ? Math.max(0, vh - tabH - dock.getBoundingClientRect().top) + 8 : 0;
  const gap = vw < 1024 ? 14 : 24;
  return { x: vw - size - gap, y: vh - size - gap - tabH - dockH };
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
  const spotRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const guideRef = useRef<Guide | null>(null);
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
  useEffect(() => { sizeRef.current = size; guideRef.current?.rest(); }, [size]);
  useEffect(() => {
    if (!bubbleRef.current || !cloudRef.current || !spotRef.current) return;
    const own = (n: Node) => [bubbleRef.current, cloudRef.current, panelRef.current, scrimRef.current].some((el) => !!el && el.contains(n));
    const g = new Guide({
      bubble: bubbleRef.current, cloud: cloudRef.current, spot: spotRef.current,
      home: () => homeOf(sizeRef.current), size: () => sizeRef.current,
      navigate: (p) => goRef.current(p), own, stepLabel: (i, n) => bubbleCopy[talkLang.current].step(i, n),
      get moreWords() { return bubbleCopy[talkLang.current].more; },
    });
    guideRef.current = g;
    const onResize = () => g.rest();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); g.destroy(); guideRef.current = null; };
    // Made once: the step words follow talkLang (a ref), the size and navigation follow their refs.
  }, []);
  // A new page: back to its corner (the tax preparer's bubble may be there now).
  useEffect(() => {
    const id = window.setTimeout(() => guideRef.current?.rest(true), 350);
    return () => window.clearTimeout(id);
  }, [pathname]);
  useEffect(() => { if (hidden) guideRef.current?.stop(); }, [hidden]);

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
    const plan = planFor(task, ctxIn(l));
    const end = await g.runSteps(plan.steps, how);
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
      <div ref={spotRef} className="ab-spot" aria-hidden="true" />
      <div ref={cloudRef} className="ab-say" aria-live="polite" />
      <button
        ref={bubbleRef} type="button" onClick={toggle} aria-label={t.open} aria-expanded={open} data-running={running ? "1" : undefined}
        className={cn("ab-bubble", (hidden || (open && !running)) && "ab-gone")}
        style={{ ["--ab-size" as string]: `${size}px` }}
      >
        <span className="ab-squash">
          <span className="ab-film" /><span className="ab-glint" /><span className="ab-glint2" />
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <defs><linearGradient id="ab-sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset=".55" stopColor="#6366f1" /><stop offset="1" stopColor="#a855f7" /></linearGradient></defs>
            <g className="ab-star">
              <path fill="url(#ab-sg)" d={STAR}>
                <animate attributeName="d" dur="6s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" values={`${STAR};${STAR_SOFT};${STAR}`} />
              </path>
            </g>
            <g className="ab-spark"><path fill="#a5b4fc" d="M19.5 2.2 C19.7 4 20.9 5.1 22.6 5.3 C20.9 5.5 19.7 6.7 19.5 8.4 C19.3 6.7 18.1 5.5 16.4 5.3 C18.1 5.1 19.3 4 19.5 2.2 Z" transform="translate(-1 -1) scale(.9)" /></g>
          </svg>
        </span>
      </button>

      <div ref={scrimRef} className={cn("ab-scrim", open && !hidden && "ab-on")} onClick={() => setOpen(false)} aria-hidden="true" />
      <section ref={panelRef} data-ab-panel="" role="dialog" aria-label={t.title} aria-hidden={!open || hidden}
        className={cn("ab-panel", (!open || hidden) && "ab-closed")}>
        <div className="ab-head">
          <span className="ab-mini" aria-hidden="true"><span className="ab-film" /><svg viewBox="0 0 24 24"><path fill="url(#ab-sg)" d={STAR} /></svg></span>
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
