import { useState } from "react";
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

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo", zelle: "Zelle", card: "Tarjeta", mixed: "Mixto", transfer: "Transferencia", other: "Otro",
};

const PIE_COLORS = ["#22c55e", "#86efac", "#a3a3a3", "#d4d4d4", "#e5e5e5", "#f5f5f5"];

const CATEGORY_LABELS: Record<string, string> = {
  zelle_income: "Zelle Recibidos", zelle_sent: "Zelle Enviados", deposit: "Depositos",
  cash_deposit: "Depositos de Efectivo", cash_withdrawal: "Retiros de Efectivo",
  subscription: "Suscripciones", transfer: "Transferencias", business_expense: "Gastos de Negocio",
  home_expense: "Gastos del Hogar", shopping: "Compras", cash_income: "Efectivo Recibido", other: "Otros",
};

export default function Reports() {
  const [tab, setTab] = useState("monthly");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("");
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>("month");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");

  const incomeQuery = trpc.reports.incomeStatement.useQuery({});
  const balanceQuery = trpc.reports.balanceSheet.useQuery();
  const journalQuery = trpc.reports.journalEntries.useQuery({ limit: 100 });
  const salesQuery = trpc.sales.stats.useQuery();
  const monthlyQuery = trpc.dashboard.monthly.useQuery({ year: selectedYear, month: selectedMonth });
  const bankAccountsQuery = trpc.bank.listAccounts.useQuery(undefined, { retry: false });

  const accountId = selectedBankAccount ? Number(selectedBankAccount) : undefined;
  const bankStatsQuery = trpc.bank.stats.useQuery({ accountId }, { enabled: !!accountId });
  const reconQuery = trpc.reconciliation.status.useQuery({ accountId }, { enabled: !!accountId });

  const utils = trpc.useUtils();

  const isLoading = incomeQuery.isLoading || balanceQuery.isLoading || salesQuery.isLoading;
  const hasError = incomeQuery.error || balanceQuery.error || salesQuery.error;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 bg-white min-h-screen">
        <h1 className="text-2xl font-semibold text-black">Cargando reportes...</h1>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="p-6 lg:p-10 bg-white min-h-screen">
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-black mb-2">Error al cargar reportes</h2>
          <div className="text-sm text-neutral-400 mb-4 space-y-1">
            {incomeQuery.error && <p>Income: {incomeQuery.error.message}</p>}
            {balanceQuery.error && <p>Balance: {balanceQuery.error.message}</p>}
            {salesQuery.error && <p>Sales: {salesQuery.error.message}</p>}
          </div>
          <Button onClick={() => utils.invalidate()} variant="outline" className="text-xs">Reintentar</Button>
        </div>
      </div>
    );
  }

  const incomeData = incomeQuery.data;
  const balanceData = balanceQuery.data;
  const journalData = journalQuery.data;
  const salesStats = salesQuery.data;
  const monthlyData = monthlyQuery.data;
  const allBankAccounts = bankAccountsQuery.data ?? [];
  const bankStats = bankStatsQuery.data;
  const reconData = reconQuery.data;

  const weekSales = Number(salesStats?.week.total ?? 0);
  const monthSales = Number(incomeData?.totalRevenue ?? 0);
  const monthExpenses = Number(incomeData?.totalExpenses ?? 0);
  const netIncome = Number(incomeData?.netIncome ?? 0);
  const margin = monthSales > 0 ? (netIncome / monthSales) * 100 : 0;

  // KPI values based on period filter
  const todaySales = Number(salesStats?.today?.total ?? 0);
  const todayTransactions = Number(salesStats?.today?.count ?? 0);
  const yearSales = Number(incomeData?.totalRevenue ?? 0);

  const kpiRevenue = periodFilter === "today" ? todaySales : periodFilter === "week" ? weekSales : periodFilter === "year" ? yearSales : monthSales;
  const kpiLabel = periodFilter === "today" ? "Ingresos Hoy" : periodFilter === "week" ? "Ingresos Sem." : periodFilter === "year" ? "Ingresos Año" : "Ingresos Mes";

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    { value: 1, label: "Enero" }, { value: 2, label: "Febrero" }, { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" }, { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
    { value: 7, label: "Julio" }, { value: 8, label: "Agosto" }, { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" }, { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
  ];

  const totalMonthlySales = Number(monthlyData?.totalSales ?? 0);
  const totalMonthlyExpenses = Number(monthlyData?.totalExpenses ?? 0);
  const monthlyNetIncome = Number(monthlyData?.netIncome ?? 0);
  const dailySales = monthlyData?.dailySales ?? [];
  const paymentBreakdown = monthlyData?.paymentBreakdown ?? [];
  const totalDaily = dailySales.reduce((s, d) => s + Number(d.total), 0);
  const avgDaily = dailySales.length > 0 ? totalDaily / dailySales.length : 0;

  const pieData = paymentBreakdown.map((p) => ({
    name: PAYMENT_LABELS[p.method] || p.method,
    value: Number(p.total),
  }));

  // Filter payment breakdown by payment method
  const filteredPaymentBreakdown = paymentFilter === "all"
    ? paymentBreakdown
    : paymentBreakdown.filter((p) => p.method === paymentFilter);

  const filteredPieData = filteredPaymentBreakdown.map((p) => ({
    name: PAYMENT_LABELS[p.method] || p.method,
    value: Number(p.total),
  }));

  // Period filter options
  const periodOptions = [
    { key: "today", label: "Hoy" },
    { key: "week", label: "Semana" },
    { key: "month", label: "Mes" },
    { key: "year", label: "Año" },
  ];

  // Payment method filter options
  const paymentOptions = [
    { key: "all", label: "Todos" },
    { key: "cash", label: "Efectivo" },
    { key: "zelle", label: "Zelle" },
    { key: "card", label: "Tarjeta" },
  ];

  return (
    <div className="p-6 lg:p-10 space-y-6 bg-white min-h-screen max-w-7xl mx-auto">
      {/* Header */}
      <AnimatedPage>
        <div>
          <h1 className="text-2xl font-semibold text-black">Reportes Financieros</h1>
          <p className="text-neutral-400 text-sm mt-1">Estados contables y analisis de tu negocio</p>
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

        {/* Payment Method Filter Carousel */}
        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-1 bg-gray-100 rounded-xl p-1 mt-2" style={{ scrollbarWidth: "none" }}>
          <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
          {paymentOptions.map((f) => (
            <button key={f.key} onClick={() => setPaymentFilter(f.key)} className={`snap-start flex-shrink-0 py-1.5 text-xs font-medium rounded-full transition-colors px-5 ${paymentFilter === f.key ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </AnimatedPage>

      {/* KPI Cards — 4 equal-sized cards with horizontal titles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: kpiLabel, value: formatCurrency(kpiRevenue), icon: Receipt, color: "bg-green-50 text-green-600" },
          { label: "Gastos Mes", value: formatCurrency(monthExpenses), icon: TrendingDown, color: "bg-red-50 text-red-500" },
          { label: "Utilidad", value: formatCurrency(netIncome), icon: DollarSign, color: margin >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500" },
          { label: periodFilter === "today" ? "Ventas Hoy" : "Ventas Mes", value: String(periodFilter === "today" ? todayTransactions : (monthlyData?.totalSalesCount ?? 0)), icon: TrendingUp, color: "bg-green-50 text-green-600" },
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
        ))}
      </div>

      {/* Tabs — Horizontal Scroll Carousel */}
      <Tabs value={tab} onValueChange={setTab}>
        <div
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-1 bg-neutral-50 border border-neutral-200 rounded-xl p-1"
          style={{ scrollbarWidth: "none" }}
        >
          {[
            { key: "monthly", label: "Ventas del Mes" },
            { key: "income", label: "Ingresos y Gastos" },
            { key: "balance", label: "Lo que Tengo y Debo" },
            { key: "bank", label: "Mi Banco" },
            { key: "journal", label: "Movimientos Detallados" },
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
                <SelectTrigger className="w-40 text-xs border-neutral-200 rounded-xl"><SelectValue placeholder="Mes" /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => (<SelectItem key={m.value} value={String(m.value)} className="text-xs">{m.label}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-28 text-xs border-neutral-200 rounded-xl"><SelectValue placeholder="Ano" /></SelectTrigger>
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
                  <p className="text-xs text-neutral-400 mb-4">Ventas diarias - {monthlyData?.monthName || ""}</p>
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
                  <p className="text-xs text-neutral-400 mb-4">Metodos de pago</p>
                  <div className="space-y-3">
                    {paymentBreakdown.length === 0 && <p className="text-xs text-neutral-400 text-center py-8">Sin cobros este mes</p>}
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
                              <span className="text-sm text-neutral-600">{PAYMENT_LABELS[item.method] || item.method}</span>
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
                    <CardTitle className="text-sm font-semibold text-black">Ingresos y Gastos</CardTitle>
                    <p className="text-[11px] text-neutral-400">{incomeData.period.start} - {incomeData.period.end}</p>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Ingresos</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">Ventas de Servicios</span><span className="font-medium text-black">{formatCurrency(incomeData.breakdown.salesRevenue)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">Ingresos Bancarios</span><span className="font-medium text-black">{formatCurrency(incomeData.breakdown.bankRevenue)}</span></div>
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold"><span className="text-black">Total Ingresos</span><span className="text-green-600">{formatCurrency(incomeData.totalRevenue)}</span></div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Gastos</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">Gastos Operativos</span><span className="font-medium text-black">{formatCurrency(incomeData.breakdown.operExpenses)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">Gastos Bancarios</span><span className="font-medium text-black">{formatCurrency(incomeData.breakdown.bankExpenses)}</span></div>
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold"><span className="text-black">Total Gastos</span><span className="text-red-500">{formatCurrency(incomeData.totalExpenses)}</span></div>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-black">Utilidad Neta</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${margin >= 0 ? "text-green-600 border-green-200" : "text-red-500 border-red-200"}`}>{margin.toFixed(1)}% margen</Badge>
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
                      <p className="text-xs text-neutral-400 mb-3">Composicion de ingresos</p>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={[{ name: "Ventas", value: incomeData.breakdown.salesRevenue }, { name: "Banco", value: incomeData.breakdown.bankRevenue }]}
                              dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3}>
                              <Cell fill="#22c55e" /><Cell fill="#86efac" />
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-green-500" /><span className="text-[10px] text-neutral-500">Ventas</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-green-300" /><span className="text-[10px] text-neutral-500">Banco</span></div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                    <CardContent className="p-5 space-y-3">
                      <p className="text-xs text-neutral-400">Resumen de pagos</p>
                      {filteredPieData.length === 0 && <p className="text-xs text-neutral-400 text-center py-4">Sin datos</p>}
                      {filteredPieData.map((p, i) => (
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

        {/* BALANCE GENERAL */}
        <TabsContent value="balance" className="mt-6">
          {balanceData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <AnimatedCard delay={100} className="lg:col-span-2">
                <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-black">Lo que Tengo y Debo</CardTitle></CardHeader>
                  <CardContent className="p-5 space-y-5">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Activos</p>
                      <div className="space-y-1.5">
                        {balanceData.assets.map((a) => (
                          <div key={a.code} className="flex justify-between text-sm"><span className="text-neutral-600">{a.code} - {a.name}</span><span className="font-medium text-black">{formatCurrency(a.balance)}</span></div>
                        ))}
                        {balanceData.assets.length === 0 && <p className="text-xs text-neutral-400">Sin cuentas de activo</p>}
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold"><span className="text-black">Total Activos</span><span className="text-green-600">{formatCurrency(balanceData.totalAssets)}</span></div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Pasivos</p>
                      <div className="space-y-1.5">
                        {balanceData.liabilities.map((l) => (
                          <div key={l.code} className="flex justify-between text-sm"><span className="text-neutral-600">{l.code} - {l.name}</span><span className="font-medium text-black">{formatCurrency(l.balance)}</span></div>
                        ))}
                        {balanceData.liabilities.length === 0 && <p className="text-xs text-neutral-400">Sin cuentas de pasivo</p>}
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold"><span className="text-black">Total Pasivos</span><span className="text-red-500">{formatCurrency(balanceData.totalLiabilities)}</span></div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Patrimonio</p>
                      <div className="space-y-1.5">
                        {balanceData.equity.map((e) => (
                          <div key={e.code} className="flex justify-between text-sm"><span className="text-neutral-600">{e.code} - {e.name}</span><span className="font-medium text-black">{formatCurrency(e.balance)}</span></div>
                        ))}
                        {balanceData.equity.length === 0 && <p className="text-xs text-neutral-400">Sin cuentas de patrimonio</p>}
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold"><span className="text-black">Total Patrimonio</span><span className="text-blue-600">{formatCurrency(balanceData.totalEquity)}</span></div>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center bg-neutral-50 rounded-lg p-3">
                      <span className="text-xs font-medium text-neutral-500">Verificacion: Activos = Pasivos + Patrimonio</span>
                      <Badge variant="outline" className={`text-[10px] ${Math.abs(balanceData.totalAssets - balanceData.totalLiabilitiesAndEquity) < 0.01 ? "text-emerald-600 border-emerald-200" : "text-red-600 border-red-200"}`}>
                        {Math.abs(balanceData.totalAssets - balanceData.totalLiabilitiesAndEquity) < 0.01 ? "Cuadrado" : "Descuadrado"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>

              <AnimatedCard delay={200}>
                <div className="space-y-4">
                  <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                    <CardContent className="p-5 space-y-4">
                      <p className="text-xs text-neutral-400">Composicion del balance</p>
                      <div>
                        <div className="flex justify-between text-xs mb-1"><span className="text-neutral-600">Activos</span><span className="font-medium text-black">{formatCurrency(balanceData.totalAssets)}</span></div>
                        <div className="w-full bg-neutral-100 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full" style={{ width: "100%" }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1"><span className="text-neutral-600">Pasivos</span><span className="font-medium text-black">{formatCurrency(balanceData.totalLiabilities)}</span></div>
                        <div className="w-full bg-neutral-100 rounded-full h-2"><div className="bg-red-400 h-2 rounded-full" style={{ width: `${balanceData.totalAssets > 0 ? (balanceData.totalLiabilities / balanceData.totalAssets) * 100 : 0}%` }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1"><span className="text-neutral-600">Patrimonio</span><span className="font-medium text-black">{formatCurrency(balanceData.totalEquity)}</span></div>
                        <div className="w-full bg-neutral-100 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full" style={{ width: `${balanceData.totalAssets > 0 ? (balanceData.totalEquity / balanceData.totalAssets) * 100 : 0}%` }} /></div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                    <CardContent className="p-5 space-y-3">
                      <p className="text-xs text-neutral-400">Estadisticas rapidas</p>
                      <div className="flex justify-between text-sm"><span className="text-neutral-600">Ratio Deuda/Patrimonio</span><span className="font-medium text-black">{balanceData.totalEquity > 0 ? (balanceData.totalLiabilities / balanceData.totalEquity).toFixed(2) : "N/A"}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-neutral-600">Ratio Deuda/Activos</span><span className="font-medium text-black">{balanceData.totalAssets > 0 ? ((balanceData.totalLiabilities / balanceData.totalAssets) * 100).toFixed(1) : "0"}%</span></div>
                      <div className="flex justify-between text-sm"><span className="text-neutral-600">Patrimonio/Activos</span><span className="font-medium text-black">{balanceData.totalAssets > 0 ? ((balanceData.totalEquity / balanceData.totalAssets) * 100).toFixed(1) : "0"}%</span></div>
                    </CardContent>
                  </Card>
                </div>
              </AnimatedCard>
            </div>
          )}
        </TabsContent>

        {/* CONTABILIDAD BANCARIA */}
        <TabsContent value="bank" className="mt-6 space-y-4">
          <AnimatedPage>
            <div className="flex gap-3 items-center">
              <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
                <SelectTrigger className="w-64 text-xs border-neutral-200 rounded-xl"><SelectValue placeholder="Seleccionar cuenta bancaria" /></SelectTrigger>
                <SelectContent>
                  {allBankAccounts.map((acc: typeof allBankAccounts[0]) => (<SelectItem key={acc.id} value={String(acc.id)} className="text-xs">{acc.accountType} - {acc.accountNumber}</SelectItem>))}
                </SelectContent>
              </Select>
              {allBankAccounts.length === 0 && <span className="text-xs text-neutral-400">No hay cuentas bancarias conectadas</span>}
            </div>
          </AnimatedPage>

          {bankStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Balance", value: formatCurrency(Number(bankStats.income.total) - Number(bankStats.expense)), icon: Landmark, color: "bg-green-50 text-green-600" },
                { label: "Ingresos", value: formatCurrency(bankStats.income.total), icon: TrendingUp, color: "bg-green-50 text-green-600" },
                { label: "Gastos", value: formatCurrency(bankStats.expense), icon: TrendingDown, color: "bg-red-50 text-red-500" },
                { label: "Transacciones", value: String(bankStats.count), icon: Receipt, color: "bg-neutral-50 text-neutral-600" },
              ].map((s, i) => (
                <AnimatedCard key={s.label} delay={i * 60}>
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
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AnimatedCard delay={200} className="lg:col-span-2">
              <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-black">Categorias</CardTitle></CardHeader>
                <CardContent className="p-5">
                  {bankStats && bankStats.byCategory.length > 0 ? (
                    <div className="space-y-2">
                      {bankStats.byCategory.map((cat: any) => (
                        <div key={cat.category} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${cat.type === "income" ? "text-green-600 border-green-200" : "text-red-500 border-red-200"}`}>{cat.type === "income" ? "Ingreso" : "Gasto"}</Badge>
                            <span className="text-sm text-neutral-600">{CATEGORY_LABELS[cat.category] || cat.category.replace(/_/g, " ")}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium text-black">{formatCurrency(cat.total)}</span>
                            <span className="text-[10px] text-neutral-400 ml-1">({cat.count})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-400 text-center py-8">{selectedBankAccount ? "Sin transacciones para esta cuenta" : "Selecciona una cuenta para ver categorias"}</p>
                  )}
                </CardContent>
              </Card>
            </AnimatedCard>

            <AnimatedCard delay={280}>
              <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-black">Conciliacion</CardTitle></CardHeader>
                <CardContent className="p-5 space-y-4">
                  {!reconData ? (<p className="text-sm text-neutral-400 text-center py-4">Selecciona una cuenta</p>) :
                    !reconData.connected ? (
                      <div className="flex flex-col items-center gap-2 py-4"><Unlink className="w-8 h-8 text-neutral-300" /><p className="text-xs text-neutral-400">Cuenta no conectada a Plaid</p></div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2"><Link2 className="w-4 h-4 text-green-500" /><span className="text-xs text-neutral-600">Conectado a Plaid</span></div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm"><span className="text-neutral-600">Saldo Plaid</span><span className="font-medium text-black">{formatCurrency(reconData.plaidBalance ?? 0)}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-neutral-600">Saldo Libros</span><span className="font-medium text-black">{formatCurrency(reconData.bookBalance ?? 0)}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-neutral-600">Diferencia</span><span className="font-medium text-black">{formatCurrency(reconData.difference ?? 0)}</span></div>
                        </div>
                        <div className="pt-2">
                          <Badge className={`text-[10px] ${reconData.reconciled ? "bg-green-50 text-green-600 border-green-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}>{reconData.reconciled ? "Conciliado" : "Pendiente"}</Badge>
                        </div>
                      </>
                    )}
                </CardContent>
              </Card>
            </AnimatedCard>
          </div>
        </TabsContent>

        {/* MOVIMIENTOS DETALLADOS — Sales List */}
        <TabsContent value="journal" className="mt-6">
          <AnimatedPage>
            <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-black">Movimientos Detallados</CardTitle>
                <p className="text-[11px] text-neutral-400">{monthlyData?.recentSales ? `${monthlyData.recentSales.length} ventas` : "Cargando..."}</p>
              </CardHeader>
              <CardContent className="p-5">
                {monthlyData?.recentSales && monthlyData.recentSales.length > 0 ? (
                  <div className="space-y-0">
                    {monthlyData.recentSales.map((sale: any) => {
                      const productNames = sale.items?.map((i: any) => i.serviceName).join(", ") || sale.invoiceNumber;
                      const saleDate = sale.createdAt ? new Date(sale.createdAt) : null;
                      const dateStr = saleDate ? saleDate.toLocaleDateString("es", { day: "numeric", month: "short" }) : "";
                      const timeStr = saleDate ? saleDate.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
                      const paymentLabel = PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod;
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
                    <p className="text-sm text-neutral-400">No hay ventas este mes</p>
                    <p className="text-xs text-neutral-400 mt-1">Ve a <Link to="/pos" className="font-medium text-black">Vender</Link> para empezar</p>
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
