import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { CheckCircle2, Landmark, Lock, PiggyBank } from "lucide-react";
import type { AppRouter } from "../../api/router";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetCard, LimitEditor } from "@/components/personal/BudgetCard";
import { CategoryIcon } from "@/components/personal/CategoryIcon";
import { MonthNav } from "@/components/personal/MonthNav";
import { ProgressBar } from "@/components/personal/ProgressBar";
import { amountInput, monthIndex, monthOnly, moneyAuto, ui, type YearMonth } from "@/components/personal/personalUtils";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalCopy } from "@/i18n/copy/personal";
import { budgetsCopy, budgetCategoryLabel } from "@/i18n/copy/budgets";

type Budgets = inferRouterOutputs<AppRouter>["personal"]["listBudgets"];
type Month = { year: number; month: number };

const MIN_MONTH: YearMonth = { y: 2000, m: 1 };
const toYM = (m: Month): YearMonth => ({ y: m.year, m: m.month });

/** The month in the URL (?year=&month=) when it's valid and not in the future; otherwise this month. */
function monthFromParams(params: URLSearchParams, today: Month): Month {
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return today;
  const i = monthIndex({ y: year, m: month });
  return i < monthIndex(MIN_MONTH) || i > monthIndex(toYM(today)) ? today : { year, month };
}

/**
 * 2.0 budgets (personal Pro): a monthly limit per spending category with "Te quedan $40 de $250" and a bar,
 * the month in the URL, first-budget suggestions, and categories without a limit. Locked for plans without "budgets".
 */
export default function PersonalBudgets() {
  const t = useCopy(budgetsCopy);
  const { categories } = useCopy(personalCopy);
  const locale = intlLocale(useLang().lang);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [today] = useState<Month>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [params, setParams] = useSearchParams();
  const selected = monthFromParams(params, today);
  const isCurrentMonth = monthIndex(toYM(selected)) === monthIndex(toYM(today));
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

  const goTo = (p: YearMonth) => {
    setEditing(null);
    const i = Math.min(Math.max(monthIndex(p), monthIndex(MIN_MONTH)), monthIndex(toYM(today)));
    if (i === monthIndex(toYM(today))) setParams({}, { replace: true });
    else setParams({ year: String(Math.floor(i / 12)), month: String((i % 12) + 1) }, { replace: true });
  };

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
        <p className="mt-0.5 max-w-xl text-sm text-slate-500">{t.subtitle}</p>
      </div>
      {!locked && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <MonthNav value={toYM(selected)} min={MIN_MONTH} max={toYM(today)} onChange={goTo} locale={locale}
            labels={{ month: t.month.label, prev: t.month.prev, next: t.month.next }} className="flex-1 sm:flex-none" />
          {!isCurrentMonth && (
            <button type="button" onClick={() => goTo(toYM(today))} className="inline-flex h-11 items-center rounded-[10px] px-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10">
              {t.month.current}
            </button>
          )}
        </div>
      )}
    </header>
  );

  if (locked) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-3xl space-y-5">
          {header}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Lock className="h-5 w-5" aria-hidden="true" /></span>
            <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{t.locked.title}</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600">{t.locked.text}</p>
            <ul className="mt-4 space-y-2">
              {t.locked.points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{p}</li>
              ))}
            </ul>
            <button type="button" onClick={() => navigate("/settings")} className={cn(ui.primary, "mt-6 w-full sm:w-auto")}>{t.locked.cta}</button>
          </section>
        </div>
      </AnimatedPage>
    );
  }

  const data: Budgets | undefined = budgets.data;
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
  const totals = data?.totals;
  const totalLeft = totals ? totals.limit - totals.spent : 0;
  const totalPct = totals && totals.limit > 0 ? Math.round((totals.spent / totals.limit) * 100) : 0;
  // The overall bar follows the overall number (each card shows its own status).
  const totalTone = totalPct >= 100 ? "bad" : totalPct >= 80 ? "warn" : "good";

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        {header}

        {budgets.isLoading ? (
          <div className="space-y-4" role="status" aria-label={t.loading}>
            <Skeleton className="h-32 rounded-2xl" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
            </div>
          </div>
        ) : budgets.isError || !data ? (
          <section className={cn(ui.card, "py-10 text-center")}>
            <p className="text-sm text-slate-700" role="alert">{t.error}</p>
            <button type="button" onClick={() => void budgets.refetch()} className={cn(ui.secondary, "mt-3")}>{t.retry}</button>
          </section>
        ) : (
          <>
            {!data.bankConnected && (
              <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600" aria-hidden="true"><Landmark className="h-5 w-5" /></span>
                  <p className="text-sm text-slate-700">{t.noBank.text}</p>
                </div>
                <Link to="/personal/bank" className={cn(ui.secondary, "shrink-0")}>{t.noBank.cta}</Link>
              </section>
            )}

            {budgeted.length === 0 ? (
              /* Empty state: suggest the first budgets from the biggest spending categories */
              <section className={ui.card} aria-labelledby="pbud-empty">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600" aria-hidden="true"><PiggyBank className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h2 id="pbud-empty" className="font-semibold text-slate-900">{t.empty.title}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{suggestions.length > 0 ? t.empty.withSpending : t.empty.noSpending}</p>
                  </div>
                </div>
                {suggestions.length > 0 && (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {suggestions.map((s) => {
                      const amount = moneyAuto(s.suggestedLimit ?? 0);
                      return (
                        <li key={s.category} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <CategoryIcon category={s.category} type="expense" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">{label(s.category)}</p>
                              <p className="text-xs tabular-nums text-slate-500">{t.spentThisMonth(moneyAuto(s.spent))}</p>
                            </div>
                          </div>
                          <button type="button" aria-label={t.empty.useAria(label(s.category), amount)} disabled={setBudget.isPending}
                            onClick={() => save(s.category, s.suggestedLimit)} className={ui.primary}>
                            {t.empty.use(amount)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : (
              <>
                {/* The month at a glance */}
                {totals && (
                  <section className={ui.card} aria-labelledby="pbud-sum">
                    <p id="pbud-sum" className="text-xs font-medium text-slate-500">{t.summary.label(monthOnly(toYM(selected), locale), isCurrentMonth)}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-2xl">{t.summary.spentOf(moneyAuto(totals.spent), moneyAuto(totals.limit))}</p>
                    <ProgressBar percent={totalPct} label={t.summary.spentOf(moneyAuto(totals.spent), moneyAuto(totals.limit))} tone={totalTone} size="lg" className="mt-3" />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                      <span className={cn("font-medium tabular-nums", totalLeft < 0 ? "text-red-700" : "text-slate-700")}>
                        {totalLeft < 0 ? t.summary.overTotal(moneyAuto(-totalLeft)) : t.summary.left(moneyAuto(totalLeft))}
                      </span>
                      <span className="text-xs text-slate-500">
                        {t.summary.count(totals.count)}
                        {totals.near > 0 && ` · ${t.summary.near(totals.near)}`}
                        {totals.over > 0 && ` · ${t.summary.over(totals.over)}`}
                        {totals.near === 0 && totals.over === 0 && ` · ${t.summary.allOk}`}
                      </span>
                    </div>
                  </section>
                )}

                <section aria-labelledby="pbud-list">
                  <h2 id="pbud-list" className="sr-only">{t.budgetsTitle}</h2>
                  <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              </>
            )}

            {/* Categories without a limit */}
            {unbudgeted.length > 0 && (
              <section className={ui.card} aria-labelledby="pbud-others">
                <h2 id="pbud-others" className="font-semibold text-slate-900">{t.othersTitle}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{t.othersText}</p>
                <ul className="mt-2 divide-y divide-slate-100">
                  {unbudgeted.map((u) => (
                    <li key={u.category} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <CategoryIcon category={u.category} type="expense" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{label(u.category)}</p>
                            <p className="text-xs tabular-nums text-slate-500">{u.spent > 0 ? t.spentThisMonth(moneyAuto(u.spent)) : t.noSpending}</p>
                          </div>
                        </div>
                        {editing !== u.category && (
                          <button type="button" aria-label={t.setAria(label(u.category))} onClick={() => setEditing(u.category)} className={cn(ui.secondary, "shrink-0")}>
                            {t.setLimit}
                          </button>
                        )}
                      </div>
                      {editing === u.category && (
                        <div className="mt-3 sm:pl-[3.25rem]">
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
              </section>
            )}
          </>
        )}
      </div>
    </AnimatedPage>
  );
}
