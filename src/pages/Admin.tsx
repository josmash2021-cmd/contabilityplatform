import { useState } from "react";
import { useNavigate } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useCopy } from "@/i18n/useI18n";
import { taxesCopy } from "@/i18n/copy/taxes";
import {
  Shield, Users, CreditCard, Ban, CheckCircle, Lock, Unlock,
  Gift, Search, DollarSign, UserX, UserCheck,
  Crown, Calendar, Trash2, AlertTriangle, Wrench,
  Download, ChevronLeft, ChevronRight, RefreshCw,
  Building2, ShoppingCart, TrendingUp,
  Activity, Clock, UserMinus, Receipt
} from "lucide-react";

export default function Admin() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | "business" | "personal">("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [grantPlan, setGrantPlan] = useState<"monthly" | "annual">("annual");
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);

  // Live options — panel refresca solo (polling + al volver a la pestaña)
  const LIVE_REFETCH_MS = 5000;
  const live = { refetchInterval: LIVE_REFETCH_MS, refetchOnWindowFocus: true, staleTime: 0 } as const;

  // Queries
  const { data: stats } = trpc.admin.stats.useQuery(undefined, { enabled: isAdmin, ...live });
  const { data: usersData, refetch: refetchUsers } = trpc.admin.listUsers.useQuery(
    { page, limit: 50, search: searchTerm || undefined, mode: modeFilter },
    { enabled: isAdmin, placeholderData: keepPreviousData, ...live }
  );
  const { data: subscriptions, refetch: refetchSubs } = trpc.admin.listSubscriptions.useQuery(undefined, { enabled: isAdmin, ...live });
  const { data: maintenanceStatus, refetch: refetchMaintenance } = trpc.admin.maintenanceStatus.useQuery();
  const taxT = useCopy(taxesCopy);
  const { data: taxReturns } = trpc.tax.adminList.useQuery(undefined, { enabled: isAdmin });

  const users = usersData?.users ?? [];
  const pagination = usersData?.pagination;
  const utils = trpc.useUtils();

  // Mutations
  const toggleBlock = trpc.admin.toggleUserBlock.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        refetchUsers();
        refetchSubs();
      } else {
        toast.error(data.error);
      }
    },
  });

  const grantSubscription = trpc.subscription.grantSubscription.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        refetchUsers();
        refetchSubs();
        setShowGrantDialog(false);
      } else {
        toast.error(data.error);
      }
    },
  });

  const revokeSubscription = trpc.subscription.revokeSubscription.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        refetchUsers();
        refetchSubs();
      } else {
        toast.error(data.error);
      }
    },
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success(data.message);
        refetchUsers();
        refetchSubs();
        utils.admin.stats.invalidate();
      } else {
        toast.error(data.error);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMaintenance = trpc.admin.toggleMaintenance.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.enabled ? "Modo mantenimiento ACTIVADO" : "Modo mantenimiento DESACTIVADO");
        refetchMaintenance();
      }
    },
  });

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

  // ── Helpers ──
  const getStatusBadge = (user: any) => {
    if (user.isBlocked) return (
      <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50 text-xs font-medium gap-1">
        <Ban className="w-3 h-3" />Bloqueado
      </Badge>
    );
    if (user.isAdmin) return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-xs font-medium gap-1">
        <Crown className="w-3 h-3" />Admin
      </Badge>
    );
    if (user.subscription?.status === "active" || user.subscription?.status === "trialing") {
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-xs font-medium gap-1">
          <CheckCircle className="w-3 h-3" />Activo
        </Badge>
      );
    }
    return <span className="text-xs text-neutral-400">—</span>;
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-black flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-black tracking-tight">Panel de administracion</h1>
            <p className="text-sm text-neutral-400 mt-0.5">Gestiona usuarios, suscripciones y accesos</p>
          </div>
        </div>
        <Button
          variant={maintenanceStatus?.enabled ? "destructive" : "outline"}
          size="sm"
          onClick={() => setShowMaintenanceDialog(true)}
          className="gap-2 text-xs self-start sm:self-auto"
        >
          <Wrench className="w-3.5 h-3.5" />
          {maintenanceStatus?.enabled ? "Mantenimiento ON" : "Mantenimiento OFF"}
        </Button>
      </div>

      {/* ═══════ STATS CARDS ═══════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <Card onClick={() => navigate("/admin/usuarios")} className="group border-neutral-200/70 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-300 transition-all group-hover:text-neutral-600 group-hover:translate-x-0.5" />
            </div>
            <p className="text-3xl font-bold text-black tracking-tight mt-4">{stats?.totalUsers ?? 0}</p>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mt-1">Usuarios</p>
            <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-1.5 text-xs text-neutral-400">
              <UserCheck className="w-3.5 h-3.5" />
              <span>{stats?.activeSubscriptions ?? 0} con suscripcion</span>
            </div>
          </CardContent>
        </Card>

        {/* Active Subscriptions */}
        <Card onClick={() => navigate("/admin/suscripciones")} className="group border-neutral-200/70 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-emerald-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-300 transition-all group-hover:text-neutral-600 group-hover:translate-x-0.5" />
            </div>
            <p className="text-3xl font-bold text-emerald-600 tracking-tight mt-4">{stats?.activeSubscriptions ?? 0}</p>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mt-1">Suscripciones activas</p>
            <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-3 text-xs text-neutral-400">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{stats?.annualSubscriptions ?? 0} anual</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{stats?.monthlySubscriptions ?? 0} mensual</span>
            </div>
          </CardContent>
        </Card>

        {/* Blocked Users */}
        <Card onClick={() => navigate("/admin/bloqueados")} className="group border-neutral-200/70 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-300 transition-all group-hover:text-neutral-600 group-hover:translate-x-0.5" />
            </div>
            <p className="text-3xl font-bold text-black tracking-tight mt-4">{stats?.blockedUsers ?? 0}</p>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mt-1">Bloqueados</p>
            <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-1.5 text-xs text-neutral-400">
              <Shield className="w-3.5 h-3.5" />
              <span>{stats?.adminUsers ?? 0} administradores</span>
            </div>
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card onClick={() => navigate("/admin/ingresos")} className="group border-neutral-200/70 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-300 transition-all group-hover:text-neutral-600 group-hover:translate-x-0.5" />
            </div>
            <p className="text-3xl font-bold text-black tracking-tight mt-4">${stats?.totalRevenue ?? "0.00"}</p>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mt-1">Ingresos totales</p>
            <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-1.5 text-xs text-emerald-600">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Ver historial de pagos</span>
            </div>
          </CardContent>
        </Card>

        {/* Impuestos (tax returns) */}
        <Card onClick={() => navigate("/admin/impuestos")} className="group border-neutral-200/70 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-amber-600" />
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-300 transition-all group-hover:text-neutral-600 group-hover:translate-x-0.5" />
            </div>
            <p className="text-3xl font-bold text-black tracking-tight mt-4">{taxReturns?.length ?? 0}</p>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mt-1">{taxT.admin.title}</p>
            <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-1.5 text-xs text-neutral-400">
              <Receipt className="w-3.5 h-3.5" />
              <span>{taxT.admin.subtitle}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ MAIN TABS ═══════ */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="bg-white border border-neutral-200 h-10 p-1">
          <TabsTrigger value="users" className="text-sm px-4 data-[state=active]:bg-black data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-1.5" />
            Usuarios
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="text-sm px-4 data-[state=active]:bg-black data-[state=active]:text-white">
            <CreditCard className="w-4 h-4 mr-1.5" />
            Suscripciones
          </TabsTrigger>
        </TabsList>

        {/* ─── USERS TAB ─── */}
        <TabsContent value="users">
          <Card className="border-neutral-200/80 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">Usuarios registrados</CardTitle>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {pagination?.total ?? 0} usuarios en total
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Mode filter */}
                  <div className="flex items-center border rounded-lg overflow-hidden bg-white">
                    {(["all", "business", "personal"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setModeFilter(m); setPage(1); }}
                        className={`px-3 py-1.5 text-xs font-medium transition-all ${
                          modeFilter === m
                            ? "bg-black text-white"
                            : "text-neutral-500 hover:bg-neutral-50"
                        }`}
                      >
                        {m === "all" ? "Todos" : m === "business" ? "Negocio" : "Personal"}
                      </button>
                    ))}
                  </div>
                  {/* Search */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <Input
                      placeholder="Buscar usuario..."
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                      className="pl-9 w-44 text-sm h-8"
                    />
                  </div>
                  {/* Export CSV */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      utils.admin.exportUsers.fetch().then((data) => {
                        if (data?.csv) {
                          const blob = new Blob([data.csv], { type: "text/csv" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `usuarios-${new Date().toISOString().split("T")[0]}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast.success(`${data.count} usuarios exportados`);
                        }
                      });
                    }}
                    className="text-xs h-8 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-y border-neutral-100 text-neutral-500 text-left text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4 font-semibold">Usuario</th>
                      <th className="py-3 px-4 font-semibold">Email</th>
                      <th className="py-3 px-4 font-semibold">Registro</th>
                      <th className="py-3 px-4 font-semibold">Suscripcion</th>
                      <th className="py-3 px-4 font-semibold">Estado</th>
                      <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {users?.map((user) => (
                      <tr key={user.id} className="hover:bg-neutral-50/70 transition-colors">
                        {/* Avatar + Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shadow-sm ring-1 ring-black/5 ${
                              user.isBlocked
                                ? "bg-red-100 text-red-600"
                                : user.isAdmin
                                ? "bg-amber-100 text-amber-700"
                                : user.subscription
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-neutral-100 text-neutral-600"
                            }`}>
                              {(user.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col leading-tight">
                              <span className="font-medium text-black text-sm">{user.name || "Sin nombre"}</span>
                              {user.modePreference && (
                                <span className="text-[10px] text-neutral-400 capitalize mt-0.5">{user.modePreference}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Email */}
                        <td className="py-3.5 px-4 text-neutral-500 text-sm">{user.email || "—"}</td>
                        {/* Registration Date */}
                        <td className="py-3.5 px-4 text-neutral-400 text-xs whitespace-nowrap">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString("es") : "—"}
                        </td>
                        {/* Subscription Plan */}
                        <td className="py-3.5 px-4">
                          {user.subscription ? (
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full ${
                                user.subscription.plan === "annual" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                              }`}>
                                {user.subscription.plan === "annual" ? (
                                  <Calendar className="w-3 h-3" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
                                {user.subscription.plan === "annual" ? "Anual" : "Mensual"}
                              </span>
                              <span className="text-neutral-400 whitespace-nowrap">
                                {user.subscription.currentPeriodEnd
                                  ? new Date(user.subscription.currentPeriodEnd).toLocaleDateString("es")
                                  : "—"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-300">Sin plan</span>
                          )}
                        </td>
                        {/* Status Badge */}
                        <td className="py-3.5 px-4">{getStatusBadge(user)}</td>
                        {/* Actions */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-1">
                            {!user.isAdmin && (
                              <>
                                {/* View Activity */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => navigate(`/admin/actividad/${user.id}`)}
                                  title="Ver actividad"
                                >
                                  <Activity className="w-4 h-4" />
                                </Button>
                                {/* Grant */}
                                {!user.isBlocked && !user.subscription && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setGrantPlan("annual");
                                      setShowGrantDialog(true);
                                    }}
                                    title="Otorgar suscripcion"
                                  >
                                    <Gift className="w-4 h-4" />
                                  </Button>
                                )}
                                {/* Revoke */}
                                {!user.isBlocked && user.subscription && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                                    onClick={() => {
                                      if (confirm(`Quitar suscripcion a ${user.name || user.email}?`)) {
                                        revokeSubscription.mutate({ userId: user.id });
                                      }
                                    }}
                                    title="Quitar suscripcion"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {/* Block / Unblock */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 w-8 p-0 ${
                                    user.isBlocked
                                      ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                      : "text-red-500 hover:text-red-600 hover:bg-red-50"
                                  }`}
                                  onClick={() => {
                                    if (confirm(user.isBlocked
                                      ? `Desbloquear a ${user.name || user.email}?`
                                      : `Bloquear a ${user.name || user.email}? No podra acceder.`
                                    )) {
                                      toggleBlock.mutate({ userId: user.id });
                                    }
                                  }}
                                  title={user.isBlocked ? "Desbloquear" : "Bloquear"}
                                >
                                  {user.isBlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                </Button>
                                {/* Delete user */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-neutral-400 hover:text-white hover:bg-red-500"
                                  disabled={deleteUser.isPending}
                                  onClick={() => {
                                    if (window.confirm(`¿Eliminar a ${user.name || user.email}? Esta accion es PERMANENTE y borrara todos sus datos (contabilidad, bancos, suscripcion).`)) {
                                      deleteUser.mutate({ userId: user.id });
                                    }
                                  }}
                                  title="Eliminar usuario"
                                >
                                  <UserMinus className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(!users || users.length === 0) && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-neutral-400 text-sm">
                          <Users className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                          No se encontraron usuarios
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 mt-2 border-t border-neutral-100">
                    <p className="text-xs text-neutral-400">
                      Mostrando <span className="font-medium text-neutral-600">{users.length}</span> de{" "}
                      <span className="font-medium text-neutral-600">{pagination.total}</span> usuarios
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-xs text-neutral-500 px-3 font-medium">
                        {page} / {pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                        disabled={page >= pagination.totalPages}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── SUBSCRIPTIONS TAB ─── */}
        <TabsContent value="subscriptions">
          <Card className="border-neutral-200/80 shadow-sm">
            <CardHeader className="pb-4">
              <div>
                <CardTitle className="text-base font-semibold">Suscripciones activas</CardTitle>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {subscriptions?.length || 0} suscripciones registradas
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-neutral-400 text-left text-xs uppercase tracking-wider">
                      <th className="pb-3 font-medium">Usuario</th>
                      <th className="pb-3 font-medium">Plan</th>
                      <th className="pb-3 font-medium">Estado</th>
                      <th className="pb-3 font-medium">Periodo actual</th>
                      <th className="pb-3 font-medium">Pagos recientes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {subscriptions?.map((sub: any) => (
                      <tr key={sub.id} className={`hover:bg-neutral-50/60 transition-colors ${sub.isBlocked ? "opacity-40" : ""}`}>
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                              sub.isBlocked ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {(sub.userName || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-medium text-black text-sm block">{sub.userName || "Sin nombre"}</span>
                              <span className="text-xs text-neutral-400">{sub.userEmail}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge variant={sub.plan === "annual" ? "default" : "outline"} className="text-xs capitalize font-medium gap-1">
                            {sub.plan === "annual" ? <Calendar className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {sub.plan === "annual" ? "Anual" : "Mensual"}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {sub.status === "active" || sub.status === "trialing" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <CheckCircle className="w-3.5 h-3.5" /> Activo
                            </span>
                          ) : sub.cancelAtPeriodEnd ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                              <AlertTriangle className="w-3.5 h-3.5" /> Cancela pronto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400">
                              <Ban className="w-3.5 h-3.5" /> {sub.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-xs text-neutral-500">
                          {sub.currentPeriodEnd
                            ? new Date(sub.currentPeriodEnd).toLocaleDateString("es")
                            : "—"}
                        </td>
                        <td className="py-3">
                          {sub.payments && sub.payments.length > 0 ? (
                            <div className="space-y-1.5">
                              {sub.payments.slice(0, 3).map((p: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="font-medium text-black">${p.amount}</span>
                                  <span className="text-neutral-400">{p.plan === "annual" ? "Anual" : "Mensual"}</span>
                                  <span className={`text-xs ${p.status === "succeeded" ? "text-emerald-500" : "text-amber-500"}`}>
                                    {p.status === "succeeded" ? "Pagado" : p.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-300">Sin pagos</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!subscriptions || subscriptions.length === 0) && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-neutral-400 text-sm">
                          <CreditCard className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                          No hay suscripciones registradas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════ GRANT SUBSCRIPTION DIALOG ═══════ */}
      <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Gift className="w-5 h-5 text-emerald-600" />
              Otorgar suscripcion
            </DialogTitle>
            <DialogDescription>
              Selecciona el plan para {selectedUser?.name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-sm font-semibold text-neutral-600">
                {(selectedUser?.name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-black text-sm">{selectedUser?.name || "Sin nombre"}</p>
                <p className="text-sm text-neutral-400">{selectedUser?.email}</p>
              </div>
            </div>
            {/* Plan selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGrantPlan("monthly")}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  grantPlan === "monthly"
                    ? "border-emerald-500 bg-emerald-50/50"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <p className="text-xs font-medium text-neutral-500">Mensual</p>
                <p className="text-xl font-bold text-black mt-1">$80</p>
                <p className="text-xs text-neutral-400 mt-0.5">1 mes</p>
              </button>
              <button
                onClick={() => setGrantPlan("annual")}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  grantPlan === "annual"
                    ? "border-emerald-500 bg-emerald-50/50"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <p className="text-xs font-medium text-neutral-500">Anual</p>
                <p className="text-xl font-bold text-black mt-1">$800</p>
                <p className="text-xs text-emerald-600 mt-0.5 font-medium">Ahorras $400</p>
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGrantDialog(false)} className="text-sm">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedUser?.email) {
                  grantSubscription.mutate({ email: selectedUser.email, plan: grantPlan });
                }
              }}
              disabled={grantSubscription.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
            >
              {grantSubscription.isPending ? "Otorgando..." : `Otorgar ${grantPlan === "annual" ? "anual" : "mensual"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ MAINTENANCE DIALOG ═══════ */}
      <Dialog open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Modo Mantenimiento
            </DialogTitle>
            <DialogDescription>
              Al activar, todos los usuarios veran un mensaje de "En mantenimiento".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className={`p-4 rounded-xl border-2 flex items-center gap-4 ${
              maintenanceStatus?.enabled
                ? "bg-red-50 border-red-200"
                : "bg-emerald-50 border-emerald-200"
            }`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                maintenanceStatus?.enabled ? "bg-red-100" : "bg-emerald-100"
              }`}>
                {maintenanceStatus?.enabled ? (
                  <Ban className="w-6 h-6 text-red-500" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                )}
              </div>
              <div>
                <p className={`font-semibold ${maintenanceStatus?.enabled ? "text-red-700" : "text-emerald-700"}`}>
                  {maintenanceStatus?.enabled ? "Activado" : "Desactivado"}
                </p>
                <p className={`text-xs ${maintenanceStatus?.enabled ? "text-red-600" : "text-emerald-600"}`}>
                  {maintenanceStatus?.enabled
                    ? "Todos los usuarios ven 'En mantenimiento'"
                    : "La plataforma funciona normalmente"}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowMaintenanceDialog(false)} className="text-sm">
              Cerrar
            </Button>
            <Button
              variant={maintenanceStatus?.enabled ? "default" : "destructive"}
              onClick={() => {
                toggleMaintenance.mutate({ enabled: !maintenanceStatus?.enabled });
                setShowMaintenanceDialog(false);
              }}
              className="text-sm"
            >
              {maintenanceStatus?.enabled ? "Desactivar" : "Activar"} mantenimiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
