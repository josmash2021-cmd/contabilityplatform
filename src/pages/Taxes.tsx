import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronRight, Circle, FileText, Loader2, Lock, MessageCircle, Paperclip, RefreshCw, Send, ShieldCheck, Trash2, Upload,
  type LucideIcon,
} from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { TaxFileViewer } from "@/components/taxes/TaxFileViewer";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy, type TaxesCopy } from "@/i18n/copy/taxes";
import { TAX_ACCEPT, TaxFileError, formatFileSize, prepareTaxUpload, taxDeadline } from "@/lib/taxFiles";
import { DRAFT_STEP, TAX_QUESTIONS, TAX_STEP_COUNT, canSend, shownDocKinds, type Answers, type TaxDocKind, type TaxMode } from "@contracts/taxRules";

type Current = inferRouterOutputs<AppRouter>["tax"]["current"];
type Doc = Current["docs"][number];
type Msg = Current["messages"][number];

/** Where the person is in the process (and the documents they can still change). */
const FILED_STEP = 4;
const GROUP_ORDER = ["ident", "inc", "biz", "ded"];
const CARD = "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function errorText(t: TaxesCopy, e: unknown): string {
  if (e instanceof TaxFileError) return e.reason === "tooBig" ? t.errors.tooBig : t.errors.type;
  return e instanceof Error && e.message ? e.message : t.errors.generic;
}

/** The app scrolls inside <main>, not the window. */
function scrollPageTop() {
  document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
}

/** The 2.0 Impuestos page: progress, the checklist to send, and the chat with the preparer. */
export default function Taxes() {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = trpc.tax.current.useQuery(undefined, { refetchInterval: 60_000 });
  const [pastId, setPastId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<{ id: number; title: string } | null>(null);

  if (isLoading) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-5" role="status" aria-label={t.loading}>
          <div className="space-y-2"><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="h-4 w-56 max-w-full" /></div>
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="hidden h-64 rounded-2xl lg:block" />
          </div>
        </div>
      </AnimatedPage>
    );
  }
  if (isError || !data) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-3xl">
          <div className={`${CARD} text-center`} role="alert">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600"><AlertCircle className="h-6 w-6" /></span>
            <p className="mt-3 font-semibold text-slate-900">{t.errors.generic}</p>
            <button onClick={() => refetch()} disabled={isFetching} className={`mt-4 inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />{t.retry}
            </button>
          </div>
        </div>
      </AnimatedPage>
    );
  }

  if (!data.access.allowed) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-xl">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Lock className="h-5 w-5" /></span>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{t.locked.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t.locked.text}</p>
            <button onClick={() => navigate("/settings")} className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:w-auto ${FOCUS}`}>
              {t.locked.cta}
            </button>
          </section>
        </div>
      </AnimatedPage>
    );
  }

  const open = (d: Doc) => setViewing({ id: d.id, title: d.source === "preparer" ? t.preparerDocs[d.kind] ?? d.fileName : t.docs[data.mode][d.kind]?.title ?? d.fileName });

  if (pastId !== null) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <PastYear id={pastId} mode={data.mode} onBack={() => setPastId(null)} onOpen={open} />
        <TaxFileViewer docId={viewing?.id ?? null} title={viewing?.title} onClose={() => setViewing(null)} />
      </AnimatedPage>
    );
  }

  const ret = data.ret;
  const step = ret?.step ?? DRAFT_STEP;
  const answers: Answers = ret?.answers ?? {};
  const draft = step === DRAFT_STEP;

  return (
    // In draft the send bar sits at the bottom of the screen: leave room for it.
    <AnimatedPage className={`p-4 lg:p-8 ${draft ? "pb-28 lg:pb-28" : ""}`}>
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title(data.year)}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.subtitle(taxDeadline(data.year, locale))}</p>
          </div>
          <span title={t.free} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
            <Check className="h-3.5 w-3.5" aria-hidden />{t.freeShort}<span className="sr-only">: {t.free}</span>
          </span>
        </header>

        {!data.keyReady && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{t.noKey}
          </div>
        )}

        <StepTracker step={step} stepDates={ret?.stepDates ?? null} locale={locale} />

        {draft ? (
          <Draft mode={data.mode} answers={answers} docs={data.docs} onOpen={open} canSendNow={!!data.missing && canSend(data.missing)} missing={data.missing} />
        ) : (
          <Sent mode={data.mode} step={step} answers={answers} docs={data.docs} ret={ret} locale={locale} onOpen={open} messages={data.messages} />
        )}

        {data.past.length > 0 && (
          <section aria-labelledby="tax-past">
            <h2 id="tax-past" className="mb-3 font-semibold text-slate-900">{t.past.title}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.past.map((p) => (
                <button key={p.id} onClick={() => setPastId(p.id)} className={`flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm ${FOCUS}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{t.past.card(p.taxYear)}</span>
                    <span className="block text-xs text-slate-500">{resultLine(t, p.fedResult, p.stateResult) || (p.step >= 0 ? t.stepsShort[p.step] : t.draftStep)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <TaxFileViewer docId={viewing?.id ?? null} title={viewing?.title} onClose={() => setViewing(null)} />
    </AnimatedPage>
  );
}

function money(n: number) {
  const cents = Math.round(n * 100) % 100 !== 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

type Result = { kind: "refund" | "owe"; amount: number } | null | undefined;
function resultLine(t: TaxesCopy, fed: Result, state: Result): string {
  const part = (label: string, r: Result) => (r ? `${label}: ${r.kind === "refund" ? t.results.refund : t.results.owe} ${money(r.amount)}` : "");
  return [part(t.results.fed, fed), part(t.results.state, state)].filter(Boolean).join(" · ");
}

// ── Progress: every step in one row (a single bar on phones), and what's happening now ──
function StepTracker({ step, stepDates, locale }: { step: number; stepDates: (string | null)[] | null; locale: string }) {
  const t = useCopy(taxesCopy);
  const sent = step !== DRAFT_STEP;
  const current = sent ? t.steps[step] : null;
  const next = t.steps[sent ? step + 1 : 0];
  const all = Array.from({ length: TAX_STEP_COUNT }, (_, i) => i);
  return (
    <section className={CARD} aria-labelledby="tax-progress">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="tax-progress" className="font-semibold text-slate-900">{t.progress.title}</h2>
        <span className="text-sm font-medium text-slate-500">{sent ? t.progress.stepOf(step + 1, TAX_STEP_COUNT) : t.progress.notSent}</span>
      </div>

      {/* Phone: one bar in eight parts */}
      <div className="mt-3 flex gap-1 sm:hidden" aria-hidden>
        {all.map((i) => <span key={i} className={`h-2 flex-1 rounded-full ${step > i ? "bg-emerald-500" : step === i ? "bg-blue-600" : "bg-slate-200"}`} />)}
      </div>

      {/* Wider screens: each step with its name and date (read by screen readers everywhere) */}
      <div className="sr-only sm:not-sr-only">
        <ol className="mt-4 flex" aria-label={t.progress.title}>
          {all.map((i) => {
            const done = step > i;
            const now = step === i;
            const date = stepDates?.[i];
            return (
              <li key={i} className="flex min-w-0 flex-1 flex-col items-center text-center" aria-current={now ? "step" : undefined}>
                <span className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || now ? "bg-emerald-500" : "bg-slate-200"}`} />
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? "bg-emerald-500 text-white" : now ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-slate-100 text-slate-400"}`}>
                    {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                  </span>
                  <span className={`h-0.5 flex-1 ${i === TAX_STEP_COUNT - 1 ? "opacity-0" : done ? "bg-emerald-500" : "bg-slate-200"}`} />
                </span>
                <span className={`mt-2 px-1 text-xs leading-tight ${now ? "font-semibold text-slate-900" : done ? "text-slate-700" : "text-slate-400"}`}>
                  {t.stepsShort[i]}
                  {done && <span className="sr-only"> ({t.checklist.done})</span>}
                </span>
                {date && (done || now) && <span className="mt-0.5 text-[11px] tabular-nums text-slate-400">{new Date(date).toLocaleDateString(locale, { day: "numeric", month: "short" })}</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3 sm:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">{t.now}</p>
        <p className="mt-0.5 font-semibold text-slate-900">{current ? current[0] : t.draftStep}</p>
        {current && <p className="mt-0.5 text-sm text-slate-600">{current[1]}</p>}
        {next && <p className="mt-2 text-xs text-slate-500"><span className="font-semibold text-slate-600">{t.progress.next}:</span> {next[0]}</p>}
      </div>
    </section>
  );
}

// ── Before sending: situation, documents, authorization (and what's still missing) ──
function Draft({ mode, answers, docs, onOpen, canSendNow, missing }: {
  mode: TaxMode; answers: Answers; docs: Doc[]; onOpen: (d: Doc) => void; canSendNow: boolean; missing: Current["missing"];
}) {
  const t = useCopy(taxesCopy);
  const utils = trpc.useUtils();
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const saveAnswers = trpc.tax.saveAnswers.useMutation({
    onSuccess: () => utils.tax.current.invalidate(),
    onError: (e) => toast.error(errorText(t, e)),
  });
  const submit = trpc.tax.submit.useMutation({
    onSuccess: () => { toast.success(t.send.sent); utils.tax.current.invalidate(); scrollPageTop(); },
    onError: (e) => toast.error(errorText(t, e)),
  });
  const ready = canSendNow && consent && terms;
  const missingNames = [
    ...(missing?.questions.length ? [t.send.answer] : []),
    ...(missing?.docs ?? []).map((k) => t.docs[mode][k]?.title ?? k),
    ...(missing?.income ? [t.send.income] : []),
  ];

  const questions = TAX_QUESTIONS[mode];
  const answered = questions.length - (missing?.questions.length ?? 0);
  const kinds = shownDocKinds(mode, answers);
  const requiredTotal = kinds.filter((k) => k.need === "yes").length;
  const requiredHave = requiredTotal - (missing?.docs.length ?? 0);
  const asksIncome = kinds.some((k) => k.need === "income");
  const checklist: [string, boolean][] = [
    [t.checklist.situation(answered, questions.length), (missing?.questions.length ?? 0) === 0],
    [t.checklist.docs(requiredHave, requiredTotal), (missing?.docs.length ?? 0) === 0],
    ...(asksIncome ? [[t.checklist.income, !missing?.income] as [string, boolean]] : []),
    [t.checklist.authorize, consent && terms],
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-5">
          <section className={CARD} aria-labelledby="tax-sit">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="tax-sit" className="font-semibold text-slate-900">{t.situation.title}</h2>
              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">{t.answered(answered, questions.length)}</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{t.situation.text}</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {questions.map((q) => {
                const [label, hint] = t.questions[mode][q] ?? [q, ""];
                const v = answers[q];
                return (
                  <li key={q} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p id={`q-${q}`} className="text-sm font-medium text-slate-900">{label}</p>
                      <p className="text-xs text-slate-500">{hint}</p>
                    </div>
                    <div role="radiogroup" aria-labelledby={`q-${q}`} className="flex w-full shrink-0 gap-1 rounded-[10px] bg-slate-100 p-1 sm:w-auto">
                      {([true, false] as const).map((val) => (
                        <button
                          key={String(val)}
                          role="radio"
                          aria-checked={v === val}
                          disabled={saveAnswers.isPending}
                          onClick={() => saveAnswers.mutate({ answers: { [q]: val } })}
                          className={`inline-flex h-11 min-w-[72px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition sm:h-9 sm:flex-none ${FOCUS} ${v === val ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}
                        >
                          {v === val && <Check className="h-3.5 w-3.5 text-blue-600" aria-hidden />}
                          {val ? t.situation.yes : t.situation.no}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <DocsCard mode={mode} answers={answers} docs={docs} editable onOpen={onOpen} />

          <section className={CARD} aria-labelledby="tax-consent">
            <h2 id="tax-consent" className="font-semibold text-slate-900">{t.consent.title}</h2>
            <div className="mt-3 space-y-2">
              <label className={`flex min-h-[44px] cursor-pointer gap-3 rounded-xl border p-3 text-sm text-slate-700 transition ${consent ? "border-blue-200 bg-blue-50/60" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{t.consent.consent}</span>
              </label>
              <label className={`flex min-h-[44px] cursor-pointer gap-3 rounded-xl border p-3 text-sm text-slate-700 transition ${terms ? "border-blue-200 bg-blue-50/60" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                <span>
                  {t.consent.terms}{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 underline-offset-2 hover:underline">{t.consent.privacyLink}</a>
                </span>
              </label>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className={`${CARD} hidden lg:block`} aria-labelledby="tax-check">
            <h2 id="tax-check" className="font-semibold text-slate-900">{t.checklist.title}</h2>
            <ul className="mt-3 space-y-2.5">
              {checklist.map(([label, ok]) => (
                <li key={label} className="flex items-start gap-2.5 text-sm">
                  {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
                  <span className={ok ? "text-slate-500" : "font-medium text-slate-900"}>
                    {label}<span className="sr-only"> ({ok ? t.checklist.done : t.checklist.todo})</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <HowItWorks />
        </aside>
      </div>

      {/* Send bar: stays at the bottom of the screen (above the phone tab bar). Rendered in <body>
          because the page's entrance animation (a transform) would otherwise pin "fixed" to the page. */}
      {createPortal(
        <div className="fixed inset-x-0 bottom-[calc(66px+env(safe-area-inset-bottom,0px))] z-30 border-t border-slate-200 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-6px_16px_-10px_rgba(15,23,42,0.25)] lg:bottom-0 lg:left-60 lg:pb-3" role="region" aria-label={t.send.button}>
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <p className="min-w-0 flex-1 text-sm">
              {missingNames.length > 0 ? (
                <><b className="block text-slate-900">{t.send.missingTitle}</b><span className="line-clamp-2 text-slate-500">{missingNames.join(", ")}</span></>
              ) : !consent || !terms ? (
                <b className="text-slate-900">{t.send.checks}</b>
              ) : (
                <><b className="block text-emerald-700">{t.send.ready}</b><span className="line-clamp-2 text-slate-500">{t.send.readyText}</span></>
              )}
            </p>
            <button
              disabled={!ready || submit.isPending}
              onClick={() => submit.mutate({ consent: true, terms: true })}
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none focus-visible:ring-offset-2 ${FOCUS}`}
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sm:hidden">{submit.isPending ? t.send.sending : t.send.buttonShort}</span>
              <span className="hidden sm:inline">{submit.isPending ? t.send.sending : t.send.button}</span>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const HOW_ICONS: LucideIcon[] = [Check, FileText, ShieldCheck, MessageCircle];

function HowItWorks() {
  const t = useCopy(taxesCopy);
  return (
    <section className={CARD} aria-labelledby="tax-how">
      <h2 id="tax-how" className="font-semibold text-slate-900">{t.how.title}</h2>
      <ul className="mt-3 space-y-3">
        {t.how.points.map((p, i) => {
          const Icon = HOW_ICONS[i] ?? Check;
          return (
            <li key={p} className="flex items-start gap-3 text-sm text-slate-600">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${i === 0 || i === 2 ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}><Icon className="h-4 w-4" aria-hidden /></span>
              <span className="pt-1.5">{p}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── The document checklist, grouped (Identidad, Ingresos…) ──
function DocsCard({ mode, answers, docs, editable, onOpen, title }: {
  mode: TaxMode; answers: Answers; docs: Doc[]; editable: boolean; onOpen: (d: Doc) => void; title?: string;
}) {
  const t = useCopy(taxesCopy);
  const kinds = shownDocKinds(mode, answers);
  const clientDocs = docs.filter((d) => d.source === "client");
  // In business, "Otros documentos" closes the business group instead of sitting under deductions.
  const groupOf = (id: string) => (mode === "business" && id === "other" ? "biz" : t.docGroup[id] ?? "ded");
  const groups = GROUP_ORDER.map((g) => ({ g, kinds: kinds.filter((k) => groupOf(k.id) === g) })).filter((x) => x.kinds.length);
  const have = kinds.filter((k) => clientDocs.some((d) => d.kind === k.id)).length;
  return (
    <section className={CARD} aria-labelledby="tax-docs">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tax-docs" className="font-semibold text-slate-900">{title ?? t.yourDocs}</h2>
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">{t.uploadedCount(have, kinds.length)}</span>
      </div>
      {editable && <p className="mt-0.5 text-sm text-slate-500">{t.photoTip}</p>}
      {groups.map(({ g, kinds: ks }) => (
        <div key={g} className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t.groups[g]}</p>
          <ul className="mt-1 divide-y divide-slate-100">
            {ks.map((k) => <DocRow key={k.id} mode={mode} kind={k} files={clientDocs.filter((d) => d.kind === k.id)} editable={editable} onOpen={onOpen} />)}
          </ul>
        </div>
      ))}
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50/70 px-3 py-2.5 text-xs text-emerald-800"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />{t.privacy}</p>
    </section>
  );
}

function DocRow({ mode, kind, files, editable, onOpen }: { mode: TaxMode; kind: TaxDocKind; files: Doc[]; editable: boolean; onOpen: (d: Doc) => void }) {
  const t = useCopy(taxesCopy);
  const utils = trpc.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = trpc.tax.upload.useMutation();
  const remove = trpc.tax.deleteDoc.useMutation({
    onSuccess: () => { toast.success(t.removed); utils.tax.current.invalidate(); },
    onError: (e) => toast.error(errorText(t, e)),
  });
  const copy = t.docs[mode][kind.id] ?? { title: kind.id, sub: "" };
  const redo = files.some((f) => f.status === "redo");
  const has = files.length > 0;
  const badge = has
    ? null
    : kind.need === "yes" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">{t.need.required}</span>
    : kind.need === "income" ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{t.need.income}</span>
    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{t.need.optional}</span>;

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const payload = await prepareTaxUpload(file);
        await upload.mutateAsync({ kind: kind.id, ...payload });
      }
      toast.success(t.uploaded);
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      utils.tax.current.invalidate();
    }
  };

  return (
    <li className={`py-3 ${redo ? "-mx-2 rounded-xl bg-red-50/70 px-2" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${has && !redo ? "bg-emerald-50 text-emerald-600" : redo ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400"}`}>
          {has && !redo ? <CheckCircle2 className="h-[18px] w-[18px]" /> : redo ? <AlertCircle className="h-[18px] w-[18px]" /> : <FileText className="h-[18px] w-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-slate-900">{copy.title}</p>
            {badge}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{copy.sub}</p>
        </div>
        {editable && (
          <>
            <input ref={input} type="file" name={`tax-file-${kind.id}`} accept={TAX_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files)} />
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              aria-label={`${has ? t.uploadMore : t.upload}: ${copy.title}`}
              className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold transition disabled:opacity-60 sm:h-9 ${FOCUS} ${has ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "bg-blue-600 text-white shadow-sm hover:bg-blue-500"}`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>{busy ? t.uploading : has ? t.uploadMore : t.upload}</span>
            </button>
          </>
        )}
      </div>
      {has && (
        <ul className="mt-2 space-y-1.5 sm:ml-12">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50/70 pl-3 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <button onClick={() => onOpen(f)} title={t.fileActions(f.fileName)} className={`min-h-[44px] min-w-0 flex-1 truncate rounded text-left font-medium text-slate-800 underline-offset-2 hover:underline sm:min-h-[36px] ${FOCUS}`}>{f.fileName}</button>
              <span className="hidden shrink-0 tabular-nums text-slate-400 sm:inline">{formatFileSize(f.size)}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${f.status === "ok" ? "bg-emerald-100 text-emerald-700" : f.status === "redo" ? "bg-red-100 text-red-700" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{t.docStatus[f.status]}</span>
              {editable && f.status !== "ok" ? (
                <button
                  onClick={() => { if (window.confirm(t.removeConfirm)) remove.mutate({ id: f.id }); }}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600 sm:h-9 sm:w-9 ${FOCUS}`}
                  aria-label={`${t.remove} ${f.fileName}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : <span className="w-2 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
      {files.filter((f) => f.status === "redo" && f.note).map((f) => (
        <p key={`n${f.id}`} className="mt-1.5 text-xs font-semibold text-red-700 sm:ml-12">{f.note}</p>
      ))}
    </li>
  );
}

// ── After sending: what's missing, results, the preparer's documents and the chat ──
function Sent({ mode, step, answers, docs, ret, locale, onOpen, messages }: {
  mode: TaxMode; step: number; answers: Answers; docs: Doc[]; ret: Current["ret"]; locale: string; onOpen: (d: Doc) => void; messages: Msg[];
}) {
  const t = useCopy(taxesCopy);
  const redo = docs.filter((d) => d.source === "client" && d.status === "redo");
  const fromPreparer = docs.filter((d) => d.source === "preparer");
  const editable = step < FILED_STEP;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0 space-y-5">
        {redo.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5" aria-labelledby="tax-todo">
            <h2 id="tax-todo" className="flex items-center gap-2 font-semibold text-red-800"><AlertCircle className="h-4 w-4" />{t.todo.title}</h2>
            <p className="mt-0.5 text-sm text-red-700">{t.todo.text}</p>
            <ul className="mt-2 space-y-1 text-sm text-red-800">
              {redo.map((d) => <li key={d.id}>• <b>{t.docs[mode][d.kind]?.title ?? d.kind}</b>{d.note ? `: ${d.note}` : ""}</li>)}
            </ul>
          </section>
        )}

        {(ret?.fedResult || ret?.stateResult) && (
          <section className={CARD} aria-labelledby="tax-res">
            <h2 id="tax-res" className="font-semibold text-slate-900">{t.results.title}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([[t.results.fed, ret?.fedResult], [t.results.state, ret?.stateResult]] as const).map(([label, r]) => r && (
                <div key={label} className={`rounded-xl p-4 ${r.kind === "refund" ? "bg-emerald-50" : "bg-amber-50"}`}>
                  <p className="text-xs font-medium text-slate-600">{label}</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${r.kind === "refund" ? "text-emerald-700" : "text-amber-800"}`}>{money(r.amount)}</p>
                  <p className="text-xs font-semibold text-slate-600">{r.kind === "refund" ? t.results.refund : t.results.owe}</p>
                </div>
              ))}
            </div>
            {ret?.filingStatus && <p className="mt-3 text-xs text-slate-500">{t.results.filing}: <b className="text-slate-700">{ret.filingStatus}</b></p>}
          </section>
        )}

        {fromPreparer.length > 0 && (
          <section className={CARD} aria-labelledby="tax-prep-docs">
            <h2 id="tax-prep-docs" className="font-semibold text-slate-900">{t.fromPreparer}</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {fromPreparer.map((d) => (
                <li key={d.id}>
                  <button onClick={() => onOpen(d)} className={`flex min-h-[56px] w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-slate-50 ${FOCUS}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{t.preparerDocs[d.kind] ?? d.fileName}</span>
                      <span className="block truncate text-xs text-slate-500">{d.fileName} · {new Date(d.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <DocsCard mode={mode} answers={answers} docs={docs} editable={editable} onOpen={onOpen} title={editable ? t.addDocs : t.yourDocs} />
      </div>
      <div className="lg:sticky lg:top-4">
        <Chat messages={messages} locale={locale} />
      </div>
    </div>
  );
}

// ── Messages with the preparer ──
function Chat({ messages, locale }: { messages: Msg[]; locale: string }) {
  const t = useCopy(taxesCopy);
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const send = trpc.tax.sendMessage.useMutation({
    onSuccess: () => { setBody(""); utils.tax.current.invalidate(); },
    onError: (e) => toast.error(errorText(t, e)),
  });
  const markRead = trpc.tax.markRead.useMutation();
  const unread = messages.some((m) => m.fromRole === "preparer" && !m.readAt);
  const read = () => { if (unread && !markRead.isPending) markRead.mutate(undefined, { onSuccess: () => utils.tax.current.invalidate() }); };
  return (
    <section className={CARD} aria-labelledby="tax-chat" onPointerEnter={read} onFocus={read}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><MessageCircle className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 id="tax-chat" className="flex items-center gap-2 font-semibold text-slate-900">
            {t.chat.title}
            {unread && <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />}
          </h2>
          <p className="text-xs text-slate-500">{t.chat.text}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 lg:max-h-[440px] lg:overflow-y-auto">
        {messages.length === 0 && <li className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{t.chat.empty}</li>}
        {messages.map((m) => {
          const mine = m.fromRole === "client";
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-900"}`}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-slate-500"}`}>
                  {mine ? t.chat.you : m.authorName || t.chat.preparer} · {new Date(m.createdAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate({ body: body.trim() }); }}>
        <label htmlFor="tax-msg" className="mb-1.5 block text-sm font-medium text-slate-700">{t.chat.label}</label>
        <div className="flex items-end gap-2">
          <textarea id="tax-msg" value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} placeholder={t.chat.placeholder}
            className="min-h-[44px] flex-1 resize-none rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none transition focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:text-sm" />
          <button type="submit" disabled={!body.trim() || send.isPending} aria-label={t.chat.send}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-blue-600 text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none ${FOCUS}`}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── A past year's return ──
function PastYear({ id, mode, onBack, onOpen }: { id: number; mode: TaxMode; onBack: () => void; onOpen: (d: Doc) => void }) {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const { data, isLoading, isError, refetch } = trpc.tax.pastYear.useQuery({ returnId: id });
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button onClick={onBack} className={`inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:h-10 ${FOCUS}`}>
        <ArrowLeft className="h-4 w-4" /> {t.past.back}
      </button>
      {isLoading ? (
        <div className="space-y-4" role="status" aria-label={t.loading}>
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : isError || !data ? (
        <div className={`${CARD} text-center`} role="alert">
          <p className="text-sm text-slate-700">{t.errors.generic}</p>
          <button onClick={() => refetch()} className={`mt-3 inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${FOCUS}`}><RefreshCw className="h-4 w-4" />{t.retry}</button>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.past.card(data.ret.taxYear)}</h1>
          <StepTracker step={data.ret.step} stepDates={data.ret.stepDates} locale={locale} />
          {(data.ret.fedResult || data.ret.stateResult) && (
            <p className="rounded-xl bg-white px-4 py-3 text-sm font-medium tabular-nums text-slate-700 ring-1 ring-slate-200">{resultLine(t, data.ret.fedResult, data.ret.stateResult)}</p>
          )}
          <section className={CARD} aria-labelledby="tax-past-docs">
            <h2 id="tax-past-docs" className="font-semibold text-slate-900">{t.past.docs}</h2>
            {data.docs.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t.past.noDocs}</p> : (
              <ul className="mt-2 divide-y divide-slate-100">
                {data.docs.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => onOpen(d)} className={`flex min-h-[56px] w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-slate-50 ${FOCUS}`}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{d.source === "preparer" ? t.preparerDocs[d.kind] ?? d.fileName : t.docs[mode][d.kind]?.title ?? d.kind}</span>
                        <span className="block truncate text-xs text-slate-500">{d.fileName} · {formatFileSize(d.size)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
