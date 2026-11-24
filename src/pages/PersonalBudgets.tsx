import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { CheckCircle2, ChevronLeft, ChevronRight, Landmark, Lock, Pencil, Plus, Sparkles, X } from "lucide-react";
import type { AppRouter } from "../../api/router";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetSuggestSheet } from "@/components/personal/BudgetSuggestSheet";
import { Dst, PageHead, pbtn, pbtnSm, pbtnSmPrimary, pcard, pinput, plabel, type Tone } from "@/components/personal/planKit";
import { useToday } from "@/components/personal/planDates";
import { listNames, useCatLabel } from "@/components/personal/txKit";
import { money, ui } from "@/components/personal/personalUtils";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalCopy } from "@/i18n/copy/personal";
import { budgetsCopy } from "@/i18n/copy/budgets";
import { paceStatus, projectMonth, type PaceStatus } from "../../api/lib/budgets";

type Budgets = inferRouterOutputs<AppRouter>["personal"]["listBudgets"];
type Item = Budgets["items"][number];
type Month = { year: number; month: number };

/** How far back the month arrows go. */
const MONTHS_BACK = 24;
const idx = (m: Month) => m.year * 12 + (m.month - 1);
const fromIdx = (i: number): Month => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
const fmt0 = (n: number) => money(Math.round(n));
const fmt = (n: number) => money(n, true);

/** The month in the URL (?year=&month=) when it's valid and not in the future; otherwise this month. */
function monthFromParams(params: URLSearchParams, today: Month): Month {
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return today;
  const i = idx({ year, month });
  return i < idx(today) - MONTHS_BACK || i > idx(today) ? today : { year, month };
}

const STATE_TONE: Record<PaceStatus, Tone> = { none: "muted", over: "bad", fixed: "open", warn: "warn", ok: "good" };

/**
 * The prototype's Presupuestos (pBudget): what's left to spend this month and at what pace, each category
 * with its limit, a bar with today's pace mark and what's left per day, flexible and fixed spending apart,
 * past months to compare (read-only), carrying what's left to next month, and a suggested budget from
 * the last 3 months. Limits apply from the month they're set (past months keep theirs). Personal Pro only.
 */
export default function PersonalBudgets() {
  const T = useCopy(budgetsCopy);
  const t = T.p;
  const { categories } = useCopy(personalCopy);
  const locale = intlLocale(useLang().lang);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const uid = useId();
  const catLabel = useCatLabel();
  const label = (c: string) => catLabel(c, "expense");
  const today = useToday();
  const current: Month = { year: today.y, month: today.m };
  const [params, setParams] = useSearchParams();
  const selected = monthFromParams(params, current);
  const isCurrent = idx(selected) === idx(current);
  const past = idx(selected) < idx(current);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sugOpen, setSugOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addCat, setAddCat] = useState("");
  const [addAmt, setAddAmt] = useState("");
  const [addErr, setAddErr] = useState("");

  const plan = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const planLacksBudgets = plan.data ? !plan.data.features.includes("budgets") : false;
  const budgets = trpc.personal.listBudgets.useQuery(
    { year: selected.year, month: selected.month },
    { enabled: !planLacksBudgets, staleTime: 2 * 60_000, retry: (count, err) => err.data?.code !== "FORBIDDEN" && count < 1 },
  );
  const locked = planLacksBudgets || budgets.error?.data?.code === "FORBIDDEN";

  const refresh = () => { void utils.personal.listBudgets.invalidate(); void utils.personal.suggestBudgets.invalidate(); };
  const setBudget = trpc.personal.setBudget.useMutation({ onError: (e) => toast.error(e.message || T.error) });
  const setRoll = trpc.personal.setRollover.useMutation({ onError: (e) => toast.error(e.message || T.error) });

  const monthWord = (m: Month) => new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString(locale, { month: "long", timeZone: "UTC" });
  const monthTitle = (m: Month) => {
    const s = new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }).replace(" de ", " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const nextMonthWord = monthWord(fromIdx(idx(current) + 1));
  const prevMonthWord = monthWord(fromIdx(idx(selected) - 1));

  const goTo = (i: number) => {
    setEditing(null);
    setAdding(false);
    const c = Math.min(Math.max(i, idx(current) - MONTHS_BACK), idx(current));
    if (c === idx(current)) setParams({}, { replace: true });
    else { const m = fromIdx(c); setParams({ year: String(m.year), month: String(m.month) }, { replace: true }); }
  };

  /** Saves a limit (null removes it) and offers to undo it. */
  const saveLimit = (category: string, limit: number | null, before: number | null) => {
    setBudget.mutate({ category, limit, year: current.year, month: current.month }, {
      onSuccess: () => {
        refresh();
        setEditing(null);
        const undo = { label: t.undo, onClick: () => setBudget.mutate({ category, limit: before, year: current.year, month: current.month }, { onSuccess: refresh }) };
        toast.success(limit === null ? t.removedToast(label(category)) : t.savedToast(label(category), fmt0(limit)), { action: undo });
      },
    });
  };
  const startEdit = (it: Item) => { setEditing(it.category); setDraft(it.baseLimit ? String(it.baseLimit) : ""); };
  const commitEdit = (it: Item) => {
    const raw = draft.trim();
    const v = Math.round(Number(raw) * 100) / 100;
    if (raw === "" || !(v >= 0) || v === (it.baseLimit ?? 0)) { setEditing(null); return; }
    saveLimit(it.category, v === 0 ? null : v, it.baseLimit);
  };
  const toggleRoll = (it: Item) => {
    const on = !it.rollover;
    setRoll.mutate({ category: it.category, year: current.year, month: current.month, on }, {
      onSuccess: () => {
        refresh();
        toast.success(on ? t.rollOn(label(it.category), nextMonthWord) : t.rollOff(label(it.category)), {
          action: { label: t.undo, onClick: () => setRoll.mutate({ category: it.category, year: current.year, month: current.month, on: !on }, { onSuccess: refresh }) },
        });
      },
    });
  };
  const saveAdd = () => {
    const v = Math.round(Number(addAmt) * 100) / 100;
    if (!addCat) { setAddErr(t.addPick); return; }
    if (!(v > 0)) { setAddErr(t.invalid); return; }
    setAddErr("");
    saveLimit(addCat, v, null);
    setAdding(false); setAddCat(""); setAddAmt("");
  };

  const suggestBtn = isCurrent && !locked ? (
    <button type="button" onClick={() => setSugOpen(true)} className={pbtn}>
      <Sparkles className="h-4 w-4" aria-hidden="true" />{t.suggestBtn}
    </button>
  ) : null;

  if (locked) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-3xl">
          <PageHead title={t.title} sub={t.subtitle} />
          <section className={cn(pcard, "p-6 sm:p-8")}>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Lock className="h-5 w-5" aria-hidden="true" /></span>
            <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{T.locked.title}</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600">{T.locked.text}</p>
            <ul className="mt-4 space-y-2">
              {T.locked.points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{p}</li>
              ))}
            </ul>
            <button type="button" onClick={() => navigate("/settings?sec=plan")} className={cn(ui.primary, "mt-6 w-full sm:w-auto")}>{T.locked.cta}</button>
          </section>
        </div>
      </AnimatedPage>
    );
  }

  const nav = (
    <div className="mb-3 flex items-center gap-2">
      <button type="button" onClick={() => goTo(idx(selected) - 1)} disabled={idx(selected) <= idx(current) - MONTHS_BACK} aria-label={t.prevMonth}
        className={cn(pbtn, "w-11 px-0 sm:w-10")}><ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" /></button>
      <b className="min-w-[132px] text-center text-[15px] text-slate-900" aria-live="polite">{monthTitle(selected)}</b>
      <button type="button" onClick={() => goTo(idx(selected) + 1)} disabled={isCurrent} aria-label={t.nextMonth}
        className={cn(pbtn, "w-11 px-0 sm:w-10")}><ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" /></button>
    </div>
  );

  const data = budgets.data;
  const items = data?.items ?? [];
  const day = isCurrent ? today.d : today.days;
  const days = isCurrent ? today.days : new Date(selected.year, selected.month, 0).getDate();
  const leftDays = Math.max(0, days - day);
  const stateOf = (it: Item): PaceStatus => past
    ? (it.limit === null ? "none" : it.spent > it.limit ? "over" : "ok")
    : paceStatus(it.spent, it.limit, day, days, it.fixed);
  const sum = (list: Item[], f: (i: Item) => number) => Math.round(list.reduce((s, i) => s + f(i), 0) * 100) / 100;
  const budgeted = items.filter((i) => i.limit !== null);
  const flex = items.filter((i) => !i.fixed);
  const fixed = items.filter((i) => i.fixed);
  const spent = data?.totals.spent ?? 0;
  const bud = data?.totals.limit ?? 0;
  const left = Math.round((bud - spent) * 100) / 100;
  const flexB = flex.filter((i) => i.limit !== null);
  const fSpent = sum(flexB, (i) => i.spent);
  const fBud = sum(flexB, (i) => i.limit ?? 0);
  const fixedB = fixed.filter((i) => i.limit !== null);
  const xSpent = sum(fixedB, (i) => i.spent);
  const xBud = sum(fixedB, (i) => i.limit ?? 0);
  const listed = new Set(items.map((i) => i.category));
  const addable = Object.keys(categories.expense).filter((k) => !listed.has(k));

  // ── Hero ──
  const pct = bud > 0 ? (spent / bud) * 100 : 0;
  let hero = null;
  if (data && budgeted.length > 0) {
    if (past) {
      hero = (
        <section className={cn(pcard, "grid gap-1.5 p-5")} aria-labelledby={`${uid}-hero`}>
          <p id={`${uid}-hero`} className="text-[13px] text-slate-500">{t.hero.pastK(monthWord(selected))}</p>
          <p className="text-[40px] font-extrabold leading-[1.1] tracking-[-0.03em] text-slate-900 tabular-nums">{fmt(spent)}</p>
          <p className="text-[13px] text-slate-500">
            {t.hero.of(fmt0(bud))} · {left >= 0 ? withBold(t.hero.pastLeft, fmt0(left)) : withBold(t.hero.pastOver, fmt0(-left))}
          </p>
          <HeroBar pct={pct} label={t.hero.progress} />
          <p className="mt-2.5 flex items-start gap-2 text-sm text-slate-900"><Lock className="mt-0.5 h-[15px] w-[15px] shrink-0 text-blue-600" aria-hidden="true" /><span>{t.hero.pastNote}</span></p>
        </section>
      );
    } else {
      const proj = projectMonth(fSpent, day, days);
      const pace = (i: Item) => ((i.limit ?? 0) * day) / days;
      const pushy = flexB.filter((i) => i.spent > pace(i)).sort((a, b) => (b.spent - pace(b)) - (a.spent - pace(a)))[0];
      const names = listNames(flexB.map((i) => label(i.category)), t.and);
      const over = proj > fBud;
      const [a, b] = t.hero.projOver(names, fmt0(fBud));
      hero = (
        <section className={cn(pcard, "grid gap-1.5 p-5")} aria-labelledby={`${uid}-hero`}>
          <p id={`${uid}-hero`} className="text-[13px] text-slate-500">{left >= 0 ? t.hero.leftK(monthWord(selected)) : t.hero.overK(monthWord(selected))}</p>
          <p className={cn("text-[40px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums", left >= 0 ? "text-slate-900" : "text-red-600")}>{fmt(Math.abs(left))}</p>
          <p className="text-[13px] text-slate-500">
            {t.hero.of(fmt0(bud))} · {t.hero.daysLeft(leftDays)}
            {left > 0 && leftDays > 0 && <> · <b className="text-slate-900">{t.hero.perDay(fmt0(left / leftDays))}</b></>}
          </p>
          <HeroBar pct={pct} label={t.hero.progress} />
          {flexB.length > 0 && (
            <p className="mt-2.5 flex items-start gap-2 text-sm text-slate-900">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
              <span>{over ? <>{a}<b>{fmt0(proj)}</b>{b}{pushy ? t.hero.pushy(label(pushy.category)) : ""}</> : t.hero.projOk(fmt0(fBud - proj), names)}</span>
            </p>
          )}
        </section>
      );
    }
  }

  // ── One category (pbRow) ──
  const row = (it: Item) => {
    const name = label(it.category);
    const st = stateOf(it);
    const lim = it.limit ?? 0;
    const pctRow = lim > 0 ? Math.min(100, (it.spent / lim) * 100) : 0;
    const remaining = Math.round((lim - it.spent) * 100) / 100;
    const color = st === "over" ? "bg-red-600" : st === "warn" ? "bg-amber-700" : "bg-blue-600";
    const canEdit = !past;
    let foot;
    if (past) foot = it.limit === null ? t.footNone : it.spent > lim ? t.footPastOver(fmt0(it.spent - lim)) : t.footPastLeft(fmt0(remaining));
    else if (it.limit === null) foot = t.footNone;
    else if (it.spent > lim) foot = <span className="text-red-600">{t.footOver(fmt0(it.spent - lim))}</span>;
    else if (it.fixed) foot = <>{t.footFixed(fmt0(it.spent))}{remaining >= 1 ? t.footFixedLeft(fmt0(remaining)) : ""}</>;
    else foot = <>{withBold(t.footLeft, fmt0(remaining))}{leftDays > 0 ? t.footPerDay(fmt0(remaining / leftDays)) : ""}</>;
    const showRoll = isCurrent && !it.fixed && it.limit !== null && remaining > 0;
    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") { e.preventDefault(); commitEdit(it); }
      if (e.key === "Escape") setEditing(null);
    };
    return (
      <div key={it.category} className="border-t border-slate-200 py-3 first:border-t-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <Link to={`/personal/transactions?cat=${encodeURIComponent(it.category)}`} title={t.seeTx(name)}
            className="group inline-flex min-h-8 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <b className="text-[15px] text-slate-900 group-hover:underline group-hover:underline-offset-[3px]">{name}</b>
            <Dst tone={STATE_TONE[st]}>{t.state[st]}</Dst>
          </Link>
          {editing === it.category ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="text-sm tabular-nums text-slate-900">{fmt0(it.spent)} {t.of}</span>
              <input autoFocus type="number" inputMode="decimal" min={0} step={10} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
                aria-label={t.inputAria(name)} data-guide="budget-edit-amt" className={cn(pinput, "w-[100px] min-h-10 px-2 sm:min-h-[34px]")} />
              <button type="button" onClick={() => commitEdit(it)} disabled={setBudget.isPending} className={pbtnSmPrimary} data-guide="budget-edit-save">{t.save}</button>
              <button type="button" onClick={() => setEditing(null)} aria-label={t.cancelEdit} className={cn(pbtnSm, "w-10 px-0 sm:w-9")}><X className="h-4 w-4" aria-hidden="true" /></button>
            </span>
          ) : (
            <span className="text-sm tabular-nums text-slate-900">
              <b>{fmt0(it.spent)}</b> <span className="text-slate-500">{t.of}</span>{" "}
              {canEdit ? (
                <button type="button" onClick={() => startEdit(it)} aria-label={t.editAria(name)} data-guide={`budget-edit-${it.category}`}
                  className="-mx-1.5 -my-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 font-bold text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  {it.baseLimit !== null ? fmt0(it.baseLimit) : t.setOne}<Pencil className="h-[13px] w-[13px]" aria-hidden="true" />
                </button>
              ) : <b>{it.limit !== null ? fmt0(lim) : "—"}</b>}
            </span>
          )}
        </div>
        <div className="relative mt-[9px] h-2.5 rounded-full bg-slate-100">
          <span className={cn("block h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${pctRow.toFixed(1)}%` }} />
          {!past && !it.fixed && it.limit !== null && (
            <i className="absolute -bottom-1 -top-1 -ml-px w-0.5 rounded-sm bg-slate-900/55" style={{ left: `${((day / days) * 100).toFixed(1)}%` }} aria-hidden="true" />
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[13px] text-slate-500">
          <span className="tabular-nums">{foot}{it.carry > 0 && <span className="block text-xs">{t.carried(fmt0(it.carry), prevMonthWord)}</span>}</span>
          {showRoll && (
            <button type="button" role="switch" aria-checked={it.rollover} onClick={() => toggleRoll(it)} disabled={setRoll.isPending}
              className="inline-flex min-h-10 items-center gap-2 rounded-md text-xs text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0">
              <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", it.rollover ? "bg-blue-600" : "bg-slate-300")} aria-hidden="true">
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", it.rollover ? "translate-x-[18px]" : "translate-x-0.5")} />
              </span>
              {t.roll(nextMonthWord)}
            </button>
          )}
        </div>
      </div>
    );
  };

  const group = (title: string, right: string, hint: ReactNode, list: Item[], extra?: ReactNode) => (
    <section className={pcard} aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <span className="text-[13px] tabular-nums text-slate-500">{right}</span>
      </div>
      {hint && <p className="mb-1 mt-1 flex items-center gap-2 text-xs text-slate-500">{hint}</p>}
      <div>{list.map(row)}</div>
      {extra}
    </section>
  );

  const addForm = isCurrent && addable.length > 0 ? (
    adding ? (
      <div className="mt-2 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
        <div>
          <label htmlFor={`${uid}-addc`} className={plabel}>{t.addCategory}</label>
          <select id={`${uid}-addc`} data-guide="budget-add-cat" value={addCat} onChange={(e) => setAddCat(e.target.value)} className={pinput}>
            <option value="">{t.addPick}</option>
            {addable.map((k) => <option key={k} value={k}>{label(k)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-adda`} className={plabel}>{t.addAmount}</label>
          <input id={`${uid}-adda`} data-guide="budget-add-amt" type="number" inputMode="decimal" min={1} step={10} value={addAmt} onChange={(e) => setAddAmt(e.target.value)} className={pinput} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={saveAdd} data-guide="budget-add-save" disabled={setBudget.isPending} className={cn(pbtnSmPrimary, "min-h-11 sm:min-h-10")}>{t.save}</button>
          <button type="button" onClick={() => { setAdding(false); setAddErr(""); }} className={cn(pbtnSm, "min-h-11 sm:min-h-10")}>{t.cancelEdit}</button>
        </div>
        {addErr && <p className="text-[13px] text-red-600 sm:col-span-3" role="alert">{addErr}</p>}
      </div>
    ) : (
      <button type="button" onClick={() => setAdding(true)} data-guide="budget-add" className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md text-[13px] font-semibold text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-9">
        <Plus className="h-4 w-4" aria-hidden="true" />{t.addOther}
      </button>
    )
  ) : null;

  const flexRight = past ? t.flexPast(fmt0(fSpent), fmt0(fBud)) : fBud - fSpent >= 0 ? t.flexLeft(fmt0(fBud - fSpent)) : t.flexOver(fmt0(fSpent - fBud));
  const fixedRight = (past ? t.fixedPastPaid : t.fixedPaid)(fmt0(xSpent), fmt0(xBud));
  const showFlex = flex.length > 0 || isCurrent;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHead title={t.title} sub={t.subtitle} right={suggestBtn} />
        {nav}

        {budgets.isLoading ? (
          <div className="space-y-3.5" role="status" aria-label={T.loading}>
            <Skeleton className="h-40 rounded-[14px]" />
            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <Skeleton className="h-72 rounded-[14px]" /><Skeleton className="h-48 rounded-[14px]" />
            </div>
          </div>
        ) : budgets.isError || !data ? (
          <section className={cn(pcard, "py-10 text-center")}>
            <p className="text-sm text-slate-700" role="alert">{T.error}</p>
            <button type="button" onClick={() => void budgets.refetch()} className={cn(pbtn, "mt-3")}>{T.retry}</button>
          </section>
        ) : (
          <>
            {!data.bankConnected && (
              <section className={cn(pcard, "mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600" aria-hidden="true"><Landmark className="h-5 w-5" /></span>
                  <p className="text-sm text-slate-700">{T.noBank.text}</p>
                </div>
                <Link to="/personal/bank" className={cn(pbtn, "shrink-0")}>{T.noBank.cta}</Link>
              </section>
            )}

            {budgeted.length === 0 && isCurrent && (
              <section className={cn(pcard, "mb-3.5 p-5")}>
                <h2 className="font-semibold text-slate-900">{t.empty.title}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{t.empty.text}</p>
                <button type="button" onClick={() => setSugOpen(true)} className={cn(pbtnSmPrimary, "mt-3")}><Sparkles className="h-4 w-4" aria-hidden="true" />{t.suggestBtn}</button>
              </section>
            )}
            {hero}

            {(items.length > 0 || isCurrent) && (
              <div className={cn("mt-3.5 grid items-start gap-3.5", showFlex && fixed.length > 0 && "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]")}>
                {showFlex && group(t.flex, flexB.length ? flexRight : "",
                  !past && flexB.length > 0 ? <><i className="inline-block h-3.5 w-0.5 shrink-0 rounded-sm bg-slate-900/55" aria-hidden="true" />{t.paceHint(day, days)}</> : null,
                  flex, addForm)}
                {fixed.length > 0 && group(t.fixed, fixedB.length ? fixedRight : "", t.fixedHint, fixed)}
              </div>
            )}
            {past && items.length === 0 && (
              <p className={cn(pcard, "mt-3.5 py-8 text-center text-sm text-slate-500")}>{T.noSpending}</p>
            )}
          </>
        )}
      </div>
      {sugOpen && <BudgetSuggestSheet year={current.year} month={current.month} onClose={() => setSugOpen(false)} onApplied={refresh} />}
    </AnimatedPage>
  );
}

/** A sentence with its amount in bold, whatever the word order of the language. */
function withBold(sentence: (value: string) => string, value: string): ReactNode {
  const mark = "";
  const [before, after = ""] = sentence(mark).split(mark);
  return <>{before}<b className="text-slate-900">{value}</b>{after}</>;
}

function HeroBar({ pct, label }: { pct: number; label: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={cn("h-full rounded-full", pct > 100 ? "bg-red-600" : "bg-emerald-600")} style={{ width: `${p.toFixed(1)}%` }} />
    </div>
  );
}
