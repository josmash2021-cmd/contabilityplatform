// Reportes (business), as the 2.0 prototype's "reports" screen: the period button and the view switch
// (Simple, Para contador, Por cliente), the numbers against the previous period, 12 months of money in and out,
// what it went on and where it came from (tap a line for its movements), the month close card, and Exportar
// (a real PDF and Excel file, previewed first). Data: api/reports-router.ts; rules: api/lib/reportBooks.ts.
// Plans: Simple for every business plan; Para contador and the exports need Pro (accountant); Por cliente needs
// Negocio (clientReports). The server enforces both. Team: the accountant reads everything here (it's all queries);
// staff never reach this page (AppLayout).
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, Lock } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { reportesCopy } from "@/i18n/copy/reportes";
import { receiptsCopy } from "@/i18n/copy/receipts";
import { isOwed } from "../../api/lib/invoices";
import { daysBetween, localIso, reportPeriod } from "../../api/lib/reportBooks";
import { PeriodMenu, type PeriodSel } from "@/components/reports/PeriodMenu";
import { SimpleView } from "@/components/reports/SimpleView";
import { ProView, type ApItem, type ArItem, type ProTab } from "@/components/reports/ProView";
import { ClientView } from "@/components/reports/ClientView";
import { CloseCard } from "@/components/reports/CloseCard";
import { DrillDialog, type DrillTarget } from "@/components/reports/DrillDialog";
import { ExportDialog, type ExportDoc, type ExportTab } from "@/components/reports/ExportDialog";
import { fileBaseFor, pdfPages, xlsxSheets, type ExportModel } from "@/components/reports/export/model";
import { BTN, SEG, SEG_BTN, dayLabel, periodWords, spendLabel } from "@/components/reports/ui";

type View = "simple" | "pro" | "client";

export default function Reports() {
  const c = useCopy(reportesCopy);
  const rc = useCopy(receiptsCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  // The device's day and UTC offset, read once (sales are grouped by the local day).
  const [clock] = useState(() => {
    const now = new Date();
    return { today: localIso(now), tz: now.getTimezoneOffset() / -60, at: now };
  });
  const [view, setView] = useState<View>("simple");
  const [sel, setSel] = useState<PeriodSel>({ key: "month" });
  const [source, setSource] = useState<"svc" | "cli">("svc");
  const [proTab, setProTab] = useState<ProTab>("pl");
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const [exp, setExp] = useState<{ open: boolean; tab: ExportTab }>({ open: false, tab: "pdf" });

  const p = useMemo(() => reportPeriod(sel, clock.today), [sel, clock.today]);
  const words = periodWords(p, c);
  const catLabel = useMemo(() => (category: string) => spendLabel(category, rc, c), [rc, c]);
  const asOf = p.range.endDate < clock.today ? p.range.endDate : clock.today;

  // ── Plan, team role ──
  const plan = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const features = plan.data?.features ?? [];
  const canPro = features.includes("accountant");
  const canClients = features.includes("clientReports");
  const membership = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const isMember = !!membership.data;
  const shown: View = view === "pro" && !canPro ? "simple" : view === "client" && !canClients ? "simple" : view;

  // ── Data ──
  const live = { staleTime: 30_000, refetchOnWindowFocus: true, placeholderData: keepPreviousData };
  const overview = trpc.reports.overview.useQuery({ range: p.range, prev: p.prev, seriesEnd: p.seriesEnd, tzOffsetHours: clock.tz }, live);
  const close = trpc.reports.closeStatus.useQuery(undefined, { staleTime: 60_000 });
  const needPro = canPro && (shown === "pro" || exp.open);
  const pro = trpc.reports.pro.useQuery({ range: p.range, asOf }, { ...live, enabled: needPro, retry: 1 });
  const invoices = trpc.invoices.list.useQuery(undefined, { enabled: needPro, staleTime: 30_000, retry: 1 });
  const bills = trpc.vendors.bills.list.useQuery({ filter: "unpaid", limit: 500, today: clock.today }, { enabled: needPro, staleTime: 30_000, retry: 1 });
  const allExpenses = trpc.reports.drill.useQuery({ kind: "expenses", range: p.range, tzOffsetHours: clock.tz }, { enabled: canPro && exp.open, staleTime: 30_000, retry: 1 });
  const settings = trpc.settings.get.useQuery(undefined, { staleTime: Infinity });

  const ar: ArItem[] | undefined = useMemo(() => invoices.data?.items
    .filter((i) => isOwed(i.state) && i.balanceCents > 0)
    .map((i) => ({ ref: i.ref, number: i.number ?? "", client: i.customerName?.trim() || c.whence.noClient, issued: i.issueDate, due: i.dueDate, balance: i.balanceCents / 100 })), [invoices.data, c]);
  const ap: ApItem[] | undefined = useMemo(() => bills.data?.items
    .map((b) => ({ id: Number(b.id), vendor: b.vendorName, what: b.description, due: b.dueDate, amount: b.amount })), [bills.data]);

  // ── The export: one model, drawn as PDF pages and Excel sheets ──
  const company = settings.data?.companyName?.trim() || "";
  const model: ExportModel | null = useMemo(() => {
    const o = overview.data;
    if (!o || !pro.data || !ar || !ap || !allExpenses.data || overview.isPlaceholderData || pro.isPlaceholderData) return null;
    const s = settings.data;
    const place = [s?.city, s?.state].filter(Boolean).join(", ");
    const companyLine = [place, s?.phone].filter(Boolean).join(" · ") || null;
    const name = company || c.title;
    const expRows = allExpenses.data.rows as Array<{ date: string; title: string; category?: string; method: string | null; account?: string | null; source?: string; receipt?: boolean; amount: number }>;
    return {
      company: name,
      companyLine,
      periodLabel: words.label,
      vsLabel: words.vs,
      curCol: words.curCol,
      prevCol: words.prevCol,
      generatedOn: dayLabel(clock.today, locale),
      asOfLabel: dayLabel(asOf, locale),
      openingLabel: dayLabel(p.range.startDate, locale),
      fileBase: fileBaseFor(name, c.file.base, words.label),
      moneyIn: o.current.moneyIn,
      prevIn: o.previous.moneyIn,
      moneyOut: o.current.moneyOut,
      prevOut: o.previous.moneyOut,
      salesCount: o.current.salesCount,
      categories: o.categories.map((x) => ({ name: catLabel(x.category), total: x.total, prev: x.prevTotal })),
      booked: o.statement.booked.map((x) => ({ name: catLabel(x.category), total: x.total, prev: x.prevTotal })),
      unbookedBank: { total: o.statement.unbookedBank.total, prev: o.statement.unbookedBank.prevTotal },
      expenses: expRows.map((e) => ({
        date: e.date, description: e.title, category: catLabel(e.category ?? ""),
        paid: e.account ?? (e.method ? c.methods[e.method] ?? e.method : e.source === "bank" ? c.drill.bank : ""),
        receipt: e.source === "bank" ? null : !!e.receipt, amount: e.amount,
      })),
      services: o.services.map((x) => ({ name: x.name || c.whence.noService, total: x.total })),
      clients: o.clients ? o.clients.map((x) => ({ name: x.name || c.whence.noClient, total: x.total })) : null,
      balance: pro.data.balance,
      cashFlow: pro.data.cashFlow,
      ar: ar.map((a) => ({ number: a.number, client: a.client, issued: a.issued, due: a.due, late: a.due ? Math.max(0, daysBetween(a.due, clock.today)) : 0, balance: a.balance })),
      ap: ap.map((x) => ({ vendor: x.vendor, what: x.what, due: x.due, amount: x.amount, late: x.due < clock.today })),
    };
  }, [overview.data, overview.isPlaceholderData, pro.data, pro.isPlaceholderData, ar, ap, allExpenses.data, settings.data, company, words, clock.today, asOf, p.range.startDate, locale, c, catLabel]);
  const doc: ExportDoc | null = useMemo(() => (model ? {
    pages: pdfPages(model, c, (iso) => dayLabel(iso, locale)),
    sheets: xlsxSheets(model, c),
    fileBase: model.fileBase,
    pdfTitle: `${c.file.title} · ${model.periodLabel} · ${model.company}`,
    xlsxTitle: `${c.file.title} · ${model.periodLabel}`,
    author: model.company,
  } : null), [model, c, locale]);
  const exportError = !!(pro.error || invoices.error || bills.error || allExpenses.error || overview.error);
  const exportLoading = !exportError && !model;

  const utils = trpc.useUtils();
  const labels = { label: words.label, vs: words.vs, curCol: words.curCol, prevCol: words.prevCol, asOf: dayLabel(asOf, locale), opening: dayLabel(p.range.startDate, locale) };

  const viewBtn = (id: View, label: string) => (
    <button key={id} type="button" aria-pressed={shown === id} className={cn(SEG_BTN, "flex-1")} onClick={() => setView(id)}>{label}</button>
  );

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-3.5">
        <header className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[22px] font-[750] tracking-tight text-slate-900">{c.title}</h1>
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
            <PeriodMenu sel={sel} onSel={setSel} today={clock.today} c={c} />
            <div className={cn(SEG, "w-full sm:w-auto")} role="group" aria-label={c.views.label}>
              {viewBtn("simple", c.views.simple)}
              {canPro || plan.isLoading
                ? viewBtn("pro", c.views.pro)
                : <Link to="/settings?sec=plan" title={c.views.lockedPro} aria-label={`${c.views.pro} · ${c.views.lockedPro}`} className={cn(SEG_BTN, "flex-1")}><Lock className="h-[13px] w-[13px]" aria-hidden="true" />{c.views.pro}</Link>}
              {canClients && viewBtn("client", c.views.client)}
            </div>
          </div>
        </header>

        {overview.error && !overview.data ? (
          <div role="alert" className="flex flex-col gap-3 rounded-[14px] border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-900"><AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />{c.error.title}</p>
            <button type="button" className={BTN} onClick={() => void utils.reports.invalidate()}>{c.error.retry}</button>
          </div>
        ) : !overview.data ? (
          <div className="space-y-3.5" role="status" aria-label={c.export.loading}>
            <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[106px] rounded-[14px]" />)}</div>
            <Skeleton className="h-[260px] rounded-[14px]" />
            <div className="grid gap-3.5 md:grid-cols-2"><Skeleton className="h-64 rounded-[14px]" /><Skeleton className="h-64 rounded-[14px]" /></div>
          </div>
        ) : (
          <div className={cn("space-y-3.5 transition-opacity", overview.isPlaceholderData && "opacity-60")} aria-busy={overview.isFetching}>
            {shown === "simple" && (
              <SimpleView
                data={overview.data}
                highlight={p.highlight}
                vs={words.vs}
                today={clock.today}
                source={source}
                onSource={setSource}
                canClients={canClients}
                onDrill={setDrill}
                catLabel={catLabel}
                c={c}
              />
            )}
            {shown === "pro" && (
              <ProView
                tab={proTab}
                onTab={setProTab}
                overview={overview.data}
                pro={pro.data}
                proLoading={pro.isLoading}
                ar={ar}
                arLoading={invoices.isLoading}
                ap={ap}
                apLoading={bills.isLoading}
                range={p.range}
                labels={labels}
                today={clock.today}
                locale={locale}
                onDrill={setDrill}
                catLabel={catLabel}
                c={c}
              />
            )}
            {shown === "client" && <ClientView range={p.range} tzOffsetHours={clock.tz} onDrill={setDrill} c={c} />}
          </div>
        )}

        <CloseCard
          status={close.data}
          today={clock.today}
          locale={locale}
          canExport={canPro}
          canInvite={isMember ? null : features.includes("team")}
          inviteLockedLabel={c.views.lockedClient}
          onExport={(tab) => setExp({ open: true, tab })}
          c={c}
        />
      </div>

      <DrillDialog target={drill} onClose={() => setDrill(null)} range={p.range} tzOffsetHours={clock.tz} periodLabel={words.label} locale={locale} catLabel={catLabel} c={c} />
      <ExportDialog
        open={exp.open}
        onOpenChange={(o) => setExp((e) => ({ ...e, open: o }))}
        tab={exp.tab}
        onTab={(tab) => setExp((e) => ({ ...e, tab }))}
        title={c.export.title(words.label)}
        doc={doc}
        loading={exportLoading}
        error={exportError}
        onRetry={() => { void pro.refetch(); void invoices.refetch(); void bills.refetch(); void allExpenses.refetch(); }}
        c={c}
        generated={clock.at}
      />
    </AnimatedPage>
  );
}
