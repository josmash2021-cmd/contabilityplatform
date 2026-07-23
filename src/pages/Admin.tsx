import { useState } from "react";
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
import {
  Shield, Users, CreditCard, Ban, CheckCircle, Lock, Unlock,
  Gift, Search, DollarSign, UserX, UserCheck,
  Crown, Calendar, Trash2, AlertTriangle, Wrench,
  Download, ChevronLeft, ChevronRight, RefreshCw,
  Building2, ShoppingCart, TrendingUp,
  Activity, Clock
} from "lucide-react";

export default function Admin() {
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | "business" | "personal">("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [grantPlan, setGrantPlan] = useState<"monthly" | "annual">("annual");
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
  const [showActivityUser, setShowActivityUser] = useState<any>(null);

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
  const { data: activityData, isLoading: activityLoading } = trpc.admin.userActivity.useQuery(
    { userId: showActivityUser?.id ?? 0 },
    { enabled: !!showActivityUser, ...live }
  );

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

  const getActivityIcon = (type: string) => {
    if (type === "bank") return <Building2 className="w-4 h-4 text-blue-500" />;
    return <ShoppingCart className="w-4 h-4 text-violet-500" />;
  };

  const getActivityLabel = (type: string) => type === "bank" ? "Banco" : "Venta";

  // Activity summary — parseFloat ensures string amounts from MySQL Decimal are handled correctly
  const activitySummary = activityData?.reduce((acc: any, item: any) => {
    const amount = typeof item.amount === "string" ? parseFloat(item.amount) : (item.amount ?? 0);
    acc.total++;
    if (amount >= 0) acc.income += amount;
    else acc.expense += Math.abs(amount);
    return acc;
  }, { total: 0, income: 0, expense: 0 }) ?? { total: 0, income: 0, expense: 0 };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-black tracking-tight">Panel de Administracion</h1>
          <p className="text-sm text-neutral-400 mt-0.5">Gestiona usuarios, suscripciones y accesos</p>
        </div>
        <Button
          variant={maintenanceStatus?.enabled ? "destructive" : "outline"}
          size="sm"
          onClick={() => setShowMaintenanceDialog(true)}
          className="gap-2 text-xs"
        >
          <Wrench className="w-3.5 h-3.5" />
          {maintenanceStatus?.enabled ? "Mantenimiento ON" : "Mantenimiento OFF"}
        </Button>
      </div>

      {/* ═══════ STATS CARDS ═══════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <Card className="border-neutral-200/80 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Usuarios</p>
                <p className="text-2xl font-bold text-black">{stats?.totalUsers || 0}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="w-4.5 h-4.5 text-blue-500" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs text-neutral-400">
              <UserCheck className="w-3 h-3" />
              <span>{stats?.activeSubscriptions || 0} con suscripcion</span>
            </div>
          </CardContent>
        </Card>

        {/* Active Subscriptions */}
        <Card className="border-neutral-200/80 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Suscripciones activas</p>
                <p className="text-2xl font-bold text-emerald-600">{stats?.activeSubscriptions || 0}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CreditCard className="w-4.5 h-4.5 text-emerald-500" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-neutral-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {stats?.annualSubscriptions || 0} anual
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {stats?.monthlySubscriptions || 0} mensual
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Blocked Users */}
        <Card className="border-neutral-200/80 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Bloqueados</p>
                <p className="text-2xl font-bold text-red-500">{stats?.blockedUsers || 0}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <UserX className="w-4.5 h-4.5 text-red-500" />
              </div>
            </div>
            <div className="mt-3 text-xs text-neutral-400">
              {stats?.adminUsers || 0} administradores
            </div>
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card className="border-neutral-200/80 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Ingresos totales</p>
                <p className="text-2xl font-bold text-black">${stats?.totalRevenue || "0.00"}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center">
                <DollarSign className="w-4.5 h-4.5 text-neutral-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
              <TrendingUp className="w-3 h-3" />
              <span>Historial de pagos</span>
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
                    <tr className="border-b border-neutral-100 text-neutral-400 text-left text-xs uppercase tracking-wider">
                      <th className="pb-3 font-medium">Usuario</th>
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Registro</th>
                      <th className="pb-3 font-medium">Suscripcion</th>
                      <th className="pb-3 font-medium">Estado</th>
                      <th className="pb-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {users?.map((user) => (
                      <tr key={user.id} className="hover:bg-neutral-50/60 transition-colors">
                        {/* Avatar + Name */}
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
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
                            <div>
                              <span className="font-medium text-black text-sm">{user.name || "Sin nombre"}</span>
                              {user.modePreference && (
                                <span className="ml-2 text-[10px] text-neutral-400 capitalize">{user.modePreference}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Email */}
                        <td className="py-3 text-neutral-500 text-sm">{user.email || "—"}</td>
                        {/* Registration Date */}
                        <td className="py-3 text-neutral-400 text-xs">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString("es") : "—"}
                        </td>
                        {/* Subscription Plan */}
                        <td className="py-3">
                          {user.subscription ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className={`inline-flex items-center gap-1 font-medium ${
                                user.subscription.plan === "annual" ? "text-emerald-600" : "text-blue-600"
                              }`}>
                                {user.subscription.plan === "annual" ? (
                                  <Calendar className="w-3 h-3" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
                                {user.subscription.plan === "annual" ? "Anual" : "Mensual"}
                              </span>
                              <span className="text-neutral-300">·</span>
                              <span className="text-neutral-400">
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
                        <td className="py-3">{getStatusBadge(user)}</td>
                        {/* Actions */}
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            {!user.isAdmin && (
                              <>
                                {/* View Activity */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => setShowActivityUser(user)}
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
                <p className="text-xl font-bold text-black mt-1">$495</p>
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

      {/* ═══════ ACTIVITY DIALOG (REDESIGNED) ═══════ */}
      <Dialog open={!!showActivityUser} onOpenChange={() => setShowActivityUser(null)}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          {/* Header with user info */}
          <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-xl font-bold">
                {(showActivityUser?.name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{showActivityUser?.name || "Sin nombre"}</h3>
                <p className="text-sm text-neutral-300 truncate">{showActivityUser?.email}</p>
                {showActivityUser?.subscription && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px]">
                      {showActivityUser.subscription.plan === "annual" ? "Anual" : "Mensual"}
                    </Badge>
                    <span className="text-xs text-neutral-400">
                      Hasta {showActivityUser.subscription.currentPeriodEnd
                        ? new Date(showActivityUser.subscription.currentPeriodEnd).toLocaleDateString("es")
                        : "—"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Activity summary */}
          <div className="px-6 py-4 border-b border-neutral-100">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">Resumen de actividad</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-neutral-50 rounded-xl">
                <p className="text-lg font-bold text-black">{activitySummary.total}</p>
                <p className="text-[10px] text-neutral-400 uppercase">Movimientos</p>
              </div>
              <div className="text-center p-3 bg-emerald-50 rounded-xl">
                <p className="text-lg font-bold text-emerald-600">+{formatCurrency(activitySummary.income)}</p>
                <p className="text-[10px] text-emerald-400 uppercase">Ingresos</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-xl">
                <p className="text-lg font-bold text-red-500">-{formatCurrency(activitySummary.expense)}</p>
                <p className="text-[10px] text-red-400 uppercase">Gastos</p>
              </div>
            </div>
          </div>

          {/* Activity list */}
          <div className="max-h-[360px] overflow-y-auto">
            {activityLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-neutral-400" />
                <p className="text-xs text-neutral-400">Cargando actividad...</p>
              </div>
            ) : !activityData || activityData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Activity className="w-8 h-8 text-neutral-300" />
                <p className="text-sm text-neutral-400">Sin actividad reciente</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-50">
                {activityData.map((activity: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-6 py-3 hover:bg-neutral-50/50 transition-colors">
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      activity.type === "bank"
                        ? "bg-blue-50"
                        : "bg-violet-50"
                    }`}>
                      {getActivityIcon(activity.type)}
                    </div>
                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-800 truncate">{activity.description || "—"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          activity.type === "bank"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-violet-50 text-violet-600"
                        }`}>
                          {getActivityLabel(activity.type)}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          {activity.date ? new Date(activity.date).toLocaleDateString("es", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }) : "—"}
                        </span>
                      </div>
                    </div>
                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-semibold ${
                        activity.amount >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}>
                        {activity.amount >= 0 ? "+" : ""}{formatCurrency(activity.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50/50">
            <p className="text-[10px] text-neutral-400 text-center">
              Mostrando hasta 30 movimientos mas recientes
            </p>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
