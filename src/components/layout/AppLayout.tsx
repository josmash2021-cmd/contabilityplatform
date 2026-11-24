import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from "react";
import { preloadWhenIdle } from "@/lib/preloadPages";
import { toast } from "sonner";
import { Outlet, useLocation, useNavigate, Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useAutoRepair } from "@/hooks/useAutoRepair";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/Logo";
import { MaintenanceReminder, MaintenanceScreen } from "@/components/MaintenanceScreen";
import { useExit } from "@/hooks/useExit";
import { SubscriptionExpiredOverlay } from "@/components/SubscriptionExpiredOverlay";
import { SubscriptionPageGate } from "@/components/SubscriptionGate";
import { useCopy } from "@/i18n/useI18n";
import { GlobalSearch, NoticesBell } from "@/components/layout/TopBar";
import { useEffectiveRole } from "@/components/team/viewAs";
import { ViewAsBanner } from "@/components/team/ViewAsBanner";
import { appCopy, type AppCopy } from "@/i18n/copy/app";
import { teamCopy } from "@/i18n/copy/team";
import { supportCopy } from "@/i18n/copy/support";
import type { Feature } from "@contracts/planFeatures";
import {
  Home, Inbox, Tag, ShoppingCart, ClipboardList, Users, Wallet, Truck, Landmark, ArrowLeftRight, BarChart3, BookOpen,
  FileText, Sparkles, UsersRound, Settings, PieChart, Target, Repeat, Shield, Plus, MoreHorizontal, Lock,
  LogOut, Gift, Loader2, Camera, User, Banknote, type LucideIcon,
} from "lucide-react";

type Item = { path: string; icon: LucideIcon; feature?: Feature };
type Group = { title?: string; sep?: boolean; items: Item[] };

// ── The 2.0 menu: grouped like accounting software, but shorter ──
const BUSINESS_GROUPS: Group[] = [
  { items: [{ path: "/", icon: Home }, { path: "/transactions", icon: Inbox }] },
  { title: "sales", items: [{ path: "/pos", icon: ShoppingCart }, { path: "/invoices", icon: FileText }, { path: "/quotes", icon: ClipboardList, feature: "quotes" }, { path: "/customers", icon: Users }, { path: "/services", icon: Tag }] },
  { title: "spend", items: [{ path: "/expenses", icon: Wallet }, { path: "/vendors", icon: Truck, feature: "vendors" }] },
  { title: "money", items: [{ path: "/bank", icon: Landmark }, { path: "/reports", icon: BarChart3 }, { path: "/accountant", icon: BookOpen, feature: "accountant" }, { path: "/taxes", icon: FileText, feature: "taxes" }] },
  { title: "general", items: [{ path: "/assistant", icon: Sparkles }, { path: "/team", icon: UsersRound, feature: "team" }, { path: "/settings", icon: Settings }] },
];
const PERSONAL_GROUPS: Group[] = [
  { title: "taxes", sep: true, items: [{ path: "/personal/taxes", icon: FileText }] },
  { items: [{ path: "/personal", icon: Home }, { path: "/personal/transactions", icon: ArrowLeftRight }] },
  { title: "plan", items: [{ path: "/personal/budgets", icon: PieChart, feature: "budgets" }, { path: "/personal/goals", icon: Target }, { path: "/personal/subscriptions", icon: Repeat }] },
  { title: "account", items: [{ path: "/personal/bank", icon: Landmark }, { path: "/personal/assistant", icon: Sparkles }, { path: "/settings", icon: Settings }] },
];
/** The "+" sheet (Crear): an icon for each thing it creates. */
function newIcon(path: string): LucideIcon {
  if (path === "/expenses?photo=1") return Camera;
  const base = path.split("?")[0];
  const icons: Record<string, LucideIcon> = {
    "/pos": ShoppingCart, "/invoices": FileText, "/quotes": ClipboardList, "/expenses": Wallet, "/customers": User,
    "/personal/transactions": Banknote, "/personal/goals": Target, "/personal/budgets": PieChart,
  };
  return icons[base] ?? Plus;
}
/** The phone tab bar: two tabs, the "+" button, one tab, and "Más". */
const TABS = { business: ["/", "/transactions", "/invoices"], personal: ["/personal", "/personal/transactions", "/personal/goals"] };

/** An employee on a team: takes payments, serves clients, photographs receipts. */
/** /expenses is where receipt photos are taken now (the page shows employees only that). */
const STAFF_PATHS = new Set(["/pos", "/invoices", "/customers", "/receipts", "/expenses"]);
/** The accountant reads the books; these are the owner's alone. */
const ACCOUNTANT_HIDDEN = new Set(["/taxes", "/assistant", "/team", "/settings"]);

function isOn(pathname: string, path: string) {
  if (path === "/" || path === "/personal") return pathname === path;
  return pathname === path || pathname.startsWith(path + "/");
}

/** Shown at the top of the app while the user is on the free trial. */
function TrialBanner() {
  const t = useCopy(appCopy);
  const { isAdmin } = useAuth();
  const { data: status } = trpc.subscription.status.useQuery(undefined, {
    enabled: !isAdmin,
    refetchInterval: 10000, // same query (and cache) as the page gate
  });
  const trial = status?.status === "trialing" ? status.trial : null;
  if (!trial?.active) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-xs text-emerald-900 sm:text-sm">
      <span className="inline-flex items-center gap-1.5"><Gift className="h-4 w-4 text-emerald-600" />{t.trial.banner(trial.daysLeft)}</span>
      <Link to="/settings?sec=plan" className="font-semibold underline-offset-2 hover:underline">{t.trial.choosePlan}</Link>
    </div>
  );
}

/** Tells a team member whose team they're on, and lets them leave. */
function TeamBanner() {
  const t = useCopy(teamCopy);
  const { data } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const leave = trpc.team.leave.useMutation({ onSuccess: () => { window.location.href = "/"; } });
  if (!data) return null;
  const role = t.roles[data.role].name;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-blue-100 bg-blue-50 px-4 py-2 text-center text-sm text-blue-900">
      <span>{t.banner(data.ownerName || "", role)}{data.role === "accountant" ? ` · ${t.readOnly}` : ""}</span>
      <button className="font-semibold underline-offset-2 hover:underline" onClick={() => { if (window.confirm(t.leaveConfirm)) leave.mutate(); }}>{t.leave}</button>
    </div>
  );
}

type NavProps = { groups: Group[]; pathname: string; locked: (i: Item) => boolean; label: (path: string) => string; t: AppCopy; onGo: (path: string) => void; counts: Record<string, number> };

/** A small count pill, like "Por revisar 9" in the prototype. */
function CountPill({ n, on, className }: { n: number; on?: boolean; className?: string }) {
  if (!n) return null;
  return <span className={cn("min-w-[22px] rounded-full px-1.5 py-px text-center text-[11px] font-bold tabular-nums", on ? "bg-blue-500 text-white" : "bg-blue-600 text-white", className)}>{n > 99 ? "99+" : n}</span>;
}

/** Desktop side menu: groups with small titles; the current page is a dark pill. */
function SideNav({ groups, pathname, locked, label, t, onGo, counts }: NavProps) {
  return (
    <nav aria-label={t.shell.searchLabel} className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="px-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t.shell.groups[g.title]}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const on = isOn(pathname, item.path);
              const lock = locked(item);
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <button
                    onClick={() => onGo(item.path)}
                    aria-current={on ? "page" : undefined}
                    title={lock ? t.shell.locked : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      on ? "bg-slate-900 font-semibold text-white" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={on ? 2.2 : 1.8} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{label(item.path)}</span>
                    {!lock && <CountPill n={counts[item.path] ?? 0} on={on} />}
                    {lock && <Lock className={cn("h-3.5 w-3.5 shrink-0", on ? "text-white/70" : "text-slate-300")} aria-label={t.shell.locked} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {g.sep && <div className="mx-3.5 mt-4 border-t border-slate-200" role="separator" />}
        </div>
      ))}
    </nav>
  );
}

/** Jump to any section by typing its name (or what it's for). */
/** "+ Nuevo": the things people create most, one tap away. */
function NewMenu({ items, t, onGo }: { items: [string, string, string?][]; t: AppCopy; onGo: (p: string) => void }) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2">
          <Plus className="h-4 w-4" />{t.shell.newBtn}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="w-56">
        <DropdownMenuLabel>{t.shell.newTitle}</DropdownMenuLabel>
        {items.map(([path, label, sub]) => (
          <DropdownMenuItem key={path + label} onSelect={() => onGo(path)} className="flex-col items-start gap-0 py-2">
            <span className="text-sm font-semibold text-slate-900">{label}</span>
            {sub && <span className="text-xs text-slate-500">{sub}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu({ name, email, initial, t, onGo, logout }: { name: string; email?: string | null; initial: string; t: AppCopy; onGo: (p: string) => void; logout: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={t.shell.accountMenu}>
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
          {email && <span className="block truncate text-xs text-slate-500">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onGo("/settings")} className="py-2.5"><Settings className="mr-2 h-4 w-4" />{t.shell.labels["/settings"]}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onGo("/privacy")} className="py-2.5"><Shield className="mr-2 h-4 w-4" />{t.shell.privacy}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout} className="py-2.5 text-red-600 focus:text-red-600"><LogOut className="mr-2 h-4 w-4" />{t.logout}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const t = useCopy(appCopy);
  const userMode: "business" | "personal" = user?.modePreference === "personal" ? "personal" : "business";
  useAutoRepair(); // Auto-repair accounting on login (silent)
  const { data: settings } = trpc.settings.get.useQuery(undefined, { staleTime: Infinity, refetchOnMount: false });
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 60_000 });
  const [moreOpen, setMoreOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const pathname = location.pathname;

  // Route guard: keep people in their mode's routes.
  useEffect(() => {
    if (!user) return;
    const isPersonalRoute = pathname.startsWith("/personal");
    const isBusinessRoute = !isPersonalRoute && pathname !== "/settings" && pathname !== "/onboarding";
    if (userMode === "personal" && isBusinessRoute) navigate("/personal", { replace: true });
    else if (userMode === "business" && isPersonalRoute) navigate("/", { replace: true });
  }, [user, userMode, pathname, navigate]);

  // Team members see only what their role allows (the server enforces it too: api/lib/team.ts).
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { enabled: !!user && userMode === "business", staleTime: 60_000 });
  // "Ver como" (Equipo): the owner can preview the app as an employee or the accountant. Everything below
  // (menu, tabs, + Nuevo, route guard) follows that role; actions are still the owner's (see ViewAsBanner).
  const memberRole = useEffectiveRole(membership?.role ?? null);
  useEffect(() => {
    if (memberRole === "staff" && !STAFF_PATHS.has(pathname)) navigate("/pos", { replace: true });
    if (memberRole === "accountant" && ACCOUNTANT_HIDDEN.has(pathname)) navigate("/", { replace: true });
  }, [memberRole, pathname, navigate]);

  const groups = useMemo(() => {
    const base = userMode === "personal" ? PERSONAL_GROUPS : BUSINESS_GROUPS;
    const keep = (i: Item) => memberRole === "staff" ? STAFF_PATHS.has(i.path) : memberRole === "accountant" ? !ACCOUNTANT_HIDDEN.has(i.path) : true;
    const g = base.map((x) => ({ ...x, items: x.items.filter(keep) })).filter((x) => x.items.length);
    if (isAdmin && !memberRole) g.push({ items: [{ path: "/admin", icon: Shield }] });
    return g;
  }, [userMode, memberRole, isAdmin]);
  const { data: review } = trpc.review.count.useQuery(undefined, { enabled: !!user && userMode === "business" && memberRole !== "staff", staleTime: 60_000, refetchInterval: 120_000 });
  // Admins: a count on Admin for support chats with unread lines, and a notice when a visitor writes (api/support-router.ts).
  const supportT = useCopy(supportCopy).admin;
  const { data: support } = trpc.support.adminUnread.useQuery(undefined, { enabled: !!user && isAdmin && !memberRole, refetchInterval: 15_000, refetchOnWindowFocus: true });
  const lastSupport = useRef<number | null>(null);
  useEffect(() => {
    const latest = support?.latest;
    if (latest === undefined) return;
    if (lastSupport.current !== null && latest > lastSupport.current && !pathname.startsWith("/admin/soporte")) {
      toast(supportT.newToast, { action: { label: supportT.openChat, onClick: () => navigate("/admin/soporte") } });
    }
    lastSupport.current = latest;
  }, [support?.latest, pathname, navigate, supportT]);
  const counts: Record<string, number> = { "/transactions": review?.count ?? 0, "/admin": support?.unread ?? 0 };
  const allItems = groups.flatMap((g) => g.items);
  const label = (path: string) => (path === "/settings" && userMode === "personal" ? t.nav.settingsPersonal : t.shell.labels[path] ?? path);
  const locked = (i: Item) => !!i.feature && !!plan && !plan.features.includes(i.feature);
  // Changing page: the page goes soft, the next one comes in still soft and clears into focus, with no sharp frame
  // in between (index.css .page-fx). One wrapper that stays mounted carries the effect: data-fx="out" is the soft
  // state; the new page is shown before paint (layout effect) and then eases back to sharp.
  const fxRef = useRef<HTMLDivElement>(null);
  const fxPath = useRef(location.pathname);
  useLayoutEffect(() => {
    const el = fxRef.current;
    const changed = fxPath.current !== location.pathname;
    fxPath.current = location.pathname;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { el.dataset.fx = "in"; return; }
    // Coming from the menu the page is already soft; any other change of page starts soft right away.
    if (el.dataset.fx !== "out") {
      if (!changed) return;
      el.style.transition = "none";
      el.dataset.fx = "out";
      void el.offsetWidth;
      el.style.transition = "";
    }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => { el.dataset.fx = "in"; }));
    return () => cancelAnimationFrame(raf);
  }, [location.key, location.pathname]);
  // The tapped item shows as selected right away (before the page has changed); a change of page from
  // anywhere else (back button, a link) takes over, because `from` no longer matches.
  const [pend, setPend] = useState<{ to: string; from: string } | null>(null);
  const navPath = pend && pend.from === pathname ? pend.to : pathname;
  // The other pages' code downloads once the app is idle, so a tap doesn't wait for it (src/lib/preloadPages.ts).
  useEffect(() => { preloadWhenIdle("app"); }, []);
  const go = (path: string) => {
    setMoreOpen(false);
    setNewOpen(false);
    const el = fxRef.current;
    const same = path === pathname;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!same) setPend({ to: path.split("?")[0], from: pathname });
    if (same || still || !el) { navigate(path); return; }
    el.dataset.fx = "out";
    // No waiting: the page changes now. If its code is still downloading, the old page stays soft meanwhile
    // (a transition keeps it on screen), then the layout effect above brings the new one into focus.
    startTransition(() => { navigate(path); });
    // Never stay soft if nothing changed.
    window.setTimeout(() => { if (el.dataset.fx === "out" && fxPath.current === pathname) el.dataset.fx = "in"; }, 3000);
  };

  const tabs = (memberRole === "staff" ? ["/pos", "/customers", "/expenses"] : TABS[userMode])
    .map((p) => allItems.find((i) => i.path === p)).filter((i): i is Item => !!i);
  const rest = allItems.filter((i) => !tabs.includes(i));
  const newItems = memberRole === "accountant" ? [] : memberRole === "staff"
    ? t.shell.newItems.business.filter(([p]) => STAFF_PATHS.has(p.split("?")[0]))
    : t.shell.newItems[userMode];

  const companyName = userMode === "personal" ? (user?.name || t.myAccount) : (settings?.companyName || t.myCompany);
  const displayName = user?.name || t.myAccount;
  const initial = (user?.name || "C").trim().charAt(0).toUpperCase();
  const planLabel = !plan ? "" : plan.trial ? t.shell.plan.trial : plan.tier ? t.shell.plan[plan.tier] : t.shell.plan.none;

  // ── Maintenance mode ──
  const { data: maintenance } = trpc.admin.maintenanceStatus.useQuery(undefined, { refetchInterval: 10000, refetchOnWindowFocus: true });
  // Customers see the notice (it fades away by itself when it's turned off); the admin gets a reminder line instead.
  const maintenanceView = useExit(maintenance?.enabled === true && !isAdmin, 600);

  return (
    <div className="flex h-screen bg-slate-50">
      {maintenanceView.mounted && <MaintenanceScreen message={maintenance?.message ?? null} until={maintenance?.until ?? null} leaving={maintenanceView.leaving} />}

      {/* ── Desktop side menu ── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-3 px-5 pb-5 pt-5">
          <Logo className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{companyName}</p>
            <p className="truncate text-xs text-slate-500">{planLabel || "Personal & Business Solutions"}</p>
          </div>
        </div>
        <SideNav groups={groups} pathname={navPath} locked={locked} label={label} t={t} onGo={go} counts={counts} />
        <div className="border-t border-slate-100 px-5 py-3">
          <Link to="/privacy" className="text-[11px] text-slate-400 hover:text-slate-600">{t.shell.privacy}</Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Top bar: search, + Nuevo, account (phone: brand, + and account) ── */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
          <div className="flex min-w-0 flex-1">
            <GlobalSearch sections={allItems} label={label} t={t} onGo={go} personal={userMode === "personal"} />
          </div>
          {!memberRole && <NoticesBell t={t} onGo={go} />}
          <div className="hidden lg:block"><NewMenu items={newItems} t={t} onGo={go} /></div>
          <AccountMenu name={displayName} email={user?.email} initial={initial} t={t} onGo={go} logout={logout} />
        </header>

        <main className="relative flex-1 overflow-y-auto pb-24 lg:pb-0">
          {isAdmin && !memberRole && <MaintenanceReminder className="px-4 lg:px-8" />}
          <ViewAsBanner />
          <TeamBanner />
          <TrialBanner />
          <SubscriptionPageGate>
            {/* Pages are lazy-loaded; keep the menu while one loads */}
            <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}>
              <div ref={fxRef} className="page-fx" data-fx="in">
                <div key={pathname}>
                  <Outlet />
                </div>
              </div>
            </Suspense>
          </SubscriptionPageGate>
        </main>

        {/* ── Phone tab bar ── */}
        <nav data-tabbar aria-label={t.shell.searchLabel} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[max(16px,calc(env(safe-area-inset-bottom,0px)+8px))] pl-[max(4px,env(safe-area-inset-left,0px))] pr-[max(4px,env(safe-area-inset-right,0px))] pt-1.5 lg:hidden">
          {[tabs[0], tabs[1]].map((tab) => tab ? <TabButton key={tab.path} item={tab} on={isOn(navPath, tab.path)} label={t.shell.short[tab.path] ?? label(tab.path)} onGo={go} count={counts[tab.path]} /> : <span key="empty-l" />)}
          <div className="grid place-items-center">
            {newItems.length ? (
              <button type="button" onClick={() => setNewOpen(true)} aria-haspopup="dialog" aria-expanded={newOpen} aria-label={t.shell.newTitle}
                className="grid h-12 w-12 -translate-y-3 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                <Plus className={cn("h-6 w-6 transition-transform duration-300", newOpen && "rotate-45")} />
              </button>
            ) : null}
          </div>
          {tabs[2] ? <TabButton item={tabs[2]} on={isOn(navPath, tabs[2].path)} label={t.shell.short[tabs[2].path] ?? label(tabs[2].path)} onGo={go} count={counts[tabs[2].path]} /> : <span />}
          <button
            onClick={() => setMoreOpen(true)}
            aria-current={rest.some((i) => isOn(navPath, i.path)) ? "page" : undefined}
            className={cn("grid min-h-[48px] justify-items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold", rest.some((i) => isOn(navPath, i.path)) ? "text-blue-600" : "text-slate-500")}
          >
            <MoreHorizontal className="h-[22px] w-[22px]" aria-hidden />{t.shell.more}
          </button>
        </nav>
        {/* The "+" sheet (Crear): what you can make, each with its icon, like the Más sheet. */}
        <Sheet open={newOpen} onOpenChange={setNewOpen}>
          <SheetContent side="bottom" className="max-h-[86vh] gap-0 overflow-y-auto rounded-t-[18px] p-4 pb-[calc(18px+env(safe-area-inset-bottom,0px))] lg:hidden">
            <SheetHeader className="min-h-8 justify-center p-0 pr-10 text-left"><SheetTitle className="text-[19px] font-[750] tracking-tight text-slate-900">{t.shell.newTitle}</SheetTitle></SheetHeader>
            <ul className="mt-3.5 grid gap-1.5">
              {newItems.map(([path, itemLabel, sub]) => {
                const Icon = newIcon(path);
                return (
                  <li key={path + itemLabel}>
                    <button type="button" onClick={() => go(path)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <Icon className="h-5 w-5 shrink-0 text-slate-800" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{itemLabel}</span>
                        {sub && <span className="block truncate text-xs font-medium text-slate-500">{sub}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="max-h-[86vh] gap-0 overflow-y-auto rounded-t-[18px] p-4 pb-[calc(18px+env(safe-area-inset-bottom,0px))] lg:hidden">
            {/* The title on the same line as the close button, like the 2.0 sheet. */}
            <SheetHeader className="min-h-8 justify-center p-0 pr-10 text-left"><SheetTitle className="text-[19px] font-[750] tracking-tight text-slate-900">{t.shell.moreTitle}</SheetTitle></SheetHeader>
            {groups.map((g, gi) => {
              const items = g.items.filter((i) => rest.includes(i));
              if (!items.length) return null;
              return (
                <section key={g.title ?? `g${gi}`} aria-label={g.title ? t.shell.groups[g.title] : undefined}>
                  {g.title && <p className="mx-0.5 mb-1.5 mt-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{t.shell.groups[g.title]}</p>}
                  <ul className={cn("grid gap-1.5", !g.title && "mt-3.5")}>
                    {items.map((i) => {
                      const Icon = i.icon;
                      const on = isOn(navPath, i.path);
                      return (
                        <li key={i.path}>
                          <button onClick={() => go(i.path)} aria-current={on ? "page" : undefined}
                            className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                              on ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100")}>
                            <Icon className={cn("h-5 w-5 shrink-0", on ? "text-blue-600" : "text-slate-800")} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900">{label(i.path)}</span>
                              {t.shell.desc[i.path] && <span className="block truncate text-xs font-medium text-slate-500">{t.shell.desc[i.path]}</span>}
                            </span>
                            {!locked(i) && <CountPill n={counts[i.path] ?? 0} on={false} />}
                            {locked(i) && <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-label={t.shell.locked} />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </SheetContent>
        </Sheet>
      </div>

      {/* Subscription expired overlay — shown on all pages when the subscription expires */}
      <SubscriptionExpiredOverlay />
    </div>
  );
}

function TabButton({ item, on, label, onGo, count = 0 }: { item: Item; on: boolean; label: string; onGo: (p: string) => void; count?: number }) {
  const Icon = item.icon;
  return (
    <button onClick={() => onGo(item.path)} aria-current={on ? "page" : undefined}
      className={cn("grid min-h-[48px] justify-items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold", on ? "text-blue-600" : "text-slate-500")}>
      <span className="relative">
        <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.2 : 1.8} aria-hidden />
        {count > 0 && <CountPill n={count} className="absolute -right-3 -top-2 ring-2 ring-white" />}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
