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
  Fuel, Tag,
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
  const qpMonth = searchParams.get("month");
  const qpYear = searchParams.get("year");
  const qpAccount = searchParams.get("account");

  const [year, setYear] = useState(qpYear ?? String(now.getFullYear()));
  const [month, setMonth] = useState(qpMonth ?? String(now.getMonth() + 1));
  const [filterType, setFilterType] = useState(qpType ?? "all");
  const [selectedAccountId, setSelectedAccountId] = useState<string>(qpAccount ?? "");
  const utils = trpc.useUtils();

  // Fetch bank accounts (same as Dashboard)
  const { data: accounts } = trpc.bank.listAccounts.useQuery(undefined, {
    onSuccess: (data) => {
      // Only auto-select first account if no account from query params
      if (data && data.length > 0 && !selectedAccountId && !qpAccount) {
        setSelectedAccountId(String(data[0].id));
      }
    },
  });

  const effectiveAccountId = selectedAccountId || (accounts?.[0] ? String(accounts[0].id) : "");

  // Use SAME endpoint as Dashboard - bank.getMonthData
  const { data: monthData, isLoading } = trpc.bank.getMonthData.useQuery({
    year: parseInt(year),
    month: parseInt(month),
    accountId: effectiveAccountId ? parseInt(effectiveAccountId) : undefined,
  });

  // Re-categorize existing transactions
  const recatMutation = trpc.bank.recategorize.useMutation({
    onSuccess: (data) => {
      if (data.updated > 0) toast.success(`${data.updated} transacciones re-categorizadas`);
      utils.bank.getMonthData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

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
  const isGas = (t: any) => {
    const n = (t.description || "").toLowerCase();
    return t.category === "gasolina" || n.includes("shell") || n.includes("exxon") || n.includes("chevron") || n.includes("bp") || n.includes("mobil") || n.includes("texaco") || n.includes("marathon") || n.includes("circle k") || n.includes("speedway") || n.includes("sheetz") || n.includes("wawa") || n.includes("valero") || n.includes("citgo") || n.includes("phillips") || n.includes("gas");
  };
  const isZelle = (t: any) => t.category === "zelle_income" || t.category === "zelle_sent";
  const isTransfer = (t: any) => t.category === "transfer";
  const transactions =
    filterType === "all" ? allTransactions :
    filterType === "zelle" ? allTransactions.filter((t: any) => isZelle(t)) :
    filterType === "transfers" ? allTransactions.filter((t: any) => isTransfer(t)) :
    filterType === "gasolina" ? allTransactions.filter((t: any) => isGas(t)) :
    allTransactions;

  const totalIncome = allTransactions
    .filter((t: any) => t.type === "income")
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = allTransactions
    .filter((t: any) => t.type === "expense")
    .reduce((s: number, t: any) => s + Number(t.amount), 0);

  // Balance REAL: always use first account from listAccounts
  // The DB select() returns full rows including currentBalance
  const liveBalance = accounts && accounts.length > 0
    ? parseFloat(accounts[0].currentBalance ?? "0")
    : 0;

  return (
    <AnimatedPage className="p-4 lg:p-6">
      {/* Header with filter title */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-black">
            {filterType === "zelle" ? "Zelle" : filterType === "transfers" ? "Transferencias" : filterType === "gasolina" ? "Gasolina" : "Transacciones"}
          </h1>
          <p className="text-xs text-neutral-500">{allTransactions.length} registros · {monthData?.monthName ?? ""}</p>
        </div>
      </div>

      {/* Quick filter buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button onClick={() => setFilterType("all")} variant={filterType === "all" ? "default" : "outline"} size="sm" className={`h-8 text-xs rounded-lg ${filterType === "all" ? "bg-black text-white" : "border-neutral-200"}`}>Todos</Button>
        <Button onClick={() => setFilterType("zelle")} variant={filterType === "zelle" ? "default" : "outline"} size="sm" className={`h-8 text-xs rounded-lg ${filterType === "zelle" ? "bg-purple-600 text-white" : "border-neutral-200"}`}>Zelle</Button>
        <Button onClick={() => setFilterType("transfers")} variant={filterType === "transfers" ? "default" : "outline"} size="sm" className={`h-8 text-xs rounded-lg ${filterType === "transfers" ? "bg-amber-600 text-white" : "border-neutral-200"}`}>Transferencias</Button>
        <Button onClick={() => setFilterType("gasolina")} variant={filterType === "gasolina" ? "default" : "outline"} size="sm" className={`h-8 text-xs rounded-lg ${filterType === "gasolina" ? "bg-orange-600 text-white" : "border-neutral-200"}`}>
          <Fuel className="w-3.5 h-3.5 mr-1" />Gasolina
        </Button>
      </div>

      {/* Summary Cards */}
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



      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
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
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][i]}
              </SelectItem>
            ))}
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
        <Button
          onClick={() => recatMutation.mutate()}
          disabled={recatMutation.isPending}
          variant="outline"
          size="sm"
          title="Actualizar categorias"
          className="h-8 px-2 border-neutral-200"
        >
          {recatMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Transaction List */}
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
    </AnimatedPage>
  );
}

function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    zelle_income: "Zelle",
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
