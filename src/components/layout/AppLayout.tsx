import { useState, useMemo, memo, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useAutoRepair } from "@/hooks/useAutoRepair";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/Logo";
import { SubscriptionExpiredOverlay } from "@/components/SubscriptionExpiredOverlay";
import { SubscriptionPageGate } from "@/components/SubscriptionGate";
import {
  LayoutDashboard, ShoppingCart, Wrench, Users, Receipt,
  Landmark, BarChart3, Settings, Menu, LogOut,
  Target, ArrowLeftRight, User, Tv, Shield,
} from "lucide-react";

const businessNav = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/pos", label: "Cobrar", icon: ShoppingCart },
  { path: "/services", label: "Servicios", icon: Wrench },
  { path: "/customers", label: "Clientes", icon: Users },
  { path: "/transactions", label: "Transacciones", icon: Receipt },
  { path: "/bank", label: "Banco", icon: Landmark },
  { path: "/reports", label: "Reportes", icon: BarChart3 },
  { path: "/settings", label: "Ajustes", icon: Settings },
];

const personalNav = [
  { path: "/personal", label: "Inicio", icon: LayoutDashboard },
  { path: "/personal/transactions", label: "Transacciones", icon: ArrowLeftRight },
  { path: "/personal/subscriptions", label: "Suscripciones", icon: Tv },
  { path: "/personal/goals", label: "Metas", icon: Target },
  { path: "/settings", label: "Perfil", icon: User },
];

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const userMode = user?.modePreference || "business";
  useAutoRepair(); // Auto-repair accounting on login (silent)
  const { data: settings } = trpc.settings.get.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnMount: false,
  });
  const isActive = (path: string) => location.pathname === path;

  // ── Auto-sync admin role from server ──
  // If server says user is admin but localStorage says user, update and reload
  const { data: serverUser } = trpc.auth.me.useQuery(undefined, {
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  useEffect(() => {
    if (serverUser?.role === "admin" && user?.role !== "admin") {
      // Server says admin, local says otherwise → update and reload
      const updated = { ...user, role: "admin" };
      localStorage.setItem("auth_user", JSON.stringify(updated));
      window.location.reload();
    }
  }, [serverUser?.role, user]);

  // Route guard: redirect users to their correct mode routes
  useEffect(() => {
    if (!user) return;
    const currentPath = location.pathname;
    const isPersonalRoute = currentPath.startsWith("/personal");
    const isBusinessRoute = !isPersonalRoute && currentPath !== "/settings" && currentPath !== "/onboarding";

    if (userMode === "personal" && isBusinessRoute) {
      navigate("/personal", { replace: true });
    } else if (userMode === "business" && isPersonalRoute) {
      navigate("/", { replace: true });
    }
  }, [user, userMode, location.pathname, navigate]);

  const navItems = userMode === "personal" ? personalNav : businessNav;
  const companyName = userMode === "personal" ? (user?.name || "Mi Cuenta") : (settings?.companyName || "Mi Empresa");
  const userInitial = useMemo(() => (user?.name || "C").charAt(0).toUpperCase(), [user?.name]);
  const displayName = useMemo(() => user?.name || "Mi Cuenta", [user?.name]);

  const NavContent = memo(({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <Logo className="w-7 h-7 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xs font-semibold text-black tracking-tight truncate">{companyName}</h1>
            <p className="text-[9px] text-neutral-400 truncate">{userMode === "personal" ? "Finanzas Personales" : "Ai Aethel Accountant"}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button key={item.path} onClick={() => { navigate(item.path); onNavigate?.(); }}
              className={cn("flex items-center gap-3 w-full px-3 py-2 rounded-md transition-colors duration-150", active ? "bg-neutral-100 text-black font-medium" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50")}>
              <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2 : 1.5} />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
        {isAdmin && (
          <button
            onClick={() => { navigate("/admin"); onNavigate?.(); }}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2 rounded-md transition-colors duration-150",
              isActive("/admin")
                ? "bg-neutral-100 text-black font-medium"
                : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
            )}
          >
            <Shield className="w-4 h-4 shrink-0" strokeWidth={isActive("/admin") ? 2 : 1.5} />
            <span className="text-sm">Admin</span>
          </button>
        )}
      </nav>
      <div className="p-3 mt-auto border-t border-neutral-100">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Avatar className="w-7 h-7">
            <AvatarFallback className="bg-neutral-200 text-neutral-600 text-xs font-medium">{userInitial}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-neutral-400">{userMode === "personal" ? "Perfil" : "Cuenta"}</p>
            <p className="text-xs text-black truncate">{displayName}</p>
            {userMode === "personal" && user?.email && (
              <p className="text-[10px] text-neutral-400 truncate">{user.email}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors duration-150" onClick={logout} title="Cerrar sesion">
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  ));

  return (
    <div className="flex h-screen bg-white">
      <aside className="hidden lg:flex flex-col w-56 border-r border-neutral-200 bg-white shrink-0">
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-neutral-200">
        <div className="flex items-center gap-3 px-4 h-14">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-2 -ml-2 rounded-md text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors duration-150">
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 sm:w-80 bg-white border-neutral-200 p-0">
              <NavContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <Logo className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-semibold text-black truncate block">{companyName}</span>
              <span className="text-[9px] text-neutral-400 truncate block">Ai Aethel Accountant</span>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0 relative">
        <SubscriptionPageGate>
          <Outlet />
        </SubscriptionPageGate>
      </main>

      {/* Subscription expired overlay — shown on all pages when subscription expires */}
      <SubscriptionExpiredOverlay />
    </div>
  );
}
