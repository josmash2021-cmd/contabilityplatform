import { lazy, Suspense, type ComponentType } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { getLang } from "@/i18n/lang";
import { useAuth } from "@/hooks/useAuth";
import { ModeProvider } from "@/contexts/ModeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PersonalBankGate } from "@/components/PersonalBankGate";
// Public pages load with the first bundle so the site opens fast.
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import NotFound from "@/pages/NotFound";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import TermsOfUse from "@/pages/TermsOfUse";
import AuthLayout from "@/components/layout/AuthLayout";

/**
 * Lazy-load a page. After a deploy, the old chunk files no longer exist; if a
 * chunk fails to load, reload once to pick up the new version.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy
function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((err) => {
      const key = "chunk-reload-at";
      let last = 0;
      try { last = Number(sessionStorage.getItem(key) || 0); } catch { /* ignore */ }
      if (Date.now() - last > 10_000) {
        try { sessionStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
        window.location.reload();
        return new Promise<{ default: T }>(() => {}); // wait for the reload
      }
      throw err;
    }),
  );
}

// App pages are split out of the landing bundle.
const AppLayout = lazyPage(() => import("@/components/layout/AppLayout").then((m) => ({ default: m.AppLayout })));
const Dashboard = lazyPage(() => import("@/pages/Dashboard"));
const POS = lazyPage(() => import("@/pages/POS"));
const Services = lazyPage(() => import("@/pages/Services"));
const Customers = lazyPage(() => import("@/pages/Customers"));
const Transactions = lazyPage(() => import("@/pages/Transactions"));
const Bank = lazyPage(() => import("@/pages/Bank"));
const BankCategoryDetail = lazyPage(() => import("@/pages/BankCategoryDetail"));
const BankTransactions = lazyPage(() => import("@/pages/BankTransactions"));
const Reports = lazyPage(() => import("@/pages/Reports"));
const Settings = lazyPage(() => import("@/pages/Settings"));
const PersonalDashboard = lazyPage(() => import("@/pages/PersonalDashboard"));
const PersonalTransactions = lazyPage(() => import("@/pages/PersonalTransactions"));
const PersonalGoals = lazyPage(() => import("@/pages/PersonalGoals"));
const PersonalSubscriptions = lazyPage(() => import("@/pages/PersonalSubscriptions"));
const PersonalBank = lazyPage(() => import("@/pages/PersonalBank"));
const PersonalCategoryDetail = lazyPage(() => import("@/pages/PersonalCategoryDetail"));
const Onboarding = lazyPage(() => import("@/pages/Onboarding"));
const Setup = lazyPage(() => import("@/pages/Setup"));
const Diagnostico = lazyPage(() => import("@/pages/Diagnostico"));
const Admin = lazyPage(() => import("@/pages/Admin"));
const AdminDetail = lazyPage(() => import("@/pages/AdminDetail"));
const AdminUserActivity = lazyPage(() => import("@/pages/AdminUserActivity"));
const AdminTaxes = lazyPage(() => import("@/pages/AdminTaxes"));
const AdminSupport = lazyPage(() => import("@/pages/AdminSupport"));
const Taxes = lazyPage(() => import("@/pages/Taxes"));
const Assistant = lazyPage(() => import("@/pages/Assistant"));
const PersonalBudgets = lazyPage(() => import("@/pages/PersonalBudgets"));
const Team = lazyPage(() => import("@/pages/Team"));
const JoinTeam = lazyPage(() => import("@/pages/JoinTeam"));
const SiteProducto = lazyPage(() => import("@/pages/site/Producto"));
const SiteComoFunciona = lazyPage(() => import("@/pages/site/ComoFunciona"));
const SiteSeguridad = lazyPage(() => import("@/pages/site/Seguridad"));
const SitePrecios = lazyPage(() => import("@/pages/site/Precios"));
const SitePreguntas = lazyPage(() => import("@/pages/site/Preguntas"));
const Receipts = lazyPage(() => import("@/pages/Receipts"));
const Expenses = lazyPage(() => import("@/pages/Expenses"));
const Vendors = lazyPage(() => import("@/pages/Vendors"));
const Quotes = lazyPage(() => import("@/pages/Quotes"));
const Invoices = lazyPage(() => import("@/pages/Invoices"));
const Accountant = lazyPage(() => import("@/pages/Accountant"));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label={getLang() === "es" ? "Cargando" : "Loading"}>
      <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { pathname, search } = useLocation();

  if (!isAuthenticated) {
    // Visitors see the company landing page at "/"; other app URLs ask them to log in, then come back here
    // (a link from an email to Impuestos lands on Impuestos after signing in).
    if (pathname === "/") return <Landing />;
    return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  }
  return <>{children}</>;
}

function PublicGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<PublicGuard><Login /></PublicGuard>} />
          <Route path="/register" element={<Register />} />
          {/* Team invitations: works logged in or out */}
          <Route path="/join" element={<JoinTeam />} />
          <Route path="/forgot-password" element={<PublicGuard><ForgotPassword /></PublicGuard>} />
        </Route>

        {/* Onboarding - accessible when logged in */}
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Setup - admin only on the server */}
        <Route path="/setup" element={<Setup />} />

        {/* Diagnostico - hidden page for debugging */}
        <Route path="/diagnostico" element={<Diagnostico />} />

        {/* Privacy Policy - public, required by Plaid */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        {/* Tax service terms - accepted before sending a return */}
        <Route path="/terminos" element={<TermsOfService />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/terminos-de-uso" element={<TermsOfUse />} />
        <Route path="/terms-of-use" element={<TermsOfUse />} />

        {/* Public site pages (the marketing menu) */}
        <Route path="/producto" element={<SiteProducto />} />
        <Route path="/como-funciona" element={<SiteComoFunciona />} />
        <Route path="/seguridad" element={<SiteSeguridad />} />
        <Route path="/precios" element={<SitePrecios />} />
        <Route path="/preguntas" element={<SitePreguntas />} />

        {/* Protected routes with ModeProvider ("/" shows the landing page to visitors) */}
        <Route element={<AuthGuard><ModeProvider><AppLayout /></ModeProvider></AuthGuard>}>
          {/* Business routes */}
          <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="/pos" element={<POS />} />
          <Route path="/services" element={<Services />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/bank" element={<Bank />} />
          <Route path="/bank/category/:category" element={<BankCategoryDetail />} />
          <Route path="/bank/transactions" element={<BankTransactions />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/accountant" element={<Accountant />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/usuarios" element={<AdminDetail section="users" />} />
          <Route path="/admin/suscripciones" element={<AdminDetail section="subs" />} />
          <Route path="/admin/bloqueados" element={<AdminDetail section="blocked" />} />
          <Route path="/admin/ingresos" element={<AdminDetail section="revenue" />} />
          <Route path="/admin/actividad/:userId" element={<AdminUserActivity />} />
          <Route path="/admin/impuestos" element={<AdminTaxes />} />
          <Route path="/admin/impuestos/:id" element={<AdminTaxes />} />
          <Route path="/admin/soporte" element={<AdminSupport />} />
          <Route path="/admin/soporte/:id" element={<AdminSupport />} />
          {/* Personal routes - wrapped with bank gate (menu stays usable, only content area blocked) */}
          <Route path="/personal" element={<PersonalBankGate><PersonalDashboard /></PersonalBankGate>} />
          <Route path="/personal/bank" element={<PersonalBank />} />
          <Route path="/personal/transactions" element={<PersonalBankGate><PersonalTransactions /></PersonalBankGate>} />
          <Route path="/personal/goals" element={<PersonalBankGate><PersonalGoals /></PersonalBankGate>} />
          <Route path="/personal/budgets" element={<PersonalBankGate><PersonalBudgets /></PersonalBankGate>} />
          <Route path="/personal/subscriptions" element={<PersonalBankGate><PersonalSubscriptions /></PersonalBankGate>} />
          <Route path="/personal/category/:category" element={<PersonalBankGate><PersonalCategoryDetail /></PersonalBankGate>} />
          {/* Impuestos: no bank needed (personal Básico is free and only has taxes) */}
          <Route path="/personal/taxes" element={<Taxes />} />
          <Route path="/personal/assistant" element={<Assistant />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
