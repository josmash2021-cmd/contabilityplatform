import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/providers/trpc";

const SYNC_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours
const SYNC_TIMEOUT_MS = 15 * 1000; // 15 seconds max

export function useAutoSync(enabled: boolean = true) {
  const utils = trpc.useUtils();
  const lastSyncRef = useRef<number>(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoSync = trpc.bank.autoSync.useMutation({
    onSuccess: (data) => {
      setHasCompleted(true);
      setSyncError(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (data.success) {
        utils.bank.listAccounts.invalidate();
        utils.bank.getAccount.invalidate();
        utils.bank.getMonthData.invalidate();
        utils.bank.getSubscriptions.invalidate();
        utils.bank.checkMigrationStatus.invalidate();
      }
    },
    onError: (err) => {
      setHasCompleted(true);
      setSyncError(err.message);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
  });

  const startSync = useCallback(() => {
    setHasCompleted(false);
    setSyncError(null);
    lastSyncRef.current = Date.now();
    
    // Safety timeout: force completion after 15 seconds
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setHasCompleted(true);
    }, SYNC_TIMEOUT_MS);
    
    autoSync.mutate();
  }, [autoSync]);

  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    const timeSinceLastSync = now - lastSyncRef.current;

    // Sync immediately if never synced or if 8 hours have passed
    if (lastSyncRef.current === 0 || timeSinceLastSync >= SYNC_INTERVAL_MS) {
      startSync();
    }

    // Set up interval for future syncs
    const intervalId = setInterval(() => {
      startSync();
    }, SYNC_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, startSync]);

  return {
    isSyncing: autoSync.isPending && !hasCompleted,
    hasCompleted,
    syncError,
    startSync,
    lastSync: lastSyncRef.current,
  };
}
