import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { CircleSlash, CreditCard, FileText, Lock, MoreHorizontal, Pencil, Play, Plus, Target, Trash2 } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BankLogo } from "@/components/brand/BankLogo";
import { GoalSheet, type GoalItem, type GoalSheetState } from "@/components/personal/GoalSheet";
import { Dst, Note, PageHead, pbtn, pbtnPrimary, pbtnSm, pbtnSmPrimary, pcard, pinput } from "@/components/personal/planKit";
import { dayString, monthEndAfter, monthName, monthsUntil, useToday } from "@/components/personal/planDates";
import { institutionOf, listNames, type Institution } from "@/components/personal/txKit";
import { money } from "@/components/personal/personalUtils";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalPagesCopy } from "@/i18n/copy/personalPages";

const fmt0 = (n: number) => money(Math.round(n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The prototype's Metas (pGoals): what you set aside this month against what you planned, then one card per
 * goal with its progress, when you'll get there (and whether you're on time for its date), and how it's
 * followed: a savings account's balance, a card's debt going down, or what you write down ("Anotar lo que
 * aparté", saved as deposits with undo). Edit, pause and delete (with undo) from each card's menu.
 * "+ Nuevo → Meta" lands here with ?new=1 and opens the form.
 */
export default function PersonalGoals() {
  const all = useCopy(personalPagesCopy);
  const t = all.goals.p;
  const locale = intlLocale(useLang().lang);
  const uid = useId();
  const utils = trpc.useUtils();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const wantNew = params.get("new") === "1";
  const [sheet, setSheet] = useState<GoalSheetState | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [addVal, setAddVal] = useState("");

  // "+ Nuevo → Meta" (/personal/goals?new=1) opens the form once, then the URL drops the flag.
  const [newHandled, setNewHandled] = useState(false);
  if (wantNew && !newHandled) {
    setNewHandled(true);
    setSheet({ mode: "new" });
  }
  if (!wantNew && newHandled) setNewHandled(false);
  useEffect(() => {
    if (!wantNew) return;
    setParams((p) => { const n = new URLSearchParams(p); n.delete("new"); return n; }, { replace: true });
  }, [wantNew, setParams]);

  const q = trpc.personal.listGoals.useQuery({ year: today.y, month: today.m });
  const { data: institutions } = trpc.brand.institutions.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  const insts = institutions as Institution[] | undefined;
  const goals = q.data ?? [];
  const refresh = () => { void utils.personal.listGoals.invalidate(); void utils.personal.goalOptions.invalidate(); };
  const fail = (e: { message: string }) => toast.error(e.message);
  const pause = trpc.personal.setGoalPaused.useMutation({ onError: fail });
  const archive = trpc.personal.archiveGoal.useMutation({ onError: fail });
  const restore = trpc.personal.restoreGoal.useMutation({ onError: fail });
  const deposit = trpc.personal.addDeposit.useMutation({ onError: fail });
  const undoDeposit = trpc.personal.undoDeposit.useMutation({ onError: fail });

  const undoAction = (onClick: () => void) => ({ action: { label: t.toast.undo, onClick } });
  const togglePause = (g: GoalItem) => {
    const to = !g.paused;
    pause.mutate({ id: g.id, paused: to }, {
      onSuccess: () => { refresh(); toast.success(to ? t.toast.paused(g.name) : t.toast.resumed(g.name), undoAction(() => pause.mutate({ id: g.id, paused: !to }, { onSuccess: refresh }))); },
    });
  };
  const remove = (g: GoalItem) => {
    archive.mutate({ id: g.id }, {
      onSuccess: () => { refresh(); toast.success(t.toast.deleted(g.name), undoAction(() => restore.mutate({ id: g.id }, { onSuccess: refresh }))); },
    });
  };
  const saveDeposit = (g: GoalItem) => {
    const v = round2(Number(addVal));
    if (!(v > 0)) { toast.error(t.toast.needAmount); return; }
    deposit.mutate({ goalId: g.id, amount: v, date: today.key }, {
      onSuccess: (r) => {
        setAdding(null); refresh();
        const before = r.target ? r.before / r.target : 0, after = r.target ? r.after / r.target : 0;
        const ms = after >= 1 ? t.toast.m100 : before < 0.75 && after >= 0.75 ? t.toast.m75 : before < 0.5 && after >= 0.5 ? t.toast.m50 : before < 0.25 && after >= 0.25 ? t.toast.m25 : "";
        toast.success(t.toast.added(fmt0(v), g.name) + ms, undoAction(() => undoDeposit.mutate({ id: r.id }, { onSuccess: refresh })));
      },
    });
  };

  // ── Este mes apartaste (gMonth): goals being saved for, not paused, not reached ──
  const act = goals.filter((g) => g.kind === "save" && !g.paused && Number(g.currentAmount) < Number(g.targetAmount));
  const monthSum = round2(act.reduce((s, g) => s + g.month, 0));
  const plannedSum = round2(act.reduce((s, g) => s + (g.monthly ?? 0), 0));
  const pend = act.filter((g) => (g.monthly ?? 0) > 0 && g.month < (g.monthly ?? 0));

  const line = (g: GoalItem) => {
    const cur = Number(g.currentAmount), goal = Number(g.targetAmount), rem = round2(goal - cur);
    if (rem <= 0) return <p className="mt-2 text-sm text-slate-900"><b className="text-emerald-600">{t.doneTitle}</b> {g.kind === "debt" ? t.doneDebt : t.doneSave(fmt0(goal))}</p>;
    if (g.paused) return <p className="mt-2 text-sm text-slate-900"><Dst tone="muted">{t.paused}</Dst>{t.pausedText}</p>;
    if (g.kind === "debt") {
      const [a, b, owed] = t.debtLine(money(rem, true));
      return <p className="mt-2 text-sm text-slate-900">{a}<b>{owed}</b>{b}</p>;
    }
    const monthly = g.monthly ?? 0;
    const date = dayString(g.deadline);
    if (!monthly) return <p className="mt-2 text-sm text-slate-900">{t.noMonthly}</p>;
    const [a, b] = t.monthlyLine(fmt0(monthly));
    const n = date ? monthsUntil(today, date) : 0;
    const need = date ? (n > 0 ? rem / n : rem) : 0;
    return (
      <>
        <p className="mt-2 text-sm text-slate-900">{a}<b>{monthName(monthEndAfter(today, Math.ceil(rem / monthly)), locale)}</b>{b}</p>
        {date && (n > 0 ? (
          <p className="mt-2 text-sm text-slate-900">
            {t.needLine(monthName(date, locale), fmt0(need))}{" "}
            {need <= monthly + 0.5 ? <Dst tone="good">{t.onTime}</Dst> : <Dst tone="warn">{t.short(fmt0(need - monthly))}</Dst>}
          </p>
        ) : <p className="mt-2 text-sm text-amber-700">{t.lateLine(monthName(date, locale), fmt0(rem))}</p>)}
      </>
    );
  };

  const card = (g: GoalItem) => {
    const cur = Number(g.currentAmount), goal = Number(g.targetAmount);
    const pct = goal > 0 ? Math.min(100, Math.round((cur / goal) * 100)) : 0;
    const done = cur >= goal && goal > 0;
    const Icon = g.kind === "debt" ? CreditCard : Target;
    let track;
    if (g.track !== "manual" && g.account) {
      track = (
        <>
          <BankLogo name={institutionOf(insts, g.account.id)?.name ?? g.account.bankName} logo={institutionOf(insts, g.account.id)?.logo} color={institutionOf(insts, g.account.id)?.color} size={18} />
          <span className="min-w-0 flex-[1_1_160px]">{g.kind === "debt" ? t.trackDebt(g.account.name) : t.trackAcct(g.account.name)}</span>
        </>
      );
    } else if (g.track !== "manual") {
      track = <span className="min-w-0 flex-[1_1_160px]">{t.trackMissing}</span>;
    } else {
      track = (
        <>
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-[1_1_160px]">{t.trackManual}{g.month ? t.trackMonth(fmt0(g.month)) : ""}</span>
          {!done && !g.paused && (adding === g.id ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <input type="number" inputMode="decimal" min={1} step={10} value={addVal} onChange={(e) => setAddVal(e.target.value)} aria-label={t.addAria(g.name)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); saveDeposit(g); } if (e.key === "Escape") setAdding(null); }}
                autoFocus className={cn(pinput, "w-[120px] min-h-10 sm:min-h-[34px]")} />
              <button type="button" onClick={() => saveDeposit(g)} disabled={deposit.isPending} className={pbtnSmPrimary}>{t.addOk}</button>
              <button type="button" onClick={() => setAdding(null)} className={pbtnSm}>{t.cancel}</button>
            </span>
          ) : (
            <button type="button" onClick={() => { setAdding(g.id); setAddVal(g.monthly && g.monthly > g.month ? String(round2(g.monthly - g.month)) : ""); }} className={pbtnSm}>{t.add}</button>
          ))}
        </>
      );
    }
    return (
      <article key={g.id} className={cn(pcard, "min-w-0", g.paused && "opacity-70")} aria-labelledby={`${uid}-g${g.id}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
            <h2 id={`${uid}-g${g.id}`} className="truncate font-semibold text-slate-900">{g.name}</h2>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={t.menu(g.name)} className={cn(pbtn, "w-11 px-0 sm:w-10")}><MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-[14px] p-1.5">
              <DropdownMenuItem onSelect={() => setSheet({ mode: "edit", goal: g })} className="min-h-10 gap-2.5 rounded-[10px]"><Pencil className="h-4 w-4 text-slate-500" aria-hidden="true" />{t.edit}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => togglePause(g)} className="min-h-10 gap-2.5 rounded-[10px]">
                {g.paused ? <Play className="h-4 w-4 text-slate-500" aria-hidden="true" /> : <CircleSlash className="h-4 w-4 text-slate-500" aria-hidden="true" />}{g.paused ? t.resume : t.pause}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => remove(g)} className="min-h-10 gap-2.5 rounded-[10px] text-red-600 focus:text-red-700"><Trash2 className="h-4 w-4" aria-hidden="true" />{t.del}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <span className="text-[28px] font-extrabold tracking-tight text-slate-900 tabular-nums">{fmt0(cur)}</span>
          <span className="text-slate-500 tabular-nums">{t.of(fmt0(goal))}</span>
          <span className="ml-auto text-[13px] font-bold text-slate-500 tabular-nums">{pct}%</span>
        </div>
        <div role="progressbar" aria-label={t.bar(g.name, pct)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full", g.paused ? "bg-slate-400" : done ? "bg-emerald-600" : "bg-blue-600")} style={{ width: `${pct}%` }} />
        </div>
        {line(g)}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-[13px] text-slate-500">{track}</div>
      </article>
    );
  };

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHead title={t.title} sub={t.subtitle} right={
          <button type="button" onClick={() => setSheet({ mode: "new" })} data-guide="goal-new" className={pbtnPrimary}><Plus className="h-4 w-4" aria-hidden="true" />{t.newGoal}</button>
        } />

        {q.isLoading ? (
          <div className="space-y-3.5" role="status" aria-label={t.loading}>
            <Skeleton className="h-32 rounded-[14px]" />
            <div className="grid gap-3.5 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-[14px]" />)}</div>
          </div>
        ) : q.isError ? (
          <section className={cn(pcard, "py-10 text-center")}>
            <p className="text-sm text-slate-700" role="alert">{t.loadError}</p>
            <button type="button" onClick={() => void q.refetch()} className={cn(pbtn, "mt-3")}>{t.retry}</button>
          </section>
        ) : goals.length === 0 ? (
          <section className={cn(pcard, "px-6 py-10 text-center")}>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Target className="h-6 w-6" aria-hidden="true" /></span>
            <h2 className="mt-3 font-bold text-slate-900">{t.empty.title}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t.empty.text}</p>
            <button type="button" onClick={() => setSheet({ mode: "new" })} data-guide="goal-new" className={cn(pbtnSmPrimary, "mt-3")}>{t.empty.cta}</button>
          </section>
        ) : (
          <>
            {plannedSum > 0 && (
              <section className={cn(pcard, "mb-3.5")} aria-labelledby={`${uid}-sum`}>
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span id={`${uid}-sum`} className="basis-full text-[13px] text-slate-500">{t.sumK}</span>
                  <span className="text-[28px] font-extrabold tracking-tight text-slate-900 tabular-nums">{fmt0(monthSum)}</span>
                  <span className="text-slate-500 tabular-nums">{t.of(fmt0(plannedSum))}</span>
                </div>
                <div role="progressbar" aria-label={t.sumBar} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, (monthSum / plannedSum) * 100))} className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, (monthSum / plannedSum) * 100).toFixed(1)}%` }} />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {pend.length ? t.pending(fmt0(Math.max(0, plannedSum - monthSum)), listNames(pend.map((g) => g.name), t.and)) : t.allDone}
                </p>
              </section>
            )}
            <div className="grid items-start gap-3.5 md:grid-cols-2">{goals.map(card)}</div>
          </>
        )}
        <Note icon={<Lock className="h-3.5 w-3.5" />}>{t.note}</Note>
      </div>
      {sheet && (
        <GoalSheet key={sheet.mode === "edit" ? `e${sheet.goal.id}` : "new"} state={sheet} goals={goals} today={today} onClose={() => setSheet(null)}
          onSaved={(msg, undo) => toast.success(msg, undo ? undoAction(undo) : undefined)} />
      )}
    </AnimatedPage>
  );
}
