// "Para tu contador" (business Pro and Negocio): the period's books in one page, as
// Excel (built in the browser) and as a printable PDF. Data: accountant.period
// (api/accountant-router.ts); rules and workbook shape: api/lib/accountant.ts.
// Team: the accountant role reads it like the owner (it's all queries).
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle, ArrowDownLeft, FileSpreadsheet, Info, Landmark, Loader2, Lock, Printer, TrendingDown, TrendingUp, type LucideIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PeriodPicker } from "@/components/accountant/PeriodPicker";
import { IncomeStatementCard } from "@/components/accountant/IncomeStatementCard";
import { DetailSections } from "@/components/accountant/DetailSections";
import { AccountantPrint } from "@/components/accountant/AccountantPrint";
import { BTN, money } from "@/components/accountant/ui";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { accountantCopy } from "@/i18n/copy/accountant";
import { downloadAccountantWorkbook, formatPercent, formatPeriod } from "@/lib/accountantExport";
import {
  localIsoDate, rangeForPreset, rangeProblem, type DateRange, type PeriodPreset,
} from "../../api/lib/accountant";
import "@/styles/print.css";

/** FORBIDDEN means the plan lacks the feature: show the lock right away instead of retrying. */
const retryUnlessForbidden = (failureCount: number, error: { data?: { code?: string } | null }) =>
  error.data?.code !== "FORBIDDEN" && failureCount < 1;

type Tone = "good" | "bad" | "neutral";

/** One number of the period: what it is, the amount (signed when it can go below zero), and a line of context. */
function Kpi({ label, value, sub, icon: Icon, tone, iconTone }: { label: string; value: string; sub?: string; icon: LucideIcon; tone: Tone; iconTone: string }) {
  return (
    <div className="h-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", iconTone)} aria-hidden="true"><Icon className="h-3.5 w-3.5" /></span>
        <span className="truncate">{label}</span>
      </p>
      <p className={cn("mt-2 truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl", tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900")}>{value}</p>
      {sub && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function Accountant() {
  const c = useCopy(accountantCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);

  // Read the clock once: the device's day and UTC offset (sales are grouped by local day).
  const [clock] = useState(() => {
    const now = new Date();
    return { today: localIsoDate(now), tzOffsetHours: now.getTimezoneOffset() / -60 };
  });
  const [preset, setPreset] = useState<PeriodPreset>("thisMonth");
  const [custom, setCustom] = useState<DateRange>(() => rangeForPreset("thisMonth", clock.today) ?? { startDate: clock.today, endDate: clock.today });
  const [exporting, setExporting] = useState(false);

  const range = rangeForPreset(preset, clock.today, custom);
  const problem = preset === "custom" ? rangeProblem(custom) : null;
  // "Rango" starts from the period that was on screen, so it is easy to adjust.
  const pickPreset = (p: PeriodPreset) => {
    if (p === "custom" && preset !== "custom" && range) setCustom(range);
    setPreset(p);
  };

  const planQuery = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const lacksFeature = !!planQuery.data && !planQuery.data.features.includes("accountant");
  const periodQuery = trpc.accountant.period.useQuery(
    { startDate: range?.startDate ?? clock.today, endDate: range?.endDate ?? clock.today, tzOffsetHours: clock.tzOffsetHours },
    {
      enabled: !!range && !planQuery.isLoading && !lacksFeature,
      retry: retryUnlessForbidden,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  );
  // Same query (and cache) as the app layout: the company name for the PDF and the workbook.
  const settingsQuery = trpc.settings.get.useQuery(undefined, { staleTime: Infinity });
  const company = settingsQuery.data?.companyName?.trim() || null;

  const locked = lacksFeature || periodQuery.error?.data?.code === "FORBIDDEN";
  if (locked) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <section className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Lock className="h-6 w-6" aria-hidden="true" /></span>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{c.locked.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{c.locked.text}</p>
          <Link to="/settings" className={cn(BTN.primary, "mt-6 w-full")}>{c.locked.cta}</Link>
        </section>
      </AnimatedPage>
    );
  }

  const data = periodQuery.data;
  // The period picked (under the buttons) and the period of the numbers shown (cards, files):
  // they differ only for a moment while a new period loads.
  const pickedLabel = range ? formatPeriod(range, locale, c.range) : "";
  const periodLabel = data ? formatPeriod(data.period, locale, c.range) : pickedLabel;
  const dataAsOf = periodQuery.dataUpdatedAt
    ? new Date(periodQuery.dataUpdatedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
    : "";
  // While a new period loads (or the typed range is invalid) the previous numbers stay on screen, dimmed.
  const stale = periodQuery.isPlaceholderData || (preset === "custom" && problem !== null);
  const canExport = !!data && !stale;

  async function downloadExcel() {
    if (!data || exporting) return;
    setExporting(true);
    try {
      await downloadAccountantWorkbook({ data, copy: c, company, periodLabel, dataAsOf });
      toast.success(c.excelDone);
    } catch {
      toast.error(c.excelError);
    } finally {
      setExporting(false);
    }
  }

  let body: ReactNode = null;
  if (data) {
    const s = data.incomeStatement;
    const bank = data.bank;
    body = (
      <div className={cn("space-y-5 transition-opacity", stale && "opacity-60")} aria-busy={periodQuery.isFetching}>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={c.statement.title}>
          <Kpi label={c.stats.income} value={money(s.income)} sub={c.ui.salesCount(s.salesCount)} icon={ArrowDownLeft} tone="neutral" iconTone="bg-emerald-50 text-emerald-600" />
          <Kpi label={c.stats.expenses} value={money(s.totalExpenses)} sub={c.ui.expenseCount(s.expensesCount)} icon={TrendingDown} tone="neutral" iconTone="bg-red-50 text-red-600" />
          <Kpi
            label={s.profit >= 0 ? c.stats.profit : c.ui.loss}
            value={money(s.profit)}
            sub={s.margin !== null ? c.stats.margin(formatPercent(s.margin, locale)) : c.ui.noMargin}
            icon={s.profit >= 0 ? TrendingUp : TrendingDown}
            tone={s.profit >= 0 ? "good" : "bad"}
            iconTone={s.profit >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}
          />
          <Kpi
            label={c.stats.bank}
            value={bank.net > 0 ? `+${money(bank.net)}` : money(bank.net)}
            sub={c.ui.bankSub(money(bank.moneyIn), money(bank.moneyOut))}
            icon={Landmark}
            tone="neutral"
            iconTone="bg-blue-50 text-blue-600"
          />
        </section>
        <IncomeStatementCard statement={s} bank={bank} periodLabel={periodLabel} />
        <DetailSections data={data} />
        <AccountantPrint data={data} company={company} periodLabel={periodLabel} dataAsOf={dataAsOf} />
      </div>
    );
  } else if (periodQuery.error) {
    body = (
      <section className="rounded-2xl border border-red-200 bg-white p-5 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-red-600" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-slate-900" role="alert">{c.error}</p>
        <button type="button" className={cn(BTN.secondary, "mt-3")} onClick={() => void periodQuery.refetch()}>{c.retry}</button>
      </section>
    );
  } else if (range) {
    body = (
      <div className="space-y-5" role="status" aria-label={c.loading}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 rounded-2xl lg:col-span-2" /><Skeleton className="h-48 rounded-2xl" /></div>
      </div>
    );
  }

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{c.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{c.subtitle}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button type="button" onClick={() => window.print()} disabled={!canExport} className={BTN.secondary}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              {c.pdf}
            </button>
            <button type="button" onClick={() => void downloadExcel()} disabled={!canExport || exporting} className={BTN.primary}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
              {exporting ? c.excelBusy : c.excel}
            </button>
          </div>
        </header>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label={c.periodLabel}>
          <PeriodPicker preset={preset} onPreset={pickPreset} custom={custom} onCustom={setCustom} problem={problem} />
          {pickedLabel && (
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-900">{pickedLabel}</span>
              {dataAsOf && !stale && <span> · {c.dataAsOf(dataAsOf)}</span>}
            </p>
          )}
        </section>

        <div className="flex gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <div className="space-y-1">
            <p>{c.share}</p>
            <p className="text-xs text-blue-800">{c.pdfHint}</p>
          </div>
        </div>

        {body}
      </div>
    </AnimatedPage>
  );
}
