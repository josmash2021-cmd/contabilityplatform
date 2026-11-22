// "Un día con la app" (/como-funciona): María's and Ana's day, each moment with its own phone showing the
// app's screen for it. The phones stand straight, take turns on each side and come in as you scroll; on each
// screen a finger does that moment's task (approve, charge, ask, download…) over and over while it's on screen.
// People who turn motion off see each task already done. Sample data.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3, Building2, CalendarCheck, Camera, Check, CheckCircle2, Copy, Download, Dumbbell, FileText, Home,
  LayoutGrid, List, MoreHorizontal, Moon, Pencil, Plus, Send, ShoppingCart, Sparkles, Sun, Sunrise, Target, User,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";
import { PhoneCase, PhoneChrome, PhoneStatusBar } from "@/components/marketing/PhoneKit";
import { useInView, useReducedMotion } from "@/hooks/useInView";
import { FileLogo } from "@/components/FileLogo";
import type { ComoFuncionaCopy } from "@/i18n/copy/site/comoFunciona";

type C = ComoFuncionaCopy["day"];
type A = C["app"];
type Who = "business" | "personal";
type Step = { part: string; time: string; title: string; text: string; screens?: string };
/** What every screen gets: the copy, and the frame its little scene is on. */
type SP = { a: A; f: number };

const momentIcons: LucideIcon[] = [Sunrise, Sun, Moon, CalendarCheck];

/** The three moments of the day, then the end of the month. */
function stepsOf(c: C, who: Who): Step[] {
  return [...c[who].moments, { part: c.app.endPart, time: c.app.endTime, title: c.app.endTitle[who], text: c[who].end }];
}

/**
 * The frame a screen's scene is on: each frame lasts its time (ms), then the next; after the last one the
 * scene starts over (a new `round`). While `on` is false (off screen, or motion turned off) it stays on the
 * last frame: the task done.
 */
function useScene(times: readonly number[], on: boolean): { f: number; round: number } {
  const [at, setAt] = useState({ f: 0, round: 0 });
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(
      () => setAt(({ f, round }) => (f + 1 < times.length ? { f: f + 1, round } : { f: 0, round: round + 1 })),
      times[at.f],
    );
    return () => window.clearTimeout(t);
  }, [at, on, times]);
  return on ? at : { f: times.length - 1, round: at.round };
}

/** A finger's tap on what's under it (the parent must be `relative`). */
function Tap({ on }: { on: boolean }) {
  return on ? <span aria-hidden className="tap-ripple" /> : null;
}

/** Fades something in from a little below once it's there; it keeps its place while hidden. */
const appear = (on: boolean) => `transition-all duration-500 ${on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`;

// ── The app's pieces, at phone size ──
const card = "rounded-2xl border border-slate-200 bg-white";

function AppHead({ title, sub, icon }: { title: string; sub?: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-3 pt-1">
      {icon}
      <div className="min-w-0">
        <p className="truncate text-[17px] font-bold tracking-tight text-slate-900">{title}</p>
        {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function Brand({ slug }: { slug: string }) {
  return <img src={`/brands/merchants/${slug}.png`} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-0.5 ring-1 ring-slate-200" />;
}

function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "blue" | "green" | "amber" }) {
  const tones = { slate: "bg-slate-100 text-slate-600", blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-200", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function TabBar({ who, labels, active }: { who: Who; labels: string[]; active: number }) {
  const icons: LucideIcon[] = who === "business" ? [Home, ShoppingCart, BarChart3, MoreHorizontal] : [Home, List, Target, MoreHorizontal];
  const tab = (i: number) => {
    const Icon = icons[i];
    return (
      <span className={`grid justify-items-center gap-0.5 pt-1 text-[10px] font-semibold ${i === active ? "text-blue-600" : "text-slate-500"}`}>
        <Icon className="h-[19px] w-[19px]" strokeWidth={1.8} />{labels[i]}
      </span>
    );
  };
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-5">
      <div className="grid grid-cols-5 items-start">
        {tab(0)}{tab(1)}
        <span className="grid justify-items-center"><span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-white shadow-[0_10px_22px_-8px_rgba(37,99,235,0.8)]"><Plus className="h-6 w-6" /></span></span>
        {tab(2)}{tab(3)}
      </div>
    </div>
  );
}

// ── María (business) ──
/** She approves the bank's three new transactions, one by one. */
const BIZ_MORNING = [900, 650, 450, 650, 450, 650, 2800] as const;
function BizMorning({ a, f }: SP) {
  const m = a.business.morning;
  const done = f >= 6 ? 3 : f >= 4 ? 2 : f >= 2 ? 1 : 0;
  const tapping = f === 1 ? 0 : f === 3 ? 1 : f === 5 ? 2 : -1;
  const left = m.rows.length - done;
  return (
    <>
      <AppHead title={m.hello} />
      <div className={`${card} p-3.5`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[14px] font-bold text-slate-900">{m.today}</p>
          {left > 0
            ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white tabular-nums">{left}</span>
            : <span className="day-pop grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>}
        </div>
        <p className="text-[11px] text-slate-500">{m.news}</p>
        <ul className="mt-2.5 divide-y divide-slate-100">
          {m.rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-2.5 py-2.5">
              <Brand slug={r.logo} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-slate-900">{r.name}</p>
                {i === 2
                  ? <Chip tone="blue"><Pencil className="h-2.5 w-2.5" />{r.cat}</Chip>
                  : <Chip>{r.cat}</Chip>}
              </div>
              <div className="grid justify-items-end gap-1">
                <span className={`text-[12px] font-bold tabular-nums ${r.amount.startsWith("+") ? "text-emerald-600" : "text-slate-900"}`}>{r.amount}</span>
                {i < done
                  ? <span className="day-pop inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600"><Check className="h-3 w-3" />{m.approved}</span>
                  : (
                    <span className={`relative rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white transition-transform duration-150 ${tapping === i ? "scale-90" : ""}`}>
                      {m.approve}<Tap on={tapping === i} />
                    </span>
                  )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-blue-700"><Pencil className="h-3 w-3" />{m.fixed}</p>
      </div>
    </>
  );
}

/** She picks Zelle, charges the $630, then her receipt is saved. */
const BIZ_MIDDAY = [900, 650, 500, 650, 900, 2800] as const;
function BizMidday({ a, f }: SP) {
  const m = a.business.midday;
  const picked = f >= 2;
  const paid = f >= 4;
  return (
    <>
      <AppHead title={m.title} icon={<ShoppingCart className="h-5 w-5 text-blue-600" />} />
      <div className={`${card} p-3.5`}>
        <p className="text-[12px] font-semibold text-slate-900">{m.client}</p>
        <p className="truncate text-[11px] text-slate-500">{m.service}</p>
        <p className="mt-1.5 text-[28px] font-extrabold tracking-tight tabular-nums text-slate-900">$630.00</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {m.methods.map((x, i) => (
            <span key={x} className={`relative rounded-lg py-1.5 text-center text-[11px] font-semibold transition-colors duration-300 ${i === 1 && picked ? "bg-slate-900 text-white ring-1 ring-slate-900" : "text-slate-600 ring-1 ring-inset ring-slate-200"}`}>
              {x}{i === 1 && <Tap on={f === 1} />}
            </span>
          ))}
        </div>
        <p className={`relative mt-2.5 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold text-white transition-[background-color,transform] duration-300 ${paid ? "bg-emerald-600" : "bg-blue-600"} ${f === 3 ? "scale-95" : ""}`}>
          {paid ? <><CheckCircle2 className="day-pop h-4 w-4" />{m.done}</> : m.charge}
          <Tap on={f === 3} />
        </p>
      </div>
      <div className={`${card} mt-3 flex items-center gap-3 p-3 ${appear(f >= 5)}`}>
        <span className="grid h-12 w-10 shrink-0 place-items-center rounded-lg bg-[repeating-linear-gradient(180deg,#f8fafc_0_5px,#e2e8f0_5px_6px)] ring-1 ring-slate-200"><Camera className="h-4 w-4 text-slate-500" /></span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[12px] font-semibold text-slate-900">{m.receipt}</p>
          <p className="text-[11px] text-slate-500">{m.receiptText}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{m.saved}</p>
        </div>
      </div>
    </>
  );
}

/** She types her question, sends it, and the assistant answers. */
const BIZ_NIGHT = [800, 1300, 550, 1100, 3200] as const;
function BizNight({ a, f }: SP) {
  const m = a.business.night;
  const typing = f === 1 || f === 2;
  return (
    <>
      <AppHead title={m.title} icon={<Sparkles className="h-5 w-5 text-blue-600" />} />
      <div className={`${card} flex items-center gap-2.5 p-3`}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><FileText className="h-4 w-4" /></span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[12px] font-semibold text-slate-900">{m.quote}</p>
          <p className="text-[11px] text-emerald-700">{m.quoteText}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {f >= 3 && <p className="day-pop ml-auto w-fit max-w-[80%] origin-bottom-right rounded-2xl rounded-br-md bg-blue-600 px-3 py-2 text-[12px] text-white">{m.ask}</p>}
        {f === 3 && (
          <span className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-3 ring-1 ring-slate-200">
            <i className="typing-dot" /><i className="typing-dot [animation-delay:160ms]" /><i className="typing-dot [animation-delay:320ms]" />
          </span>
        )}
        {f >= 4 && (
          <div className="day-rise max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3 py-2.5 text-[12px] leading-relaxed text-slate-800 ring-1 ring-slate-200">
            {m.answer}
            <span className="mt-2 flex"><Chip tone="blue"><BarChart3 className="h-2.5 w-2.5" />{m.source}</Chip></span>
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px]">
        <span className="min-w-0 flex-1 truncate">
          {typing ? <span className="day-type text-slate-800">{m.ask}</span> : <span className="text-slate-400">{m.placeholder}</span>}
        </span>
        <span className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-white transition-transform duration-150 ${f === 2 ? "scale-90" : ""}`}>
          <Send className="h-3 w-3" /><Tap on={f === 2} />
        </span>
      </div>
    </>
  );
}

/** Her month's bars come up, she downloads the Excel, and it goes to her accountant. */
const BIZ_END = [600, 1000, 650, 1000, 3000] as const;
function BizEnd({ a, f }: SP) {
  const m = a.business.end;
  const bars = [38, 52, 44, 66, 58, 74];
  const done = f >= 4;
  return (
    <>
      <AppHead title={m.title} sub={m.month} icon={<BarChart3 className="h-5 w-5 text-blue-600" />} />
      <div className="grid grid-cols-3 gap-1.5">
        {m.kpis.map(([k, v], i) => (
          <div key={k} className={`${card} px-2 py-2`}>
            <p className="text-[10px] text-slate-500">{k}</p>
            <p className={`text-[13px] font-bold tabular-nums ${i === 2 ? "text-emerald-600" : "text-slate-900"}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className={`${card} mt-2.5 flex h-20 items-end gap-1.5 px-3 pb-2 pt-3`} aria-hidden>
        {bars.map((h, i) => (
          <span key={i} className={`flex-1 rounded-t transition-[height] duration-700 ease-out ${i === bars.length - 1 ? "bg-blue-600" : "bg-blue-200"}`}
            style={{ height: f >= 1 ? `${h}%` : "6%", transitionDelay: f >= 1 ? `${i * 70}ms` : "0ms" }} />
        ))}
      </div>
      <div className={`${card} mt-2.5 p-3`}>
        <div className="flex items-center gap-2.5">
          <FileLogo kind="excel" className="h-9 w-9" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12px] font-semibold text-slate-900">{m.file}</p>
            <p className="text-[10px] text-slate-500">{m.fileNote}</p>
          </div>
        </div>
        <div className="relative mt-2.5">
          <p className={`relative flex items-center justify-center gap-1.5 overflow-hidden rounded-xl py-2 text-[12px] font-semibold text-white transition-[background-color,transform] duration-300 ${done ? "bg-emerald-600" : "bg-slate-900"} ${f === 2 ? "scale-95" : ""}`}>
            {f === 3 && <span aria-hidden className="day-fill absolute inset-y-0 left-0 bg-white/20" />}
            {done ? <><Check className="day-pop h-3.5 w-3.5" />{m.downloaded}</> : <><Download className="h-3.5 w-3.5" />{m.download}</>}
          </p>
          <Tap on={f === 2} />
        </div>
      </div>
      <p className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 ${appear(done)}`}><Send className="h-3.5 w-3.5" />{m.sent}</p>
    </>
  );
}

// ── Ana (personal) ──
/** Yesterday's purchases come in one by one, then the budget notice. */
const PER_MORNING = [600, 500, 500, 700, 3200] as const;
function PerMorning({ a, f }: SP) {
  const m = a.personal.morning;
  const alert = f >= 4;
  return (
    <>
      <AppHead title={m.title} />
      <div className={`rounded-2xl border border-amber-200 bg-amber-50 p-3 ${appear(alert)}`}>
        <p className="text-[12px] font-semibold text-amber-900">{m.alert}</p>
        <p className="text-[11px] text-amber-800">{m.alertText}</p>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-amber-200/70">
          <span className="block h-full rounded-full bg-amber-500 transition-[width] delay-200 duration-1000 ease-out" style={{ width: alert ? "80%" : "0%" }} />
        </span>
      </div>
      <p className="mb-1.5 mt-3.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.yesterday}</p>
      <ul className={`${card} divide-y divide-slate-100 px-3`}>
        {m.rows.map((r, i) => (
          <li key={r.name} className={`flex items-center gap-2.5 py-2.5 ${appear(i < f)}`}>
            <Brand slug={r.logo} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-slate-900">{r.name}</p>
              <Chip>{r.cat}</Chip>
            </div>
            <span className="text-[12px] font-bold tabular-nums text-slate-900">{r.amount}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** She taps the gym she doesn't use, opens the guide and copies the email. */
const PER_MIDDAY = [900, 650, 900, 650, 2800] as const;
function PerMidday({ a, f }: SP) {
  const m = a.personal.midday;
  const open = f >= 2;
  const copied = f >= 4;
  return (
    <>
      <AppHead title={m.title} sub={m.monthly} />
      <ul className={`${card} divide-y divide-slate-100 px-3`}>
        {m.rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2.5 py-2.5">
            <Brand slug={r.logo} />
            <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-900">{r.name}</p>
            <span className="text-[12px] font-bold tabular-nums text-slate-900">{r.amount}</span>
          </li>
        ))}
        <li className={`relative -mx-3 flex items-center gap-2.5 rounded-b-2xl px-3 py-2.5 transition-colors duration-300 ${f >= 1 ? "bg-rose-50/70" : ""}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100"><Dumbbell className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-slate-900">{m.gym}</p>
            <p className="text-[10px] font-medium text-rose-600">{m.gymNote}</p>
          </div>
          <span className="text-[12px] font-bold tabular-nums text-slate-900">{m.gymPrice}</span>
          <Tap on={f === 1} />
        </li>
      </ul>
      <div className={`${card} mt-2.5 p-3 ${appear(open)}`}>
        <p className="text-[12px] font-bold text-slate-900">{m.guide}</p>
        <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 ring-1 ring-slate-200">{m.email}</p>
        <p className={`relative mt-2 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold text-white transition-[background-color,transform] duration-300 ${copied ? "bg-emerald-600" : "bg-slate-900"} ${f === 3 ? "scale-95" : ""}`}>
          {copied ? <><Check className="day-pop h-3.5 w-3.5" />{m.copied}</> : <><Copy className="h-3.5 w-3.5" />{m.copy}</>}
          <Tap on={f === 3} />
        </p>
      </div>
    </>
  );
}

/** She adds $50 to her goal, then takes the photo of her W-2. */
const PER_NIGHT = [900, 650, 1100, 650, 2800] as const;
function PerNight({ a, f }: SP) {
  const m = a.personal.night;
  const added = f >= 2;
  const photo = f >= 4;
  return (
    <>
      <AppHead title={m.title} icon={<Target className="h-5 w-5 text-blue-600" />} />
      <div className={`${card} p-3.5`}>
        <p className="truncate text-[13px] font-bold text-slate-900">{m.goal}</p>
        <p className="mt-1 text-[22px] font-extrabold tracking-tight tabular-nums text-slate-900">
          <span key={String(added)} className={added ? "day-pop inline-block" : undefined}>{added ? m.saved : m.savedBefore}</span>{" "}
          <span className="text-[12px] font-medium text-slate-500">{m.of}</span>
        </p>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100">
          <span className={`block h-full rounded-full bg-blue-600 transition-[width,box-shadow] duration-700 ease-out ${f === 2 ? "shadow-[0_0_10px_2px_rgba(37,99,235,0.55)]" : ""}`} style={{ width: added ? "43.3%" : "41.7%" }} />
        </span>
        <p className="mt-1.5 text-[11px] text-slate-500">{added ? m.left : m.leftBefore}</p>
        <p className={`relative mt-2.5 flex items-center justify-center gap-1 rounded-xl py-1.5 text-[12px] font-semibold text-white transition-[background-color,transform] duration-300 ${added ? "bg-emerald-600" : "bg-blue-600"} ${f === 1 ? "scale-95" : ""}`}>
          {added ? <><Check className="day-pop h-3.5 w-3.5" />{m.added}</> : <><Plus className="h-3.5 w-3.5" />{m.add}</>}
          <Tap on={f === 1} />
        </p>
      </div>
      <div className={`${card} mt-2.5 p-3`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.taxes}</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className={`grid h-12 w-10 shrink-0 place-items-center rounded-lg ring-1 transition-colors duration-300 ${photo ? "bg-emerald-50 text-emerald-600 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
            {photo ? <FileText className="day-pop h-4 w-4" /> : <Camera className="h-4 w-4" />}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12px] font-semibold text-slate-900">{m.w2}</p>
            {photo
              ? <p className="day-pop mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{m.w2done}</p>
              : (
                <span className={`relative mt-1 inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white transition-transform duration-150 ${f === 3 ? "scale-90" : ""}`}>
                  <Camera className="h-3 w-3" />{m.w2take}<Tap on={f === 3} />
                </span>
              )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Her month: where the money went fills in, then how much she saved. */
const PER_END = [600, 1200, 3200] as const;
function PerEnd({ a, f }: SP) {
  const m = a.personal.end;
  return (
    <>
      <AppHead title={m.title} />
      <div className="grid grid-cols-3 gap-1.5">
        {m.kpis.map(([k, v], i) => (
          <div key={k} className={`${card} px-2 py-2`}>
            <p className="text-[10px] text-slate-500">{k}</p>
            <p className={`text-[13px] font-bold tabular-nums ${i === 2 ? "text-emerald-600" : "text-slate-900"}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className={`${card} mt-2.5 p-3`}>
        <p className="text-[12px] font-bold text-slate-900">{m.spent}</p>
        <ul className="mt-2 space-y-2">
          {m.cats.map(([name, amount, pct], i) => (
            <li key={name}>
              <div className="flex justify-between text-[11px]"><span className="text-slate-700">{name}</span><span className="font-semibold tabular-nums text-slate-900">{amount}</span></div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out"
                  style={{ width: f >= 1 ? `${pct * 2}%` : "0%", transitionDelay: f >= 1 ? `${i * 150}ms` : "0ms" }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className={`mt-2.5 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800 ${appear(f >= 2)}`}><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{m.note}</p>
    </>
  );
}

const SCREENS: Record<Who, Array<{ Screen: (p: SP) => ReactNode; tab: number; times: readonly number[] }>> = {
  business: [
    { Screen: BizMorning, tab: 0, times: BIZ_MORNING }, { Screen: BizMidday, tab: 1, times: BIZ_MIDDAY },
    { Screen: BizNight, tab: 3, times: BIZ_NIGHT }, { Screen: BizEnd, tab: 2, times: BIZ_END },
  ],
  personal: [
    { Screen: PerMorning, tab: 1, times: PER_MORNING }, { Screen: PerMidday, tab: 3, times: PER_MIDDAY },
    { Screen: PerNight, tab: 2, times: PER_NIGHT }, { Screen: PerEnd, tab: 0, times: PER_END },
  ],
};

// ── The section ──
/**
 * One moment of the day: what happens, and a phone with that screen. The phones take turns on each side
 * (right, left, right, left), come in from their side as they reach the screen, then float; their scene
 * plays while they're on screen.
 */
function DayRow({ s, i, who, c }: { s: Step; i: number; who: Who; c: C }) {
  const [ref, inView] = useInView<HTMLLIElement>({ once: true, threshold: 0.2 });
  const [phoneRef, onScreen] = useInView<HTMLDivElement>({ threshold: 0.3 });
  const still = useReducedMotion();
  const left = i % 2 === 1; // the phone's side on computers
  const Icon = momentIcons[i];
  const { Screen, tab, times } = SCREENS[who][i];
  const shown = inView || still;
  const { f, round } = useScene(times, shown && onScreen && !still);
  return (
    <li ref={ref} className="relative grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
      {/* The day's line passes through each moment's icon (computers): the icon sits on the line, with no ring around it. */}
      <span aria-hidden className={`absolute left-1/2 top-1/2 z-10 hidden h-14 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center bg-[#060B18] text-amber-300 transition-transform duration-700 lg:grid ${shown ? "scale-100" : "scale-50"}`}>
        <Icon className="h-6 w-6" />
      </span>

      <div data-in={shown} className={`day-text min-w-0 ${left ? "lg:order-2" : ""}`} style={{ "--from-x": left ? "40px" : "-40px" } as CSSProperties}>
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-300">
          <Icon aria-hidden className="h-4 w-4 shrink-0 text-amber-300 lg:hidden" />
          <span>{s.part} · <span className="tabular-nums">{s.time}</span></span>
        </p>
        <h4 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{s.title}</h4>
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-slate-300">{s.text}</p>
        {s.screens && (
          <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <LayoutGrid aria-hidden className="h-3.5 w-3.5 text-slate-500" />{s.screens}
          </p>
        )}
      </div>

      <div className={`flex justify-center ${left ? "lg:order-1 lg:justify-end" : "lg:justify-start"}`}>
        <div ref={phoneRef} data-in={shown} className="day-phone" style={{ "--from-x": left ? "-70px" : "70px" } as CSSProperties}>
          <div className="day-float" style={{ animationDelay: `${i * -1.5}s` }}>
            <PhoneCase onDark label={c.app.phoneAria(c[who].name, s.part, s.title)}>
              <div className="relative h-[540px] overflow-hidden rounded-[2.6rem] bg-slate-50 [contain:paint] sm:h-[560px]">
                <PhoneChrome />
                <PhoneStatusBar />
                {/* The screen between the status bar and the tab bar, so something can sit at its bottom (the chat box).
                    Each time the scene starts over, the screen comes back into focus. */}
                <div key={round} className={`absolute inset-x-0 bottom-[84px] top-[46px] flex flex-col px-4 pb-3 pt-1 ${shown ? "page-in" : "opacity-0"}`} aria-hidden>
                  <Screen a={c.app} f={f} />
                </div>
                <TabBar who={who} labels={c.app.tabs[who]} active={tab} />
              </div>
            </PhoneCase>
          </div>
        </div>
      </div>
    </li>
  );
}

export function DayWithApp({ c }: { c: C }) {
  const [who, setWho] = useState<Who>("business");
  const steps = stepsOf(c, who);
  const person = c[who];

  return (
    <section aria-labelledby="day-title" className="relative overflow-hidden bg-[#060B18] py-24 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[720px] max-w-full -translate-x-1/2 rounded-full bg-blue-600/20 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-blue-400">{c.eyebrow}</p>
          <h2 id="day-title" className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{c.title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">{c.text}</p>
        </Reveal>

        <Reveal className="mt-10 flex justify-center">
          <div role="group" aria-label={c.app.peopleAria} className="inline-flex max-w-full gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10">
            {(["business", "personal"] as const).map((w) => {
              const Icon = w === "business" ? Building2 : User;
              const on = w === who;
              return (
                <button key={w} type="button" aria-pressed={on} onClick={() => setWho(w)}
                  className={`inline-flex min-w-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:px-5 ${on ? "bg-white text-slate-900" : "text-slate-300 hover:text-white"}`}>
                  <Icon aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c[w].name}<span className="hidden font-normal opacity-70 sm:inline"> · {c[w].who}</span></span>
                </button>
              );
            })}
          </div>
        </Reveal>

        <p className="mt-6 text-center text-[15px] text-slate-400">
          {person.who} <span className="text-slate-500">· {c.example}</span>
        </p>

        {/* A new key per person: their day comes in from the start. */}
        <ol key={who} className="relative mx-auto mt-16 max-w-6xl space-y-20 sm:space-y-24 lg:space-y-28">
          <span aria-hidden className="absolute bottom-0 left-1/2 top-0 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/15 to-transparent lg:block" />
          {steps.map((s, i) => <DayRow key={s.part} s={s} i={i} who={who} c={c} />)}
        </ol>
      </div>
    </section>
  );
}
