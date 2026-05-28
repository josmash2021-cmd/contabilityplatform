import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Shield, Users, CreditCard, Ban, CheckCircle, Lock, Unlock,
  Gift, Search, TrendingUp, DollarSign, Banknote, UserX, UserCheck,
  Crown, Calendar, Trash2, AlertTriangle, Wrench, ToggleLeft, ToggleRight
} from "lucide-react";

export default function Admin() {
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [grantPlan, setGrantPlan] = useState<"monthly" | "annual">("annual");
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);

  // Queries
  const { data: stats } = trpc.admin.stats.useQuery(undefined, { enabled: isAdmin });
  const { data: users, refetch: refetchUsers } = trpc.admin.listUsers.useQuery(undefined, { enabled: isAdmin });
  const { data: subscriptions, refetch: refetchSubs } = trpc.admin.listSubscriptions.useQuery(undefined, { enabled: isAdmin });
  const { data: maintenanceStatus, refetch: refetchMaintenance } = trpc.admin.maintenanceStatus.useQuery();

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

  const filteredUsers = users?.filter((u) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.name || "").toLowerCase().includes(term) ||
      (u.email || "").toLowerCase().includes(term)
    );
  });

  const getStatusBadge = (user: any) => {
    if (user.isBlocked) return <Badge variant="destructive" className="text-xs"><Ban className="w-3 h-3 mr-1" />Bloqueado</Badge>;
    if (user.isAdmin) return <Badge className="bg-amber-500 text-white text-xs"><Crown className="w-3 h-3 mr-1" />Admin</Badge>;
    if (user.subscription?.status === "active" || user.subscription?.status === "trialing") {
      return <Badge className="bg-emerald-500 text-white text-xs"><CheckCircle className="w-3 h-3 mr-1" />Activo</Badge>;
    }
    return <Badge variant="outline" className="text-neutral-400 text-xs">Sin membresia</Badge>;
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-black" />
          <div>
            <h1 className="text-xl font-semibold text-black">Panel de Administracion</h1>
            <p className="text-sm text-neutral-400">Gestiona usuarios, membresias y accesos</p>
          </div>
        </div>
        {/* Maintenance Toggle */}
        <Button
          variant={maintenanceStatus?.enabled ? "destructive" : "outline"}
          size="sm"
          onClick={() => setShowMaintenanceDialog(true)}
          className="gap-1.5"
        >
          <Wrench className="w-4 h-4" />
          <span className="text-xs">
            {maintenanceStatus?.enabled ? "Mantenimiento ON" : "Mantenimiento OFF"}
          </span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="border-neutral-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400">Usuarios totales</p>
                <p className="text-2xl font-semibold text-black mt-1">{stats?.totalUsers || 0}</p>
              </div>
              <Users className="w-5 h-5 text-neutral-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-neutral-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400">Membresias activas</p>
                <p className="text-2xl font-semibold text-emerald-600 mt-1">{stats?.activeSubscriptions || 0}</p>
              </div>
              <CreditCard className="w-5 h-5 text-emerald-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-neutral-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400">Usuarios bloqueados</p>
                <p className="text-2xl font-semibold text-red-500 mt-1">{stats?.blockedUsers || 0}</p>
              </div>
              <UserX className="w-5 h-5 text-red-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-neutral-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400">Ingresos totales</p>
                <p className="text-2xl font-semibold text-black mt-1">${stats?.totalRevenue || "0.00"}</p>
              </div>
              <DollarSign className="w-5 h-5 text-neutral-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="bg-neutral-100 border border-neutral-200">
          <TabsTrigger value="users" className="text-sm">Usuarios</TabsTrigger>
          <TabsTrigger value="subscriptions" className="text-sm">Suscripciones</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card className="border-neutral-200">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Usuarios registrados
                </CardTitle>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <Input
                    placeholder="Buscar por nombre o email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-full sm:w-64 text-sm"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-neutral-400 text-left">
                      <th className="pb-2 font-medium">Usuario</th>
                      <th className="pb-2 font-medium">Email</th>
                      <th className="pb-2 font-medium">Registro</th>
                      <th className="pb-2 font-medium">Membresia</th>
                      <th className="pb-2 font-medium">Estado</th>
                      <th className="pb-2 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {filteredUsers?.map((user) => (
                      <tr key={user.id} className="hover:bg-neutral-50/50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-medium text-neutral-600">
                              {(user.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-black">{user.name || "Sin nombre"}</span>
                          </div>
                        </td>
                        <td className="py-3 text-neutral-500">{user.email || "-"}</td>
                        <td className="py-3 text-neutral-400 text-xs">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                        </td>
                        <td className="py-3">
                          {user.subscription ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs capitalize">{user.subscription.plan}</span>
                              <span className="text-neutral-300">|</span>
                              <span className="text-xs text-neutral-400">
                                {user.subscription.currentPeriodEnd
                                  ? new Date(user.subscription.currentPeriodEnd).toLocaleDateString()
                                  : "-"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-300">Ninguna</span>
                          )}
                        </td>
                        <td className="py-3">{getStatusBadge(user)}</td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-1">
                            {!user.isAdmin && (
                              <>
                                {/* Grant subscription button */}
                                {!user.isBlocked && !user.subscription && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setGrantPlan("annual");
                                      setShowGrantDialog(true);
                                    }}
                                    title="Otorgar membresia"
                                  >
                                    <Gift className="w-3.5 h-3.5 mr-1" />
                                    <span className="text-xs">Membresia</span>
                                  </Button>
                                )}
                                {/* Revoke subscription button */}
                                {!user.isBlocked && user.subscription && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                                    onClick={() => {
                                      if (confirm(`Quitar suscripcion a ${user.name || user.email}?`)) {
                                        revokeSubscription.mutate({ userId: user.id });
                                      }
                                    }}
                                    title="Quitar membresia"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                                    <span className="text-xs">Quitar</span>
                                  </Button>
                                )}
                                {/* Block/Unblock button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-7 px-2 ${
                                    user.isBlocked
                                      ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                      : "text-red-500 hover:text-red-600 hover:bg-red-50"
                                  }`}
                                  onClick={() => {
                                    if (confirm(user.isBlocked
                                      ? `Desbloquear a ${user.name || user.email}?`
                                      : `Bloquear a ${user.name || user.email}? No podra acceder a la plataforma.`
                                    )) {
                                      toggleBlock.mutate({ userId: user.id });
                                    }
                                  }}
                                  title={user.isBlocked ? "Desbloquear" : "Bloquear"}
                                >
                                  {user.isBlocked ? (
                                    <><Unlock className="w-3.5 h-3.5 mr-1" /><span className="text-xs">Desbloquear</span></>
                                  ) : (
                                    <><Lock className="w-3.5 h-3.5 mr-1" /><span className="text-xs">Bloquear</span></>
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(!filteredUsers || filteredUsers.length === 0) && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-neutral-400 text-sm">
                          No se encontraron usuarios
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions">
          <Card className="border-neutral-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Suscripciones activas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-neutral-400 text-left">
                      <th className="pb-2 font-medium">Usuario</th>
                      <th className="pb-2 font-medium">Plan</th>
                      <th className="pb-2 font-medium">Estado</th>
                      <th className="pb-2 font-medium">Periodo</th>
                      <th className="pb-2 font-medium">Pagos recientes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {subscriptions?.map((sub: any) => (
                      <tr key={sub.id} className={`hover:bg-neutral-50/50 ${sub.isBlocked ? "opacity-50" : ""}`}>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-medium text-neutral-600">
                              {(sub.userName || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-medium text-black block">{sub.userName || "Sin nombre"}</span>
                              <span className="text-xs text-neutral-400">{sub.userEmail}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge variant={sub.plan === "annual" ? "default" : "outline"} className="text-xs capitalize">
                            {sub.plan === "annual" ? <Calendar className="w-3 h-3 mr-1" /> : <CreditCard className="w-3 h-3 mr-1" />}
                            {sub.plan}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {sub.status === "active" || sub.status === "trialing" ? (
                            <Badge className="bg-emerald-500 text-white text-xs">Activo</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">{sub.status}</Badge>
                          )}
                        </td>
                        <td className="py-3 text-xs text-neutral-500">
                          {sub.currentPeriodEnd
                            ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="py-3">
                          {sub.payments && sub.payments.length > 0 ? (
                            <div className="space-y-1">
                              {sub.payments.slice(0, 2).map((p: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <DollarSign className="w-3 h-3 text-neutral-400" />
                                  <span className="font-medium">${p.amount}</span>
                                  <span className="text-neutral-400">{p.plan}</span>
                                  <span className="text-neutral-300">|</span>
                                  <span className={p.status === "succeeded" ? "text-emerald-500" : "text-amber-500"}>
                                    {p.status}
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
                        <td colSpan={5} className="py-8 text-center text-neutral-400 text-sm">
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

      {/* Grant Subscription Dialog */}
      <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-600" />
              Otorgar membresia
            </DialogTitle>
            <DialogDescription>
              Selecciona el plan y confirma:
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-sm font-medium text-neutral-600">
                {(selectedUser?.name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-black">{selectedUser?.name || "Sin nombre"}</p>
                <p className="text-sm text-neutral-400">{selectedUser?.email}</p>
              </div>
            </div>

            {/* Plan selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGrantPlan("monthly")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  grantPlan === "monthly"
                    ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <p className="text-xs font-medium text-neutral-500">Mensual</p>
                <p className="text-lg font-semibold text-black">$80</p>
                <p className="text-xs text-neutral-400">1 mes de acceso</p>
              </button>
              <button
                onClick={() => setGrantPlan("annual")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  grantPlan === "annual"
                    ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <p className="text-xs font-medium text-neutral-500">Anual</p>
                <p className="text-lg font-semibold text-black">$800</p>
                <p className="text-xs text-neutral-400">1 ano de acceso</p>
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

      {/* Maintenance Mode Dialog */}
      <Dialog open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Modo Mantenimiento
            </DialogTitle>
            <DialogDescription>
              Cuando esta activado, todos los usuarios veran un mensaje de "Bajo Mantenimiento".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className={`p-4 rounded-lg border ${maintenanceStatus?.enabled ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
              <div className="flex items-center gap-3">
                {maintenanceStatus?.enabled ? (
                  <>
                    <ToggleRight className="w-8 h-8 text-red-500" />
                    <div>
                      <p className="font-medium text-red-700">Activado</p>
                      <p className="text-xs text-red-600">Todos los usuarios ven "Bajo Mantenimiento"</p>
                    </div>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-8 h-8 text-emerald-500" />
                    <div>
                      <p className="font-medium text-emerald-700">Desactivado</p>
                      <p className="text-xs text-emerald-600">La app funciona normalmente</p>
                    </div>
                  </>
                )}
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
              {maintenanceStatus?.enabled ? "Desactivar mantenimiento" : "Activar mantenimiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
