import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { AlertTriangle, Crown, CalendarDays, Zap, X } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { billingCopy } from "@/i18n/copy/billing";
import { useAuth } from "@/hooks/useAuth";
import { findPlan } from "@/components/marketing/content";

export function SubscriptionExpiredOverlay() {
  const { plans, expired: t } = useCopy(billingCopy);
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const { data: status } = trpc.subscription.status.useQuery(
    undefined,
    { refetchInterval: 60000 } // Check every minute
  );
  // Renew at the price of the plan the person had (before tiers: Negocio or Pro).
  const { user } = useAuth();
  const mode = user?.modePreference === "personal" ? "personal" : "business";
  const { data: tierData } = trpc.subscription.currentTier.useQuery();
  const renewPlan = findPlan(mode, tierData?.tier) ?? findPlan(mode, mode === "personal" ? "pro" : "standard")!;

  // Check if subscription is expired
  const isExpired = (() => {
    if (!status) return false;
    // If no subscription at all
    if (!status.active && !status.currentPeriodEnd) return false; // Never had subscription
    // If has subscription but not active and past the end date
    if (!status.active && status.currentPeriodEnd) {
      const endDate = new Date(status.currentPeriodEnd);
      return endDate < new Date();
    }
    // If active, not expired
    if (status.active) return false;
    return false;
  })();

  if (!isExpired || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-black">{t.title}</h2>
              <p className="text-xs text-neutral-500">{t.subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-neutral-600 leading-relaxed">
          {t.text}
        </p>

        {/* Renewal Options */}
        <div className="space-y-3">
          {/* Monthly */}
          <button
            onClick={() => {
              setDismissed(true);
              navigate("/settings?renew=monthly");
            }}
            className="w-full flex items-center gap-3 p-3 border border-neutral-200 rounded-xl hover:border-black hover:bg-neutral-50 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5 text-neutral-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black">{t.renewMonthly}</p>
              <p className="text-xs text-neutral-500">${renewPlan.monthly}{plans.perMonth} — {t.billedMonthly}</p>
            </div>
            <Crown className="w-4 h-4 text-yellow-500 shrink-0" />
          </button>

          {/* Annual */}
          <button
            onClick={() => {
              setDismissed(true);
              navigate("/settings?renew=annual");
            }}
            className="w-full flex items-center gap-3 p-3 border-2 border-yellow-400 rounded-xl hover:border-yellow-500 hover:bg-yellow-50/50 transition-all text-left bg-yellow-50/30"
          >
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black">{t.renewAnnual}</p>
              <p className="text-xs text-neutral-500">${renewPlan.annual.toLocaleString("en-US")}{plans.perYear} — <span className="text-emerald-600 font-medium">{plans.savings(`$${renewPlan.monthly * 2}`)}</span></p>
            </div>
            <div className="shrink-0">
              <span className="text-[10px] bg-yellow-400 text-black px-2 py-0.5 rounded-full font-medium">{plans.bestValue}</span>
            </div>
          </button>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-neutral-400 text-center">
          {t.terms}
        </p>
      </div>
    </div>
  );
}
