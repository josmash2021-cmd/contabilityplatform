// Illustrative product previews built in code (no external images).
// All numbers are sample data and are labeled as such.
import {
  ArrowDownRight, ArrowUpRight, CheckCircle2, FileText, LayoutDashboard, Landmark,
  Receipt, BarChart3, Users, ShoppingCart, Sparkles, Target, TrendingUp, Wallet, Lock, ChevronRight,
  Home, List, MoreHorizontal, Search, Bell, Plus, Inbox, CreditCard, Camera,
  Link2, Tag, Check,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Logo } from "@/components/Logo";
import { TRIAL_DAYS as TRIAL_DAYS_PREVIEW } from "@/components/marketing/content";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy } from "@/i18n/copy/marketing";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

function usePreviewCopy() {
  return useCopy(marketingCopy).previews;
}

function SampleBadge({ dark = false }: { dark?: boolean }) {
  const p = usePreviewCopy();
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${dark ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}>
      {p.sample}
    </span>
  );
}

// ── Hero: business dashboard ──
const chart = [
  { inc: 58, exp: 30 },
  { inc: 64, exp: 34 },
  { inc: 61, exp: 29 },
  { inc: 72, exp: 33 },
  { inc: 79, exp: 36 },
  { inc: 90, exp: 34 },
];

export function DashboardPreview() {
  const p = usePreviewCopy();
  const recent = [
    { name: p.recent[0], tag: p.tags.sale, amount: 1250, positive: true },
    { name: p.recent[1], tag: p.tags.materials, amount: -184.32, positive: false },
    { name: p.recent[2], tag: p.tags.sale, amount: 320, positive: true },
  ];
  const kpis = [
    { label: p.income, value: "$24,580", delta: "+12.4%", up: true },
    { label: p.expenses, value: "$9,135", delta: "-3.1%", up: false },
    { label: p.profit, value: "$15,445", delta: `62.8% ${p.margin}`, up: true },
  ];
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(2,6,23,0.6)] ring-1 ring-white/10">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 hidden truncate rounded-md bg-white px-3 py-1 text-[11px] text-slate-400 ring-1 ring-slate-200 sm:block">
            aethelaccountingplatform.com
          </span>
        </div>

        <div className="flex">
          {/* Mini sidebar */}
          <div className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-slate-100 py-4 sm:flex">
            {[LayoutDashboard, ShoppingCart, Users, Receipt, Landmark, BarChart3].map((Icon, i) => (
              <span key={i} className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 0 ? "bg-slate-900 text-white" : "text-slate-400"}`}>
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{p.summary}</p>
                <p className="text-sm font-semibold text-slate-900">{p.period}</p>
              </div>
              <SampleBadge />
            </div>

            {/* KPIs */}
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-xl border border-slate-100 p-2.5 sm:p-3">
                  <p className="text-[10px] text-slate-500 sm:text-[11px]">{k.label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{k.value}</p>
                  <p className={`mt-0.5 hidden items-center gap-0.5 text-[10px] font-medium sm:flex ${k.up ? "text-emerald-600" : "text-slate-500"}`}>
                    {k.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {k.delta}
                  </p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="mt-4 rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-slate-600">{p.chartTitle}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-900" />{p.income}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-300" />{p.expenses}</span>
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                {chart.map((d, i) => (
                  <div key={p.months[i]} className="flex flex-1 flex-col items-center gap-1">
                    {/* Fixed pixel heights: % heights collapse inside a flex column */}
                    <div className="flex h-24 w-full items-end justify-center gap-1">
                      <span className="w-2.5 rounded-t bg-slate-900 sm:w-3" style={{ height: `${Math.round(d.inc * 0.96)}px` }} />
                      <span className="w-2.5 rounded-t bg-blue-300 sm:w-3" style={{ height: `${Math.round(d.exp * 0.96)}px` }} />
                    </div>
                    <span className="text-[9px] text-slate-400">{p.months[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent transactions */}
            <ul className="mt-4 divide-y divide-slate-100">
              {recent.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800">{t.name}</p>
                    <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-500">{t.tag}</span>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold tabular-nums ${t.positive ? "text-emerald-600" : "text-slate-700"}`}>
                    {t.positive ? "+" : "-"}{money(Math.abs(t.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Callouts */}
      <div className="absolute -right-4 -top-5 hidden animate-soft-float rounded-xl bg-white px-3.5 py-2.5 shadow-xl ring-1 ring-slate-900/5 md:block xl:-right-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></span>
          <div>
            <p className="text-xs font-semibold text-slate-900">{p.categorizedTitle}</p>
            <p className="text-[11px] text-slate-500">{p.categorizedText}</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 hidden animate-soft-float rounded-xl bg-white px-3.5 py-2.5 shadow-xl ring-1 ring-slate-900/5 [animation-delay:1.5s] md:block xl:-left-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50"><FileText className="h-4 w-4 text-blue-600" /></span>
          <div>
            <p className="text-xs font-semibold text-slate-900">{p.reportTitle}</p>
            <p className="text-[11px] text-slate-500">{p.reportText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Business tab: income statement ──
export function ReportPreview() {
  const { report: r, period } = usePreviewCopy();
  const revenue = [21480, 3100];
  const expenses = [4210, 3600, 1325];
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-200 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{r.title}</p>
          <p className="mt-0.5 text-base font-semibold text-slate-900">{period}</p>
        </div>
        <SampleBadge />
      </div>

      <div className="mt-5 space-y-4 text-sm">
        <div>
          <p className="text-xs font-semibold text-slate-500">{r.revenue}</p>
          {revenue.map((v, i) => (
            <div key={r.rows[i]} className="mt-2 flex justify-between text-slate-700"><span>{r.rows[i]}</span><span className="tabular-nums">{money(v)}</span></div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500">{r.expenses}</p>
          {expenses.map((v, i) => (
            <div key={r.expenseRows[i]} className="mt-2 flex justify-between text-slate-700"><span>{r.expenseRows[i]}</span><span className="tabular-nums">-{money(v)}</span></div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
          <span className="font-medium">{r.net}</span>
          <span className="text-lg font-semibold tabular-nums">{money(15445)}</span>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500"><span>{r.margin}</span><span className="font-medium text-emerald-600">62.8%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[62.8%] rounded-full bg-emerald-500" /></div>
        </div>
      </div>
    </div>
  );
}

// ── Product section: the app on a real phone (same screens as the Ai Aethel 2.0 design) ──
function StatusBar() {
  return (
    <div className="relative z-10 grid h-[46px] grid-cols-[1fr_108px_1fr] items-center px-2 pt-1 text-[13px] font-semibold text-black" aria-hidden>
      <span className="justify-self-center tabular-nums">9:41</span>
      <span />
      <span className="flex items-center gap-[5px] justify-self-center">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.6" y="5" width="3" height="6" rx="1" /><rect x="9.2" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.8" y="0" width="3" height="11" rx="1" /></svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 2.3c2.1 0 4 .8 5.5 2.1l1.1-1.2A9.7 9.7 0 0 0 7.5.7 9.7 9.7 0 0 0 .9 3.2L2 4.4a8 8 0 0 1 5.5-2.1Z" /><path d="M7.5 5.5c1.2 0 2.3.4 3.2 1.2l1.1-1.2a6.4 6.4 0 0 0-8.6 0l1.1 1.2c.9-.8 2-1.2 3.2-1.2Z" /><path d="M7.5 8.5c.5 0 .9.2 1.2.5L7.5 10.3 6.3 9c.3-.3.7-.5 1.2-.5Z" /></svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="21" height="11" rx="3.3" stroke="currentColor" strokeOpacity=".35" /><rect x="2" y="2" width="16.5" height="8" rx="2" fill="currentColor" /><path d="M23 4.2v3.6c.8-.3 1.3-1 1.3-1.8S23.8 4.5 23 4.2Z" fill="currentColor" fillOpacity=".4" /></svg>
      </span>
    </div>
  );
}

const sideButton = "absolute w-[4px] bg-gradient-to-b from-slate-400 via-slate-600 to-slate-500";

type Tab = { Icon: typeof Home; label: string; badge?: number };

/** A real phone: titanium edge, side buttons, island, status bar, the app's bottom bar and the home indicator. */
function PhoneFrame({ label, tabs, children }: { label: string; tabs: [Tab, Tab, Tab, Tab]; children: ReactNode }) {
  const tab = (t: Tab, active: boolean) => (
    <span className={`relative grid justify-items-center gap-0.5 pt-1 text-[10px] font-semibold ${active ? "text-blue-600" : "text-slate-500"}`}>
      <t.Icon className="h-[19px] w-[19px]" strokeWidth={1.8} />
      {t.badge ? <span className="absolute left-1/2 top-0 ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white ring-2 ring-white">{t.badge}</span> : null}
      {t.label}
    </span>
  );
  return (
    <div className="relative mx-auto w-[292px] sm:w-[312px]" role="img" aria-label={label}>
      <span aria-hidden className={`${sideButton} -left-[3px] top-[112px] h-7 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -left-[3px] top-[158px] h-12 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -left-[3px] top-[218px] h-12 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -right-[3px] top-[178px] h-[76px] rounded-r-md`} />
      <div className="rounded-[3.3rem] bg-gradient-to-br from-slate-300 via-slate-600 to-slate-400 p-[2px] shadow-[0_45px_90px_-30px_rgba(15,23,42,0.65)]">
        <div className="rounded-[3.2rem] bg-[#0b0d12] p-[11px]">
          <div aria-hidden className="relative h-[612px] overflow-hidden rounded-[2.6rem] bg-white sm:h-[650px]">
            <div className="absolute left-1/2 top-[11px] z-20 h-[28px] w-[98px] -translate-x-1/2 rounded-full bg-black" />
            <StatusBar />
            {children}
            <div className="absolute inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-5">
              <div className="grid grid-cols-5 items-start">
                {tab(tabs[0], true)}
                {tab(tabs[1], false)}
                <span className="grid justify-items-center"><span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-white shadow-[0_10px_22px_-8px_rgba(37,99,235,0.8)]"><Plus className="h-6 w-6" /></span></span>
                {tab(tabs[2], false)}
                {tab(tabs[3], false)}
              </div>
            </div>
            <div className="absolute bottom-1.5 left-1/2 z-20 h-[5px] w-[122px] -translate-x-1/2 rounded-full bg-black/85" />
          </div>
        </div>
      </div>
    </div>
  );
}

const box = "rounded-2xl border border-slate-200 bg-white";

/** "For you": the personal Home screen of the app on a phone. */
export function PhonePreview() {
  const { phone: ph, personalApp: a } = usePreviewCopy();
  return (
    <PhoneFrame label={ph.aria} tabs={[{ Icon: Home, label: a.tabs[0] }, { Icon: List, label: a.tabs[1] }, { Icon: Target, label: a.tabs[2] }, { Icon: MoreHorizontal, label: a.tabs[3] }]}>
      <div className="space-y-3 px-4 pt-1">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-600">AR</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[16px] font-bold tracking-tight text-slate-900">{a.hello}</p>
            <p className="text-[10.5px] text-slate-500">{a.date}</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-800"><Search className="h-4 w-4" /></span>
          <span className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-800">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">2</span>
          </span>
        </div>

        <div className={`${box} p-3.5`}>
          <p className="text-[10.5px] text-slate-500">{a.leftTitle}</p>
          <p className="text-[28px] font-extrabold leading-tight tracking-tight tabular-nums text-slate-900">$245.00</p>
          <p className="text-[10.5px] leading-snug text-slate-500">{a.leftNote}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[89.7%] rounded-full bg-emerald-600" /></div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">{a.spent}</p>
        </div>

        <div className="-mx-4 flex gap-2 overflow-hidden px-4">
          {a.cards.map(([k, v, s, tone]) => (
            <div key={k} className={`${box} w-[64%] shrink-0 px-3 py-2.5`}>
              <p className="text-[10.5px] text-slate-500">{k}</p>
              <p className="text-[17px] font-extrabold tracking-tight tabular-nums text-slate-900">{v}</p>
              <p className={`text-[10px] ${tone === "bad" ? "text-red-600" : "text-slate-500"}`}>{s}</p>
            </div>
          ))}
        </div>

        <div className={`${box} p-3`}>
          <p className="text-[13px] font-bold text-slate-900">{a.today}</p>
          <div className="mt-2 space-y-1.5">
            {a.todo.map((t, i) => (
              <div key={t.t} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-slate-100/80 px-2.5 py-2">
                {i === 0 ? <CreditCard className="h-4 w-4 text-amber-600" /> : <Inbox className="h-4 w-4 text-blue-600" />}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold leading-snug text-slate-900">{t.t}</p>
                  <p className="text-[9.5px] leading-snug text-slate-500">{t.m}</p>
                </div>
                <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800">{t.b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** "For business": the business Home screen of the app on a phone. */
export function BusinessPhonePreview() {
  const { businessApp: b } = usePreviewCopy();
  const actionIcons = [ShoppingCart, FileText, Wallet, Camera];
  return (
    <PhoneFrame label={b.aria} tabs={[{ Icon: Home, label: b.tabs[0] }, { Icon: Inbox, label: b.tabs[1], badge: 9 }, { Icon: FileText, label: b.tabs[2] }, { Icon: MoreHorizontal, label: b.tabs[3] }]}>
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 pb-2.5">
        <span className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[10.5px] text-slate-400">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" /><span className="truncate">{b.search}</span>
        </span>
        <span className="relative grid h-8 w-8 place-items-center text-slate-800">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">2</span>
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-[10.5px] font-bold text-blue-600">ML</span>
      </div>
      <div className="space-y-2.5 px-3 pt-3">
        <div>
          <p className="text-[17px] font-bold tracking-tight text-slate-900">{b.hello}</p>
          <p className="text-[11px] text-slate-500">{b.date}</p>
        </div>
        <div className="flex gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] leading-snug text-slate-800">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>{b.banner[0]}<b>{b.banner[1]}</b>{b.banner[2]}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {b.cards.map(([k, v, s, tone]) => (
            <div key={k} className={`${box} px-3 py-2.5`}>
              <p className="text-[10.5px] leading-snug text-slate-500">{k}</p>
              <p className="text-[17px] font-extrabold tracking-tight tabular-nums text-slate-900">{v}</p>
              <p className={`text-[10px] leading-snug ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-slate-500"}`}>{s}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {b.actions.map((t, i) => {
            const Icon = actionIcons[i];
            return (
              <div key={t} className={`${box} grid justify-items-center gap-1 px-1 py-2 text-center`}>
                <Icon className="h-4 w-4 text-blue-600" />
                <span className="text-[9.5px] font-semibold leading-tight text-slate-800">{t}</span>
              </div>
            );
          })}
        </div>
        <div className={`${box} p-3`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-slate-900">{b.today}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">{b.urgent}</span>
          </div>
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-xl bg-slate-100/80 px-2.5 py-2">
            <Inbox className="mt-0.5 h-4 w-4 text-blue-600" />
            <div>
              <p className="text-[11px] font-semibold text-slate-900">{b.todo.t}</p>
              <p className="text-[9.5px] text-slate-500">{b.todo.m}</p>
              <span className="mt-1.5 inline-block rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800">{b.todo.b}</span>
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ── How it works: one small moving picture per step ──
// Each picture plays only while it is on screen, and stays still (showing the
// finished state) for people who turn motion off.
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    const onChange = () => setReduced(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}

/** Counts 0, 1, 2… every `ms` while `active`. */
function useTick(ms: number, active: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, active]);
  return tick;
}

/** A number that glides to its new value instead of jumping. */
function CountUp({ value, format, still }: { value: number; format: (n: number) => string; still: boolean }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (still) return;
    const from = current.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 750);
      const eased = 1 - Math.pow(1 - p, 3);
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, still]);
  return <>{format(still ? value : shown)}</>;
}

function StepFrame({ label, children, decor, frameRef }: { label: string; children: ReactNode; decor?: ReactNode; frameRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={frameRef} role="img" aria-label={label} className="relative mx-auto flex h-80 w-full max-w-sm items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/70 p-5">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.08),transparent_60%)]" />
      {decor}
      <div aria-hidden className="relative w-full max-w-[260px]">{children}</div>
    </div>
  );
}

const cardCls = "rounded-2xl bg-white p-4 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70";

function Caret() {
  return <span className="ml-px inline-block h-3 w-px translate-y-0.5 bg-slate-900 motion-safe:animate-pulse" />;
}

// Step 1: picks Personal, types the name and the email, then presses the button.
const SIGNUP_NAME = "Ana Rivera";
const SIGNUP_EMAIL = "ana@correo.com";
const SIGNUP_LOOP = 80; // ticks of 90 ms

export function SignupStepPreview() {
  const v = useCopy(marketingCopy).how.visuals;
  const s = v.signup;
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTick(90, inView && !still);
  const t = still ? SIGNUP_LOOP - 1 : tick % SIGNUP_LOOP;
  const personal = t >= 6;
  const nameLen = Math.max(0, Math.min(SIGNUP_NAME.length, t - 10));
  const emailLen = Math.max(0, Math.min(SIGNUP_EMAIL.length, t - 25));
  const typingName = !still && t >= 10 && t < 25;
  const typingEmail = !still && t >= 25 && t < 44;
  const pressed = !still && t >= 44 && t < 48;
  const done = !still && t >= 48;
  const fields: [string, string, boolean][] = [
    [s.name, SIGNUP_NAME.slice(0, nameLen), typingName],
    [s.email, SIGNUP_EMAIL.slice(0, emailLen), typingEmail],
  ];
  return (
    <StepFrame label={v.aria[0]} frameRef={ref}>
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="text-[13px] font-semibold text-slate-900">{s.title}</span>
        </div>
        <div className="relative mt-3 grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 text-[10.5px] font-semibold">
          <span className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-white shadow-sm transition-transform duration-300 ease-out ${personal ? "translate-x-full" : ""}`} />
          <span className={`relative rounded-md py-1.5 text-center transition-colors duration-300 ${personal ? "text-slate-500" : "text-slate-900"}`}>{s.modes[0]}</span>
          <span className={`relative rounded-md py-1.5 text-center transition-colors duration-300 ${personal ? "text-slate-900" : "text-slate-500"}`}>{s.modes[1]}</span>
        </div>
        {fields.map(([label, value, typing]) => (
          <div key={label} className="mt-2.5">
            <p className="text-[9.5px] font-medium text-slate-500">{label}</p>
            <p className={`mt-0.5 h-[30px] rounded-lg border px-2.5 py-1.5 text-[11px] text-slate-700 transition-colors duration-200 ${typing ? "border-blue-500 ring-2 ring-blue-500/15" : "border-slate-200"}`}>
              {value}{typing && <Caret />}
            </p>
          </div>
        ))}
        <p className={`mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2 text-center text-[11.5px] font-semibold text-white transition-all duration-200 ${pressed ? "scale-[0.97] bg-blue-700" : done ? "bg-emerald-600" : "bg-blue-600"}`}>
          <span key={done ? "done" : "cta"} className="inline-flex items-center gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
            {done ? <><CheckCircle2 className="h-3.5 w-3.5" />{s.done}</> : s.cta(TRIAL_DAYS_PREVIEW)}
          </span>
        </p>
        <p className="mt-1.5 flex items-center justify-center gap-1 text-[9.5px] text-slate-500"><CheckCircle2 className="h-3 w-3 text-emerald-500" />{s.noCard}</p>
      </div>
    </StepFrame>
  );
}

// Step 2: the selection moves through the three banks.
// Bank icons for the "pick your bank" list (the same ones Plaid shows in its bank picker).
const STEP_BANKS = [
  { name: "Chase", src: "/brands/banks/chase.png", pad: "p-[3px]" },
  { name: "Bank of America", src: "/brands/banks/bank-of-america.png", pad: "p-[2px]" },
  { name: "Wells Fargo", src: "/brands/banks/wells-fargo.png", pad: "" },
];

export function ConnectStepPreview() {
  const v = useCopy(marketingCopy).how.visuals;
  const c = v.connect;
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTick(1500, inView && !still);
  const active = still ? 0 : tick % STEP_BANKS.length;
  return (
    <StepFrame label={v.aria[1]} frameRef={ref}>
      <div className={cardCls}>
        <div className="flex items-center justify-center gap-3">
          <Logo className="h-7 w-7" />
          <span className="flex items-center gap-0.5 text-slate-300"><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /></span>
          <img src="/brands/plaid.svg" alt="" width={63} height={24} className="h-6 w-auto" />
        </div>
        <p className="mt-2.5 text-center text-[11.5px] font-semibold leading-snug text-slate-900">{c.title}</p>
        <p className="mt-2.5 text-[9.5px] font-medium text-slate-500">{c.pick}</p>
        <ul className="mt-1 space-y-1">
          {STEP_BANKS.map((b, i) => {
            const on = i === active;
            return (
              <li key={b.name} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] transition-all duration-500 ease-out ${on ? "scale-[1.02] border-blue-500 bg-blue-50/70 text-slate-900 shadow-sm" : "border-slate-200 text-slate-600"}`}>
                <img src={b.src} alt="" width={22} height={22} loading="lazy" className={`h-[22px] w-[22px] shrink-0 rounded-md bg-white object-contain ring-1 ring-slate-200 ${b.pad}`} />
                {b.name}
                <span className="relative ml-auto grid h-3.5 w-3.5 place-items-center">
                  <ChevronRight className={`absolute h-3 w-3 text-slate-400 transition-opacity duration-500 ${on ? "opacity-0" : "opacity-100"}`} />
                  <CheckCircle2 className={`absolute h-3.5 w-3.5 text-blue-600 transition-all duration-500 ${on ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2.5 flex items-center justify-center gap-1 text-center text-[9px] leading-snug text-emerald-700"><Lock className="h-3 w-3 shrink-0" />{c.safe}</p>
      </div>
    </StepFrame>
  );
}

// Step 3: a soft radar behind the card, and the numbers and bars glide to new values.
const RADAR_BLIPS = [
  { top: "22%", left: "18%", delay: "0s" },
  { top: "70%", left: "80%", delay: "1.3s" },
  { top: "16%", left: "76%", delay: "2.6s" },
  { top: "78%", left: "24%", delay: "3.9s" },
];
function Radar() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2">
      {["inset-0", "inset-[70px]", "inset-[140px]"].map((i) => (
        <span key={i} className={`absolute ${i} rounded-full border border-emerald-500/20`} />
      ))}
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-500/10" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-emerald-500/10" />
      <span
        className="absolute inset-0 rounded-full motion-safe:animate-[spin_5s_linear_infinite]"
        style={{ background: "conic-gradient(from 0deg, rgba(16,185,129,0.28), rgba(16,185,129,0.08) 50deg, transparent 90deg, transparent 360deg)" }}
      />
      {RADAR_BLIPS.map((b) => (
        <span key={b.top + b.left} className="absolute h-2 w-2" style={{ top: b.top, left: b.left }}>
          <span className="absolute inset-0 rounded-full bg-emerald-400 motion-safe:animate-ping" style={{ animationDuration: "2.6s", animationDelay: b.delay }} />
          <span className="absolute inset-0 rounded-full bg-emerald-500/80" />
        </span>
      ))}
    </div>
  );
}

// Step 3, as in the Ai Aethel 2.0 "To review" inbox: each transaction arrives already
// sorted or matched, you confirm it, and the month's report (In / Out / You kept) updates.
const REVIEW_BASE = { inn: 23730, out: 8902.48 };
const REVIEW_DELTAS = [{ inn: 850, out: 0 }, { inn: 0, out: 184.32 }, { inn: 0, out: 48.2 }];
const dollars = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function NumbersStepPreview() {
  const v = useCopy(marketingCopy).how.visuals;
  const r = v.review;
  const still = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const tick = useTick(950, inView && !still);
  const t = still ? 8 : tick % 9;
  const item = Math.floor(t / 3);
  const phase = t % 3; // 0 waiting, 1 pressing, 2 done
  const doneCount = item + (phase === 2 ? 1 : 0);
  const inn = REVIEW_BASE.inn + REVIEW_DELTAS.slice(0, doneCount).reduce((a, d) => a + d.inn, 0);
  const out = REVIEW_BASE.out + REVIEW_DELTAS.slice(0, doneCount).reduce((a, d) => a + d.out, 0);
  const row = r.rows[item];
  const reviewed = 3 + doneCount;
  return (
    <StepFrame label={v.aria[2]} decor={<Radar />} frameRef={ref}>
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900"><Inbox className="h-4 w-4 text-blue-600" />{r.title}</span>
          <span className="text-[9.5px] font-semibold tabular-nums text-slate-500">{r.progress(reviewed)}</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out" style={{ width: `${(reviewed / 9) * 100}%` }} />
        </div>

        <div
          key={item}
          className={`mt-2.5 rounded-xl border p-2.5 transition-colors duration-500 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-500 ${phase === 2 ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-semibold text-slate-900">{row.who}</span>
            <span className={`shrink-0 text-[11px] font-bold tabular-nums ${row.income ? "text-emerald-600" : "text-slate-900"}`}>{row.amt}</span>
          </div>
          <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${row.link ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}>
            {row.link ? <Link2 className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
            {!row.link && <span className="font-medium text-slate-500">{r.suggested}:</span>}
            {row.chip}
          </span>
          <div className="mt-2 flex h-7 items-center gap-1.5">
            {phase === 2 ? (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300">
                <CheckCircle2 className="h-3.5 w-3.5" />{row.done}
              </span>
            ) : (
              <>
                <span className={`inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-semibold text-white transition-all duration-200 ${phase === 1 ? "scale-95 bg-blue-700" : "bg-blue-600"}`}>
                  {row.link ? <Link2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}{row.action}
                </span>
                <span className="inline-flex h-7 items-center rounded-lg border border-slate-200 px-2.5 text-[10.5px] font-semibold text-slate-700">{r.other}</span>
              </>
            )}
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {[
            { k: r.report[0], val: inn, cls: "text-slate-900" },
            { k: r.report[1], val: out, cls: "text-slate-900" },
            { k: r.report[2], val: inn - out, cls: "text-emerald-600" },
          ].map((x) => (
            <div key={x.k} className="rounded-lg border border-slate-200 px-2 py-1.5">
              <p className="text-[9px] text-slate-500">{x.k}</p>
              <p className={`text-[12.5px] font-extrabold tabular-nums tracking-tight ${x.cls}`}><CountUp value={x.val} format={dollars} still={still} /></p>
            </div>
          ))}
        </div>
      </div>
    </StepFrame>
  );
}

// ── Auth screens: compact KPI card ──
export function MiniInsightCard() {
  const { mini } = usePreviewCopy();
  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{mini.title}</p>
        <SampleBadge dark />
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">$15,445.00</p>
      <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-400"><ArrowUpRight className="h-3.5 w-3.5" /> {mini.delta}</p>
      <div className="mt-4 flex h-14 items-end gap-1.5">
        {[38, 46, 41, 55, 63, 74, 70, 82, 88, 96].map((h, i) => (
          <span key={i} className="flex-1 rounded-t bg-gradient-to-t from-blue-600/40 to-blue-400" style={{ height: `${h}%` }} />
        ))}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400"><Sparkles className="h-3.5 w-3.5 text-blue-400" /> {mini.note}</p>
    </div>
  );
}
