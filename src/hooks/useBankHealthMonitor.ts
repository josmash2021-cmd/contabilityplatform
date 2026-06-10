/**
 * Bank Health Monitor — Elite Monitoring Agent
 *
 * Vigila la salud de la conexion bancaria en tiempo real:
 * - Detecta token expirado o conexion perdida
 * - Alerta cuando hay nuevas transacciones disponibles
 * - Monitorea sincronizacion correcta
 * - Intenta recuperacion automatica
 * - Reporta estado en tiempo real
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

interface BankHealth {
  status: "healthy" | "warning" | "critical" | "disconnected";
  lastSync: Date | null;
  lastBalance: string | null;
  txCount: number;
  pendingSync: boolean;
  tokenValid: boolean;
  message: string;
}

export function useBankHealthMonitor(accountId: number | undefined) {
  const [health, setHealth] = useState<BankHealth>({
    status: "healthy",
    lastSync: null,
    lastBalance: null,
    txCount: 0,
    pendingSync: false,
    tokenValid: true,
    message: "Conexion estable",
  });

  // Track previous values per-account to detect REAL changes
  const prevTxCountRef = useRef<Map<number, number>>(new Map());
  const prevBalanceRef = useRef<Map<number, string>>(new Map());
  const lastAlertRef = useRef<{ type: string; time: number } | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const prevAccountIdRef = useRef<number | undefined>(undefined);

  const utils = trpc.useUtils();

  // Check connection health every 30 seconds
  const connectionQuery = trpc.bank.checkConnection.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 2,
  });

  // Monitor month data for changes
  const monthDataQuery = trpc.bank.getMonthData.useQuery(
    { year: new Date().getFullYear(), month: new Date().getMonth() + 1, accountId },
    { enabled: !!accountId, refetchInterval: 60000, retry: 2 }
  );

  // Reset tracking when account changes (prevents false alerts)
  useEffect(() => {
    if (accountId !== prevAccountIdRef.current) {
      prevTxCountRef.current.set(accountId ?? 0, 0);
      prevBalanceRef.current.delete(accountId ?? 0);
      prevAccountIdRef.current = accountId;
    }
  }, [accountId]);

  // Show toast only once per 2 minutes per type
  const showAlert = useCallback((type: string, message: string, variant: "success" | "warning" | "error" | "info" = "info") => {
    const now = Date.now();
    if (lastAlertRef.current?.type === type && now - lastAlertRef.current.time < 120000) return;
    lastAlertRef.current = { type, time: now };

    switch (variant) {
      case "success": toast.success(message); break;
      case "warning": toast.warning(message); break;
      case "error": toast.error(message); break;
      default: toast.info(message); break;
    }
  }, []);

  // Main monitoring effect
  useEffect(() => {
    const hasBank = connectionQuery.data?.hasBank === true;
    const txCount = (monthDataQuery.data?.transactions ?? []).length;
    const currentBalance = monthDataQuery.data?.liveBalance ?? null;
    const isError = connectionQuery.isError || monthDataQuery.isError;
    const acctId = accountId ?? 0;

    // Detect connection lost
    if (!hasBank && connectionQuery.data !== undefined) {
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= 2) {
        setHealth(prev => ({
          ...prev,
          status: "critical",
          txCount,
          pendingSync: false,
          tokenValid: false,
          message: "Conexion con el banco perdida. Reconecta tu cuenta.",
        }));
        showAlert("conn-lost", "Conexion con el banco perdida. Reconecta tu cuenta.", "warning");
      }
      return;
    }

    // Reset error counter on success
    if (hasBank) {
      consecutiveErrorsRef.current = 0;
    }

    const prevTx = prevTxCountRef.current.get(acctId) ?? 0;
    const prevBal = prevBalanceRef.current.get(acctId) ?? null;

    // Detect new transactions (skip first mount: prevTx === 0)
    if (txCount > prevTx && prevTx > 0) {
      const newTx = txCount - prevTx;
      showAlert("new-tx", `${newTx} transaccion(es) nueva(s) detectada(s)`, "success");
      setHealth(prev => ({
        ...prev,
        status: "healthy",
        lastSync: new Date(),
        txCount,
        message: `${txCount} transacciones sincronizadas`,
      }));
    }

    // Detect balance changes
    if (currentBalance && prevBal && currentBalance !== prevBal) {
      const diff = parseFloat(currentBalance) - parseFloat(prevBal);
      if (Math.abs(diff) > 0.01) {
        const direction = diff > 0 ? "aumento" : "disminuyo";
        showAlert("balance-change", `Tu balance ${direction} $${Math.abs(diff).toFixed(2)}`, diff > 0 ? "success" : "warning");
      }
    }

    // Update refs with current values
    prevTxCountRef.current.set(acctId, txCount);
    if (currentBalance) prevBalanceRef.current.set(acctId, currentBalance);

    // Set healthy state (only update message, don't overwrite lastSync)
    if (hasBank) {
      setHealth(prev => ({
        ...prev,
        status: isError ? "warning" : "healthy",
        lastBalance: currentBalance,
        txCount,
        pendingSync: monthDataQuery.isLoading,
        tokenValid: true,
        message: isError ? "Conexion lenta, verificando..." : `Conexion estable · ${txCount} transacciones`,
      }));
    }
  }, [
    connectionQuery.data,
    connectionQuery.isError,
    monthDataQuery.data,
    monthDataQuery.isLoading,
    monthDataQuery.isError,
    accountId,
    showAlert,
  ]);

  // Auto-recovery: attempt silent reconnection when token is invalid
  const reconnectMut = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: (data) => {
      if (data.updated && data.updated > 0) {
        utils.invalidate();
        showAlert("auto-recover", "Conexion restaurada automaticamente", "success");
        consecutiveErrorsRef.current = 0;
      }
    },
    onError: () => { /* silent — will retry on next cycle */ },
  });

  useEffect(() => {
    if (health.status === "critical" && health.tokenValid === false) {
      const timer = setTimeout(() => {
        reconnectMut.mutate();
      }, 60000);
      return () => clearTimeout(timer);
    }
  }, [health.status, health.tokenValid, reconnectMut]);

  return health;
}
