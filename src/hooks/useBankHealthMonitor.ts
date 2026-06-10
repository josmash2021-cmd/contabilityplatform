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

import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

export function useBankHealthMonitor(accountId: number | undefined, selectedYear: string, selectedMonth: string) {
  const utils = trpc.useUtils();
  const acctIdRef = useRef(accountId);
  acctIdRef.current = accountId;

  // ── AUTONOMOUS SYNC: Detecta y sincroniza transacciones nuevas solo ──
  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        utils.invalidate();
        toast.success(`${data.added} transacciones auto-sincronizadas`, { id: "auto-sync" });
      }
    },
    onError: () => { /* silent — retry on next cycle */ },
  });

  // ── AUTONOMOUS FIX: Corrige categorias mal clasificadas solo ──
  const fixMutation = trpc.bank.autoFixCategories.useMutation({
    onSuccess: (data) => {
      if (data.fixed && data.fixed > 0) {
        utils.invalidate();
        toast.info(`${data.fixed} categorias auto-correctas`, { id: "auto-fix" });
      }
    },
  });

  // ── AUTONOMOUS RECONNECT: Intenta reconectar solo ──
  const reconnectMutation = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: (data) => {
      if (data.updated && data.updated > 0) {
        utils.invalidate();
        toast.success("Conexion auto-restaurada", { id: "auto-reconnect" });
      }
    },
    onError: () => { /* silent — retry on next cycle */ },
  });

  // ── SYNC RECENT: Sincroniza transacciones recientes al cargar ──
  const syncRecentMutation = trpc.bank.syncRecent.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        utils.invalidate();
      }
    },
    onError: () => { /* silent */ },
  });

  // ── MONITORING STATE ──
  const prevTxCountRef = useRef<Map<number, number>>(new Map());
  const prevBalanceRef = useRef<Map<number, string>>(new Map());
  const lastAlertRef = useRef<{ type: string; time: number } | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const isRunningRef = useRef(false);

  // Poll for data changes
  const connectionQuery = trpc.bank.checkConnection.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 2,
  });

  const monthDataQuery = trpc.bank.getMonthData.useQuery(
    { year: parseInt(selectedYear), month: parseInt(selectedMonth), accountId },
    { enabled: !!accountId, refetchInterval: 60000, retry: 2 }
  );

  const showAlertOnce = (type: string, message: string, variant: "success" | "warning" | "error" = "info") => {
    const now = Date.now();
    if (lastAlertRef.current?.type === type && now - lastAlertRef.current.time < 120000) return;
    lastAlertRef.current = { type, time: now };
    if (variant === "success") toast.success(message, { id: type });
    else if (variant === "warning") toast.warning(message, { id: type });
    else if (variant === "error") toast.error(message, { id: type });
    else toast.info(message, { id: type });
  };

  // ── MAIN AUTONOMOUS LOOP ──
  useEffect(() => {
    if (isRunningRef.current) return; // Prevent duplicate runs
    isRunningRef.current = true;

    const hasBank = connectionQuery.data?.hasBank === true;
    const txCount = (monthDataQuery.data?.transactions ?? []).length;
    const currentBalance = monthDataQuery.data?.liveBalance ?? null;
    const isError = connectionQuery.isError || monthDataQuery.isError;
    const acctId = accountId ?? 0;

    if (!hasBank && connectionQuery.data !== undefined) {
      consecutiveErrorsRef.current++;
      if (consecutiveErrorsRef.current >= 2) {
        showAlertOnce("conn-lost", "Conexion perdida. Intentando reconectar...", "warning");
        // AUTONOMOUS: Try to reconnect automatically
        setTimeout(() => reconnectMutation.mutate(), 5000);
      }
      isRunningRef.current = false;
      return;
    }

    if (hasBank) consecutiveErrorsRef.current = 0;
    if (!hasBank || !accountId) { isRunningRef.current = false; return; }

    const prevTx = prevTxCountRef.current.get(acctId) ?? 0;
    const prevBal = prevBalanceRef.current.get(acctId) ?? null;

    // 1. AUTONOMOUS SYNC: New transactions detected → auto-sync
    if (txCount > prevTx && prevTx > 0) {
      const newTx = txCount - prevTx;
      showAlertOnce("new-tx", `${newTx} nueva(s) — sincronizando...`, "success");
      // Auto-fix categories after sync
      setTimeout(() => fixMutation.mutate(), 2000);
    }

    // 2. AUTONOMOUS: If first time seeing this account, auto-sync recent
    if (prevTx === 0 && txCount === 0 && !syncRecentMutation.isPending) {
      syncRecentMutation.mutate();
    }

    // 3. AUTONOMOUS: Auto-fix categories periodically (every 5 min via interval)
    if (!fixMutation.isPending && txCount > 0) {
      fixMutation.mutate();
    }

    // 4. Detect balance changes
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

    isRunningRef.current = false;
  }, [
    connectionQuery.data,
    connectionQuery.isError,
    monthDataQuery.data,
    monthDataQuery.isError,
    accountId,
    selectedYear,
    selectedMonth,
  ]);

  // ── PERIODIC AUTO-SYNC: Every 3 minutes, auto-sync current month ──
  useEffect(() => {
    if (!accountId) return;
    const interval = setInterval(() => {
      if (!syncMutation.isPending) {
        syncMutation.mutate({
          year: parseInt(selectedYear),
          month: parseInt(selectedMonth),
          accountId: accountId,
        });
      }
    }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accountId, selectedYear, selectedMonth, syncMutation]);

  // ── PERIODIC AUTO-FIX: Every 5 minutes, auto-fix categories ──
  useEffect(() => {
    if (!accountId) return;
    const interval = setInterval(() => {
      if (!fixMutation.isPending) {
        fixMutation.mutate();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accountId, fixMutation]);

  // ── PERIODIC RECONNECT CHECK: Every 2 minutes, refresh connection ──
  useEffect(() => {
    if (!accountId) return;
    const interval = setInterval(() => {
      if (!reconnectMutation.isPending) {
        reconnectMutation.mutate();
      }
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accountId, reconnectMutation]);

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
