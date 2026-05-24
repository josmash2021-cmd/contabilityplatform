import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

/**
 * Auto-repair accounting: silently fixes unbalanced journal entries
 * after user login. Runs once per session, only when authenticated.
 */
export function useAutoRepair() {
  const { isAuthenticated } = useAuth();
  const hasRunRef = useRef(false);
  const repairMutation = trpc.accounting.rebuild.useMutation();

  useEffect(() => {
    if (!isAuthenticated || hasRunRef.current) return;
    hasRunRef.current = true;

    // Wait 3 seconds after login for everything to settle, then repair silently
    const timer = setTimeout(() => {
      repairMutation.mutate(undefined, {
        onSuccess: (data) => {
          if (data.success && (data as any).entries && (data as any).entries > 0) {
            console.log(`[AutoRepair] Created ${(data as any).entries} missing journal entries. Balance fixed.`);
          } else if (data.success) {
            console.log("[AutoRepair] Balance OK. No missing entries.");
          } else {
            console.error("[AutoRepair] Failed:", data.error);
          }
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
