/**
 * Bank Health Monitor — Autonomous Elite Agent
 *
 * Agente autonomo que toma decisiones sin intervencion humana:
 * - Auto-detecta nuevas transacciones y las sincroniza solo
 * - Auto-corrige categorias mal clasificadas
 * - Auto-reconecta cuando pierde conexion
 * - Auto-actualiza balances en tiempo real
 * - Solo alerta al usuario cuando necesita accion manual
 */

import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

export function useBankHealthMonitor(accountId: number | undefined, selectedYear: string, selectedMonth: string) {
  const utils = trpc.useUtils();

  // ── AUTONOMOUS SYNC: Sincroniza transacciones del banco solo ──
  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        utils.bank.getMonthData.invalidate();
        utils.bank.getYearData.invalidate();
        utils.bank.listAccounts.invalidate();
        toast.success(`${data.added} transacciones sincronizadas`, { id: "auto-sync" });
      }
    },
    onError: () => { /* silent — retry on next cycle */ },
  });

  // ── AUTONOMOUS FIX: Corrige categorias mal clasificadas solo ──
  const fixMutation = trpc.bank.autoFixCategories.useMutation({
    onSuccess: (data) => {
      if (data.fixed && data.fixed > 0) {
        utils.bank.getMonthData.invalidate();
        toast.info(`${data.fixed} categorias corregidas`, { id: "auto-fix" });
      }
    },
  });

  // ── AUTONOMOUS RECONNECT: Intenta reconectar solo ──
  const reconnectMutation = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: (data) => {
      if (data.updated && data.updated > 0) {
        utils.invalidate();
        toast.success("Conexion restaurada", { id: "auto-reconnect" });
      }
    },
    onError: () => { /* silent — retry on next cycle */ },
  });

  // ── SYNC RECENT: Sincroniza transacciones recientes al cargar ──
  const syncRecentMutation = trpc.bank.syncRecent.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        utils.bank.getMonthData.invalidate();
        toast.success(`${data.added} transacciones nuevas encontradas`, { id: "auto-recent" });
      }
    },
    onError: () => { /* silent */ },
  });

  // ── TRACKING STATE (per-account) ──
  const prevTxCountRef = useRef<Map<number, number>>(new Map());
  const prevBalanceRef = useRef<Map<number, string>>(new Map());
  const lastAlertRef = useRef<{ type: string; time: number } | null>(null);
  const consecutiveErrorsRef = useRef<Map<number, number>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFixRef = useRef<Map<number, number>>(new Map());
  const lastSyncRef = useRef<Map<number, number>>(new Map());
  const hasSyncedRecentRef = useRef<Map<number, boolean>>(new Map()); // Track if initial sync was done
  const prevAccountRef = useRef<number | undefined>(undefined);

  // Poll for data
  const connectionQuery = trpc.bank.checkConnection.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 2,
  });

  const monthDataQuery = trpc.bank.getMonthData.useQuery(
    { year: parseInt(selectedYear), month: parseInt(selectedMonth), accountId },
    { enabled: !!accountId, refetchInterval: 60000, retry: 2 }
  );

  // Reset tracking when account changes
  useEffect(() => {
    if (accountId !== prevAccountRef.current) {
      prevAccountRef.current = accountId;
      // Reset consecutive errors for the new account
      if (accountId) {
        consecutiveErrorsRef.current.set(accountId, 0);
        // Reset sync flag so new account gets its initial sync
        hasSyncedRecentRef.current.set(accountId, false);
      }
    }
  }, [accountId]);

  // Cleanup reconnect timer on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const showAlertOnce = useCallback((type: string, message: string, variant: "success" | "warning" | "error" = "info") => {
    const now = Date.now();
    if (lastAlertRef.current?.type === type && now - lastAlertRef.current.time < 120000) return;
    lastAlertRef.current = { type, time: now };
    if (variant === "success") toast.success(message, { id: type });
    else if (variant === "warning") toast.warning(message, { id: type });
    else if (variant === "error") toast.error(message, { id: type });
    else toast.info(message, { id: type });
  }, []);

  // ── MAIN AUTONOMOUS LOOP ──
  useEffect(() => {
    const hasBank = connectionQuery.data?.hasBank === true;
    const txCount = (monthDataQuery.data?.transactions ?? []).length;
    const currentBalance = monthDataQuery.data?.liveBalance ?? null;
    const isError = connectionQuery.isError || monthDataQuery.isError;
    const acctId = accountId ?? 0;
    const now = Date.now();

    // Connection lost detection (per-account error counter)
    if (!hasBank && connectionQuery.data !== undefined) {
      const errs = (consecutiveErrorsRef.current.get(acctId) ?? 0) + 1;
      consecutiveErrorsRef.current.set(acctId, errs);
      if (errs >= 2) {
        showAlertOnce("conn-lost", "Conexion perdida. Intentando reconectar...", "warning");
        // Clean up any existing timer before setting new one
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (!reconnectMutation.isPending) reconnectMutation.mutate();
          reconnectTimerRef.current = null;
        }, 5000);
      }
      return;
    }

    // Reset errors on healthy connection
    if (hasBank && accountId) {
      consecutiveErrorsRef.current.set(accountId, 0);
    }

    // Nothing to do without bank or account
    if (!hasBank || !accountId) return;

    const prevTx = prevTxCountRef.current.get(acctId) ?? 0;
    const prevBal = prevBalanceRef.current.get(acctId) ?? null;

    // 1. FIRST TIME: Auto-sync recent transactions (only once per account)
    const hasSynced = hasSyncedRecentRef.current.get(acctId) ?? false;
    if (!hasSynced && !syncRecentMutation.isPending) {
      hasSyncedRecentRef.current.set(acctId, true);
      syncRecentMutation.mutate();
    }

    // 2. NEW TRANSACTIONS DETECTED: Alert + auto-sync
    if (txCount > prevTx && prevTx > 0) {
      const newTx = txCount - prevTx;
      showAlertOnce("new-tx", `${newTx} nueva(s) — sincronizando...`, "success");
      // Auto-sync to ensure all new transactions are fetched
      if (!syncMutation.isPending) {
        syncMutation.mutate({ year: parseInt(selectedYear), month: parseInt(selectedMonth), accountId });
      }
    }

    // 3. PERIODIC AUTO-FIX: Only every 5 minutes (not every cycle)
    const lastFix = lastFixRef.current.get(acctId) ?? 0;
    if (!fixMutation.isPending && txCount > 0 && now - lastFix > 5 * 60 * 1000) {
      lastFixRef.current.set(acctId, now);
      fixMutation.mutate();
    }

    // 4. PERIODIC AUTO-SYNC: Only every 3 minutes (not every cycle)
    const lastSync = lastSyncRef.current.get(acctId) ?? 0;
    if (!syncMutation.isPending && now - lastSync > 3 * 60 * 1000) {
      lastSyncRef.current.set(acctId, now);
      syncMutation.mutate({ year: parseInt(selectedYear), month: parseInt(selectedMonth), accountId });
    }

    // 5. Detect balance changes
    if (currentBalance && prevBal && currentBalance !== prevBal) {
      const diff = parseFloat(currentBalance) - parseFloat(prevBal);
      if (Math.abs(diff) > 0.01) {
        const dir = diff > 0 ? "aumento" : "disminuyo";
        showAlertOnce("bal-change", `Balance ${dir} $${Math.abs(diff).toFixed(2)}`, diff > 0 ? "success" : "warning");
      }
    }

    // Update refs
    prevTxCountRef.current.set(acctId, txCount);
    if (currentBalance) prevBalanceRef.current.set(acctId, currentBalance);

    // Warning on slow connection
    if (isError) {
      showAlertOnce("slow-conn", "Conexion lenta — verificando...", "warning");
    }
  }, [
    connectionQuery.data,
    connectionQuery.isError,
    monthDataQuery.data,
    monthDataQuery.isError,
    accountId,
    selectedYear,
    selectedMonth,
    showAlertOnce,
  ]);

  // Return status for UI indicator
  const hasBank = connectionQuery.data?.hasBank === true;
  const isError = connectionQuery.isError || monthDataQuery.isError;
  const txCount = (monthDataQuery.data?.transactions ?? []).length;

  return {
    status: !hasBank ? "disconnected" : isError ? "warning" : "healthy" as "healthy" | "warning" | "critical" | "disconnected",
    message: !hasBank ? "Desconectado" : isError ? "Verificando..." : `${txCount} transacciones · Activo`,
    txCount,
    pendingSync: syncMutation.isPending || syncRecentMutation.isPending,
    lastSync: monthDataQuery.dataUpdatedAt ? new Date(monthDataQuery.dataUpdatedAt) : null,
  };
}
