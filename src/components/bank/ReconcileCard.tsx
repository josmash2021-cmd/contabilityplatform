// "Cuadrar con tu estado de cuenta" (business Bancos, Pro and Negocio): the owner types the ending balance
// printed on a bank statement, we compare it with the records for that account (api/reconcile-router.ts)
// and, when it matches to the cent, they close the period so its movements can't change by mistake.
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { AlertTriangle, Check, CheckCircle2, Loader2, Lock } from "lucide-react";
import type { AppRouter } from "../../../api/router";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { cuadreCopy } from "@/i18n/copy/cuadre";

export type ReconcileAccount = { id: number; name: string; mask: string | null; institution: string; balance: number };

type Out = inferRouterOutputs<AppRouter>["reconcile"];
type Compared = Out["compare"];
type Cause = Compared["causes"][number];
type CauseTx = Extract<Cause, { kind: "exact" }>["tx"];
type Copy = (typeof cuadreCopy)["es"];

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";
// The prototype's small buttons (.btn.sm): 34px from `sm` up, 44px tap targets on phones.
const btnBase = `inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[13px] font-semibold transition disabled:pointer-events-none disabled:opacity-60 sm:h-[34px] ${focus}`;
const BTN = {
  primary: `${btnBase} bg-blue-600 text-white hover:bg-blue-500`,
  secondary: `${btnBase} border border-slate-200 bg-white text-slate-900 hover:bg-slate-100`,
};
const LINKBTN = `rounded font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700 ${focus}`;
const FIELD = `h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 transition focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-50 sm:h-10 sm:text-sm`;

/** Cents → "$11,794.21"; negatives with a real minus sign: "−$15.49". */
function money(cents: number, signed = false): string {
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(cents) / 100);
  if (cents < 0) return `−${s}`;
  return signed && cents > 0 ? `+${s}` : s;
}

/** "$11,794.21", "11794.21", "-50", "(50.00)" → "11794.21" / "-50" / "-50.00"; null when it isn't an amount. */
function normalizeStatement(raw: string): string | null {
  let s = raw.trim().replace(/[$\s,]/g, "").replace(/−/g, "-");
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  if (s.startsWith(".")) s = `0${s}`;
  return negative && !/^0+(\.0+)?$/.test(s) ? `-${s}` : s;
}

function accountLabel(a: ReconcileAccount): string {
  const bank = a.institution || a.name;
  return a.mask ? `${bank} ••${a.mask}` : a.name;
}

type StepState = "todo" | "cur" | "done";

function Step({ n, state, title, titleFor, children }: { n: number; state: StepState; title: string; titleFor?: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-3 [&+&]:border-t [&+&]:border-dashed [&+&]:border-slate-200" aria-current={state === "cur" ? "step" : undefined}>
      <span
        className={cn(
          "grid h-[26px] w-[26px] place-items-center rounded-full border-[1.5px] text-[13px] font-bold transition-colors motion-reduce:transition-none",
          state === "done" ? "border-emerald-600 bg-emerald-600 text-white" : state === "cur" ? "border-blue-600 bg-white text-blue-600" : "border-slate-200 bg-white text-slate-500",
        )}
        aria-hidden="true"
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0">
        {titleFor
          ? <label htmlFor={titleFor} className={cn("block text-sm font-semibold", state === "todo" ? "text-slate-500" : "text-slate-900")}>{title}</label>
          : <b className={cn("block text-sm font-semibold", state === "todo" ? "text-slate-500" : "text-slate-900")}>{title}</b>}
        {children}
      </div>
    </li>
  );
}

/** One movement in plain words: "NETFLIX.COM −$15.49 del 15 nov". */
function TxText({ tx, t, year }: { tx: CauseTx; t: Copy; year: string }) {
  return <b className="font-semibold text-slate-900">{t.s2.cause.of(tx.description, money(tx.amountCents, true), t.day(tx.date, year))}</b>;
}

function CauseItem({ cause, t, year, period }: { cause: Cause; t: Copy; year: string; period: { start: string; end: string } }) {
  const c = t.s2.cause;
  switch (cause.kind) {
    case "exact":
      return <li><TxText tx={cause.tx} t={t} year={year} /> {c.exact} {c.where[cause.where]}</li>;
    case "duplicates":
      return (
        <>
          {cause.pairs.map((p) => (
            <li key={`${p.a.id}-${p.b.id}`}>
              {c.duplicate} <b className="font-semibold text-slate-900">{p.a.description} {money(p.a.amountCents, true)}</b> {c.twice(t.day(p.a.date, year))}
              {p.isDifference && <> {c.isDifference}</>}
            </li>
          ))}
        </>
      );
    case "edge":
      return (
        <li>
          {cause.edge === "end" ? c.edgeEnd(t.day(period.end, year)) : c.edgeStart(t.day(period.start, year))}
          <ul className="mt-1 grid gap-0.5 text-slate-600">
            {cause.txs.map((tx) => (
              <li key={tx.id} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums">{t.day(tx.date, year)}</span>
                <span className="min-w-0 break-words">{tx.description}</span>
                <span className="font-semibold tabular-nums text-slate-900">{money(tx.amountCents, true)}</span>
              </li>
            ))}
          </ul>
        </li>
      );
    case "stale":
      return <li>{c.stale(t.day(cause.lastSyncedAt, year))}</li>;
    case "unreviewed":
      return <li>{c.unreviewed(cause.count)}</li>;
  }
}

/** "-1234.5" (already normalized) → −123450 cents, digit by digit. */
function statementCents(s: string): number {
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return neg ? -cents : cents;
}

/**
 * The card. `accounts` are the business's connected accounts (as the Bancos screen lists them); the server
 * checks each one belongs to the user and reads its balance and movements itself.
 */
export function ReconcileCard({ accounts }: { accounts: ReconcileAccount[] }) {
  const t = useCopy(cuadreCopy);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const uid = useId();

  const [pickedAccount, setPickedAccount] = useState<number | null>(null);
  const accountId = accounts.some((a) => a.id === pickedAccount) ? (pickedAccount as number) : (accounts[0]?.id ?? null);
  const account = accounts.find((a) => a.id === accountId) ?? null;
  // A period the owner picked (else the server's suggestion), for one account.
  const [custom, setCustom] = useState<{ accountId: number; start: string; end: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState(false);
  const [statement, setStatement] = useState<string | null>(null);
  const [focusInput, setFocusInput] = useState(false);
  const [editor, setEditor] = useState<{ accountId: number; start: string; end: string; touched: boolean; error: string | null } | null>(null);
  const [reopenAsk, setReopenAsk] = useState<number | null>(null);

  const noRetryForbidden = (n: number, err: { data?: { code?: string } | null }) => err.data?.code !== "FORBIDDEN" && n < 1;
  const overview = trpc.reconcile.overview.useQuery(
    { accountId: accountId ?? undefined },
    { enabled: accountId !== null, staleTime: 30_000, retry: noRetryForbidden },
  );
  const ov = overview.data && !overview.data.locked && overview.data.account ? overview.data : null;
  const today = ov?.today ?? "";
  const year = today.slice(0, 4);
  const customHere = custom && custom.accountId === accountId ? custom : null;
  const period = customHere ?? (ov ? { start: ov.suggestion.start, end: ov.suggestion.end } : null);
  const waiting = !customHere && !!ov?.suggestion.waiting;

  const compare = trpc.reconcile.compare.useQuery(
    { accountId: accountId ?? 0, start: period?.start ?? "", end: period?.end ?? "", statement: statement ?? "" },
    { enabled: !!ov && !!period && statement !== null && !waiting, retry: false, staleTime: 0 },
  );
  const result = statement !== null ? compare.data : undefined;

  const resetSteps = () => { setStatement(null); setDraft(""); setDraftError(false); setFocusInput(false); };
  const refresh = () => Promise.all([utils.reconcile.overview.invalidate(), utils.reconcile.compare.invalidate()]);

  const close = trpc.reconcile.close.useMutation({
    onSuccess: async () => {
      toast.success(t.s3.closedToast);
      setCustom(null);
      resetSteps();
      await refresh();
    },
    onError: (e) => toast.error(e.message || t.s3.error),
  });
  const reopen = trpc.reconcile.reopen.useMutation({
    onSuccess: async () => {
      toast.success(t.history.reopenedToast);
      setReopenAsk(null);
      setCustom(null);
      resetSteps();
      await refresh();
    },
    onError: (e) => toast.error(e.message || t.history.error),
  });

  // Hidden for employees (their access doesn't include the bank) and when there's no account.
  if (accounts.length === 0 || accountId === null || account === null) return null;
  if (overview.error?.data?.code === "FORBIDDEN") return null;

  if (overview.data?.locked) {
    return (
      <section className="grid min-w-0 justify-items-start gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-slate-100 p-[18px]" aria-labelledby={`${uid}-lt`}>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{t.locked.badge}</span>
        <h3 id={`${uid}-lt`} className="text-[15px] font-bold text-slate-900">{t.title}</h3>
        <p className="mb-1 text-[13px] text-slate-500">{t.locked.text}</p>
        <button type="button" className={BTN.secondary} onClick={() => navigate("/settings?sec=plan")}>{t.locked.cta}</button>
      </section>
    );
  }

  const shell = (tag: ReactNode, body: ReactNode, sub?: ReactNode) => (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby={`${uid}-t`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${uid}-t`} className="text-[15px] font-bold text-slate-900">{t.title}</h3>
          {sub}
        </div>
        {tag}
      </div>
      {body}
    </section>
  );
  const tagEl = (text: string) => (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{text}</span>
  );

  if (overview.isLoading || (!ov && !overview.error)) {
    return shell(<Skeleton className="h-5 w-20 rounded-full" />, (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-10 w-full max-w-sm rounded-[10px]" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    ));
  }
  if (!ov || !period) {
    return shell(null, (
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600" role="alert">
        <span>{t.loadError}</span>
        <button type="button" className={BTN.secondary} onClick={() => void overview.refetch()}>{t.retry}</button>
      </div>
    ));
  }

  const canChange = ov.canChange;
  const debt = ov.account?.debt ?? false;
  const shownPeriod = waiting && ov.lastClosed ? ov.lastClosed : period;
  const startLabel = t.day(shownPeriod.start, year);
  const endLabel = t.day(shownPeriod.end, year);
  const endDay = t.day(period.end, year);

  const openEditor = () => setEditor({ accountId, start: period.start, end: period.end, touched: false, error: null });
  const applyEditor = (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    const changedAccount = editor.accountId !== accountId;
    if (!changedAccount || editor.touched) {
      if (!editor.start || !editor.end) return setEditor({ ...editor, error: t.editor.missing });
      if (editor.start > editor.end) return setEditor({ ...editor, error: t.editor.order });
      if (editor.end > today) return setEditor({ ...editor, error: t.editor.future(t.day(today, year)) });
    }
    setPickedAccount(editor.accountId);
    // Another account without new dates: start on that account's own suggestion.
    setCustom(changedAccount && !editor.touched ? null : { accountId: editor.accountId, start: editor.start, end: editor.end });
    setEditor(null);
    setReopenAsk(null);
    resetSteps();
  };

  const sub = (
    <p className="mt-0.5 text-[13px] text-slate-500">
      {t.sub(accountLabel(account), startLabel, endLabel)}
      {!waiting && !customHere && ov.suggestion.reopenedAt && <> · {t.reopenedOn(t.day(ov.suggestion.reopenedAt, year))}</>}
      {" · "}
      <button type="button" className={LINKBTN} onClick={openEditor} aria-label={t.changePeriodAria} aria-expanded={!!editor}>{t.changePeriod}</button>
    </p>
  );

  const editorEl = editor && (
    <form onSubmit={applyEditor} className="mb-3 grid gap-3 rounded-xl bg-slate-100 p-3 sm:p-4" aria-label={t.editor.title}>
      <div className={cn("grid gap-3", accounts.length > 1 ? "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]" : "sm:max-w-md sm:grid-cols-2")}>
        {accounts.length > 1 && (
          <div className="grid gap-1">
            <label htmlFor={`${uid}-acc`} className="text-sm font-medium text-slate-700">{t.editor.account}</label>
            <select id={`${uid}-acc`} className={FIELD} value={editor.accountId} onChange={(e) => setEditor({ ...editor, accountId: Number(e.target.value), error: null })}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
            </select>
          </div>
        )}
        <div className="grid gap-1">
          <label htmlFor={`${uid}-from`} className="text-sm font-medium text-slate-700">{t.editor.from}</label>
          <input id={`${uid}-from`} type="date" className={FIELD} value={editor.start} max={today} required
            onChange={(e) => setEditor({ ...editor, start: e.target.value, touched: true, error: null })} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${uid}-to`} className="text-sm font-medium text-slate-700">{t.editor.to}</label>
          <input id={`${uid}-to`} type="date" className={FIELD} value={editor.end} max={today} required
            onChange={(e) => setEditor({ ...editor, end: e.target.value, touched: true, error: null })} />
        </div>
      </div>
      <p className={cn("text-xs", editor.error ? "font-medium text-red-600" : "text-slate-500")} role={editor.error ? "alert" : undefined}>{editor.error ?? t.editor.help}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BTN.primary}>{t.editor.apply}</button>
        <button type="button" className={BTN.secondary} onClick={() => setEditor(null)}>{t.editor.cancel}</button>
      </div>
    </form>
  );

  // ── Periodos anteriores ──
  const history = (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <h4 className="mb-2 text-[13px] font-bold text-slate-500">{t.history.title}</h4>
      {ov.history.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t.history.empty}</p>
      ) : (
        <ul className="grid gap-2">
          {ov.history.map((h) => {
            const range = t.range(h.start, h.end, year);
            return (
              <li key={h.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-slate-100 px-3 py-[11px]">
                <span className="grid w-[22px] place-items-center text-emerald-600"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <b className="block text-sm font-semibold text-slate-900">{range}</b>
                  <span className="block text-xs text-slate-500">{t.history.meta}</span>
                </div>
                {h.canReopen && canChange ? (
                  <button type="button" className={BTN.secondary} aria-label={t.history.reopenAria(range)} aria-expanded={reopenAsk === h.id}
                    onClick={() => setReopenAsk(reopenAsk === h.id ? null : h.id)}>{t.history.reopen}</button>
                ) : <span />}
              </li>
            );
          })}
        </ul>
      )}
      {reopenAsk !== null && canChange && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5 text-[13px] text-slate-900" role="alertdialog" aria-label={t.history.reopen}>
          <AlertTriangle className="h-[15px] w-[15px] shrink-0 text-blue-600" aria-hidden="true" />
          <span className="min-w-0 flex-[1_1_200px]">{t.history.ask}</span>
          <button type="button" className={BTN.primary} disabled={reopen.isPending} onClick={() => reopen.mutate({ id: reopenAsk, confirm: true })}>
            {reopen.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t.history.yes}
          </button>
          <button type="button" className={BTN.secondary} onClick={() => setReopenAsk(null)}>{t.history.no}</button>
        </div>
      )}
    </div>
  );

  // ── Closed, waiting for the next statement ──
  if (waiting && ov.lastClosed) {
    return shell(tagEl(t.closedTag), (
      <>
        {editorEl}
        <div className="grid justify-items-start gap-2 rounded-[10px] bg-emerald-50 px-3 py-2.5 text-[13px] font-semibold text-emerald-700 motion-safe:animate-in motion-safe:fade-in" role="status">
          <span><CheckCircle2 className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />{t.closedBox(startLabel, endLabel, t.day(ov.suggestion.end, year))}</span>
        </div>
        {history}
      </>
    ), sub);
  }

  // ── The three steps ──
  const ok = !!result?.matches;
  const stepN = statement === null ? 1 : ok ? 3 : 2;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = normalizeStatement(draft);
    if (v === null) { setDraftError(true); return; }
    setDraftError(false);
    setStatement(v);
  };
  const editBalance = () => { setStatement(null); setFocusInput(true); };

  const s1State: StepState = statement === null ? "cur" : "done";
  const s1 = (
    <Step n={1} state={s1State} title={t.s1.title} titleFor={statement === null ? `${uid}-in` : undefined}>
      {statement === null ? (
        <>
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={submit} noValidate>
            <span className="relative min-w-0 flex-[1_1_160px] sm:max-w-[220px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500" aria-hidden="true">$</span>
              <input
                id={`${uid}-in`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-label={t.s1.inputAria(endDay)}
                aria-invalid={draftError || undefined}
                aria-describedby={`${uid}-hint`}
                // Only after "Cambiar", to type the new balance right away.
                autoFocus={focusInput}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); if (draftError) setDraftError(false); }}
                className={cn(
                  "h-11 w-full rounded-[10px] border bg-white pl-6 pr-3 text-[15px] font-semibold tabular-nums text-slate-900 transition placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-50 sm:h-9",
                  draftError ? "border-red-500" : "border-slate-200",
                )}
              />
            </span>
            <button type="submit" className={BTN.primary}>{t.s1.compare}</button>
          </form>
          <p id={`${uid}-hint`} className={cn("mt-1.5 text-xs", draftError ? "font-medium text-red-600" : "text-slate-500")} role={draftError ? "alert" : undefined}>
            {draftError ? t.s1.bad : t.s1.hint(endDay, debt)}
          </p>
        </>
      ) : (
        <span className="mt-0.5 block text-[13px] text-slate-500">
          <b className="font-semibold tabular-nums text-slate-900">{money(statementCents(statement))}</b>
          {" "}{t.s1.at(endDay)} · <button type="button" className={LINKBTN} onClick={editBalance} aria-label={t.s1.changeAria}>{t.s1.change}</button>
        </span>
      )}
    </Step>
  );

  const s2State: StepState = statement === null ? "todo" : ok ? "done" : "cur";
  let s2Body: ReactNode = <span className="mt-0.5 block text-[13px] text-slate-500">{t.s2.meta}</span>;
  if (statement !== null) {
    // Also while comparing again (the same balance after "Cambiar el saldo" refetches).
    if (compare.isFetching) {
      s2Body = (
        <div className="mt-2 flex items-center gap-2 rounded-[10px] bg-slate-100 px-3 py-2.5 text-[13px] text-slate-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t.s2.comparing}
        </div>
      );
    } else if (compare.error || !result) {
      s2Body = (
        <div className="mt-2 grid justify-items-start gap-2 rounded-[10px] bg-red-50 px-3 py-2.5 text-[13px] text-red-700" role="alert">
          <span>{compare.error?.message || t.s2.error}</span>
          <button type="button" className={BTN.secondary} onClick={editBalance}>{t.s2.changeBalance}</button>
        </div>
      );
    } else if (result.matches) {
      s2Body = (
        <div className="mt-2 rounded-[10px] bg-emerald-50 px-3 py-2.5 text-[13px] font-semibold text-emerald-700 motion-safe:animate-in motion-safe:fade-in" role="status">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />{t.s2.ok(money(result.book.cents))}
        </div>
      );
    } else {
      const causes = result.causes;
      const hasReview = causes.some((c) => c.kind === "unreviewed");
      s2Body = (
        <div className="mt-2 grid justify-items-start gap-2 rounded-[10px] bg-amber-50 px-3 py-2.5 text-[13px] text-slate-900 motion-safe:animate-in motion-safe:fade-in" role="status">
          <p>
            {t.s2.notBy} <b className="font-bold tabular-nums">{money(Math.abs(result.difference.cents))}</b>
            {causes.length === 0 && result.mismatch !== "period" ? <> {t.s2.noCause(endDay)}</> : "."}
            {" "}<span className="text-slate-600">{t.s2.book(money(result.book.cents), endDay)}</span>
          </p>
          {result.mismatch === "period" && result.previous && (
            <p>{t.s2.periodMismatch(t.day(result.previous.end, year), money(result.previous.statement.cents))}</p>
          )}
          {causes.length > 0 && (
            <div className="grid gap-1">
              <b className="font-semibold">{t.s2.likely}</b>
              <ul className="grid list-disc gap-1.5 pl-5 marker:text-amber-700">
                {causes.map((c, i) => <CauseItem key={`${c.kind}-${i}`} cause={c} t={t} year={year} period={period} />)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {hasReview
              ? <Link to="/transactions" className={BTN.primary}>{t.s2.resolve}</Link>
              : causes.length > 0 && <Link to="/transactions" className={BTN.secondary}>{t.s2.seeMovements}</Link>}
            <button type="button" className={BTN.secondary} onClick={editBalance}>{t.s2.changeBalance}</button>
          </div>
        </div>
      );
    }
  }
  const s2 = <Step n={2} state={s2State} title={t.s2.title}>{s2Body}</Step>;

  const s3State: StepState = ok ? "cur" : "todo";
  let s3Extra: ReactNode = null;
  if (ok && result) {
    if (result.overlap) {
      s3Extra = <p className="mt-2 rounded-[10px] bg-amber-50 px-3 py-2.5 text-[13px] text-slate-900">{t.s3.overlap(t.range(result.overlap.start, result.overlap.end, year))}</p>;
    } else if (result.pendingReview.count > 0) {
      s3Extra = (
        <div className="mt-2 grid justify-items-start gap-2 rounded-[10px] bg-amber-50 px-3 py-2.5 text-[13px] text-slate-900">
          <span>{t.s3.reviewFirst(result.pendingReview.count)}</span>
          <Link to="/transactions" className={BTN.primary}>{t.s2.resolve}</Link>
        </div>
      );
    } else if (!canChange) {
      s3Extra = <span className="mt-1 block text-[13px] font-medium text-slate-600">{t.s3.ownerOnly}</span>;
    } else {
      s3Extra = (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={BTN.primary}
            disabled={close.isPending}
            onClick={() => close.mutate({ accountId, start: period.start, end: period.end, statement: statement ?? "" })}
          >
            {close.isPending ? <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden="true" /> : <Lock className="h-[15px] w-[15px]" aria-hidden="true" />}
            {close.isPending ? t.s3.closing : t.s3.close}
          </button>
        </div>
      );
    }
  }
  const s3 = (
    <Step n={3} state={s3State} title={t.s3.title}>
      <span className="mt-0.5 block text-[13px] text-slate-500">{t.s3.meta}</span>
      {s3Extra}
    </Step>
  );

  return shell(tagEl(t.step(stepN)), (
    <>
      {editorEl}
      <ol className="m-0 list-none p-0">{s1}{s2}{s3}</ol>
      {history}
    </>
  ), sub);
}
