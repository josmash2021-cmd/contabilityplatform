import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { ModeProvider } from "@/contexts/ModeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PersonalBankGate } from "@/components/PersonalBankGate";
import Dashboard from "@/pages/Dashboard";
import POS from "@/pages/POS";
import Services from "@/pages/Services";
import Customers from "@/pages/Customers";
import Transactions from "@/pages/Transactions";
import Bank from "@/pages/Bank";
import BankCategoryDetail from "@/pages/BankCategoryDetail";
import BankTransactions from "@/pages/BankTransactions";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import PersonalDashboard from "@/pages/PersonalDashboard";
import PersonalTransactions from "@/pages/PersonalTransactions";
import PersonalGoals from "@/pages/PersonalGoals";
import PersonalSubscriptions from "@/pages/PersonalSubscriptions";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import Onboarding from "@/pages/Onboarding";
import Setup from "@/pages/Setup";
import NotFound from "@/pages/NotFound";
import AdminUsers from "@/pages/AdminUsers";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
    <Routes>
      {/* Public routes - only accessible when NOT logged in */}
      <Route path="/login" element={<PublicGuard><Login /></PublicGuard>} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<PublicGuard><ForgotPassword /></PublicGuard>} />

      {/* Onboarding - accessible when logged in */}
      <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />

      {/* Setup - no auth required, run once */}
      <Route path="/setup" element={<Setup />} />

      {/* Admin - list users */}
      <Route path="/admin/users" element={<AdminUsers />} />

      {/* Protected routes with ModeProvider */}
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
        <Route path="/settings" element={<Settings />} />
        {/* Personal routes - wrapped with bank gate (menu stays usable, only content area blocked) */}
        <Route path="/personal" element={<PersonalBankGate><PersonalDashboard /></PersonalBankGate>} />
        <Route path="/personal/transactions" element={<PersonalBankGate><PersonalTransactions /></PersonalBankGate>} />
        <Route path="/personal/goals" element={<PersonalBankGate><PersonalGoals /></PersonalBankGate>} />
        <Route path="/personal/subscriptions" element={<PersonalBankGate><PersonalSubscriptions /></PersonalBankGate>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
