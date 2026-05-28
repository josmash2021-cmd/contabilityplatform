import { trpc } from "@/providers/trpc";
import { useAutoSync } from "@/hooks/useAutoSync";

interface PersonalBankGateProps {
  children: React.ReactNode;
}

/**
 * Wraps personal pages with optional auto-sync when bank is connected.
 * Personal mode does NOT require a bank connection - it always shows content.
 * Auto-sync only runs when a bank is actually connected.
 */
export function PersonalBankGate({ children }: PersonalBankGateProps) {
  // Check if bank is connected for optional auto-sync
  const { data: bankConnection } = trpc.bank.checkConnection.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    refetchOnMount: false,
  });

  const hasBank = bankConnection?.hasBank === true;

  // Always show children - personal mode works without bank
  if (hasBank) {
    return <AutoSyncWrapper>{children}</AutoSyncWrapper>;
  }

  return <>{children}</>;
}

/**
 * Wrapper that enables automatic bank sync every 8 hours.
 * Only rendered when a bank is connected.
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
