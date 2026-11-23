// Admin · Pagos: what customers pay. The four numbers (this month, last month, monthly income, total), filters
// (Pagados, No pasaron, Regalados, A mano, Pruebas), the payments by month with where each came from (Stripe,
// A mano, Regalo, Prueba) and whether it went through. Only what the admin wrote down can be edited or deleted.
// Rule: api/lib/adminOverview.ts buildPayments. Words: src/i18n/copy/admin.ts (pay).
import { useMemo, useState } from "react";
import { Download, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { adminCopy } from "@/i18n/copy/admin";
import { intlLocale } from "@/i18n/lang";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/admin/adminUi";
import { fmtDay, fmtMoney, type AdminOut } from "@/components/admin/adminFormat";
import { AdminUserSheet } from "@/components/admin/AdminUserSheet";

type Row = AdminOut["payments"]["rows"][number];
type Filter = "all" | "paid" | "failed" | "gift" | "manual" | "test";
const FILTERS: Filter[] = ["all", "paid", "failed", "gift", "manual", "test"];
const card = "rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-20px_rgba(15,23,42,0.25)]";
const SRC: Record<Row["source"], string> = { stripe: "bg-indigo-50 text-indigo-800", manual: "bg-amber-50 text-amber-900", gift: "bg-violet-50 text-violet-700", test: "bg-slate-100 text-slate-600" };
const input = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

export default function AdminPayments() {
  const all = useCopy(adminCopy);
  const t = all.pay;
  const { lang } = useLang();
  const utils = trpc.useUtils();
  const { data } = trpc.admin.payments.useQuery(undefined, { refetchInterval: 20_000, refetchOnWindowFocus: true });
  const { data: people } = trpc.admin.listUsers.useQuery({ page: 1, limit: 100 });
  const [filter, setFilter] = useState<Filter>("all");
  const [month, setMonth] = useState<string>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [rec, setRec] = useState<null | { userId: string; amount: string; plan: "monthly" | "annual"; date: string }>(null);
  const [edit, setEdit] = useState<null | { id: number; amount: string; date: string }>(null);
  const [del, setDel] = useState<Row | null>(null);

  const refresh = () => Promise.all([utils.admin.payments.invalidate(), utils.admin.overview.invalidate(), utils.admin.userDetail.invalidate(), utils.admin.stats.invalidate(), utils.admin.listUsers.invalidate()]);
  const fail = () => toast.error(t.error);
  const record = trpc.admin.recordPayment.useMutation({ onSuccess: (r) => { if (r.success) { toast.success(t.recorded); setRec(null); void refresh(); } else fail(); }, onError: fail });
  const update = trpc.admin.updatePayment.useMutation({ onSuccess: (r) => { if (r.success) { toast.success(t.saved); setEdit(null); void refresh(); } else fail(); }, onError: fail });
  const remove = trpc.admin.deletePayment.useMutation({ onSuccess: (r) => { if (r.success) { toast.success(t.deleted); setDel(null); void refresh(); } else fail(); }, onError: fail });

  const monthName = (ym: string) => {
    const s = new Intl.DateTimeFormat(intlLocale(lang), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T12:00:00Z`));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const short = (iso: string) => new Intl.DateTimeFormat(intlLocale(lang), { day: "numeric", month: "short", timeZone: "America/Chicago" }).format(new Date(iso));
  const planText = (r: Row) => `${r.tier ? `${all.plan.tiers[r.tier]} · ` : ""}${all.plan[r.plan]}`;
  const status = (r: Row) => (r.source === "gift" ? { label: t.st.gift, cls: "bg-violet-50 text-violet-700" }
    : r.source === "test" ? { label: t.st.test, cls: "bg-slate-100 text-slate-600" }
    : r.status === "succeeded" ? { label: t.st.succeeded, cls: "bg-emerald-50 text-emerald-700" }
    : r.status === "failed" ? { label: t.st.failed, cls: "bg-red-50 text-red-700" } : { label: t.st.pending, cls: "bg-slate-100 text-slate-600" });
  const matches = (r: Row, f: Filter) => f === "all" || (f === "paid" ? r.counts : f === "failed" ? r.status === "failed" && r.source !== "test" : r.source === f);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const months = useMemo(() => [...new Set(rows.map((r) => r.month))], [rows]);
  const shown = rows.filter((r) => matches(r, filter) && (month === "all" || r.month === month)
    && (!q.trim() || `${r.name ?? ""} ${r.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const groups = months.map((m) => ({ m, rows: shown.filter((r) => r.month === m) })).filter((g) => g.rows.length);
  const m = data?.money;
  const nowMonth = today().slice(0, 7);
  const lastMonth = (() => { const [y, mo] = nowMonth.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; })();

  const excel = () => {
    const head = [t.cols.date, t.cols.person, "Email", t.cols.plan, t.cols.amount, t.cols.source, t.cols.status];
    const lines = shown.map((r) => [r.paidAt.slice(0, 10), r.name ?? "", r.email ?? "", planText(r), r.amount.toFixed(2), t.src[r.source], status(r).label]);
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `pagos-${today()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  // What a payment offers: ⋯ (Editar, Borrar) if written down by hand, else its Stripe receipt, else the person.
  const actions = (r: Row) => (
    r.editable ? (
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={t.more} className="grid h-9 w-9 place-items-center rounded-[10px] border border-slate-200 bg-white hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <MoreHorizontal className="h-4 w-4 text-slate-700" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
          <DropdownMenuItem className="h-9 rounded-lg" onSelect={() => setEdit({ id: r.id, amount: String(r.amount), date: r.paidAt.slice(0, 10) })}>{t.edit}</DropdownMenuItem>
          <DropdownMenuItem className="h-9 rounded-lg text-red-700 focus:text-red-700" onSelect={() => setDel(r)}>{t.del}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : r.receiptUrl && r.status === "succeeded" ? (
      <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-blue-700 hover:text-blue-800">{t.receipt}</a>
    ) : (
      <button type="button" onClick={() => setOpen(r.userId)} className="text-[13px] font-semibold text-blue-700 hover:text-blue-800">{t.card}</button>
    )
  );

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-5 px-4 py-6 sm:px-8 sm:py-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <h1 className="text-[26px] font-extrabold tracking-tight">{t.title}</h1>
          <p className="text-slate-500">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="sr-only" htmlFor="pay-month">{t.monthLabel}</label>
          <select id="pay-month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold">
            <option value="all">{t.allMonths}</option>
            {months.map((x) => <option key={x} value={x}>{monthName(x)}</option>)}
          </select>
          <button type="button" onClick={excel} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold hover:bg-slate-50"><Download className="h-4 w-4" aria-hidden="true" />{t.excel}</button>
          <button type="button" onClick={() => setRec({ userId: "", amount: "", plan: "monthly", date: today() })} className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" aria-hidden="true" />{t.record}</button>
        </div>
      </header>

      <section aria-label={t.kAria} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[
          [t.kThis, m ? fmtMoney(m.thisMonth, lang) : "…", m ? t.kThisSub(monthName(nowMonth), m.thisMonthCount) : ""],
          [t.kLast, m ? fmtMoney(m.lastMonth, lang) : "…", monthName(lastMonth)],
          [t.kMrr, m ? fmtMoney(m.mrr, lang) : "…", t.kMrrSub],
          [t.kTotal, m ? fmtMoney(m.total, lang) : "…", t.kTotalSub(m?.since ? fmtDay(m.since, lang, true) : "")],
        ].map(([label, value, sub]) => (
          <div key={label} className={cn(card, "grid gap-1.5 p-4 sm:p-5")}>
            <span className="text-[13px] font-semibold text-slate-600">{label}</span>
            <span className="text-[24px] font-extrabold leading-none tracking-tight sm:text-[30px]">{value}</span>
            <span className="text-xs text-slate-500">{sub}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t.filtersAria} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {FILTERS.filter((f) => f === "all" || (data?.counts[f] ?? 0) > 0).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={cn("h-9 shrink-0 rounded-[9px] px-3 text-[13px] transition-[background-color,color,box-shadow] duration-200", filter === f ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
              {t.filters[f]} <span className="font-medium text-slate-400">{data?.counts[f] ?? ""}</span>
            </button>
          ))}
        </div>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
          <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder={t.search} aria-label={t.search} className="w-[170px] bg-transparent text-sm outline-none" />
        </label>
      </div>

      <section className={cn(card, "px-3 pb-4 pt-1 sm:px-5")}>
        {/* Computers */}
        <div className="relative hidden overflow-x-auto sm:block">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[80px_2.1fr_1.3fr_0.9fr_1fr_1fr_110px] gap-3 px-2 pb-2.5 pt-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>{t.cols.date}</span><span>{t.cols.person}</span><span>{t.cols.plan}</span><span className="text-right">{t.cols.amount}</span><span>{t.cols.source}</span><span>{t.cols.status}</span><span />
            </div>
            {groups.map((g) => {
              const collected = g.rows.filter((r) => r.counts).reduce((n, r) => n + r.amount, 0);
              return (
                <div key={g.m}>
                  <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 px-2 pb-2 pt-3.5">
                    <b className="text-[15px]">{monthName(g.m)}</b>
                    <span className="text-[13px] text-slate-600">{t.monthSum(fmtMoney(collected, lang), g.rows.filter((r) => r.status === "failed" && r.source !== "test").length, g.rows.filter((r) => r.source === "gift").length)}</span>
                  </div>
                  {g.rows.map((r) => {
                    const st = status(r);
                    return (
                      <div key={r.id} data-pay={r.id} className="grid grid-cols-[80px_2.1fr_1.3fr_0.9fr_1fr_1fr_110px] items-center gap-3 border-b border-slate-100 px-2 py-2.5 last:border-0">
                        <span className="text-slate-600">{short(r.paidAt)}</span>
                        <button type="button" onClick={() => setOpen(r.userId)} className="flex min-w-0 items-center gap-2.5 text-left">
                          <Avatar name={r.name} email={r.email} />
                          <span className="grid min-w-0"><b className="truncate">{r.name || r.email}</b><span className="truncate text-xs text-slate-500">{r.email}</span></span>
                        </button>
                        <span className="text-slate-700">{planText(r)}</span>
                        <span className={cn("text-right font-bold", r.counts ? "text-slate-900" : "text-slate-400 line-through")}>{fmtMoney(r.amount, lang)}</span>
                        <span><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", SRC[r.source])}>{t.src[r.source]}</span></span>
                        <span><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", st.cls)}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{st.label}</span></span>
                        <span className="flex justify-end">{actions(r)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Phones */}
        <div className="grid gap-3 sm:hidden">
          {groups.map((g) => (
            <div key={g.m}>
              <div className="flex items-baseline justify-between px-1 pb-1.5 pt-3">
                <b>{monthName(g.m)}</b>
                <span className="text-xs text-slate-600">{fmtMoney(g.rows.filter((r) => r.counts).reduce((n, r) => n + r.amount, 0), lang)}</span>
              </div>
              {g.rows.map((r) => {
                const st = status(r);
                return (
                  <div key={r.id} data-pay={r.id} className="flex gap-3 border-t border-slate-100 px-1 py-3">
                    <button type="button" onClick={() => setOpen(r.userId)} aria-label={r.name || r.email || ""}><Avatar name={r.name} email={r.email} className="h-10 w-10" /></button>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => setOpen(r.userId)} className="truncate text-left font-bold">{r.name || r.email}</button>
                        <b className={cn("shrink-0", r.counts ? "text-slate-900" : "text-slate-400 line-through")}>{fmtMoney(r.amount, lang)}</b>
                      </div>
                      <span className="text-xs text-slate-500">{short(r.paidAt)} · {planText(r)}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", SRC[r.source])}>{t.src[r.source]}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span>
                        <span className="ml-auto">{actions(r)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {data && groups.length === 0 && <p className="px-2 py-10 text-center text-sm text-slate-500">{t.empty}</p>}
        <div className="grid gap-1 px-2 pt-3 text-xs text-slate-500">
          <p>{t.lockedNote}</p>
          {(data?.counts.test ?? 0) > 0 && <p>{t.testNote}</p>}
        </div>
      </section>

      {/* Record a payment (Zelle, cash, check) */}
      <Dialog open={!!rec} onOpenChange={(o) => { if (!o) setRec(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t.recTitle}</DialogTitle><DialogDescription>{t.recText}</DialogDescription></DialogHeader>
          {rec && (
            <div className="grid gap-3.5">
              <label className="grid gap-1.5 text-sm font-medium">{t.person}
                <select value={rec.userId} onChange={(e) => setRec({ ...rec, userId: e.target.value })} className={input}>
                  <option value="">{t.pick}</option>
                  {(people?.users ?? []).filter((u) => u.status.kind !== "admin").sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "")).map((u) => (
                    <option key={u.id} value={u.id}>{u.name || u.email}{u.name && u.email ? ` · ${u.email}` : ""}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-medium">{t.amount}<input type="number" inputMode="decimal" step="0.01" min="0" value={rec.amount} onChange={(e) => setRec({ ...rec, amount: e.target.value })} className={input} /></label>
                <label className="grid gap-1.5 text-sm font-medium">{t.plan}
                  <select value={rec.plan} onChange={(e) => setRec({ ...rec, plan: e.target.value as "monthly" | "annual" })} className={input}>
                    <option value="monthly">{t.monthly}</option><option value="annual">{t.annual}</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">{t.date}<input type="date" value={rec.date} onChange={(e) => setRec({ ...rec, date: e.target.value })} className={input} /></label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setRec(null)} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold">{t.cancel}</button>
            <button type="button" disabled={!rec || !rec.userId || !(Number(rec.amount) > 0) || record.isPending}
              onClick={() => rec && record.mutate({ userId: Number(rec.userId), amount: Number(rec.amount), plan: rec.plan, paidAt: rec.date })}
              className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50">{t.save}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit a payment written down by hand */}
      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t.editTitle}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm font-medium">{t.amount}<input type="number" inputMode="decimal" step="0.01" min="0" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} className={input} /></label>
              <label className="grid gap-1.5 text-sm font-medium">{t.date}<input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} className={input} /></label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setEdit(null)} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold">{t.cancel}</button>
            <button type="button" disabled={!edit || !(Number(edit.amount) > 0) || update.isPending}
              onClick={() => edit && update.mutate({ id: edit.id, amount: Number(edit.amount), paidAt: edit.date })}
              className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50">{t.save}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => { if (!o) setDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.delTitle}</AlertDialogTitle>
            <AlertDialogDescription>{del ? t.delText(`${del.name || del.email} · ${fmtMoney(del.amount, lang)} · ${fmtDay(del.paidAt, lang, true)}`) : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={(e) => { e.preventDefault(); if (del) remove.mutate({ id: del.id }); }}>{t.delYes}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminUserSheet userId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
