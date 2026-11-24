import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Car, CreditCard, Loader2, Plus, Shield, Target, type LucideIcon } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalPagesCopy } from "@/i18n/copy/personalPages";
import { money } from "./personalUtils";
import { pbtn, pbtnPrimary, pinput, plabel } from "./planKit";
import { dayString, monthEndAfter, monthName, monthsUntil, type Today } from "./planDates";

export type GoalItem = inferRouterOutputs<AppRouter>["personal"]["listGoals"][number];
export type GoalSheetState = { mode: "new" } | { mode: "edit"; goal: GoalItem };
type Card = inferRouterOutputs<AppRouter>["personal"]["goalOptions"]["cards"][number];
type Tpl = "emergency" | "debt" | "trip" | "car" | "other" | "edit";

const fmt0 = (n: number) => money(Math.round(n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The prototype's "Nueva meta" panel (ngPanel): pick what it's for (emergency fund from 3 months of real
 * spending, paying off a card that's connected, a trip, a car, other), then name, amount, monthly saving,
 * an optional date and how it's followed (written down, or a savings account's balance). The hint says
 * when you'll get there. Also edits a goal.
 */
export function GoalSheet({ state, goals, today, onClose, onSaved }: {
  state: GoalSheetState;
  goals: readonly GoalItem[];
  today: Today;
  onClose: () => void;
  onSaved: (msg: string, undo?: () => void) => void;
}) {
  const t = useCopy(personalPagesCopy).goals.p;
  const f = t.form;
  const locale = intlLocale(useLang().lang);
  const uid = useId();
  const utils = trpc.useUtils();
  const opts = trpc.personal.goalOptions.useQuery(undefined, { staleTime: 60_000 });
  const editing = state.mode === "edit" ? state.goal : null;

  const [tpl, setTpl] = useState<Tpl | null>(editing ? "edit" : null);
  const [card, setCard] = useState<Card | null>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [goal, setGoal] = useState(editing ? String(Number(editing.targetAmount)) : "");
  const [monthly, setMonthly] = useState(editing?.monthly ? String(editing.monthly) : "");
  const [date, setDate] = useState(dayString(editing?.deadline));
  const [track, setTrack] = useState<string>(editing?.track === "acct" && editing.accountId ? String(editing.accountId) : "manual");
  const [err, setErr] = useState("");

  const done = () => { void utils.personal.listGoals.invalidate(); void utils.personal.goalOptions.invalidate(); };
  const create = trpc.personal.createGoal.useMutation({ onError: (e) => setErr(e.message) });
  const edit = trpc.personal.editGoal.useMutation({ onError: (e) => setErr(e.message) });
  const archive = trpc.personal.archiveGoal.useMutation();
  const busy = create.isPending || edit.isPending;

  const debt = tpl === "debt" || editing?.kind === "debt";
  const hasEmergency = goals.some((g) => /emergenc/i.test(g.name));
  const spend3 = opts.data?.monthlySpending ? Math.ceil((opts.data.monthlySpending * 3) / 100) * 100 : null;
  const cards = (opts.data?.cards ?? []).filter((c) => c.owed > 0 && !c.usedBy);
  const savings = opts.data?.savings ?? [];

  const start = (k: Tpl, c?: Card) => {
    setTpl(k); setErr(""); setCard(c ?? null); setDate(""); setTrack("manual"); setMonthly("");
    if (k === "emergency") { setName(t.tpl.emergency); setGoal(spend3 ? String(spend3) : ""); }
    else if (k === "debt" && c) { setName(t.tpl.debt(c.name)); setGoal(String(c.owed)); }
    else if (k === "trip") { setName(t.tpl.trip); setGoal(""); }
    else if (k === "car") { setName(t.tpl.car); setGoal(""); }
    else { setName(""); setGoal(""); }
  };

  // ── Live hint (ngHintText) ──
  const goalN = Number(goal);
  const monthlyN = Number(monthly) || 0;
  const cur = editing ? Number(editing.currentAmount) || 0 : 0;
  const rem = round2(goalN - cur);
  let hint: ReactNode;
  if (debt) {
    const c = card ?? (editing?.account ? { name: editing.account.name, owed: editing.owed ?? 0 } : null);
    hint = c ? f.hintDebt(money(c.owed, true), c.name) : null;
  } else if (!(goalN > 0)) hint = f.hintNoGoal;
  else if (rem <= 0) hint = f.hintHave;
  else {
    const parts: ReactNode[] = [];
    if (monthlyN > 0) {
      const [a, b] = f.hintMonthly(fmt0(monthlyN));
      parts.push(<span key="m">{a}<b>{monthName(monthEndAfter(today, Math.ceil(rem / monthlyN)), locale)}</b>{b}</span>);
    }
    if (date) {
      const n = Math.max(1, monthsUntil(today, date));
      const [a, b] = f.hintDate(monthName(date, locale));
      parts.push(<span key="d">{parts.length ? " " : ""}{a}<b>{f.perMonth(fmt0(rem / n))}</b>{b}</span>);
    }
    hint = parts.length ? <>{parts}</> : f.hintAsk;
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nm = name.trim();
    if (!nm) { setErr(f.errName); return; }
    if (debt) {
      if (editing) {
        edit.mutate({ id: editing.id, name: nm, targetAmount: Number(editing.targetAmount), deadline: null }, {
          onSuccess: () => { done(); onSaved(t.toast.saved(nm)); onClose(); },
        });
      } else if (card) {
        create.mutate({ name: nm, targetAmount: card.owed, kind: "debt", track: "debt", accountId: card.id, monthly: null }, {
          onSuccess: (r) => { done(); onSaved(t.toast.created(nm), () => archive.mutate({ id: r.id }, { onSuccess: done })); onClose(); },
        });
      }
      return;
    }
    const g = round2(goalN);
    if (!(g > 0)) { setErr(f.errGoal); return; }
    let m = round2(monthlyN);
    if (!m && !date) { setErr(f.errPlan); return; }
    if (!m && date) m = Math.ceil(g / Math.max(1, monthsUntil(today, date)));
    const acctId = track === "manual" ? null : Number(track);
    const plan = { monthly: m, track: (acctId ? "acct" : "manual") as "acct" | "manual", accountId: acctId };
    setErr("");
    if (editing) {
      edit.mutate({ id: editing.id, name: nm, targetAmount: g, deadline: date || null, ...plan }, {
        onSuccess: () => { done(); onSaved(t.toast.saved(nm)); onClose(); },
      });
    } else {
      create.mutate({ name: nm, targetAmount: g, deadline: date || undefined, kind: "save", ...plan }, {
        onSuccess: (r) => { done(); onSaved(t.toast.created(nm), () => archive.mutate({ id: r.id }, { onSuccess: done })); onClose(); },
      });
    }
  };

  // Months for "¿Para cuándo?": 2 to 36 months from now (and the goal's own date when it's another one).
  const dateOpts: string[] = [];
  for (let i = 2; i <= 36; i++) dateOpts.push(monthEndAfter(today, i));
  if (date && !dateOpts.includes(date)) dateOpts.unshift(date);

  const title = editing ? f.editTitle : debt ? f.debtTitle : f.newTitle;
  const menu: Array<{ k: Tpl; icon: LucideIcon; title: string; sub: string; card?: Card }> = [
    ...(!hasEmergency ? [{ k: "emergency" as Tpl, icon: Shield, title: t.tpl.emergency, sub: spend3 ? t.tpl.emergencySub(fmt0(spend3)) : t.tpl.emergencySubNone }] : []),
    ...cards.map((c) => ({ k: "debt" as Tpl, icon: CreditCard, title: t.tpl.debt(c.name), sub: t.tpl.debtSub(money(c.owed, true)), card: c })),
    { k: "trip", icon: Target, title: t.tpl.trip, sub: t.tpl.tripSub },
    { k: "car", icon: Car, title: t.tpl.car, sub: t.tpl.carSub },
    { k: "other", icon: Plus, title: t.tpl.other, sub: t.tpl.otherSub },
  ];

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 px-5 py-4">
          <SheetTitle className="text-base font-bold text-slate-900">{title}</SheetTitle>
          <SheetDescription className={cn("text-sm text-slate-500", tpl && "sr-only")}>{f.ask}</SheetDescription>
        </SheetHeader>
        <div className="px-5 py-5">
          {!tpl ? (
            opts.isLoading ? (
              <div className="space-y-2" role="status" aria-label={f.loading}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : (
              <ul className="grid gap-1.5">
                {menu.map((m) => (
                  <li key={`${m.k}-${m.card?.id ?? ""}`}>
                    <button type="button" onClick={() => start(m.k, m.card)} data-guide={`goal-tpl-${m.k}`}
                      className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-blue-50 text-blue-600"><m.icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <b className="block text-sm text-slate-900">{m.title}</b>
                        <span className="block text-xs text-slate-500">{m.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <form onSubmit={submit} noValidate>
              <label htmlFor={`${uid}-name`} className={plabel}>{f.name}</label>
              <input id={`${uid}-name`} data-guide="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={f.namePh} autoComplete="off" maxLength={100} className={pinput} />
              {debt ? (
                <dl className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm">
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <dt className="text-slate-500">{f.owedNow}</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{money(card?.owed ?? editing?.owed ?? 0, true)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <dt className="shrink-0 text-slate-500">{f.howDebt}</dt>
                    <dd className="text-right font-medium text-slate-900">{f.debtTrack(card?.name ?? editing?.account?.name ?? "")}</dd>
                  </div>
                </dl>
              ) : (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`${uid}-goal`} className={plabel}>{f.goal}</label>
                      <input id={`${uid}-goal`} data-guide="goal-amount" type="number" inputMode="decimal" min={1} step={50} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="1500" className={pinput} />
                    </div>
                    <div>
                      <label htmlFor={`${uid}-mo`} className={plabel}>{f.monthly}</label>
                      <input id={`${uid}-mo`} data-guide="goal-monthly" type="number" inputMode="decimal" min={0} step={10} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="150" className={pinput} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label htmlFor={`${uid}-date`} className={plabel}>{f.date}</label>
                    <select id={`${uid}-date`} value={date} onChange={(e) => setDate(e.target.value)} className={pinput}>
                      <option value="">{f.noDate}</option>
                      {dateOpts.map((d) => <option key={d} value={d}>{monthName(d, locale)}</option>)}
                    </select>
                  </div>
                  <fieldset className="mt-3">
                    <legend className={plabel}>{f.howTrack}</legend>
                    <div className="grid gap-2">
                      <TrackOpt name={`${uid}-tr`} value="manual" checked={track === "manual"} onPick={setTrack} title={f.manual} sub={f.manualSub} />
                      {savings.map((s) => {
                        const used = s.usedBy && !(editing && editing.accountId === s.id) ? s.usedBy : null;
                        return <TrackOpt key={s.id} name={`${uid}-tr`} value={String(s.id)} checked={track === String(s.id)} onPick={setTrack} disabled={!!used}
                          title={f.acct(s.name)} sub={used ? f.acctUsed(used) : f.acctSub} />;
                      })}
                    </div>
                  </fieldset>
                </>
              )}
              {hint && <p className="mt-3 rounded-[10px] bg-slate-100 px-3 py-2.5 text-sm text-slate-900" aria-live="polite">{hint}</p>}
              {err && <p className="mt-2 text-[13px] text-red-600" role="alert">{err}</p>}
              <div className="mt-3.5 flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={pbtnPrimary} data-guide="goal-save">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{editing ? f.save : f.create}
                </button>
                {!editing && <button type="button" onClick={() => { setTpl(null); setErr(""); }} className={pbtn}>{f.back}</button>}
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TrackOpt({ name, value, checked, onPick, title, sub, disabled }: { name: string; value: string; checked: boolean; onPick: (v: string) => void; title: string; sub: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 transition-colors", checked ? "border-blue-600 bg-blue-50" : "border-slate-200", disabled && "cursor-not-allowed opacity-55")}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={() => onPick(value)} className="mt-1 h-4 w-4 accent-blue-600" />
      <span><b className="block text-sm text-slate-900">{title}</b><small className="block text-xs text-slate-500">{sub}</small></span>
    </label>
  );
}
