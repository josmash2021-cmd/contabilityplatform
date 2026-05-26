import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  RefreshCw, Trash2, Link2, Landmark, ChevronRight, LogOut,
  ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, TrendingDown,
  Calendar, CreditCard, Smartphone, Banknote, Receipt, AlertCircle,
  CheckCircle2, PiggyBank, Loader2, X, Check,
} from "lucide-react";

/** Account dropdown — uses fixed positioning to render OVER all content */
function AccountDropdown({
  accounts,
  selectedId,
  onChange,
}: {
  accounts: any[];
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const selected = accounts.find((a) => String(a.id) === selectedId);

  // Calculate menu position based on button
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    }
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-8 px-2.5 border border-neutral-200 rounded-lg bg-white text-xs hover:border-neutral-300 transition-colors w-52"
      >
        <Landmark className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="truncate flex-1 text-left">
          {selected ? `${selected.bankName || selected.accountType} ${selected.accountNumber ? `(${selected.accountNumber})` : ""}` : "Seleccionar cuenta"}
        </span>
        <ChevronRight className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className="fixed bg-white border border-neutral-200 rounded-lg shadow-2xl py-1 max-h-[300px] overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
        >
          {accounts.map((acc: any) => (
            <button
              key={acc.id}
              onClick={() => { onChange(String(acc.id)); setOpen(false); }}
              className={`w-full text-left px-2.5 py-2 text-xs flex items-center justify-between transition-colors ${
                String(acc.id) === selectedId ? "bg-neutral-100 text-black font-medium" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Landmark className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span className="truncate">{acc.bankName || acc.accountType}</span>
              </div>
              <span className={`text-[10px] font-medium shrink-0 ml-2 ${parseFloat(acc.currentBalance ?? "0") >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(parseFloat(acc.currentBalance ?? "0"))}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* helpers */
function getMonthRangeLabel(month: number, year: number): string {
  const now = new Date();
  const isCurrentMonth = now.getMonth() + 1 === month && now.getFullYear() === year;
  const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const monthName = monthNames[month - 1];
  if (isCurrentMonth) {
    const today = now.getDate();
    return `1 ${monthName} - ${today} ${monthName}`;
  }
  const lastDay = new Date(year, month, 0).getDate();
  return `1 ${monthName} - ${lastDay} ${monthName}`;
}

const CATEGORY_ICONS: Record<string, typeof Banknote> = {
  zelle_income: Smartphone, deposit: Landmark, cash_deposit: Banknote,
  cash_withdrawal: Banknote, zelle_sent: Smartphone, subscription: CreditCard, transfer: ArrowDownRight,
};

const CATEGORY_COLORS: Record<string, string> = {
  zelle_income: "bg-blue-50 text-blue-600", deposit: "bg-emerald-50 text-emerald-600",
  cash_deposit: "bg-emerald-50 text-emerald-600", cash_withdrawal: "bg-red-50 text-red-600",
  zelle_sent: "bg-red-50 text-red-600", subscription: "bg-amber-50 text-amber-600", transfer: "bg-neutral-100 text-neutral-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  zelle_income: "Zelle Recibidos", zelle_sent: "Zelle Enviados", deposit: "Depositos",
  cash_deposit: "Depositos de Efectivo", cash_withdrawal: "Retiros de Efectivo",
  subscription: "Suscripciones", transfer: "Transferencias", business_expense: "Gastos de Negocio",
  home_expense: "Gastos del Hogar", shopping: "Compras", cash_income: "Efectivo Recibido", other: "Otros",
};

/* Plaid Link Button */
function PlaidLinkButton({ onSuccess, onStart, onExchangeStart }: { onSuccess: () => void; onStart?: () => void; onExchangeStart?: () => void }) {
  const utils = trpc.useUtils();
  const exchangeMut = trpc.bank.exchangePublicToken.useMutation({
    onSuccess: (data) => {
      if (data.success) { onSuccess(); utils.invalidate(); }
      else { toast.error(data.error || "Error al conectar"); }
    },
    onError: (err) => { toast.error(err.message); },
  });

  const createLinkMut = trpc.bank.createLinkToken.useMutation({
    onSuccess: (data) => {
      if (!data.success || !data.linkToken) { toast.error(data.error || "No se pudo crear el link"); return; }
      const scriptId = "plaid-link-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      const openPlaid = () => {
        const handler = (window as any).Plaid.create({
          token: data.linkToken,
          onSuccess: (publicToken: string) => { onExchangeStart?.(); exchangeMut.mutate({ publicToken }); },
          onExit: () => {},
        });
        handler.open();
      };
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
        script.onload = openPlaid;
        document.body.appendChild(script);
      } else if ((window as any).Plaid) { openPlaid(); }
      else { script.onload = openPlaid; }
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button onClick={() => { onStart?.(); createLinkMut.mutate(); }} disabled={createLinkMut.isPending} className="bg-black text-white hover:bg-neutral-800 rounded-lg">
      {createLinkMut.isPending ? "Cargando..." : <><Link2 className="w-4 h-4 mr-2" /> Conectar Banco</>}
    </Button>
  );
}

/* Selectors */
function MonthSelector({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const months = [
    { value: "1", label: "Enero" }, { value: "2", label: "Febrero" }, { value: "3", label: "Marzo" },
    { value: "4", label: "Abril" }, { value: "5", label: "Mayo" }, { value: "6", label: "Junio" },
    { value: "7", label: "Julio" }, { value: "8", label: "Agosto" }, { value: "9", label: "Septiembre" },
    { value: "10", label: "Octubre" }, { value: "11", label: "Noviembre" }, { value: "12", label: "Diciembre" },
  ];
  return (
    <Select value={value} onValueChange={(val) => { console.log("[DEBUG] MonthSelector onValueChange:", val); onChange(val); }}>
      <SelectTrigger className="h-8 w-[90px] border-neutral-200 rounded-lg text-xs focus:ring-1 focus:ring-black">
        <SelectValue placeholder="Mes" />
      </SelectTrigger>
      <SelectContent className="bg-white border-neutral-200">
        {months.map((m) => <SelectItem key={m.value} value={m.value} className="text-xs focus:bg-neutral-50">{m.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function YearSelector({ value, onChange }: { value: string; onChange: (y: string) => void }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[80px] border-neutral-200 rounded-lg text-xs focus:ring-1 focus:ring-black px-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-white border-neutral-200">
        {years.map((y) => <SelectItem key={y} value={y.toString()} className="text-xs focus:bg-neutral-50">{y}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/* MAIN COMPONENT */
export default function Bank() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlMonth = searchParams.get("month");
  const urlYear = searchParams.get("year");

  const [syncing, setSyncing] = useState(false);
  const [autoSyncDone, setAutoSyncDone] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(urlMonth ?? String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(urlYear ?? String(new Date().getFullYear()));
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedAccountId, setSelectedAccountIdRaw] = useState<string | null>(() => {
    try { return localStorage.getItem("bank_selected_account_id"); } catch { return null; }
  });
  const setSelectedAccountId = (id: string | null) => {
    setSelectedAccountIdRaw(id);
    try { if (id) localStorage.setItem("bank_selected_account_id", id); else localStorage.removeItem("bank_selected_account_id"); } catch { /* ignore */ }
  };
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<number | null>(null);
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const [showPlaidOverlay, setShowPlaidOverlay] = useState(false);
  const wasConnectedRef = useRef(false);

  // Use checkConnection as PRIMARY source for bank detection (same as Transactions.tsx)
  const { data: connection, isLoading: loadingConnection } = trpc.bank.checkConnection.useQuery(undefined, { retry: false });
  const hasBankConnected = connection?.hasBank === true;

  // getAllPlaidAccounts - same as Transactions.tsx (this works)
  const { data: plaidAccountsData, isLoading: loadingAccounts } = trpc.bank.getAllPlaidAccounts.useQuery(undefined, { retry: false });
  const plaidAccounts = plaidAccountsData?.accounts ?? [];
  const allAccounts = plaidAccounts;
  const account = plaidAccounts.find((a: any) => String(a.id) === selectedAccountId) || plaidAccounts[0] || null;
  const accountIdNum = account?.id ? Number(account.id) : undefined;

  const { data: liveBalanceData, isLoading: loadingBalance } = trpc.bank.getLiveBalance.useQuery(
    { accountId: accountIdNum }, { enabled: hasBankConnected && !!account && !!accountIdNum, retry: 1 }
  );
  const { data: monthData, isLoading: loadingMonth } = trpc.bank.getMonthData.useQuery(
    { year: parseInt(selectedYear), month: parseInt(selectedMonth), accountId: accountIdNum }, { enabled: hasBankConnected && !!account && !!accountIdNum }
  );
  // Annual summary for the resumen del año card
  const { data: yearData } = trpc.bank.getYearData.useQuery(
    { year: parseInt(selectedYear), accountId: accountIdNum }, { enabled: hasBankConnected && !!account && !!accountIdNum }
  );
  // DEBUG: Log month selection
  useEffect(() => {
    console.log("[DEBUG] selectedMonth:", selectedMonth, "selectedYear:", selectedYear, "accountIdNum:", accountIdNum, "monthData count:", monthData?.count ?? "no data", "loading:", loadingMonth);
  }, [selectedMonth, selectedYear, accountIdNum, monthData, loadingMonth]);
  const { data: diagnosis, isLoading: loadingDiagnosis, refetch: refetchDiagnosis } = trpc.bank.diagnoseMonth.useQuery(
    { year: parseInt(selectedYear), month: parseInt(selectedMonth) },
    { enabled: false } // manual only
  );

  const handleSuccess = useCallback(() => { utils.invalidate(); }, [utils]);

  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      setSyncing(false);
      if (data.success) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
        handleSuccess();
        if (data.added === 0) {
          toast.info(data.message || "No se encontraron transacciones nuevas para este periodo en tu banco.");
        } else {
          toast.success(`${data.added} transacciones sincronizadas. Los asientos contables se crearon automaticamente.`);
        }
      } else if (data.error === "TOKEN_INVALID") {
        toast.error("Tu sesion con el banco expiro. Reconecta tu cuenta.");
        handleSuccess();
      } else {
        toast.error(data.error || "Error al sincronizar");
      }
    },
    onError: (err: { message: string }) => { setSyncing(false); toast.error(err.message); },
  });

  const syncHistoricalMutation = trpc.bank.syncHistorical.useMutation({
    onSuccess: (data) => {
      setSyncing(false);
      if (data.success) { setJustSynced(true); setTimeout(() => setJustSynced(false), 3000); handleSuccess(); toast.success(`${data.totalAdded} transacciones sincronizadas en ${data.monthsSynced} meses. Los asientos contables se crearon automaticamente.`); }
      else { toast.error(data.error || "Error al sincronizar historial"); }
    },
    onError: (err: { message: string }) => { setSyncing(false); toast.error(err.message); },
  });

  // Note: Auto-sync removed to prevent race conditions with queries.
  // Users can sync manually with the sync button.



  const disconnectMut = trpc.bank.disconnect.useMutation({
    onSuccess: () => { setAutoSyncDone(false); setConfirmDisconnect(false); handleSuccess(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const deleteMut = trpc.bank.delete.useMutation({
    onSuccess: () => { handleSuccess(); },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => { if (account) setIsConnecting(false); }, [account]);
  useEffect(() => { if (!isConnecting) return; const timer = setTimeout(() => setIsConnecting(false), 45000); return () => clearTimeout(timer); }, [isConnecting]);
  // Initial auto-sync on first bank connection
  useEffect(() => {
    const bankNowConnected = connection?.hasBank === true && !loadingConnection;
    if (bankNowConnected && !wasConnectedRef.current) {
      wasConnectedRef.current = true;
      setSyncing(true);
      syncMutation.mutate({ year: parseInt(selectedYear), month: parseInt(selectedMonth) });
    }
  }, [connection?.hasBank, loadingConnection, selectedYear, selectedMonth, syncMutation]);

  // Note: Auto-sync removed to prevent accidental data loss.
  // User must manually click "Sincronizar" to sync a month.

  useEffect(() => {
    if (!allAccounts || allAccounts.length === 0) return;
    if (selectedAccountId) {
      const stillExists = allAccounts.some((a: typeof allAccounts[0]) => String(a.id) === selectedAccountId);
      if (!stillExists) {
        setSelectedAccountIdRaw(String(allAccounts[0].id));
        try { localStorage.setItem("bank_selected_account_id", String(allAccounts[0].id)); } catch { /* ignore */ }
      }
    } else {
      setSelectedAccountIdRaw(String(allAccounts[0].id));
      try { localStorage.setItem("bank_selected_account_id", String(allAccounts[0].id)); } catch { /* ignore */ }
    }
  }, [allAccounts]);

  const isPlaidConnected = hasBankConnected && !loadingConnection;
  const needsReconnect = !loadingConnection && hasBankConnected && !!account && !connection?.hasBank;
  const hasAccount = !!account;
  const balance = liveBalanceData?.balance ?? account?.currentBalance ?? "0";

  const handleSync = () => {
    if (account?.id) {
      setSyncing(true);
      syncMutation.mutate({ year: parseInt(selectedYear), month: parseInt(selectedMonth), accountId: Number(account.id) });
    }
  };

  const handleSyncHistorical = () => {
    setSyncing(true);
    syncHistoricalMutation.mutate();
  };

  const goToCategory = (category: string) => {
    navigate(`/bank/category/${category}?month=${selectedMonth}&year=${selectedYear}`);
  };

  if (isConnecting) {
    return (
      <div className="max-w-5xl mx-auto p-6 lg:p-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-black">Mi Banco</h1>
          <p className="text-sm text-neutral-400 mt-1">Conecta tu cuenta para sincronizar transacciones automaticamente</p>
        </div>
        <Card className="border-neutral-200 rounded-xl shadow-none">
          <CardContent className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-5 animate-pulse">
              <Loader2 className="w-8 h-8 text-neutral-900 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-black mb-2">Conectando tu banco...</h3>
            <p className="text-sm text-neutral-400 max-w-sm mb-6">Esto puede tomar unos segundos. Estamos sincronizando tus cuentas y transacciones.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state while checking connection
  if (loadingConnection) {
    return (
      <div className="max-w-5xl mx-auto p-6 lg:p-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-black">Mi Banco</h1>
          <p className="text-sm text-neutral-400 mt-1">Verificando conexion bancaria...</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // No bank connected — show empty state
  if (!hasBankConnected) {
    return (
      <div className="max-w-5xl mx-auto p-6 lg:p-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-black">Mi Banco</h1>
          <p className="text-sm text-neutral-400 mt-1">Conecta tu cuenta para sincronizar transacciones automaticamente</p>
        </div>
        {showPlaidOverlay && (
          <PlaidLinkOverlay
            onSuccess={() => { setShowPlaidOverlay(false); handleSuccess(); }}
            onClose={() => setShowPlaidOverlay(false)}
          />
        )}
        {!showPlaidOverlay && (
          <Card className="border-neutral-200 rounded-xl shadow-none">
            <CardContent className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-5">
                <Landmark className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="text-lg font-semibold text-black mb-2">Sin cuenta bancaria conectada</h3>
              <p className="text-sm text-neutral-400 max-w-sm mb-6">Conecta tu cuenta bancaria para ver saldo en tiempo real, transacciones automaticas y analisis de flujo de caja.</p>
              <Button
                onClick={() => setShowPlaidOverlay(true)}
                className="bg-black hover:bg-neutral-800 text-white rounded-lg h-10 px-6"
              >
                <Landmark className="w-4 h-4 mr-2" /> Conectar Banco
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Build category map from actual transactions (backend doesn't return byCategory)
  const byCategoryMap = new Map<string, { total: number; count: number; type: string }>();
  (monthData?.transactions ?? []).forEach((tx: any) => {
    const key = tx.category || "other";
    const existing = byCategoryMap.get(key);
    if (existing) {
      existing.total += Number(tx.amount ?? 0);
      existing.count += 1;
    } else {
      byCategoryMap.set(key, { total: Number(tx.amount ?? 0), count: 1, type: tx.type || "expense" });
    }
  });

  const incomeCats = Array.from(byCategoryMap.entries()).filter(([, v]) => v.type === "income");
  const expenseCats = Array.from(byCategoryMap.entries()).filter(([, v]) => v.type === "expense");

  const monthIncome = Number(monthData?.income ?? 0);
  const monthExpense = Number(monthData?.expense ?? 0);
  const isCurrentMonth = parseInt(selectedMonth) === new Date().getMonth() + 1 && parseInt(selectedYear) === new Date().getFullYear();

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-10 space-y-6">
      {/* HEADER */}
      <AnimatedPage>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-black">Mi Banco</h1>
              {isPlaidConnected && (
                justSynced ? (
                  <Badge className="bg-blue-100 text-blue-700 text-xs animate-pulse"><RefreshCw className="w-3 h-3 mr-1" /> Sincronizado</Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" /> Conectado</Badge>
                )
              )}
              {needsReconnect && <Badge className="bg-amber-100 text-amber-700 text-xs"><AlertCircle className="w-3 h-3 mr-1" /> Reconexion necesaria</Badge>}
            </div>
            {account && (
              <p className="text-sm text-neutral-400 mt-1">
                {account.bankName} <span className="text-neutral-300">|</span> {account.accountNumber}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {allAccounts && allAccounts.length > 0 && (
              <AccountDropdown
                accounts={allAccounts}
                selectedId={selectedAccountId || String(account?.id) || ""}
                onChange={(id) => setSelectedAccountId(id)}
              />
            )}
            <div className="flex items-center gap-1.5">
              <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
              <YearSelector value={selectedYear} onChange={setSelectedYear} />
              <Button onClick={handleSync} disabled={syncing || !hasAccount} className="bg-black text-white hover:bg-neutral-800 rounded-lg h-8 w-8 p-0" title="Sincronizar mes actual">
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {account && (
              confirmDisconnect ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-600 mr-1">Seguro?</span>
                  <Button onClick={() => setConfirmDisconnect(false)} variant="outline" className="h-7 px-2 text-xs border-neutral-200">No</Button>
                  <Button onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending} className="h-7 px-2 text-xs bg-red-600 hover:bg-red-700 text-white">Si</Button>
                </div>
              ) : (
                <Button onClick={() => setConfirmDisconnect(true)} variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 h-8 px-2 rounded-lg text-xs">
                  <LogOut className="w-3 h-3 mr-1" /> Desconectar
                </Button>
              )
            )}
          </div>
        </div>
      </AnimatedPage>

      {/* RECONNECT BANNER */}
      {needsReconnect && (
        <AnimatedCard delay={100}>
          <Card className="border-amber-200 bg-amber-50/50 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-800">Tu sesion con el banco expiro</p>
                <p className="text-xs text-amber-600">Reconecta tu cuenta para seguir sincronizando automaticamente.</p>
              </div>
              <PlaidLinkButton onSuccess={() => { setAutoSyncDone(false); handleSuccess(); }} onStart={() => setIsConnecting(true)} onExchangeStart={() => setIsConnecting(true)} />
            </CardContent>
          </Card>
        </AnimatedCard>
      )}

      {/* 4 KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Saldo Actual", value: formatCurrency(balance), sub: isPlaidConnected ? "En vivo desde tu banco" : "Sincroniza para actualizar", icon: Wallet, color: "bg-blue-50 text-blue-600", valColor: Number(balance) >= 0 ? "text-blue-600" : "text-red-600" },
          { label: "Ingresos", value: formatCurrency(monthData?.income ?? 0), sub: getMonthRangeLabel(parseInt(selectedMonth), parseInt(selectedYear)), icon: TrendingUp, color: "bg-emerald-50 text-emerald-600", valColor: "text-emerald-600" },
          { label: "Gastos", value: formatCurrency(monthData?.expense ?? 0), sub: getMonthRangeLabel(parseInt(selectedMonth), parseInt(selectedYear)), icon: TrendingDown, color: "bg-red-50 text-red-600", valColor: "text-red-600" },
          { label: "Transacciones", value: `${(monthData?.transactions ?? []).length}`, sub: `${(monthData?.transactions ?? []).filter((t: any) => t.type === "income").length} ingresos . ${(monthData?.transactions ?? []).filter((t: any) => t.type === "expense").length} gastos`, icon: Receipt, color: "bg-neutral-100 text-neutral-600", valColor: "text-black" },
        ].map((s, i) => (
          <AnimatedCard key={s.label} delay={100 + i * 80}>
            <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-md ${s.color}`}><s.icon className="w-3.5 h-3.5" /></div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wide">{s.label}</p>
                </div>
                {loadingAccounts || loadingBalance ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className={`text-2xl font-bold tabular-nums ${s.valColor}`}>{s.value}</p>
                )}
                <p className="text-[10px] text-neutral-400 mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          </AnimatedCard>
        ))}
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-5">
          {/* Income Categories */}
          <AnimatedCard delay={100}>
            <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-black flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-emerald-500" /> Ingresos por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {incomeCats.length > 0 ? (
                  <div className="space-y-2">
                    {incomeCats.map(([key, data]) => {
                      const Icon = CATEGORY_ICONS[key] || Landmark;
                      const colorClass = CATEGORY_COLORS[key] || "bg-neutral-100 text-neutral-600";
                      return (
                        <button key={key} onClick={() => goToCategory(key)} className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-neutral-50 text-left transition-colors duration-150">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${colorClass}`}><Icon className="w-4 h-4" /></div>
                            <div>
                              <p className="text-sm text-neutral-700 font-medium">{CATEGORY_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
                              <p className="text-[10px] text-neutral-400">{data.count} transacciones</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-emerald-600">{formatCurrency(data.total)}</span>
                            <ChevronRight className="w-4 h-4 text-neutral-300" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 text-center py-6">No hay ingresos este periodo</p>
                )}
              </CardContent>
            </Card>
          </AnimatedCard>

          {/* Expense Categories */}
          <AnimatedCard delay={180}>
            <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-black flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-red-500" /> Gastos por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {expenseCats.length > 0 ? (
                  <div className="space-y-2">
                    {expenseCats.map(([key, data]) => {
                      const Icon = CATEGORY_ICONS[key] || Landmark;
                      const colorClass = CATEGORY_COLORS[key] || "bg-neutral-100 text-neutral-600";
                      return (
                        <button key={key} onClick={() => goToCategory(key)} className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-neutral-50 text-left transition-colors duration-150">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${colorClass}`}><Icon className="w-4 h-4" /></div>
                            <div>
                              <p className="text-sm text-neutral-700 font-medium">{CATEGORY_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
                              <p className="text-[10px] text-neutral-400">{data.count} transacciones</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-red-600">{formatCurrency(data.total)}</span>
                            <ChevronRight className="w-4 h-4 text-neutral-300" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 text-center py-6">No hay gastos este periodo</p>
                )}
              </CardContent>
            </Card>
          </AnimatedCard>

          {/* Transactions List */}
          <AnimatedCard delay={260}>
            <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-black flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-neutral-500" /> Transacciones del Mes
                </CardTitle>
                <span className="text-xs text-neutral-400">{(monthData?.transactions ?? []).length} total</span>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingMonth && !monthData ? (
                  <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                ) : (monthData?.transactions ?? []).length === 0 ? (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-sm text-neutral-400">No hay transacciones sincronizadas para {(() => { const names = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]; return `${names[parseInt(selectedMonth)]} ${selectedYear}`; })()}</p>
                    {isPlaidConnected && (
                      <div className="flex flex-col items-center gap-2">
                        <Button
                          onClick={handleSync}
                          disabled={syncing}
                          className="bg-black text-white hover:bg-neutral-800 text-sm px-4 h-9 rounded-lg"
                        >
                          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                          {syncing ? "Sincronizando..." : "Sincronizar transacciones de este mes"}
                        </Button>
                        <Button
                          onClick={() => { setShowDiagnosis(true); refetchDiagnosis(); }}
                          variant="ghost"
                          className="text-xs text-neutral-500 hover:text-neutral-700 h-7"
                        >
                          Verificar conexion con el banco
                        </Button>
                      </div>
                    )}
                    {showDiagnosis && (
                      <div className="mt-3 text-left bg-neutral-50 border border-neutral-200 rounded-lg p-3 mx-auto max-w-md">
                        {loadingDiagnosis ? (
                          <p className="text-xs text-neutral-500">Verificando...</p>
                        ) : diagnosis ? (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-neutral-700">Diagnostico de Plaid:</p>
                            <p className="text-xs text-neutral-600">Rango: {diagnosis.dateRange}</p>
                            <p className="text-xs text-neutral-600">Transacciones en Plaid: <span className={diagnosis.plaidTxCount > 0 ? "text-emerald-600 font-medium" : "text-red-500"}>{diagnosis.plaidTxCount}</span></p>
                            <p className="text-xs text-neutral-600">Transacciones en BD: {diagnosis.dbTxCount}</p>
                            {diagnosis.error && <p className="text-xs text-red-500">Error: {diagnosis.error}</p>}
                            {diagnosis.tokenValid && diagnosis.plaidTxCount === 0 && (
                              <p className="text-xs text-amber-600">Plaid no tiene transacciones para este mes. Esto es normal si conectaste tu banco despues de este periodo, o si tu banco no retiene datos tan antiguos.</p>
                            )}
                            {diagnosis.details && diagnosis.details.length > 0 && (
                              <details className="mt-1">
                                <summary className="text-[10px] text-neutral-500 cursor-pointer">Ver muestra de transacciones</summary>
                                <ul className="mt-1 space-y-0.5">
                                  {diagnosis.details.map((tx: any, i: number) => (
                                    <li key={i} className="text-[10px] text-neutral-500">{tx.date} - {tx.name} (${tx.amount})</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-500">Haz clic para verificar</p>
                        )}
                      </div>
                    )}
                    {isPlaidConnected && (
                      <p className="text-[11px] text-neutral-400">
                        Si este mes tiene transacciones en tu banco, haz clic para sincronizarlas.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(monthData?.transactions ?? []).slice(0, 3).map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-neutral-50 group transition-colors duration-150">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === "income" ? "bg-emerald-50" : "bg-red-50"}`}>
                            {tx.type === "income" ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
                          </div>
                          <div>
                            <p className="text-sm text-neutral-800 font-medium">{tx.description}</p>
                            <p className="text-[10px] text-neutral-400">{tx.category?.replace(/_/g, " ")} . {tx.transactionDate ? new Date(tx.transactionDate + "T12:00:00").toLocaleDateString("es") : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold tabular-nums ${tx.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
                            {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                          </span>
                          {confirmDeleteTx === tx.id ? (
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 p-0 text-neutral-400 hover:text-neutral-600" onClick={() => setConfirmDeleteTx(null)} title="Cancelar"><X className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => { deleteMut.mutate({ id: tx.id }); setConfirmDeleteTx(null); }} title="Confirmar"><Check className="w-3.5 h-3.5" /></Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-neutral-300 hover:text-red-500 transition-opacity duration-150" onClick={() => setConfirmDeleteTx(tx.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {(monthData?.transactions ?? []).length > 3 && (
                      <Button
                        variant="ghost"
                        onClick={() => navigate(`/transactions`)}
                        className="w-full mt-2 h-10 text-sm text-neutral-500 hover:text-black hover:bg-neutral-50 rounded-lg border border-dashed border-neutral-200 font-normal"
                      >
                        Mostrar mas <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </AnimatedCard>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          {/* Month Summary */}
          <AnimatedCard delay={280}>
            <Card className="border-neutral-200 rounded-xl shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-black flex items-center gap-2">
                  <PiggyBank className="w-4 h-4 text-neutral-500" /> Resumen del Año
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-500">Ingresos</span>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(yearData?.income ?? monthIncome)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-500">Gastos</span>
                  <span className="text-sm font-bold text-red-600">{formatCurrency(yearData?.expense ?? monthExpense)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-500">Transacciones</span>
                  <span className="text-sm text-black font-medium">{yearData?.transactionCount ?? (monthData?.transactions ?? []).length}</span>
                </div>
                <div className="pt-2 border-t border-neutral-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-black">Saldo en Banco</span>
                    <span className={`text-lg font-bold ${Number(balance) >= 0 ? "text-blue-600" : "text-red-600"}`}>
                      {formatCurrency(balance)}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400 pt-1">Saldo real segun tu banco</p>
                </div>
              </CardContent>
            </Card>
          </AnimatedCard>
        </div>
      </div>
    </div>
  );
}
