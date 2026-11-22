// The home page's dashboard (hero, and /producto): a pointer goes through the app's sections and does one task
// in each (a sale, a reminder, a receipt, the bank, the report), over and over while it's on screen.
// The side menu works: tapping a section jumps there and the tour goes on from it. With motion turned off
// there's no pointer and each section shows its task already done. Sample data.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDownRight, ArrowUpRight, BarChart3, Bell, Camera, Check, CheckCircle2, FileText, Landmark, LayoutDashboard,
  Plus, Receipt, Send, ShoppingCart, Sparkles, Users, type LucideIcon,
} from "lucide-react";
import { FileLogo } from "@/components/FileLogo";
import { useInView, useReducedMotion } from "@/hooks/useInView";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy, type MarketingCopy } from "@/i18n/copy/marketing";

type P = MarketingCopy["previews"];
type View = "home" | "sales" | "clients" | "expenses" | "bank" | "reports";
type Toast = keyof P["tour"]["toasts"];
/** One beat of the tour: how long it lasts, where the pointer goes, whether it clicks, and a notice it fires. */
type Beat = { ms: number; at?: string; click?: boolean; toast?: Toast };

const VIEWS: View[] = ["home", "sales", "clients", "expenses", "bank", "reports"];
const NAV_ICONS: LucideIcon[] = [LayoutDashboard, ShoppingCart, Users, Receipt, Landmark, BarChart3];

// Each section's beats; its screen changes with the beat number (`step`). The last beats go to the next section.
const BEATS: Record<View, Beat[]> = {
  home: [{ ms: 2200 }, { ms: 900, at: "nav-sales" }, { ms: 450, click: true }],
  sales: [
    { ms: 900, at: "new-sale" }, { ms: 450, click: true }, // the list; "New sale"
    { ms: 700, at: "f-client" }, // the form opens
    { ms: 1300, at: "f-amount" }, // customer and service typed
    { ms: 1000, at: "save-sale" }, // amount typed
    { ms: 450, click: true },
    { ms: 2000, toast: "sale" }, // saved, invoice sent: on top of the list
    { ms: 900, at: "nav-clients" }, { ms: 450, click: true },
  ],
  clients: [
    { ms: 1100, at: "remind" }, { ms: 450, click: true },
    { ms: 2000, toast: "remind" },
    { ms: 900, at: "nav-expenses" }, { ms: 450, click: true },
  ],
  expenses: [
    { ms: 900, at: "upload" }, { ms: 450, click: true },
    { ms: 1500 }, // reading the receipt
    { ms: 1300, at: "save-exp" }, // store, total and category filled in
    { ms: 450, click: true },
    { ms: 1800, toast: "receipt" },
    { ms: 900, at: "nav-bank" }, { ms: 450, click: true },
  ],
  bank: [
    { ms: 1200 }, // the categories are being put
    { ms: 1100, at: "approve-all" },
    { ms: 450, click: true },
    { ms: 2000, toast: "bank" },
    { ms: 900, at: "nav-reports" }, { ms: 450, click: true },
  ],
  reports: [
    { ms: 1500, at: "download" }, { ms: 450, click: true },
    { ms: 1000 }, // downloading
    { ms: 2200, toast: "report" },
    { ms: 900, at: "nav-home" }, { ms: 450, click: true },
  ],
};
const FRAMES = VIEWS.flatMap((view) => BEATS[view].map((b, step) => ({ view, step, ...b })));
const START = Object.fromEntries(VIEWS.map((v) => [v, FRAMES.findIndex((f) => f.view === v)])) as Record<View, number>;

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const btn = "inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-[background-color,transform] duration-200";
const press = (on: boolean) => (on ? "scale-95" : "");

type VP = { p: P; step: number };

function Head({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{kicker}</p>
        <p className="text-balance text-sm font-semibold text-slate-900">{title.replace(/ · /g, "\u00a0· ")}</p>
      </div>
      {right}
    </div>
  );
}

function Brand({ slug }: { slug: string }) {
  return <img src={`/brands/merchants/${slug}.png`} alt="" className="h-7 w-7 shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-slate-200" />;
}

function Cat({ children, ai = false }: { children: ReactNode; ai?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[10px] ${ai ? "bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200" : "bg-slate-100 text-slate-500"}`}>
      {ai && <Sparkles className="h-2.5 w-2.5" />}{children}
    </span>
  );
}

// ── Resumen ──
const chart = [
  { inc: 58, exp: 30 }, { inc: 64, exp: 34 }, { inc: 61, exp: 29 },
  { inc: 72, exp: 33 }, { inc: 79, exp: 36 }, { inc: 90, exp: 34 },
];

function HomeView({ p }: VP) {
  const recent = [
    { name: p.recent[0], tag: p.tags.sale, amount: 1250 },
    { name: p.recent[1], tag: p.tags.materials, amount: -184.32 },
    { name: p.recent[2], tag: p.tags.sale, amount: 320 },
  ];
  const kpis = [
    { label: p.income, value: "$24,580", delta: "+12.4%", up: true },
    { label: p.expenses, value: "$9,135", delta: "-3.1%", up: false },
    { label: p.profit, value: "$15,445", delta: `62.8% ${p.margin}`, up: true },
  ];
  return (
    <>
      <Head kicker={p.summary} title={p.period} right={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{p.sample}</span>} />
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-100 p-2.5 sm:p-3">
            <p className="text-[10px] text-slate-500 sm:text-[11px]">{k.label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{k.value}</p>
            <p className={`mt-0.5 hidden items-center gap-0.5 text-[10px] font-medium sm:flex ${k.up ? "text-emerald-600" : "text-slate-500"}`}>
              {k.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{k.delta}
            </p>
          </div>
        ))}
      </div>
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
              {/* Fixed pixel heights: % heights collapse inside a flex column. */}
              <div className="flex h-24 w-full items-end justify-center gap-1">
                <span className="tour-grow w-2.5 rounded-t bg-slate-900 sm:w-3" style={{ height: `${Math.round(d.inc * 0.96)}px`, animationDelay: `${i * 70}ms` }} />
                <span className="tour-grow w-2.5 rounded-t bg-blue-300 sm:w-3" style={{ height: `${Math.round(d.exp * 0.96)}px`, animationDelay: `${i * 70 + 35}ms` }} />
              </div>
              <span className="text-[9px] text-slate-400">{p.months[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="mt-4 divide-y divide-slate-100">
        {recent.map((t) => (
          <li key={t.name} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800">{t.name}</p>
              <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-500">{t.tag}</span>
            </div>
            <span className={`shrink-0 text-xs font-semibold tabular-nums ${t.amount > 0 ? "text-emerald-600" : "text-slate-700"}`}>
              {t.amount > 0 ? "+" : "-"}{money(Math.abs(t.amount))}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ── Ventas: a new sale, its invoice sent ──
function Field({ label, value, at }: { label: string; value: string; at?: string }) {
  return (
    <div className="min-w-0" data-tour={at}>
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 flex h-7 items-center overflow-hidden rounded-md bg-white px-2 text-[11px] text-slate-900 ring-1 ring-slate-200">
        {value && <span key={value} className="day-type max-w-full whitespace-nowrap">{value}</span>}
      </p>
    </div>
  );
}

function SaleRow({ client, what, amount, status, paid, fresh = false }: { client: string; what: string; amount: number; status: string; paid: boolean; fresh?: boolean }) {
  return (
    <li className={`flex items-center justify-between gap-3 py-2 ${fresh ? "day-rise -mx-2 rounded-lg bg-emerald-50/70 px-2" : ""}`}>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-800">{client}</p>
        <p className="truncate text-[10px] text-slate-500">{what}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold tabular-nums text-slate-900">{money(amount)}</p>
        <p className={`text-[10px] font-medium ${paid ? "text-emerald-600" : "text-amber-600"}`}>{status}</p>
      </div>
    </li>
  );
}

function SalesView({ p, step }: VP) {
  const t = p.tour.sales;
  const form = step >= 2 && step <= 5;
  return (
    <>
      <Head kicker={p.tour.nav[1]} title={p.period}
        right={<span data-tour="new-sale" className={`${btn} bg-slate-900 text-white ${press(step === 1)}`}><Plus className="h-3 w-3" />{t.newSale}</span>} />
      {form && (
        <div className="day-rise mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
          <p className="text-xs font-semibold text-slate-900">{t.newSale}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Field label={t.client} at="f-client" value={step >= 3 ? t.newClient : ""} />
            <Field label={t.service} value={step >= 3 ? t.newService : ""} />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label={t.amount} at="f-amount" value={step >= 4 ? money(1800) : ""} />
            <span data-tour="save-sale" className={`${btn} h-7 bg-blue-600 text-white ${press(step === 5)}`}><Send className="h-3 w-3" />{t.save}</span>
          </div>
        </div>
      )}
      <ul className="mt-4 divide-y divide-slate-100">
        {step >= 6 && <SaleRow fresh client={t.newClient} what={`${t.newService} · ${t.invoice}`} amount={1800} status={t.pending} paid={false} />}
        {t.rows.map((r) => <SaleRow key={r.client} client={r.client} what={r.what} amount={r.amount} status={r.paid ? t.paid : t.pending} paid={r.paid} />)}
      </ul>
    </>
  );
}

// ── Clientes: a reminder to who owes ──
function ClientsView({ p, step }: VP) {
  const t = p.tour.clients;
  const total = t.rows.reduce((s, r) => s + r.amount, 0);
  const late = t.rows.filter((r) => r.late).reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <Head kicker={p.tour.nav[2]} title={`${t.owed} ${money(total)}`}
        right={<span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">{t.late} {money(late)}</span>} />
      <ul className="mt-4 space-y-2">
        {t.rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
              {r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-800">{r.name}</p>
              <p className={`truncate text-[10px] ${r.late ? "font-medium text-rose-600" : "text-slate-500"}`}>{r.note}</p>
            </div>
            <div className="grid shrink-0 justify-items-end gap-1">
              <span className="text-xs font-semibold tabular-nums text-slate-900">{money(r.amount)}</span>
              {i === 0 && (step >= 2
                ? <span className="day-pop inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600"><Check className="h-3 w-3" />{t.reminded}</span>
                : <span data-tour="remind" className={`${btn} bg-blue-600 py-1 text-white ${press(step === 1)}`}><Bell className="h-3 w-3" />{t.remind}</span>)}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ── Gastos: a receipt's photo, read and saved ──
function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className="day-pop min-w-0 truncate font-semibold text-slate-900">{children}</span>
    </p>
  );
}

function ExpensesView({ p, step }: VP) {
  const t = p.tour.expenses;
  const read = step >= 3;
  const saved = step >= 5;
  return (
    <>
      <Head kicker={p.tour.nav[3]} title={p.period} />
      {step < 2 ? (
        <div data-tour="upload" className={`mt-4 grid place-items-center gap-1 rounded-xl border-2 border-dashed px-3 py-6 text-center transition-colors duration-200 ${step === 1 ? "border-blue-300 bg-blue-50/60" : "border-slate-200"}`}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-blue-600"><Camera className="h-4 w-4" /></span>
          <p className="text-xs font-semibold text-slate-800">{t.upload}</p>
          <p className="text-[10px] text-slate-500">{t.uploadHint}</p>
        </div>
      ) : (
        <div className="day-rise mt-4 flex gap-3 rounded-xl border border-slate-100 p-3">
          <span className="relative h-[104px] w-[70px] shrink-0 overflow-hidden rounded-md bg-[repeating-linear-gradient(180deg,#f8fafc_0_6px,#e2e8f0_6px_7px)] ring-1 ring-slate-200">
            <img src="/brands/merchants/home-depot.png" alt="" className="absolute left-1/2 top-2 h-5 w-5 -translate-x-1/2 rounded" />
            {!read && <span className="tour-scan absolute inset-x-0 h-7 bg-gradient-to-b from-blue-400/0 via-blue-400/45 to-blue-400/0" />}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            {!read ? (
              <>
                <p className="text-[11px] font-medium text-blue-700">{t.reading}</p>
                <span className="block h-2.5 w-4/5 animate-pulse rounded bg-slate-100" />
                <span className="block h-2.5 w-3/5 animate-pulse rounded bg-slate-100" />
                <span className="block h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
              </>
            ) : (
              <>
                <Pair label={t.merchant}>Home Depot</Pair>
                <Pair label={t.total}>{money(184.32)}</Pair>
                <Pair label={t.category}><Cat ai>{p.tags.materials}</Cat> <span className="text-[9px] font-normal text-slate-400">{t.suggested}</span></Pair>
                {saved
                  ? <p className="day-pop flex items-center gap-1 pt-0.5 text-[11px] font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{t.saved}</p>
                  : <span data-tour="save-exp" className={`${btn} w-full bg-slate-900 text-white ${press(step === 4)}`}>{t.save}</span>}
              </>
            )}
          </div>
        </div>
      )}
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t.month}</p>
      <ul className="mt-1 divide-y divide-slate-100">
        {[...(saved ? [{ name: "Home Depot", logo: "home-depot", cat: p.tags.materials, amount: 184.32, fresh: true }] : []), ...t.rows.map((r) => ({ ...r, fresh: false }))].map((r) => (
          <li key={r.name} className={`flex items-center gap-2.5 py-2 ${r.fresh ? "day-rise -mx-2 rounded-lg bg-emerald-50/70 px-2" : ""}`}>
            <Brand slug={r.logo} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-800">{r.name}</p>
              <Cat>{r.cat}</Cat>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">-{money(r.amount)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ── Banco: the new transactions get their category, then approved ──
function BankView({ p, step }: VP) {
  const t = p.tour.bank;
  const cats = step >= 1;
  const ok = step >= 3;
  return (
    <>
      <Head kicker={p.tour.nav[4]} title={t.account}
        right={ok
          ? <span className="day-pop shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{t.upToDate}</span>
          : <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{t.review} · {t.rows.length}</span>} />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
        <div className="rounded-xl border border-slate-100 p-2.5 sm:p-3">
          <p className="text-[10px] text-slate-500 sm:text-[11px]">{t.balance}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 sm:text-base">$18,240.55</p>
        </div>
        <div className="rounded-xl border border-slate-100 p-2.5 sm:p-3">
          <p className="text-[10px] text-slate-500 sm:text-[11px]">{p.income}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-600 sm:text-base">$24,580.00</p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {t.rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2.5 py-2.5">
            <Brand slug={r.logo} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-800">{r.name}</p>
              {cats
                ? <span className="day-pop inline-block" style={{ animationDelay: `${i * 120}ms` }}><Cat ai>{r.cat}</Cat></span>
                : <span className="block animate-pulse text-[10px] text-slate-400">{t.guessing}</span>}
            </div>
            <div className="grid shrink-0 justify-items-end gap-0.5">
              <span className={`text-xs font-semibold tabular-nums ${r.amount > 0 ? "text-emerald-600" : "text-slate-700"}`}>{r.amount > 0 ? "+" : "-"}{money(Math.abs(r.amount))}</span>
              {ok && <span className="day-pop inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600" style={{ animationDelay: `${i * 120}ms` }}><Check className="h-3 w-3" />{t.approved}</span>}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end">
        <span data-tour="approve-all" className={`${btn} text-white ${ok ? "bg-emerald-600" : "bg-blue-600"} ${press(step === 2)}`}>
          <Check className="h-3 w-3" />{ok ? t.upToDate : t.approveAll}
        </span>
      </div>
    </>
  );
}

// ── Reportes: the income statement, downloaded as PDF ──
function ReportsView({ p, step }: VP) {
  const r = p.report;
  const t = p.tour.reports;
  const revenue = [21480, 3100];
  const expenses = [4210, 3600, 1325];
  const totalRev = revenue.reduce((a, b) => a + b, 0);
  const totalExp = expenses.reduce((a, b) => a + b, 0);
  const lines: Array<{ label: string; value?: number; kind: "group" | "row" | "total" | "net" | "margin" }> = [
    { label: r.revenue, kind: "group" },
    ...r.rows.map((label, i) => ({ label, value: revenue[i], kind: "row" as const })),
    { label: r.revenue, value: totalRev, kind: "total" },
    { label: r.expenses, kind: "group" },
    ...r.expenseRows.map((label, i) => ({ label, value: -expenses[i], kind: "row" as const })),
    { label: r.expenses, value: -totalExp, kind: "total" },
    { label: r.net, value: totalRev - totalExp, kind: "net" },
    { label: r.margin, kind: "margin" },
  ];
  const done = step >= 3;
  return (
    <>
      <Head kicker={p.tour.nav[5]} title={`${r.title} · ${p.period}`}
        right={(
          <span data-tour="download" className={`${btn} relative overflow-hidden text-white ${done ? "bg-emerald-600" : "bg-slate-900"} ${press(step === 1)}`}>
            {step === 2 && <span aria-hidden className="day-fill absolute inset-y-0 left-0 bg-white/25" />}
            {done ? <Check className="day-pop h-3 w-3" /> : <FileLogo kind="pdf" className="h-3.5 w-3.5" />}
            <span className="relative">{done ? t.downloaded : t.download}</span>
          </span>
        )} />
      <div className="mt-4 rounded-xl border border-slate-100 px-3 py-2 text-[11px]">
        {lines.map((l, i) => {
          const style: CSSProperties = { animationDelay: `${i * 80}ms` };
          if (l.kind === "group") return <p key={i} style={style} className="day-rise pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 first:pt-1">{l.label}</p>;
          if (l.kind === "margin") return <p key={i} style={style} className="day-rise flex justify-between pt-1.5 text-slate-500"><span>{l.label}</span><span className="font-semibold tabular-nums text-emerald-600">62.8%</span></p>;
          const v = l.value ?? 0;
          return (
            <p key={i} style={style}
              className={`day-rise flex justify-between gap-3 py-1 ${l.kind === "total" ? "border-t border-slate-100 font-semibold text-slate-900" : l.kind === "net" ? "-mx-2 mt-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-800" : "text-slate-600"}`}>
              <span className="truncate">{l.label}</span>
              <span className="shrink-0 tabular-nums">{v < 0 ? "-" : ""}{money(Math.abs(v))}</span>
            </p>
          );
        })}
      </div>
    </>
  );
}

const SCREENS: Record<View, (p: VP) => ReactNode> = {
  home: HomeView, sales: SalesView, clients: ClientsView, expenses: ExpensesView, bank: BankView, reports: ReportsView,
};
const TOAST_ICONS: Record<Toast, { Icon: LucideIcon; tone: string }> = {
  sale: { Icon: Send, tone: "bg-blue-50 text-blue-600" },
  remind: { Icon: Bell, tone: "bg-amber-50 text-amber-600" },
  receipt: { Icon: Receipt, tone: "bg-violet-50 text-violet-600" },
  bank: { Icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
  report: { Icon: FileText, tone: "bg-blue-50 text-blue-600" },
};

function Notice({ p, toast }: { p: P; toast: Toast }) {
  const { Icon, tone } = TOAST_ICONS[toast];
  const [title, text] = p.tour.toasts[toast];
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-slate-900">{title}</p>
        <p className="truncate text-[11px] text-slate-500">{text}</p>
      </div>
    </div>
  );
}

export function DashboardTour() {
  const p = useCopy(marketingCopy).previews;
  const [at, setAt] = useState(0);
  const [rootRef, onScreen] = useInView<HTMLDivElement>({ threshold: 0.25 });
  const still = useReducedMotion();
  const playing = onScreen && !still;
  const frame = FRAMES[at];
  const view = frame.view;
  const step = still ? BEATS[view].length - 1 : frame.step;

  // The tour moves on by itself while it's on screen.
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setAt((i) => (i + 1) % FRAMES.length), FRAMES[at].ms);
    return () => window.clearTimeout(t);
  }, [at, playing]);

  // The pointer goes to what this beat is about.
  const boxRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    const cur = cursorRef.current;
    if (!box || !cur) return;
    const b = box.getBoundingClientRect();
    const target = frame.at ? box.querySelector<HTMLElement>(`[data-tour="${frame.at}"]`) : null;
    if (target) {
      const r = target.getBoundingClientRect();
      cur.style.transform = `translate(${Math.round(r.left - b.left + r.width / 2)}px, ${Math.round(r.top - b.top + r.height / 2)}px)`;
    } else if (!cur.style.transform) {
      cur.style.transform = `translate(${Math.round(b.width * 0.62)}px, ${Math.round(b.height * 0.55)}px)`;
    }
  }, [frame]);

  // The newest notice (the bank's one before any), and the one this section just fired (for small screens).
  let latest: Toast = "bank";
  let here: Toast | null = null;
  for (let k = at; k >= 0; k--) {
    const t = FRAMES[k].toast;
    if (!t) continue;
    if (FRAMES[k].view === view && !here) here = t;
    latest = t;
    break;
  }
  if (still) here = null;

  const go = (v: View) => setAt(START[v]);
  const Screen = SCREENS[view];

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div ref={boxRef} className="relative overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(2,6,23,0.6)] ring-1 ring-white/10">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 hidden truncate rounded-md bg-white px-3 py-1 text-[11px] text-slate-400 ring-1 ring-slate-200 sm:block">
            aethelaccountingplatform.com
          </span>
        </div>

        <div className="flex h-[514px] sm:h-[550px]">
          {/* The side menu: each icon opens its section. */}
          <nav aria-label={p.tour.navAria} className="flex w-11 shrink-0 flex-col items-center gap-2.5 border-r border-slate-100 py-3 sm:w-14 sm:gap-3 sm:py-4">
            {VIEWS.map((v, k) => {
              const Icon = NAV_ICONS[k];
              const on = v === view;
              return (
                <button key={v} type="button" data-tour={`nav-${v}`} aria-label={p.tour.nav[k]} title={p.tour.nav[k]} aria-pressed={on} onClick={() => go(v)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${on ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </nav>

          <div key={view} className="page-in min-w-0 flex-1 overflow-hidden p-4 sm:p-5">
            <Screen p={p} step={step} />
          </div>
        </div>

        {/* Small screens: the notice shows inside the window. */}
        {here && (
          <div key={`${view}-${here}`} className="day-rise absolute inset-x-3 bottom-3 z-20 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-slate-900/10 md:hidden">
            <Notice p={p} toast={here} />
          </div>
        )}

        {/* The pointer (its tip is the top-left corner). */}
        {!still && (
          <div ref={cursorRef} aria-hidden className="pointer-events-none absolute left-0 top-0 z-30 transition-transform duration-700 ease-[cubic-bezier(0.45,0,0.2,1)]">
            {frame.click && <span key={at} className="tour-click" />}
            <svg width="20" height="20" viewBox="0 0 20 20" className={`-ml-[3px] -mt-[2px] drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)] transition-transform duration-150 ${frame.click ? "scale-90" : ""}`}>
              <path d="M3 2l13 6.6-5.6 1.6 3.3 6.4-2.4 1.2-3.3-6.4L3.3 15.6z" fill="#0f172a" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Notices beside the window (computers): the newest one, and the month's report. */}
      <div className="absolute -right-4 -top-5 hidden animate-soft-float rounded-xl bg-white px-3.5 py-2.5 shadow-xl ring-1 ring-slate-900/5 md:block xl:-right-10">
        <div key={latest} className="day-pop"><Notice p={p} toast={latest} /></div>
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
