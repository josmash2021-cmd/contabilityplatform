import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

/**
 * Once per session after login: makes sure the user's chart of accounts has every account the app books to
 * (accounting.rebuild adds the missing ones and books nothing). Silent.
 */
export function useAutoRepair() {
  const { isAuthenticated } = useAuth();
  const hasRunRef = useRef(false);
  const repairMutation = trpc.accounting.rebuild.useMutation();

  useEffect(() => {
    if (!isAuthenticated || hasRunRef.current) return;
    hasRunRef.current = true;

    // A few seconds after login, so it doesn't compete with the first screen's data.
    const timer = setTimeout(() => {
      repairMutation.mutate(undefined, {
        onSuccess: (data) => {
          if (!data.success) console.error("[AutoRepair] Failed:", data.error);
        },
        onError: (err) => {
          console.error("[AutoRepair] Error:", err.message);
        },
      });
    }, 3000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
}
