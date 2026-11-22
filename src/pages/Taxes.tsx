import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AlertCircle, Check, Lock, RefreshCw } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/personal/ConfirmDialog";
import { TaxFileViewer } from "@/components/taxes/TaxFileViewer";
import { TaxTrack } from "@/components/taxes/TaxTrack";
import { TaxDocsCard, TaxDocsDone, TaxPick, type PickFn, type PickSource } from "@/components/taxes/TaxDocs";
import { useMedia } from "@/hooks/useMedia";
import { TaxConsent, TaxQuestions, TaxRefund, TaxSendBar, TaxTodo } from "@/components/taxes/TaxDraft";
import { TaxAgencies, TaxHistory, TaxPreparer } from "@/components/taxes/TaxSide";
import { TaxStepPanel } from "@/components/taxes/TaxStepPanel";
import { TaxCare, TaxPast } from "@/components/taxes/TaxPages";
import { TaxGate } from "@/components/taxes/TaxGate";
import { clearTaxUnlock } from "@/lib/taxUnlock";
import { FILED_STEP, clientFiles, type Current, type Doc } from "@/components/taxes/taxView";
import { listNames } from "@/components/personal/txKit";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { taxesCopy, type TaxesCopy } from "@/i18n/copy/taxes";
import { TaxFileError, prepareTaxUpload } from "@/lib/taxFiles";
import { DRAFT_STEP, canSend, shownDocKinds, type Answers } from "@contracts/taxRules";

const card = "rounded-[14px] border border-slate-200 bg-white p-4";
const cols = "mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function errorText(t: TaxesCopy, e: unknown): string {
  if (e instanceof TaxFileError) return e.reason === "tooBig" ? t.errors.tooBig : t.errors.type;
  return e instanceof Error && e.message ? e.message : t.errors.generic;
}

/** The app scrolls inside <main>, not the window. */
function scrollPageTop() {
  document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
}
const smooth = (): ScrollBehavior => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

type View = { kind: "main" } | { kind: "care" } | { kind: "past"; id: number };

/**
 * The prototype's Impuestos (pTax), personal "Mi declaración" and the business /taxes, over the real tax
 * server: the 8-step track, what's still missing, the deadline, your situation, your preparer and the
 * conversation, your documents (photo, gallery or PDF; encrypted on the server), the authorization and the
 * send bar. After sending, the track can be tapped step by step. Past years and "Cómo cuidamos tus
 * documentos" open as their own views. Preparation is free; state returns are Alabama only.
 */
export default function Taxes() {
  const t = useCopy(taxesCopy);
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = trpc.tax.current.useQuery(undefined, { refetchInterval: 60_000 });
  const [view, setView] = useState<View>({ kind: "main" });
  const [viewing, setViewing] = useState<{ id: number; title: string } | null>(null);
  const go = (v: View) => { setView(v); scrollPageTop(); };

  if (isLoading) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-3.5" role="status" aria-label={t.loading}>
          <div className="space-y-2"><Skeleton className="h-8 w-48 max-w-full" /><Skeleton className="h-4 w-72 max-w-full" /></div>
          <Skeleton className="h-28 rounded-[14px]" />
          <div className="grid gap-3.5 lg:grid-cols-2"><Skeleton className="h-56 rounded-[14px]" /><Skeleton className="h-56 rounded-[14px]" /></div>
        </div>
      </AnimatedPage>
    );
  }
  if (isError || !data) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-3xl">
          <div className={cn(card, "text-center")} role="alert">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600"><AlertCircle className="h-6 w-6" aria-hidden="true" /></span>
            <p className="mt-3 font-semibold text-slate-900">{t.errors.generic}</p>
            <button type="button" onClick={() => refetch()} disabled={isFetching} className={`mt-4 inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />{t.retry}
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
          <section className={cn(card, "p-6 text-center sm:p-8")}>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Lock className="h-5 w-5" aria-hidden="true" /></span>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{t.locked.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t.locked.text}</p>
            <button type="button" onClick={() => navigate("/settings?sec=plan")} className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 sm:w-auto ${FOCUS}`}>
              {t.locked.cta}
            </button>
          </section>
        </div>
      </AnimatedPage>
    );
  }

  if (data.locked) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-3.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">{t.p.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.p.gate.sub}</p>
          </header>
          <TaxGate email={data.maskedEmail} />
        </div>
      </AnimatedPage>
    );
  }

  const open = (d: Doc) => setViewing({ id: d.id, title: d.source === "preparer" ? t.preparerDocs[d.kind] ?? d.fileName : t.docs[data.mode][d.kind]?.title ?? d.fileName });

  return (
    <AnimatedPage className="p-4 lg:p-8">
      {view.kind === "care" ? <TaxCare onBack={() => go({ kind: "main" })} />
        : view.kind === "past" ? <TaxPast id={view.id} mode={data.mode} onBack={() => go({ kind: "main" })} onOpen={open} />
        : <TaxMain data={data} onOpen={open} onCare={() => go({ kind: "care" })} onPast={(id) => go({ kind: "past", id })} />}
      <TaxFileViewer docId={viewing?.id ?? null} title={viewing?.title} onClose={() => setViewing(null)} />
    </AnimatedPage>
  );
}

function TaxMain({ data, onOpen, onCare, onPast }: { data: Current; onOpen: (d: Doc) => void; onCare: () => void; onPast: (id: number) => void }) {
  const t = useCopy(taxesCopy);
  const p = t.p;
  const utils = trpc.useUtils();
  const { mode, year, ret, docs, messages, past, missing } = data;
  const step = ret?.step ?? DRAFT_STEP;
  const draft = step === DRAFT_STEP;
  const answers: Answers = ret?.answers ?? {};
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Doc | null>(null);
  const inputs = { camera: useRef<HTMLInputElement>(null), gallery: useRef<HTMLInputElement>(null), pdf: useRef<HTMLInputElement>(null) };
  const target = useRef<{ kind: string; replace?: Doc } | null>(null);
  const refresh = () => utils.tax.current.invalidate();
  const lock = trpc.tax.lock.useMutation({
    onSettled: () => { clearTaxUnlock(); toast(p.gate.locked); void utils.tax.invalidate(); },
  });
  const titleOf = (k: string) => t.docs[mode][k]?.title ?? k;
  const wide = useMedia("(min-width: 1024px)");

  // ── Upload: the menu picks the source, the matching hidden input opens the camera, gallery or files ──
  const upload = trpc.tax.upload.useMutation();
  const del = trpc.tax.deleteDoc.useMutation();
  const pick: PickFn = (kind, source, replace) => {
    target.current = { kind, replace };
    const el = inputs[source].current;
    if (el) { el.value = ""; el.click(); }
  };
  const onFiles = async (e: ChangeEvent<HTMLInputElement>, source: PickSource) => {
    const list = Array.from(e.target.files ?? []);
    const tg = target.current;
    if (!list.length || !tg) return;
    setBusyKind(tg.kind);
    let done = 0;
    try {
      for (const file of list) {
        const payload = await prepareTaxUpload(file);
        await upload.mutateAsync({ kind: tg.kind, ...payload });
        done++;
      }
      if (tg.replace && tg.replace.status !== "ok") await del.mutateAsync({ id: tg.replace.id }).catch(() => undefined);
      const n = clientFiles(docs, tg.kind).length + done - (tg.replace ? 1 : 0);
      toast.success(n > 1 && source !== "camera" ? p.docs.uploadedMany(titleOf(tg.kind), n) : p.docs.uploaded(titleOf(tg.kind)));
    } catch (err) {
      toast.error(errorText(t, err));
    } finally {
      setBusyKind(null);
      target.current = null;
      void refresh();
    }
  };
  const confirmRemove = () => {
    const d = removing;
    if (!d) return;
    del.mutate({ id: d.id }, {
      onSuccess: () => { toast.success(p.docs.removed(d.fileName)); setRemoving(null); void refresh(); },
      onError: (e) => { toast.error(errorText(t, e)); setRemoving(null); },
    });
  };

  // ── Situation ──
  const saveAnswers = trpc.tax.saveAnswers.useMutation({ onError: (e) => toast.error(errorText(t, e)) });
  const onAnswer = (q: string, v: boolean | null) => {
    const added = v === true ? shownDocKinds(mode, { ...answers, [q]: true }).filter((k) => k.when === q && clientFiles(docs, k.id).length === 0).map((k) => titleOf(k.id)) : [];
    saveAnswers.mutate({ answers: { [q]: v } }, {
      onSuccess: () => { void refresh(); toast.success(added.length ? p.q.added(listNames(added, p.and)) : v === null ? p.q.cleared : p.q.saved); },
    });
  };

  // ── Send ──
  const submit = trpc.tax.submit.useMutation({
    onSuccess: () => { toast.success(p.send.sent); void refresh(); scrollPageTop(); },
    onError: (e) => toast.error(errorText(t, e)),
  });
  const missingNames = [
    ...(missing?.questions.length ? [p.send.answer] : []),
    ...(missing?.docs ?? []).map(titleOf),
    ...(missing?.income ? [p.send.income] : []),
  ];
  const ready = !!missing && canSend(missing);
  const hasW2 = mode === "personal" ? clientFiles(docs, "w2").length > 0 : null;
  const goQuestions = () => document.getElementById("tax-q")?.scrollIntoView({ block: "start", behavior: smooth() });
  const goDocs = () => document.getElementById("tax-docs")?.scrollIntoView({ block: "start", behavior: smooth() });
  const goConsent = () => {
    const el = document.getElementById("tax-consent");
    el?.scrollIntoView({ block: "center", behavior: smooth() });
    el?.querySelector("input")?.focus({ preventScroll: true });
  };

  const header = (
    <header className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">{p.title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{p.subtitle(year)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span title={t.free} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />{p.free}<span className="sr-only">: {t.free}</span>
        </span>
        {data.gate && (
          <button type="button" onClick={() => lock.mutate()} disabled={lock.isPending} title={p.gate.lockHint}
            className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}>
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />{p.gate.lock}<span className="sr-only">: {p.gate.lockHint}</span>
          </button>
        )}
      </div>
    </header>
  );
  const keyWarn = !data.keyReady && (
    <div className="mb-3.5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t.noKey}
    </div>
  );
  const foot = (
    <div className="mt-5 flex justify-center">
      <button type="button" onClick={onCare} className={`inline-flex min-h-11 items-center gap-1.5 rounded-md text-[13px] font-semibold text-blue-600 hover:underline ${FOCUS}`}>
        <Lock className="h-[15px] w-[15px]" aria-hidden="true" />{p.care.link}
      </button>
    </div>
  );
  const fileInputs = (
    <>
      <input ref={inputs.camera} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFiles(e, "camera")} />
      <input ref={inputs.gallery} type="file" accept="image/*" multiple className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFiles(e, "gallery")} />
      <input ref={inputs.pdf} type="file" accept="application/pdf" multiple className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFiles(e, "pdf")} />
    </>
  );
  const removeDialog = (
    <ConfirmDialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }}
      title={p.docs.removeTitle(removing?.fileName ?? "")} text={p.docs.removeText} confirmLabel={p.docs.removeOk} cancelLabel={p.prep.cancel}
      busy={del.isPending} onConfirm={confirmRemove} />
  );

  if (draft) {
    const unanswered = missing?.questions.length ?? 0;
    const todo = (
      <TaxTodo mode={mode} answers={answers} docs={docs} unanswered={unanswered} incomeMissing={!!missing?.income}
        onPick={pick} busyKind={busyKind} onGoQuestions={goQuestions} onGoDocs={goDocs} />
    );
    return (
      <div className="mx-auto max-w-6xl">
        {header}{keyWarn}
        <TaxTrack title={p.track.title(year)} step={DRAFT_STEP} stepDates={null} ready={ready} />
        {/* Phones: what's missing comes right under the track. */}
        {!wide && <div className="mt-3.5">{todo}</div>}
        {/* Left: the three parts in their order (1 situación, 2 documentos, 3 autoriza). Right: what's missing,
            the deadline, your preparer and where it goes. */}
        <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-3.5">
            <TaxQuestions n={1} id="tax-q" mode={mode} year={year} answers={answers} busy={saveAnswers.isPending} onAnswer={onAnswer} />
            <TaxDocsCard n={2} id="tax-docs" mode={mode} answers={answers} docs={docs} onPick={pick} busyKind={busyKind} onOpen={onOpen} onRemove={setRemoving} />
            <TaxConsent n={3} id="tax-consent" consent={consent} terms={terms} onConsent={setConsent} onTerms={setTerms} onCare={onCare} />
          </div>
          <aside className="grid min-w-0 gap-3.5">
            {wide && todo}
            <TaxRefund year={year} last={past[0] ?? null} />
            <TaxPreparer messages={messages} fallbackName={data.preparerName} />
            <TaxAgencies year={year} stack />
            {past.length ? <TaxHistory past={past} onOpen={onPast} /> : null}
          </aside>
        </div>
        {foot}
        <TaxSendBar missing={missingNames} consentOk={consent && terms} hasW2={hasW2} sending={submit.isPending}
          onSend={() => submit.mutate({ consent: true, terms: true })} onGoConsent={goConsent} />
        {fileInputs}{removeDialog}
      </div>
    );
  }

  const sel = selected === null || selected > step ? step : selected;
  const editable = step < FILED_STEP;
  const redo = docs.filter((d) => d.source === "client" && d.status === "redo");
  const prepDocs = docs.filter((d) => d.source === "preparer");
  return (
    <div className="mx-auto max-w-6xl">
      {header}{keyWarn}
      <TaxTrack title={p.track.title(year)} step={step} stepDates={ret?.stepDates} selected={sel} onSelect={(i) => setSelected(i === step ? null : i)} />
      {/* What the preparer asked to upload again: once, here, each with its own button. */}
      {redo.length > 0 && editable && (
        <section className="mt-3.5 rounded-[14px] border border-amber-200 bg-amber-50 p-4" aria-labelledby="tax-redo-h">
          <h2 id="tax-redo-h" className="flex items-center gap-2 font-semibold text-amber-900"><AlertCircle className="h-4 w-4" aria-hidden="true" />{t.todo.title}</h2>
          <p className="mt-0.5 text-sm text-amber-800">{t.todo.text}</p>
          <ul className="mt-2.5 grid gap-2">
            {redo.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-amber-100">
                <span className="min-w-0 flex-[1_1_220px] text-sm text-amber-900"><b>{titleOf(d.kind)}</b>{d.note ? <span className="block text-[13px] text-amber-800">{d.note}</span> : null}</span>
                <TaxPick kind={d.kind} title={titleOf(d.kind)} has replace={d} onPick={pick} busy={busyKind === d.kind} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className={cols}>
        {ret && <TaxStepPanel i={sel} ret={ret} mode={mode} docs={docs} onOpen={onOpen} onSeeNow={() => setSelected(null)} />}
        <div className="grid min-w-0 gap-3.5">
          <TaxAgencies year={year} stack />
          <TaxHistory past={past} onOpen={onPast} />
          <TaxPreparer messages={messages} compact fallbackName={data.preparerName} />
        </div>
      </div>
      <div className="mt-3.5 grid gap-3.5">
        {editable ? (
          <>
            <TaxDocsCard mode={mode} answers={answers} docs={docs} onPick={pick} busyKind={busyKind} onOpen={onOpen} onRemove={setRemoving} />
            {prepDocs.length > 0 && <TaxDocsDone mode={mode} docs={prepDocs} onOpen={onOpen} preparerOnly />}
          </>
        ) : <TaxDocsDone mode={mode} docs={docs} onOpen={onOpen} />}
      </div>
      {foot}
      {fileInputs}{removeDialog}
    </div>
  );
}
