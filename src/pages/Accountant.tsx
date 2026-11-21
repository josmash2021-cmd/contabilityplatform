// "Para tu contador" (business Pro and Negocio): the period's books in one page, with the same look and the same
// Exportar as Reportes (a real PDF and a styled Excel file, previewed first: src/lib/accountantExport.ts).
// Data: accountant.period (api/accountant-router.ts); rules: api/lib/accountant.ts.
// Team: the accountant role reads it like the owner (it's all queries).
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertCircle, Download, Lock } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PeriodPicker } from "@/components/accountant/PeriodPicker";
import { IncomeStatementCard } from "@/components/accountant/IncomeStatementCard";
import { DetailSections } from "@/components/accountant/DetailSections";
import { money } from "@/components/accountant/ui";
import { expenseCategoryLabel } from "@/components/accountant/labels";
import { Kpi } from "@/components/reports/SimpleView";
import { DrillDialog, type DrillTarget } from "@/components/reports/DrillDialog";
import { ExportDialog, type ExportDoc, type ExportTab } from "@/components/reports/ExportDialog";
import { BTN, BTN_PRIMARY, CARD } from "@/components/reports/ui";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { accountantCopy } from "@/i18n/copy/accountant";
import { receiptsCopy } from "@/i18n/copy/receipts";
import { reportesCopy } from "@/i18n/copy/reportes";
import { accountantDoc, formatPercent, formatPeriod } from "@/lib/accountantExport";
import {
  localIsoDate, rangeForPreset, rangeProblem, type DateRange, type PeriodPreset,
} from "../../api/lib/accountant";

/** FORBIDDEN means the plan lacks the feature: show the lock right away instead of retrying. */
const retryUnlessForbidden = (failureCount: number, error: { data?: { code?: string } | null }) =>
  error.data?.code !== "FORBIDDEN" && failureCount < 1;

export default function Accountant() {
  const c = useCopy(accountantCopy);
  const rc = useCopy(receiptsCopy);
  const rp = useCopy(reportesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);

  // Read the clock once: the device's day and UTC offset (sales are grouped by local day).
  const [clock] = useState(() => {
    const now = new Date();
    return { today: localIsoDate(now), tzOffsetHours: now.getTimezoneOffset() / -60, at: now };
  });
  const [preset, setPreset] = useState<PeriodPreset>("thisMonth");
  const [custom, setCustom] = useState<DateRange>(() => rangeForPreset("thisMonth", clock.today) ?? { startDate: clock.today, endDate: clock.today });
  const [exp, setExp] = useState<{ open: boolean; tab: ExportTab }>({ open: false, tab: "pdf" });
  const [drill, setDrill] = useState<DrillTarget | null>(null);

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
  // Same query (and cache) as the app layout: the business name for the files.
  const settingsQuery = trpc.settings.get.useQuery(undefined, { staleTime: Infinity });
  const s = settingsQuery.data;
  const company = s?.companyName?.trim() || c.title;
  const companyLine = [[s?.city, s?.state].filter(Boolean).join(", "), s?.phone].filter(Boolean).join(" · ") || null;

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

  const doc: ExportDoc | null = useMemo(
    () => (data && !stale ? accountantDoc({ data, c, rc, rp, company, companyLine, periodLabel, dataAsOf, locale }) : null),
    [data, stale, c, rc, rp, company, companyLine, periodLabel, dataAsOf, locale],
  );

  const locked = lacksFeature || periodQuery.error?.data?.code === "FORBIDDEN";
  if (locked) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <section className="mx-auto mt-6 grid max-w-md justify-items-start gap-1.5 rounded-[14px] border border-dashed border-slate-200 bg-slate-100 p-5">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{rp.views.lockedPro}</span>
          <h1 className="text-[15px] font-bold text-slate-900">{c.locked.title}</h1>
          <p className="mb-1 text-[13px] text-slate-500">{c.locked.text}</p>
          <Link to="/settings?sec=plan" className={BTN}>{c.locked.cta}</Link>
        </section>
      </AnimatedPage>
    );
  }

  let body: ReactNode = null;
  if (data) {
    const st = data.incomeStatement;
    const bank = data.bank;
    body = (
      <div className={cn("space-y-3.5 transition-opacity", stale && "opacity-60")} aria-busy={periodQuery.isFetching}>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={c.statement.title}>
          <Kpi label={c.stats.income} value={money(st.income)} line={c.ui.salesCount(st.salesCount)} good={null} />
          <Kpi label={c.stats.expenses} value={money(st.totalExpenses)} line={c.ui.expenseCount(st.expensesCount)} good={null} />
          <Kpi
            label={st.profit >= 0 ? c.stats.profit : c.ui.loss}
            value={money(st.profit)}
            accent={st.profit >= 0}
            good={st.profit >= 0 ? null : false}
            line={st.margin !== null ? c.stats.margin(formatPercent(st.margin, locale)) : c.ui.noMargin}
          />
          <Kpi label={c.stats.bank} value={`${bank.net > 0 ? "+" : ""}${money(bank.net)}`} line={c.ui.bankSub(money(bank.moneyIn), money(bank.moneyOut))} good={null} />
        </section>
        <IncomeStatementCard
          statement={st}
          bank={bank}
          periodLabel={periodLabel}
          onDrillIncome={() => setDrill({ kind: "income", key: "", label: rp.drill.allSales })}
          onDrillCategory={(category, label) => setDrill({ kind: "recorded", key: category, label })}
        />
        <DetailSections data={data} />
      </div>
    );
  } else if (periodQuery.error) {
    body = (
      <section className={cn(CARD, "text-center")}>
        <AlertCircle className="mx-auto h-6 w-6 text-red-600" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-slate-900" role="alert">{c.error}</p>
        <button type="button" className={cn(BTN, "mt-3")} onClick={() => void periodQuery.refetch()}>{c.retry}</button>
      </section>
    );
  } else if (range) {
    body = (
      <div className="space-y-3.5" role="status" aria-label={c.loading}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[106px] rounded-[14px]" />)}
        </div>
        <div className="grid gap-3.5 lg:grid-cols-3"><Skeleton className="h-72 rounded-[14px] lg:col-span-2" /><Skeleton className="h-48 rounded-[14px]" /></div>
      </div>
    );
  }

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-3.5">
        <header className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-[750] tracking-tight text-slate-900">{c.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{c.subtitle}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto">
            <button type="button" onClick={() => setExp({ open: true, tab: "xlsx" })} disabled={!canExport} className={BTN}>
              <Download className="h-4 w-4" aria-hidden="true" />{c.ui.exportExcel}
            </button>
            <button type="button" onClick={() => setExp({ open: true, tab: "pdf" })} disabled={!canExport} className={BTN_PRIMARY}>
              <Download className="h-4 w-4" aria-hidden="true" />{c.ui.exportPdf}
            </button>
          </div>
        </header>

        <section className={cn(CARD, "space-y-3")} aria-label={c.periodLabel}>
          <PeriodPicker preset={preset} onPreset={pickPreset} custom={custom} onCustom={setCustom} problem={problem} />
          {pickedLabel && (
            <p className="text-[13px] text-slate-500">
              <span className="font-semibold text-slate-900">{pickedLabel}</span>
              {dataAsOf && !stale && <span> · {c.dataAsOf(dataAsOf)}</span>}
              <span className="block sm:inline"><span className="hidden sm:inline"> · </span>{c.share}</span>
            </p>
          )}
        </section>

        {body}
      </div>

      {range && (
        <DrillDialog target={drill} onClose={() => setDrill(null)} range={data?.period ?? range} tzOffsetHours={clock.tzOffsetHours} periodLabel={periodLabel} locale={locale} catLabel={(k) => expenseCategoryLabel(k, c, rc)} c={rp} />
      )}
      <ExportDialog
        open={exp.open}
        onOpenChange={(o) => setExp((e) => ({ ...e, open: o }))}
        tab={exp.tab}
        onTab={(tab) => setExp((e) => ({ ...e, tab }))}
        title={c.ui.exportTitle(periodLabel)}
        doc={doc}
        loading={!doc && !periodQuery.error}
        error={!!periodQuery.error}
        onRetry={() => void periodQuery.refetch()}
        c={rp}
        generated={clock.at}
      />
    </AnimatedPage>
  );
}
