import { trpc } from "@/providers/trpc";
import { formatCurrency, formatDateShort, formatTimeLocal, getUserTimezoneShort } from "@/lib/utils";
import { Link } from "react-router";
import { Users, DollarSign, Receipt, ArrowUpRight, ArrowDownRight, TrendingUp, Clock, Globe } from "lucide-react";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";
import { useState, useEffect } from "react";

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

const PAYMENT_LABELS: Record<string, string> = { cash: "Efectivo", zelle: "Zelle", card: "Tarjeta", mixed: "Mixto" };

export default function Dashboard() {
  // Calculate UTC timestamps for "today" in user's local timezone
  // The backend stores dates in UTC, so we send exact UTC boundaries
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const d = now.getDate();

  // Create local dates and convert to UTC ISO strings
  // new Date(y, m, d, h, min, s) creates a LOCAL date, toISOString() converts to UTC
  const todayStart = new Date(y, m, d, 0, 0, 0).toISOString();
  const todayEnd = new Date(y, m, d, 23, 59, 59, 999).toISOString();
  const weekStart = new Date(y, m, d - 6, 0, 0, 0).toISOString();
  const monthStart = new Date(y, m, 1, 0, 0, 0).toISOString();

  const { data, error } = trpc.dashboard.summary.useQuery({
    todayStart,
    todayEnd,
    weekStart,
    monthStart,
    now: now.toISOString(),
  });
  // Debug query to trace timezone issues
  const { data: debugData } = trpc.dashboard.debug.useQuery({
    todayStart,
    todayEnd,
    weekStart,
    monthStart,
    now: now.toISOString(),
  });
  const { location } = useUserLocation();
  const tzShort = getUserTimezoneShort();
  const [showDebug, setShowDebug] = useState(false);

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
            <h1 className="text-2xl font-medium text-black tracking-tight">Inicio</h1>
            <p className="text-neutral-400 text-sm mt-1">Todo lo que pasa en tu negocio</p>
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
          <p className="text-red-600 text-sm">Error: {error.message}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Hoy", value: formatCurrency(safeData.todaySales.total ?? 0), sub: `${safeData.todaySales.count ?? 0} ventas`, icon: DollarSign, iconColor: "text-emerald-600" },
          { label: "Esta Semana", value: formatCurrency(safeData.weekSales.total ?? 0), net: netWeek, icon: Receipt, iconColor: "text-blue-600" },
          { label: "Este Mes", value: formatCurrency(safeData.monthSales.total ?? 0), net: netMonth, icon: TrendingUp, iconColor: "text-violet-600" },
          { label: "Clientes", value: String(safeData.customerCount ?? 0), sub: "Registrados", icon: Users, iconColor: "text-amber-600" },
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
                  <span className={`text-xs ${s.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(Math.abs(s.net))} neto</span>
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
              <span className="text-xs text-neutral-400">Ventas ultimos 7 dias</span>
              <Link to="/reports" className="text-xs text-neutral-400 hover:text-black flex items-center gap-1 transition-colors duration-150">Ver reportes <ArrowUpRight className="w-3 h-3" /></Link>
            </div>
            <div className="h-48 flex items-end gap-2">
              {safeData.dailySales?.length ? safeData.dailySales.map((d: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-neutral-100 rounded-t-sm relative overflow-hidden" style={{ height: `${Math.max((Number(d.total) / Math.max(...safeData.dailySales.map((x: any) => Number(x.total)))) * 160, 4)}px` }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t-sm" style={{ height: "100%" }} />
                  </div>
                  <span className="text-[10px] text-neutral-400">{d.dayName}</span>
                </div>
              )) : <p className="text-sm text-neutral-400 w-full text-center">Sin datos</p>}
            </div>
          </div>
        </AnimatedCard>

        {/* Side Panel */}
        <div className="space-y-4">
          <AnimatedCard delay={280}>
            <div className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <p className="text-xs text-neutral-400 mb-3">Pagos de hoy</p>
              {safeData.paymentBreakdown?.length ? safeData.paymentBreakdown.map((p: any) => (
                <div key={p.method} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-neutral-500">{PAYMENT_LABELS[p.method] || p.method}</span>
                  <span className="text-xs font-medium text-black">{formatCurrency(p.total)}</span>
                </div>
              )) : <p className="text-sm text-neutral-400 text-center py-4">Sin cobros hoy</p>}
            </div>
          </AnimatedCard>

          <AnimatedCard delay={360}>
            <div className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo space-y-3">
              <p className="text-xs text-neutral-400">Mi Contabilidad</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Ventas hoy</span>
                <span className="text-xs font-medium text-black">{safeData.todaySales.count ?? 0} trans.</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Clientes</span>
                <span className="text-xs font-medium text-black">{safeData.customerCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Balance bancario</span>
                <span className="text-xs font-medium text-black">{formatCurrency(safeData.bankBalance ?? 0)}</span>
              </div>
            </div>
          </AnimatedCard>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatedCard delay={400}>
          <div className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-400">Mi Contabilidad</span>
              <Link to="/reports" className="text-xs text-neutral-400 hover:text-black flex items-center gap-1 transition-colors duration-150">Ver mas <ArrowUpRight className="w-3 h-3" /></Link>
            </div>
            <div className="space-y-3">
              {[
                { label: "Hoy", value: formatCurrency(safeData.todaySales.total ?? 0) },
                { label: "Esta semana", value: formatCurrency(safeData.weekSales.total ?? 0) },
                { label: "Este mes", value: formatCurrency(safeData.monthSales.total ?? 0) },
                { label: "Gastos semana", value: formatCurrency(safeData.weekExpenses ?? 0), color: "text-red-600" },
                { label: "Gastos mes", value: formatCurrency(safeData.monthExpenses ?? 0), color: "text-red-600" },
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
              <span className="text-xs text-neutral-400">Ventas recientes</span>
              <Link to="/transactions" className="text-xs text-neutral-400 hover:text-black flex items-center gap-1 transition-colors duration-150">Ver todo <ArrowUpRight className="w-3 h-3" /></Link>
            </div>
            {safeData.recentSales?.length ? safeData.recentSales.map((sale: any) => {
              const productNames = sale.items?.map((i: any) => i.serviceName).join(", ") || "Sin productos";
              const dateStr = sale.createdAt ? formatDateShort(sale.createdAt) : "";
              const timeStr = sale.createdAt ? formatTimeLocal(sale.createdAt) : "";
              const paymentLabel = PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod;
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
            }) : <p className="text-sm text-neutral-400 text-center py-8">No hay ventas aun. Ve a <Link to="/pos" className="font-medium text-black">Vender</Link> para empezar.</p>}
          </div>
        </AnimatedCard>
      </div>

      {/* Debug Panel - temporary for diagnostics */}
      <div className="border border-dashed border-neutral-300 rounded-lg p-4 bg-neutral-50">
        <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-neutral-500 font-medium flex items-center gap-1">
          {showDebug ? "Ocultar" : "Mostrar"} debug info
        </button>
        {showDebug && debugData && (
          <div className="mt-3 space-y-2 text-[10px] text-neutral-600 font-mono overflow-auto">
            <div className="bg-white p-2 rounded border border-neutral-200">
              <p className="font-semibold text-neutral-800">Tu dispositivo:</p>
              <p>Hora local: {new Date().toString()}</p>
              <p>Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
              <p>Offset: {new Date().getTimezoneOffset()} min ({new Date().getTimezoneOffset() / -60}h)</p>
            </div>
            <div className="bg-white p-2 rounded border border-neutral-200">
              <p className="font-semibold text-neutral-800">Enviado al backend:</p>
              <p>todayStart: {todayStart}</p>
              <p>todayEnd: {todayEnd}</p>
              <p>weekStart: {weekStart}</p>
              <p>monthStart: {monthStart}</p>
              <p>now: {now.toISOString()}</p>
            </div>
            <div className="bg-white p-2 rounded border border-neutral-200">
              <p className="font-semibold text-neutral-800">Servidor DB:</p>
              <p>CURDATE: {debugData.dbServerDates?.curdate ?? "N/A"}</p>
              <p>NOW: {debugData.dbServerDates?.now ?? "N/A"}</p>
              <p>UTC: {debugData.dbServerDates?.utc ?? "N/A"}</p>
            </div>
            <div className="bg-white p-2 rounded border border-neutral-200">
              <p className="font-semibold text-neutral-800">Tus ventas en DB ({debugData.allUserSales?.length ?? 0}):</p>
              {(debugData.allUserSales ?? []).map((s: any, i: number) => (
                <p key={i}>#{s.id}: ${s.total} | {s.createdAt} | status={s.status} | method={s.paymentMethod}</p>
              ))}
            </div>
            <div className="bg-white p-2 rounded border border-neutral-200">
              <p className="font-semibold text-neutral-800">Filtradas como "hoy" ({debugData.filteredSalesToday?.length ?? 0}):</p>
              {(debugData.filteredSalesToday ?? []).map((s: any, i: number) => (
                <p key={i}>#{s.id}: ${s.total} | {s.createdAt}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
