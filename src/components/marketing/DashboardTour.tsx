// The home page's dashboard (hero, and /producto): a pointer first connects a bank (the same window the app shows),
// then goes through the app's sections and does one task in each (the bank's movements, a sale, a reminder, a
// receipt, the report), over and over while it's on screen.
// The side menu works: tapping a section jumps there and the tour goes on from it. With motion turned off
// there's no pointer and each section shows its task already done. Sample data.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell, Camera, Check, CheckCircle2, FileText, Landmark, LayoutDashboard,
  Lock, Plus, Receipt, Search, Send, ShieldCheck, ShoppingCart, Sparkles, Users, type LucideIcon,
} from "lucide-react";
import { FileLogo } from "@/components/FileLogo";
import { Logo } from "@/components/Logo";
import { BankLogo } from "@/components/brand/BankLogo";
import { useInView, useReducedMotion } from "@/hooks/useInView";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy, type MarketingCopy } from "@/i18n/copy/marketing";

type P = MarketingCopy["previews"];
type View = "connect" | "home" | "sales" | "clients" | "expenses" | "bank" | "reports";
type NavView = Exclude<View, "connect">;
type Toast = keyof P["tour"]["toasts"];
/** One beat of the tour: how long it lasts, where the pointer goes, whether it clicks, and a notice it fires. */
type Beat = { ms: number; at?: string; click?: boolean; toast?: Toast };

// The side menu, and the order the tour goes in: it starts by connecting the bank (shown under Banco).
const NAV: NavView[] = ["home", "sales", "clients", "expenses", "bank", "reports"];
const NAV_ICONS: LucideIcon[] = [LayoutDashboard, ShoppingCart, Users, Receipt, Landmark, BarChart3];
const FLOW: View[] = ["connect", "bank", "home", "sales", "clients", "expenses", "reports"];
const navOf = (v: View): NavView => (v === "connect" ? "bank" : v);

// Each section's beats; its screen changes with the beat number (`step`). The last beats go to the next section.
const BEATS: Record<View, Beat[]> = {
  connect: [
    { ms: 1300, at: "connect-btn" }, { ms: 450, click: true }, // the empty Banco page; "Conectar mi banco"
    { ms: 1500, at: "connect-go" }, { ms: 450, click: true }, // the window: what will happen, and the banks
    { ms: 1300, at: "pick-bank" }, { ms: 450, click: true }, // the secure window: the bank is picked
    { ms: 2600 }, // the movements come in
    { ms: 1500, toast: "connected" }, // connected: the accounts and their balance
    { ms: 900, at: "connect-see" }, { ms: 450, click: true },
  ],
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
    { ms: 900, at: "nav-reports" }, { ms: 450, click: true },
  ],
  bank: [
    { ms: 1200 }, // the categories are being put
    { ms: 1100, at: "approve-all" },
    { ms: 450, click: true },
    { ms: 2000, toast: "bank" },
    { ms: 900, at: "nav-home" }, { ms: 450, click: true },
  ],
  reports: [
    { ms: 1500, at: "download" }, { ms: 450, click: true },
    { ms: 1000 }, // downloading
    { ms: 2200, toast: "report" },
    { ms: 900, at: "nav-bank" }, { ms: 450, click: true },
  ],
};
const FRAMES = FLOW.flatMap((view) => BEATS[view].map((b, step) => ({ view, step, ...b })));
const START = Object.fromEntries(FLOW.map((v) => [v, FRAMES.findIndex((f) => f.view === v)])) as Record<View, number>;

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

// ── Conectar el banco: the same window the app shows (the app's logo, the banks, the secure window, the movements coming in) ──
const PICK = ["Chase", "Bank of America", "Wells Fargo", "Regions Bank", "Capital One", "Truist"];
const CHOSEN = "Wells Fargo";

function ConnectView({ p, step }: VP) {
  const t = p.tour.connect;
  const phase = step < 2 ? "page" : step < 4 ? "intro" : step < 6 ? "pick" : step < 7 ? "import" : "done";
  return (
    <>
      <Head kicker={t.kicker} title={t.emptyTitle} />
      <div className="mt-4 grid justify-items-center rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Landmark className="h-5 w-5" /></span>
        <p className="mt-2 text-xs font-semibold text-slate-900">{t.emptyTitle}</p>
        <p className="mt-0.5 max-w-[30ch] text-[11px] text-slate-500">{t.emptyText}</p>
        <span data-tour="connect-btn" className={`${btn} mt-3 bg-blue-600 text-white ${press(step === 1)}`}><Landmark className="h-3 w-3" />{t.button}</span>
      </div>

      {phase !== "page" && (
        <div className="tour-veil pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-900/35 p-3 backdrop-blur-[2px]">
          <div key={phase} className="tour-modal w-full max-w-[290px] rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(2,6,23,0.06),0_10px_28px_-8px_rgba(2,6,23,0.18),0_30px_70px_-12px_rgba(2,6,23,0.26)]">
            {phase === "intro" && (
              <div className="grid gap-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-[0_8px_16px_-8px_rgba(37,99,235,0.9)]"><Logo className="h-5 w-5 text-white" /></span>
                  <span className="tour-wire relative h-0.5 w-12">
                    <span className="absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-2 ring-white"><Lock className="h-2.5 w-2.5" /></span>
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700"><Landmark className="h-4 w-4" /></span>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{t.title}</p>
                  <p className="text-[11px] text-slate-500">{t.text}</p>
                </div>
                <div className="flex items-center justify-center gap-1">
                  {PICK.slice(0, 5).map((n) => <BankLogo key={n} name={n} size={20} />)}
                  <span className="ml-1 text-[10px] text-slate-500">{t.more}</span>
                </div>
                <span data-tour="connect-go" className={`${btn} w-full bg-blue-600 py-2 text-white ${press(step === 3)}`}>{t.go}<ArrowRight className="h-3 w-3" /></span>
                <p className="flex items-center justify-center gap-1 text-[10px] text-slate-500"><ShieldCheck className="h-3 w-3 text-emerald-600" />{t.secure}</p>
              </div>
            )}
            {phase === "pick" && (
              <div className="grid gap-2.5">
                <p className="flex items-center gap-1 text-[10px] text-slate-500"><Lock className="h-3 w-3 text-emerald-600" />{t.window}</p>
                <p className="text-sm font-bold text-slate-900">{t.pick}</p>
                <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] text-slate-400"><Search className="h-3 w-3" />{t.search}</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {PICK.map((n) => (
                    <span key={n} data-tour={n === CHOSEN ? "pick-bank" : undefined}
                      className={`grid justify-items-center gap-1 rounded-lg border px-1 py-2 text-center text-[9px] font-medium leading-tight text-slate-700 transition-[transform,border-color,box-shadow] duration-200 ${n === CHOSEN && step === 5 ? "scale-95 border-blue-500 shadow-[0_0_0_3px_rgba(37,99,235,0.15)]" : "border-slate-200"}`}>
                      <BankLogo name={n} size={24} />
                      <span className="w-full truncate">{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {phase === "import" && (
              <div className="grid gap-3">
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                  <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#E8EEF8" strokeWidth="4.5" />
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#2563EB" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="176" className="tour-ring" />
                  </svg>
                  <BankLogo name={CHOSEN} size={34} />
                </div>
                <p className="text-center text-sm font-bold text-slate-900">{t.importTitle}</p>
                <ul className="grid gap-1.5 text-[11px] text-slate-800">
                  {t.steps.map((label, i) => (
                    <li key={label} className="flex items-center gap-2">
                      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                        <span className="tour-wait absolute inset-0 rounded-full border-2 border-blue-200 border-t-blue-600" style={{ animationDelay: `0ms, ${250 + i * 520}ms` }} />
                        <span className="day-pop absolute inset-0 flex items-center justify-center rounded-full bg-emerald-600 text-white" style={{ animationDelay: `${250 + i * 520}ms` }}>
                          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                        </span>
                      </span>
                      {label}
                      {i === 2 && <span className="day-pop ml-auto font-semibold tabular-nums text-slate-500" style={{ animationDelay: `${250 + i * 520}ms` }}>{t.count}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {phase === "done" && (
              <div className="grid gap-2.5 text-center">
                <span className="day-pop mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-5 w-5" strokeWidth={3} /></span>
                <div>
                  <p className="text-sm font-bold text-slate-900">{t.doneTitle}</p>
                  <p className="text-[11px] text-slate-500">{t.doneText}</p>
                </div>
                <ul className="divide-y divide-slate-100 border-y border-slate-100 text-left">
                  {t.accounts.map(([name, mask, amount], i) => (
                    <li key={mask} className="day-rise flex items-center gap-2 py-1.5" style={{ animationDelay: `${150 + i * 110}ms` }}>
                      <BankLogo name={CHOSEN} size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-slate-900">{name}</span>
                        <span className="block text-[9px] text-slate-500">•••• {mask}</span>
                      </span>
                      <span className="text-[11px] font-semibold tabular-nums text-slate-900">{money(amount)}</span>
                    </li>
                  ))}
                </ul>
                <span data-tour="connect-see" className={`${btn} w-full bg-blue-600 py-2 text-white ${press(step === 9)}`}>{t.see}<ArrowRight className="h-3 w-3" /></span>
              </div>
            )}
          </div>
        </div>
      )}
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
  connect: ConnectView, home: HomeView, sales: SalesView, clients: ClientsView, expenses: ExpensesView, bank: BankView, reports: ReportsView,
};
const TOAST_ICONS: Record<Toast, { Icon: LucideIcon; tone: string }> = {
  connected: { Icon: Landmark, tone: "bg-emerald-50 text-emerald-600" },
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

  // The pointer goes to what this beat is about, the way a hand moves a mouse. A guide point travels a slight
  // curve (quick to start, a long gentle slowdown), and the pointer follows it like a hand on a soft spring: it
  // never starts or stops at once, keeps its speed when the next move begins, and settles with a touch of give.
  // When it's still it sways a little. Each beat sets what it's going to; the loop follows that element where it
  // really is on every frame (a window that is still sliding in included), so the click lands on it.
  const boxRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const motion = useRef({
    placed: false, gx: 0, gy: 0, x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0, cx: 0, cy: 0, tx: 0, ty: 0, t0: 0, dur: 0,
    el: null as HTMLElement | null, jx: 0, jy: 0,
  });
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const m = motion.current;
    const b = box.getBoundingClientRect();
    if (!m.placed) {
      m.x = m.gx = b.width * 0.62;
      m.y = m.gy = b.height * 0.55;
      m.placed = true;
      cursorRef.current?.style.setProperty("transform", `translate(${m.x}px, ${m.y}px)`);
    }
    const target = frame.at ? box.querySelector<HTMLElement>(`[data-tour="${frame.at}"]`) : null;
    if (!target) return;
    const r = target.getBoundingClientRect();
    // A spot near the middle, a little off it, different on each beat (kept well inside what it clicks).
    m.el = target;
    m.jx = (((at * 37) % 11) / 10 - 0.5) * Math.min(r.width * 0.3, 30);
    m.jy = (((at * 53) % 7) / 6 - 0.5) * Math.min(r.height * 0.25, 6);
    m.tx = r.left - b.left + r.width / 2 + m.jx;
    m.ty = r.top - b.top + r.height / 2 + m.jy;
    m.fx = m.gx;
    m.fy = m.gy;
    const dx = m.tx - m.fx;
    const dy = m.ty - m.fy;
    const d = Math.hypot(dx, dy) || 1;
    // The curve bows to one side (it changes from beat to beat), more on long moves.
    const bend = Math.min(60, d * 0.16) * (at % 2 ? 1 : -1);
    m.cx = m.fx + dx * 0.45 - (dy / d) * bend;
    m.cy = m.fy + dy * 0.45 + (dx / d) * bend;
    m.t0 = performance.now();
    // Longer moves take longer; it always arrives and settles before the click.
    m.dur = Math.min(Math.min(950, Math.max(480, 380 + d * 0.55)), Math.max(380, frame.ms - 450));
  }, [frame, at]);

  useEffect(() => {
    if (!playing) return;
    const minJerk = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s);
    const W = 22; // how quickly the hand follows (rad/s)
    const Z = 0.8; // a little give when it stops
    let raf = 0;
    let last = performance.now();
    let idle = 1;
    const tick = (now: number) => {
      const m = motion.current;
      const cur = cursorRef.current;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (cur && m.placed) {
        // Where the element it's going to is right now (it may still be sliding in).
        const box = boxRef.current;
        if (m.el && box) {
          if (m.el.isConnected) {
            const r = m.el.getBoundingClientRect();
            const b = box.getBoundingClientRect();
            m.tx = r.left - b.left + r.width / 2 + m.jx;
            m.ty = r.top - b.top + r.height / 2 + m.jy;
            if (!m.dur) { m.gx = m.tx; m.gy = m.ty; }
          } else {
            m.el = null;
          }
        }
        if (m.dur) {
          // The frame's time can be a hair before the move was set: never below 0 (a negative power is NaN).
          const p = Math.min(1, Math.max(0, (now - m.t0) / m.dur));
          const s = minJerk(Math.pow(p, 0.8)); // fast to start, long soft finish
          const u = 1 - s;
          m.gx = u * u * m.fx + 2 * u * s * m.cx + s * s * m.tx;
          m.gy = u * u * m.fy + 2 * u * s * m.cy + s * s * m.ty;
          if (p >= 1) m.dur = 0;
        }
        // A hand never holds perfectly still: a slow, small sway that fades in once it stops.
        idle += ((m.dur ? 0.15 : 1) - idle) * Math.min(1, dt * 2.5);
        const sx = idle * (Math.sin(now / 900) * 1.1 + Math.sin(now / 370 + 1.3) * 0.45);
        const sy = idle * (Math.cos(now / 1050) * 0.9 + Math.sin(now / 430 + 0.4) * 0.35);
        const goalX = m.gx + sx;
        const goalY = m.gy + sy;
        // The pointer follows the guide on a soft spring (small steps keep it steady at any frame rate).
        for (let left = dt; left > 0; left -= 1 / 240) {
          const h = Math.min(left, 1 / 240);
          m.vx += (W * W * (goalX - m.x) - 2 * Z * W * m.vx) * h;
          m.vy += (W * W * (goalY - m.y) - 2 * Z * W * m.vy) * h;
          m.x += m.vx * h;
          m.y += m.vy * h;
        }
        // If anything ever went wrong, start again from the guide instead of freezing.
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) { m.x = m.gx; m.y = m.gy; m.vx = 0; m.vy = 0; }
        cur.style.transform = `translate(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

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

  const go = (v: NavView) => setAt(START[v === "bank" ? "connect" : v]);
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

        <div className="relative flex h-[514px] sm:h-[550px]">
          {/* The side menu: each icon opens its section. */}
          <nav aria-label={p.tour.navAria} className="flex w-11 shrink-0 flex-col items-center gap-2.5 border-r border-slate-100 py-3 sm:w-14 sm:gap-3 sm:py-4">
            {NAV.map((v, k) => {
              const Icon = NAV_ICONS[k];
              const on = v === navOf(view);
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

        {/* The pointer: a rounded arrow in the brand's blue. Its tip is the top-left corner; it presses in on a click.
            Where it is comes from the motion loop above (not a CSS transition, so it can curve). */}
        {!still && (
          <div ref={cursorRef} aria-hidden className="pointer-events-none absolute left-0 top-0 z-30 will-change-transform">
            {frame.click && <span key={at} className="tour-click" />}
            <div className={`origin-top-left transition-transform duration-200 ease-out ${frame.click ? "scale-[0.82]" : ""}`}>
              <svg width="22" height="22" viewBox="0 0 22 22" className="-ml-[4px] -mt-[3px] drop-shadow-[0_4px_10px_rgba(37,99,235,0.45)]">
                <path d="M4.3 3.7c-.25-.85.6-1.55 1.38-1.12l13.2 7.32c.75.42.63 1.53-.2 1.75l-5.6 1.5-2.7 5.25c-.4.77-1.53.65-1.75-.18z"
                  fill="#2563EB" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
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
