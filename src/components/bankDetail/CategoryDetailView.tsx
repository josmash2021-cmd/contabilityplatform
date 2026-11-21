import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  AlertCircle, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Banknote, Building2, CircleDollarSign, Fuel, HeartPulse,
  Loader2, Receipt, RotateCcw, Send, ShoppingBag, Trash2, TrendingUp, Tv, Utensils, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { bankDetailCopy } from "@/i18n/copy/bankDetail";
import { MerchantLogo } from "@/components/brand/MerchantLogo";

type Dir = "income" | "expense";

/** Category keys the bank sync stores, with the direction their money goes. */
const DIRECTION: Record<string, Dir> = {
  zelle_income: "income", transfer_income: "income", deposit: "income", cash_deposit: "income", cash_income: "income",
  general: "income", income: "income", paycheck: "income", refund: "income", investment: "income", interest: "income",
  cash_withdrawal: "expense", zelle_sent: "expense", subscription: "expense", transfer: "expense", medical: "expense",
  food: "expense", shopping: "expense", gasolina: "expense", loan: "expense", insurance: "expense", utilities: "expense",
  home_expense: "expense", business_expense: "expense", other: "expense",
};

const STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  zelle_income: { icon: Send, tone: "bg-purple-50 text-purple-600" },
  transfer_income: { icon: ArrowUpRight, tone: "bg-sky-50 text-sky-600" },
  deposit: { icon: Building2, tone: "bg-blue-50 text-blue-600" },
  cash_deposit: { icon: Banknote, tone: "bg-amber-50 text-amber-600" },
  cash_income: { icon: CircleDollarSign, tone: "bg-emerald-50 text-emerald-600" },
  paycheck: { icon: Banknote, tone: "bg-blue-50 text-blue-600" },
  zelle_sent: { icon: Send, tone: "bg-purple-50 text-purple-600" },
  cash_withdrawal: { icon: Banknote, tone: "bg-amber-50 text-amber-600" },
  subscription: { icon: Tv, tone: "bg-pink-50 text-pink-600" },
  shopping: { icon: ShoppingBag, tone: "bg-violet-50 text-violet-600" },
  home_expense: { icon: Utensils, tone: "bg-orange-50 text-orange-600" },
  food: { icon: Utensils, tone: "bg-orange-50 text-orange-600" },
  gasolina: { icon: Fuel, tone: "bg-orange-50 text-orange-600" },
  medical: { icon: HeartPulse, tone: "bg-red-50 text-red-600" },
  transfer: { icon: ArrowDownRight, tone: "bg-slate-100 text-slate-600" },
};

/** What a row from bank.listByCategory carries. */
type Row = {
  id: number | string; description: string; amount: string | number; type: string;
  transactionDate?: string | Date | null; isReversed?: boolean | number | null; bankName?: string | null;
  merchantName?: string | null; logoUrl?: string | null;
};

const money = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Bank dates are calendar days sent as UTC midnight: read them in UTC so they don't slip a day. */
const day = (d: Row["transactionDate"], locale: string) => (d ? new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const humanize = (key: string) => { const w = key.replace(/_/g, " ").trim(); return w ? w.charAt(0).toUpperCase() + w.slice(1) : key; };

export type CategoryDetailProps = {
  mode: "business" | "personal";
  /** Category labels for this mode (money in and money out). */
  labels: { income: Record<string, string>; expense: Record<string, string> };
  /** Where the bank page of this mode remembers its selected account (none: all accounts). */
  accountKey?: string;
  /** Where "back" goes when there's no page to go back to. */
  fallback: (month: string, year: string) => string;
};

/** 2.0 drill-down of one bank category: the period's total, its movements, and deleting one with a confirm. */
export function CategoryDetailView({ mode, labels, accountKey, fallback }: CategoryDetailProps) {
  const t = useCopy(bankDetailCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const { category = "" } = useParams<{ category: string }>();
  const [params] = useSearchParams();
  const utils = trpc.useUtils();

  const when = useMemo(() => {
    const now = new Date();
    const month = params.get("month") ?? String(now.getMonth() + 1);
    const year = params.get("year") ?? String(now.getFullYear());
    const current = Number(month) === now.getMonth() + 1 && Number(year) === now.getFullYear();
    const name = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
    return { month, year, label: current ? t.thisMonth : name.charAt(0).toUpperCase() + name.slice(1) };
  }, [params, locale, t.thisMonth]);
  const [wholeYear, setWholeYear] = useState(false);
  const [toDelete, setToDelete] = useState<Row | null>(null);

  // The bank page of this mode remembers which account is selected.
  const [accountId] = useState<number | undefined>(() => {
    if (!accountKey) return undefined;
    try { const v = localStorage.getItem(accountKey); return v ? Number(v) : undefined; } catch { return undefined; }
  });

  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { enabled: mode === "business", staleTime: 60_000 });
  const canEdit = !membership; // team members only read (the server refuses their changes anyway)

  const query = trpc.bank.listByCategory.useQuery(
    { category, year: Number(when.year), month: wholeYear ? undefined : Number(when.month), accountId },
    { enabled: !!category },
  );
  const rows = (query.data ?? []) as Row[];

  const dir: Dir = DIRECTION[category] ?? (/income|deposit|recib/.test(category) ? "income" : "expense");
  const label = labels[dir][category] || labels.income[category] || labels.expense[category] || humanize(category);
  const style = STYLE[category] ?? (dir === "income" ? { icon: TrendingUp, tone: "bg-emerald-50 text-emerald-600" } : { icon: Receipt, tone: "bg-slate-100 text-slate-600" });
  const Icon = style.icon;
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const periodLabel = wholeYear ? t.wholeYear(when.year) : when.label;

  const del = trpc.bank.delete.useMutation({
    onSuccess: () => { toast.success(t.deleted); setToDelete(null); void utils.bank.invalidate(); },
    onError: () => toast.error(t.deleteError),
  });

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback(when.month, when.year));
  };

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <button onClick={goBack} className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />{mode === "business" ? t.backBusiness : t.backPersonal}
        </button>

        <header className="flex items-start gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${style.tone}`}><Icon className="h-6 w-6" /></span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{dir === "income" ? t.income : t.expense}</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{label}</h1>
          </div>
        </header>

        <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <p className="text-xs font-medium text-slate-500">{t.total(periodLabel)}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${dir === "income" ? "text-emerald-700" : "text-slate-900"}`}>
              {dir === "income" ? "+" : "−"}{money(total)}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">{t.count(rows.length)}</p>
          </div>
          <div role="radiogroup" aria-label={t.period} className="inline-flex rounded-xl bg-slate-100 p-1">
            {[false, true].map((year) => (
              <button key={String(year)} role="radio" aria-checked={wholeYear === year} onClick={() => setWholeYear(year)}
                className={`h-10 rounded-lg px-4 text-sm font-semibold transition ${wholeYear === year ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                {year ? t.wholeYear(when.year) : when.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="cd-list">
          <div className="flex items-center justify-between gap-2">
            <h2 id="cd-list" className="font-semibold text-slate-900">{t.list}</h2>
            <Link to={mode === "business" ? "/transactions" : "/personal/transactions"} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
              {t.allMovements}<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {query.isLoading ? (
            <div className="mt-3 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : query.isError ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle className="h-4 w-4" />{t.error}
              <button onClick={() => void query.refetch()} className="font-semibold underline">{t.retry}</button>
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t.empty}</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {rows.map((r, i) => {
                const isIn = r.type === "income";
                const reversed = !!r.isReversed;
                // Some rows come straight from Plaid without a saved id; only saved ones can be deleted.
                const deletable = canEdit && Number.isInteger(Number(r.id)) && Number(r.id) > 0;
                return (
                  <li key={`${r.id}-${i}`} className="flex items-center gap-3 py-3">
                    {/* The merchant's original logo from Plaid; without one, the direction icon as before. */}
                    <MerchantLogo
                      name={r.merchantName || r.description}
                      logoUrl={r.logoUrl}
                      size={36}
                      className={reversed ? "opacity-50 grayscale" : undefined}
                      fallback={
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${reversed ? "bg-slate-100 text-slate-400" : isIn ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"}`}>
                          {reversed ? <RotateCcw className="h-4 w-4" /> : isIn ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        </span>
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium ${reversed ? "text-slate-400 line-through" : "text-slate-900"}`}>{r.description}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {day(r.transactionDate, locale)}{r.bankName ? ` · ${r.bankName}` : ""}{reversed ? ` · ${t.reversed}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${reversed ? "text-slate-400 line-through" : isIn ? "text-emerald-700" : "text-slate-900"}`}>
                      {isIn ? "+" : "−"}{money(Number(r.amount))}
                    </span>
                    {deletable && (
                      <button onClick={() => setToDelete(r)} aria-label={t.delete(r.description)} title={t.delete(r.description)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 sm:h-9 sm:w-9">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => { if (!open && !del.isPending) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{toDelete ? t.confirmText(toDelete.description, money(Number(toDelete.amount))) : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={del.isPending} className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); if (toDelete) del.mutate({ id: Number(toDelete.id) }); }}>
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatedPage>
  );
}
