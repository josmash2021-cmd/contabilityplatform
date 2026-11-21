import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, Lock } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { bankCopy } from "@/i18n/copy/bank";
import { reportesCopy } from "@/i18n/copy/reportes";
import { nextSort, rangeForPeriod, type SortState } from "../../api/lib/clientReports";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { SummaryRow } from "@/components/reports/SummaryRow";
import { MoneyChart, type DayDatum } from "@/components/reports/MoneyChart";
import { IncomeStatement, PaymentMethods } from "@/components/reports/IncomeStatement";
import { SalesByMonth, SalesList } from "@/components/reports/SalesList";
import { BalanceSheet, BankCard } from "@/components/reports/BalanceSheet";
import { JournalList } from "@/components/reports/JournalList";
import { ClientServiceReports, type ClientSortKey, type ServiceSortKey } from "@/components/reports/ClientServiceReports";
import {
  fromYmd, monthRange, num, upperFirst, ymd,
  type BankAccountRow, type JournalEntry, type MonthTotals, type Period, type SaleRow,
} from "@/components/reports/format";

type Tab = "income" | "sales" | "client" | "service" | "balance" | "journal";
const TABS: Tab[] = ["income", "sales", "client", "service", "balance", "journal"];
/** dashboard.monthly sends at most this many sales per month. */
const MONTH_SALES_LIMIT = 50;

/** The user's own dates (the server clock may already be "tomorrow"), computed once per visit. */
function localDates() {
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return {
    todayDate: ymd(now),
    weekStartDate: ymd(weekStart),
    monthStartDate: `${ymd(now).slice(0, 8)}01`,
    tzOffsetHours: now.getTimezoneOffset() / -60,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    weekStartYear: weekStart.getFullYear(),
    weekStartMonth: weekStart.getMonth() + 1,
  };
}

export default function Reports() {
  const t = useCopy(reportesCopy);
  const months = useCopy(bankCopy).months;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const now = useMemo(() => localDates(), []);

  const [period, setPeriod] = useState<Period>("month");
  const [selectedMonth, setSelectedMonth] = useState<number>(now.month);
  const [selectedYear, setSelectedYear] = useState<number>(now.year);
  const [tab, setTab] = useState<Tab>("income");
  const [clientSort, setClientSort] = useState<SortState<ClientSortKey>>({ key: "total", dir: "desc" });
  const [serviceSort, setServiceSort] = useState<SortState<ServiceSortKey>>({ key: "revenue", dir: "desc" });

  // Everything below the picker uses this range. Month-based pieces (daily chart, payment methods,
  // the sales list, bank activity) show the picked month in Mes, and the current month in Hoy / Semana.
  const range = rangeForPeriod(period, now, selectedYear, selectedMonth);
  const focus = period === "month" ? { year: selectedYear, month: selectedMonth } : { year: now.year, month: now.month };
  const weekCrossesMonth = now.weekStartMonth !== now.month || now.weekStartYear !== now.year;

  // ── Queries ──
  const live = { staleTime: 0, refetchOnWindowFocus: true, placeholderData: keepPreviousData };
  // Income statement for the exact range of the period (Hoy and Semana included, so expenses and
  // profit are real there too; a past year covers all of it).
  const incomeQuery = trpc.reports.incomeStatement.useQuery({ tzOffsetHours: now.tzOffsetHours, ...range }, live);
  // Año: one income statement per month for the chart; together they add up to the year above.
  const yearQueries = trpc.useQueries((q) =>
    Array.from({ length: 12 }, (_, i) =>
      q.reports.incomeStatement({ tzOffsetHours: now.tzOffsetHours, ...monthRange(selectedYear, i + 1) }, { ...live, enabled: period === "year" })),
  );
  const balanceQuery = trpc.reports.balanceSheet.useQuery();
  const journalQuery = trpc.reports.journalEntries.useQuery({ limit: 100 });
  const salesQuery = trpc.sales.stats.useQuery({
    todayDate: now.todayDate, weekStartDate: now.weekStartDate, monthStartDate: now.monthStartDate, tzOffsetHours: now.tzOffsetHours,
  });
  const monthlyQuery = trpc.dashboard.monthly.useQuery(focus, { enabled: period !== "year", placeholderData: keepPreviousData });
  const prevMonthQuery = trpc.dashboard.monthly.useQuery(
    { year: now.weekStartYear, month: now.weekStartMonth },
    { enabled: period === "week" && weekCrossesMonth },
  );
  const planQuery = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const bankConnectionQuery = trpc.bank.checkConnection.useQuery();
  const plaidAccountsQuery = trpc.bank.getAllPlaidAccounts.useQuery(undefined, { retry: false });
  const dbAccountsQuery = trpc.bank.listAccounts.useQuery(undefined, { retry: false });
  const hasBank = bankConnectionQuery.data?.hasBank === true;
  const bankMonthQuery = trpc.bank.getMonthData.useQuery({ year: focus.year, month: focus.month }, { enabled: hasBank });
  const bankBalanceQuery = trpc.bank.getLiveBalance.useQuery(undefined, { enabled: hasBank });
  const utils = trpc.useUtils();

  // ── Derived ──
  const income = incomeQuery.data;
  const moneyIn = num(income?.breakdown.salesRevenue);
  const moneyOut = num(income?.businessExpenses);
  const monthly = monthlyQuery.data;
  const salesCount = period === "today" ? num(salesQuery.data?.today.count)
    : period === "week" ? num(salesQuery.data?.week.count)
    : period === "month" && monthly && !monthlyQuery.isPlaceholderData ? num(monthly.totalSalesCount)
    : null;

  // Bank accounts: Plaid's list with the database ids and balances when it answers, else the database's.
  const plaidAccounts = (plaidAccountsQuery.data?.accounts ?? []) as BankAccountRow[];
  const dbAccounts = (dbAccountsQuery.data ?? []) as BankAccountRow[];
  const bankAccounts: BankAccountRow[] = plaidAccounts.length > 0
    ? plaidAccounts.map((pa) => {
        const match = dbAccounts.find((d) => d.plaidAccountId === pa.plaidAccountId);
        return match ? { ...pa, id: match.id, currentBalance: match.currentBalance } : pa;
      })
    : dbAccounts;
  const bankBalance = num(bankBalanceQuery.data?.liveBalance ?? bankMonthQuery.data?.liveBalance);
  const bankName = bankBalanceQuery.data?.bankName ?? bankAccounts[0]?.bankName ?? "";
  const bankCount = bankAccounts.length || num(bankBalanceQuery.data?.accountCount);

  // Words for the period
  const dayLong = (d: Date) => d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const rangeWords = (a: Date, b: Date) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).formatRange(a, b);
  const monthName = (y: number, m: number) => new Date(y, m - 1, 15).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const coverage = period === "today" ? t.period.today(dayLong(fromYmd(now.todayDate)))
    : period === "week" ? t.period.lastWeek(rangeWords(fromYmd(now.weekStartDate), fromYmd(now.todayDate)))
    : period === "month" ? t.period.covers(rangeWords(fromYmd(range.startDate), fromYmd(range.endDate)))
    : selectedYear === now.year ? t.period.yearToDate(selectedYear) : t.period.fullYear(selectedYear);
  const periodShort = period === "today" ? t.period.options.today
    : period === "week" ? t.chart.highlight.week
    : period === "month" ? upperFirst(monthName(selectedYear, selectedMonth))
    : String(selectedYear);
  const focusMonthName = monthName(focus.year, focus.month);

  // Daily chart (Hoy / Semana / Mes)
  const days: DayDatum[] = (monthly?.dailySales ?? []).map((d) => {
    const date = new Date(focus.year, focus.month - 1, d.day);
    const key = ymd(date);
    const on = period === "today" ? key === now.todayDate : period === "week" ? key >= now.weekStartDate && key <= now.todayDate : true;
    return { day: d.day, long: date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }), total: num(d.total), count: num(d.count), on };
  });
  const clockNote = period === "month" && !!monthly && !!income && !monthlyQuery.isPlaceholderData && !incomeQuery.isPlaceholderData
    && Math.abs(num(monthly.totalSales) - moneyIn) > 0.009;

  // Year chart (Año)
  const lastMonth = selectedYear === now.year ? now.month : selectedYear > now.year ? 0 : 12;
  const yearMonths: MonthTotals[] = yearQueries.map((q, i) => {
    const inn = num(q.data?.breakdown.salesRevenue);
    const out = num(q.data?.businessExpenses);
    const date = new Date(selectedYear, i, 15);
    return {
      month: i + 1,
      label: date.toLocaleDateString(locale, { month: "short" }).replace(".", "").slice(0, 3),
      long: date.toLocaleDateString(locale, { month: "long" }),
      in: inn,
      out,
      net: inn - out,
    };
  });
  const yearLoading = yearQueries.some((q) => q.isLoading);
  const yearStale = yearQueries.some((q) => q.isPlaceholderData);

  // Sales list: the month's sales, cut to Hoy / Semana. Semana can start in the previous month.
  const monthSales = (monthly?.recentSales ?? []) as SaleRow[];
  const prevSales = period === "week" && weekCrossesMonth ? ((prevMonthQuery.data?.recentSales ?? []) as SaleRow[]) : [];
  const listSales = [...monthSales, ...prevSales]
    .filter((s) => {
      if (period === "month") return true;
      const key = ymd(new Date(s.createdAt));
      return period === "today" ? key === now.todayDate : key >= now.weekStartDate && key <= now.todayDate;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const listCapped = monthSales.length >= MONTH_SALES_LIMIT || prevSales.length >= MONTH_SALES_LIMIT ? MONTH_SALES_LIMIT : null;

  const lacksClientReports = !!planQuery.data && !planQuery.data.features.includes("clientReports");
  const years = Array.from({ length: 5 }, (_, i) => now.year - i);
  const monthOptions = months.map((label, i) => ({ value: i + 1, label }));
  const tabLabel: Record<Tab, string> = {
    income: t.tabs.income, sales: t.tabs.sales, client: t.tabs.client, service: t.tabs.service, balance: t.tabs.balance, journal: t.tabs.journal,
  };

  const failed = [
    incomeQuery.error && t.error.parts.income,
    balanceQuery.error && t.error.parts.balance,
    salesQuery.error && t.error.parts.sales,
  ].filter(Boolean) as string[];

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
        </header>

        <PeriodPicker
          period={period}
          onPeriod={setPeriod}
          month={selectedMonth}
          onMonth={setSelectedMonth}
          year={selectedYear}
          onYear={setSelectedYear}
          months={monthOptions}
          years={years}
          coverage={coverage}
        />

        {failed.length > 0 && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-red-900">{t.error.title}</p>
                <p className="text-xs text-red-800">{failed.join(" · ")}</p>
              </div>
            </div>
            <button type="button" onClick={() => void utils.invalidate()} className="inline-flex h-11 items-center justify-center rounded-[10px] border border-red-200 bg-white px-4 text-sm font-semibold text-red-800 hover:bg-red-50 sm:h-10">
              {t.error.retry}
            </button>
          </div>
        )}

        <SummaryRow
          loading={incomeQuery.isLoading}
          stale={incomeQuery.isPlaceholderData}
          moneyIn={moneyIn}
          moneyOut={moneyOut}
          salesCount={salesCount}
          bank={{ connected: hasBank, loading: bankConnectionQuery.isLoading || (hasBank && bankBalanceQuery.isLoading), balance: bankBalance, name: bankName, accounts: bankCount }}
          locale={locale}
        />

        {period === "year" ? (
          <MoneyChart kind="year" months={yearMonths} year={selectedYear} lastMonth={lastMonth} loading={yearLoading} stale={yearStale} />
        ) : (
          <MoneyChart
            kind="daily"
            days={days}
            monthLabel={focusMonthName}
            highlight={period === "today" ? "today" : period === "week" ? "week" : null}
            clockNote={clockNote}
            loading={monthlyQuery.isLoading}
            stale={monthlyQuery.isPlaceholderData}
          />
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
          <TabsList aria-label={t.tabs.label} className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 md:flex md:w-fit md:flex-wrap">
            {TABS.map((k) => {
              const locked = lacksClientReports && (k === "client" || k === "service");
              return (
                <TabsTrigger
                  key={k}
                  value={k}
                  title={locked ? t.tabs.locked : undefined}
                  className={cn(
                    "h-11 flex-none gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm md:h-9",
                    k === "journal" && "text-slate-500",
                  )}
                >
                  {k === "income" ? (
                    <>
                      <span className="md:hidden">{t.tabs.incomeShort}</span>
                      <span className="hidden md:inline">{tabLabel[k]}</span>
                    </>
                  ) : tabLabel[k]}
                  {locked && <Lock className="h-3.5 w-3.5 text-slate-400" aria-label={t.tabs.locked} />}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="income">
            <div className={cn("grid gap-4", period !== "year" && "lg:grid-cols-[1.35fr_1fr]")}>
              <IncomeStatement data={income} loading={incomeQuery.isLoading} stale={incomeQuery.isPlaceholderData} periodLabel={periodShort} locale={locale} />
              {period !== "year" && (
                <PaymentMethods
                  rows={monthly?.paymentBreakdown ?? []}
                  monthLabel={focusMonthName}
                  loading={monthlyQuery.isLoading}
                  stale={monthlyQuery.isPlaceholderData}
                  locale={locale}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="sales">
            {period === "year" ? (
              <SalesByMonth
                months={yearMonths.filter((m) => m.month <= lastMonth)}
                loading={yearLoading}
                onPick={(m) => { setSelectedMonth(m); setPeriod("month"); }}
              />
            ) : (
              <SalesList
                sales={listSales}
                periodLabel={periodShort}
                capped={listCapped}
                loading={monthlyQuery.isLoading || (period === "week" && weekCrossesMonth && prevMonthQuery.isLoading)}
                stale={monthlyQuery.isPlaceholderData}
                locale={locale}
              />
            )}
          </TabsContent>

          {(["client", "service"] as const).map((view) => (
            <TabsContent key={view} value={view}>
              <ClientServiceReports
                view={view}
                range={range}
                tzOffsetHours={now.tzOffsetHours}
                rangeLabel={coverage}
                clientSort={clientSort}
                onClientSort={(key) => setClientSort((s) => nextSort(s, key, ["name"]))}
                onClientFlip={() => setClientSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
                serviceSort={serviceSort}
                onServiceSort={(key) => setServiceSort((s) => nextSort(s, key, ["name"]))}
                onServiceFlip={() => setServiceSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
              />
            </TabsContent>
          ))}

          <TabsContent value="balance">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
              <BalanceSheet data={balanceQuery.data} loading={balanceQuery.isLoading} error={!!balanceQuery.error} />
              <BankCard
                connected={hasBank}
                loading={bankConnectionQuery.isLoading}
                accounts={bankAccounts}
                total={bankBalance}
                monthLabel={focusMonthName}
                monthIn={num(bankMonthQuery.data?.income)}
                monthOut={num(bankMonthQuery.data?.expense)}
                moves={bankMonthQuery.data?.transactions.length ?? 0}
                monthLoading={bankMonthQuery.isLoading}
              />
            </div>
          </TabsContent>

          <TabsContent value="journal">
            <JournalList entries={(journalQuery.data ?? []) as JournalEntry[]} loading={journalQuery.isLoading} error={!!journalQuery.error} locale={locale} />
          </TabsContent>
        </Tabs>
      </div>
    </AnimatedPage>
  );
}
