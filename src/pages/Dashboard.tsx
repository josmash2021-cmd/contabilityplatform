import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertCircle, ArrowRight, Bell, Camera, CheckCircle2, ClipboardList, FileText, Inbox, Landmark, Lock, ShoppingCart, Sparkles, TrendingDown, TrendingUp, Truck,
  type LucideIcon,
} from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { homeCopy, type HomeCopy } from "@/i18n/copy/home";
import type { Feature } from "@contracts/planFeatures";
import { DRAFT_STEP } from "@contracts/taxRules";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (n: number, cents = false) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

type Tone = "info" | "bad" | "warn" | "good";
type Task = { tone: Tone; icon: LucideIcon; title: string; text: string; to?: string };

/** The 2.0 business home: how the month is going, what's urgent, what's coming. */
export default function Dashboard() {
  const t = useCopy(homeCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Local dates for the summary (same as before the redesign).
  const dates = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    return {
      todayDate: ymd(now),
      weekStartDate: ymd(weekStart),
      monthStartDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
      tzOffsetHours: now.getTimezoneOffset() / -60,
      in30: ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30)),
      long: upperFirst(now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })),
      month: now.toLocaleDateString(locale, { month: "long" }),
    };
  }, [locale]);

  const { data: s } = trpc.dashboard.summary.useQuery({
    todayDate: dates.todayDate, weekStartDate: dates.weekStartDate, monthStartDate: dates.monthStartDate, tzOffsetHours: dates.tzOffsetHours,
  });
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 60_000 });
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const has = (f: Feature) => !!plan?.features.includes(f);
  const { data: bank } = trpc.bank.checkConnection.useQuery(undefined, { staleTime: 60_000 });
  const { data: receivables } = trpc.quotes.receivables.useQuery(undefined, { enabled: has("quotes") });
  const { data: bills } = trpc.vendors.bills.summary.useQuery({ today: dates.todayDate }, { enabled: has("vendors") });
  const { data: upcoming } = trpc.vendors.bills.list.useQuery({ filter: "unpaid", today: dates.todayDate, limit: 500 }, { enabled: has("vendors") });
  const { data: tax } = trpc.tax.current.useQuery(undefined, { enabled: has("taxes") && !membership });
  const { data: receiptUse } = trpc.receipts.usage.useQuery(undefined, { enabled: has("receipts") });

  const num = (v: unknown) => Number(v ?? 0);
  const monthSales = num(s?.monthSales.total);
  const monthExp = num(s?.monthExpenses);
  const profit = monthSales - monthExp;
  const bankBalance = num(s?.bankBalance);
  const hasBank = bank?.hasBank === true;
  const owedList = receivables ?? [];
  const owedTotal = owedList.reduce((a, r) => a + num(r.total), 0);
  const billItems = (upcoming?.items ?? []).filter((b) => b.dueDate <= dates.in30);
  const billsIn30 = billItems.reduce((a, b) => a + num(b.amount), 0);
  const firstName = (user?.name || "").trim().split(/\s+/)[0] ?? "";

  // ── Para hoy: only real things, most urgent first ──
  const tasks: Task[] = [];
  if (bank && !hasBank) tasks.push({ tone: "info", icon: Landmark, title: t.tasks.connectBank[0], text: t.tasks.connectBank[1], to: "/bank" });
  if (bills && bills.overdueCount > 0) { const [a, b] = t.tasks.late(bills.overdueCount, bills.overdueTotal); tasks.push({ tone: "bad", icon: Bell, title: a, text: b, to: "/vendors" }); }
  if (bills && bills.dueSoonCount > 0) { const [a, b] = t.tasks.soon(bills.dueSoonCount, bills.dueSoonTotal); tasks.push({ tone: "warn", icon: Truck, title: a, text: b, to: "/vendors" }); }
  if (owedList.length > 0) { const [a, b] = t.tasks.collect(owedList.length, owedTotal); tasks.push({ tone: "info", icon: ClipboardList, title: a, text: b, to: "/quotes" }); }
  const redo = tax?.docs.filter((d) => d.source === "client" && d.status === "redo").length ?? 0;
  if (redo > 0) { const [a, b] = t.tasks.taxRedo(redo); tasks.push({ tone: "bad", icon: FileText, title: a, text: b, to: "/taxes" }); }
  else if (tax?.access.allowed && (tax.ret?.step ?? DRAFT_STEP) === DRAFT_STEP && tax.missing && (tax.missing.docs.length > 0 || tax.missing.income)) tasks.push({ tone: "info", icon: FileText, title: t.tasks.taxDocs[0], text: t.tasks.taxDocs[1], to: "/taxes" });
  if (receiptUse && receiptUse.cap !== null && receiptUse.remaining !== null && receiptUse.remaining <= 5) { const [a, b] = t.tasks.receipts(receiptUse.remaining); tasks.push({ tone: "warn", icon: Camera, title: a, text: b, to: "/receipts" }); }
  if (tasks.length === 0) tasks.push({ tone: "good", icon: CheckCircle2, title: t.tasks.allDone[0], text: t.tasks.allDone[1] });

  // Day names in the user's language (the server sends them in Spanish).
  const week = (s?.dailySales ?? []).map((d) => {
    const day = new Date(`${d.date}T12:00:00`);
    return { day: day.toLocaleDateString(locale, { weekday: "short" }), long: day.toLocaleDateString(locale, { weekday: "long" }), total: num(d.total) };
  });
  const weekMax = Math.max(1, ...week.map((d) => d.total));
  const weekTotal = week.reduce((a, d) => a + d.total, 0);
  const best = week.reduce<WeekDay | null>((b, d) => (d.total > (b?.total ?? 0) ? d : b), null);

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.hello(firstName)}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{dates.long}</p>
          </div>
          <button onClick={() => navigate("/pos")} className="hidden h-10 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:inline-flex">
            <ShoppingCart className="h-4 w-4" />{t.charge}
          </button>
        </header>

        <p className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
          {profit >= 0 ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
          <span>{monthSales > 0 || monthExp > 0 ? t.status(fmt(monthSales), fmt(Math.abs(profit)), profit >= 0) : t.statusEmpty}</span>
        </p>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t.today.title}>
          <Kpi label={t.kpi.bank} value={hasBank ? fmt(bankBalance) : "—"} sub={hasBank ? t.kpi.bankSub : t.kpi.bankNone} to="/bank" />
          {has("quotes")
            ? <Kpi label={t.kpi.owed} value={fmt(owedTotal)} sub={t.kpi.owedSub(owedList.length)} to="/quotes" />
            : <Kpi label={t.kpi.today} value={fmt(num(s?.todaySales.total), true)} sub={t.kpi.todaySub(num(s?.todaySales.count))} to="/transactions" />}
          {has("vendors")
            ? <Kpi label={t.kpi.owe} value={fmt(bills?.unpaidTotal ?? 0)} sub={t.kpi.oweSub(bills?.unpaidCount ?? 0, bills?.overdueCount ?? 0)} tone={bills && bills.overdueCount > 0 ? "bad" : undefined} to="/vendors" />
            : <Kpi label={t.kpi.monthExp} value={fmt(monthExp)} sub={t.kpi.monthExpSub} to="/reports" />}
          <Kpi label={t.kpi.profit(dates.month)} value={fmt(profit)} sub={t.kpi.profitSub(fmt(monthSales), fmt(monthExp))} tone={profit >= 0 ? "good" : "bad"} to="/reports" />
        </section>

        {/* Shortcuts */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Shortcut icon={ShoppingCart} label={t.shortcuts.pos} to="/pos" />
          <Shortcut icon={ClipboardList} label={t.shortcuts.quote} to="/quotes" locked={!!plan && !has("quotes")} lockedLabel={t.locked} />
          <Shortcut icon={Camera} label={t.shortcuts.receipt} to="/receipts" locked={!!plan && !has("receipts")} lockedLabel={t.locked} />
          <Shortcut icon={Truck} label={t.shortcuts.bill} to="/vendors" locked={!!plan && !has("vendors")} lockedLabel={t.locked} />
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="home-today">
            <div className="flex items-center justify-between gap-2">
              <h2 id="home-today" className="font-semibold text-slate-900">{t.today.title}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">{t.today.tag}</span>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {tasks.map((task) => <TaskRow key={task.title} task={task} openLabel={t.today.open} />)}
            </ul>
          </section>

          {hasBank && (has("quotes") || has("vendors")) ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="home-forecast">
              <h2 id="home-forecast" className="font-semibold text-slate-900">{t.forecast.title}</h2>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900">≈ {fmt(bankBalance + owedTotal - billsIn30)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">{t.forecast.in} <b className="tabular-nums">+{fmt(owedTotal)}</b></p>
                <p className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{t.forecast.out} <b className="tabular-nums">−{fmt(billsIn30)}</b></p>
              </div>
              <p className="mt-3 flex gap-2 text-xs text-slate-500"><Sparkles className="h-4 w-4 shrink-0 text-violet-500" />{t.forecast.note}</p>
            </section>
          ) : (
            <WeekCard week={week} max={weekMax} total={weekTotal} best={best} t={t} />
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {hasBank && (has("quotes") || has("vendors")) && <WeekCard week={week} max={weekMax} total={weekTotal} best={best} t={t} />}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="home-recent">
            <div className="flex items-center justify-between">
              <h2 id="home-recent" className="font-semibold text-slate-900">{t.recent.title}</h2>
              <Link to="/transactions" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">{t.recent.all}<ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            {(s?.recentSales ?? []).length === 0 ? <p className="mt-3 text-sm text-slate-500">{t.recent.none}</p> : (
              <ul className="mt-2 divide-y divide-slate-100">
                {(s?.recentSales ?? []).slice(0, 5).map((sale: { id: number; customerName?: string | null; total: string; paymentMethod: string; status: string; createdAt: string | Date; items?: { serviceName: string }[] }) => (
                  <li key={sale.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><Inbox className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{sale.items?.[0]?.serviceName || sale.customerName || t.recent.sale}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {new Date(sale.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short" })} · {sale.status === "completed"
                          ? (t.methods[sale.paymentMethod] ?? sale.paymentMethod)
                          : <span className={sale.status === "pending" ? "font-medium text-amber-700" : "text-slate-500"}>{t.recent.status[sale.status] ?? sale.status}</span>}
                      </span>
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${sale.status === "cancelled" || sale.status === "refunded" ? "text-slate-400 line-through" : "text-slate-900"}`}>{fmt(num(sale.total), true)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AnimatedPage>
  );
}

function Kpi({ label, value, sub, tone, to }: { label: string; value: string; sub: string; tone?: "good" | "bad"; to: string }) {
  return (
    <Link to={to} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900"}`}>{value}</p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{sub}</p>
    </Link>
  );
}

function Shortcut({ icon: Icon, label, to, locked, lockedLabel }: { icon: LucideIcon; label: string; to: string; locked?: boolean; lockedLabel?: string }) {
  return (
    <Link to={to} title={locked ? lockedLabel : undefined}
      className="relative flex min-h-[56px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm sm:px-4 font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1 leading-tight">{label}</span>
      {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-label={lockedLabel} />}
    </Link>
  );
}

const TONES: Record<Tone, string> = {
  info: "bg-blue-50 text-blue-600", bad: "bg-red-50 text-red-600", warn: "bg-amber-50 text-amber-600", good: "bg-emerald-50 text-emerald-600",
};

function TaskRow({ task, openLabel }: { task: Task; openLabel: string }) {
  const Icon = task.tone === "bad" && task.icon === Bell ? AlertCircle : task.icon;
  const body = (
    <>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${TONES[task.tone]}`}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{task.title}</span>
        <span className="block text-xs text-slate-500">{task.text}</span>
      </span>
      {task.to && <span className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">{openLabel}</span>}
    </>
  );
  return (
    <li>
      {task.to
        ? <Link to={task.to} className="flex items-center gap-3 rounded-lg py-3 hover:bg-slate-50">{body}</Link>
        : <div className="flex items-center gap-3 py-3">{body}</div>}
    </li>
  );
}

type WeekDay = { day: string; long: string; total: number };

function WeekCard({ week, max, total, best, t }: { week: WeekDay[]; max: number; total: number; best: WeekDay | null; t: HomeCopy }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="home-week">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="home-week" className="font-semibold text-slate-900">{t.week.title}</h2>
        <span className="text-sm font-semibold tabular-nums text-slate-900">{fmt(total)}</span>
      </div>
      <div className="mt-4 grid h-36 grid-cols-7 items-end gap-2" role="img" aria-label={best ? t.week.best(best.long, fmt(best.total)) : t.week.none}>
        {week.map((d, i) => (
          <div key={i} className="flex h-full flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-slate-400">{d.total ? fmt(d.total) : ""}</span>
            <span className={`w-full max-w-[36px] rounded-md ${i === week.length - 1 ? "bg-blue-600" : "bg-slate-200"}`} style={{ height: `${Math.max(4, Math.round((d.total / max) * 100))}px` }} />
            <span className="text-[11px] capitalize text-slate-500">{d.day}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{best ? t.week.best(best.long, fmt(best.total)) : t.week.none}</p>
    </section>
  );
}
