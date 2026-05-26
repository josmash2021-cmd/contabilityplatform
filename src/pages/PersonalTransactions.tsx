import { useState, useRef, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useSearchParams } from "react-router";
import {
  ArrowUpRight, ArrowDownRight, RefreshCw, Landmark,
  ChevronDown, TrendingUp, TrendingDown, Wallet,
  Fuel,
} from "lucide-react";

/** Same dropdown as Dashboard - avoids scroll issues */
function AccountDropdown({
  accounts,
  selectedId,
  onChange,
}: {
  accounts: any[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
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
          {/* Option to show ALL accounts */}
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
              !selectedId ? "bg-neutral-100 text-black font-medium" : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Landmark className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Todas las cuentas</span>
            </div>
          </button>
          <div className="border-t border-neutral-100 my-1" />
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
                <span className="truncate">{acc.bankName} {acc.accountType ? `(${acc.accountType})` : ""}</span>
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

export default function PersonalTransactions() {
  const [searchParams] = useSearchParams();
  const now = new Date();
  // Read query params from Dashboard navigation
  const qpType = searchParams.get("type");
  const qpFilter = searchParams.get("filter");
  const qpMonth = searchParams.get("month");
  const qpYear = searchParams.get("year");
  const qpAccount = searchParams.get("account");

  // Map category to filter type
  const categoryToFilter: Record<string, string> = {
    zelle_income: "zelle_in",
    zelle_sent: "zelle_out",
    cash_deposit: "cash_deposit",
    cash_withdrawal: "cash_withdrawal",
    deposit: "income",
    income: "income",
    expense: "expense",
    gasolina: "gasolina",
  };

  const initialFilter = qpFilter && categoryToFilter[qpFilter] ? categoryToFilter[qpFilter] : (qpType ?? "all");

  const [year, setYear] = useState(qpYear ?? String(now.getFullYear()));
  const [month, setMonth] = useState(qpMonth ?? String(now.getMonth() + 1));
  const [filterType, setFilterType] = useState(initialFilter);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(qpAccount ?? "");
  const utils = trpc.useUtils();

  // Check if bank is connected — controls visibility of bank-related UI
  const { data: bankConnection, isLoading: isCheckingBank } = trpc.bank.checkConnection.useQuery(undefined, {
    staleTime: 60000,
    refetchOnMount: true,
  });
  const hasBankConnected = bankConnection?.hasBank === true;

  // Fetch ALL accounts from Plaid (like Dashboard) — only when bank is connected
  const { data: plaidAccountsData } = trpc.bank.getAllPlaidAccounts.useQuery(undefined, {
    staleTime: 60000,
    enabled: hasBankConnected,
  });

  // Fetch bank accounts from DB (for currentBalance) — only when bank is connected
  const { data: dbAccounts } = trpc.bank.listAccounts.useQuery(undefined, {
    enabled: hasBankConnected,
    onSuccess: (data) => {
      if (data && data.length > 0 && !selectedAccountId && !qpAccount) {
        setSelectedAccountId(String(data[0].id));
      }
    },
  });

  // Merge Plaid accounts with DB data for currentBalance
  const plaidAccounts = plaidAccountsData?.accounts ?? [];
  const accounts = plaidAccounts.length > 0
    ? plaidAccounts.map((pa: any) => {
        const dbMatch = (dbAccounts ?? []).find((dbAcc: any) => dbAcc.id === pa.id || dbAcc.plaidAccountId === pa.plaidAccountId);
        return dbMatch ? { ...pa, currentBalance: dbMatch.currentBalance } : pa;
      })
    : (dbAccounts ?? []);

  const effectiveAccountId = selectedAccountId || (accounts[0] ? String(accounts[0].id) : "");

  // Use SAME endpoint as Dashboard - bank.getMonthData
  // First get ALL transactions (no account filter) to show count
  const { data: allMonthData } = trpc.bank.getMonthData.useQuery({
    year: parseInt(year),
    month: parseInt(month),
  });
  const { data: monthData, isLoading } = trpc.bank.getMonthData.useQuery({
    year: parseInt(year),
    month: parseInt(month),
    accountId: effectiveAccountId ? parseInt(effectiveAccountId) : undefined,
  });

  // ─── AI Auto-Categorization Agent ───
  // Silently fixes miscategorized transactions on page load
  const autoFixMutation = trpc.bank.autoFixCategories.useMutation({
    onSuccess: (data) => {
      if (data.fixed && data.fixed > 0) {
        utils.bank.getMonthData.invalidate();
      }
    },
  });

  // Run auto-fix on page load
  useEffect(() => {
    const timer = setTimeout(() => {
      autoFixMutation.mutate();
    }, 2000); // Wait 2s for data to load first
    return () => clearTimeout(timer);
  }, []);

  // Auto-sync recent transactions on page load
  useEffect(() => {
    if (hasBankConnected) {
      const timer = setTimeout(() => {
        syncRecentMutation.mutate();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasBankConnected]);

  // Auto-sync on load if no transactions
  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        toast.success(`${data.added} transacciones sincronizadas`);
      }
      utils.bank.getMonthData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Auto-sync RECENT transactions on page load (last 7 days)
  const syncRecentMutation = trpc.bank.syncRecent.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        toast.success(`${data.added} transacciones nuevas encontradas`);
        utils.bank.getMonthData.invalidate();
      }
    },
    onError: () => { /* silent - recent sync is best effort */ },
  });

  // Auto-sync when month changes and no data
  useEffect(() => {
    if (!isLoading && monthData && monthData.transactions.length === 0 && effectiveAccountId) {
      syncMutation.mutate({
        year: parseInt(year),
        month: parseInt(month),
        accountId: parseInt(effectiveAccountId),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, effectiveAccountId]);

  const allTransactions = monthData?.transactions ?? [];
  const totalAllAccounts = allMonthData?.transactions?.length ?? 0;
  const GAS_BRANDS = [
    "shell","exxon","chevron","bp","mobil","texaco","marathon","speedway","sheetz",
    "wawa","valero","citgo","phillips 66","circle k","costco gas","walmart gas",
    "7-eleven","7 eleven","sam's club gas","buc-ee's","bucees","quik trip","quiktrip",
    "race trac","racetrac","love's","loves travel","pilot flying j","pilot","flying j",
    "ta travel","travelcenters","petro","ambest","casey's","caseys","kum & go","kum and go",
    "stripes","murphy usa","murphy express","thorntons","maverik","sinclair","gulf",
    "76 gas","union 76","esso","arco","ampm","am pm","kwik trip","kwik star",
    "holiday","cumberland farms","royal farms","ritter's","ritters","getgo","get-go",
    "parkers","parker's","quick chek","quickchek","stewart's","stewarts","oncue","p66"];
  const isGas = (t: any) => {
    // Exclude Zelle transactions - they should never appear in gas filter
    if (t.category === "zelle_income" || t.category === "zelle_sent") return false;
    const n = (t.description || "").toLowerCase();
    if (t.category === "gasolina") return true;
    for (const b of GAS_BRANDS) { if (n.includes(b)) return true; }
    return false;
  };
  const isZelleRecibido = (t: any) => t.category === "zelle_income";
  const isZelleEnviado = (t: any) => t.category === "zelle_sent";
  // EXACT category match only — no broad keyword matching
  const isCashDeposit = (t: any) => t.category === "cash_deposit";
  const isCashWithdrawal = (t: any) => t.category === "cash_withdrawal";
  const isCompras = (t: any) => {
    const n = (t.description || "").toLowerCase();
    return t.category === "shopping" || n.includes("purchase") || n.includes("retail") || n.includes("store") || n.includes("shop");
  };
  const transactions =
    filterType === "all" ? allTransactions :
    filterType === "zelle_in" ? allTransactions.filter((t: any) => isZelleRecibido(t)) :
    filterType === "zelle_out" ? allTransactions.filter((t: any) => isZelleEnviado(t)) :
    filterType === "income" ? allTransactions.filter((t: any) => t.type === "income") :
    filterType === "expense" ? allTransactions.filter((t: any) => t.type === "expense") :
    filterType === "cash_deposit" ? allTransactions.filter((t: any) => isCashDeposit(t)) :
    filterType === "cash_withdrawal" ? allTransactions.filter((t: any) => isCashWithdrawal(t)) :
    filterType === "compras" ? allTransactions.filter((t: any) => isCompras(t)) :
    filterType === "gasolina" ? allTransactions.filter((t: any) => isGas(t)) :
    allTransactions;

  const totalIncome = allTransactions
    .filter((t: any) => t.type === "income")
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = allTransactions
    .filter((t: any) => t.type === "expense")
    .reduce((s: number, t: any) => s + Number(t.amount), 0);

  // Balance of the SELECTED account (not just first)
  const selectedAccount = accounts.find((a: any) => String(a.id) === effectiveAccountId);
  const liveBalance = parseFloat(selectedAccount?.currentBalance ?? "0");

  return (
    <AnimatedPage className="p-4 lg:p-6">
      {/* Header with filter title */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-black">
            {filterType === "zelle_in" ? "Zelle Recibidos" : filterType === "zelle_out" ? "Zelle Enviados" : filterType === "income" ? "Ingresos" : filterType === "expense" ? "Gastos" : filterType === "cash_deposit" ? "Depósitos de Efectivo" : filterType === "cash_withdrawal" ? "Retiros de Efectivo" : filterType === "compras" ? "Compras" : filterType === "gasolina" ? "Gasolina" : "Transacciones"}
          </h1>
          <p className="text-xs text-neutral-500">
            {allTransactions.length} de {totalAllAccounts} registros
            {effectiveAccountId && totalAllAccounts > allTransactions.length && (
              <button
                onClick={() => setSelectedAccountId("")}
                className="ml-2 text-emerald-600 hover:text-emerald-700 underline"
              >
                Ver todas las cuentas
              </button>
            )}
            {" · "}{monthData?.monthName ?? ""}
          </p>
        </div>
      </div>

      {/* Controls: dropdown, month, year, sync — ABOVE filters — ONLY when bank connected */}
      {hasBankConnected && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {(accounts ?? []).length > 0 && (
            <AccountDropdown
              accounts={accounts ?? []}
              selectedId={effectiveAccountId}
              onChange={setSelectedAccountId}
            />
          )}
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-8 w-[100px] text-xs border-neutral-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(() => {
                const currentYear = new Date().getFullYear();
                const currentMonth = new Date().getMonth() + 1;
                const maxMonth = parseInt(year) === currentYear ? currentMonth : 12;
                return Array.from({ length: maxMonth }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][i]}
                  </SelectItem>
                ));
              })()}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-8 w-[72px] text-xs border-neutral-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2026,2025,2024].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            onClick={() => syncMutation.mutate({
              year: parseInt(year),
              month: parseInt(month),
              accountId: effectiveAccountId ? parseInt(effectiveAccountId) : undefined,
            })}
            disabled={syncMutation.isPending}
          variant="outline"
          size="sm"
          className="h-8 px-2 border-neutral-200"
        >
          {syncMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>
      )}

      {/* Quick filter buttons — horizontal scroll carousel */}
      <div
        className="flex bg-gray-100 rounded-xl p-1 mb-4 gap-1 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
        {([
          { key: "all", label: "Todos" },
          { key: "income", label: "Ingresos" },
          { key: "expense", label: "Gastos" },
          { key: "zelle_in", label: "Zelle Recibidos" },
          { key: "zelle_out", label: "Zelle Enviados" },
          { key: "cash_deposit", label: "Dep. Efectivo" },
          { key: "cash_withdrawal", label: "Ret. Efectivo" },
          { key: "compras", label: "Compras" },
          { key: "gasolina", label: "Gasolina" },
        ] as const).map((f) => (
          <button key={f.key} onClick={() => setFilterType(f.key)} className={`snap-start flex-shrink-0 py-1.5 text-xs font-medium rounded-full transition-colors px-4 ${filterType === f.key ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* No bank connected — show empty state */}
      {!hasBankConnected && !isCheckingBank && (
        <div className="flex flex-col items-center justify-center py-16 border border-neutral-200 rounded-xl bg-white">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            <Landmark className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-base font-semibold text-black mb-2">Sin cuenta bancaria conectada</h3>
          <p className="text-sm text-neutral-400 text-center max-w-xs mb-6">Conecta tu cuenta bancaria para ver transacciones automaticas, saldo en tiempo real y analisis de flujo de caja.</p>
          <button
            onClick={() => window.location.href = "/bank"}
            className="flex items-center gap-2 h-10 px-5 bg-black text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <Landmark className="w-4 h-4" />
            Conectar Banco
          </button>
        </div>
      )}

      {/* Summary Cards — ONLY when bank connected */}
      {hasBankConnected && (
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="border-emerald-200 rounded-xl shadow-none">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <p className="text-[10px] text-neutral-500">Ingresos</p>
            </div>
            <p className="text-sm font-semibold text-emerald-700">{formatCurrency(totalIncome)}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 rounded-xl shadow-none">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-6 h-6 rounded-md bg-rose-100 flex items-center justify-center">
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <p className="text-[10px] text-neutral-500">Gastos</p>
            </div>
            <p className="text-sm font-semibold text-rose-700">{formatCurrency(totalExpense)}</p>
          </CardContent>
        </Card>
        {/* Balance = REAL bank account balance from Plaid */}
        <Card className="border-sky-200 rounded-xl shadow-none">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-6 h-6 rounded-md bg-sky-100 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5 text-sky-600" />
              </div>
              <p className="text-[10px] text-neutral-500">Balance Cuenta</p>
            </div>
            <p className="text-sm font-semibold text-sky-700">
              {formatCurrency(liveBalance)}
            </p>
          </CardContent>
        </Card>
      </div>
      )}



      {/* Transaction List — ONLY when bank connected */}
      {hasBankConnected && (
      <div className="space-y-0">
        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10">
            <Landmark className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-400">No hay transacciones este mes</p>
            <p className="text-xs text-neutral-400 mt-1">Presiona sincronizar para traer datos del banco</p>
          </div>
        ) : (
          transactions.map((tx: any) => (
            <div
              key={tx.id}
              className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50 px-1 rounded transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tx.type === "income" ? "bg-emerald-100" : "bg-rose-100"}`}>
                  {tx.type === "income" ? (
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-rose-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black truncate">{tx.description}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                    <span className="capitalize">{getCategoryLabel(tx.category ?? "")}</span>
                    <span>·</span>
                    <span>{tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString("es") : ""}</span>
                    {tx.accountNumber && (
                      <>
                        <span>·</span>
                        <span className="text-neutral-400">{tx.accountNumber}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span className={`text-sm font-semibold shrink-0 ml-3 ${tx.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
              </span>
            </div>
          ))
        )}
      </div>
      )}
    </AnimatedPage>
  );
}

function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    zelle_income: "Zelle Recibido",
    zelle_sent: "Zelle Enviado",
    deposit: "Deposito",
    cash_deposit: "Dep. Efectivo",
    cash_withdrawal: "Retiro ATM",
    subscription: "Suscripcion",
    transfer: "Transferencia",
    business_expense: "Negocio",
    gasolina: "Gasolina",
    home_expense: "Hogar",
    shopping: "Compras",
    cash_income: "Efectivo",
    other: "Otro",
  };
  return labels[cat] || cat;
}
