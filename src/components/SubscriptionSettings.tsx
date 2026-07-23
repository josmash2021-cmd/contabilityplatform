import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router";
import { useSubscriptionAgent } from "@/hooks/useSubscriptionAgent";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { toast } from "sonner";
import { Crown, Loader2, Check, CheckCircle, AlertTriangle, Receipt, ExternalLink, Zap, ChevronDown, RefreshCw } from "lucide-react";

// ── Shimmer animation styles for subscription titles ──
const SHIMMER_CSS = `
  @keyframes shimmer-silver {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes shimmer-elite {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .shimmer-premium {
    background: linear-gradient(90deg, #9ca3af 0%, #d1d5db 25%, #f3f4f6 50%, #d1d5db 75%, #9ca3af 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer-silver 3s linear infinite;
  }
  .shimmer-elite {
    background: linear-gradient(90deg, #000000 0%, #4b5563 25%, #9ca3af 50%, #4b5563 75%, #000000 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer-elite 3s linear infinite;
  }
`;

// Business plans (original)
const BUSINESS_MONTHLY = {
  id: "monthly" as const,
  name: "Mensual",
  price: "$495",
  originalPrice: "$120",
  period: "/mes",
  fullPrice: 495,
  description: "Facturado mensualmente. Cancela cuando quieras.",
  badge: "New Plan",
  features: [
    "Agente de contabilidad AI personalizado",
    "Contabilidad completa del negocio",
    "Manejo y almacenamiento de clientes",
    "Seguimiento de clientes integrado",
    "Contabilidad bancaria conectada",
    "Soporte prioritario 24/7",
    "Pagos y registros simplificados",
    "Finanzas organizadas automaticamente",
  ],
};

const BUSINESS_ANNUAL = {
  id: "annual" as const,
  name: "Anual",
  price: "$800",
  period: "/año",
  originalPrice: "$1200",
  savings: "Ahorras $400",
  fullPrice: 800,
  description: "Facturado anualmente. Cancela cuando quieras.",
  badge: "Mejor valor",
  features: [
    "Todo lo incluido en el plan Mensual",
    "Agente de contabilidad AI ilimitado",
    "Clientes ilimitados en tu base de datos",
    "Hasta 3 usuarios (tu + empleados)",
    "Reportes contables exportables (PDF / Excel)",
    "Recordatorios automaticos a clientes",
    "Backups diarios automaticos",
    "Soporte prioritario VIP",
  ],
  highlighted: true,
};

// Personal plans (discounted)
const PERSONAL_MONTHLY = {
  id: "monthly_personal" as const,
  name: "Mensual",
  price: "$495",
  originalPrice: "$80",
  period: "/mes",
  fullPrice: 495,
  description: "Facturado mensualmente. Cancela cuando quieras.",
  badge: "Oferta",
  features: [
    "Agente de contabilidad AI personal",
    "Toda tu contabilidad personal organizada",
    "Seguimiento de ingresos y gastos",
    "Metas de ahorro con IA",
    "Reportes financieros automaticos",
    "Soporte dedicado 24/7",
  ],
};

const PERSONAL_ANNUAL = {
  id: "annual_personal" as const,
  name: "Anual",
  price: "$400",
  period: "/año",
  originalPrice: "$700",
  savings: "Ahorras $300",
  fullPrice: 400,
  description: "Facturado anualmente. Cancela cuando quieras.",
  badge: "Mejor valor",
  features: [
    "Todo lo incluido en el plan Mensual",
    "Categorias ilimitadas",
    "Reportes exportables (PDF / Excel)",
    "Recordatorios automaticos",
    "Backups diarios automaticos",
    "Soporte prioritario",
  ],
  highlighted: true,
};

export default function SubscriptionSettings() {
  const { user } = useAuth();
  const isPersonal = user?.modePreference === "personal";

  const PLAN_MONTHLY = isPersonal ? PERSONAL_MONTHLY : BUSINESS_MONTHLY;
  const PLAN_ANNUAL = isPersonal ? PERSONAL_ANNUAL : BUSINESS_ANNUAL;

  const utils = trpc.useUtils();
  const [searchParams] = useSearchParams();
  const renewParam = searchParams.get("renew"); // "monthly" or "annual" from overlay

  // KEY FIX: Poll every 5 seconds for subscription status.
  // When a user pays via Stripe but the webhook hasn't arrived yet,
  // the status endpoint searches Stripe directly and finds the subscription.
  const { data: status, isLoading: statusLoading } = trpc.subscription.status.useQuery(
    undefined,
    { refetchInterval: 5000, refetchIntervalInBackground: true }
  );
  const { data: payments } = trpc.subscription.payments.useQuery();

  // Subscription Recovery Agent — auto-detects lost subs and auto-reverts failed upgrades
  useSubscriptionAgent();

  // Handle returning from Stripe Checkout upgrade
  const completeUpgradeMut = trpc.subscription.completeUpgrade.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setUpgradeSuccess(true);
        utils.subscription.status.invalidate();
        utils.subscription.payments.invalidate();
        // Clean URL
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        toast.error(data.error || "El upgrade no pudo completarse");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Error al completar el upgrade");
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") === "success") {
      // Coming back from Stripe Checkout after payment — complete the upgrade
      completeUpgradeMut.mutate();
    } else if (params.get("upgrade") === "cancelled") {
      // User cancelled at Stripe
      window.history.replaceState({}, "", window.location.pathname);
      toast.error("Pago cancelado. Tu suscripcion mensual sigue activa.");
    }
  }, []);

  const [selectedPlan, setSelectedPlan] = useState<string | null>(renewParam);

  // Pre-select plan from URL ?renew= parameter (from expired overlay)
  useEffect(() => {
    if (renewParam) {
      setSelectedPlan(renewParam);
    }
    // Clean URL param from Stripe redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [renewParam]);

  const createCheckout = trpc.subscription.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("No se pudo iniciar el pago");
      }
    },
    onError: (err) => {
      console.error("Checkout error:", err);
      toast.error(err.message || "Error al iniciar el pago. Intenta de nuevo.");
    },
  });

  const cancelMut = trpc.subscription.cancel.useMutation({
    onSuccess: () => {
      utils.subscription.status.invalidate();
      utils.subscription.payments.invalidate();
      toast.success("Plan cancelado. Sigues con acceso hasta el final del periodo.");
    },
    onError: (err) => toast.error(err.message),
  });

  const portalMut = trpc.subscription.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("No se pudo abrir el portal de facturacion");
      }
    },
    onError: (err) => toast.error(err.message || "Error al abrir el portal"),
  });

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const upgradeMut = trpc.subscription.upgrade.useMutation({
    onSuccess: (data) => {
      utils.subscription.status.invalidate();
      utils.subscription.payments.invalidate();
      if (data.success) {
        setUpgradeSuccess(true);
        setShowUpgrade(false);
        toast.success("✓ " + data.message);
      } else {
        // Upgrade failed but monthly subscription is still active
        toast.error(data.error || "El upgrade no pudo completarse", { duration: 5000 });
      }
    },
    onError: (err) => {
      // Upgrade failed but monthly subscription is still active
      toast.error(err.message + " Tu suscripcion mensual sigue activa.", { duration: 5000 });
    },
  });

  // ── Resume subscription — Re-activate a cancelled subscription ──
  const resumeMut = trpc.subscription.resume.useMutation({
    onSuccess: (data) => {
      utils.subscription.status.invalidate();
      utils.subscription.payments.invalidate();
      toast.success(data.message || "Suscripcion reanudada exitosamente");
    },
    onError: (err) => {
      toast.error(err.message || "No se pudo reanudar la suscripcion");
    },
  });

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  // ─── ACTIVE SUBSCRIBER VIEW — same card design as overlay ───
  if (status?.active) {
    const currentPlan = status.plan === "monthly" ? PLAN_MONTHLY : PLAN_ANNUAL;
    const isMonthly = status.plan === "monthly";

    return (
      <div className="space-y-4">
        {/* Success message after upgrade */}
        {upgradeSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">Suscripcion aplicada con exito. Ahora tienes el plan Anual.</p>
          </div>
        )}

        {/* Cancel warning + Resume button */}
        {status.cancelAtPeriodEnd && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                Tu plan se cancelara automaticamente al final del periodo actual.
                Puedes reanudarla ahora y seguir disfrutando de todos los beneficios.
              </p>
            </div>
            <Button
              onClick={() => resumeMut.mutate()}
              disabled={resumeMut.isPending}
              className="w-full h-9 bg-black hover:bg-neutral-800 text-white text-xs font-medium"
            >
              {resumeMut.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Reanudando...</>
              ) : (
                <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Reanudar suscripcion</>
              )}
            </Button>
          </div>
        )}

        {/* Current Plan Card — Same design as subscription cards */}
        <div className="border rounded-xl p-6 bg-white relative flex flex-col">
          {/* Active badge */}
          <div className="absolute -top-2.5 right-3">
            <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">Activo</Badge>
          </div>

          {/* Crown icon */}
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${isMonthly ? "border-gray-400" : "border-black bg-neutral-100 shadow-sm"}`}>
              <Crown className={`w-4 h-4 ${isMonthly ? "text-gray-400" : "text-black drop-shadow-sm"}`} />
            </div>
          </div>

          {/* Plan name as main title */}
          <div className="mt-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Suscripcion {isMonthly ? "Premium" : "Elite"}</p>
            <h3 className="text-xl font-semibold text-black">{currentPlan.name}</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-medium text-black">{currentPlan.price}</span>
              <span className="text-xs text-neutral-400 line-through">{currentPlan.originalPrice}</span>
              <span className="text-xs text-neutral-400">{currentPlan.period}</span>
            </div>
            {currentPlan.savings && (
              <p className="text-[11px] text-emerald-700 font-medium mt-1 bg-emerald-50 px-2 py-0.5 rounded inline-block">{currentPlan.savings}</p>
            )}
            <p className="text-[11px] text-neutral-500 mt-1">
              {status.currentPeriodEnd
                ? `Vence el ${new Date(status.currentPeriodEnd).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}`
                : currentPlan.description}
            </p>
          </div>

          {/* Features list */}
          <ul className="space-y-0.5 mt-2 flex-1">
            {currentPlan.features.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600 leading-tight">
                <Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {/* Action buttons — only for monthly */}
          {!status.cancelAtPeriodEnd && isMonthly && (
            <>
              <div className="mt-6" />
              {!confirmCancel ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => portalMut.mutate()}
                    disabled={portalMut.isPending}
                    className="border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs h-9 flex-1"
                  >
                    {portalMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                    Gestionar tarjeta
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmCancel(true)}
                    className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-9 flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 w-full">
                  <p className="text-xs text-neutral-500">¿Seguro? Tu acceso sigue hasta el final del periodo.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setConfirmCancel(false)} className="text-xs h-9 border-neutral-200 flex-1">Volver</Button>
                    <Button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending} className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 flex-1">
                      {cancelMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Annual no-cancel message */}
          {!isMonthly && (
            <>
              <div className="mt-6" />
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700"><strong>Plan Anual activo.</strong> No es posible cambiar a mensual. El plan anual no tiene devolucion.</p>
              </div>
            </>
          )}
        </div>

        {/* Upgrade Section — Only for monthly subscribers */}
        {isMonthly && (
          <div className="space-y-3">
            {!showUpgrade ? (
              <Button onClick={() => setShowUpgrade(true)} className="w-full h-9 text-xs bg-black hover:bg-neutral-800 text-white">
                <Zap className="w-4 h-4 mr-1.5" /> Upgrade plan
              </Button>
            ) : (
              /* Upgrade Card — Same design */
              <div className="border rounded-xl p-6 bg-white relative flex flex-col">
                <div className="absolute -top-2.5 right-3">
                  <Badge className="bg-yellow-400 text-black text-[10px] px-2 py-0.5 font-medium">Upgrade</Badge>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center bg-neutral-100 shadow-sm">
                    <Crown className="w-4 h-4 text-black drop-shadow-sm" />
                  </div>
                </div>

                <div className="mt-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Suscripcion Elite</p>
                  <h3 className="text-xl font-semibold text-black">Anual</h3>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-medium text-black">{PLAN_ANNUAL.price}</span>
                    <span className="text-xs text-neutral-400 line-through">{PLAN_ANNUAL.originalPrice}</span>
                    <span className="text-xs text-neutral-400">{PLAN_ANNUAL.period}</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-medium mt-1 bg-emerald-50 px-2 py-0.5 rounded inline-block">{PLAN_ANNUAL.savings}</p>
                  <p className="text-[11px] text-neutral-500 mt-1">{PLAN_ANNUAL.description}</p>
                </div>

                <ul className="space-y-0.5 mt-2 flex-1">
                  {PLAN_ANNUAL.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600 leading-tight">
                      <Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <p className="text-[11px] text-neutral-500 mt-3">
                  Solo pagas <strong>${PLAN_ANNUAL.fullPrice - PLAN_MONTHLY.fullPrice}</strong> de diferencia. Los <strong>{PLAN_MONTHLY.price}</strong> ya pagados se aplican como credito.
                </p>

                <div className="mt-6" />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setShowUpgrade(false)} className="border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs h-9 flex-1">Cancelar</Button>
                  <Button
                    onClick={() => upgradeMut.mutate({ from: "monthly", to: "annual" }, {
                      onSuccess: (data) => { if (data.success && data.url) window.location.href = data.url; },
                    })}
                    disabled={upgradeMut.isPending}
                    className="bg-black hover:bg-neutral-800 text-white text-xs h-9 flex-1"
                  >
                    {upgradeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Crown className="w-3.5 h-3.5 text-yellow-500 mr-1" />}
                    Upgrade a Anual
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Payment History — Collapsible */}
        {payments && payments.length > 0 && (
          <div className="border-t border-neutral-100 pt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between text-left"
            >
              <h4 className="text-xs font-medium text-black flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-neutral-400" /> Historial de pagos
              </h4>
              <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${showHistory ? "rotate-180" : ""}`} />
            </button>
            {showHistory && (
              <div className="space-y-1.5 mt-3">
                {payments.map((p: typeof payments[0]) => (
                  <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-black font-medium">${p.amount}</span>
                      <span className="text-neutral-400">{p.plan === "monthly" ? "Mensual" : "Anual"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-400">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString("es") : "-"}
                      </span>
                      {p.status === "succeeded" ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                      )}
                      {p.receiptUrl && (
                        <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-black">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── NO SUBSCRIPTION — SHOW PLANS (same design as SubscriptionGate overlay) ───
  const wasBroken = status?.status === "past_due" || status?.status === "incomplete" || status?.status === "unpaid";

  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <div className="space-y-6">
        {wasBroken ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
            <p className="text-sm text-amber-800 font-medium">Suscripcion interrumpida</p>
            <p className="text-xs text-amber-700">
              Tu suscripcion anterior fue cancelada por un problema de pago.
              Selecciona el plan Mensual y suscribete de nuevo — tu tarjeta sera cobrada automaticamente.
            </p>
          </div>
        ) : (
          <p className="text-xs text-neutral-400">
            Configura tu plan para desbloquear el acceso completo a Accounting Platform.
          </p>
        )}

        <div className="flex flex-col md:flex-row gap-3 justify-center items-stretch">
          {/* Monthly — Premium */}
          <div className="border rounded-xl p-6 bg-white relative md:w-[400px] flex-shrink-0 flex flex-col">
            {PLAN_MONTHLY.badge && (
              <div className="absolute -top-2.5 right-3">
                <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">{PLAN_MONTHLY.badge}</Badge>
              </div>
            )}
            {/* Silver crown */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-gray-400 flex items-center justify-center bg-transparent">
                <Crown className="w-4 h-4 text-gray-400" />
              </div>
            </div>
            <div className="mt-2">
              {/* Subtitle */}
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Suscripcion Premium</p>
              {/* Plan name as main title */}
              <h3 className="text-xl font-semibold text-black">{PLAN_MONTHLY.name}</h3>
              {/* Price */}
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-medium text-black">{PLAN_MONTHLY.price}</span>
                <span className="text-xs text-neutral-400 line-through">{PLAN_MONTHLY.originalPrice}</span>
                <span className="text-xs text-neutral-400">{PLAN_MONTHLY.period}</span>
              </div>
              {/* Description */}
              <p className="text-[11px] text-neutral-500 mt-1">{PLAN_MONTHLY.description}</p>
            </div>
            {/* Features */}
            <ul className="space-y-0.5 mt-2 flex-1">
              {PLAN_MONTHLY.features.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600 leading-tight">
                  <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {/* Spacer + Button */}
            <div className="mt-6" />
            <Button
              onClick={() => createCheckout.mutate({ plan: "monthly" })}
              disabled={createCheckout.isPending}
              className="w-full h-9 bg-black hover:bg-neutral-800 text-white text-xs font-medium flex items-center justify-center gap-2"
            >
              {createCheckout.isPending && createCheckout.variables?.plan === "monthly" ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...</>
              ) : (
                <><Crown className="w-3.5 h-3.5 text-gray-300" /> Suscribirse Mensual</>
              )}
            </Button>
          </div>

          {/* Annual — Elite */}
          <div className="border rounded-xl p-6 bg-white relative md:w-[400px] flex-shrink-0 flex flex-col">
            {PLAN_ANNUAL.badge && (
              <div className="absolute -top-2.5 right-3">
                <Badge className="bg-yellow-400 text-black text-[10px] px-2 py-0.5 font-medium">{PLAN_ANNUAL.badge}</Badge>
              </div>
            )}
            {/* Black crown */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center bg-neutral-100 shadow-sm">
                <Crown className="w-4 h-4 text-black drop-shadow-sm" />
              </div>
            </div>
            <div className="mt-2">
              {/* Subtitle */}
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Suscripcion Elite</p>
              {/* Plan name as main title */}
              <h3 className="text-xl font-semibold text-black">{PLAN_ANNUAL.name}</h3>
              {/* Price */}
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-medium text-black">{PLAN_ANNUAL.price}</span>
                <span className="text-xs text-neutral-400 line-through">{PLAN_ANNUAL.originalPrice}</span>
                <span className="text-xs text-neutral-400">{PLAN_ANNUAL.period}</span>
              </div>
              {/* Savings */}
              {PLAN_ANNUAL.savings && (
                <p className="text-[11px] text-emerald-700 font-medium mt-1 bg-emerald-50 px-2 py-0.5 rounded inline-block">{PLAN_ANNUAL.savings}</p>
              )}
              {/* Description */}
              <p className="text-[11px] text-neutral-500 mt-1">{PLAN_ANNUAL.description}</p>
            </div>
            {/* Features */}
            <ul className="space-y-0.5 mt-2 flex-1">
              {PLAN_ANNUAL.features.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600 leading-tight">
                  <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {/* Spacer + Button */}
            <div className="mt-6" />
            <Button
              onClick={() => createCheckout.mutate({ plan: "annual" })}
              disabled={createCheckout.isPending}
              className="w-full h-9 bg-black hover:bg-neutral-800 text-white text-xs font-medium flex items-center justify-center gap-2"
            >
              {createCheckout.isPending && createCheckout.variables?.plan === "annual" ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...</>
              ) : (
                <><Crown className="w-3.5 h-3.5 text-yellow-500" /> Suscribirse Anual</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
