import { trpc } from "@/providers/trpc";
import { formatCurrency, getUserTimezoneShort } from "@/lib/utils";
import { Link } from "react-router";
import { Users, DollarSign, Receipt, ArrowUpRight, ArrowDownRight, TrendingUp, Clock } from "lucide-react";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";
import { useState, useEffect } from "react";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { businessCopy } from "@/i18n/copy/business";

// Hook to detect user's location for timezone verification
function useUserLocation() {
  const [location, setLocation] = useState<{ city?: string; region?: string; tz?: string } | null>(null);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt">("prompt");

  useEffect(() => {
    // Try to get timezone info from browser (always available)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setLocation((prev) => ({ ...prev, tz }));

    // Optionally request geolocation for city/region
    if ("geolocation" in navigator) {
      navigator.permissions?.query({ name: "geolocation" as any }).then((result) => {
        setPermission(result.state as "granted" | "denied" | "prompt");
        if (result.state === "granted") {
          navigator.geolocation.getCurrentPosition(
            () => {}, // success - we mainly care about permission for timezone awareness
            () => {},
            { enableHighAccuracy: false, timeout: 5000 }
          );
        }
      }).catch(() => {
        // permissions API not supported, try direct request
        navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5000 });
      });
    }
  }, []);

  return { location, permission };
}

// Short weekday for a local "YYYY-MM-DD" date (the server's dayName is always Spanish).
function weekdayShort(date: string | undefined, locale: string): string | undefined {
  const [yy, mm, dd] = (date ?? "").split("-").map(Number);
  if (!yy || !mm || !dd) return undefined;
  return new Date(yy, mm - 1, dd).toLocaleDateString(locale, { weekday: "short" });
}

export default function Dashboard() {
  const { dashboard: t, paymentMethods, common: { noProducts } } = useCopy(businessCopy);
  const locale = intlLocale(useLang().lang);
  // Build local date strings (YYYY-MM-DD) and timezone offset for backend
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");

  const todayDate = `${y}-${pad(m + 1)}-${pad(d)}`;
  // Calculate week start properly (handles month boundary, e.g. June 3 -> May 28)
  const weekStart = new Date(y, m, d - 6);
  const weekStartDate = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
  const monthStartDate = `${y}-${pad(m + 1)}-01`;
  const tzOffsetHours = now.getTimezoneOffset() / -60; // -4 for EDT, +1 for CET, etc.

  const { data, error } = trpc.dashboard.summary.useQuery({
    todayDate,
    weekStartDate,
    monthStartDate,
    tzOffsetHours,
  });
  const { location } = useUserLocation();
  const tzShort = getUserTimezoneShort();

  const safeData = data || {
    todaySales: { total: "0", count: 0 },
    weekSales: { total: "0", count: 0 },
    monthSales: { total: "0", count: 0 },
    todayExpenses: "0",
    weekExpenses: "0",
    monthExpenses: "0",
    paymentBreakdown: [],
    dailySales: [],
    recentSales: [],
    bankBalance: "0",
    accountBalances: [],
  };

  const netWeek = Number(safeData.weekSales.total ?? 0) - Number(safeData.weekExpenses ?? 0);
  const netMonth = Number(safeData.monthSales.total ?? 0) - Number(safeData.monthExpenses ?? 0);

  return (
    <div className="p-8 lg:p-10 space-y-8 bg-white min-h-screen">
      {/* Header */}
      <AnimatedPage>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-medium text-black tracking-tight">{t.title}</h1>
            <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
          </div>
          {/* Timezone indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-50 rounded-lg border border-neutral-100">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-[10px] text-neutral-500 font-medium">{tzShort}</span>
          </div>
        </div>
      </AnimatedPage>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm">{t.error(error.message)}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t.today, value: formatCurrency(safeData.todaySales.total ?? 0), sub: t.salesCount(safeData.todaySales.count ?? 0), icon: DollarSign, iconColor: "text-emerald-600" },
          { label: t.thisWeekKpi, value: formatCurrency(safeData.weekSales.total ?? 0), net: netWeek, icon: Receipt, iconColor: "text-blue-600" },
          { label: t.thisMonthKpi, value: formatCurrency(safeData.monthSales.total ?? 0), net: netMonth, icon: TrendingUp, iconColor: "text-violet-600" },
          { label: t.customers, value: String(safeData.customerCount ?? 0), sub: t.registered, icon: Users, iconColor: "text-amber-600" },
        ].map((s, i) => (
          <AnimatedCard key={s.label} delay={i * 80}>
            <div className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <div className="flex items-center gap-2 mb-3">
                <s.icon className={`w-3.5 h-3.5 ${s.iconColor}`} strokeWidth={1.5} />
                <span className="text-xs text-neutral-400">{s.label}</span>
              </div>
              <p className="text-xl font-medium text-black">{s.value}</p>
              {s.sub ? (
                <p className="text-xs text-neutral-400 mt-1">{s.sub}</p>
              ) : s.net !== undefined ? (
                <div className="flex items-center gap-1 mt-1">
                  {s.net >= 0 ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
                  <span className={`text-xs ${s.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>{t.net(formatCurrency(Math.abs(s.net)))}</span>
                </div>
              ) : null}
            </div>
          </AnimatedCard>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Sales Chart */}
        <AnimatedCard delay={200} className="lg:col-span-2">
          <div className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-400">{t.last7Days}</span>
              <Link to="/reports" className="text-xs text-neutral-400 hover:text-black flex items-center gap-1 transition-colors duration-150">{t.viewReports} <ArrowUpRight className="w-3 h-3" /></Link>
            </div>
            <div className="h-48 flex items-end gap-2">
              {safeData.dailySales?.length ? safeData.dailySales.map((d: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-neutral-100 rounded-t-sm relative overflow-hidden" style={{ height: `${Math.max((Number(d.total) / Math.max(...safeData.dailySales.map((x: any) => Number(x.total)))) * 160, 4)}px` }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t-sm" style={{ height: "100%" }} />
                  </div>
                  <span className="text-[10px] text-neutral-400">{weekdayShort(d.date, locale) ?? d.dayName}</span>
                </div>
              )) : <p className="text-sm text-neutral-400 w-full text-center">{t.noData}</p>}
            </div>
          </div>
        </AnimatedCard>

        {/* Side Panel */}
        <AnimatedCard delay={280}>
          <div className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <p className="text-xs text-neutral-400 mb-3">{t.todayPayments}</p>
            {safeData.paymentBreakdown?.length ? safeData.paymentBreakdown.map((p: any) => (
              <div key={p.method} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-neutral-500">{paymentMethods[p.method] || p.method}</span>
                <span className="text-xs font-medium text-black">{formatCurrency(p.total)}</span>
              </div>
            )) : <p className="text-sm text-neutral-400 text-center py-4">{t.noPaymentsToday}</p>}
          </div>
        </AnimatedCard>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatedCard delay={400}>
          <div className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-400">{t.financialSummary}</span>
              <Link to="/reports" className="text-xs text-neutral-400 hover:text-black flex items-center gap-1 transition-colors duration-150">{t.viewMore} <ArrowUpRight className="w-3 h-3" /></Link>
            </div>
            <div className="space-y-3">
              {[
                { label: t.today, value: formatCurrency(safeData.todaySales.total ?? 0) },
                { label: t.thisWeek, value: formatCurrency(safeData.weekSales.total ?? 0) },
                { label: t.thisMonth, value: formatCurrency(safeData.monthSales.total ?? 0) },
                { label: t.weekExpenses, value: formatCurrency(safeData.weekExpenses ?? 0), color: "text-red-600" },
                { label: t.monthExpenses, value: formatCurrency(safeData.monthExpenses ?? 0), color: "text-red-600" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500">{item.label}</span>
                  <span className={`text-sm font-medium ${item.color || "text-black"}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard delay={480}>
          <div className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-400">{t.recentSales}</span>
              <Link to="/transactions" className="text-xs text-neutral-400 hover:text-black flex items-center gap-1 transition-colors duration-150">{t.viewAll} <ArrowUpRight className="w-3 h-3" /></Link>
            </div>
            {safeData.recentSales?.length ? safeData.recentSales.map((sale: any) => {
              const productNames = sale.items?.map((i: any) => i.serviceName).join(", ") || noProducts;
              const dateStr = sale.createdAt ? new Date(sale.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "";
              const timeStr = sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
              const paymentLabel = paymentMethods[sale.paymentMethod] || sale.paymentMethod;
              return (
                <div key={sale.id} className="flex items-center justify-between py-2.5 border-b border-neutral-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-black truncate">{productNames}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-neutral-500">{dateStr} · {timeStr}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500">{paymentLabel}</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-black ml-3 shrink-0">{formatCurrency(sale.total)}</span>
                </div>
              );
            }) : <p className="text-sm text-neutral-400 text-center py-8">{t.noSalesBefore}<Link to="/pos" className="font-medium text-black">{t.noSalesLink}</Link>{t.noSalesAfter}</p>}
          </div>
        </AnimatedCard>
      </div>

    </div>
  );
}
