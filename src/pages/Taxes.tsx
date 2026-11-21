import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronRight, FileText, Loader2, Lock, MessageCircle, Paperclip, Send, ShieldCheck, Trash2, Upload,
} from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
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

function errorText(t: TaxesCopy, e: unknown): string {
  if (e instanceof TaxFileError) return e.reason === "tooBig" ? t.errors.tooBig : t.errors.type;
  return e instanceof Error && e.message ? e.message : t.errors.generic;
}

export default function Taxes() {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const { data, isLoading, isError } = trpc.tax.current.useQuery(undefined, { refetchInterval: 60_000 });
  const [pastId, setPastId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<{ id: number; title: string } | null>(null);

  if (isLoading) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-neutral-500" role="status">
          <Loader2 className="h-5 w-5 animate-spin" /> {t.loading}
        </div>
      </AnimatedPage>
    );
  }
  if (isError || !data) {
    return <AnimatedPage className="p-4 lg:p-6"><p className="text-sm text-red-600">{t.errors.generic}</p></AnimatedPage>;
  }

  if (!data.access.allowed) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100"><Lock className="h-5 w-5 text-neutral-500" /></span>
          <h1 className="mt-4 text-lg font-semibold text-black">{t.locked.title}</h1>
          <p className="mt-2 text-sm text-neutral-600">{t.locked.text}</p>
          <Button className="mt-5 w-full bg-black text-white hover:bg-neutral-800" onClick={() => navigate("/settings")}>{t.locked.cta}</Button>
        </div>
      </AnimatedPage>
    );
  }

  const open = (d: Doc) => setViewing({ id: d.id, title: d.source === "preparer" ? t.preparerDocs[d.kind] ?? d.fileName : t.docs[data.mode][d.kind]?.title ?? d.fileName });

  if (pastId !== null) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <PastYear id={pastId} mode={data.mode} onBack={() => setPastId(null)} onOpen={open} />
        <TaxFileViewer docId={viewing?.id ?? null} title={viewing?.title} onClose={() => setViewing(null)} />
      </AnimatedPage>
    );
  }

  const ret = data.ret;
  const step = ret?.step ?? DRAFT_STEP;
  const answers: Answers = ret?.answers ?? {};

  return (
    <AnimatedPage className="p-4 pb-28 lg:p-6 lg:pb-28">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <h1 className="text-xl font-semibold text-black">{t.title(data.year)}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t.subtitle(taxDeadline(data.year, locale))}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />{t.free}</p>
        </header>

        {!data.keyReady && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{t.noKey}</div>
        )}

        <StepTracker step={step} stepDates={ret?.stepDates ?? null} locale={locale} />

        {step === DRAFT_STEP ? (
          <Draft mode={data.mode} answers={answers} docs={data.docs} onOpen={open} canSendNow={!!data.missing && canSend(data.missing)} missing={data.missing} />
        ) : (
          <Sent mode={data.mode} step={step} answers={answers} docs={data.docs} ret={ret} locale={locale} onOpen={open} />
        )}

        {step !== DRAFT_STEP && <Chat messages={data.messages} locale={locale} />}

        {data.past.length > 0 && (
          <section aria-labelledby="tax-past">
            <h2 id="tax-past" className="mb-2 text-sm font-semibold text-black">{t.past.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.past.map((p) => (
                <button key={p.id} onClick={() => setPastId(p.id)} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-neutral-300 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-neutral-100"><FileText className="h-5 w-5 text-neutral-600" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-black">{t.past.card(p.taxYear)}</span>
                    <span className="block text-xs text-neutral-500">{resultLine(t, p.fedResult, p.stateResult) || (p.step >= 0 ? t.stepsShort[p.step] : t.draftStep)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-neutral-400" />
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

// ── Progress across the top: every step in one row ──
function StepTracker({ step, stepDates, locale }: { step: number; stepDates: (string | null)[] | null; locale: string }) {
  const t = useCopy(taxesCopy);
  const current = step === DRAFT_STEP ? null : t.steps[step];
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm" aria-label={t.stepsShort.join(", ")}>
      <ol className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
        {Array.from({ length: TAX_STEP_COUNT }, (_, i) => {
          const done = step > i;
          const now = step === i;
          const date = stepDates?.[i];
          return (
            <li key={i} className="flex min-w-[76px] flex-1 flex-col items-center text-center" aria-current={now ? "step" : undefined}>
              <span className="flex w-full items-center">
                <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || now ? "bg-emerald-500" : "bg-neutral-200"}`} />
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? "bg-emerald-500 text-white" : now ? "bg-black text-white ring-4 ring-neutral-200" : "bg-neutral-100 text-neutral-400"}`}>
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={`h-0.5 flex-1 ${i === TAX_STEP_COUNT - 1 ? "opacity-0" : done ? "bg-emerald-500" : "bg-neutral-200"}`} />
              </span>
              <span className={`mt-1.5 text-[11px] leading-tight ${now ? "font-semibold text-black" : done ? "text-neutral-700" : "text-neutral-400"}`}>{t.stepsShort[i]}</span>
              {date && (done || now) && <span className="text-[10px] text-neutral-400">{new Date(date).toLocaleDateString(locale, { day: "numeric", month: "short" })}</span>}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 rounded-xl bg-neutral-50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{t.now}</p>
        <p className="mt-0.5 font-semibold text-black">{current ? current[0] : t.draftStep}</p>
        {current && <p className="mt-0.5 text-sm text-neutral-600">{current[1]}</p>}
      </div>
    </section>
  );
}

// ── Before sending: situation, documents, authorization ──
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
    onSuccess: () => { toast.success(t.send.sent); utils.tax.current.invalidate(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    onError: (e) => toast.error(errorText(t, e)),
  });
  const ready = canSendNow && consent && terms;
  const missingNames = [
    ...(missing?.questions.length ? [t.send.answer] : []),
    ...(missing?.docs ?? []).map((k) => t.docs[mode][k]?.title ?? k),
    ...(missing?.income ? [t.send.income] : []),
  ];

  return (
    <>
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="tax-sit">
        <h2 id="tax-sit" className="font-semibold text-black">{t.situation.title}</h2>
        <p className="mt-0.5 text-sm text-neutral-500">{t.situation.text}</p>
        <ul className="mt-3 divide-y divide-neutral-100">
          {TAX_QUESTIONS[mode].map((q) => {
            const [label, hint] = t.questions[mode][q] ?? [q, ""];
            const v = answers[q];
            return (
              <li key={q} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p id={`q-${q}`} className="text-sm font-medium text-black">{label}</p>
                  <p className="text-xs text-neutral-500">{hint}</p>
                </div>
                <div role="radiogroup" aria-labelledby={`q-${q}`} className="flex w-full shrink-0 gap-1 rounded-lg bg-neutral-100 p-1 sm:w-auto">
                  {([true, false] as const).map((val) => (
                    <button
                      key={String(val)}
                      role="radio"
                      aria-checked={v === val}
                      disabled={saveAnswers.isPending}
                      onClick={() => saveAnswers.mutate({ answers: { [q]: val } })}
                      className={`h-9 min-w-[64px] flex-1 rounded-md px-3 text-sm font-medium transition sm:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${v === val ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-black"}`}
                    >
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

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="tax-consent">
        <h2 id="tax-consent" className="font-semibold text-black">{t.consent.title}</h2>
        <label className="mt-3 flex cursor-pointer gap-3 text-sm text-neutral-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-black" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t.consent.consent}</span>
        </label>
        <label className="mt-3 flex cursor-pointer gap-3 text-sm text-neutral-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-black" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>{t.consent.terms} <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline-offset-2 hover:underline">/privacy</a></span>
        </label>
      </section>

      {/* Send bar: stays at the bottom of the screen. Rendered in <body> because the page's
          entrance animation (a transform) would otherwise pin "fixed" to the page, not the screen. */}
      {createPortal(<div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-56" role="region" aria-label={t.send.button}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="min-w-0 flex-1 text-sm">
            {missingNames.length > 0 ? (
              <><b className="block text-black">{t.send.missingTitle}</b><span className="line-clamp-2 text-neutral-500">{missingNames.join(", ")}</span></>
            ) : !consent || !terms ? (
              <b className="text-black">{t.send.checks}</b>
            ) : (
              <><b className="block text-emerald-700">{t.send.ready}</b><span className="text-neutral-500">{t.send.readyText}</span></>
            )}
          </p>
          <Button
            disabled={!ready || submit.isPending}
            onClick={() => submit.mutate({ consent: true, terms: true })}
            className="h-11 shrink-0 bg-black px-4 text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="ml-1.5">{submit.isPending ? t.send.sending : t.send.button}</span>
          </Button>
        </div>
      </div>, document.body)}
    </>
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
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="tax-docs">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tax-docs" className="font-semibold text-black">{title ?? t.yourDocs}</h2>
        <span className="text-xs text-neutral-400">{kinds.filter((k) => clientDocs.some((d) => d.kind === k.id)).length} / {kinds.length}</span>
      </div>
      {editable && <p className="mt-0.5 text-sm text-neutral-500">{t.photoTip}</p>}
      {groups.map(({ g, kinds: ks }) => (
        <div key={g} className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{t.groups[g]}</p>
          <ul className="mt-1 divide-y divide-neutral-100">
            {ks.map((k) => <DocRow key={k.id} mode={mode} kind={k} files={clientDocs.filter((d) => d.kind === k.id)} editable={editable} onOpen={onOpen} />)}
          </ul>
        </div>
      ))}
      <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />{t.privacy}</p>
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
  const badge = files.length
    ? null
    : kind.need === "yes" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{t.need.required}</span>
    : kind.need === "income" ? <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">{t.need.income}</span>
    : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">{t.need.optional}</span>;

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
    <li className={`py-3 ${redo ? "-mx-2 rounded-lg bg-red-50/60 px-2" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${files.length && !redo ? "bg-emerald-50 text-emerald-600" : redo ? "bg-red-100 text-red-600" : "bg-neutral-100 text-neutral-400"}`}>
          {files.length && !redo ? <CheckCircle2 className="h-4 w-4" /> : redo ? <AlertCircle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-black">{copy.title}</p>
            {badge}
          </div>
          <p className="text-xs text-neutral-500">{copy.sub}</p>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-xs">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <button onClick={() => onOpen(f)} className="min-w-0 truncate text-left font-medium text-neutral-800 underline-offset-2 hover:underline">{f.fileName}</button>
                  <span className="shrink-0 text-neutral-400">{formatFileSize(f.size)}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${f.status === "ok" ? "bg-emerald-50 text-emerald-700" : f.status === "redo" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-500"}`}>{t.docStatus[f.status]}</span>
                  {editable && f.status !== "ok" && (
                    <button
                      onClick={() => { if (window.confirm(t.removeConfirm)) remove.mutate({ id: f.id }); }}
                      className="ml-auto shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                      aria-label={`${t.remove} ${f.fileName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {files.filter((f) => f.status === "redo" && f.note).map((f) => (
            <p key={`n${f.id}`} className="mt-1.5 text-xs font-medium text-red-700">{f.note}</p>
          ))}
        </div>
        {editable && (
          <>
            <input ref={input} type="file" name={`tax-file-${kind.id}`} accept={TAX_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files)} />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} className="h-9 shrink-0 border-neutral-200" aria-label={`${files.length ? t.uploadMore : t.upload}: ${copy.title}`}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              <span className="ml-1">{busy ? t.uploading : files.length ? t.uploadMore : t.upload}</span>
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

// ── After sending: what's missing, results, the preparer's documents ──
function Sent({ mode, step, answers, docs, ret, locale, onOpen }: {
  mode: TaxMode; step: number; answers: Answers; docs: Doc[]; ret: Current["ret"]; locale: string; onOpen: (d: Doc) => void;
}) {
  const t = useCopy(taxesCopy);
  const redo = docs.filter((d) => d.source === "client" && d.status === "redo");
  const fromPreparer = docs.filter((d) => d.source === "preparer");
  const editable = step < FILED_STEP;
  return (
    <>
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
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="tax-res">
          <h2 id="tax-res" className="font-semibold text-black">{t.results.title}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([[t.results.fed, ret?.fedResult], [t.results.state, ret?.stateResult]] as const).map(([label, r]) => r && (
              <div key={label} className={`rounded-xl p-4 ${r.kind === "refund" ? "bg-emerald-50" : "bg-amber-50"}`}>
                <p className="text-xs font-medium text-neutral-600">{label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${r.kind === "refund" ? "text-emerald-700" : "text-amber-800"}`}>{money(r.amount)}</p>
                <p className="text-xs text-neutral-600">{r.kind === "refund" ? t.results.refund : t.results.owe}</p>
              </div>
            ))}
          </div>
          {ret?.filingStatus && <p className="mt-3 text-xs text-neutral-500">{t.results.filing}: <b className="text-neutral-700">{ret.filingStatus}</b></p>}
        </section>
      )}

      {fromPreparer.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="tax-prep-docs">
          <h2 id="tax-prep-docs" className="font-semibold text-black">{t.fromPreparer}</h2>
          <ul className="mt-2 divide-y divide-neutral-100">
            {fromPreparer.map((d) => (
              <li key={d.id}>
                <button onClick={() => onOpen(d)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-neutral-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><FileText className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-black">{t.preparerDocs[d.kind] ?? d.fileName}</span>
                    <span className="block truncate text-xs text-neutral-500">{d.fileName} · {new Date(d.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-neutral-400" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DocsCard mode={mode} answers={answers} docs={docs} editable={editable} onOpen={onOpen} title={editable ? t.addDocs : t.yourDocs} />
    </>
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
  return (
    <section
      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="tax-chat"
      onPointerEnter={() => { if (unread && !markRead.isPending) markRead.mutate(undefined, { onSuccess: () => utils.tax.current.invalidate() }); }}
      onFocus={() => { if (unread && !markRead.isPending) markRead.mutate(undefined, { onSuccess: () => utils.tax.current.invalidate() }); }}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-900 text-white"><MessageCircle className="h-5 w-5" /></span>
        <div>
          <h2 id="tax-chat" className="font-semibold text-black">{t.chat.title}</h2>
          <p className="text-xs text-neutral-500">{t.chat.text}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {messages.length === 0 && <li className="text-sm text-neutral-400">{t.chat.empty}</li>}
        {messages.map((m) => {
          const mine = m.fromRole === "client";
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-sm bg-black text-white" : "rounded-bl-sm bg-neutral-100 text-black"}`}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-white/60" : "text-neutral-400"}`}>
                  {mine ? t.chat.you : m.authorName || t.chat.preparer} · {new Date(m.createdAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate({ body: body.trim() }); }}
      >
        <label htmlFor="tax-msg" className="sr-only">{t.chat.placeholder}</label>
        <textarea id="tax-msg" value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} placeholder={t.chat.placeholder}
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none" />
        <Button type="submit" disabled={!body.trim() || send.isPending} className="h-11 bg-black text-white hover:bg-neutral-800" aria-label={t.chat.send}>
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </section>
  );
}

// ── A past year's return ──
function PastYear({ id, mode, onBack, onOpen }: { id: number; mode: TaxMode; onBack: () => void; onOpen: (d: Doc) => void }) {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const { data, isLoading } = trpc.tax.pastYear.useQuery({ returnId: id });
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
        <ArrowLeft className="h-4 w-4" /> {t.past.back}
      </button>
      {isLoading || !data ? (
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      ) : (
        <>
          <h1 className="text-xl font-semibold text-black">{t.past.card(data.ret.taxYear)}</h1>
          <StepTracker step={data.ret.step} stepDates={data.ret.stepDates} locale={locale} />
          {(data.ret.fedResult || data.ret.stateResult) && (
            <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{resultLine(t, data.ret.fedResult, data.ret.stateResult)}</p>
          )}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-semibold text-black">{t.past.docs}</h2>
            {data.docs.length === 0 ? <p className="mt-2 text-sm text-neutral-500">{t.past.noDocs}</p> : (
              <ul className="mt-2 divide-y divide-neutral-100">
                {data.docs.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => onOpen(d)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-neutral-50">
                      <FileText className="h-4 w-4 shrink-0 text-neutral-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-black">{d.source === "preparer" ? t.preparerDocs[d.kind] ?? d.fileName : t.docs[mode][d.kind]?.title ?? d.kind}</span>
                        <span className="block truncate text-xs text-neutral-500">{d.fileName} · {formatFileSize(d.size)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-neutral-400" />
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
