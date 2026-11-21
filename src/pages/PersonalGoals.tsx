import { useMemo, useState } from "react";
import { CalendarDays, PartyPopper, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/personal/ConfirmDialog";
import { AddMoneyDialog, NewGoalDialog } from "@/components/personal/GoalDialogs";
import { ProgressBar } from "@/components/personal/ProgressBar";
import { dayKey, localTodayKey, moneyAuto, num, txDay, ui, type Goal } from "@/components/personal/personalUtils";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalPagesCopy } from "@/i18n/copy/personalPages";

/** 2.0 saving goals: what you've saved toward each one, in words and a bar; create, add money, delete. */
export default function PersonalGoals() {
  const all = useCopy(personalPagesCopy);
  const t = all.goals;
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const today = useMemo(() => localTodayKey(new Date()), []);

  const { data, isLoading, isError, refetch } = trpc.personal.listGoals.useQuery();
  const goals = (data ?? []) as Goal[];

  const createMut = trpc.personal.createGoal.useMutation({
    onSuccess: () => { void utils.personal.listGoals.invalidate(); setShowForm(false); toast.success(t.created); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.personal.deleteGoal.useMutation({
    onSuccess: () => { void utils.personal.listGoals.invalidate(); setDeleting(null); toast.success(t.deleted); },
    onError: (e) => { setDeleting(null); toast.error(e.message); },
  });
  const updateMut = trpc.personal.updateGoal.useMutation({
    onSuccess: () => { void utils.personal.listGoals.invalidate(); setAdding(null); toast.success(t.added); },
    onError: (e) => toast.error(e.message),
  });

  const totalSaved = goals.reduce((s, g) => s + num(g.currentAmount), 0);
  const totalTarget = goals.reduce((s, g) => s + num(g.targetAmount), 0);
  const reached = goals.filter((g) => num(g.targetAmount) > 0 && num(g.currentAmount) >= num(g.targetAmount)).length;
  const totalPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-3 sm:items-end">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
          </div>
          <button type="button" onClick={() => setShowForm(true)} className={cn(ui.primary, "shrink-0")}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t.newGoal}
          </button>
        </header>

        {isLoading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-24 rounded-2xl" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
          </div>
        ) : isError ? (
          <section className={cn(ui.card, "py-10 text-center")}>
            <p className="text-sm text-slate-700" role="alert">{t.loadError}</p>
            <button type="button" onClick={() => void refetch()} className={cn(ui.secondary, "mt-3")}>{all.shared.retry}</button>
          </section>
        ) : goals.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Target className="h-7 w-7" aria-hidden="true" /></span>
            <h2 className="mt-4 text-lg font-bold tracking-tight text-slate-900">{t.emptyTitle}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t.emptyText}</p>
            <button type="button" onClick={() => setShowForm(true)} className={cn(ui.primary, "mt-5")}><Plus className="h-4 w-4" aria-hidden="true" />{t.emptyCta}</button>
          </section>
        ) : (
          <>
            {/* All goals at a glance */}
            <section className={ui.card} aria-label={t.title}>
              <p className="text-base font-semibold tabular-nums text-slate-900 sm:text-lg">{t.summary(moneyAuto(totalSaved), moneyAuto(totalTarget), goals.length)}</p>
              <ProgressBar percent={totalPct} label={t.summary(moneyAuto(totalSaved), moneyAuto(totalTarget), goals.length)} size="lg" className="mt-3" />
              <p className="mt-2 text-xs text-slate-500">{totalPct}%{reached > 0 ? ` · ${t.reached(reached)}` : ""}</p>
            </section>

            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {goals.map((g) => {
                const saved = num(g.currentAmount);
                const target = num(g.targetAmount);
                const pct = target > 0 ? Math.round((saved / target) * 100) : 0;
                const done = target > 0 && saved >= target;
                const due = g.deadline ? txDay(g.deadline, locale, { day: "numeric", month: "long", year: "numeric" }) : "";
                const late = !!g.deadline && !done && dayKey(g.deadline) < today;
                const catName = g.category ? (t.categories[g.category] ?? g.category) : "";
                return (
                  <li key={g.id} className="min-w-0">
                    <article className={cn("flex h-full flex-col rounded-2xl border bg-white p-4 sm:p-5", done ? "border-emerald-200" : "border-slate-200")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-slate-900">{g.name}</h3>
                          <p className={cn("mt-0.5 flex items-center gap-1 text-xs", late ? "text-amber-700" : "text-slate-500")}>
                            {due && <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                            <span className="truncate">{[catName, due ? (late ? t.overdue(due) : t.due(due)) : ""].filter(Boolean).join(" · ")}</span>
                          </p>
                        </div>
                        <button type="button" onClick={() => setDeleting(g)} aria-label={t.deleteAria(g.name)} title={t.delete}
                          className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <p className={cn("mt-4 flex items-center gap-1.5 text-base font-semibold tabular-nums", done ? "text-emerald-700" : "text-slate-900")}>
                        {done && <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        {done ? t.doneText(moneyAuto(target)) : t.left(moneyAuto(target - saved), moneyAuto(target))}
                      </p>
                      <ProgressBar percent={pct} label={t.percent(g.name, pct)} tone={done ? "good" : "blue"} className="mt-2" />
                      <p className="mt-1.5 flex justify-between gap-2 text-xs tabular-nums text-slate-500">
                        <span>{t.progress(moneyAuto(saved), moneyAuto(target))}</span>
                        <span className={cn("font-semibold", done ? "text-emerald-700" : "text-slate-700")}>{done ? t.done : `${pct}%`}</span>
                      </p>

                      <div className="mt-auto pt-4">
                        <button type="button" onClick={() => setAdding(g)} aria-label={t.addAria(g.name)} className={cn(ui.secondary, "w-full")}>
                          <Plus className="h-4 w-4 text-blue-600" aria-hidden="true" />{t.addMoney}
                        </button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {showForm && <NewGoalDialog busy={createMut.isPending} onClose={() => setShowForm(false)} onCreate={(goal) => createMut.mutate(goal)} />}
      {adding && (
        <AddMoneyDialog key={adding.id} name={adding.name} saved={moneyAuto(num(adding.currentAmount))} target={moneyAuto(num(adding.targetAmount))}
          busy={updateMut.isPending} onClose={() => setAdding(null)}
          onAdd={(amount) => updateMut.mutate({ id: adding.id, currentAmount: num(adding.currentAmount) + amount })} />
      )}
      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title={t.confirmTitle(deleting?.name ?? "")} text={t.confirmText} confirmLabel={t.confirm} cancelLabel={all.shared.cancel}
        busy={deleteMut.isPending} onConfirm={() => { if (deleting) deleteMut.mutate({ id: deleting.id }); }} />
    </AnimatedPage>
  );
}
