import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import {
  Shield, Users, CreditCard, UserX, DollarSign, Crown, Ban,
  ChevronLeft, RefreshCw, Pencil, Trash2, Plus,
} from "lucide-react";

type Section = "users" | "subs" | "blocked" | "revenue";

const META: Record<Section, { title: string; icon: any; iconClass: string; bg: string }> = {
  users: { title: "Usuarios", icon: Users, iconClass: "text-blue-300", bg: "bg-blue-500/20" },
  subs: { title: "Suscripciones activas", icon: CreditCard, iconClass: "text-emerald-300", bg: "bg-emerald-500/20" },
  blocked: { title: "Bloqueados y administradores", icon: UserX, iconClass: "text-red-300", bg: "bg-red-500/20" },
  revenue: { title: "Ingresos totales", icon: DollarSign, iconClass: "text-white", bg: "bg-white/15" },
};

export default function AdminDetail({ section }: { section: Section }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const live = { refetchInterval: 5000, refetchOnWindowFocus: true, staleTime: 0 } as const;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Payment management state (solo seccion "revenue")
  const [editing, setEditing] = useState<null | { id: number; amount: string; date: string }>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [recUser, setRecUser] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recPlan, setRecPlan] = useState<"monthly" | "annual">("monthly");
  const [recDate, setRecDate] = useState(todayStr);

  const { data: stats } = trpc.admin.stats.useQuery(undefined, { enabled: isAdmin, ...live });
  const { data: usersData } = trpc.admin.listUsers.useQuery(
    { page: 1, limit: 100, mode: "all" },
    { enabled: isAdmin && (section === "users" || section === "blocked" || section === "revenue"), placeholderData: keepPreviousData, ...live }
  );

  const invalidatePayments = () => {
    utils.admin.paymentHistory.invalidate();
    utils.admin.stats.invalidate();
  };
  const updatePayMut = trpc.admin.updatePayment.useMutation({
    onSuccess: (d: any) => { if (d.success) { toast.success(d.message); setEditing(null); invalidatePayments(); } else toast.error(d.error); },
    onError: (e: any) => toast.error(e.message),
  });
  const deletePayMut = trpc.admin.deletePayment.useMutation({
    onSuccess: (d: any) => { toast.success(d.message); invalidatePayments(); },
    onError: (e: any) => toast.error(e.message),
  });
  const recordPayMut = trpc.admin.recordPayment.useMutation({
    onSuccess: (d: any) => { toast.success(d.message); setShowRecord(false); setRecUser(""); setRecAmount(""); invalidatePayments(); },
    onError: (e: any) => toast.error(e.message),
  });
  const { data: subscriptions } = trpc.admin.listSubscriptions.useQuery(
    undefined,
    { enabled: isAdmin && section === "subs", ...live }
  );
  const { data: paymentHistory, isLoading: paymentsLoading } = trpc.admin.paymentHistory.useQuery(
    undefined,
    { enabled: isAdmin && section === "revenue", ...live }
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

  const users = usersData?.users ?? [];
  const activeSubsList = (subscriptions ?? []).filter((s: any) => s.status === "active" || s.status === "trialing");
  const blockedAndAdmins = users.filter((u: any) => u.isBlocked || u.isAdmin);

  const meta = META[section];
  const Icon = meta.icon;

  const subtitle =
    section === "users" ? `${stats?.totalUsers ?? 0} usuarios registrados`
    : section === "subs" ? `${stats?.activeSubscriptions ?? 0} activas · ${stats?.annualSubscriptions ?? 0} anual · ${stats?.monthlySubscriptions ?? 0} mensual`
    : section === "blocked" ? `${stats?.blockedUsers ?? 0} bloqueados · ${stats?.adminUsers ?? 0} admins`
    : `$${stats?.totalRevenue ?? "0.00"} en total`;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
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
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${meta.bg}`}>
            <Icon className={`w-6 h-6 ${meta.iconClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-xl">{meta.title}</h1>
            <p className="text-sm text-neutral-300">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl overflow-hidden shadow-sm">
        {/* ── USUARIOS ── */}
        {section === "users" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 border-b border-neutral-100">
              <div className="p-3 rounded-xl bg-emerald-50 text-center">
                <p className="text-lg font-bold text-emerald-600">{stats?.activeSubscriptions ?? 0}</p>
                <p className="text-[10px] text-emerald-500 uppercase tracking-wide">Con suscripcion</p>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 text-center">
                <p className="text-lg font-bold text-neutral-700">{(stats?.totalUsers ?? 0) - (stats?.activeSubscriptions ?? 0)}</p>
                <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Sin plan</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 text-center">
                <p className="text-lg font-bold text-amber-600">{stats?.adminUsers ?? 0}</p>
                <p className="text-[10px] text-amber-500 uppercase tracking-wide">Administradores</p>
              </div>
              <div className="p-3 rounded-xl bg-red-50 text-center">
                <p className="text-lg font-bold text-red-500">{stats?.blockedUsers ?? 0}</p>
                <p className="text-[10px] text-red-400 uppercase tracking-wide">Bloqueados</p>
              </div>
            </div>
            <div className="divide-y divide-neutral-50">
              {users.map((u: any) => (
                <div key={u.id} className="flex items-center gap-3 px-6 py-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-semibold shrink-0">
                    {(u.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-800 truncate">{u.name || "Sin nombre"}</p>
                    <p className="text-[11px] text-neutral-400 truncate">{u.email}</p>
                  </div>
                  {u.isAdmin ? (
                    <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Admin</Badge>
                  ) : (u.subscription?.status === "active" || u.subscription?.status === "trialing") ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">{u.subscription.plan === "annual" ? "Anual" : "Mensual"}</Badge>
                  ) : (
                    <span className="text-[10px] text-neutral-400">Sin plan</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── SUSCRIPCIONES ACTIVAS ── */}
        {section === "subs" && (
          activeSubsList.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-400">Sin suscripciones activas</div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {activeSubsList.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-6 py-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-800 truncate">{s.userName || "Sin nombre"}</p>
                    <p className="text-[11px] text-neutral-400 truncate">{s.userEmail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">{s.plan === "annual" ? "Anual" : "Mensual"}</Badge>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      {s.currentPeriodEnd ? `Hasta ${new Date(s.currentPeriodEnd).toLocaleDateString("es")}` : "—"}{s.cancelAtPeriodEnd ? " · cancela" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── BLOQUEADOS Y ADMINS ── */}
        {section === "blocked" && (
          blockedAndAdmins.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-400">Sin usuarios bloqueados ni administradores</div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {blockedAndAdmins.map((u: any) => (
                <div key={u.id} className="flex items-center gap-3 px-6 py-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${u.isBlocked ? "bg-red-50" : "bg-amber-50"}`}>
                    {u.isBlocked ? <Ban className="w-4 h-4 text-red-500" /> : <Shield className="w-4 h-4 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-800 truncate">{u.name || "Sin nombre"}</p>
                    <p className="text-[11px] text-neutral-400 truncate">{u.email}</p>
                  </div>
                  <Badge className={`border-0 text-[10px] ${u.isBlocked ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                    {u.isBlocked ? "Bloqueado" : "Admin"}
                  </Badge>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── INGRESOS / HISTORIAL DE PAGOS ── */}
        {section === "revenue" && (
          <>
            <div className="flex items-center justify-between gap-2 px-6 py-3 bg-neutral-50/60 border-b border-neutral-100">
              <p className="text-[11px] text-neutral-500">Suma de los pagos registrados. Se actualiza en vivo con cada suscripcion.</p>
              <Button size="sm" onClick={() => { setRecPlan("monthly"); setRecAmount(""); setRecUser(""); setRecDate(todayStr); setShowRecord(true); }} className="h-8 text-xs shrink-0 gap-1">
                <Plus className="w-3.5 h-3.5" /> Registrar pago
              </Button>
            </div>
            {paymentsLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-neutral-400" />
                <p className="text-xs text-neutral-400">Cargando pagos...</p>
              </div>
            ) : !paymentHistory || paymentHistory.length === 0 ? (
              <div className="py-12 text-center text-sm text-neutral-400">Sin pagos registrados aun</div>
            ) : (
              <div className="divide-y divide-neutral-50">
                {paymentHistory.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 px-6 py-3 group">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Crown className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-800 truncate">{p.userName || p.userEmail || "Usuario"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-neutral-400">{p.plan === "annual" ? "Anual" : "Mensual"}</span>
                        <span className="text-[10px] text-neutral-400">{p.paidAt ? new Date(p.paidAt).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                        {p.status !== "succeeded" && <span className="text-[10px] text-amber-600">{p.status}</span>}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 shrink-0">+{formatCurrency(p.amount)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditing({ id: p.id, amount: String(parseFloat(p.amount || "0")), date: p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : todayStr })}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar pago"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { if (window.confirm("¿Eliminar este pago?")) deletePayMut.mutate({ id: p.id }); }}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Eliminar pago"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Editar pago */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-neutral-500">Monto ($)</label>
              <Input type="number" step="0.01" value={editing?.amount ?? ""} onChange={(e) => setEditing((prev) => prev ? { ...prev, amount: e.target.value } : prev)} />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500">Fecha</label>
              <Input type="date" value={editing?.date ?? ""} onChange={(e) => setEditing((prev) => prev ? { ...prev, date: e.target.value } : prev)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="text-sm">Cancelar</Button>
            <Button
              disabled={updatePayMut.isPending || !editing?.amount}
              onClick={() => editing && updatePayMut.mutate({ id: editing.id, amount: parseFloat(editing.amount), paidAt: editing.date })}
              className="text-sm"
            >
              {updatePayMut.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar pago */}
      <Dialog open={showRecord} onOpenChange={setShowRecord}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-neutral-500">Usuario</label>
              <select value={recUser} onChange={(e) => setRecUser(e.target.value)} className="w-full h-9 px-3 rounded-md border border-neutral-200 text-sm bg-white">
                <option value="">Selecciona un usuario…</option>
                {users.map((u: any) => (<option key={u.id} value={u.id}>{u.name || u.email}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-neutral-500">Monto ($)</label>
                <Input type="number" step="0.01" value={recAmount} onChange={(e) => setRecAmount(e.target.value)} placeholder="495.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-500">Plan</label>
                <select value={recPlan} onChange={(e) => setRecPlan(e.target.value as "monthly" | "annual")} className="w-full h-9 px-3 rounded-md border border-neutral-200 text-sm bg-white">
                  <option value="monthly">Mensual</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500">Fecha</label>
              <Input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecord(false)} className="text-sm">Cancelar</Button>
            <Button
              disabled={recordPayMut.isPending || !recUser || !recAmount}
              onClick={() => recordPayMut.mutate({ userId: Number(recUser), amount: parseFloat(recAmount), plan: recPlan, paidAt: recDate })}
              className="text-sm"
            >
              {recordPayMut.isPending ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
