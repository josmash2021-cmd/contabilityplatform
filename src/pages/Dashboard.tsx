import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertCircle, BarChart3, Bell, BookOpen, Calendar, Camera, CheckCircle2, ClipboardList, FileText, Inbox, Landmark, ListChecks, Lock, Plus,
  ShoppingCart, Sparkles, TrendingDown, TrendingUp, Truck, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AppRouter } from "../../api/router";
import { isEmail, mailtoUrl, whatsappPhone, whatsappUrl } from "../../api/lib/invoices";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PullToRefresh } from "@/components/layout/PullToRefresh";
import { pullCopy } from "@/i18n/copy/pull";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { PayBillDialog } from "@/components/vendors/PayBillDialog";
import type { BillItem } from "@/components/vendors/shared";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale, type Lang } from "@/i18n/lang";
import { homeCopy, type HomeCopy } from "@/i18n/copy/home";
import { appCopy } from "@/i18n/copy/app";
import { teamCopy } from "@/i18n/copy/team";
import { receiptCategoryLabel, receiptsCopy } from "@/i18n/copy/receipts";
import type { Feature } from "@contracts/planFeatures";
import { DRAFT_STEP, currentTaxYear, taxReminder } from "@contracts/taxRules";
import { cn } from "@/lib/utils";
import { readAgain } from "@/lib/readAgain";

type Overview = inferRouterOutputs<AppRouter>["home"]["overview"];
type Membership = NonNullable<inferRouterOutputs<AppRouter>["team"]["myMembership"]>;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const firstWord = (s: string | null | undefined) => (s || "").trim().split(/\s+/)[0] ?? "";
/** "$18,421" (no cents), "−$40" for negatives. */
const fmt0 = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
/** "$850.00". */
const fmt2 = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "+12.4%" / "−3%". */
const signedPct = (pct: number, decimals = 0) => `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(decimals)}%`;

/** A calendar day (YYYY-MM-DD) as a local Date at noon: no time zone can move it to another day. */
const dayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const monthName = (m: number, locale: string) => new Date(2000, m - 1, 15).toLocaleDateString(locale, { month: "long" });
const shortDay = (iso: string, locale: string) => dayOf(iso).toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(".", "");

// Prototype tokens (see the brief): cards, tags and small buttons.
const CARD = "min-w-0 rounded-[14px] border border-slate-200 bg-white p-4";
const H3 = "text-[15px] font-bold text-slate-900";
const TAG = "inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500";
const BTN_SM = "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-[34px]";

/** The business home ("Inicio"), as the 2.0 prototype's home screen. Team members get their own short version. */
export default function Dashboard() {
  const { data: membership, isLoading } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  if (isLoading) return <HomeSkeleton />;
  if (membership) return <MemberHome membership={membership} />;
  return <OwnerHome />;
}

// ── The owner's home ──

type Tone = "info" | "bad" | "warn" | "good";
type Task = {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  text: string;
  /** Already taken care of today: shown faded and crossed out, as in the prototype. */
  done?: boolean;
  /** A page (`to`), an outside link (`href`, with `onClick` run as it opens) or a button (`onClick`). */
  action?: { label: string; to?: string; href?: string; newTab?: boolean; onClick?: () => void };
};

function OwnerHome() {
  const t = useCopy(homeCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const { user } = useAuth();
  const utils = trpc.useUtils();
  // Pull down to refresh (phones): ask the bank again now, then every number on the page
  const pullT = useCopy(pullCopy);
  const { mutateAsync: syncRecentNow } = trpc.bank.syncRecent.useMutation({ onError: () => {} });
  const { mutateAsync: refreshBalancesNow } = trpc.bank.refreshAllBalances.useMutation({ onError: () => {} });
  const pullRefresh = async () => {
    await Promise.allSettled([syncRecentNow(), refreshBalancesNow({ pulled: true })]);
    await utils.invalidate();
  };
  // Opening Inicio: the balance from the bank itself and new movements (owner, 2026-11-27: "cuando abre debe ya
  // estar actualizado"; limits in api/lib/liveBalance.ts), then the home numbers are read again (readAgain).
  const { mutate: refreshOnOpen } = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: (d) => { if (d.success) void readAgain(utils.home.overview, utils.brand.institutions); },
    onError: () => {},
  });
  useEffect(() => { refreshOnOpen({ pulled: true }); }, [refreshOnOpen]);
  const [payBill, setPayBill] = useState<BillItem | null>(null);

  // The user's local day (computed once per language; the server checks it against its own clock).
  const dates = useMemo(() => {
    const now = new Date();
    return {
      today: ymd(now),
      tzOffsetHours: now.getTimezoneOffset() / -60,
      weekday: now.toLocaleDateString(locale, { weekday: "long" }),
      day: now.getDate(),
      month: now.toLocaleDateString(locale, { month: "long" }),
    };
  }, [locale]);

  const overview = trpc.home.overview.useQuery({ today: dates.today, tzOffsetHours: dates.tzOffsetHours });
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 60_000 });
  const has = (f: Feature) => !!plan?.features.includes(f);
  const { data: review } = trpc.review.count.useQuery(undefined, { staleTime: 60_000 });
  // When the app opens, it confirms by itself what it's sure about (api/lib/autoConfirm.ts), so Inicio's count only
  // has what needs the owner. It used to run only on Banco and Movimientos, so Inicio could show them all (owner).
  const { mutate: autoFix } = trpc.bank.autoFixCategories.useMutation({
    onSuccess: (d) => {
      if ((d.fixed ?? 0) > 0 || (d.autoConfirmed ?? 0) > 0) {
        void utils.review.count.invalidate(); void utils.review.list.invalidate(); void utils.review.autoRecent.invalidate(); void utils.home.overview.invalidate();
      }
    },
    onError: () => {},
  });
  useEffect(() => { const id = setTimeout(() => autoFix(), 1500); return () => clearTimeout(id); }, [autoFix]);
  const { data: billList } = trpc.vendors.bills.list.useQuery({ filter: "unpaid", today: dates.today, limit: 500 }, { enabled: has("vendors") });
  const { data: tax } = trpc.tax.reminders.useQuery(undefined, { enabled: has("taxes") });
  const { data: receiptUse } = trpc.receipts.usage.useQuery(undefined, { enabled: has("receipts") });
  const { data: reconcile } = trpc.reconcile.overview.useQuery(undefined, { staleTime: 60_000 });

  // "Recordar" opens the user's own email or WhatsApp with the text ready; Facturas records that it went out.
  const remind = trpc.invoices.markReminded.useMutation({
    onError: (e) => toast.error(e.message || t.error),
    onSettled: () => void Promise.all([utils.home.overview.invalidate(), utils.invoices.invalidate()]),
  });

  const o = overview.data;
  const firstName = firstWord(user?.name);
  const month = o ? monthName(o.month, locale) : dates.month;
  const prevMonth = o ? monthName(o.previousMonth, locale) : "";

  // ── Para hoy: only real things, most urgent first ──
  const tasks: Task[] = [];
  if (o && o.bank.accounts === 0) tasks.push({ tone: "info", icon: Landmark, title: t.tasks.connectBank[0], text: t.tasks.connectBank[1], action: { label: t.tasks.connect, to: "/bank" } });
  const toReview = review?.count ?? 0;
  if (toReview > 0) {
    const [a, b] = t.tasks.review(toReview);
    tasks.push({ tone: "info", icon: Inbox, title: a, text: b, action: { label: t.tasks.reviewBtn, to: "/transactions" } });
  }
  const late = o?.receivables?.late;
  if (late) {
    const client = late.customerName || t.forecast.noClient;
    if (late.remindedToday) {
      const [a, b] = t.tasks.reminded(client, late.number ?? "", fmt2(late.balance));
      tasks.push({ tone: "good", icon: CheckCircle2, title: a, text: b, done: true });
    } else {
      const [a, b] = t.tasks.collect(client, late.number ?? "", fmt2(late.balance), late.daysLate);
      const reminder = reminderLink(late, t, locale, o?.businessName || user?.name || "");
      tasks.push({
        tone: "bad", icon: Bell, title: a, text: b,
        action: reminder
          ? { label: t.tasks.remind, href: reminder.href, newTab: reminder.channel === "whatsapp", onClick: () => remind.mutate({ ref: late.ref, channel: reminder.channel }) }
          : { label: t.tasks.see, to: "/invoices" },
      });
    }
  }
  const bill = urgentBill(billList?.items ?? []);
  if (bill) {
    const [a, b] = t.tasks.pay(bill.vendorName, fmt2(bill.amount), dueText(bill, t, locale));
    tasks.push({ tone: bill.timing === "overdue" ? "bad" : "warn", icon: Calendar, title: a, text: b, action: { label: t.tasks.payBtn, onClick: () => setPayBill(bill) } });
  }
  if (reconcile && !reconcile.locked && reconcile.account && reconcile.canChange && !reconcile.suggestion.waiting) {
    const [a, b] = t.tasks.close(periodLabel(reconcile.suggestion, t, locale));
    tasks.push({ tone: "info", icon: ListChecks, title: a, text: b, action: { label: t.tasks.open, to: "/bank" } });
  }
  const redo = tax?.redo ?? 0;
  if (redo > 0) {
    const [a, b] = t.tasks.taxRedo(redo);
    tasks.push({ tone: "bad", icon: FileText, title: a, text: b, action: { label: t.tasks.open, to: "/taxes" } });
  } else if (tax?.allowed && (tax.step ?? DRAFT_STEP) === DRAFT_STEP && tax.needsDocs) {
    // Only in season (owner, 2026-11-25): nothing Oct–Dec, the 1099 line in January, the days left at the end
    const season = taxReminder(tax.taxYear ?? currentTaxYear());
    const action = { label: t.tasks.upload, to: "/taxes" };
    if (season.phase === "w2") tasks.push({ tone: "info", icon: FileText, title: t.tasks.taxDocs[0], text: t.tasks.taxW2, action });
    else if (season.phase === "open") tasks.push({ tone: "info", icon: FileText, title: t.tasks.taxDocs[0], text: t.tasks.taxDocs[1], action });
    else if (season.phase === "last") {
      const day = new Date(`${season.deadline}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", day: "numeric", month: "long" });
      const [a, b] = t.tasks.taxLast(season.daysLeft, day);
      tasks.push({ tone: "warn", icon: FileText, title: a, text: b, action });
    }
  }
  if (receiptUse && receiptUse.cap !== null && receiptUse.remaining !== null && receiptUse.remaining <= 5) {
    const [a, b] = t.tasks.receipts(receiptUse.remaining);
    tasks.push({ tone: "warn", icon: Camera, title: a, text: b, action: { label: t.tasks.upload, to: "/receipts" } });
  }
  if (o && tasks.length === 0) tasks.push({ tone: "good", icon: CheckCircle2, title: t.tasks.allDone[0], text: t.tasks.allDone[1] });

  const closePay = () => {
    setPayBill(null);
    void utils.home.overview.invalidate();
  };

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <PullToRefresh onRefresh={pullRefresh} label={pullT} />
      <div className="mx-auto max-w-6xl">
        <header className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-[750] tracking-tight text-slate-900 sm:text-[22px]">{t.hello(firstName)}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.date(dates.weekday, dates.day, dates.month)}</p>
          </div>
          <Link to="/invoices" className="hidden h-10 items-center gap-1.5 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:inline-flex">
            <Plus className="h-4 w-4" aria-hidden="true" />{t.newInvoice}
          </Link>
        </header>

        {overview.isError && !o ? (
          <section className={cn(CARD, "flex flex-wrap items-center justify-between gap-3 border-red-200")}>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900" role="alert"><AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />{t.error}</p>
            <button type="button" className={BTN_SM} onClick={() => void overview.refetch()}>{t.retry}</button>
          </section>
        ) : !o ? (
          <OverviewSkeleton />
        ) : (
          <>
            <StatusLine o={o} name={firstName} prevMonth={prevMonth} t={t} />

            {/* KPIs */}
            <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3" aria-label={t.today.title}>
              <Kpi to="/bank" label={t.kpi.bank} value={o.bank.accounts > 0 ? fmt0(o.bank.balance) : "—"} sub={o.bank.accounts > 0 ? t.kpi.accounts(o.bank.accounts) : t.kpi.bankNone} />
              {o.receivables
                ? <Kpi to="/invoices" label={t.kpi.owed} value={fmt0(o.receivables.total)} sub={t.kpi.owedSub(o.receivables.count, o.receivables.lateCount)} tone={o.receivables.lateCount > 0 ? "bad" : undefined} />
                : <Kpi to="/pos" label={t.kpi.today} value={fmt0(o.week.days[6]?.total ?? 0)} sub={t.kpi.todaySub(o.week.days[6]?.count ?? 0)} />}
              {o.bills
                ? <Kpi to="/vendors" label={t.kpi.owe} value={fmt0(o.bills.unpaidTotal)} sub={t.kpi.oweSub(o.bills.unpaidCount, o.bills.overdueCount)} tone={o.bills.overdueCount > 0 ? "bad" : undefined} />
                : <Kpi to="/receipts" label={t.kpi.monthExp} value={fmt0(o.expenses.monthTotal)} sub={t.kpi.monthExpSub(o.expenses.monthCount)} />}
              <Kpi
                to="/reports" label={upperFirst(t.kpi.profit(month))} value={fmt0(o.profit.profit)}
                sub={o.profit.changePct !== null ? t.kpi.vs(signedPct(o.profit.changePct, 1), prevMonth) : t.kpi.profitSub(fmt0(o.profit.sales), fmt0(o.profit.expenses))}
                tone={o.profit.changePct === null ? undefined : o.profit.changePct >= 0 ? "good" : "bad"}
                title={o.profit.changePct !== null ? t.kpi.vsTitle(shortDay(firstOfPrev(o.today), locale), shortDay(prevSameDay(o.today), locale)) : undefined}
              />
            </section>
          </>
        )}

        {/* Shortcuts: icon and label in a row; on the phone, icon over label, four across. */}
        <section className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2.5">
          <Shortcut icon={ShoppingCart} label={t.shortcuts.pos} to="/pos" />
          <Shortcut icon={FileText} label={t.shortcuts.invoice} to="/invoices" />
          <Shortcut icon={Wallet} label={t.shortcuts.expense} to="/expenses?new=1" locked={!!plan && !has("receipts")} lockedLabel={t.locked} />
          <Shortcut icon={Camera} label={t.shortcuts.receipt} to="/receipts" locked={!!plan && !has("receipts")} lockedLabel={t.locked} />
        </section>

        {o && (
          <>
            <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <section className={CARD} aria-labelledby="home-today">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 id="home-today" className={H3}>{t.today.title}</h2>
                  <span className={TAG}>{t.today.tag}</span>
                </div>
                <ul className="grid gap-2">
                  {tasks.map((task) => <TaskRow key={task.title} task={task} />)}
                </ul>
              </section>
              {o.next30 ? <ForecastCard next30={o.next30} t={t} locale={locale} /> : <MonthExpensesCard o={o} t={t} lang={lang} />}
            </div>

            <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <WeekCard o={o} t={t} locale={locale} />
              <InsightCard o={o} t={t} lang={lang} prevMonth={prevMonth} />
            </div>
          </>
        )}
      </div>
      {payBill && <PayBillDialog key={payBill.id} bill={payBill} today={dates.today} onClose={closePay} />}
    </AnimatedPage>
  );
}

/** The first day of last month and the same day of the month there (what the profit is compared with). */
function firstOfPrev(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
}
function prevSameDay(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(py, pm, 0).getDate();
  return `${py}-${pad(pm)}-${pad(Math.min(d, last))}`;
}

/** The bill to pay first: the oldest overdue one, else the first one due within the week. */
function urgentBill(items: readonly BillItem[]): BillItem | null {
  const overdue = items.filter((b) => b.timing === "overdue").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdue[0]) return overdue[0];
  return items.filter((b) => b.timing === "dueToday" || b.timing === "dueSoon").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
}

function dueText(bill: BillItem, t: HomeCopy, locale: string): string {
  const d = bill.daysUntilDue ?? 0;
  if (d < 0) return t.tasks.due.late(-d);
  if (d === 0) return t.tasks.due.today;
  if (d === 1) return t.tasks.due.tomorrow;
  if (d < 7) return t.tasks.due.weekday(dayOf(bill.dueDate).toLocaleDateString(locale, { weekday: "long" }));
  return t.tasks.due.date(shortDay(bill.dueDate, locale));
}

/** "octubre" when the period is a whole month, else "hasta el 21 nov". */
function periodLabel(p: { start: string; end: string }, t: HomeCopy, locale: string): string {
  const [ey, em, ed] = p.end.split("-").map(Number);
  const wholeMonth = p.start === `${ey}-${pad(em)}-01` && ed === new Date(ey, em, 0).getDate();
  return wholeMonth ? monthName(em, locale) : t.tasks.closePeriod(shortDay(p.end, locale));
}

type LateInvoice = NonNullable<NonNullable<Overview["receivables"]>["late"]>;

/**
 * The reminder, written for the client and opened in the user's own email (when the client has one) or
 * WhatsApp (a phone number): the app has no email service. Null when there's no way to reach the client.
 */
function reminderLink(r: LateInvoice, t: HomeCopy, locale: string, from: string): { href: string; channel: "email" | "whatsapp" } | null {
  const number = r.number ?? "";
  const body = t.reminder.body(r.customerName ?? "", number, fmt2(r.balance), dayOf(r.dueDate).toLocaleDateString(locale, { day: "numeric", month: "long" }), from);
  if (isEmail(r.email)) return { href: mailtoUrl(r.email, t.reminder.subject(number), body), channel: "email" };
  if (whatsappPhone(r.phone)) return { href: whatsappUrl(r.phone, body), channel: "whatsapp" };
  return null;
}

function StatusLine({ o, name, prevMonth, t }: { o: Overview; name: string; prevMonth: string; t: HomeCopy }) {
  const p = o.profit;
  const active = p.sales > 0 || p.expenses > 0;
  let tone: "good" | "warn" | "bad" | "info" = "info";
  let parts: [string, string, string] | null = null;
  if (active && p.profit < 0) {
    tone = "bad";
    parts = t.status.loss(name, fmt0(-p.profit));
  } else if (active && p.changePct !== null && Math.round(p.changePct) < 0) {
    tone = "warn";
    parts = t.status.down(name, fmt0(p.profit), Math.abs(Math.round(p.changePct)), prevMonth);
  } else if (active) {
    tone = "good";
    parts = t.status.good(name, fmt0(p.profit), p.changePct === null ? null : Math.round(p.changePct), prevMonth);
  }
  const Icon = tone === "good" ? TrendingUp : tone === "info" ? Sparkles : TrendingDown;
  return (
    <p className={cn(
      "mb-3.5 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm text-slate-900",
      tone === "good" ? "bg-emerald-50" : tone === "warn" ? "bg-amber-50" : tone === "bad" ? "bg-red-50" : "bg-blue-50",
    )}>
      <Icon className={cn("mt-px h-[18px] w-[18px] shrink-0", tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-600" : "text-blue-600")} aria-hidden="true" />
      <span>{parts ? <>{parts[0]}<b className="tabular-nums">{parts[1]}</b>{parts[2]}</> : t.status.empty}</span>
    </p>
  );
}

function Kpi({ label, value, sub, tone, to, title }: { label: string; value: string; sub: string; tone?: "good" | "bad"; to: string; title?: string }) {
  return (
    <Link to={to} title={title} className="min-w-0 rounded-[14px] border border-slate-200 bg-white p-3 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-4 sm:py-3.5">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-[19px] font-[750] tabular-nums tracking-tight text-slate-900 sm:text-[23px]">{value}</p>
      <p className={cn("mt-[3px] text-xs", tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-500")}>{sub}</p>
    </Link>
  );
}

function Shortcut({ icon: Icon, label, to, locked, lockedLabel }: { icon: LucideIcon; label: string; to: string; locked?: boolean; lockedLabel?: string }) {
  return (
    <Link
      to={to} title={locked ? lockedLabel : undefined}
      className="relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-1 py-2.5 text-center text-[11px] font-semibold leading-tight text-slate-900 transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0 sm:flex-row sm:justify-start sm:gap-2.5 sm:px-3.5 sm:py-3 sm:text-left sm:text-sm"
    >
      <Icon className={cn("h-5 w-5 shrink-0", locked ? "text-slate-400" : "text-blue-600")} aria-hidden="true" />
      <span className="min-w-0">{label}</span>
      {locked && <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-slate-400 sm:static sm:ml-auto sm:h-3.5 sm:w-3.5" aria-label={lockedLabel} />}
    </Link>
  );
}

const TONES: Record<Tone, string> = { info: "text-blue-600", bad: "text-red-600", warn: "text-amber-700", good: "text-emerald-600" };

function TaskRow({ task }: { task: Task }) {
  const Icon = task.icon;
  const a = task.action;
  const place = cn(BTN_SM, "col-start-2 justify-self-start sm:col-start-auto");
  const btn = a && (a.href
    ? <a href={a.href} onClick={a.onClick} className={place} {...(a.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{a.label}</a>
    : a.onClick
      ? <button type="button" onClick={a.onClick} className={place}>{a.label}</button>
      : <Link to={a.to ?? "/"} className={place}>{a.label}</Link>);
  return (
    <li className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl bg-slate-100 px-3 py-[11px] sm:grid-cols-[auto_minmax(0,1fr)_auto]", task.done && "opacity-55")}>
      <span className={cn("grid w-[22px] place-items-center", TONES[task.tone])}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <b className={cn("block text-sm font-[650] text-slate-900", task.done && "line-through")}>{task.title}</b>
        <span className="block text-xs text-slate-500">{task.text}</span>
      </div>
      {btn}
    </li>
  );
}

function ForecastCard({ next30, t, locale }: { next30: NonNullable<Overview["next30"]>; t: HomeCopy; locale: string }) {
  const SHOWN = 7;
  const shown = next30.items.slice(0, SHOWN);
  const more = next30.items.length - shown.length;
  const nameOf = (i: (typeof shown)[number]) => i.kind === "bill"
    ? (i.name || "—")
    : i.kind === "recurring" ? t.forecast.recurring(i.name || t.forecast.noClient) : t.forecast.invoice(i.name || t.forecast.noClient);
  const empty = next30.items.length === 0 && next30.habitual === 0;
  return (
    <section className={CARD} aria-labelledby="home-forecast">
      <h2 id="home-forecast" className={H3}>{t.forecast.title}</h2>
      {next30.balance !== null
        ? <p className="mt-1 text-[28px] font-extrabold tabular-nums tracking-tight text-slate-900">≈ {fmt0(next30.balance)}</p>
        : <Link to="/bank" className="mt-1 block text-sm font-medium text-blue-600 hover:underline">{t.forecast.noBank}</Link>}
      <div className="mt-1 flex flex-wrap gap-3.5 text-[13px] text-slate-500">
        <span>{t.forecast.in} <b className="tabular-nums text-slate-900">{fmt0(next30.inTotal)}</b></span>
        <span>{t.forecast.out} <b className="tabular-nums text-slate-900">{fmt0(next30.outTotal)}</b></span>
      </div>
      {empty ? <p className="mt-3 text-sm text-slate-500">{t.forecast.empty}</p> : (
        <ul className="mt-2.5">
          {shown.map((i, k) => (
            <FlowRow key={k} when={i.date ? shortDay(i.date, locale) : t.forecast.pending} what={nameOf(i)} amount={i.amount} dir={i.dir} first={k === 0} />
          ))}
          {more > 0 && <li className="border-t border-slate-200 py-2 text-xs text-slate-500">{t.forecast.more(more)}</li>}
          {next30.habitual > 0 && <FlowRow when={t.forecast.habitualWhen} what={t.forecast.habitual} amount={next30.habitual} dir="out" first={shown.length === 0} />}
        </ul>
      )}
      {next30.tip && (
        <p className="mt-3 flex items-start gap-2.5 rounded-[10px] bg-blue-50 px-3 py-2.5 text-[13px] text-slate-900">
          <Sparkles className="mt-px h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <span>{t.forecast.tip(next30.tip.customerName || t.forecast.noClient, fmt0(next30.tip.amount))}</span>
        </p>
      )}
    </section>
  );
}

function FlowRow({ when, what, amount, dir, first }: { when: string; what: string; amount: number; dir: "in" | "out"; first: boolean }) {
  return (
    <li className={cn("grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-2.5 py-[9px] text-sm", !first && "border-t border-slate-200")}>
      <span className="text-xs text-slate-500">{when}</span>
      <span className="min-w-0 break-words text-slate-900">{what}</span>
      <span className={cn("font-[650] tabular-nums", dir === "in" ? "text-emerald-600" : "text-slate-900")}>{dir === "in" ? "+" : "−"}{fmt0(amount)}</span>
    </li>
  );
}

/** Plans without bills or invoices: where the month's money went, by category. */
function MonthExpensesCard({ o, t, lang }: { o: Overview; t: HomeCopy; lang: Lang }) {
  const rows = o.expenses.byCategory.slice(0, 3);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <section className={CARD} aria-labelledby="home-month-exp">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="home-month-exp" className={H3}>{t.monthExpenses.title}</h2>
        <span className={cn(TAG, "tabular-nums")}>{fmt0(o.expenses.monthTotal)}</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-slate-500">{t.monthExpenses.none}</p> : (
        <div className="grid gap-2.5">
          {rows.map((r) => (
            <div key={r.category} className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-2.5 text-[13px] sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_80px] sm:text-sm">
              <span className="truncate text-slate-900">{categoryLabel(r.category, t, lang)}</span>
              <span className="h-2 rounded-full bg-slate-100"><span className="block h-2 rounded-full bg-blue-600" style={{ width: `${((r.total / max) * 100).toFixed(1)}%` }} /></span>
              <span className="text-right tabular-nums text-slate-900">{fmt0(r.total)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WeekCard({ o, t, locale }: { o: Overview; t: HomeCopy; locale: string }) {
  const days = o.week.days;
  const max = Math.max(1, ...days.map((d) => d.total));
  const best = days.reduce<(typeof days)[number] | null>((b, d) => (d.total > (b?.total ?? 0) ? d : b), null);
  const pct = o.week.changePct;
  return (
    <section className={CARD} aria-labelledby="home-week">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="home-week" className={H3}>{t.week.title}</h2>
        {pct !== null && (
          <span className={cn(TAG, "tabular-nums", Math.round(pct) >= 0 ? "border-transparent bg-emerald-50 text-emerald-600" : "border-transparent bg-red-50 text-red-600")}>
            {t.week.vs(signedPct(pct))}
          </span>
        )}
      </div>
      <p className="text-[28px] font-extrabold tabular-nums tracking-tight text-slate-900">{fmt0(o.week.total)}</p>
      <div
        className="mt-3 grid grid-cols-7 items-end gap-2" role="img"
        aria-label={best ? t.week.best(dayOf(best.date).toLocaleDateString(locale, { weekday: "long" }), fmt0(best.total)) : t.week.none}
      >
        {days.map((d, i) => (
          <div key={d.date} className="grid justify-items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-slate-500">{d.total ? fmt0(d.total) : "—"}</span>
            <i className={cn("block w-full max-w-[30px] rounded-[6px_6px_2px_2px]", i === days.length - 1 ? "bg-blue-600" : "bg-slate-300")} style={{ height: `${Math.max(4, Math.round((d.total / max) * 90))}px` }} />
            <span className="text-[11px] text-slate-500">{upperFirst(dayOf(d.date).toLocaleDateString(locale, { weekday: "short" }).replace(".", ""))}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function categoryLabel(category: string, t: HomeCopy, lang: Lang): string {
  return category === "vendors" ? t.insight.vendorsCategory : receiptCategoryLabel(receiptsCopy[lang], category);
}

function InsightCard({ o, t, lang, prevMonth }: { o: Overview; t: HomeCopy; lang: Lang; prevMonth: string }) {
  const i = o.insight;
  let text: ReactNode = t.insight.none;
  let link: { to: string; label: string } | null = null;
  if (i && i.kind !== "topClient") {
    const cat = lowerFirst(categoryLabel(i.category, t, lang));
    text = (
      <>
        {i.kind === "categoryUp" ? t.insight.up(i.pct, cat, prevMonth) : t.insight.top(cat, fmt0(i.current))}
        {i.merchant && (
          <>
            {" "}
            <span className="whitespace-nowrap">
              <MerchantLogo name={i.merchant} logoUrl={i.logoUrl} size={20} className="relative -top-px mr-1 inline-grid align-middle" />
              <b className="font-semibold">{i.merchant}</b>
            </span>
            {t.insight.merchant(fmt0(i.merchantTotal))}
          </>
        )}
      </>
    );
    link = i.category === "vendors" ? { to: "/vendors", label: t.insight.seeVendors } : { to: "/expenses", label: t.insight.seeExpenses };
  } else if (i) {
    text = t.insight.client(i.customer, fmt0(i.total), i.count);
    link = { to: "/customers", label: t.insight.seeClients };
  }
  return (
    <section className={CARD} aria-labelledby="home-insight">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="home-insight" className={H3}>{t.insight.title}</h2>
        <Sparkles className="h-[18px] w-[18px] text-slate-900" aria-hidden="true" />
      </div>
      <p className={cn("text-sm", i ? "text-slate-900" : "text-slate-500")}>{text}</p>
      {link && <div className="mt-3"><Link to={link.to} className={BTN_SM}>{link.label}</Link></div>}
    </section>
  );
}

// ── A team member's home (the accountant; employees are sent to Cobrar by the app shell) ──

const MEMBER_TILES: Record<Membership["role"], Array<{ path: string; icon: LucideIcon; feature?: Feature }>> = {
  accountant: [
    { path: "/transactions", icon: Inbox }, { path: "/quotes", icon: ClipboardList, feature: "quotes" }, { path: "/customers", icon: Users },
    { path: "/receipts", icon: Camera, feature: "receipts" }, { path: "/vendors", icon: Truck, feature: "vendors" }, { path: "/bank", icon: Landmark },
    { path: "/reports", icon: BarChart3 }, { path: "/accountant", icon: BookOpen, feature: "accountant" },
  ],
  staff: [{ path: "/pos", icon: ShoppingCart }, { path: "/customers", icon: Users }, { path: "/receipts", icon: Camera, feature: "receipts" }],
};

function MemberHome({ membership }: { membership: Membership }) {
  const t = useCopy(homeCopy);
  const shell = useCopy(appCopy).shell;
  const roles = useCopy(teamCopy).roles;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const accountant = membership.role === "accountant";
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 60_000 });
  const has = (f: Feature) => !!plan?.features.includes(f);
  // Staff can't read these (api/lib/team.ts); only the accountant asks.
  const { data: review, isLoading: reviewLoading } = trpc.review.count.useQuery(undefined, { enabled: accountant, staleTime: 60_000 });
  const today = useMemo(() => {
    const now = new Date();
    return { date: ymd(now), month: now.toLocaleDateString(locale, { month: "long" }) };
  }, [locale]);
  const overview = trpc.home.overview.useQuery({ today: today.date }, { enabled: accountant, staleTime: 60_000 });
  const business = overview.data?.businessName || membership.ownerName || "";
  const tiles = MEMBER_TILES[membership.role].filter((i) => !i.feature || has(i.feature));
  const n = review?.count ?? 0;
  const [movA, movB] = n > 0 ? t.member.movements(n, firstWord(membership.ownerName)) : t.member.bankClear;
  const [repA, repB] = has("accountant") ? t.member.reports(today.month) : t.member.reportsPlain(today.month);

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-[18px]">
          <h1 className="text-[20px] font-[750] tracking-tight text-slate-900 sm:text-[22px]">{t.hello(firstWord(membership.memberName))}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t.member.sub(business, roles[membership.role].name)}</p>
        </header>

        <section className={CARD} aria-labelledby="home-can">
          <h2 id="home-can" className={H3}>{t.member.canDo}</h2>
          <div className="mt-2.5 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {tiles.map(({ path, icon: Icon }) => (
              <Link key={path} to={path} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <Icon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
                <span className="min-w-0">
                  <b className="block text-sm font-semibold text-slate-900">{shell.labels[path]}</b>
                  <small className="block text-xs text-slate-500">{shell.desc[path]}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {accountant ? (
          <section className={cn(CARD, "mt-3.5")} aria-labelledby="home-month">
            <h2 id="home-month" className={H3}>{t.member.month}</h2>
            {reviewLoading ? <Skeleton className="mt-2.5 h-28 rounded-xl" /> : (
              <ul className="mt-2.5 grid gap-2">
                <TaskRow task={{ tone: n > 0 ? "info" : "good", icon: n > 0 ? Inbox : CheckCircle2, title: movA, text: movB, action: n > 0 ? { label: t.member.review, to: "/transactions" } : undefined }} />
                <TaskRow task={{ tone: "info", icon: BarChart3, title: upperFirst(repA), text: repB, action: { label: has("accountant") ? t.member.download : t.tasks.see, to: has("accountant") ? "/accountant" : "/reports" } }} />
              </ul>
            )}
          </section>
        ) : (
          <section className={cn(CARD, "mt-3.5")} aria-labelledby="home-member-today">
            <h2 id="home-member-today" className={H3}>{t.member.todayTitle}</h2>
            <div className="mt-2.5">
              <Link to="/pos" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />{t.charge}
              </Link>
            </div>
          </section>
        )}
      </div>
    </AnimatedPage>
  );
}

// ── Loading ──

function HomeSkeleton() {
  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-40" />
        <div className="mt-5"><OverviewSkeleton /></div>
      </div>
    </AnimatedPage>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-3.5 h-12 rounded-xl" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
        {[0, 1, 2, 3].map((k) => <Skeleton key={k} className="h-[92px] rounded-[14px]" />)}
      </div>
    </div>
  );
}
