import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft, Trash2, Calendar, LayoutList, RotateCcw,
  Send, ArrowUpRight, ArrowDownRight, Building2, Banknote,
  CircleDollarSign, TrendingUp, TrendingDown, ShoppingBag,
  Utensils, Fuel, Tv, Receipt, HeartPulse,
} from "lucide-react";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalCopy, type PersonalCopy } from "@/i18n/copy/personal";

// ─── Category metadata (mirrors PersonalDashboard) ───
const INCOME_CATS: Record<string, { icon: typeof TrendingUp; iconBg: string; iconColor: string }> = {
  zelle_income: { icon: Send, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  transfer_income: { icon: ArrowUpRight, iconBg: "bg-sky-100", iconColor: "text-sky-600" },
  deposit: { icon: Building2, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  cash_deposit: { icon: Banknote, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  cash_income: { icon: CircleDollarSign, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  income: { icon: TrendingUp, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  general: { icon: TrendingUp, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  income: { icon: TrendingUp, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
  paycheck: { icon: Banknote, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  transfer: { icon: ArrowUpRight, iconBg: "bg-sky-100", iconColor: "text-sky-600" },
};

const EXPENSE_CATS: Record<string, { icon: typeof TrendingDown; iconBg: string; iconColor: string }> = {
  zelle_sent: { icon: Send, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  cash_withdrawal: { icon: Banknote, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  subscription: { icon: Tv, iconBg: "bg-pink-100", iconColor: "text-pink-600" },
  shopping: { icon: ShoppingBag, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
  home_expense: { icon: Utensils, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
  business_expense: { icon: Receipt, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
  gasolina: { icon: Fuel, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
  transfer: { icon: ArrowDownRight, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
  other: { icon: Receipt, iconBg: "bg-neutral-100", iconColor: "text-neutral-600" },
  medical: { icon: HeartPulse, iconBg: "bg-red-100", iconColor: "text-red-600" },
  food: { icon: Utensils, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
};

function getCategoryMeta(category: string, labels: PersonalCopy["categories"]): {
  label: string;
  type: "income" | "expense";
  icon: typeof TrendingUp;
  iconBg: string;
  iconColor: string;
} {
  const income = INCOME_CATS[category];
  if (income) {
    return { label: labels.income[category] || category, type: "income", icon: income.icon, iconBg: income.iconBg, iconColor: income.iconColor };
  }
  const expense = EXPENSE_CATS[category];
  if (expense) {
    return { label: labels.expense[category] || category, type: "expense", icon: expense.icon, iconBg: expense.iconBg, iconColor: expense.iconColor };
  }
  // Fallback
  const isIncome = category.includes("income") || category.includes("deposit");
  return {
    label: category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    type: isIncome ? "income" : "expense",
    icon: isIncome ? TrendingUp : TrendingDown,
    iconBg: isIncome ? "bg-emerald-100" : "bg-rose-100",
    iconColor: isIncome ? "text-emerald-600" : "text-rose-600",
  };
}

export default function PersonalCategoryDetail() {
  const { category } = useParams<{ category: string }>();
  const { lang } = useLang();
  const { categoryDetail: t, common, categories } = useCopy(personalCopy);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnMonth = searchParams.get("month") ?? String(new Date().getMonth() + 1);
  const returnYear = searchParams.get("year") ?? String(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(true);

  // Generate month label
  const now = new Date();
  const isCurrentMonth = parseInt(returnMonth) === (now.getMonth() + 1) && parseInt(returnYear) === now.getFullYear();
  const monthLabel = isCurrentMonth
    ? common.thisMonth
    : new Date(parseInt(returnYear), parseInt(returnMonth) - 1, 1).toLocaleDateString(intlLocale(lang), { month: "short", year: "2-digit" }).replace(".", "").replace(" ", " ");

  const meta = getCategoryMeta(category || "", categories);
  const Icon = meta.icon;

  // Get selected account ID from localStorage (set by PersonalDashboard)
  const selectedAccountId = (() => {
    try { return localStorage.getItem("personal_selected_account_id"); } catch { return null; }
  })();
  const accountIdNum = selectedAccountId ? parseInt(selectedAccountId) : undefined;

  const { data: allTransactions, isLoading: loadingAll } = trpc.bank.listByCategory.useQuery(
    { category: category || "", year: parseInt(returnYear), accountId: accountIdNum },
    { enabled: !!category && !filterMonth },
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
    onSuccess: () => { toast.success(t.deleted); utils.invalidate(); },
  });

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={() => navigate(`/personal?month=${returnMonth}&year=${returnYear}`)}
        className="text-neutral-500 hover:text-black text-sm -ml-2"
      >
        <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> {t.back}
      </Button>

      {/* Header with icon and title */}
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl ${meta.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-6 h-6 ${meta.iconColor}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-neutral-400 uppercase tracking-wider mb-0.5">
            {meta.type === "income" ? common.income : common.expenses}
          </p>
          <h1 className="text-xl font-semibold text-black">{meta.label}</h1>
          <div className="flex gap-6 mt-3">
            <div>
              <p className="text-xs text-neutral-400">{t.total}</p>
              <p className={`text-2xl font-semibold ${meta.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
                {meta.type === "income" ? "+" : "-"}{formatCurrency(displayTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">{common.transactions}</p>
              <p className="text-2xl font-semibold text-black">{displayCount}</p>
            </div>
          </div>

          {/* Filter buttons */}
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
              <LayoutList className="w-3.5 h-3.5" /> {returnYear}
            </button>
          </div>
        </div>
      </div>

      <hr className="border-neutral-100" />

      {/* Transactions list */}
      <Card className="border-neutral-200 rounded-xl shadow-none">
        <div className="p-4 border-b border-neutral-100">
          <p className="text-xs text-neutral-400 uppercase tracking-wider">
            {common.transactions} {filterMonth ? `· ${monthLabel}` : `· ${returnYear}`}
          </p>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
            </div>
          ) : (transactions ?? []).length === 0 ? (
            <div className="text-center py-10">
              <Icon className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-400">{t.empty}</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-0">
                {(transactions ?? []).map((tx: any) => (
                  <div
                    key={tx.id}
                    className={`flex items-center justify-between py-3 border-b border-neutral-50 last:border-0 group ${tx.isReversed ? "opacity-50 bg-neutral-50" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {tx.isReversed ? (
                        <RotateCcw className="w-4 h-4 text-neutral-400 shrink-0" />
                      ) : (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.type === "income" ? "bg-emerald-100" : "bg-rose-100"}`}>
                          <span className={`text-xs font-medium ${meta.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                            {tx.type === "income" ? "+" : "-"}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${tx.isReversed ? "text-neutral-400 line-through" : "text-neutral-800"}`}>
                          {tx.description}
                        </p>
                        <p className="text-[10px] text-neutral-400">
                          {tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString(intlLocale(lang)) : ""}
                          {tx.importedFrom === "plaid" && ` · ${t.sync}`}
                          {tx.isReversed && ` · ${t.reversed}`}
                          {tx.bankName && ` · ${tx.bankName}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className={`text-sm font-medium ${tx.isReversed ? "text-neutral-400 line-through" : tx.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
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
      </Card>
    </div>
  );
}
