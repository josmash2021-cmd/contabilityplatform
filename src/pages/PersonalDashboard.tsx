import { useState, useRef, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Wallet, Landmark, RefreshCw,
  ArrowUpRight, ArrowDownRight, Building2, Zap, CircleDollarSign, ChevronDown,
  ShoppingBag, Utensils, Fuel, Tv, Banknote,
  Send, Receipt, LogOut, Star,
} from "lucide-react";
import { useNavigate } from "react-router";

const INCOME_CATS: Record<string, { label: string; icon: typeof TrendingUp; iconBg: string; iconColor: string }> = {
  zelle_income: { label: "Zelle Recibidos", icon: Send, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  deposit: { label: "Depositos Directos", icon: Building2, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  cash_deposit: { label: "Deposito de Efectivo", icon: Banknote, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  cash_income: { label: "Efectivo Recibido", icon: CircleDollarSign, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  income: { label: "Ingresos", icon: TrendingUp, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  paycheck: { label: "Nomina", icon: Banknote, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  transfer: { label: "Transferencias", icon: ArrowUpRight, iconBg: "bg-sky-100", iconColor: "text-sky-600" },
};

const EXPENSE_CATS: Record<string, { label: string; icon: typeof TrendingDown; iconBg: string; iconColor: string }> = {
  zelle_sent: { label: "Zelle Enviados", icon: Send, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  cash_withdrawal: { label: "Retiro de Efectivo", icon: Banknote, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  subscription: { label: "Suscripciones", icon: Tv, iconBg: "bg-pink-100", iconColor: "text-pink-600" },
  shopping: { label: "Compras", icon: ShoppingBag, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
  home_expense: { label: "Comida y Hogar", icon: Utensils, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
  business_expense: { label: "Negocio", icon: Receipt, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
  gasolina: { label: "Gasolina", icon: Fuel, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
  transfer: { label: "Transferencias", icon: ArrowDownRight, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
  other: { label: "Otros", icon: Receipt, iconBg: "bg-neutral-100", iconColor: "text-neutral-600" },
  expense: { label: "Gastos", icon: TrendingDown, iconBg: "bg-rose-100", iconColor: "text-rose-600" },
};

function buildBreakdown(
  byCategory: Array<{ category: string; type: string; total: string; count: number }>,
  type: "income" | "expense",
  catConfig: Record<string, { label: string; icon: any; iconBg: string; iconColor: string }>
) {
  return byCategory
    .filter((c) => c.type === type && parseFloat(c.total) > 0)
    .map((c) => {
      const config = catConfig[c.category] || { label: c.category, icon: Receipt, iconBg: "bg-neutral-100", iconColor: "text-neutral-600" };
      return { category: c.category, label: config.label, icon: config.icon, iconBg: config.iconBg, iconColor: config.iconColor, amount: parseFloat(c.total), count: c.count };
    })
    .sort((a, b) => b.amount - a.amount);
}

function AccountDropdown({ accounts, selectedId, onChange }: {
  accounts: any[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = accounts.find((a) => String(a.id) === selectedId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-8 px-2.5 border border-neutral-200 rounded-md bg-white text-xs hover:border-neutral-300 transition-colors"
      >
        <Landmark className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="truncate max-w-[90px]">{selected?.bankName ?? "Cuenta"}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 py-1">
          {accounts.map((acc: any) => (
            <button
              key={acc.id}
              onClick={() => { onChange(String(acc.id)); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                String(acc.id) === selectedId ? "bg-neutral-100 text-black font-medium" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Landmark className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span className="truncate">{acc.bankName}</span>
              </div>
              <span className={`text-xs font-medium shrink-0 ml-2 ${parseFloat(acc.currentBalance ?? "0") >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(parseFloat(acc.currentBalance ?? "0"))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Extract unique accounts from transactions as fallback ───
function extractAccountsFromTxs(txs: any[]): Array<{ id: number; bankName: string; accountType: string | null }> {
  const map = new Map<number, { id: number; bankName: string; accountType: string | null }>();
  for (const t of txs) {
    if (t.bankAccountId && !map.has(t.bankAccountId)) {
      map.set(t.bankAccountId, { id: t.bankAccountId, bankName: t.bankName || "Cuenta bancaria", accountType: null });
    }
  }
  return Array.from(map.values());
}

export default function PersonalDashboard() {
  const navigate = useNavigate();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [showAllTxs, setShowAllTxs] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const hasAutoSelected = useRef(false);
  const utils = trpc.useUtils();

  // ─── AI Auto-Categorization Agent ───
  // Silently fixes miscategorized transactions on page load
  const autoFixMutation = trpc.bank.autoFixCategories.useMutation({
    onSuccess: (data) => {
      if (data.fixed && data.fixed > 0) {
        utils.bank.getMonthData.invalidate();
      }
    },
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      autoFixMutation.mutate();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // ─── Auto-sync recent transactions on page load ───
  const syncRecentMutation = trpc.bank.syncRecent.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        utils.bank.getMonthData.invalidate();
      }
    },
    onError: () => { /* silent */ },
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      syncRecentMutation.mutate();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // ─── PLAID POLLING: Auto-sync every 2 minutes for new transactions ───
  useEffect(() => {
    if (!hasBankConnected) return;
    const interval = setInterval(() => {
      console.log("[Plaid Polling] Syncing transactions...");
      syncMutation.mutate({
        year: parseInt(selectedYear),
        month: parseInt(selectedMonth),
      });
    }, 2 * 60 * 1000); // Every 2 minutes
    return () => clearInterval(interval);
  }, [hasBankConnected, selectedYear, selectedMonth]);

  // ─── Auto-sync when month changes ───
  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        utils.bank.getMonthData.invalidate();
      }
    },
    onError: () => { /* silent */ },
  });

  // Sync selected month when it changes (for past months)
  useEffect(() => {
    const timer = setTimeout(() => {
      syncMutation.mutate({
        year: parseInt(selectedYear),
        month: parseInt(selectedMonth),
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [selectedYear, selectedMonth]);

  // ─── Accounts from DB ───
  const { data: dbAccounts, isLoading: accountsLoading } = trpc.bank.listAccounts.useQuery(undefined, {
    refetchInterval: 30000, // Live balance refresh every 30s
    refetchIntervalInBackground: true,
    onSuccess: (data) => {
      if (data && data.length > 0 && !hasAutoSelected.current && !selectedAccountId) {
        hasAutoSelected.current = true;
        setSelectedAccountId(String(data[0].id));
      }
    },
  });

  const dbAccountsList = dbAccounts ?? [];

  // ─── ALL ACCOUNTS DIRECTLY FROM PLAID (for dropdown) ───
  const { data: plaidAccountsData } = trpc.bank.getAllPlaidAccounts.useQuery(undefined, {
    staleTime: 60000,
    refetchInterval: 30000,
  });

  // ─── Month data (filtered by selected account for display) ───
  const { data: monthData, isLoading } = trpc.bank.getMonthData.useQuery({
    year: parseInt(selectedYear),
    month: parseInt(selectedMonth),
    accountId: selectedAccountId ? parseInt(selectedAccountId) : undefined,
  }, {
    refetchInterval: 30000, // Live balance refresh every 30s
    refetchIntervalInBackground: true,
  });

  const transactions = monthData?.transactions ?? [];
  // Balance always from getMonthData (backend calculates from bankAccounts table)
  const balance = parseFloat(monthData?.liveBalance ?? "0");

  // ─── Accounts for dropdown: use Plaid data (ALL accounts) ───
  // Merge Plaid accounts with DB data for currentBalance
  const plaidAccounts = plaidAccountsData?.accounts ?? [];
  const accounts = plaidAccounts.length > 0
    ? plaidAccounts.map((pa: any) => {
        const dbMatch = dbAccountsList.find((dbAcc: any) => dbAcc.id === pa.id || dbAcc.plaidAccountId === pa.plaidAccountId);
        return dbMatch ? { ...pa, currentBalance: dbMatch.currentBalance } : pa;
      })
    : dbAccountsList;
  const activeId = selectedAccountId || (accounts[0] ? String(accounts[0].id) : "");
  const activeAccount = accounts.find((a: any) => String(a.id) === activeId) ?? accounts[0];

  // ─── Refresh on load ───
  const refreshMutation = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: (data) => {
      utils.bank.listAccounts.invalidate();
      if (data.added && data.added > 0) toast.success(`${data.added} cuenta(s) nueva(s) encontradas`);
      else if (data.updated && data.updated > 0) toast.success(`${data.updated} balances actualizados`);
      else if (data.total === 1 && accounts.length === 1) {
        toast.info("Plaid reporta solo 1 cuenta. Si tienes mas cuentas, desconecta y vuelve a conectar el banco.");
      }
    },
    onError: (err) => toast.error(err.message),
  });
  useEffect(() => { refreshMutation.mutate(); }, []);

  // ─── Auto-sync with Plaid every 60s for live balance ───
  useEffect(() => {
    const interval = setInterval(() => {
      if (!refreshMutation.isPending) {
        refreshMutation.mutate();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshMutation.isPending]);

  // ─── Disconnect ───
  const disconnectMut = trpc.bank.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Banco desconectado");
      setConfirmDisconnect(false);
      setSelectedAccountId("");
      hasAutoSelected.current = false;
      try { localStorage.removeItem("aethel_bank_connected"); } catch { /* ignore */ }
      utils.bank.listAccounts.invalidate();
      utils.bank.checkConnection.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const incomeVal = parseFloat(monthData?.income ?? "0");
  const expenseVal = parseFloat(monthData?.expense ?? "0");

  // Category breakdown
  const categoryGroups = new Map<string, { category: string; type: string; total: number; count: number }>();
  for (const t of transactions) {
    const key = `${t.category}-${t.type}`;
    const existing = categoryGroups.get(key);
    if (existing) { existing.total += parseFloat(t.amount); existing.count++; }
    else categoryGroups.set(key, { category: t.category, type: t.type, total: parseFloat(t.amount), count: 1 });
  }
  const byCategory = Array.from(categoryGroups.values()).map(c => ({ ...c, total: String(c.total.toFixed(2)) }));
  const incomeBreakdown = buildBreakdown(byCategory, "income", INCOME_CATS);
  const expenseBreakdown = buildBreakdown(byCategory, "expense", EXPENSE_CATS);

  const displayedTransactions = showAllTxs ? transactions : transactions.slice(0, 5);
  const hasMore = transactions.length > 5;

  const months = [
    { value: "1", label: "Enero" }, { value: "2", label: "Febrero" }, { value: "3", label: "Marzo" },
    { value: "4", label: "Abril" }, { value: "5", label: "Mayo" }, { value: "6", label: "Junio" },
    { value: "7", label: "Julio" }, { value: "8", label: "Agosto" }, { value: "9", label: "Septiembre" },
    { value: "10", label: "Octubre" }, { value: "11", label: "Noviembre" }, { value: "12", label: "Diciembre" },
  ];

  return (
    <AnimatedPage className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-black">Inicio</h1>
          <p className="text-xs text-neutral-500">{monthData?.monthName ?? "Contabilidad Personal"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AccountDropdown accounts={accounts} selectedId={activeId} onChange={setSelectedAccountId} />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-9 w-[120px] border-neutral-200 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{months
              .filter(m => parseInt(selectedYear) < now.getFullYear() || parseInt(m.value) <= now.getMonth() + 1)
              .map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="h-9 w-[88px] border-neutral-200 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{[2026, 2025, 2024].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} variant="outline" size="sm" className="h-9 px-2.5 border-neutral-200">
            {refreshMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          {/* Salir button next to sync */}
          {accounts.length > 0 && (
            confirmDisconnect ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-red-600 font-medium">Seguro?</span>
                <button onClick={() => setConfirmDisconnect(false)} className="h-7 px-1.5 text-[10px] border border-neutral-200 rounded bg-white hover:bg-neutral-50">No</button>
                <button onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending} className="h-7 px-1.5 text-[10px] bg-red-600 hover:bg-red-700 text-white rounded">Si</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDisconnect(true)} className="h-8 w-8 flex items-center justify-center border border-red-200 text-red-500 rounded-md bg-white hover:bg-red-50 transition-colors shrink-0" title="Desconectar banco">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Bank Balance Card */}
      {isLoading || accountsLoading ? <Skeleton className="h-28 rounded-xl mb-4" /> : (
        <Card className={`rounded-xl shadow-none mb-4 bg-white ${balance >= 0 ? "border-2 border-emerald-400" : "border-2 border-red-400"}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Landmark className="w-4 h-4 text-neutral-400" />
                  <span className="text-xs text-neutral-500">{activeAccount?.bankName ?? "Banco"}</span>
                  {accounts[0]?.id === activeAccount?.id && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  {monthData?.fromPlaid ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      En vivo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full" title="Sin conexion con el banco">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Desactualizado
                    </span>
                  )}
                </div>
                <p className={`text-2xl font-bold ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(balance)}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">{balance >= 0 ? "Balance disponible" : "Sobregiro / Balance negativo"}</p>
                {monthData?.lastSyncedAt && (
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    Actualizado: {new Date(monthData.lastSyncedAt).toLocaleString("es", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${balance >= 0 ? "bg-emerald-100" : "bg-red-100"}`}>
                <CircleDollarSign className={`w-6 h-6 ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) : (
          <>
            <Card className="border-emerald-200 rounded-xl shadow-none cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-emerald-600" /></div><span className="text-xs text-neutral-500">Ingresos</span></div>
                <p className="text-lg font-semibold text-emerald-700">+{formatCurrency(incomeVal)}</p>
                <p className="text-[10px] text-neutral-400">{transactions.filter((t: any) => t.type === "income").length} transacciones</p>
              </CardContent>
            </Card>
            <Card className="border-rose-200 rounded-xl shadow-none cursor-pointer hover:shadow-md hover:border-rose-300 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center"><TrendingDown className="w-4 h-4 text-rose-600" /></div><span className="text-xs text-neutral-500">Gastos</span></div>
                <p className="text-lg font-semibold text-rose-700">-{formatCurrency(expenseVal)}</p>
                <p className="text-[10px] text-neutral-400">{transactions.filter((t: any) => t.type === "expense").length} transacciones</p>
              </CardContent>
            </Card>
            <Card className="border-sky-200 rounded-xl shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center"><Wallet className="w-4 h-4 text-sky-600" /></div><span className="text-xs text-neutral-500">Balance Total</span></div>
                <p className="text-lg font-semibold text-sky-700">{formatCurrency(balance)}</p>
                <p className="text-[10px] text-neutral-400">{accounts.length} cuenta{accounts.length !== 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
            <Card className="border-violet-200 rounded-xl shadow-none cursor-pointer hover:shadow-md hover:border-violet-300 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><Zap className="w-4 h-4 text-violet-600" /></div><span className="text-xs text-neutral-500">Transacciones</span></div>
                <p className="text-lg font-semibold text-violet-700">{transactions.length}</p>
                <p className="text-[10px] text-neutral-400">Este mes</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Income Breakdown — clickable filters */}
      {!isLoading && incomeBreakdown.length > 0 && (
        <Card className="border-neutral-200 rounded-xl shadow-none mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-black flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /> Desglose de Ingresos</CardTitle></CardHeader>
          <CardContent className="pt-0"><div className="space-y-1">{incomeBreakdown.map((item) => { const Icon = item.icon; return (<div key={item.category} onClick={() => navigate(`/personal/transactions?filter=${item.category}&month=${selectedMonth}&year=${selectedYear}`)} className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg ${item.iconBg} flex items-center justify-center`}><Icon className={`w-4 h-4 ${item.iconColor}`} /></div><div><p className="text-sm text-black">{item.label}</p><p className="text-[10px] text-neutral-400">{item.count} transacciones</p></div></div><p className="text-sm font-semibold text-emerald-600">+{formatCurrency(item.amount)}</p></div>); })}</div></CardContent>
        </Card>
      )}

      {/* Expense Breakdown — clickable filters */}
      {!isLoading && expenseBreakdown.length > 0 && (
        <Card className="border-neutral-200 rounded-xl shadow-none mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-black flex items-center gap-2"><TrendingDown className="w-4 h-4 text-rose-600" /> Desglose de Gastos</CardTitle></CardHeader>
          <CardContent className="pt-0"><div className="space-y-1">{expenseBreakdown.map((item) => { const Icon = item.icon; return (<div key={item.category} onClick={() => navigate(`/personal/transactions?filter=${item.category}&month=${selectedMonth}&year=${selectedYear}`)} className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-rose-50 cursor-pointer transition-colors"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg ${item.iconBg} flex items-center justify-center`}><Icon className={`w-4 h-4 ${item.iconColor}`} /></div><div><p className="text-sm text-black">{item.label}</p><p className="text-[10px] text-neutral-400">{item.count} transacciones</p></div></div><p className="text-sm font-semibold text-rose-600">-{formatCurrency(item.amount)}</p></div>); })}</div></CardContent>
        </Card>
      )}

      {/* All Transactions */}
      <Card className="border-neutral-200 rounded-xl shadow-none">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-black">Transacciones del Mes {transactions.length > 0 && <span className="text-neutral-400 font-normal ml-1">({transactions.length})</span>}</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-0">
            {isLoading ? <div className="space-y-2 py-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
              : transactions.length === 0 ? (
                <div className="text-center py-10"><Landmark className="w-10 h-10 text-neutral-300 mx-auto mb-3" /><p className="text-sm text-neutral-400">No hay transacciones este mes</p></div>
              ) : displayedTransactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50 px-1 rounded transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tx.type === "income" ? "bg-emerald-100" : "bg-rose-100"}`}>
                      {tx.type === "income" ? <ArrowUpRight className="w-4 h-4 text-emerald-600" /> : <ArrowDownRight className="w-4 h-4 text-rose-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-black truncate">{tx.description}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                        <span>{(INCOME_CATS[tx.category]?.label || EXPENSE_CATS[tx.category]?.label || tx.category)}</span>
                        <span>·</span>
                        <span>{tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString("es") : ""}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ml-3 ${tx.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>{tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}</span>
                </div>
              ))}
            {!isLoading && hasMore && (<button onClick={() => setShowAllTxs(!showAllTxs)} className="w-full py-3 text-center text-sm font-medium text-neutral-500 hover:text-black hover:bg-neutral-50 rounded-lg transition-colors mt-1">{showAllTxs ? "Ver menos" : `Ver mas (${transactions.length - 5} restantes)`}</button>)}
          </div>
        </CardContent>
      </Card>
    </AnimatedPage>
  );
}
