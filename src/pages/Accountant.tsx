// "Para tu contador" (business Pro and Negocio): the period's books in one page, as
// Excel (built in the browser) and as a printable PDF. Data: accountant.period
// (api/accountant-router.ts); rules and workbook shape: api/lib/accountant.ts.
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, DollarSign, FileSpreadsheet, Info, Landmark, Loader2, Lock, Printer, Receipt, TrendingDown, type LucideIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";
import { PeriodPicker } from "@/components/accountant/PeriodPicker";
import { IncomeStatementCard } from "@/components/accountant/IncomeStatementCard";
import { DetailSections } from "@/components/accountant/DetailSections";
import { AccountantPrint } from "@/components/accountant/AccountantPrint";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { accountantCopy } from "@/i18n/copy/accountant";
import { downloadAccountantWorkbook, formatPercent, formatPeriod } from "@/lib/accountantExport";
import {
  localIsoDate, rangeForPreset, rangeProblem, type DateRange, type PeriodPreset,
} from "../../api/lib/accountant";
import "@/styles/print.css";

const CARD = "border-neutral-200 rounded-xl shadow-none";

/** FORBIDDEN means the plan lacks the feature: show the lock right away instead of retrying. */
const retryUnlessForbidden = (failureCount: number, error: { data?: { code?: string } | null }) =>
  error.data?.code !== "FORBIDDEN" && failureCount < 1;

function StatTile({ label, value, detail, icon: Icon, color }: { label: string; value: string; detail?: string; icon: LucideIcon; color: string }) {
  return (
    <Card className={cn(CARD, "h-full")}>
      <CardContent className="flex h-full items-center gap-2.5 p-3">
        <div className={cn("shrink-0 rounded-lg p-2", color)}><Icon className="h-4 w-4" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-neutral-400">{label}</p>
          <p className="truncate text-base font-semibold tabular-nums text-black">{value}</p>
          {detail && <p className="truncate text-[10px] text-neutral-400">{detail}</p>}
        </div>
      </CardContent>
    </Card>
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
      <AnimatedPage className="p-4 lg:p-6">
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100"><Lock className="h-5 w-5 text-neutral-500" aria-hidden="true" /></span>
          <h1 className="mt-4 text-lg font-semibold text-black">{c.locked.title}</h1>
          <p className="mt-2 text-sm text-neutral-600">{c.locked.text}</p>
          <Button asChild className="mt-5 w-full bg-black text-white hover:bg-neutral-800">
            <Link to="/settings">{c.locked.cta}</Link>
          </Button>
        </div>
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
    body = (
      <div className={cn("space-y-5 transition-opacity", stale && "opacity-60")} aria-busy={periodQuery.isFetching}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: c.stats.income, value: formatCurrency(s.income), icon: Receipt, color: "bg-green-50 text-green-600" },
            { label: c.stats.expenses, value: formatCurrency(s.totalExpenses), icon: TrendingDown, color: "bg-red-50 text-red-500" },
            {
              label: c.stats.profit,
              value: formatCurrency(s.profit),
              detail: s.margin !== null ? c.stats.margin(formatPercent(s.margin, locale)) : undefined,
              icon: DollarSign,
              color: s.profit >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500",
            },
            { label: c.stats.bank, value: formatCurrency(data.bank.net), icon: Landmark, color: "bg-neutral-100 text-neutral-600" },
          ].map((tile, i) => (
            <AnimatedCard key={tile.label} delay={i * 60}>
              <StatTile {...tile} />
            </AnimatedCard>
          ))}
        </div>
        <IncomeStatementCard statement={s} bank={data.bank} periodLabel={periodLabel} />
        <DetailSections data={data} />
        <AccountantPrint data={data} company={company} periodLabel={periodLabel} dataAsOf={dataAsOf} />
      </div>
    );
  } else if (periodQuery.error) {
    body = (
      <Card className={CARD}>
        <CardContent className="py-10 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" aria-hidden="true" />
          <p className="text-sm font-medium text-black">{c.error}</p>
          <Button variant="outline" className="mt-4 rounded-xl text-xs" onClick={() => void periodQuery.refetch()}>{c.retry}</Button>
        </CardContent>
      </Card>
    );
  } else if (range) {
    body = (
      <Card className={CARD}>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {c.loading}
        </CardContent>
      </Card>
    );
  }

  return (
    <AnimatedPage className="mx-auto max-w-7xl space-y-5 p-4 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-black">{c.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{c.subtitle}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
          <Button
            type="button"
            onClick={() => void downloadExcel()}
            disabled={!canExport || exporting}
            className="h-10 rounded-xl bg-black text-white hover:bg-neutral-800"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
            {exporting ? c.excelBusy : c.excel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            disabled={!canExport}
            className="h-10 rounded-xl border-neutral-200"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {c.pdf}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <PeriodPicker preset={preset} onPreset={pickPreset} custom={custom} onCustom={setCustom} problem={problem} />
        {pickedLabel && (
          <p className="text-xs text-neutral-500">
            <span className="font-medium text-black">{pickedLabel}</span>
            {dataAsOf && !stale && <span> · {c.dataAsOf(dataAsOf)}</span>}
          </p>
        )}
      </div>

      <div className="flex gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
        <div className="space-y-1 text-sm text-neutral-600">
          <p>{c.share}</p>
          <p className="text-xs text-neutral-400">{c.pdfHint}</p>
        </div>
      </div>

      {body}
    </AnimatedPage>
  );
}
