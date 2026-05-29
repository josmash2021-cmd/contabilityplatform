import { useState, useRef, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { getCancelGuide } from "@/lib/cancelGuides";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import {
  Tv, CreditCard, Landmark, Building2, ChevronDown,
  Music, Film, Car, Droplets, Zap, Shield, ExternalLink,
  Smartphone, Wifi, HardHat, Dumbbell, Cloud, Newspaper,
  Fuel, ParkingCircle, AlertTriangle, CheckCircle, RotateCcw,
  Bell, Mail, CalendarClock, X, RefreshCw, CalendarDays, ChevronRight,
  Database, ArrowUpCircle, Link2,
} from "lucide-react";

type FilterType = "all" | "membership" | "monthly_payment" | "credit_card";

/** Account Dropdown */
function AccountDropdown({ accounts, selectedId, onChange }: { accounts: Array<{ id: number; bankName: string | null; accountType: string | null; currentBalance: string | null }>; selectedId: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } if (open) document.addEventListener("mousedown", handle); return () => document.removeEventListener("mousedown", handle); }, [open]);
  const selected = accounts.find((a) => String(a.id) === selectedId);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 h-9 px-3 border border-neutral-200 rounded-md bg-white text-sm hover:border-neutral-300 transition-colors">
        <Building2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="truncate max-w-[100px]">{selected?.bankName ?? "Cuenta"}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 py-1">
          {accounts.map((acc) => (
            <button key={acc.id} onClick={() => { onChange(String(acc.id)); setOpen(false); }} className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${String(acc.id) === selectedId ? "bg-neutral-100 text-black font-medium" : "text-neutral-600 hover:bg-neutral-50"}`}>
              <div className="flex items-center gap-2 min-w-0"><Landmark className="w-3.5 h-3.5 text-neutral-400 shrink-0" /><span className="truncate">{acc.bankName} {acc.accountType ? `(${acc.accountType})` : ""}</span></div>
              <span className="text-xs font-medium text-black shrink-0 ml-2">{formatCurrency(parseFloat(acc.currentBalance ?? "0"))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getSubIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("netflix")) return { icon: Film, bg: "bg-red-100", color: "text-red-600" };
  if (n.includes("spotify") || n.includes("apple music") || n.includes("youtube music")) return { icon: Music, bg: "bg-green-100", color: "text-green-600" };
  if (n.includes("disney") || n.includes("hulu") || n.includes("hbo") || n.includes("paramount") || n.includes("peacock") || n.includes("prime") || n.includes("crunchyroll") || n.includes("twitch") || n.includes("youtube tv") || n.includes("starz") || n.includes("showtime")) return { icon: Tv, bg: "bg-blue-100", color: "text-blue-600" };
  if (n.includes("verizon") || n.includes("at&t") || n.includes("t-mobile") || n.includes("tmobile") || n.includes("sprint") || n.includes("cricket") || n.includes("metro") || n.includes("boost") || n.includes("mint") || n.includes("visible")) return { icon: Smartphone, bg: "bg-indigo-100", color: "text-indigo-600" };
  if (n.includes("comcast") || n.includes("xfinity") || n.includes("spectrum") || n.includes("cox") || n.includes("fios") || n.includes("frontier") || n.includes("centurylink")) return { icon: Wifi, bg: "bg-sky-100", color: "text-sky-600" };
  if (n.includes("geico") || n.includes("state farm") || n.includes("progressive") || n.includes("allstate") || n.includes("farmers") || n.includes("nationwide") || n.includes("usaa")) return { icon: Shield, bg: "bg-violet-100", color: "text-violet-600" };
  if (n.includes("blue cross") || n.includes("anthem") || n.includes("aetna") || n.includes("cigna") || n.includes("humana") || n.includes("kaiser")) return { icon: Shield, bg: "bg-teal-100", color: "text-teal-600" };
  // Car washes (expanded)
  if (n.includes("car wash") || n.includes("autowash") || n.includes("tunnel wash") || n.includes("self serve wash") || n.includes("quick quack") || n.includes("zips car") || n.includes("mister car") || n.includes("brown bear") || n.includes("super wash")) return { icon: Car, bg: "bg-cyan-100", color: "text-cyan-600" };
  if (n.includes("ezpass") || n.includes("sunpass") || n.includes("toll")) return { icon: ParkingCircle, bg: "bg-orange-100", color: "text-orange-600" };
  // Gyms & fitness (expanded)
  if (n.includes("planet fit") || n.includes("la fitness") || n.includes("equinox") || n.includes("crunch") || n.includes("ymca") || n.includes("orange theory") || n.includes("soulcycle") || n.includes("peloton") || n.includes("gym") || n.includes("fitness") || n.includes("24 hour") || n.includes("gold gym")) return { icon: Dumbbell, bg: "bg-emerald-100", color: "text-emerald-600" };
  // AI services (expanded with kimi, claude, anthropic)
  if (n.includes("adobe") || n.includes("microsoft") || n.includes("office 365") || n.includes("google one") || n.includes("icloud") || n.includes("dropbox") || n.includes("slack") || n.includes("zoom") || n.includes("canva") || n.includes("chatgpt") || n.includes("openai") || n.includes("kimi") || n.includes("claude") || n.includes("anthropic") || n.includes("midjourney")) return { icon: Cloud, bg: "bg-purple-100", color: "text-purple-600" };
  if (n.includes("new york times") || n.includes("wall street") || n.includes("washington post") || n.includes("medium") || n.includes("substack") || n.includes("patreon")) return { icon: Newspaper, bg: "bg-pink-100", color: "text-pink-600" };
  if (n.includes("affirm") || n.includes("klarna") || n.includes("afterpay")) return { icon: CreditCard, bg: "bg-amber-100", color: "text-amber-600" };
  return { icon: CreditCard, bg: "bg-neutral-100", color: "text-neutral-600" };
}

function getNextChargeDate(lastDate: string): string {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString("es", { day: "numeric", month: "long" });
}

export default function PersonalSubscriptions() {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [tab, setTab] = useState<"guide" | "email" | "tips">("guide");
  const [filter, setFilter] = useState<FilterType>("all");
  const [showAll, setShowAll] = useState(false);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [detailSub, setDetailSub] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "3months" | "6months" | "12months">("all");
  const [showPlaidOverlay, setShowPlaidOverlay] = useState(false);
  const utils = trpc.useUtils();

  // Check if bank is connected
  const { data: bankConnection, isLoading: isCheckingBank } = trpc.bank.checkConnection.useQuery(undefined, {
    staleTime: 30000,
  });
  const hasBankConnected = bankConnection?.hasBank === true;

  const { data: accounts } = trpc.bank.listAccounts.useQuery(undefined, {
    onSuccess: (d) => { if (d?.length && !selectedAccountId) setSelectedAccountId(String(d[0].id)); },
  });
  const effectiveAccountId = selectedAccountId || (accounts?.[0] ? String(accounts[0].id) : "");

  // Check migration status
  const { data: migrationStatus } = trpc.bank.checkMigrationStatus.useQuery();
  const runMigration = trpc.bank.runMigration.useMutation({
    onSuccess: (d) => {
      if (d.success) {
        toast.success(d.message || "Sistema actualizado");
        utils.bank.checkMigrationStatus.invalidate();
      } else {
        toast.error(d.error || "Error al actualizar");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (d) => {
      if (d.success) toast.success(d.added && d.added > 0 ? `${d.added} transacciones sincronizadas` : "Sincronizado");
      utils.bank.getSubscriptions.invalidate();
    },
    onError: () => { /* silent fail */ },
  });

  useEffect(() => {
    if (effectiveAccountId) syncMutation.mutate({ accountId: parseInt(effectiveAccountId) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveAccountId]);

  const { data, isLoading } = trpc.bank.getSubscriptions.useQuery(
    effectiveAccountId ? { accountId: parseInt(effectiveAccountId) } : undefined,
  );
  const { data: cancelledData } = trpc.bank.getCancelledSubscriptions.useQuery();

  const cancelMutation = trpc.bank.cancelSubscription.useMutation({
    onSuccess: (r) => { if (r.success) { toast.success("Marcada como cancelada"); utils.bank.getSubscriptions.invalidate(); utils.bank.getCancelledSubscriptions.invalidate(); setSelectedSub(null); } else toast.error(r.error); },
  });
  const reactivateMutation = trpc.bank.reactivateSubscription.useMutation({
    onSuccess: () => { toast.success("Reactivada"); utils.bank.getSubscriptions.invalidate(); utils.bank.getCancelledSubscriptions.invalidate(); },
  });

  const allSubs = data?.subscriptions ?? [];
  const filteredSubs = filter === "all" ? allSubs : allSubs.filter((s: any) => s.subType === filter);
  const cancelledSubs = cancelledData?.subscriptions ?? [];

  const totalMonthly = filter === "membership" ? parseFloat(data?.membershipMonthly ?? "0")
    : filter === "monthly_payment" ? parseFloat(data?.paymentMonthly ?? "0")
    : filter === "credit_card" ? parseFloat(data?.creditCardMonthly ?? "0")
    : parseFloat(data?.totalMonthly ?? "0");

  const displayed = showAll ? filteredSubs : filteredSubs.slice(0, 5);
  const guide = selectedSub ? getCancelGuide(selectedSub.name) : null;

  const filterLabels: Record<FilterType, string> = {
    all: "Todos",
    membership: "Membresias",
    monthly_payment: "Pagos mensuales",
    credit_card: "Tarjetas de credito",
  };

  // Loading state
  if (isCheckingBank) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-black">Suscripciones</h1>
          <p className="text-sm text-neutral-400 mt-1">Verificando conexion bancaria...</p>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </AnimatedPage>
    );
  }

  // ─── NOT CONNECTED banner (non-blocking) ───
  // Only show if NO accounts exist — if there are accounts, user has a bank connected
  const showConnectBanner = (accounts ?? []).length === 0;

  return (
    <AnimatedPage className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-semibold text-black">Suscripciones</h1>
          <p className="text-xs text-neutral-500">
            {isLoading ? "Sincronizando..." : `${filteredSubs.length} ${filter === "all" ? "activas" : filter === "membership" ? "membresias" : filter === "credit_card" ? "tarjetas" : "pagos mensuales"} · ${formatCurrency(totalMonthly)}/mes`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(accounts ?? []).length > 0 && <AccountDropdown accounts={accounts ?? []} selectedId={effectiveAccountId} onChange={setSelectedAccountId} />}
          <Button onClick={() => syncMutation.mutate({ accountId: effectiveAccountId ? parseInt(effectiveAccountId) : undefined })} disabled={syncMutation.isPending} variant="outline" size="sm" className="h-9 px-2 border-neutral-200">
            {syncMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Connect bank banner — only when no bank AND no data */}
      {showConnectBanner && (
        <Card className="border-neutral-200 rounded-xl shadow-none mb-4">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mb-3">
              <Landmark className="w-6 h-6 text-neutral-400" />
            </div>
            <h3 className="text-base font-semibold text-black mb-1">Sin cuenta bancaria conectada</h3>
            <p className="text-xs text-neutral-400 max-w-sm mb-4">Conecta tu cuenta bancaria para sincronizar transacciones automaticas.</p>
            <Button onClick={() => setShowPlaidOverlay(true)} className="bg-black hover:bg-neutral-800 text-white rounded-lg h-9 px-5 text-xs">
              <Link2 className="w-3.5 h-3.5 mr-2" /> Conectar Banco
            </Button>
          </CardContent>
        </Card>
      )}
      {showConnectBanner && showPlaidOverlay && (
        <PlaidLinkOverlay onSuccess={() => { setShowPlaidOverlay(false); utils.invalidate(); }} onClose={() => setShowPlaidOverlay(false)} />
      )}

      {/* System Update Banner */}
      {migrationStatus && !migrationStatus.applied && (
        <Card className="border-amber-200 rounded-xl shadow-none mb-4 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">Actualizacion del sistema disponible</p>
                <p className="text-xs text-amber-600 mt-1">Se requiere actualizar la base de datos para activar la sincronizacion automatica y el audit trail. Toca el boton para aplicar.</p>
                <p className="text-[10px] text-amber-500 mt-1">Falta: {migrationStatus.details}</p>
                <Button
                  onClick={() => runMigration.mutate()}
                  disabled={runMigration.isPending}
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs rounded-lg"
                  size="sm"
                >
                  {runMigration.isPending ? (
                    <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Aplicando...</>
                  ) : (
                    <><ArrowUpCircle className="w-3.5 h-3.5 mr-1.5" /> Actualizar sistema</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5 mb-5 overflow-x-auto">
        {(["all", "membership", "monthly_payment", "credit_card"] as FilterType[]).map((f) => (
          <button key={f} onClick={() => { setFilter(f); setShowAll(false); }} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap px-2 ${filter === f ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {/* Savings Card */}
      {isLoading ? <Skeleton className="h-28 rounded-xl mb-4" /> : filteredSubs.length > 0 ? (
        <Card className="border-emerald-200 rounded-xl shadow-none mb-4 bg-emerald-50/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs text-emerald-600 font-medium">
                    {filter === "membership" ? "Ahorro en membresias" : filter === "monthly_payment" ? "Total pagos mensuales" : "Ahorro mensual si cancelas todo"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalMonthly)}/mes</p>
                <p className="text-[11px] text-neutral-400 mt-1">{formatCurrency(totalMonthly * 12)}/ano</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Subscription List */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filteredSubs.length === 0 ? (
        <div className="text-center py-10">
          <Tv className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-400">
            {syncMutation.isPending ? "Sincronizando con tu banco..." : filter === "membership" ? "No hay membresias" : filter === "credit_card" ? "No hay tarjetas de credito" : filter === "monthly_payment" ? "No hay pagos mensuales" : "No hay suscripciones"}
          </p>
          {!syncMutation.isPending && (
            <Button onClick={() => syncMutation.mutate({ accountId: effectiveAccountId ? parseInt(effectiveAccountId) : undefined })} className="mt-4 bg-black text-white hover:bg-neutral-800 rounded-lg h-9 text-sm">
              <RefreshCw className="w-4 h-4 mr-1.5" /> Sincronizar ahora
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((sub: any) => {
            const { icon: Icon, bg, color } = getSubIcon(sub.name);
            const nextC = getNextChargeDate(sub.lastDate);
            const paymentDates = (sub.dates || []).slice(0, 6);
            return (
              <div key={sub.name} className="bg-white border border-neutral-100 rounded-lg hover:border-neutral-300 transition-all hover:shadow-sm">
                <div onClick={() => { setDetailSub(detailSub === sub.name ? null : sub.name); setHistoryFilter("all"); }} className="flex items-center justify-between py-3 px-3 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}><Icon className={`w-5 h-5 ${color}`} /></div>
                    <div>
                      <p className="text-sm font-medium text-black capitalize">{sub.name}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                        <CalendarClock className="w-3 h-3" /><span>Proximo cobro: {nextC}</span>
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${sub.subType === "membership" ? "bg-purple-100 text-purple-600" : sub.subType === "credit_card" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}>
                          {sub.subType === "membership" ? "Membresia" : sub.subType === "credit_card" ? "Tarjeta de credito" : "Pago mensual"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-rose-600">-{formatCurrency(sub.monthlyAmount)}/mes</p>
                    <p className="text-[10px] text-neutral-400">{sub.count} cargos detectados</p>
                  </div>
                </div>
                {/* Inline detail panel */}
                {detailSub === sub.name && (
                  <div className="px-3 pb-3 pt-0 border-t border-neutral-100 mt-2">
                    {/* Summary */}
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-neutral-400">{sub.count} cargos · Total: {formatCurrency(sub.totalAmount)}</span>
                      <span className="text-xs text-neutral-400 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Prox: {nextC}</span>
                    </div>

                    {/* History Filter */}
                    <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5 mb-2">
                      {(["all", "3months", "6months", "12months"] as const).map((f) => (
                        <button key={f} onClick={(e) => { e.stopPropagation(); setHistoryFilter(f); }} className={`flex-1 py-1 text-[10px] font-medium rounded-md transition-colors ${historyFilter === f ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>
                          {f === "all" ? "Todos" : f === "3months" ? "3m" : f === "6months" ? "6m" : "12m"}
                        </button>
                      ))}
                    </div>

                    {/* Transaction History */}
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {(sub.transactions || []).filter((t: any) => {
                        if (historyFilter === "all") return true;
                        const months = historyFilter === "3months" ? 3 : historyFilter === "6months" ? 6 : 12;
                        const cutoff = new Date();
                        cutoff.setMonth(cutoff.getMonth() - months);
                        return new Date(t.date || 0) >= cutoff;
                      }).map((t: any, i: number) => (
                        <div key={i} className="flex justify-between text-[10px] py-1.5 px-2 bg-neutral-50 rounded border border-neutral-100">
                          <span className="text-neutral-600 truncate max-w-[180px]" title={t.description}>{t.description}</span>
                          <span className="text-neutral-400 shrink-0 ml-2">{t.date} · ${t.amount}</span>
                        </div>
                      ))}
                    </div>

                    {/* Go to Cancel */}
                    <div className="pt-2 mt-2">
                      <Button onClick={(e) => { e.stopPropagation(); setSelectedSub(sub); setDetailSub(null); setTab("guide"); }} className="w-full bg-black hover:bg-neutral-800 text-white h-8 text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />Quiero cancelar esto
                      </Button>
                    </div>
                  </div>
                )}

                {/* Collapsed: show date badges */}
                {detailSub !== sub.name && paymentDates.length > 0 && (
                  <div className="px-3 pb-3 pt-0 flex flex-wrap gap-1.5">
                    {paymentDates.map((d: string, i: number) => {
                      const parsed = new Date(d);
                      const dateStr = isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString("es", { day: "numeric", month: "short" });
                      return (
                        <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-neutral-50 text-neutral-500 px-2 py-0.5 rounded-md border border-neutral-100">
                          <CalendarDays className="w-2.5 h-2.5" />{dateStr}
                        </span>
                      );
                    })}
                    {sub.dates?.length > 6 && <span className="text-[10px] text-neutral-400 px-1">+{sub.dates.length - 6} mas</span>}
                  </div>
                )}
              </div>
            );
          })}
          {filteredSubs.length > 5 && <button onClick={() => setShowAll(!showAll)} className="w-full py-3 text-center text-sm font-medium text-neutral-500 hover:text-black hover:bg-neutral-50 rounded-lg transition-colors mt-1">{showAll ? "Ver menos" : `Ver mas (${filteredSubs.length - 5})`}</button>}
        </div>
      )}

      {/* Cancelled Section */}
      {cancelledSubs.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowCancelled(!showCancelled)} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-black transition-colors mb-3">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            {cancelledSubs.length} cancelada{cancelledSubs.length > 1 ? "s" : ""} · Ahorro: {formatCurrency(cancelledSubs.reduce((s: number, c: any) => s + parseFloat(c.originalMonthlyAmount), 0))}/mes
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCancelled ? "rotate-180" : ""}`} />
          </button>
          {showCancelled && (
            <div className="space-y-2">
              {cancelledSubs.map((sub: any) => (
                <div key={sub.id} className="flex items-center justify-between py-3 px-3 bg-emerald-50/30 border border-emerald-100 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
                    <div>
                      <p className="text-sm font-medium text-black capitalize">{sub.merchantName}</p>
                      <p className="text-[10px] text-emerald-600">Cancelada el {sub.cancelledAt ? new Date(sub.cancelledAt).toLocaleDateString("es") : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-emerald-700 font-medium">-{formatCurrency(sub.originalMonthlyAmount)}/mes ahorrado</p>
                    <Button onClick={() => reactivateMutation.mutate({ id: sub.id })} variant="outline" size="sm" className="h-7 text-xs border-neutral-200"><RotateCcw className="w-3 h-3 mr-1" /> Reactivar</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline detail panel - no modal, no crash */}
      {/* Detail is now shown inline inside each card */}

      {/* Cancellation Modal */}
      {selectedSub && (
        <Dialog open={true} onOpenChange={() => setSelectedSub(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base capitalize">Cancelar {selectedSub.name}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-between p-3 bg-rose-50 rounded-lg mb-3">
              <span className="text-sm text-rose-600">-{formatCurrency(selectedSub.monthlyAmount)}/mes</span>
              <span className="text-xs text-rose-500 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Prox: {getNextChargeDate(selectedSub.lastDate)}</span>
            </div>
          <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5 mb-4">
            <button onClick={() => setTab("guide")} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === "guide" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>Guia Paso a Paso</button>
            <button onClick={() => setTab("email")} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === "email" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>Email Pre-escrito</button>
            <button onClick={() => setTab("tips")} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === "tips" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>Consejos</button>
          </div>
          {tab === "guide" && guide && (
            <div className="space-y-3">
              {guide.link && (
                <a href={guide.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">
                  <ExternalLink className="w-4 h-4" /> Ir a {guide.linkLabel}
                </a>
              )}
              <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Pasos ({guide.estimatedTime})</p>
              <ol className="space-y-2">
                {guide.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm"><span className="w-5 h-5 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-medium text-neutral-500 shrink-0">{i + 1}</span><span className="text-neutral-700">{s}</span></li>
                ))}
              </ol>
            </div>
          )}
          {tab === "email" && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400">Copia este email, pegalo y envialo al servicio:</p>
              <textarea readOnly value={`Asunto: Solicitud de cancelacion de suscripcion\n\nEstimado servicio de ${selectedSub?.name},\n\nMe dirijo a ustedes para solicitar la cancelacion inmediata de mi suscripcion/membresia con su servicio.\n\nPor favor confirmen:\n1. La fecha efectiva de la cancelacion\n2. Hasta cuando tendre acceso al servicio\n3. Que no se realizaran cargos futuros a mi metodo de pago\n\nQuedo a la espera de su confirmacion por escrito.\n\nAtentamente`} className="w-full h-48 p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700 font-mono text-xs resize-none" />
              <a href={`mailto:support@${selectedSub?.name?.toLowerCase().replace(/\s+/g, '')}.com?subject=Solicitud de cancelacion de suscripcion`} className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium justify-center">
                <Mail className="w-4 h-4" /> Abrir app de correo
              </a>
            </div>
          )}
          {tab === "tips" && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 rounded-lg">
                <p className="text-xs font-medium text-amber-700 mb-2">Antes de cancelar:</p>
                <ul className="text-xs text-amber-600 space-y-1.5">
                  <li className="flex gap-2"><span className="shrink-0">1.</span><span>Guarda el email de confirmacion de cancelacion - es tu prueba</span></li>
                  <li className="flex gap-2"><span className="shrink-0">2.</span><span>Muchos servicios siguen activos hasta el final del periodo pagado</span></li>
                  <li className="flex gap-2"><span className="shrink-0">3.</span><span>Algunos ofrecen descuento si intentas cancelar - aprovecha para negociar</span></li>
                </ul>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-xs font-medium text-emerald-700 mb-2">Despues de cancelar:</p>
                <ul className="text-xs text-emerald-600 space-y-1.5">
                  <li className="flex gap-2"><span className="shrink-0">1.</span><span>Revisa tu proximo estado de cuenta para confirmar el cobro se detuvo</span></li>
                  <li className="flex gap-2"><span className="shrink-0">2.</span><span>Si te cobran despues de cancelar, disputa el cargo con tu banco</span></li>
                  <li className="flex gap-2"><span className="shrink-0">3.</span><span>Vuelve aqui y presiona "Ya la cancele" para llevar el registro</span></li>
                </ul>
              </div>
            </div>
          )}
          <div className="pt-3 border-t border-neutral-100 mt-4 space-y-2">
            <Button onClick={() => selectedSub && cancelMutation.mutate({ merchantName: selectedSub.name, monthlyAmount: selectedSub.monthlyAmount })} disabled={cancelMutation.isPending} className="w-full bg-black hover:bg-neutral-800 text-white h-10">
              <CheckCircle className="w-4 h-4 mr-1.5" />{cancelMutation.isPending ? "Guardando..." : "Ya la cancele - Confirmar"}
            </Button>
            <Button onClick={() => setSelectedSub(null)} variant="ghost" className="w-full text-neutral-500 h-8 text-xs hover:text-black">
              <X className="w-3 h-3 mr-1" /> Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </AnimatedPage>
  );
}
