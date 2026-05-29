import { useState, useRef, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  RefreshCw, Landmark, ChevronDown, TrendingUp, TrendingDown, Wallet,
  Receipt, CheckCircle, Search, Tv,
} from "lucide-react";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";

/** Account dropdown - avoids scroll issues */
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

  const selected = selectedId ? accounts.find((a) => String(a.id) === selectedId) : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-8 px-2.5 border border-neutral-200 rounded-md bg-white text-xs hover:border-neutral-300 transition-colors"
      >
        <Landmark className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="truncate max-w-[90px]">{selected ? selected.bankName : "Todas las cuentas"}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 py-1">
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
              !selectedId ? "bg-neutral-100 text-black font-medium" : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <Landmark className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Todas las cuentas</span>
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
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [showPlaidOverlay, setShowPlaidOverlay] = useState(false);
  const utils = trpc.useUtils();

  // Check if bank is connected
  const { data: bankConnection, isLoading: isCheckingBank } = trpc.bank.checkConnection.useQuery(undefined, {
    staleTime: 60000,
    refetchOnMount: true,
  });
  const hasBankConnected = bankConnection?.hasBank === true;

  // Fetch ALL accounts from Plaid (always try — if it fails we still have DB accounts)
  const { data: plaidAccountsData } = trpc.bank.getAllPlaidAccounts.useQuery(undefined, {
    staleTime: 60000,
  });

  // Fetch bank accounts from DB (ALWAYS — if accounts exist, user has a bank)
  const { data: dbAccounts } = trpc.bank.listAccounts.useQuery(undefined, {
    staleTime: 30000,
  });

  const plaidAccounts = plaidAccountsData?.accounts ?? [];
  // Use DB account IDs (not Plaid IDs) so filtering works correctly
  // bankTransactions.bankAccountId references the DB account id
  const accounts = plaidAccounts.length > 0
    ? plaidAccounts.map((pa: any) => {
        const dbMatch = (dbAccounts ?? []).find((dbAcc: any) => dbAcc.id === pa.id || dbAcc.plaidAccountId === pa.plaidAccountId);
        // Return with DB id so selectedAccountId matches bankTransactions.bankAccountId
        return dbMatch ? { ...pa, id: dbMatch.id, plaidAccountId: pa.plaidAccountId, currentBalance: dbMatch.currentBalance } : pa;
      })
    : (dbAccounts ?? []);

  // NO default account selection - user chooses or "All accounts" shows everything
  const effectiveAccountId = selectedAccountId;

  // Fetch bank transactions (only when bank is connected)
  const { data: monthData, isLoading: isLoadingBank } = trpc.bank.getMonthData.useQuery({
    year: parseInt(year),
    month: parseInt(month),
    accountId: effectiveAccountId ? parseInt(effectiveAccountId) : undefined,
  });

  const syncMutation = trpc.bank.syncTransactions.useMutation({
    onSuccess: (data) => {
      if (data.success && data.added && data.added > 0) {
        toast.success(`${data.added} transacciones sincronizadas`);
      }
      utils.bank.getMonthData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const allBankTransactions = monthData?.transactions ?? [];
  const accountFilteredTransactions = allBankTransactions;

  // ─── Filter helpers ───
  const isZelleRecibido = (t: any) => t.category === "zelle_income";
  const isZelleEnviado = (t: any) => t.category === "zelle_sent";
  const isCashDeposit = (t: any) => t.category === "cash_deposit";
  const isCashWithdrawal = (t: any) => t.category === "cash_withdrawal";
  const isDevolucion = (t: any) => {
    const n = (t.description || "").toLowerCase();
    return t.category === "refund" || n.includes("refund") || n.includes("devolucion") || n.includes("reembolso");
  };
  const P2P_KEYWORDS = ["paypal","cash app","venmo","square","clover","facebook pay"];
  const isP2P = (t: any) => {
    const n = (t.description || "").toLowerCase();
    return t.category === "transfer" || P2P_KEYWORDS.some(k => n.includes(k));
  };
  const GAS_BRANDS = [
    // Major brands
    "shell","exxon","chevron","bp","mobil","texaco","marathon","speedway",
    "valero","citgo","phillips 66","sinclair","gulf","esso","arco",
    // Regional chains
    "76","union 76","kum & go","kum and go","quik trip","quiktrip","race trac",
    "racetrac","sheetz","wawa","pilot","flying j","love's","maverik","thorntons",
    "stripes","murphy usa","casey's","caseys","holiday","cumberland farms",
    "royal farms","getgo","parkers","parker's","quick chek","quickchek",
    "stewart's","stewarts","oncue","p66","kennedy",
    // Warehouse/club gas
    "costco gas","walmart gas","sam's club gas","buc-ee's","bucees",
    "7-eleven gas","7 eleven gas",
    // Generic keywords
    "gasoline","petrol","fuel","gas station","gas sta","gasoline station"];
  const isGas = (t: any) => {
    // If backend already categorized as gasolina, include it regardless of description
    if (t.category === "gasolina") return true;
    const n = (t.description || "").toLowerCase();
    for (const b of GAS_BRANDS) {
      const regex = new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
      if (regex.test(n)) return true;
    }
    return false;
  };

  // ─── Streaming services: Netflix, Spotify, Disney, HBO, etc. ───
  const STREAMING_SERVICES = [
    "netflix","spotify","disney","hulu","hbo","max","paramount","peacock",
    "prime video","youtube premium","youtube tv","crunchyroll","twitch",
    "starz","showtime","amc+","apple tv","apple music","apple arcade",
    "amazon prime","netflix.com","disneyplus","hbomax",
  ];
  const isStreaming = (t: any) => {
    if (t.category === "subscription" || t.category === "membership") return true;
    const n = (t.description || "").toLowerCase();
    for (const s of STREAMING_SERVICES) {
      if (n.includes(s)) return true;
    }
    return false;
  };

  // ─── Apply bank filters ───
  const filteredBankTransactions =
    filterType === "all" ? accountFilteredTransactions :
    filterType === "income" ? accountFilteredTransactions.filter((t: any) => t.type === "income") :
    filterType === "expense" ? accountFilteredTransactions.filter((t: any) => t.type === "expense") :
    filterType === "devoluciones" ? accountFilteredTransactions.filter((t: any) => isDevolucion(t)) :
    filterType === "zelle_in" ? accountFilteredTransactions.filter((t: any) => isZelleRecibido(t)) :
    filterType === "zelle_out" ? accountFilteredTransactions.filter((t: any) => isZelleEnviado(t)) :
    filterType === "cash_deposit" ? accountFilteredTransactions.filter((t: any) => isCashDeposit(t)) :
    filterType === "cash_withdrawal" ? accountFilteredTransactions.filter((t: any) => isCashWithdrawal(t)) :
    filterType === "gasolina" ? accountFilteredTransactions.filter((t: any) => isGas(t)) :
    filterType === "streaming" ? accountFilteredTransactions.filter((t: any) => isStreaming(t)) :
    filterType === "p2p" ? accountFilteredTransactions.filter((t: any) => isP2P(t)) :
    accountFilteredTransactions;

  // Apply text search filter on top of type filters
  const searchFilteredTransactions = searchQuery.trim()
    ? filteredBankTransactions.filter((t: any) =>
        (t.description || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredBankTransactions;

  const displayTransactions = accounts.length > 0 ? searchFilteredTransactions : [];

  const totalIncome = accountFilteredTransactions
    .filter((t: any) => t.type === "income")
    .reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = accountFilteredTransactions
    .filter((t: any) => t.type === "expense")
    .reduce((s: number, t: any) => s + Number(t.amount), 0);

  const selectedAccount = accounts.find((a: any) => String(a.id) === effectiveAccountId);
  const liveBalance = parseFloat(selectedAccount?.currentBalance ?? "0");

  const filterButtons = [
    { key: "all", label: "Todos" },
    { key: "income", label: "Ingresos" },
    { key: "expense", label: "Gastos" },
    { key: "devoluciones", label: "Devoluciones" },
    { key: "zelle_in", label: "Zelle Recibidos" },
    { key: "zelle_out", label: "Zelle Enviados" },
    { key: "cash_deposit", label: "Dep. Efectivo" },
    { key: "cash_withdrawal", label: "Ret. Efectivo" },
    { key: "gasolina", label: "Gasolina" },
    { key: "streaming", label: "Streaming" },
    { key: "p2p", label: "P2P" },
  ];

  const filterTitle =
    filterType === "income" ? "Ingresos" :
    filterType === "expense" ? "Gastos" :
    filterType === "devoluciones" ? "Devoluciones" :
    filterType === "zelle_in" ? "Zelle Recibidos" :
    filterType === "zelle_out" ? "Zelle Enviados" :
    filterType === "cash_deposit" ? "Depósitos de Efectivo" :
    filterType === "cash_withdrawal" ? "Retiros de Efectivo" :
    filterType === "gasolina" ? "Gasolina" :
    filterType === "streaming" ? "Streaming (Netflix, Spotify, Disney, HBO, etc.)" :
    filterType === "p2p" ? "P2P (Cash App, Venmo, Square, Clover, PayPal)" :
    "Transacciones";

  const isLoading = isLoadingBank;

  // ─── NOT CONNECTED banner (non-blocking) ───
  // Only show if NO accounts exist — if there are accounts, user has a bank connected
  const showConnectBanner = accounts.length === 0;

  return (
    <AnimatedPage className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-black">{filterTitle}</h1>
          <p className="text-xs text-neutral-500">
            {searchFilteredTransactions.length} de {accountFilteredTransactions.length} registros
            {searchQuery.trim() ? ` · Buscando "${searchQuery}"` : ""}
            {" · "}{monthData?.monthName ?? ""}
          </p>
        </div>
      </div>

      {/* Connect bank banner — only when no bank AND no data */}
      {showConnectBanner && (
        <Card className="border-neutral-200 rounded-xl shadow-none mb-4">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mb-3">
              <Landmark className="w-6 h-6 text-neutral-400" />
            </div>
            <h3 className="text-base font-semibold text-black mb-1">Sin cuenta bancaria conectada</h3>
            <p className="text-xs text-neutral-400 max-w-sm mb-4">Conecta tu cuenta bancaria para sincronizar transacciones automaticas.</p>
            <Button onClick={() => setShowPlaidOverlay(true)} className="bg-black hover:bg-neutral-800 text-white rounded-lg h-9 px-5 text-xs">
              <Landmark className="w-3.5 h-3.5 mr-2" /> Conectar Banco
            </Button>
          </CardContent>
        </Card>
      )}
      {showConnectBanner && showPlaidOverlay && <PlaidLinkOverlay onClose={() => setShowPlaidOverlay(false)} />}

      {/* Controls: dropdown, month, year, sync */}
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

          {/* Search input */}
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar en descripciones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-3 text-xs border border-neutral-200 rounded-lg bg-white focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-200 transition-colors"
            />
          </div>

          {/* Filter buttons */}
          <div
            className="flex bg-gray-100 rounded-xl p-1 mb-4 gap-1 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
            {(filterButtons as const).map((f: any) => (
              <button
                key={f.key}
                onClick={() => setFilterType(f.key)}
                className={`snap-start flex-shrink-0 py-1.5 text-xs font-medium rounded-full transition-colors px-4 ${filterType === f.key ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
              >
                {f.label}
              </button>
            ))}
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
            <Card className="border-sky-200 rounded-xl shadow-none">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded-md bg-sky-100 flex items-center justify-center">
                    <Wallet className="w-3.5 h-3.5 text-sky-600" />
                  </div>
                  <p className="text-[10px] text-neutral-500">Balance Cuenta</p>
                </div>
                <p className="text-sm font-semibold text-sky-700">{formatCurrency(liveBalance)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Transaction List */}
          <div className="space-y-0">
            {isLoading ? (
              <div className="space-y-2 py-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : displayTransactions.length === 0 ? (
              <div className="text-center py-10">
                <Receipt className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                <p className="text-sm text-neutral-400">No hay transacciones este mes</p>
                <p className="text-xs text-neutral-400 mt-1">Presiona sincronizar para traer datos del banco</p>
              </div>
            ) : (
              displayTransactions.map((tx: any) => {
                const txDate = tx.transactionDate ? new Date(tx.transactionDate) : null;
                const dateStr = txDate ? txDate.toLocaleDateString("es", { day: "numeric", month: "short" }) : "";
                const timeStr = txDate ? txDate.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50 px-1 rounded transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal text-black truncate">{tx.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-neutral-400">{dateStr} · {timeStr}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 capitalize">
                          {getCategoryLabel(tx.category ?? "")}
                        </span>
                      </div>
                    </div>
                    <span className={`text-sm font-medium shrink-0 ml-3 ${
                      tx.type === "income" ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
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
    transfer: "P2P",
    p2p: "P2P",
    business_expense: "Negocio",
    gasolina: "Gasolina",
    home_expense: "Hogar",
    shopping: "Compras",
    cash_income: "Efectivo",
    sale: "Venta",
    refund: "Devolucion",
    other: "Otro",
  };
  return labels[cat] || cat;
}
      