// Illustrative product previews built in code (no external images).
// All numbers are sample data and are labeled as such.
import {
  ArrowDownRight, ArrowUpRight, CheckCircle2, FileText, LayoutDashboard, Landmark,
  Receipt, BarChart3, Users, ShoppingCart, Sparkles,
  Menu, Star, CircleDollarSign, TrendingUp, TrendingDown, Wallet, Zap, Gift, Lock, ChevronRight, RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { TRIAL_DAYS as TRIAL_DAYS_PREVIEW } from "@/components/marketing/content";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy } from "@/i18n/copy/marketing";
import { personalCopy } from "@/i18n/copy/personal";
import { appCopy } from "@/i18n/copy/app";

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

// ── "For you": a real phone showing the app exactly as it looks on phones ──
// Same header, trial banner, balance card, KPI grid and transaction rows as the
// real mobile app (AppLayout + PersonalDashboard), with sample data.
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

export function PhonePreview() {
  const { phone: ph } = usePreviewCopy();
  const { dashboard: d, common: cm } = useCopy(personalCopy);
  const app = useCopy(appCopy);
  const kpis = [
    { Icon: TrendingUp, box: "border-emerald-200", chip: "bg-emerald-100 text-emerald-600", val: "text-emerald-700", label: cm.income, value: "+$3,250.00", sub: cm.txCount(4) },
    { Icon: TrendingDown, box: "border-rose-200", chip: "bg-rose-100 text-rose-600", val: "text-rose-700", label: cm.expenses, value: "-$1,948.62", sub: cm.txCount(38) },
    { Icon: Wallet, box: "border-sky-200", chip: "bg-sky-100 text-sky-600", val: "text-sky-700", label: d.totalBalance, value: "$4,820.15", sub: d.accountsCount(2) },
    { Icon: Zap, box: "border-violet-200", chip: "bg-violet-100 text-violet-600", val: "text-violet-700", label: cm.transactions, value: "42", sub: cm.thisMonth },
  ];
  return (
    <div className="relative mx-auto w-[292px] sm:w-[312px]" role="img" aria-label={ph.aria}>
      {/* Side buttons: action, volume up, volume down, power */}
      <span aria-hidden className={`${sideButton} -left-[3px] top-[112px] h-7 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -left-[3px] top-[158px] h-12 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -left-[3px] top-[218px] h-12 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -right-[3px] top-[178px] h-[76px] rounded-r-md`} />
      {/* Titanium edge, black bezel, screen */}
      <div className="rounded-[3.3rem] bg-gradient-to-br from-slate-300 via-slate-600 to-slate-400 p-[2px] shadow-[0_45px_90px_-30px_rgba(15,23,42,0.65)]">
        <div className="rounded-[3.2rem] bg-[#0b0d12] p-[11px]">
          <div aria-hidden className="relative h-[612px] overflow-hidden rounded-[2.6rem] bg-white sm:h-[650px]">
            <div className="absolute left-1/2 top-[11px] z-20 h-[28px] w-[98px] -translate-x-1/2 rounded-full bg-black" />
            <StatusBar />

            {/* App header (same as the real mobile header) */}
            <div className="flex h-12 items-center gap-3 border-b border-neutral-200 bg-white px-4">
              <Menu className="h-5 w-5 text-neutral-400" />
              <Logo className="h-6 w-6 shrink-0" />
              <div className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-black">{ph.user}</span>
                <span className="block whitespace-nowrap text-[9px] text-neutral-400">Ai Aethel Accountant</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 border-b border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center text-[9.5px] leading-snug text-emerald-900">
              <Gift className="h-3 w-3 shrink-0 text-emerald-600" />{app.trial.banner(6)}
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-semibold text-black">{d.title}</p>
                  <p className="text-[10px] text-neutral-500">{cm.months[10]} 2026</p>
                </div>
                <SampleBadge />
              </div>

              <div className="rounded-xl border-2 border-emerald-400 bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5 text-neutral-400" />
                      <span className="text-[10px] text-neutral-500">Chase</span>
                      <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8.5px] text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{d.live}
                      </span>
                    </div>
                    <p className="text-xl font-bold tabular-nums text-emerald-600">$4,820.15</p>
                    <p className="text-[9.5px] text-neutral-400">{d.available}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                    <CircleDollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {kpis.map(({ Icon, ...k }) => (
                  <div key={k.label} className={`rounded-xl border bg-white p-2.5 ${k.box}`}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${k.chip}`}><Icon className="h-3 w-3" /></span>
                      <span className="truncate text-[9.5px] text-neutral-500">{k.label}</span>
                    </div>
                    <p className={`text-[13px] font-semibold tabular-nums ${k.val}`}>{k.value}</p>
                    <p className="text-[8.5px] text-neutral-400">{k.sub}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white px-3 pt-2.5">
                <p className="text-[11px] font-medium text-black">{d.monthTransactions} <span className="font-normal text-neutral-400">(42)</span></p>
                {ph.tx.map((t) => (
                  <div key={t.name} className="flex items-center justify-between border-b border-neutral-100 py-2.5 last:border-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.income ? "bg-emerald-100" : "bg-rose-100"}`}>
                        {t.income ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" /> : <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-medium text-black">{t.name}</p>
                        <p className="text-[9.5px] text-neutral-500">{t.cat} · {t.date}</p>
                      </div>
                    </div>
                    <span className={`ml-2 shrink-0 text-[11.5px] font-semibold tabular-nums ${t.income ? "text-emerald-700" : "text-rose-700"}`}>{t.income ? "+" : "-"}{money(t.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white via-white/85 to-transparent" />
            <div className="absolute bottom-2 left-1/2 h-[5px] w-[122px] -translate-x-1/2 rounded-full bg-black/85" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── How it works: one small picture per step ──
function StepFrame({ label, children, decor }: { label: string; children: ReactNode; decor?: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="relative mx-auto flex h-80 w-full max-w-sm items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/70 p-5">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.08),transparent_60%)]" />
      {decor}
      <div aria-hidden className="relative w-full max-w-[260px]">{children}</div>
    </div>
  );
}

const cardCls = "rounded-2xl bg-white p-4 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/70";

export function SignupStepPreview() {
  const v = useCopy(marketingCopy).how.visuals;
  const s = v.signup;
  return (
    <StepFrame label={v.aria[0]}>
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="text-[13px] font-semibold text-slate-900">{s.title}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 text-[10.5px] font-semibold">
          <span className="rounded-md py-1.5 text-center text-slate-500">{s.modes[0]}</span>
          <span className="rounded-md bg-white py-1.5 text-center text-slate-900 shadow-sm">{s.modes[1]}</span>
        </div>
        {[[s.name, "Ana Rivera"], [s.email, "ana@correo.com"]].map(([label, value]) => (
          <div key={label} className="mt-2.5">
            <p className="text-[9.5px] font-medium text-slate-500">{label}</p>
            <p className="mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700">{value}</p>
          </div>
        ))}
        <p className="mt-3 rounded-lg bg-blue-600 py-2 text-center text-[11.5px] font-semibold text-white">{s.cta(TRIAL_DAYS_PREVIEW)}</p>
        <p className="mt-1.5 flex items-center justify-center gap-1 text-[9.5px] text-slate-500"><CheckCircle2 className="h-3 w-3 text-emerald-500" />{s.noCard}</p>
      </div>
    </StepFrame>
  );
}

// Bank icons for the "pick your bank" list (the same ones Plaid shows in its bank picker).
const STEP_BANKS = [
  { name: "Chase", src: "/brands/banks/chase.png", pad: "p-[3px]" },
  { name: "Bank of America", src: "/brands/banks/bank-of-america.png", pad: "p-[2px]" },
  { name: "Wells Fargo", src: "/brands/banks/wells-fargo.png", pad: "" },
];

export function ConnectStepPreview() {
  const v = useCopy(marketingCopy).how.visuals;
  const c = v.connect;
  return (
    <StepFrame label={v.aria[1]}>
      <div className={cardCls}>
        <div className="flex items-center justify-center gap-3">
          <Logo className="h-7 w-7" />
          <span className="flex items-center gap-0.5 text-slate-300"><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /></span>
          <img src="/brands/plaid.svg" alt="" width={63} height={24} className="h-6 w-auto" />
        </div>
        <p className="mt-2.5 text-center text-[11.5px] font-semibold leading-snug text-slate-900">{c.title}</p>
        <p className="mt-2.5 text-[9.5px] font-medium text-slate-500">{c.pick}</p>
        <ul className="mt-1 space-y-1">
          {STEP_BANKS.map((b, i) => (
            <li key={b.name} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${i === 0 ? "border-blue-500 bg-blue-50/60 text-slate-900" : "border-slate-200 text-slate-600"}`}>
              <img src={b.src} alt="" width={22} height={22} loading="lazy" className={`h-[22px] w-[22px] shrink-0 rounded-md bg-white object-contain ring-1 ring-slate-200 ${b.pad}`} />
              {b.name}
              <ChevronRight className="ml-auto h-3 w-3 text-slate-400" />
            </li>
          ))}
        </ul>
        <p className="mt-2.5 flex items-center justify-center gap-1 text-center text-[9px] leading-snug text-emerald-700"><Lock className="h-3 w-3 shrink-0" />{c.safe}</p>
      </div>
    </StepFrame>
  );
}

// A soft radar behind the numbers: the beam sweeps slowly and a few points light up,
// as if the app were finding and sorting your transactions. Still for reduced motion.
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

export function NumbersStepPreview() {
  const v = useCopy(marketingCopy).how.visuals;
  const n = v.numbers;
  const bars = [{ inc: 70, exp: 44 }, { inc: 76, exp: 52 }, { inc: 72, exp: 41 }, { inc: 86, exp: 47 }];
  return (
    <StepFrame label={v.aria[2]} decor={<Radar />}>
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-900">{n.month}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700"><RefreshCw className="h-2.5 w-2.5 motion-safe:animate-[spin_5s_linear_infinite]" />{n.auto}</span>
        </div>
        <ul className="mt-2 divide-y divide-slate-100">
          {n.rows.map((r) => (
            <li key={r.name} className="flex items-center gap-2 py-1.5">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${r.income ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
                {r.income ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-700">{r.name}</span>
              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[8.5px] font-medium text-blue-700">{r.cat}</span>
              <span className={`w-14 text-right text-[10.5px] font-semibold tabular-nums ${r.income ? "text-emerald-700" : "text-slate-800"}`}>{r.income ? "+" : "-"}{money(r.amount).replace(".00", "")}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[9.5px] font-medium text-slate-500">{n.chart}</p>
        <div className="mt-1.5 flex h-14 items-end justify-between gap-2">
          {bars.map((b, i) => (
            <div key={n.months[i]} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-11 w-full items-end justify-center gap-0.5">
                <span className="w-2 rounded-t bg-emerald-500" style={{ height: `${b.inc}%` }} />
                <span className="w-2 rounded-t bg-slate-300" style={{ height: `${b.exp}%` }} />
              </div>
              <span className="text-[8.5px] text-slate-400">{n.months[i]}</span>
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
