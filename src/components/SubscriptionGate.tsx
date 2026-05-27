import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Crown, Landmark, CheckCircle, CalendarDays, Zap, X } from "lucide-react";

interface SubscriptionGateProps {
  children: React.ReactNode;
}

// ── Business Plans ──
const BIZ_MONTHLY = {
  subtitle: "Suscripcion Premium",
  name: "Mensual",
  price: "$80",
  originalPrice: "$120",
  period: "/mes",
  badge: "New Plan",
  description: "Facturado mensualmente. Cancela cuando quieras.",
  features: [
    "Agente de contabilidad AI personalizado",
    "Contabilidad completa del negocio",
    "Manejo y almacenamiento de clientes",
    "Contabilidad bancaria conectada",
    "Soporte prioritario 24/7",
    "Finanzas organizadas automaticamente",
  ],
};

const BIZ_ANNUAL = {
  subtitle: "Suscripcion elite",
  name: "Anual",
  price: "$800",
  originalPrice: "$1200",
  period: "/año",
  badge: "Mejor valor",
  savings: "Ahorras $400",
  description: "Facturado anualmente. Cancela cuando quieras.",
  features: [
    "Todo lo incluido en el plan Mensual",
    "Agente de contabilidad AI ilimitado",
    "Clientes ilimitados en tu base de datos",
    "Reportes contables exportables (PDF / Excel)",
    "Backups diarios automaticos",
    "Soporte prioritario VIP",
  ],
};

// ── Personal Plans ──
const PERS_MONTHLY = {
  subtitle: "Suscripcion Premium",
  name: "Mensual",
  price: "$40",
  originalPrice: "$80",
  period: "/mes",
  badge: "Oferta",
  description: "Facturado mensualmente. Cancela cuando quieras.",
  features: [
    "Agente de contabilidad AI personal",
    "Toda tu contabilidad personal organizada",
    "Seguimiento de ingresos y gastos",
    "Metas de ahorro con IA",
    "Reportes financieros automaticos",
    "Soporte dedicado 24/7",
  ],
};

const PERS_ANNUAL = {
  subtitle: "Suscripcion elite",
  name: "Anual",
  price: "$400",
  originalPrice: "$700",
  period: "/año",
  badge: "Mejor valor",
  savings: "Ahorras $300",
  description: "Facturado anualmente. Cancela cuando quieras.",
  features: [
    "Todo lo incluido en el plan Mensual",
    "Agente de contabilidad AI ilimitado",
    "Metas de ahorro avanzadas con IA",
    "Reportes anuales exportables",
    "Backups diarios automaticos",
    "Soporte VIP prioritario",
  ],
};

// ── Shimmer animation styles ──
const SHIMMER_STYLES = `
  @keyframes shimmer-silver {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes shimmer-gold {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .shimmer-silver {
    background: linear-gradient(90deg, 
      #9ca3af 0%, #d1d5db 25%, #f3f4f6 50%, #d1d5db 75%, #9ca3af 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer-silver 3s linear infinite;
  }
  .shimmer-gold {
    background: linear-gradient(90deg, 
      #b45309 0%, #fbbf24 25%, #fde68a 50%, #fbbf24 75%, #b45309 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer-gold 3s linear infinite;
  }
  .shimmer-elite {
    background: linear-gradient(90deg, 
      #000000 0%, #4b5563 25%, #9ca3af 50%, #4b5563 75%, #000000 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer-gold 3s linear infinite;
  }
`;

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"checking" | "connect_bank" | "subscribe" | "active">("checking");
  const [dismissed, setDismissed] = useState(false);

  const { user } = useAuth();
  const userMode = user?.modePreference || "business";

  const { data: status, isLoading: subLoading } = trpc.subscription.status.useQuery(
    undefined, { refetchInterval: 10000 }
  );
  const { data: bankConnection, isLoading: bankLoading } = trpc.bank.checkConnection.useQuery(
    undefined, { refetchInterval: 10000 }
  );

  const hasSubscription = status?.active === true;
  const hasBank = bankConnection?.hasBank === true;

  // Checkout mutation — goes directly to Stripe
  const checkoutMut = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Error al crear la sesion de pago");
      }
    },
    onError: (err) => {
      alert("Error: " + err.message);
    },
  });

  useEffect(() => {
    if (phase === "subscribe") return;
    if (hasSubscription) { setPhase("active"); return; }
    if (!hasBank) { setPhase("connect_bank"); return; }
    if (hasBank && !hasSubscription) {
      const timer = setTimeout(() => setPhase("subscribe"), 20000);
      return () => clearTimeout(timer);
    }
  }, [hasSubscription, hasBank, subLoading, bankLoading, phase]);

  if (dismissed) return <>{children}</>;
  if (phase === "active") return <>{children}</>;

  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "connect_bank") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto">
            <Landmark className="w-8 h-8 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold text-black">Conecta tu banco primero</h2>
          <p className="text-sm text-neutral-500">Conecta tu cuenta bancaria para desbloquear todas las funciones.</p>
          <button
            onClick={() => navigate(userMode === "personal" ? "/bank?mode=personal" : "/bank")}
            className="w-full h-11 bg-black text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
          >
            <Landmark className="w-4 h-4" /> Conectar banco
          </button>
        </div>
      </div>
    );
  }

  // ── SUBSCRIBE FULL-SCREEN OVERLAY ──
  const isBusiness = userMode === "business";
  const monthlyPlan = isBusiness ? BIZ_MONTHLY : PERS_MONTHLY;
  const annualPlan = isBusiness ? BIZ_ANNUAL : PERS_ANNUAL;
  const title = isBusiness ? "Negocio" : "Personal";

  return (
    <>
      <style>{SHIMMER_STYLES}</style>
      <div className="fixed inset-0 z-[99998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
        <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:rounded-2xl md:shadow-2xl overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
          {/* Header with close X */}
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-yellow-500 flex items-center justify-center bg-transparent">
                <Crown className="w-4 h-4 text-yellow-500" />
              </div>
              <span className="text-sm font-medium text-black">{title} — Premium</span>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-black hover:bg-neutral-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 md:p-6 space-y-5 max-w-lg mx-auto">
            {/* Success banner */}
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800">
                <strong>Banco conectado.</strong> Suscribete para acceso completo.
              </p>
            </div>

            {/* Crown + Title */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full border-2 border-yellow-500 flex items-center justify-center bg-transparent mx-auto">
                <Crown className="w-7 h-7 text-yellow-500" />
              </div>
              <h2 className="text-xl font-semibold text-black">Desbloquea el acceso completo</h2>
              <p className="text-sm text-neutral-500">
                Suscribete para ver todas tus transacciones, analisis y reportes.
              </p>
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {/* Monthly Card */}
              <div className="border rounded-lg p-5 space-y-4 bg-white relative">
                <div className="absolute -top-2.5 right-4">
                  <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">{monthlyPlan.badge}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-full border-2 border-gray-400 flex items-center justify-center bg-transparent">
                    <Crown className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Crown className="w-3 h-3 text-gray-400" />
                    <p className="text-[11px] font-bold uppercase tracking-wide shimmer-silver">{monthlyPlan.subtitle}</p>
                  </div>
                  <h4 className="text-sm font-medium text-black mt-0.5">{monthlyPlan.name}</h4>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-medium text-black">{monthlyPlan.price}</span>
                    <span className="text-xs text-neutral-400 line-through">{monthlyPlan.originalPrice}</span>
                    <span className="text-xs text-neutral-400">{monthlyPlan.period}</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">{monthlyPlan.description}</p>
                </div>
                <ul className="space-y-1.5">
                  {monthlyPlan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600">
                      <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => checkoutMut.mutate({ plan: "monthly", mode: userMode })}
                  disabled={checkoutMut.isPending}
                  className="w-full h-9 bg-black hover:bg-neutral-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Crown className="w-3.5 h-3.5 text-gray-300" /> Suscribirse {monthlyPlan.name}
                </button>
              </div>

              {/* Annual Card */}
              <div className="border rounded-lg p-5 space-y-4 bg-white relative">
                <div className="absolute -top-2.5 right-4">
                  <span className="bg-yellow-400 text-black text-[10px] px-2 py-0.5 rounded-full font-medium">{annualPlan.badge}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center bg-neutral-100 shadow-sm">
                    <Crown className="w-4 h-4 text-black drop-shadow-sm" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Crown className="w-3 h-3 text-yellow-500" />
                    <p className="text-[11px] font-bold uppercase tracking-wide shimmer-elite">{annualPlan.subtitle}</p>
                  </div>
                  <h4 className="text-sm font-medium text-black mt-0.5">{annualPlan.name}</h4>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-medium text-black">{annualPlan.price}</span>
                    <span className="text-xs text-neutral-400 line-through">{annualPlan.originalPrice}</span>
                    <span className="text-xs text-neutral-400">{annualPlan.period}</span>
                  </div>
                  {annualPlan.savings && (
                    <p className="text-[11px] text-emerald-700 font-medium mt-1 bg-emerald-50 px-2 py-0.5 rounded inline-block">{annualPlan.savings}</p>
                  )}
                  <p className="text-[11px] text-neutral-400 mt-1">{annualPlan.description}</p>
                </div>
                <ul className="space-y-1.5">
                  {annualPlan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600">
                      <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => checkoutMut.mutate({ plan: "annual", mode: userMode })}
                  disabled={checkoutMut.isPending}
                  className="w-full h-9 bg-black hover:bg-neutral-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Crown className="w-3.5 h-3.5 text-yellow-500" /> Suscribirse {annualPlan.name}
                </button>
              </div>
            </div>

            {/* Footer */}
            <p className="text-[10px] text-neutral-400 text-center pb-4">
              Al suscribirte, aceptas los terminos de servicio de AI Aethel Accountant.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Page-level gate: blocks individual pages when user has no subscription ──
export function SubscriptionPageGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { data: status } = trpc.subscription.status.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const userMode = user?.modePreference || "business";
  const hasSubscription = status?.active === true;
  const currentPath = location.pathname;

  if (hasSubscription) return <>{children}</>;

  if (userMode === "business" && currentPath !== "/settings") {
    return <SubscriptionOverlayOnly />;
  }

  if (userMode === "personal" && currentPath !== "/settings") {
    return <SubscriptionOverlayOnly />;
  }

  return <>{children}</>;
}

// ── Compact overlay for page blocking ──
function SubscriptionOverlayOnly() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userMode = user?.modePreference || "business";
  const isBusiness = userMode === "business";

  const monthlyPlan = isBusiness ? BIZ_MONTHLY : PERS_MONTHLY;
  const annualPlan = isBusiness ? BIZ_ANNUAL : PERS_ANNUAL;
  const title = isBusiness ? "Negocio" : "Personal";

  const checkoutMut = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Error al crear la sesion de pago");
      }
    },
    onError: (err) => {
      alert("Error: " + err.message);
    },
  });

  return (
    <>
      <style>{SHIMMER_STYLES}</style>
      <div className="fixed inset-0 z-[99998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
        <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:rounded-2xl md:shadow-2xl overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-yellow-500 flex items-center justify-center bg-transparent">
                <Crown className="w-4 h-4 text-yellow-500" />
              </div>
              <span className="text-sm font-medium text-black">{title} — Premium</span>
            </div>
            <button
              onClick={() => navigate("/settings")}
              className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-black hover:bg-neutral-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 md:p-6 space-y-5 max-w-lg mx-auto">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full border-2 border-yellow-500 flex items-center justify-center bg-transparent mx-auto">
                <Crown className="w-7 h-7 text-yellow-500" />
              </div>
              <h2 className="text-xl font-semibold text-black">Desbloquea el acceso completo</h2>
              <p className="text-sm text-neutral-500">
                Suscribete para acceder a esta pagina y todas las funciones.
              </p>
            </div>

            <div className="space-y-3">
              {/* Monthly */}
              <div className="border rounded-lg p-5 space-y-4 bg-white relative">
                <div className="absolute -top-2.5 right-4">
                  <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">{monthlyPlan.badge}</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Crown className="w-3 h-3 text-gray-400" />
                    <p className="text-[11px] font-bold uppercase tracking-wide shimmer-silver">{monthlyPlan.subtitle}</p>
                  </div>
                  <h4 className="text-sm font-medium text-black mt-0.5">{monthlyPlan.name}</h4>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-medium text-black">{monthlyPlan.price}</span>
                    <span className="text-xs text-neutral-400 line-through">{monthlyPlan.originalPrice}</span>
                    <span className="text-xs text-neutral-400">{monthlyPlan.period}</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">{monthlyPlan.description}</p>
                </div>
                <ul className="space-y-1.5">
                  {monthlyPlan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600">
                      <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => checkoutMut.mutate({ plan: "monthly", mode: userMode })}
                  disabled={checkoutMut.isPending}
                  className="w-full h-9 bg-black hover:bg-neutral-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Crown className="w-3.5 h-3.5 text-gray-300" /> Suscribirse {monthlyPlan.name}
                </button>
              </div>

              {/* Annual */}
              <div className="border rounded-lg p-5 space-y-4 bg-white relative">
                <div className="absolute -top-2.5 right-4">
                  <span className="bg-yellow-400 text-black text-[10px] px-2 py-0.5 rounded-full font-medium">{annualPlan.badge}</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Crown className="w-3 h-3 text-yellow-500" />
                    <p className="text-[11px] font-bold uppercase tracking-wide shimmer-elite">{annualPlan.subtitle}</p>
                  </div>
                  <h4 className="text-sm font-medium text-black mt-0.5">{annualPlan.name}</h4>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-medium text-black">{annualPlan.price}</span>
                    <span className="text-xs text-neutral-400 line-through">{annualPlan.originalPrice}</span>
                    <span className="text-xs text-neutral-400">{annualPlan.period}</span>
                  </div>
                  {annualPlan.savings && (
                    <p className="text-[11px] text-emerald-700 font-medium mt-1 bg-emerald-50 px-2 py-0.5 rounded inline-block">{annualPlan.savings}</p>
                  )}
                  <p className="text-[11px] text-neutral-400 mt-1">{annualPlan.description}</p>
                </div>
                <ul className="space-y-1.5">
                  {annualPlan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600">
                      <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => checkoutMut.mutate({ plan: "annual", mode: userMode })}
                  disabled={checkoutMut.isPending}
                  className="w-full h-9 bg-black hover:bg-neutral-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Crown className="w-3.5 h-3.5 text-yellow-500" /> Suscribirse {annualPlan.name}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
