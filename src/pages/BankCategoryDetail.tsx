import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Calendar, LayoutList } from "lucide-react";

const categoryMeta: Record<string, { label: string; type: "income" | "expense" }> = {
  zelle_income: { label: "Zelle Recibidos", type: "income" },
  deposit: { label: "Depositos", type: "income" },
  cash_deposit: { label: "Depositos de Efectivo", type: "income" },
  cash_withdrawal: { label: "Retiros de Efectivo", type: "expense" },
  zelle_sent: { label: "Zelle Enviados", type: "expense" },
  subscription: { label: "Suscripciones", type: "expense" },
  transfer: { label: "Transferencias", type: "expense" },
};

function getCategoryMeta(category: string): { label: string; type: "income" | "expense" } {
  if (categoryMeta[category]) return categoryMeta[category];
  // Fallback for unknown categories - infer type from common patterns
  const isIncome = category.includes("income") || category.includes("deposit") || category.includes("recib");
  return {
    label: category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    type: isIncome ? "income" : "expense",
  };
}

export default function BankCategoryDetail() {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnMonth = searchParams.get("month") ?? String(new Date().getMonth() + 1);
  const returnYear = searchParams.get("year") ?? String(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(true);

  // Generate month label: "Este mes" if current, otherwise "Feb 26", "Ene 25", etc.
  const now = new Date();
  const isCurrentMonth = parseInt(returnMonth) === (now.getMonth() + 1) && parseInt(returnYear) === now.getFullYear();
  const monthLabel = isCurrentMonth
    ? "Este mes"
    : new Date(parseInt(returnYear), parseInt(returnMonth) - 1, 1).toLocaleDateString("es", { month: "short", year: "2-digit" }).replace(".", "").replace(" ", " ");

  const meta = getCategoryMeta(category || "");

  // Get selected account ID from localStorage (set by Bank page)
  const selectedAccountId = (() => {
    try { return localStorage.getItem("bank_selected_account_id"); } catch { return null; }
  })();
  const accountIdNum = selectedAccountId ? parseInt(selectedAccountId) : undefined;

  const { data: allTransactions, isLoading: loadingAll } = trpc.bank.listByCategory.useQuery(
    { category: category || "", accountId: accountIdNum },
    { enabled: !!category },
  );

  const { data: monthTransactions, isLoading: loadingMonth } = trpc.bank.listByCategory.useQuery(
    { category: category || "", year: parseInt(returnYear), month: parseInt(returnMonth), accountId: accountIdNum },
    { enabled: !!category && filterMonth },
  );

  const transactions = filterMonth ? monthTransactions : allTransactions;
  const isLoading = filterMonth ? loadingMonth : loadingAll;

  const allTotal = (allTransactions ?? []).reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
  const monthTotal = (monthTransactions ?? []).reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
  const displayTotal = filterMonth ? monthTotal : allTotal;
  const displayCount = filterMonth ? (monthTransactions ?? []).length : (allTransactions ?? []).length;

  const utils = trpc.useUtils();
  const deleteMut = trpc.bank.delete.useMutation({
    onSuccess: () => { toast.success("Eliminada"); utils.invalidate(); },
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/bank?month=${returnMonth}&year=${returnYear}`)} className="text-neutral-500 hover:text-black text-sm">
        <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Volver al Banco
      </Button>

      <div>
        <p className="text-xs text-neutral-400 uppercase tracking-wider mb-1">
          {meta.type === "income" ? "Ingresos" : "Gastos"}
        </p>
        <h1 className="text-xl font-medium text-black">{meta.label}</h1>
        <div className="flex gap-6 mt-3">
          <div>
            <p className="text-xs text-neutral-400">Total</p>
            <p className={`text-2xl font-semibold ${meta.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
              {meta.type === "income" ? "+" : "-"}{formatCurrency(displayTotal)}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">Transacciones</p>
            <p className="text-2xl font-semibold text-black">{displayCount}</p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setFilterMonth(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filterMonth ? "bg-black text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> {monthLabel}
          </button>
          <button
            onClick={() => setFilterMonth(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              !filterMonth ? "bg-black text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" /> Resumen del Ano
          </button>
        </div>
      </div>

      <hr className="border-neutral-100" />

      <div>
        <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">
          Transacciones {filterMonth ? `· ${monthLabel}` : "· Resumen del Ano"}
        </p>
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : (transactions ?? []).length === 0 ? (
          <p className="text-sm text-neutral-400 py-4">No hay transacciones en esta categoria.</p>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-0">
              {(transactions ?? []).map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between py-3 border-b border-neutral-50 last:border-0 group">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${tx.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                      {tx.type === "income" ? "+" : "-"}
                    </span>
                    <div>
                      <p className="text-sm text-neutral-800">{tx.description}</p>
                      <p className="text-[10px] text-neutral-400">
                        {tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString("es") : ""}
                        {tx.importedFrom === "plaid" && " · Sync"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${tx.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
                      {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-neutral-300 hover:text-red-500"
                      onClick={() => deleteMut.mutate({ id: tx.id })}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
