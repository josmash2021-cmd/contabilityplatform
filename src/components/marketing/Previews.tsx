// Illustrative product previews built in code (no external images).
// All numbers are sample data and are labeled as such.
import {
  ArrowDownRight, ArrowUpRight, CheckCircle2, FileText, LayoutDashboard, Landmark,
  Receipt, BarChart3, Users, ShoppingCart, Sparkles, Target, Tv,
} from "lucide-react";
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

// ── Personal tab: phone ──
export function PhonePreview() {
  const { phone: ph } = usePreviewCopy();
  const cats = [
    { pct: 34, cls: "bg-slate-900" },
    { pct: 27, cls: "bg-blue-500" },
    { pct: 18, cls: "bg-blue-300" },
    { pct: 21, cls: "bg-slate-300" },
  ];
  const subs = ["$15.49", "$29.99", "$11.99"];
  return (
    <div className="mx-auto w-[280px] rounded-[2.6rem] bg-slate-900 p-2.5 shadow-[0_30px_70px_-20px_rgba(15,23,42,0.55)] sm:w-[300px]">
      <div className="overflow-hidden rounded-[2.1rem] bg-white">
        <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-slate-900" />
        <div className="space-y-4 px-5 pb-6 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{ph.hello}</p>
            <SampleBadge />
          </div>
          <div>
            <p className="text-[11px] text-slate-500">{ph.balance}</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-900">$4,820.15</p>
          </div>

          <div className="rounded-2xl border border-slate-100 p-3">
            <p className="text-[11px] font-medium text-slate-600">{ph.spending}</p>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
              {cats.map((c, i) => <span key={ph.cats[i]} className={c.cls} style={{ width: `${c.pct}%` }} />)}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
              {cats.map((c, i) => (
                <span key={ph.cats[i]} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className={`h-2 w-2 rounded-sm ${c.cls}`} />{ph.cats[i]} {c.pct}%
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600"><Tv className="h-3.5 w-3.5" /> {ph.subs}</p>
            {subs.map((v, i) => (
              <div key={ph.subNames[i]} className="mt-2 flex justify-between text-xs text-slate-700"><span>{ph.subNames[i]}</span><span className="tabular-nums">{v}{ph.perMonth}</span></div>
            ))}
          </div>

          <div className="rounded-2xl bg-blue-50 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-blue-900"><Target className="h-3.5 w-3.5" /> {ph.goal}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full w-[68%] rounded-full bg-blue-600" /></div>
            <p className="mt-1.5 text-[10px] text-blue-800">{ph.goalProgress}</p>
          </div>
        </div>
      </div>
    </div>
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
