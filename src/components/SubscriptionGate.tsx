import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Crown, Landmark, CheckCircle, CalendarDays, Zap, ArrowRight } from "lucide-react";

interface SubscriptionGateProps {
  children: React.ReactNode;
}

/**
 * Subscription Gate — Shows a subscribe screen after the user has connected
 * their bank and seen it working for 10 seconds.
 * 
 * Flow:
 * 1. No subscription + no bank → Show "connect bank" first
 * 2. No subscription + bank connected → Show bank success for 10s, then subscribe
 * 3. Has subscription → Show content normally
 */
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"checking" | "connect_bank" | "subscribe" | "active">("checking");

  const { data: status, isLoading: subLoading } = trpc.subscription.status.useQuery(
    undefined,
    { refetchInterval: 10000 }
  );

  const { data: bankConnection, isLoading: bankLoading } = trpc.bank.checkConnection.useQuery(
    undefined,
    { refetchInterval: 10000 }
  );

  const hasSubscription = status?.active === true;
  const hasBank = bankConnection?.hasBank === true;

  useEffect(() => {
    if (subLoading || bankLoading) return;

    if (hasSubscription) {
      setPhase("active");
      return;
    }

    if (!hasBank) {
      setPhase("connect_bank");
      return;
    }

    // Has bank but no subscription — show subscribe screen directly
    setPhase("subscribe");
  }, [hasSubscription, hasBank, subLoading, bankLoading]);

  // Loading state
  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-neutral-200 border-t-black rounded-full animate-spin mx-auto" />
          <p className="text-sm text-neutral-500">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  // PHASE 1: No bank connected — redirect to connect bank first
  if (phase === "connect_bank") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto">
            <Landmark className="w-8 h-8 text-neutral-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-black">Conecta tu banco primero</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Conecta tu cuenta bancaria para desbloquear todas las funciones de AI Aethel Accountant.
            </p>
          </div>
          <button
            onClick={() => navigate("/bank")}
            className="w-full h-11 bg-black text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
          >
            <Landmark className="w-4 h-4" />
            Conectar banco
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (phase === "subscribe") {
    return (
      <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-300">
          {/* Success message */}
          <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-800">
              <strong>Banco conectado.</strong> Ahora suscribete para acceso completo.
            </p>
          </div>

          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-full border-2 border-yellow-500 flex items-center justify-center bg-transparent mx-auto">
              <Crown className="w-7 h-7 text-yellow-500" />
            </div>
            <h2 className="text-xl font-semibold text-black">Desbloquea el acceso completo</h2>
            <p className="text-sm text-neutral-500">
              Tu banco esta conectado. Suscribete para ver todas tus transacciones, analisis y reportes.
            </p>
          </div>

          {/* Plans */}
          <div className="space-y-3">
            {/* Monthly */}
            <button
              onClick={() => navigate("/settings?renew=monthly")}
              className="w-full flex items-center gap-3 p-4 border-2 border-emerald-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <CalendarDays className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-black">Plan Mensual</p>
                <p className="text-xs text-neutral-500">$1/mes — Cancela cuando quieras</p>
              </div>
              <ArrowRight className="w-4 h-4 text-neutral-400" />
            </button>

            {/* Annual */}
            <button
              onClick={() => navigate("/settings?renew=annual")}
              className="w-full flex items-center gap-3 p-4 border-2 border-yellow-400 rounded-xl hover:border-yellow-500 hover:bg-yellow-50/50 transition-all text-left bg-yellow-50/30"
            >
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-black">Plan Anual</p>
                <p className="text-xs text-neutral-500">$800/año — <span className="text-emerald-600 font-medium">Ahorras $400</span></p>
              </div>
              <div className="shrink-0">
                <span className="text-[10px] bg-yellow-400 text-black px-2 py-0.5 rounded-full font-medium">Mejor valor</span>
              </div>
            </button>
          </div>

          {/* Features */}
          <div className="space-y-2">
            <p className="text-xs text-neutral-500 font-medium">Incluido en tu suscripcion:</p>
            <ul className="space-y-1.5">
              {[
                "Transacciones ilimitadas",
                "Balance en tiempo real",
                "Reportes mensuales y anuales",
                "Categorizacion automatica con IA",
                "Soporte prioritario",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-neutral-600">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <p className="text-[10px] text-neutral-400 text-center">
            Al suscribirte, aceptas los terminos de servicio de AI Aethel Accountant.
          </p>
        </div>
      </div>
    );
  }

  // PHASE 3: Has subscription — show content normally
  return <>{children}</>;
}
