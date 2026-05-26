import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";

/**
 * Subscription Recovery Agent
 * - Auto-detects lost subscriptions from Stripe
 * - Auto-reverts failed annual upgrades back to monthly (no user action needed)
 * - Runs silently without any user interaction
 */
export function useSubscriptionAgent() {
  const utils = trpc.useUtils();
  const attempts = useRef(0);
  const restored = useRef(false);

  // Query Stripe directly for subscription
  const verifyQuery = trpc.subscription.verify.useQuery(undefined, {
    enabled: true,
    retry: 5,
    retryDelay: 3000,
    refetchInterval: 10000, // Check every 10 seconds
  });

  // Get current status
  const statusQuery = trpc.subscription.status.useQuery();

  // Auto-revert failed annual upgrades (annual + past_due → monthly)
  const restoreMut = trpc.subscription.restoreMonthly.useMutation({
    onSuccess: () => {
      utils.subscription.status.invalidate();
      restored.current = true;
    },
  });

  useEffect(() => {
    const status = statusQuery.data?.status;
    const plan = statusQuery.data?.plan;

    // If we have an annual plan in past_due state, auto-revert to monthly
    if (status === "past_due" && plan === "annual" && !restored.current && !restoreMut.isPending) {
      console.log("[Agent] Detected failed annual upgrade — auto-reverting to monthly...");
      restoreMut.mutate();
      return;
    }

    // If already active, nothing to do
    if (statusQuery.data?.active) return;

    // If verify found a subscription, refresh status
    if (verifyQuery.data?.active) {
      utils.subscription.status.refetch();
      utils.subscription.payments.invalidate();
      attempts.current = 0;
      return;
    }

    // Track attempts
    if (verifyQuery.isSuccess && !verifyQuery.data?.active) {
      attempts.current++;
    }
  }, [verifyQuery.data, verifyQuery.isSuccess, statusQuery.data, restoreMut.isPending]);

  return {
    isChecking: verifyQuery.isLoading || verifyQuery.isFetching,
    attempts: attempts.current,
    hasSubscription: !!statusQuery.data?.active,
    lastCheck: verifyQuery.dataUpdatedAt,
  };
}
