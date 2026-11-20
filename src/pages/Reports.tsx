import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, DollarSign, Receipt,
  RefreshCw, AlertTriangle, Wallet, CreditCard, Activity,
  Landmark, ChevronDown, ChevronUp, Link2, Unlink,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { bankCopy } from "@/i18n/copy/bank";

/** Account dropdown — simple absolute positioning, parent must NOT have overflow:hidden */
function AccountDropdown({
  accounts,
  selectedId,
  onChange,
}: {
  accounts: any[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const { reports: t } = useCopy(bankCopy);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = accounts.find((a) => String(a.id) === selectedId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-10 px-3 border border-neutral-200 rounded-xl bg-white text-sm hover:border-neutral-300 transition-colors w-full"
      >
        <Landmark className="w-4 h-4 text-neutral-400 shrink-0" />
        <span className="truncate flex-1 text-left">{selected?.bankName ?? t.selectAccount}</span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[280px] bg-white border border-neutral-200 rounded-xl shadow-lg z-50 py-1">
          {accounts.map((acc: any) => (
            <button
              key={acc.id}
              onClick={() => { onChange(String(acc.id)); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between transition-colors ${
                String(acc.id) === selectedId ? "bg-neutral-100 text-black font-medium" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Landmark className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="truncate">{acc.bankName} {acc.accountType ? `(${acc.accountType})` : ""}</span>
              </div>
              <span className={`text-xs font-medium shrink-0 ml-2 ${parseFloat(acc.currentBalance ?? "0") >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(parseFloat(acc.currentBalance ?? "0"))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Payment method labels come from bankCopy.reports.payment (keys are stored values).

const PIE_COLORS = ["#22c55e", "#86efac", "#a3a3a3", "#d4d4d4", "#e5e5e5", "#f5f5f5"];

// Build local date strings + timezone offset for backend queries
function getLocalDateInputs() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Calculate week start properly (handles month boundary, e.g. June 3 -> May 28)
  const weekStart = new Date(y, m, d - 6);
  return {
    todayDate: `${y}-${pad(m + 1)}-${pad(d)}`,
    weekStartDate: `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`,
    monthStartDate: `${y}-${pad(m + 1)}-01`,
    tzOffsetHours: now.getTimezoneOffset() / -60,
  };
}

export default function Reports() {
  const copy = useCopy(bankCopy);
  const t = copy.reports;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const [tab, setTab] = useState("monthly");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("");
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>("month");
  const [activePieSlice, setActivePieSlice] = useState<string | null>(null);

  // Local date + timezone inputs — stable with useMemo to prevent infinite re-fetching
  const dateInputs = useMemo(() => getLocalDateInputs(), []);

  // Month income statement (for "Mes" tab)
  const incomeQuery = trpc.reports.incomeStatement.useQuery({
    tzOffsetHours: dateInputs.tzOffsetHours,
    year: selectedYear,
    month: selectedMonth,
  }, {
    enabled: periodFilter !== "year",
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  // Year income statement (for "Ano" tab) — no month = full year
  const yearIncomeQuery = trpc.reports.incomeStatement.useQuery({
    tzOffsetHours: dateInputs.tzOffsetHours,
    year: selectedYear,
  }, {
    enabled: periodFilter === "year",
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const balanceQuery = trpc.reports.balanceSheet.useQuery();
  const journalQuery = trpc.reports.journalEntries.useQuery({ limit: 100 });
  const salesQuery = trpc.sales.stats.useQuery(dateInputs);
  const monthlyQuery = trpc.dashboard.monthly.useQuery({ year: selectedYear, month: selectedMonth });
  const bankConnectionQuery = trpc.bank.checkConnection.useQuery();
  const plaidAccountsQuery = trpc.bank.getAllPlaidAccounts.useQuery(undefined, { retry: false });
  const dbAccountsQuery = trpc.bank.listAccounts.useQuery(undefined, { retry: false });

  const utils = trpc.useUtils();

  // Auto-refetch income statement when month/year changes
  useEffect(() => {
    utils.reports.incomeStatement.invalidate();
  }, [selectedMonth, selectedYear, utils]);

  // ── Derived data (computed after all hooks) ──
  const hasBankConnected = bankConnectionQuery.data?.hasBank === true;
  const plaidAccounts = plaidAccountsQuery.data?.accounts ?? [];
  const dbAccounts = dbAccountsQuery.data ?? [];
  const allBankAccounts = plaidAccounts.length > 0
    ? plaidAccounts.map((pa: any) => {
        const dbMatch = dbAccounts.find((db: any) => db.plaidAccountId === pa.plaidAccountId);
        return dbMatch ? { ...pa, id: dbMatch.id, currentBalance: dbMatch.currentBalance } : pa;
      })
    : dbAccounts;

  // Auto-select first bank account
  const effectiveBankId = selectedBankAccount || (allBankAccounts[0] ? String(allBankAccounts[0].id) : "");
  const accountIdNum = effectiveBankId ? Number(effectiveBankId) : undefined;

  // Bank-dependent queries (use effectiveBankId for auto-select)
  const bankMonthQuery = trpc.bank.getMonthData.useQuery(
    { year: selectedYear, month: selectedMonth, accountId: accountIdNum },
    { enabled: !!accountIdNum }
  );
  const bankBalanceQuery = trpc.bank.getLiveBalance.useQuery(
    { accountId: accountIdNum },
    { enabled: !!accountIdNum }
  );

  // Only block on core queries
  const isLoading = incomeQuery.isLoading && salesQuery.isLoading;
  const hasError = incomeQuery.error && salesQuery.error;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 bg-white min-h-screen">
        <h1 className="text-2xl font-semibold text-black">{t.loading}</h1>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="p-6 lg:p-10 bg-white min-h-screen">
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-black mb-2">{t.loadError}</h2>
          <div className="text-sm text-neutral-400 mb-4 space-y-1">
            {incomeQuery.error && <p>{t.errIncome}: {incomeQuery.error.message}</p>}
            {balanceQuery.error && <p>{t.errBalance}: {balanceQuery.error.message}</p>}
            {salesQuery.error && <p>{t.errSales}: {salesQuery.error.message}</p>}
          </div>
          <Button onClick={() => utils.invalidate()} variant="outline" className="text-xs">{t.retry}</Button>
        </div>
      </div>
    );
  }

  const incomeData = periodFilter === "year" ? yearIncomeQuery.data : incomeQuery.data;
  const balanceData = balanceQuery.data;
  const journalData = journalQuery.data;
  const salesStats = salesQuery.data;
  const monthlyData = monthlyQuery.data;
  // Build bank stats from getMonthData + getLiveBalance
  const monthBankData = bankMonthQuery.data;
  const balanceData_ = bankBalanceQuery.data;
  const bankTxs = monthBankData?.transactions ?? [];
  const bankIncome = Number(monthBankData?.income ?? 0);
  const bankExpense = Number(monthBankData?.expense ?? 0);
  const bankBalance = Number(balanceData_?.liveBalance ?? monthBankData?.liveBalance ?? 0);
  const bankTxCount = bankTxs.length;
  // Group transactions by category
  const categoryMap = new Map<string, { category: string; type: string; total: number; count: number }>();
  for (const t of bankTxs) {
    const cat = t.category || "other";
    const type = t.type || "expense";
    const amt = parseFloat(t.amount ?? "0");
    const existing = categoryMap.get(cat);
    if (existing) {
      existing.total += amt;
      existing.count += 1;
    } else {
      categoryMap.set(cat, { category: cat, type, total: amt, count: 1 });
    }
  }
  const bankCategories = Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);

  const weekSales = Number(salesStats?.week.total ?? 0);
  const monthSales = Number(incomeData?.breakdown.salesRevenue ?? 0);
  const monthExpenses = Number(incomeData?.businessExpenses ?? 0);
  const netIncome = Number(incomeData?.breakdown.salesRevenue ?? 0) - Number(incomeData?.businessExpenses ?? 0);
  const margin = monthSales > 0 ? (netIncome / monthSales) * 100 : 0;

  // KPI values based on period filter
  const todaySales = Number(salesStats?.today?.total ?? 0);
  const todayTransactions = Number(salesStats?.today?.count ?? 0);
  const yearSales = Number(incomeData?.totalRevenue ?? 0);

  const kpiRevenue = periodFilter === "today" ? todaySales : periodFilter === "week" ? weekSales : periodFilter === "year" ? yearSales : monthSales;
  // Label for the current period filter (any other value falls back to the month label)
  const byPeriod = (l: { today: string; week: string; month: string; year: string }) =>
    periodFilter === "today" ? l.today : periodFilter === "week" ? l.week : periodFilter === "year" ? l.year : l.month;
  const kpiLabel = byPeriod(t.kpi.revenue);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = copy.months.map((label, i) => ({ value: i + 1, label }));
  // Month title for the daily sales chart, formatted in the UI language (same month the server reports)
  const monthTitle = monthlyData?.monthName
    ? new Date(selectedYear, selectedMonth - 1, 15).toLocaleDateString(locale, { month: "long", year: "numeric" })
    : "";

  const totalMonthlySales = Number(monthlyData?.totalSales ?? 0);
  const totalMonthlyExpenses = Number(monthlyData?.totalExpenses ?? 0);
  const monthlyNetIncome = Number(monthlyData?.netIncome ?? 0);
  const dailySales = monthlyData?.dailySales ?? [];
  const paymentBreakdown = monthlyData?.paymentBreakdown ?? [];
  const totalDaily = dailySales.reduce((s, d) => s + Number(d.total), 0);
  const avgDaily = dailySales.length > 0 ? totalDaily / dailySales.length : 0;

  const pieData = paymentBreakdown.map((p) => ({
    name: t.payment[p.method] || p.method,
    value: Number(p.total),
  }));

  // 3-segment pie chart: Ventas vs Gastos del Negocio
  // Slices are identified by a stable key; the translated name is only for display.
  const salesRevenue = Number(incomeData?.breakdown.salesRevenue ?? 0);
  const businessExp = Number(incomeData?.businessExpenses ?? 0);
  const pie3Names: Record<string, string> = { sales: t.pieSales, businessExpenses: t.pieBusinessExpenses };
  const pie3Data = [
    { key: "sales", name: pie3Names.sales, value: salesRevenue, color: "#22c55e" },
    { key: "businessExpenses", name: pie3Names.businessExpenses, value: businessExp, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  // Period filter options
  const periodOptions = [
    { key: "today", label: t.periods.today },
    { key: "week", label: t.periods.week },
    { key: "month", label: t.periods.month },
    { key: "year", label: t.periods.year },
  ];



  return (
    <div className="p-6 lg:p-10 space-y-6 bg-white min-h-screen max-w-7xl mx-auto">
      {/* Header */}
      <AnimatedPage>
        <div>
          <h1 className="text-2xl font-semibold text-black">{t.title}</h1>
          <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
        </div>

        {/* Period Filter Carousel */}
        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-1 bg-gray-100 rounded-xl p-1 mt-4" style={{ scrollbarWidth: "none" }}>
          <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
          {periodOptions.map((f) => (
            <button key={f.key} onClick={() => setPeriodFilter(f.key)} className={`snap-start flex-shrink-0 py-1.5 text-xs font-medium rounded-full transition-colors px-5 ${periodFilter === f.key ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}>
              {f.label}
            </button>
          ))}
        </div>


      </AnimatedPage>

      {/* KPI Cards — 4 equal-sized cards with horizontal titles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(() => {
          const expenseLabel = byPeriod(t.kpi.expenses);
          const profitLabel = byPeriod(t.kpi.profit);
          const salesLabel = byPeriod(t.kpi.sales);
          const yearExpenses = Number(incomeData?.businessExpenses ?? 0);
          const yearRevenue = Number(incomeData?.breakdown.salesRevenue ?? 0);
          const yearNet = yearRevenue - yearExpenses;
          const kpiExpenses = periodFilter === "year" ? yearExpenses : periodFilter === "week" ? 0 : periodFilter === "today" ? 0 : monthExpenses;
          const kpiNet = periodFilter === "year" ? yearNet : periodFilter === "week" ? 0 : periodFilter === "today" ? 0 : netIncome;
          const kpiRevenueVal = periodFilter === "today" ? todaySales : periodFilter === "week" ? weekSales : periodFilter === "year" ? yearRevenue : monthSales;
          const kpiMargin = kpiRevenueVal > 0 ? (kpiNet / kpiRevenueVal) * 100 : 0;
          return [
            { label: kpiLabel, value: formatCurrency(kpiRevenue), icon: Receipt, color: "bg-green-50 text-green-600" },
            { label: expenseLabel, value: formatCurrency(kpiExpenses), icon: TrendingDown, color: "bg-red-50 text-red-500" },
            { label: profitLabel, value: formatCurrency(kpiNet), icon: DollarSign, color: kpiMargin >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500" },
            { label: salesLabel, value: String(periodFilter === "today" ? todayTransactions : periodFilter === "year" ? "—" : (monthlyData?.totalSalesCount ?? 0)), icon: TrendingUp, color: "bg-green-50 text-green-600" },
          ].map((s, i) => (
            <AnimatedCard key={s.label} delay={i * 80}>
              <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo h-[88px]">
                <CardContent className="p-3 flex items-center gap-2.5 h-full">
                  <div className={`p-2 rounded-lg shrink-0 ${s.color}`}><s.icon className="w-4 h-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-neutral-400 truncate">{s.label}</p>
                    <p className="text-base font-semibold text-black truncate">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            </AnimatedCard>
          ));
        })()}
      </div>

      {/* Tabs — Horizontal Scroll Carousel */}
      <Tabs value={tab} onValueChange={setTab}>
        <div
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-1 bg-neutral-50 border border-neutral-200 rounded-xl p-1"
          style={{ scrollbarWidth: "none" }}
        >
          {[
            { key: "monthly", label: t.tabs.monthly },
            { key: "income", label: t.tabs.income },
            { key: "journal", label: t.tabs.journal },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`snap-start flex-shrink-0 text-xs rounded-lg px-4 py-2 transition-colors duration-150 ${tab === t.key ? "bg-black text-white" : "text-neutral-600 hover:text-black"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* PAGOS POR MES */}
        <TabsContent value="monthly" className="mt-6 space-y-4">
          <AnimatedPage>
            <div className="flex gap-3">
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-40 text-xs border-neutral-200 rounded-xl"><SelectValue placeholder={t.monthPh} /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => (<SelectItem key={m.value} value={String(m.value)} className="text-xs">{m.label}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-28 text-xs border-neutral-200 rounded-xl"><SelectValue placeholder={t.yearPh} /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (<SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </AnimatedPage>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AnimatedCard delay={200} className="lg:col-span-2">
              <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                <CardContent className="p-5">
                  <p className="text-xs text-neutral-400 mb-4">{t.dailySales(monthTitle)}</p>
                  <div className="border border-neutral-100 rounded-lg p-4 bg-neutral-50/30">
                    <div className="flex items-end gap-2 h-40 overflow-hidden">
                      {(() => {
                        const rawMax = Math.max(...dailySales.map((d) => Number(d.total)), 1);
                        const maxVal = rawMax * 1.15;
                        return dailySales.map((d, idx) => {
                          const h = maxVal ? (Number(d.total) / maxVal) * 100 : 0;
                          const hasData = Number(d.total) > 0;
                          const isToday = idx === dailySales.length - 1;
                          return (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-1.5">
                              <div className="w-full flex justify-center items-end h-32">
                                <div className={`w-3 rounded-t-sm transition-[height] duration-300 ease-out-expo ${hasData ? (isToday ? "bg-black" : "bg-neutral-800") : "bg-neutral-200"}`}
                                  style={{ height: `${Math.max(h, hasData ? 4 : 2)}%`, minHeight: hasData ? 4 : 2 }}
                                  title={`${d.dayName}: ${formatCurrency(d.total)}`}
                                />
                              </div>
                              <span className={`text-[10px] ${isToday ? "text-black font-semibold" : hasData ? "text-neutral-500" : "text-neutral-300"}`}>{d.dayName}</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </AnimatedCard>

            <AnimatedCard delay={280}>
              <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                <CardContent className="p-5">
                  <p className="text-xs text-neutral-400 mb-4">{t.paymentMethods}</p>
                  <div className="space-y-3">
                    {paymentBreakdown.length === 0 && <p className="text-xs text-neutral-400 text-center py-8">{t.noPayments}</p>}
                    {paymentBreakdown.map((item) => {
                      const pct = totalMonthlySales > 0 ? (Number(item.total) / totalMonthlySales) * 100 : 0;
                      return (
                        <div key={item.method}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {item.method === "cash" && <Wallet className="w-3.5 h-3.5 text-neutral-400" />}
                              {item.method === "zelle" && <CreditCard className="w-3.5 h-3.5 text-neutral-400" />}
                              {item.method === "card" && <Receipt className="w-3.5 h-3.5 text-neutral-400" />}
                              {item.method === "mixed" && <Activity className="w-3.5 h-3.5 text-neutral-400" />}
                              <span className="text-sm text-neutral-600">{t.payment[item.method] || item.method}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-medium text-black">{formatCurrency(item.total)}</span>
                              <span className="text-[10px] text-neutral-400 ml-1">({item.count})</span>
                            </div>
                          </div>
                          <div className="w-full bg-neutral-100 rounded-full h-1.5">
                            <div className="bg-black h-1.5 rounded-full transition-[width] duration-500 ease-out-expo" style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </AnimatedCard>
          </div>
        </TabsContent>

        {/* ESTADO DE RESULTADOS */}
        <TabsContent value="income" className="mt-6">
          {incomeData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <AnimatedCard delay={100} className="lg:col-span-2">
                <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-black">{t.incomeExpenses}</CardTitle>
                    <p className="text-[11px] text-neutral-400">{incomeData.period.start} - {incomeData.period.end}</p>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">{t.revenue}</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">{t.serviceSales}</span><span className="font-medium text-black">{formatCurrency(incomeData.breakdown.salesRevenue)}</span></div>
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold"><span className="text-black">{t.totalRevenue}</span><span className="text-green-600">{formatCurrency(incomeData.breakdown.salesRevenue)}</span></div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">{t.expenses}</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">{t.operatingExpenses}</span><span className="font-medium text-black">{formatCurrency(incomeData.breakdown.operExpenses)}</span></div>
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold"><span className="text-black">{t.totalExpenses}</span><span className="text-red-500">{formatCurrency(incomeData.businessExpenses ?? 0)}</span></div>
                        <p className="text-[10px] text-neutral-400 mt-1">{t.personalExcluded}</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-black">{t.netIncome}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${margin >= 0 ? "text-green-600 border-green-200" : "text-red-500 border-red-200"}`}>{t.margin(margin.toFixed(1))}</Badge>
                        <span className={`text-sm font-bold ${netIncome >= 0 ? "text-green-600" : "text-red-500"}`}>{formatCurrency(netIncome)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

              <AnimatedCard delay={200}>
                <div className="space-y-4">
                  <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                    <CardContent className="p-5">
                      <p className="text-xs text-neutral-400 mb-3">{t.incomeExpenses}</p>
                      <div className="h-48 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pie3Data}
                              dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3}
                              isAnimationActive={true}
                            >
                              {pie3Data.map((entry, i) => (
                                <Cell
                                  key={i}
                                  fill={entry.color}
                                  opacity={activePieSlice === null || activePieSlice === entry.key ? 1 : 0.4}
                                  onClick={() => setActivePieSlice(activePieSlice === entry.key ? null : entry.key)}
                                  style={{ cursor: "pointer" }}
                                />
                              ))}
                            </Pie>
                            {/* Disabled floating tooltip */}
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Center text — shows active slice info */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-center">
                            {activePieSlice ? (
                              <>
                                <p className="text-[10px] text-neutral-400">{pie3Names[activePieSlice] ?? activePieSlice}</p>
                                <p className="text-sm font-semibold text-black">{formatCurrency(pie3Data.find((d) => d.key === activePieSlice)?.value ?? 0)}</p>
                              </>
                            ) : (
                              <>
                                <p className="text-[10px] text-neutral-400">{t.total}</p>
                                <p className="text-sm font-semibold text-black">{formatCurrency(pie3Data.reduce((s, d) => s + d.value, 0))}</p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center gap-3 mt-2 flex-wrap">
                        {pie3Data.map((entry) => (
                          <button
                            key={entry.key}
                            onClick={() => setActivePieSlice(activePieSlice === entry.key ? null : entry.key)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-all ${activePieSlice === entry.key ? "bg-neutral-100" : ""}`}
                          >
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-[10px] text-neutral-500">{entry.name}</span>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                    <CardContent className="p-5 space-y-3">
                      <p className="text-xs text-neutral-400">{t.paymentSummary}</p>
                      {pieData.length === 0 && <p className="text-xs text-neutral-400 text-center py-4">{t.noData}</p>}
                      {pieData.map((p, i) => (
                        <div key={p.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-xs text-neutral-600">{p.name}</span>
                          </div>
                          <span className="text-xs font-medium text-black">{formatCurrency(p.value)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </AnimatedCard>
            </div>
          )}
        </TabsContent>

        {/* MOVIMIENTOS DETALLADOS — Sales List */}
        <TabsContent value="journal" className="mt-6">
          <AnimatedPage>
            <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-black">{t.detailedActivity}</CardTitle>
                <p className="text-[11px] text-neutral-400">{monthlyData?.recentSales ? t.salesCount(monthlyData.recentSales.length) : t.loadingShort}</p>
              </CardHeader>
              <CardContent className="p-5">
                {monthlyData?.recentSales && monthlyData.recentSales.length > 0 ? (
                  <div className="space-y-0">
                    {monthlyData.recentSales.map((sale: any) => {
                      const productNames = sale.items?.map((i: any) => i.serviceName).join(", ") || sale.invoiceNumber;
                      const saleDate = sale.createdAt ? new Date(sale.createdAt) : null;
                      const dateStr = saleDate ? saleDate.toLocaleDateString(locale, { day: "numeric", month: "short" }) : "";
                      const timeStr = saleDate ? saleDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
                      const paymentLabel = t.payment[sale.paymentMethod] || sale.paymentMethod;
                      return (
                        <div key={sale.id} className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50 px-1 rounded transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-normal text-black truncate">{productNames}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-neutral-400">{dateStr} · {timeStr}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 capitalize">{paymentLabel}</span>
                            </div>
                          </div>
                          <span className="text-sm font-medium shrink-0 ml-3 text-blue-600">+{formatCurrency(sale.total)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Receipt className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                    <p className="text-sm text-neutral-400">{t.noSales}</p>
                    <p className="text-xs text-neutral-400 mt-1">{t.goToPrefix}<Link to="/pos" className="font-medium text-black">{t.goToLink}</Link>{t.goToSuffix}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </AnimatedPage>
        </TabsContent>
      </Tabs>
    </div>
  );
}
