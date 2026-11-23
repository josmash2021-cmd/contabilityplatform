// Admin · Resumen: the four numbers that matter (monthly income, paying customers, free trials, new sign-ups),
// sign-ups and payments per week, what's for today (each with its button), the newest users and recent activity.
// Numbers: api/lib/adminOverview.ts (one rule per person, so they add up). Words: src/i18n/copy/admin.ts.
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, Clock, CreditCard, DollarSign, FileText, MessageCircle, Search, TrendingUp, UserPlus, Wrench, CheckCircle2, type LucideIcon } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { adminCopy } from "@/i18n/copy/admin";
import { taxesCopy } from "@/i18n/copy/taxes";
import { intlLocale } from "@/i18n/lang";
import { cn } from "@/lib/utils";
import { fmtMoney, timeAgo, type AdminOut } from "@/components/admin/adminFormat";
import { AdminUserList } from "@/components/admin/AdminUserList";
import { AdminUserSheet } from "@/components/admin/AdminUserSheet";

const card = "rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-20px_rgba(15,23,42,0.25)]";

function Kpi({ icon: Icon, tone, label, value, line, lineTone = "green", sub }: {
  icon: LucideIcon; tone: string; label: string; value: string; line: ReactNode; lineTone?: "green" | "amber" | "gray"; sub: string;
}) {
  return (
    <div className={cn(card, "grid gap-2 p-5")}>
      <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
        <span className={cn("grid h-[30px] w-[30px] place-items-center rounded-[9px]", tone)}><Icon className="h-4 w-4" aria-hidden="true" /></span>{label}
      </span>
      <span className="text-[32px] font-extrabold leading-none tracking-tight text-slate-900">{value}</span>
      <span className={cn("flex items-center gap-1.5 text-[13px] font-semibold", lineTone === "green" ? "text-emerald-700" : lineTone === "amber" ? "text-amber-700" : "text-slate-500")}>
        {lineTone === "green" && <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}{line}
      </span>
      <span className="text-xs text-slate-500">{sub}</span>
    </div>
  );
}

function TodayRow({ icon: Icon, tone, title, sub, action, to, danger, primary }: { icon: LucideIcon; tone: string; title: string; sub: string; action: string; to?: string; danger?: boolean; primary?: boolean }) {
  const body = (
    <>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px]", danger ? "bg-white text-red-700" : tone)}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
      <span className="grid min-w-0 flex-1"><b className="text-sm text-slate-900">{title}</b><span className={cn("truncate text-xs", danger ? "text-red-900/80" : "text-slate-500")}>{sub}</span></span>
      <span className={cn("inline-flex h-9 shrink-0 items-center rounded-[10px] px-3.5 text-[13px] font-semibold",
        danger ? "border border-red-200 bg-white text-red-800" : primary ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-900")}>{action}</span>
    </>
  );
  return to
    ? <Link to={to} className={cn("flex items-center gap-3 rounded-[14px] p-3 transition-colors", danger ? "bg-red-50 hover:bg-red-100/70" : "bg-slate-50 hover:bg-slate-100")}>{body}</Link>
    : <div className={cn("flex items-center gap-3 rounded-[14px] p-3", danger ? "bg-red-50" : "bg-slate-50")}>{body}</div>;
}

const ACT_DOT: Record<string, string> = { signup: "bg-blue-600", payment: "bg-emerald-500", paymentFailed: "bg-red-600", taxSent: "bg-violet-600", canceled: "bg-slate-400", trialStarted: "bg-blue-600" };

export default function AdminHome() {
  const t = useCopy(adminCopy);
  const steps = useCopy(taxesCopy).stepsShort;
  const { lang } = useLang();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const live = { refetchInterval: 15_000, refetchOnWindowFocus: true } as const;
  const { data: o } = trpc.admin.overview.useQuery(undefined, live);
  const { data: list } = trpc.admin.listUsers.useQuery({ page: 1, limit: 8 }, live);
  // Customers only: the admins aren't part of the business.
  const newest = (list?.users ?? []).filter((u) => u.status.kind !== "admin").slice(0, 7);

  const today = new Intl.DateTimeFormat(intlLocale(lang), { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }).format(new Date());
  const shortDay = (d: string) => new Intl.DateTimeFormat(intlLocale(lang), { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const search = (e: FormEvent) => { e.preventDefault(); navigate(q.trim() ? `/admin/usuarios?q=${encodeURIComponent(q.trim())}` : "/admin/usuarios"); };

  const weeks = o?.weeks ?? [];
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.signups, w.payments)));
  const best = weeks.reduce<AdminOut["overview"]["weeks"][number] | null>((b, w) => (w.signups > 0 && (!b || w.signups > b.signups) ? w : b), null);
  const td = o?.today;
  const pendingCount = td ? (td.support.chats ? 1 : 0) + (td.tax.count ? 1 : 0) + (td.trialsEnding.length ? 1 : 0) + (td.failed.length ? 1 : 0) : 0;
  const names = (xs: { name: string | null; email?: string | null }[]) => xs.slice(0, 3).map((x) => x.name || x.email || "—").join(" · ");

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 py-6 sm:px-8 sm:py-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <h1 className="text-[26px] font-extrabold tracking-tight">{t.home.title}</h1>
          <p className="text-slate-500">{t.home.subtitle(today.charAt(0).toUpperCase() + today.slice(1))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <form onSubmit={search} role="search" className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15">
            <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder={t.home.search} aria-label={t.home.search} className="w-[180px] bg-transparent sm:w-[220px] text-sm outline-none placeholder:text-slate-400" />
          </form>
          <Link to="/admin/sistema" className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold hover:bg-slate-50">
            <Wrench className="h-4 w-4" aria-hidden="true" />{t.home.maintenance}
            <span aria-hidden className={cn("relative inline-block h-5 w-9 rounded-full transition-colors", o?.system.maintenance ? "bg-amber-500" : "bg-slate-300")}>
              <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]", o?.system.maintenance ? "left-[18px]" : "left-0.5")} />
            </span>
            <span className="font-medium text-slate-500">{o?.system.maintenance ? t.home.on : t.home.off}</span>
          </Link>
        </div>
      </header>

      {/* The four numbers */}
      <section aria-label={t.home.kpiAria} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={DollarSign} tone="bg-emerald-50 text-emerald-700" label={t.home.mrr} value={o ? fmtMoney(o.money.mrr, lang) : "…"}
          line={o ? t.home.collected(fmtMoney(o.money.collectedThisMonth, lang), fmtMoney(o.money.collectedLastMonth, lang)) : ""} lineTone="gray" sub={t.home.mrrSub} />
        <Kpi icon={CreditCard} tone="bg-blue-50 text-blue-700" label={t.home.paying} value={o ? String(o.paying.count) : "…"}
          line={o ? t.home.payingNew(o.paying.newThisMonth) : ""} lineTone={o?.paying.newThisMonth ? "green" : "gray"}
          sub={o ? t.home.payingSplit(o.paying.monthly, o.paying.annual, o.paying.canceledThisMonth, o.paying.gifts) : ""} />
        <Kpi icon={Clock} tone="bg-amber-50 text-amber-700" label={t.home.trials} value={o ? String(o.trials.count) : "…"}
          line={o ? t.home.trialsSoon(o.trials.endingSoon.length) : ""} lineTone={o?.trials.endingSoon.length ? "amber" : "gray"}
          sub={o ? t.home.trialsConv(o.trials.ended, o.trials.paidAfter) : ""} />
        <Kpi icon={UserPlus} tone="bg-slate-100 text-slate-700" label={t.home.signups} value={o ? String(o.signups.thisWeek) : "…"}
          line={o ? t.home.signupsWeek(o.signups.lastWeek) : ""} lineTone={o && o.signups.thisWeek > o.signups.lastWeek ? "green" : "gray"}
          sub={o ? t.home.signupsSplit(o.signups.business, o.signups.personal) : ""} />
      </section>

      <div className="flex flex-wrap gap-4">
        {/* Sign-ups and payments per week */}
        <section aria-label={t.home.chart} className={cn(card, "grid min-w-0 flex-[2_1_520px] gap-4 p-5 sm:px-6")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">{t.home.chart}</h2>
            <div className="flex gap-4 text-[13px] text-slate-600">
              <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-blue-600" />{t.home.chartSignups}</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-emerald-400" />{t.home.chartPayments}</span>
            </div>
          </div>
          <div className="grid grid-cols-12 items-end gap-1.5 border-b border-slate-200 px-1 sm:gap-2.5" style={{ height: 180 }}>
            {weeks.map((w) => (
              <div key={w.start} role="img" aria-label={t.home.chartBar(shortDay(w.start), w.signups, w.payments)} className="flex h-full items-end justify-center gap-[3px]">
                <span className="w-2.5 rounded-t-[4px] bg-blue-600 transition-[height] duration-700 sm:w-3" style={{ height: Math.max(2, (w.signups / max) * 160) }} />
                <span className="w-2.5 rounded-t-[4px] bg-emerald-400 transition-[height] duration-700 sm:w-3" style={{ height: Math.max(2, (w.payments / max) * 160) }} />
              </div>
            ))}
          </div>
          <div className="-mt-2 grid grid-cols-4 px-1">
            {weeks.filter((_, i) => i % 3 === 0).map((w) => <span key={w.start} className="truncate text-[11px] text-slate-500">{shortDay(w.start)}</span>)}
          </div>
          <p className="text-[13px] text-slate-600">{t.home.chartNote(best ? shortDay(best.start) : "")}</p>
        </section>

        {/* For today */}
        <section aria-label={t.home.today} className={cn(card, "grid min-w-0 flex-[1_1_320px] content-start gap-3 p-5")}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{t.home.today}</h2>
            {pendingCount > 0 && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">{t.home.pending(pendingCount)}</span>}
          </div>
          {td && pendingCount === 0 && (
            <div className="grid justify-items-center gap-2 rounded-[14px] bg-emerald-50/60 px-4 py-6 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
              <b>{t.home.allClear}</b><span className="text-[13px] text-slate-600">{t.home.allClearText}</span>
            </div>
          )}
          {td && td.support.chats > 0 && (
            <TodayRow icon={MessageCircle} tone="bg-blue-50 text-blue-700" title={t.home.chats(td.support.chats)} sub={td.support.oldestAt ? t.home.chatsOldest(timeAgo(td.support.oldestAt, lang, t)) : ""} action={t.home.reply} to="/admin/soporte" primary />
          )}
          {td && td.tax.count > 0 && td.tax.first && (
            <TodayRow icon={FileText} tone="bg-blue-50 text-blue-700" title={t.home.taxWaiting(td.tax.count)} sub={t.home.taxFirst(td.tax.first.name || "—", steps[td.tax.first.step] ?? "")} action={t.home.open} to={`/admin/impuestos/${td.tax.first.id}`} />
          )}
          {td && td.trialsEnding.length > 0 && (
            <TodayRow icon={Clock} tone="bg-amber-50 text-amber-700" title={t.home.trialsEnding(td.trialsEnding.length)} sub={names(td.trialsEnding)} action={t.home.see} to="/admin/usuarios?estado=trial" />
          )}
          {td && td.failed.length > 0 && (
            <TodayRow icon={AlertTriangle} tone="" danger title={t.home.failed(td.failed.length)} sub={t.home.failedWho(names(td.failed), fmtMoney(td.failed[0].amount, lang))} action={t.home.see} to="/admin/usuarios?estado=failed" />
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* The newest users */}
        <section aria-label={t.home.users} className={cn(card, "grid min-w-0 flex-[2_1_560px] grid-cols-1 content-start gap-3.5 p-5 sm:px-6")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid"><h2 className="text-base font-bold">{t.home.users}</h2><span className="text-xs text-slate-500">{t.home.usersSub(o?.signups.total ?? list?.pagination.total ?? 0)}</span></div>
            <Link to="/admin/usuarios" className="inline-flex h-10 items-center rounded-[10px] border border-slate-200 px-3.5 text-[13px] font-semibold hover:bg-slate-50">{t.home.seeAll}</Link>
          </div>
          <AdminUserList users={newest} onOpen={setOpen} t={t} lang={lang} />
        </section>

        {/* Recent activity */}
        <section aria-label={t.home.activity} className={cn(card, "grid min-w-0 flex-[1_1_320px] content-start gap-1 p-5")}>
          <h2 className="mb-2 text-base font-bold">{t.home.activity}</h2>
          {o && o.activity.length === 0 && <p className="text-sm text-slate-500">{t.home.noActivity}</p>}
          {o?.activity.slice(0, 8).map((a, i) => {
            const amount = a.amount != null ? fmtMoney(a.amount, lang) : "";
            const what = a.kind === "signup" ? t.home.act.signup(t.kind[a.mode]) : a.kind === "payment" ? t.home.act.payment(amount, a.plan ? t.plan[a.plan] : "")
              : a.kind === "paymentFailed" ? t.home.act.paymentFailed(amount) : t.home.act[a.kind];
            return (
              <button key={`${a.kind}-${a.userId}-${a.at}-${i}`} type="button" onClick={() => setOpen(a.userId)} className="flex gap-3 border-b border-slate-100 py-2.5 text-left last:border-0 hover:bg-slate-50/60">
                <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", ACT_DOT[a.kind])} />
                <span className="grid min-w-0"><span className="text-sm"><b>{a.name || "—"}</b> {what}</span><span className="text-xs text-slate-500">{timeAgo(a.at, lang, t)}</span></span>
              </button>
            );
          })}
        </section>
      </div>

      <AdminUserSheet userId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
