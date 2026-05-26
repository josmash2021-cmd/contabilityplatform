import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";

/**
 * Subscription Sync Agent
 * Automatically detects and recovers lost subscriptions from Stripe.
 * Runs on mount and retries until subscription is found.
 */
export function useSubscriptionAgent() {
  const utils = trpc.useUtils();
  const attempts = useRef(0);
  const maxAttempts = 10;

  // Query Stripe directly for subscription
  const verifyQuery = trpc.subscription.verify.useQuery(undefined, {
    enabled: true,
    retry: 5,
    retryDelay: 3000,
    refetchInterval: 15000, // Check every 15 seconds
  });

  // Get current status
  const statusQuery = trpc.subscription.status.useQuery();

  useEffect(() => {
    // If already active, nothing to do
    if (statusQuery.data?.active) return;

    // If verify found a subscription, refresh status
    if (verifyQuery.data?.active) {
      utils.subscription.status.invalidate();
      utils.subscription.payments.invalidate();
      attempts.current = 0;
      return;
    }

    // Track attempts
    if (verifyQuery.isSuccess && !verifyQuery.data?.active) {
      attempts.current++;
    }

    // If we've tried many times and still nothing, the user truly has no subscription
    // (not a sync issue, they genuinely haven't paid)
  }, [verifyQuery.data, verifyQuery.isSuccess, statusQuery.data?.active]);

  return {
    isChecking: verifyQuery.isLoading || verifyQuery.isFetching,
    attempts: attempts.current,
    hasSubscription: !!statusQuery.data?.active || !!verifyQuery.data?.active,
    lastCheck: verifyQuery.dataUpdatedAt,
  };
}
