import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Trash2, ArrowLeft, Search } from "lucide-react";

export default function BankTransactions() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnMonth = searchParams.get("month") ?? String(new Date().getMonth() + 1);
  const returnYear = searchParams.get("year") ?? String(new Date().getFullYear());
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");

  const { data: transactions, isLoading } = trpc.bank.listTransactions.useQuery();

  const deleteMut = trpc.bank.delete.useMutation({
    onSuccess: () => { toast.success("Eliminada"); utils.invalidate(); },
  });

  const filtered = (transactions ?? []).filter((tx: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      tx.description?.toLowerCase().includes(q) ||
      tx.category?.toLowerCase().includes(q) ||
      tx.amount?.toString().includes(q)
    );
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      {/* ── HEADER ── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/bank?month=${returnMonth}&year=${returnYear}`)}
          className="h-9 w-9 p-0 rounded-lg text-neutral-400 hover:text-black"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-medium text-black">Todas las Transacciones</h1>
          <p className="text-sm text-neutral-400">
            {transactions?.length ?? 0} transacciones en total
          </p>
        </div>
      </div>

      {/* ── SEARCH ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Buscar por descripcion, categoria o monto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-neutral-300 transition-all"
        />
      </div>

      {/* ── TRANSACTIONS LIST ── */}
      <Card className="p-5 border border-neutral-200 rounded-xl shadow-none">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-neutral-400 py-8 text-center">
            {search.trim() ? "No se encontraron transacciones." : "No hay transacciones."}
          </p>
        ) : (
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div>
              {filtered.map((tx: any) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0 group"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold w-3 ${
                        tx.type === "income" ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {tx.type === "income" ? "+" : "-"}
                    </span>
                    <div>
                      <p className="text-sm text-neutral-800">{tx.description}</p>
                      <p className="text-[10px] text-neutral-400">
                        {tx.category} &middot;{" "}
                        {tx.transactionDate
                          ? new Date(tx.transactionDate).toLocaleDateString("es")
                          : ""}
                        {" "}&middot;{" "}
                        {tx.bankName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        tx.type === "income" ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {tx.type === "income" ? "+" : "-"}
                      {formatCurrency(tx.amount)}
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
      </Card>
    </div>
  );
}
