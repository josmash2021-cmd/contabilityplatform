import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Crown, Loader2, Check, CheckCircle, AlertTriangle, Receipt, ExternalLink, Zap, CalendarDays, RefreshCw } from "lucide-react";

// Business plans (original)
const BUSINESS_MONTHLY = {
  id: "monthly" as const,
  name: "Mensual",
  price: "$1",
  originalPrice: "$80",
  period: "/mes",
  fullPrice: 1,
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
  price: "$40",
  originalPrice: "$80",
  period: "/mes",
  fullPrice: 40,
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
  // KEY FIX: Poll every 5 seconds for subscription status.
  // When a user pays via Stripe but the webhook hasn't arrived yet,
  // the status endpoint searches Stripe directly and finds the subscription.
  const { data: status, isLoading: statusLoading } = trpc.subscription.status.useQuery(
    undefined,
    { refetchInterval: 5000, refetchIntervalInBackground: true }
  );
  const { data: payments } = trpc.subscription.payments.useQuery();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Force sync when returning from Stripe payment
  const debugQuery = trpc.subscription.debug.useQuery(undefined, { enabled: false });

  const forceSyncMut = trpc.subscription.forceSync.useMutation({
    onSuccess: (data) => {
      setSyncing(false);
      // Always refetch status after forceSync
      utils.subscription.status.refetch();
      if (data.found) {
        toast.success(data.message || "Suscripcion verificada");
      } else {
        console.log("[forceSync]", data.message);
      }
    },
    onError: (err) => {
      setSyncing(false);
      toast.error(err.message || "Error al verificar");
    },
  });

  // Auto-sync on mount — always try to sync from Stripe
  useEffect(() => {
    // If we have URL param from Stripe, clean it
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Always try to sync on mount (for users who paid but webhook failed)
    const timer = setTimeout(() => {
      if (!status?.active) {
        setSyncing(true);
        forceSyncMut.mutate();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

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

  const upgradeMut = trpc.subscription.upgrade.useMutation({
    onSuccess: (data) => {
      utils.subscription.status.invalidate();
      utils.subscription.payments.invalidate();
      toast.success(data.message || "Upgrade completado");
    },
    onError: (err) => toast.error(err.message),
  });

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  // ─── ACTIVE SUBSCRIBER VIEW ───
  if (status?.active) {
    const currentPlan = status.plan === "monthly" ? PLAN_MONTHLY : PLAN_ANNUAL;
    const otherPlan = status.plan === "monthly" ? PLAN_ANNUAL : PLAN_MONTHLY;
    const isMonthly = status.plan === "monthly";

    return (
      <div className="space-y-6">
        {/* Success message after upgrade */}
        {upgradeSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">Suscripcion aplicada con exito. Ahora tienes el plan Anual.</p>
          </div>
        )}

        {/* Current Plan Card */}
        <div className="border-2 border-emerald-200 bg-emerald-50/50 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-yellow-400 flex items-center justify-center bg-yellow-50"><Crown className="w-4 h-4 text-yellow-600" /></div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-black">Suscripcion actual: {isMonthly ? "Mensual" : "Anual"}</h3>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Activo</Badge>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {status.currentPeriodEnd
                    ? `Vence el ${new Date(status.currentPeriodEnd).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}`
                    : "Acceso completo activo"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-medium text-black">{currentPlan.price}</p>
              <p className="text-[10px] text-neutral-400">{currentPlan.period}</p>
            </div>
          </div>

          {status.cancelAtPeriodEnd && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                Tu plan se cancelara automaticamente al final del periodo actual.
                Seguiras teniendo acceso hasta esa fecha.
              </p>
            </div>
          )}

          {/* Manage billing & cancel */}
          {!status.cancelAtPeriodEnd && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => portalMut.mutate()}
                disabled={portalMut.isPending}
                className="border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs h-8"
              >
                {portalMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                Gestionar tarjeta y facturacion
              </Button>

              {!confirmCancel ? (
                <Button
                  variant="outline"
                  onClick={() => setConfirmCancel(true)}
                  className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                >
                  Cancelar Plan
                </Button>
              ) : (
                <div className="space-y-2 w-full">
                  <p className="text-xs text-neutral-500">¿Seguro? Tu acceso sigue hasta el final del periodo pagado.</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmCancel(false)}
                      className="text-xs h-8 border-neutral-200"
                    >
                      Volver
                    </Button>
                    <Button
                      onClick={() => cancelMut.mutate()}
                      disabled={cancelMut.isPending}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs h-8"
                    >
                      {cancelMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar cancelacion"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* No downgrade message — Only for annual subscribers */}
        {!isMonthly && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700">
              <strong>Plan Anual activo.</strong> No es posible cambiar a mensual. El plan anual no tiene devolucion.
            </p>
          </div>
        )}

        {/* Upgrade Section — Only for monthly subscribers */}
        {isMonthly && (
          <div className="space-y-3">
            {!showUpgrade ? (
              <Button
                onClick={() => setShowUpgrade(true)}
                variant="outline"
                className="w-full h-9 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <Zap className="w-4 h-4 mr-1.5" /> Upgrade plan
              </Button>
            ) : (
              <>
                <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Upgrade a Anual</h4>
                <Card className="border-emerald-200 shadow-none bg-emerald-50/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Zap className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="text-sm font-medium text-black">Plan Anual</p>
                          <p className="text-xs text-neutral-400">{PLAN_ANNUAL.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-medium text-black">{PLAN_ANNUAL.price}</p>
                        <p className="text-[10px] text-neutral-400 line-through">{PLAN_ANNUAL.originalPrice}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-1 rounded">{PLAN_ANNUAL.savings}</p>
                    <p className="text-[11px] text-neutral-500">
                      Solo pagas <strong>${PLAN_ANNUAL.fullPrice - PLAN_MONTHLY.fullPrice}</strong> de diferencia. Los <strong>{PLAN_MONTHLY.price}</strong> ya pagados se aplican como credito.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowUpgrade(false)}
                        className="flex-1 h-9 text-xs border-neutral-200"
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => {
                          upgradeMut.mutate({ from: "monthly", to: "annual" }, {
                            onSuccess: (data) => {
                              if (data.success) {
                                setUpgradeSuccess(true);
                                setShowUpgrade(false);
                                utils.subscription.status.invalidate();
                                utils.subscription.payments.invalidate();
                                setTimeout(() => setUpgradeSuccess(false), 5000);
                              } else {
                                toast.error(data.error || "Error al procesar");
                              }
                            },
                            onError: (err) => {
                              toast.error(err.message || "Tarjeta declinada. Verifica tu metodo de pago.");
                            },
                          });
                        }}
                        disabled={upgradeMut.isPending}
                        className="flex-1 bg-black hover:bg-neutral-800 text-white h-9 text-xs"
                      >
                        {upgradeMut.isPending ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Procesando...</>
                        ) : (
                          `Pagar $${PLAN_ANNUAL.fullPrice - PLAN_MONTHLY.fullPrice}`
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Payment History */}
        {payments && payments.length > 0 && (
          <div className="border-t border-neutral-100 pt-4">
            <h4 className="text-xs font-medium text-black mb-3 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-neutral-400" /> Historial de pagos
            </h4>
            <div className="space-y-1.5">
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
          </div>
        )}
      </div>
    );
  }

  // ─── NO SUBSCRIPTION — SHOW PLANS ───
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          Configura tu plan para desbloquear el acceso completo a Accounting Platform.
        </p>
        {/* Force sync button for users who already paid */}
        <Button
          onClick={() => { setSyncing(true); forceSyncMut.mutate(); }}
          disabled={syncing}
          variant="outline"
          className="text-xs h-7 px-2 border-neutral-200"
        >
          {syncing ? (
            <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Verificando...</>
          ) : (
            <><RefreshCw className="w-3 h-3 mr-1" /> Verificar mi suscripcion</>
          )}
        </Button>
        <Button
          onClick={() => debugQuery.refetch()}
          variant="ghost"
          className="text-xs h-7 px-2 text-neutral-400"
        >
          Debug
        </Button>
      </div>

      {/* Debug panel */}
      {debugQuery.data && (
        <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-[10px] font-mono text-neutral-600 overflow-auto max-h-[300px]">
          <p className="font-semibold text-neutral-800 mb-1">Debug Info:</p>
          <p>userId: {(debugQuery.data as any).userId} (type: {(debugQuery.data as any).userIdType})</p>
          <p>email: {(debugQuery.data as any).userEmail}</p>
          <p className="mt-1">DB subs: {(debugQuery.data as any).dbSubs?.length ?? 0}</p>
          {(debugQuery.data as any).dbSubs?.map((s: any, i: number) => (
            <p key={i} className="ml-2">- {s.plan} | {s.status} | sub:{s.stripeSubId?.slice(0,8)} | cust:{s.stripeCustId?.slice(0,8)}</p>
          ))}
          <p className="mt-1">Stripe found: {(debugQuery.data as any).stripeFound ? "YES" : "NO"}</p>
          {(debugQuery.data as any).stripeFound && (
            <>
              <p>cust: {(debugQuery.data as any).stripeCustomerId?.slice(0,12)}</p>
              <p>subs: {(debugQuery.data as any).stripeSubs?.length}</p>
              {(debugQuery.data as any).stripeSubs?.map((s: any, i: number) => (
                <p key={i} className="ml-2">- {s.status} | ${s.plan} | {s.id?.slice(0,12)}</p>
              ))}
            </>
          )}
          {(debugQuery.data as any).stripeError && (
            <p className="text-red-500">Stripe error: {(debugQuery.data as any).stripeError}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly */}
        <button
          onClick={() => setSelectedPlan("monthly")}
          className={`text-left border rounded-lg p-5 space-y-4 transition-all cursor-pointer relative ${
            selectedPlan === "monthly" ? "border-2 border-black ring-1 ring-black" : "border-neutral-200 hover:border-neutral-300"
          }`}
        >
          {PLAN_MONTHLY.badge && (
            <div className="absolute -top-2.5 right-4">
              <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">{PLAN_MONTHLY.badge}</Badge>
            </div>
          )}
          <div>
            <h4 className="text-sm font-medium text-black">{PLAN_MONTHLY.name}</h4>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-medium text-black">{PLAN_MONTHLY.price}</span>
              <span className="text-xs text-neutral-400 line-through">{PLAN_MONTHLY.originalPrice}</span>
              <span className="text-xs text-neutral-400">{PLAN_MONTHLY.period}</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">{PLAN_MONTHLY.description}</p>
          </div>
          <ul className="space-y-1.5">
            {PLAN_MONTHLY.features.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600">
                <Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <Button
            onClick={(e) => { e.stopPropagation(); createCheckout.mutate({ plan: "monthly" }); }}
            disabled={createCheckout.isPending}
            className={`w-full h-9 text-xs ${
              selectedPlan === "monthly" ? "bg-black hover:bg-neutral-800 text-white" : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
            }`}
          >
            {createCheckout.isPending && createCheckout.variables?.plan === "monthly" ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Procesando...</>
            ) : (
              "Suscribirse Mensual"
            )}
          </Button>
        </button>

        {/* Annual */}
        <button
          onClick={() => setSelectedPlan("annual")}
          className={`text-left border rounded-lg p-5 space-y-4 transition-all cursor-pointer relative ${
            selectedPlan === "annual" ? "border-2 border-black ring-1 ring-black" : "border-neutral-200 hover:border-neutral-300"
          }`}
        >
          {PLAN_ANNUAL.badge && (
            <div className="absolute -top-2.5 right-4">
              <Badge className="bg-black text-white text-[10px] px-2 py-0.5">{PLAN_ANNUAL.badge}</Badge>
            </div>
          )}
          <div>
            <h4 className="text-sm font-medium text-black">{PLAN_ANNUAL.name}</h4>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-medium text-black">{PLAN_ANNUAL.price}</span>
              <span className="text-xs text-neutral-400 line-through">{PLAN_ANNUAL.originalPrice}</span>
            </div>
            <p className="text-[11px] text-emerald-700 font-medium mt-1">{PLAN_ANNUAL.savings}</p>
            <p className="text-[11px] text-neutral-400 mt-1">{PLAN_ANNUAL.description}</p>
          </div>
          <ul className="space-y-1.5">
            {PLAN_ANNUAL.features.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-[11px] text-neutral-600">
                <Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <Button
            onClick={(e) => { e.stopPropagation(); createCheckout.mutate({ plan: "annual" }); }}
            disabled={createCheckout.isPending}
            className={`w-full h-9 text-xs ${
              selectedPlan === "annual" ? "bg-black hover:bg-neutral-800 text-white" : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
            }`}
          >
            {createCheckout.isPending && createCheckout.variables?.plan === "annual" ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Procesando...</>
            ) : (
              "Suscribirse Anual"
            )}
          </Button>
        </button>
      </div>
    </div>
  );
}
