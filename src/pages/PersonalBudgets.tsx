import { useId, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle, ArrowDownRight, Banknote, CheckCircle2, ChevronLeft, ChevronRight, Fuel, HeartPulse, Landmark, Lock,
  Pencil, PiggyBank, Receipt, Send, ShoppingBag, Trash2, Tv, Utensils, XCircle, type LucideIcon,
} from "lucide-react";
import type { AppRouter } from "../../api/router";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { personalCopy } from "@/i18n/copy/personal";
import { budgetsCopy, budgetCategoryLabel, type BudgetsCopy } from "@/i18n/copy/budgets";

type Budgets = inferRouterOutputs<AppRouter>["personal"]["listBudgets"];
type BudgetItem = Budgets["items"][number];
type Status = NonNullable<BudgetItem["status"]>;
type Month = { year: number; month: number };

/** Same ceiling as the server (api/lib/budgets.ts MAX_BUDGET_LIMIT). */
const MAX_LIMIT = 10_000_000;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  shopping: ShoppingBag,
  home_expense: Utensils,
  food: Utensils,
  gasolina: Fuel,
  subscription: Tv,
  medical: HeartPulse,
  zelle_sent: Send,
  cash_withdrawal: Banknote,
  transfer: ArrowDownRight,
  business_expense: Receipt,
  other: Receipt,
};

const STATUS_STYLE: Record<Status, { bar: string; badge: string; border: string; icon: LucideIcon }> = {
  ok: { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", border: "border-neutral-200", icon: CheckCircle2 },
  near: { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-800", border: "border-amber-300", icon: AlertTriangle },
  over: { bar: "bg-red-500", badge: "bg-red-50 text-red-700", border: "border-red-300", icon: XCircle },
};

const monthIndex = (m: Month) => m.year * 12 + (m.month - 1);
const fromIndex = (i: number): Month => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
const MIN_MONTH_INDEX = monthIndex({ year: 2000, month: 1 });

/** The month in the URL (?year=&month=) when it's valid and not in the future; otherwise this month. */
function monthFromParams(params: URLSearchParams, today: Month): Month {
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return today;
  const picked = { year, month };
  const i = monthIndex(picked);
  return i < MIN_MONTH_INDEX || i > monthIndex(today) ? today : picked;
}

/** Whole dollars without cents ("500"), otherwise two decimals ("499.50"): what goes in the limit input. */
function amountInput(n: number | null): string {
  if (n === null || !(n > 0)) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function CategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Receipt;
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100" aria-hidden="true">
      <Icon className="h-4 w-4 text-neutral-600" />
    </span>
  );
}

export default function PersonalBudgets() {
  const t = useCopy(budgetsCopy);
  const { common, categories } = useCopy(personalCopy);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [today] = useState<Month>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [params, setParams] = useSearchParams();
  const selected = monthFromParams(params, today);
  const isCurrentMonth = monthIndex(selected) === monthIndex(today);
  const [editing, setEditing] = useState<string | null>(null);

  const plan = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const planLacksBudgets = plan.data ? !plan.data.features.includes("budgets") : false;
  const budgets = trpc.personal.listBudgets.useQuery(
    { year: selected.year, month: selected.month },
    {
      enabled: !planLacksBudgets,
      staleTime: 2 * 60_000,
      retry: (count, err) => err.data?.code !== "FORBIDDEN" && count < 1,
    },
  );
  const locked = planLacksBudgets || budgets.error?.data?.code === "FORBIDDEN";

  const label = (category: string) => budgetCategoryLabel(category, categories.expense);

  const setBudget = trpc.personal.setBudget.useMutation({
    onSuccess: (res) => {
      toast.success(res.limit === null ? t.removed(label(res.category)) : t.saved(label(res.category)));
      setEditing(null);
      void utils.personal.listBudgets.invalidate();
    },
    onError: (e) => toast.error(e.message || t.error),
  });
  const save = (category: string, limit: number | null) => setBudget.mutate({ category, limit });

  const goTo = (m: Month) => {
    setEditing(null);
    const i = Math.min(Math.max(monthIndex(m), MIN_MONTH_INDEX), monthIndex(today));
    if (i === monthIndex(today)) setParams({}, { replace: true });
    else {
      const next = fromIndex(i);
      setParams({ year: String(next.year), month: String(next.month) }, { replace: true });
    }
  };

  if (locked) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100"><Lock className="h-5 w-5 text-neutral-500" aria-hidden="true" /></span>
          <h1 className="mt-4 text-lg font-semibold text-black">{t.locked.title}</h1>
          <p className="mt-2 text-sm text-neutral-600">{t.locked.text}</p>
          <Button className="mt-5 w-full bg-black text-white hover:bg-neutral-800" onClick={() => navigate("/settings")}>{t.locked.cta}</Button>
        </div>
      </AnimatedPage>
    );
  }

  const data = budgets.data;
  const items = data?.items ?? [];
  const budgeted = items.filter((i) => i.limit !== null);
  const spentUnbudgeted = items.filter((i) => i.limit === null);
  const listed = new Set(items.map((i) => i.category));
  // Categories without a limit: the ones with spending this month (biggest first), then the usual ones with none yet.
  const unbudgeted: Array<{ category: string; spent: number; suggestedLimit: number | null }> = [
    ...spentUnbudgeted,
    ...Object.keys(categories.expense).filter((k) => !listed.has(k)).map((category) => ({ category, spent: 0, suggestedLimit: null })),
  ];
  const suggestions = spentUnbudgeted.filter((i) => i.suggestedLimit !== null).slice(0, 3);
  const monthLabel = `${common.months[selected.month - 1]} ${selected.year}`;

  return (
    <AnimatedPage className="p-4 lg:p-6">
      {/* Header + month selector */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-black">{t.title}</h1>
          <p className="text-xs text-neutral-500">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={t.month.label}>
          <Button
            variant="outline" size="icon" className="h-9 w-9 shrink-0 border-neutral-200"
            aria-label={t.month.prev} disabled={monthIndex(selected) <= MIN_MONTH_INDEX}
            onClick={() => goTo(fromIndex(monthIndex(selected) - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[8.5rem] text-center text-sm font-medium text-black" aria-live="polite">{monthLabel}</p>
          <Button
            variant="outline" size="icon" className="h-9 w-9 shrink-0 border-neutral-200"
            aria-label={t.month.next} disabled={isCurrentMonth}
            onClick={() => goTo(fromIndex(monthIndex(selected) + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-neutral-600" onClick={() => goTo(today)}>{t.month.current}</Button>
          )}
        </div>
      </div>

      {budgets.isLoading ? (
        <div className="space-y-3" role="status" aria-label={t.loading}>
          <Skeleton className="h-20 rounded-xl" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
        </div>
      ) : budgets.isError || !data ? (
        <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-neutral-600" role="alert">{t.error}</p>
            <Button variant="outline" size="sm" onClick={() => void budgets.refetch()}>{t.retry}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {!data.bankConnected && (
            <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100" aria-hidden="true"><Landmark className="h-4 w-4 text-neutral-500" /></span>
                  <p className="text-sm text-neutral-600">{t.noBank.text}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0 self-start sm:self-auto">
                  <Link to="/personal/bank">{t.noBank.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {budgeted.length === 0 ? (
            /* Empty state: suggest the first budgets from the biggest spending categories */
            <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100" aria-hidden="true"><PiggyBank className="h-5 w-5 text-neutral-500" /></span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-black">{t.empty.title}</h2>
                    <p className="mt-0.5 text-xs text-neutral-500">{suggestions.length > 0 ? t.empty.withSpending : t.empty.noSpending}</p>
                  </div>
                </div>
                {suggestions.length > 0 && (
                  <ul className="mt-4 divide-y divide-neutral-100">
                    {suggestions.map((s) => {
                      const amount = formatCurrency(s.suggestedLimit ?? 0);
                      return (
                        <li key={s.category} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <CategoryIcon category={s.category} />
                            <div className="min-w-0">
                              <p className="truncate text-sm text-black">{label(s.category)}</p>
                              <p className="text-[11px] text-neutral-500">{t.spentThisMonth(formatCurrency(s.spent))}</p>
                            </div>
                          </div>
                          <Button
                            size="sm" className="h-8 shrink-0 bg-black text-white hover:bg-neutral-800"
                            aria-label={t.empty.useAria(label(s.category), amount)}
                            disabled={setBudget.isPending}
                            onClick={() => save(s.category, s.suggestedLimit)}
                          >
                            {t.empty.use(amount)}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : (
            <section aria-labelledby="budgets-title" className="space-y-3">
              {/* Summary */}
              <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
                <CardContent className="flex flex-wrap items-end justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-500">{t.summary.label}</p>
                    <p className="text-lg font-semibold text-black">
                      {formatCurrency(data.totals.spent)} <span className="text-sm font-normal text-neutral-500">{t.summary.of(formatCurrency(data.totals.limit))}</span>
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {t.summary.count(data.totals.count)}
                    {data.totals.near > 0 && ` · ${t.summary.near(data.totals.near)}`}
                    {data.totals.over > 0 && ` · ${t.summary.over(data.totals.over)}`}
                  </p>
                </CardContent>
              </Card>
              <h2 id="budgets-title" className="sr-only">{t.budgetsTitle}</h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {budgeted.map((item) => (
                  <li key={item.category} className="min-w-0">
                    <BudgetCard
                      item={item}
                      label={label(item.category)}
                      t={t}
                      editing={editing === item.category}
                      pending={setBudget.isPending}
                      onEdit={() => setEditing(item.category)}
                      onCancel={() => setEditing(null)}
                      onSave={(limit) => save(item.category, limit)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Categories without a limit */}
          {unbudgeted.length > 0 && (
            <Card className="rounded-xl border-neutral-200 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-black">{t.othersTitle}</CardTitle>
                <p className="text-[11px] text-neutral-500">{t.othersText}</p>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y divide-neutral-100">
                  {unbudgeted.map((u) => (
                    <li key={u.category} className="py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <CategoryIcon category={u.category} />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-black">{label(u.category)}</p>
                            <p className="text-[11px] text-neutral-500">{u.spent > 0 ? t.spentThisMonth(formatCurrency(u.spent)) : t.noSpending}</p>
                          </div>
                        </div>
                        {editing !== u.category && (
                          <Button
                            variant="outline" size="sm" className="h-8 shrink-0 border-neutral-200 text-xs"
                            aria-label={t.setAria(label(u.category))}
                            onClick={() => setEditing(u.category)}
                          >
                            {t.setLimit}
                          </Button>
                        )}
                      </div>
                      {editing === u.category && (
                        <div className="mt-3">
                          <LimitEditor
                            label={label(u.category)}
                            initial={amountInput(u.suggestedLimit)}
                            t={t}
                            pending={setBudget.isPending}
                            onSave={(limit) => save(u.category, limit)}
                            onCancel={() => setEditing(null)}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AnimatedPage>
  );
}

function BudgetCard({ item, label, t, editing, pending, onEdit, onCancel, onSave }: {
  item: BudgetItem;
  label: string;
  t: BudgetsCopy;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (limit: number | null) => void;
}) {
  const status: Status = item.status ?? "ok";
  const style = STATUS_STYLE[status];
  const StatusIcon = style.icon;
  const percent = item.percent ?? 0;
  const remaining = item.remaining ?? 0;
  const limit = item.limit ?? 0;

  return (
    <Card className={`h-full gap-0 rounded-xl bg-white py-0 shadow-none ${style.border}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CategoryIcon category={item.category} />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-black">{label}</h3>
              <p className="text-xs text-neutral-600">{t.spentOf(formatCurrency(item.spent), formatCurrency(limit))}</p>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${style.badge}`}>
            <StatusIcon className="h-3 w-3" aria-hidden="true" /> {t.status[status]}
          </span>
        </div>

        <div className="mt-3">
          <div
            role="progressbar"
            aria-label={t.percentUsed(label, percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(percent, 100)}
            aria-valuetext={`${percent}%`}
            className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100"
          >
            <div className={`h-full rounded-full transition-all duration-700 ease-out ${style.bar}`} style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span className={status === "over" ? "font-medium text-red-700" : "text-neutral-500"}>
              {remaining < 0 ? t.overBy(formatCurrency(-remaining)) : t.left(formatCurrency(remaining))}
            </span>
            <span className="font-medium text-black">{percent}%</span>
          </div>
        </div>

        {editing ? (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <LimitEditor label={label} initial={amountInput(item.limit)} t={t} pending={pending} onSave={onSave} onCancel={onCancel} />
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-end gap-1 border-t border-neutral-100 pt-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-neutral-600 hover:text-black" aria-label={t.editAria(label)} onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t.edit}
            </Button>
            <Button
              variant="ghost" size="sm" className="h-8 text-xs text-neutral-500 hover:text-red-600"
              aria-label={t.removeAria(label)} disabled={pending} onClick={() => onSave(null)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t.remove}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LimitEditor({ label, initial, t, pending, onSave, onCancel }: {
  label: string;
  initial: string;
  t: BudgetsCopy;
  pending: boolean;
  onSave: (limit: number) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0.01) return setError(t.form.invalid);
    if (n > MAX_LIMIT) return setError(t.form.tooBig);
    onSave(Math.round(n * 100) / 100);
  };

  return (
    <form onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-neutral-600">{t.form.label(label)}</Label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400" aria-hidden="true">$</span>
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={value}
            placeholder={t.form.placeholder}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            autoFocus
            className="h-9 pl-6 text-sm"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending} className="h-9 shrink-0 bg-black text-white hover:bg-neutral-800">{t.form.save}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} className="h-9 shrink-0 text-neutral-600">{t.form.cancel}</Button>
      </div>
      {error && <p id={errorId} role="alert" className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
