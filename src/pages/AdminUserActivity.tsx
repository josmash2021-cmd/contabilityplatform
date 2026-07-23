import { useNavigate, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  Shield, Building2, ShoppingCart, Crown, ChevronLeft, RefreshCw, Activity,
} from "lucide-react";

function activityIcon(type: string) {
  if (type === "bank") return <Building2 className="w-4 h-4 text-blue-500" />;
  if (type === "subscription") return <Crown className="w-4 h-4 text-amber-500" />;
  return <ShoppingCart className="w-4 h-4 text-violet-500" />;
}
const activityLabel = (type: string) =>
  type === "bank" ? "Banco" : type === "subscription" ? "Suscripcion" : "Venta";

export default function AdminUserActivity() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { userId } = useParams();
  const id = Number(userId);

  const { data, isLoading } = trpc.admin.userActivity.useQuery(
    { userId: id },
    { enabled: isAdmin && !!id, refetchInterval: 5000, refetchOnWindowFocus: true, staleTime: 0 }
  );

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-neutral-700">Acceso restringido</h2>
          <p className="text-sm text-neutral-400 mt-1">Solo administradores pueden ver esta pagina.</p>
        </div>
      </div>
    );
  }

  const user = data?.user;
  const activities = data?.activities ?? [];
  const summary = activities.reduce(
    (acc: any, item: any) => {
      const amount = typeof item.amount === "string" ? parseFloat(item.amount) : (item.amount ?? 0);
      acc.total++;
      if (item.type !== "subscription") {
        if (amount >= 0) acc.income += amount;
        else acc.expense += Math.abs(amount);
      }
      return acc;
    },
    { total: 0, income: 0, expense: 0 }
  );

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/admin")}
        className="flex items-center gap-1 text-sm text-neutral-500 hover:text-black transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Volver al panel
      </button>

      {/* Header */}
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 text-white rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-xl font-bold shrink-0">
            {(user?.name || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-lg truncate">{user?.name || "Sin nombre"}</h1>
            <p className="text-sm text-neutral-300 truncate">{user?.email}</p>
            {user?.subscription && (
              <div className="flex items-center gap-2 mt-1.5">
                <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px]">
                  {user.subscription.plan === "annual" ? "Anual" : "Mensual"}
                </Badge>
                <span className="text-xs text-neutral-400">
                  Hasta {user.subscription.currentPeriodEnd
                    ? new Date(user.subscription.currentPeriodEnd).toLocaleDateString("es")
                    : "—"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">Resumen de actividad</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-neutral-50 rounded-xl">
            <p className="text-lg font-bold text-black">{summary.total}</p>
            <p className="text-[10px] text-neutral-400 uppercase">Movimientos</p>
          </div>
          <div className="text-center p-3 bg-emerald-50 rounded-xl">
            <p className="text-lg font-bold text-emerald-600">+{formatCurrency(summary.income)}</p>
            <p className="text-[10px] text-emerald-400 uppercase">Ingresos</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-xl">
            <p className="text-lg font-bold text-red-500">-{formatCurrency(summary.expense)}</p>
            <p className="text-[10px] text-red-400 uppercase">Gastos</p>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-neutral-400" />
            <p className="text-xs text-neutral-400">Cargando actividad...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <Activity className="w-8 h-8 text-neutral-300" />
            <p className="text-sm text-neutral-400">Sin actividad reciente</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-50">
            {activities.map((activity: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3.5 hover:bg-neutral-50/50 transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  activity.type === "bank" ? "bg-blue-50" : activity.type === "subscription" ? "bg-amber-50" : "bg-violet-50"
                }`}>
                  {activityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-800 truncate">{activity.description || "—"}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      activity.type === "bank" ? "bg-blue-50 text-blue-600" : activity.type === "subscription" ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"
                    }`}>{activityLabel(activity.type)}</span>
                    <span className="text-[10px] text-neutral-400">
                      {activity.date ? new Date(activity.date).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </span>
                  </div>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${activity.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {activity.amount >= 0 ? "+" : ""}{formatCurrency(activity.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50/50">
          <p className="text-[10px] text-neutral-400 text-center">Mostrando hasta 30 movimientos mas recientes</p>
        </div>
      </div>
    </div>
  );
}
