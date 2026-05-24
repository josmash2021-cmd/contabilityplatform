import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutoSync } from "@/hooks/useAutoSync";

interface PersonalBankGateProps {
  children: React.ReactNode;
}

const BANK_CONNECTED_KEY = "aethel_bank_connected";

/**
 * Wraps personal pages that require a bank connection.
 * Uses localStorage to persist connected state across page navigations.
 */
export function PersonalBankGate({ children }: PersonalBankGateProps) {
  const utils = trpc.useUtils();
  // Initialize from localStorage so it survives page navigation
  const [forceConnected, setForceConnected] = useState(() => {
    try { return localStorage.getItem(BANK_CONNECTED_KEY) === "true"; }
    catch { return false; }
  });

  // Always refetch on mount to get fresh data from DB
  const { data: bankConnection, isLoading } = trpc.bank.checkConnection.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const isBankConnected = bankConnection?.hasBank === true || forceConnected;

  // If DB says connected but localStorage doesn't, sync it
  // If DB says NOT connected, clear localStorage
  useEffect(() => {
    if (bankConnection?.hasBank && !forceConnected) {
      setForceConnected(true);
      try { localStorage.setItem(BANK_CONNECTED_KEY, "true"); } catch { /* ignore */ }
    } else if (bankConnection?.hasBank === false && forceConnected) {
      setForceConnected(false);
      try { localStorage.removeItem(BANK_CONNECTED_KEY); } catch { /* ignore */ }
    }
  }, [bankConnection?.hasBank, forceConnected]);

  // Loading state
  if (isLoading && !forceConnected) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // Bank connected - show the actual page content + auto-sync
  if (isBankConnected) {
    return <AutoSyncWrapper>{children}</AutoSyncWrapper>;
  }

  // No bank connected - show overlay
  return (
    <div className="relative w-full h-full min-h-[600px]">
      <PlaidLinkOverlay
        variant="inline"
        onSuccess={() => {
          // Persist in both state and localStorage
          setForceConnected(true);
          try { localStorage.setItem(BANK_CONNECTED_KEY, "true"); } catch { /* ignore */ }
          // Refresh all bank-related queries
          utils.personal.listTransactions.invalidate();
          utils.personal.stats.invalidate();
          utils.bank.checkConnection.invalidate();
        }}
      />
    </div>
  );
}

/**
 * Wrapper that enables automatic bank sync every 8 hours.
 */
function AutoSyncWrapper({ children }: { children: React.ReactNode }) {
  const { isSyncing } = useAutoSync(true);
  return (
    <>
      {children}
      {isSyncing && (
        <div className="fixed bottom-4 right-4 z-50 bg-black text-white text-[10px] px-2 py-1 rounded-full shadow-lg opacity-70 animate-pulse">
          Sincronizando...
        </div>
      )}
    </>
  );
}
