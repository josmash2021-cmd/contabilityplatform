// "Un día con la app" (/como-funciona): María's and Ana's day, each moment shown on the app's own screen,
// in a phone. Tap a moment to see it; the day also moves on by itself while it's on screen (it stops when
// someone taps, or with "Pausar", and never moves for people who turn motion off). Sample data.
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Building2, CalendarCheck, Camera, Check, CheckCircle2, Copy, Download, Dumbbell, FileText, Home,
  LayoutGrid, List, MoreHorizontal, Moon, Pause, Pencil, Play, Plus, Send, ShoppingCart, Sparkles, Sun, Sunrise, Target, User,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";
import { PhoneCase, PhoneChrome, PhoneStatusBar } from "@/components/marketing/PhoneKit";
import { useInView, useReducedMotion } from "@/hooks/useInView";
import type { ComoFuncionaCopy } from "@/i18n/copy/site/comoFunciona";

type C = ComoFuncionaCopy["day"];
type A = C["app"];
type Who = "business" | "personal";
type Step = { part: string; time: string; title: string; text: string; screens?: string };

/** How long each moment stays before the next one, while the day plays by itself. */
const STEP_MS = 7000;
const momentIcons: LucideIcon[] = [Sunrise, Sun, Moon, CalendarCheck];

/** The three moments of the day, then the end of the month. */
function stepsOf(c: C, who: Who): Step[] {
  return [...c[who].moments, { part: c.app.endPart, time: c.app.endTime, title: c.app.endTitle[who], text: c[who].end }];
}

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
function BizMorning({ a }: { a: A }) {
  const m = a.business.morning;
  return (
    <>
      <AppHead title={m.hello} />
      <div className={`${card} p-3.5`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[14px] font-bold text-slate-900">{m.today}</p>
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">3</span>
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
                {i < 2
                  ? <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600"><Check className="h-3 w-3" />{m.approved}</span>
                  : <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">{m.approve}</span>}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-blue-700"><Pencil className="h-3 w-3" />{m.fixed}</p>
      </div>
    </>
  );
}

function BizMidday({ a }: { a: A }) {
  const m = a.business.midday;
  return (
    <>
      <AppHead title={m.title} icon={<ShoppingCart className="h-5 w-5 text-blue-600" />} />
      <div className={`${card} p-3.5`}>
        <p className="text-[12px] font-semibold text-slate-900">{m.client}</p>
        <p className="truncate text-[11px] text-slate-500">{m.service}</p>
        <p className="mt-1.5 text-[28px] font-extrabold tracking-tight tabular-nums text-slate-900">$630.00</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {m.methods.map((x, i) => (
            <span key={x} className={`rounded-lg py-1.5 text-center text-[11px] font-semibold ${i === 1 ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600"}`}>{x}</span>
          ))}
        </div>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-[12px] font-semibold text-white"><CheckCircle2 className="h-4 w-4" />{m.done}</p>
      </div>
      <div className={`${card} mt-3 flex items-center gap-3 p-3`}>
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

function BizNight({ a }: { a: A }) {
  const m = a.business.night;
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
        <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-blue-600 px-3 py-2 text-[12px] text-white">{m.ask}</p>
        <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3 py-2.5 text-[12px] leading-relaxed text-slate-800 ring-1 ring-slate-200">
          {m.answer}
          <span className="mt-2 flex"><Chip tone="blue"><BarChart3 className="h-2.5 w-2.5" />{m.source}</Chip></span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-400">
        <span className="flex-1">{m.placeholder}</span>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white"><Send className="h-3 w-3" /></span>
      </div>
    </>
  );
}

function BizEnd({ a }: { a: A }) {
  const m = a.business.end;
  const bars = [38, 52, 44, 66, 58, 74];
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
        {bars.map((h, i) => <span key={i} className={`flex-1 rounded-t ${i === bars.length - 1 ? "bg-blue-600" : "bg-blue-200"}`} style={{ height: `${h}%` }} />)}
      </div>
      <div className={`${card} mt-2.5 p-3`}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#16A34A] text-[10px] font-bold text-white">XLS</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12px] font-semibold text-slate-900">{m.file}</p>
            <p className="text-[10px] text-slate-500">{m.fileNote}</p>
          </div>
        </div>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-[12px] font-semibold text-white"><Download className="h-3.5 w-3.5" />{m.download}</p>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700"><Send className="h-3.5 w-3.5" />{m.sent}</p>
    </>
  );
}

// ── Ana (personal) ──
function PerMorning({ a }: { a: A }) {
  const m = a.personal.morning;
  return (
    <>
      <AppHead title={m.title} />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-[12px] font-semibold text-amber-900">{m.alert}</p>
        <p className="text-[11px] text-amber-800">{m.alertText}</p>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-amber-200/70"><span className="block h-full w-4/5 rounded-full bg-amber-500" /></span>
      </div>
      <p className="mb-1.5 mt-3.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.yesterday}</p>
      <ul className={`${card} divide-y divide-slate-100 px-3`}>
        {m.rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2.5 py-2.5">
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

function PerMidday({ a }: { a: A }) {
  const m = a.personal.midday;
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
        <li className="flex items-center gap-2.5 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100"><Dumbbell className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-slate-900">{m.gym}</p>
            <p className="text-[10px] font-medium text-rose-600">{m.gymNote}</p>
          </div>
          <span className="text-[12px] font-bold tabular-nums text-slate-900">{m.gymPrice}</span>
        </li>
      </ul>
      <div className={`${card} mt-2.5 p-3`}>
        <p className="text-[12px] font-bold text-slate-900">{m.guide}</p>
        <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 ring-1 ring-slate-200">{m.email}</p>
        <p className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-[12px] font-semibold text-white"><Copy className="h-3.5 w-3.5" />{m.copied}</p>
      </div>
    </>
  );
}

function PerNight({ a }: { a: A }) {
  const m = a.personal.night;
  return (
    <>
      <AppHead title={m.title} icon={<Target className="h-5 w-5 text-blue-600" />} />
      <div className={`${card} p-3.5`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold text-slate-900">{m.goal}</p>
          <Chip tone="green">{m.added}</Chip>
        </div>
        <p className="mt-1.5 text-[22px] font-extrabold tracking-tight tabular-nums text-slate-900">{m.saved} <span className="text-[12px] font-medium text-slate-500">{m.of}</span></p>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full w-[43%] rounded-full bg-blue-600" /></span>
        <p className="mt-1.5 text-[11px] text-slate-500">{m.left}</p>
      </div>
      <div className={`${card} mt-2.5 p-3`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.taxes}</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="grid h-12 w-10 shrink-0 place-items-center rounded-lg bg-slate-50 ring-1 ring-slate-200"><FileText className="h-4 w-4 text-slate-500" /></span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12px] font-semibold text-slate-900">{m.w2}</p>
            <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{m.w2done}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function PerEnd({ a }: { a: A }) {
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
          {m.cats.map(([name, amount, pct]) => (
            <li key={name}>
              <div className="flex justify-between text-[11px]"><span className="text-slate-700">{name}</span><span className="font-semibold tabular-nums text-slate-900">{amount}</span></div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${pct * 2}%` }} /></span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{m.note}</p>
    </>
  );
}

const SCREENS: Record<Who, Array<{ Screen: (p: { a: A }) => ReactNode; tab: number }>> = {
  business: [{ Screen: BizMorning, tab: 0 }, { Screen: BizMidday, tab: 1 }, { Screen: BizNight, tab: 3 }, { Screen: BizEnd, tab: 2 }],
  personal: [{ Screen: PerMorning, tab: 1 }, { Screen: PerMidday, tab: 3 }, { Screen: PerNight, tab: 2 }, { Screen: PerEnd, tab: 0 }],
};

// ── The section ──
/** The picked moment: when, what, the screens it uses, and how long until the next one. */
function MomentText({ s, who, step, playing }: { s: Step; who: Who; step: number; playing: boolean }) {
  return (
    <>
      <span className="block text-sm font-medium text-blue-300">{s.part} · <span className="tabular-nums">{s.time}</span></span>
      <span className="mt-0.5 block text-lg font-semibold text-white">{s.title}</span>
      <span className="mt-1.5 block leading-relaxed text-slate-300">{s.text}</span>
      {s.screens && (
        <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-300">
          <LayoutGrid aria-hidden className="h-3.5 w-3.5 text-slate-400" />{s.screens}
        </span>
      )}
      {playing && (
        <span aria-hidden className="mt-3 block h-0.5 overflow-hidden rounded-full bg-white/10">
          <span key={`${who}-${step}`} className="day-progress block h-full rounded-full bg-blue-400" style={{ animationDuration: `${STEP_MS}ms` }} />
        </span>
      )}
    </>
  );
}

export function DayWithApp({ c }: { c: C }) {
  const [who, setWho] = useState<Who>("business");
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const still = useReducedMotion();
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const steps = stepsOf(c, who);
  const playing = auto && inView && !still;

  // The day moves on by itself while it's on screen.
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % steps.length), STEP_MS);
    return () => window.clearTimeout(id);
  }, [playing, step, who, steps.length]);

  const pickWho = (w: Who) => { setWho(w); setStep(0); };
  const pickStep = (i: number) => { setStep(i); setAuto(false); };
  const { Screen, tab } = SCREENS[who][step];
  const person = c[who];
  const current = steps[step];

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
                <button key={w} type="button" aria-pressed={on} onClick={() => pickWho(w)}
                  className={`inline-flex min-w-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:px-5 ${on ? "bg-white text-slate-900" : "text-slate-300 hover:text-white"}`}>
                  <Icon aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c[w].name}<span className="hidden font-normal opacity-70 sm:inline"> · {c[w].who}</span></span>
                </button>
              );
            })}
          </div>
        </Reveal>

        <div ref={viewRef} className="mx-auto mt-10 grid max-w-6xl items-center gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
          <div className="min-w-0">
            <div className="flex items-start gap-3.5 px-1">
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-semibold text-white">{person.name}</h3>
                <p className="text-[15px] text-slate-400">{person.who}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300">{c.example}</span>
              {!still && (
                <button type="button" onClick={() => setAuto((x) => !x)} aria-label={auto ? c.app.pause : c.app.play} title={auto ? c.app.pause : c.app.play}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-slate-200 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  {auto ? <Pause aria-hidden className="h-3.5 w-3.5" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            {/* Phones: the four moments as buttons right above the phone, then the one picked. */}
            <div className="mt-5 lg:hidden">
              <div role="tablist" aria-label={c.app.momentsAria} className="grid grid-cols-4 gap-1.5">
                {steps.map((s, i) => {
                  const Icon = momentIcons[i];
                  const on = i === step;
                  return (
                    <button key={s.part} type="button" role="tab" id={`day-chip-${i}`} aria-selected={on} aria-controls="day-panel" onClick={() => pickStep(i)}
                      className={`grid min-w-0 justify-items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${on ? "bg-white text-slate-900" : "bg-white/[0.05] text-slate-300 ring-1 ring-white/10"}`}>
                      <Icon aria-hidden className={`h-4 w-4 ${on ? "text-amber-500" : "text-slate-400"}`} />
                      <span className="max-w-full truncate">{s.part}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/15">
                <MomentText s={current} who={who} step={step} playing={playing} />
              </div>
            </div>

            {/* Computers: the day as a list, the picked moment open. */}
            <ol role="tablist" aria-label={c.app.momentsAria} className="mt-5 hidden space-y-1.5 lg:block">
              {steps.map((s, i) => {
                const Icon = momentIcons[i];
                const on = i === step;
                return (
                  <li key={s.part} role="presentation">
                    <button type="button" role="tab" id={`day-tab-${i}`} aria-selected={on} aria-controls="day-panel" onClick={() => pickStep(i)}
                      className={`flex w-full gap-4 rounded-2xl p-4 text-left transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${on ? "bg-white/[0.07] ring-1 ring-white/15" : "hover:bg-white/[0.03]"}`}>
                      <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-white/10 transition-colors ${on ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.05] text-slate-400"}`}><Icon className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1 pt-0.5">
                        {on ? <MomentText s={s} who={who} step={step} playing={playing} /> : (
                          <>
                            <span className="block text-sm font-medium text-blue-300">{s.part} · <span className="tabular-nums">{s.time}</span></span>
                            <span className="mt-0.5 block text-lg font-semibold text-slate-300">{s.title}</span>
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${step}`}>
            <PhoneCase label={c.app.phoneAria(person.name, current.part, current.title)}>
              <div className="relative h-[600px] overflow-hidden rounded-[2.6rem] bg-slate-50 [contain:paint] sm:h-[640px]">
                <PhoneChrome />
                <PhoneStatusBar />
                <div key={`${who}-${step}`} className="page-in px-4 pb-24 pt-1" aria-hidden>
                  <Screen a={c.app} />
                </div>
                <TabBar who={who} labels={c.app.tabs[who]} active={tab} />
              </div>
            </PhoneCase>
          </div>
        </div>
      </div>
    </section>
  );
}
