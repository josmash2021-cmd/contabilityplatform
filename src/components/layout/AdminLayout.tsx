// The admin's own shell, apart from the business app: a menu on computers (Resumen, Usuarios, Pagos, Impuestos,
// Soporte, Bloqueados, Sistema, and "Volver a mi cuenta"), a bar at the bottom on phones with "Más" for the rest.
// The counts on the menu and the system card come from admin.overview (the same numbers as the Resumen).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigationType } from "react-router";
import { ArrowLeft, CreditCard, FileText, Headphones, Home, MoreHorizontal, Server, UserX, Users, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { MaintenanceReminder } from "@/components/MaintenanceScreen";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useCopy } from "@/i18n/useI18n";
import { adminCopy, type AdminCopy } from "@/i18n/copy/admin";
import { cn } from "@/lib/utils";
import { MenuCount } from "@/components/admin/adminUi";
import { preloadWhenIdle } from "@/lib/preloadPages";

type Item = { path: string; label: keyof AdminCopy["menu"]; icon: LucideIcon; also?: string[]; exact?: boolean };

const ITEMS: Item[] = [
  { path: "/admin", label: "home", icon: Home, exact: true },
  { path: "/admin/usuarios", label: "users", icon: Users, also: ["/admin/actividad"] },
  { path: "/admin/ingresos", label: "payments", icon: CreditCard, also: ["/admin/suscripciones"] },
  { path: "/admin/impuestos", label: "taxes", icon: FileText },
  { path: "/admin/soporte", label: "support", icon: Headphones },
  { path: "/admin/bloqueados", label: "blocked", icon: UserX },
  { path: "/admin/sistema", label: "system", icon: Server },
];
const TABS = ["/admin", "/admin/usuarios", "/admin/ingresos", "/admin/soporte"];

function isOn(pathname: string, it: Item) {
  if (it.exact) return pathname === it.path;
  return [it.path, ...(it.also ?? [])].some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AdminLayout() {
  const { isAdmin } = useAuth();
  const t = useCopy(adminCopy);
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const [more, setMore] = useState(false);
  // Every page opens from its top (the window scrolls here; going back, the browser returns to where they were).
  const lastPath = useRef(pathname);
  useLayoutEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (navType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navType]);
  const { data: o } = trpc.admin.overview.useQuery(undefined, { enabled: isAdmin, refetchInterval: 20_000, refetchOnWindowFocus: true });
  useEffect(() => { if (isAdmin) preloadWhenIdle("admin"); }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const counts: Record<string, { n: number; tone?: "blue" | "red" }> = {
    "/admin/soporte": { n: o?.today.support.chats ?? 0 },
    "/admin/impuestos": { n: o?.today.tax.count ?? 0 },
    "/admin/ingresos": { n: o?.today.failed.length ?? 0, tone: "red" },
  };
  const sys = o?.system;
  const allOk = !!sys && sys.email && sys.bank && sys.payments;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {/* Computers: the menu */}
      <nav aria-label={t.menu.label} className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-6 border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <Link to="/admin" className="flex items-center gap-2.5 rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Logo className="h-8 w-8 text-blue-600" />
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold">{t.menu.title}</span>
            <span className="text-xs text-slate-500">Personal &amp; Business Solutions</span>
          </span>
        </Link>
        <ul className="grid gap-1">
          {ITEMS.map((it) => {
            const on = isOn(pathname, it);
            const c = counts[it.path];
            return (
              <li key={it.path}>
                <Link to={it.path} aria-current={on ? "page" : undefined}
                  className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    on ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")}>
                  <it.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  {t.menu[it.label]}
                  {c && <MenuCount n={c.n} tone={c.tone} className="ml-auto" />}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto grid gap-2.5">
          <Link to="/admin/sistema" className="grid gap-1 rounded-2xl border border-slate-200 p-3 transition-colors hover:bg-slate-50">
            <span className="text-xs text-slate-500">{t.system.title}</span>
            <span className="flex items-center gap-2 text-[13px] font-semibold">
              <span aria-hidden className={cn("h-2 w-2 rounded-full", !sys ? "bg-slate-300" : sys.maintenance ? "bg-amber-500" : allOk ? "bg-emerald-500" : "bg-red-500")} />
              {!sys ? "…" : sys.maintenance ? t.system.maintenanceOn : allOk ? t.system.ok : t.system.some}
            </span>
            <span className="text-xs text-slate-500">{t.system.okText}</span>
          </Link>
          <Link to="/" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t.menu.back}
          </Link>
        </div>
      </nav>

      <div className="min-w-0 flex-1">
        {/* Phones: the top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <Link to="/admin" className="flex items-center gap-2">
            <Logo className="h-7 w-7 text-blue-600" />
            <span className="text-base font-bold">{t.menu.title}</span>
          </Link>
          <Link to="/" className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t.menu.backShort}
          </Link>
        </header>

        <MaintenanceReminder className="px-4 sm:px-8" />
        <main key={pathname} className="animate-in fade-in pb-28 [animation-duration:450ms] lg:pb-0">
          <Outlet />
        </main>

        {/* Phones: the bottom bar */}
        <nav aria-label={t.menu.label} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pt-1.5 pb-[max(16px,calc(env(safe-area-inset-bottom)+8px))] backdrop-blur lg:hidden">
          {ITEMS.filter((it) => TABS.includes(it.path)).map((it) => {
            const on = isOn(pathname, it);
            const c = counts[it.path];
            return (
              <Link key={it.path} to={it.path} aria-current={on ? "page" : undefined}
                className={cn("relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold", on ? "text-slate-900" : "text-slate-500")}>
                <it.icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.3 : 2} aria-hidden="true" />
                {t.menu[it.label]}
                {c && c.n > 0 && <span className={cn("absolute right-[calc(50%-22px)] top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white", c.tone === "red" ? "bg-red-600" : "bg-blue-600")}>{c.n}</span>}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMore(true)} className={cn("flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold", ITEMS.some((it) => !TABS.includes(it.path) && isOn(pathname, it)) ? "text-slate-900" : "text-slate-500")}>
            <MoreHorizontal className="h-[22px] w-[22px]" aria-hidden="true" />{t.menu.more}
          </button>
        </nav>
        <Sheet open={more} onOpenChange={setMore}>
          <SheetContent side="bottom" className="rounded-t-[24px] pb-[max(20px,calc(env(safe-area-inset-bottom)+12px))]">
            <SheetHeader><SheetTitle>{t.menu.more}</SheetTitle></SheetHeader>
            <ul className="grid gap-1 px-2 pb-2">
              {ITEMS.filter((it) => !TABS.includes(it.path)).map((it) => (
                <li key={it.path}>
                  <Link to={it.path} onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium hover:bg-slate-100">
                    <it.icon className="h-5 w-5 text-slate-600" aria-hidden="true" />{t.menu[it.label]}
                    {counts[it.path] && <MenuCount n={counts[it.path].n} tone={counts[it.path].tone} className="ml-auto" />}
                  </Link>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
