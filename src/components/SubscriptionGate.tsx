import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { appCopy } from "@/i18n/copy/app";
import { billingCopy } from "@/i18n/copy/billing";
import { PlanPicker } from "@/components/billing/PlanPicker";
import { useAuth } from "@/hooks/useAuth";
import { Crown, Landmark, CheckCircle, X } from "lucide-react";

interface SubscriptionGateProps {
  children: React.ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const t = useCopy(billingCopy);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"checking" | "connect_bank" | "subscribe" | "active">("checking");
  const [dismissed, setDismissed] = useState(false);
  const [checkTimedOut, setCheckTimedOut] = useState(false);
  // Track when bank was connected (for 10s delay before showing subscription overlay)
  const bankConnectedAtRef = useRef<number | null>(null);

  const { user } = useAuth();
  const userMode = user?.modePreference || "business";

  const { data: status, isLoading: subLoading } = trpc.subscription.status.useQuery(
    undefined, { refetchInterval: 10000 }
  );
  const { data: bankConnection, isLoading: bankLoading } = trpc.bank.checkConnection.useQuery(
    undefined, { refetchInterval: 10000 }
  );

  const hasSubscription = status?.active === true;
  const hasBank = bankConnection?.hasBank === true;

  // Track when bank transitions from disconnected -> connected
  useEffect(() => {
    if (hasBank && bankConnectedAtRef.current === null) {
      // Bank just connected — record timestamp
      bankConnectedAtRef.current = Date.now();
    } else if (!hasBank) {
      // Bank disconnected — reset
      bankConnectedAtRef.current = null;
    }
  }, [hasBank]);

  // Timeout: don't stay in "checking" forever
  useEffect(() => {
    const timer = setTimeout(() => setCheckTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  // Checkout mutation — goes directly to Stripe
  const checkoutMut = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || t.gate.checkoutError);
      }
    },
    onError: (err) => {
      alert(t.gate.errorPrefix + err.message);
    },
  });

  // Phase logic: 10s AFTER bank connects, show subscription overlay
  useEffect(() => {
    if (phase === "subscribe") return;
    if (hasSubscription) { setPhase("active"); return; }
    if (!hasBank) { setPhase("connect_bank"); return; }
    if (hasBank && !hasSubscription && bankConnectedAtRef.current !== null) {
      const elapsed = Date.now() - bankConnectedAtRef.current;
      const remaining = Math.max(0, 10000 - elapsed);
      const timer = setTimeout(() => setPhase("subscribe"), remaining);
      return () => clearTimeout(timer);
    }
  }, [hasSubscription, hasBank, subLoading, bankLoading, phase]);

  if (dismissed) return <>{children}</>;
  if (phase === "active") return <>{children}</>;

  // If check timed out, show content instead of blocking forever
  if (phase === "checking" && checkTimedOut) return <>{children}</>;

  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "connect_bank") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto">
            <Landmark className="w-8 h-8 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold text-black">{t.gate.connectBankTitle}</h2>
          <p className="text-sm text-neutral-500">{t.gate.connectBankText}</p>
          <button
            onClick={() => navigate(userMode === "personal" ? "/bank?mode=personal" : "/bank")}
            className="w-full h-11 bg-black text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
          >
            <Landmark className="w-4 h-4" /> {t.gate.connectBank}
          </button>
        </div>
      </div>
    );
  }

  // ── SUBSCRIBE FULL-SCREEN OVERLAY — Glassmorphism, shows page behind ──
  const isBusiness = userMode === "business";

  return (
    <>
      {/* Render children behind the overlay so the page is visible through glass */}
      <div className="relative">
        {children}
      </div>
      {/* Overlay: transparent with blur so page behind is visible */}
      <div className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-xl flex items-start justify-center p-0 md:p-4 pt-12 md:pt-16">
        {/* Container: no border, fully transparent */}
        <div className="w-full h-full md:h-auto md:max-h-[95vh] md:rounded-2xl overflow-y-auto animate-in fade-in zoom-in-95 duration-300 relative">
          {/* Floating close button - no header bar */}
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-4 space-y-6 max-w-5xl mx-auto">
            {/* Success banner - transparent */}
            <div className="flex items-center gap-3 p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-lg backdrop-blur-sm">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-200">
                <strong>{t.gate.bankConnected}</strong>{t.gate.bankConnectedText}
              </p>
            </div>

            {/* Crown + Title - white text for dark transparent bg */}
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full border-2 border-yellow-500 flex items-center justify-center mx-auto">
                <Crown className="w-6 h-6 text-yellow-500" />
              </div>
              <h2 className="text-xl font-semibold text-white">{t.gate.title}</h2>
              <p className="text-sm text-neutral-300">
                {t.gate.text}
              </p>
            </div>

            <PlanPicker
              mode={isBusiness ? "business" : "personal"}
              onDark
              pendingTier={checkoutMut.isPending ? checkoutMut.variables?.tier ?? null : null}
              onPick={(plan, tier) => checkoutMut.mutate({ plan, tier })}
            />

            {/* Footer */}
            <p className="text-[10px] text-neutral-400 text-center pb-4">
              {t.gate.termsPre}<span className="text-white">Personal & Business Solutions</span>{t.gate.termsPost}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Page-level gate: blocks individual pages when user has no subscription ──
export function SubscriptionPageGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const { data: status, isLoading, isError } = trpc.subscription.status.useQuery(undefined, {
    refetchInterval: 10000,
    enabled: !isAdmin,
  });

  const userMode = user?.modePreference || "business";
  const hasSubscription = status?.active === true;
  const currentPath = location.pathname;
  // The free trial existed and is over (only accounts created after the trial launch have one).
  const trialEnded = !!status?.trial && !status.trial.active;

  // Admins never pay (the server also reports them as active).
  if (isAdmin) return <>{children}</>;

  // While loading, show content (don't block)
  if (isLoading) return <>{children}</>;

  // If the check itself failed (Stripe/DB hiccup), don't lock out a paying customer.
  // An expired session is handled globally: it redirects to /login.
  if (isError) return <>{children}</>;

  if (hasSubscription) return <>{children}</>;

  if (userMode === "business" && currentPath !== "/settings") {
    return (
      <>
        <div className="relative">{children}</div>
        <SubscriptionOverlayOnly trialEnded={trialEnded} />
      </>
    );
  }

  // Personal Básico is free and includes Impuestos and the assistant: never blocked.
  const freePersonal = currentPath === "/personal/taxes" || currentPath === "/personal/assistant";
  if (userMode === "personal" && currentPath !== "/settings" && !freePersonal) {
    return (
      <>
        <div className="relative">{children}</div>
        <SubscriptionOverlayOnly trialEnded={trialEnded} />
      </>
    );
  }

  return <>{children}</>;
}

// ── Compact overlay for page blocking ──
function SubscriptionOverlayOnly({ trialEnded = false }: { trialEnded?: boolean }) {
  const { paywall } = useCopy(appCopy);
  const t = useCopy(billingCopy);
  const navigate = useNavigate();
  const { user } = useAuth();
  const userMode = user?.modePreference || "business";
  const isBusiness = userMode === "business";

  const checkoutMut = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || t.gate.checkoutError);
      }
    },
    onError: (err) => {
      alert(t.gate.errorPrefix + err.message);
    },
  });

  return (
    <>
      <div className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-xl flex items-start justify-center p-0 md:p-4 pt-12 md:pt-16">
        <div className="w-full h-full md:h-auto md:max-h-[95vh] md:rounded-2xl overflow-y-auto animate-in fade-in zoom-in-95 duration-300 relative">
          {/* Floating close button - no header bar */}
          <button
            onClick={() => navigate("/settings?sec=plan")}
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-4 space-y-6 max-w-5xl mx-auto">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full border-2 border-yellow-500 flex items-center justify-center mx-auto">
                <Crown className="w-6 h-6 text-yellow-500" />
              </div>
              <h2 className="text-xl font-semibold text-white">
                {trialEnded ? paywall.trialEndedTitle : paywall.title}
              </h2>
              <p className="text-sm text-neutral-300">
                {trialEnded ? paywall.trialEndedText : paywall.text}
              </p>
            </div>

            <PlanPicker
              mode={isBusiness ? "business" : "personal"}
              onDark
              pendingTier={checkoutMut.isPending ? checkoutMut.variables?.tier ?? null : null}
              onPick={(plan, tier) => checkoutMut.mutate({ plan, tier })}
            />
          </div>
        </div>
      </div>
    </>
  );
}
