// ── Impuestos: the preparer's pages (admins) ──
// /admin/impuestos      → every client's return, newest activity first.
// /admin/impuestos/:id  → one return: steps, answers, documents, results, messages.
// All words come from src/i18n/copy/taxes.ts. No IRS or Alabama logos or seals.
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  AlertCircle, Check, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileText, Inbox, Loader2, Lock,
  MessageCircle, Receipt, RotateCcw, Shield, Trash2, Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaxFileViewer } from "@/components/taxes/TaxFileViewer";
import { TaxChat, type ChatMsg } from "@/components/taxes/TaxChat";
import { useTaxChat } from "@/components/taxes/useTaxChat";
import { useChatPresence, useTaxLive, useTypingFlag } from "@/hooks/useTaxLive";
import { taxLiveCopy } from "@/i18n/copy/taxLive";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxesCopy, type TaxesCopy } from "@/i18n/copy/taxes";
import { TAX_ACCEPT, TaxFileError, formatFileSize, prepareTaxUpload } from "@/lib/taxFiles";
import { cn } from "@/lib/utils";
import {
  DRAFT_STEP, ID_TYPES, PREPARER_DOC_KINDS, TAX_DOC_KINDS, TAX_QUESTIONS, TAX_STEP, TAX_STEP_COUNT, stepBlock, type IdType,
  type Missing, type PreparerDocKind, type StepNeeds, type TaxDocMeta, type TaxMode, type TaxResult,
} from "@contracts/taxRules";

type Viewing = { id: number; title: string } | null;
type Choice = "refund" | "owe" | "none";

const MAX_AMOUNT = 10_000_000;
const selectClass =
  "h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-800 shadow-xs outline-none focus-visible:border-neutral-400 focus-visible:ring-[3px] focus-visible:ring-neutral-300";
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

// ── Small helpers ──
function fmtDate(d: Date | string, locale: string) {
  return new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(d: Date | string, locale: string) {
  return new Date(d).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function stepLabel(t: TaxesCopy, step: number, long = false) {
  if (step === DRAFT_STEP) return t.draftStep;
  return (long ? t.steps[step]?.[0] : t.stepsShort[step]) ?? String(step);
}

function errorText(t: TaxesCopy, e: unknown): string {
  if (e instanceof TaxFileError) return e.reason === "tooBig" ? t.errors.tooBig : t.errors.type;
  return e instanceof Error && e.message ? e.message : t.errors.generic;
}

/** After every change the return and the list are fetched again. */
function useRefresh() {
  const utils = trpc.useUtils();
  return () => Promise.all([utils.tax.adminGet.invalidate(), utils.tax.adminList.invalidate()]);
}

function useErrorToast() {
  const t = useCopy(taxesCopy);
  return (e: { message: string }) => toast.error(e.message || t.errors.generic);
}

// ── Page ──
export default function AdminTaxes() {
  const { isAdmin } = useAuth();
  const { id } = useParams<{ id: string }>();
  if (!isAdmin) return <Restricted />;
  return id ? <ReturnDetail key={id} returnId={Number(id)} /> : <ReturnList />;
}

function Restricted() {
  const t = useCopy(taxesCopy);
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="text-center">
        <Shield className="mx-auto mb-3 h-12 w-12 text-neutral-300" aria-hidden />
        <h1 className="text-lg font-semibold text-neutral-700">{t.admin.restrictedTitle}</h1>
        <p className="mt-1 text-sm text-neutral-400">{t.admin.restricted}</p>
      </div>
    </div>
  );
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-1 rounded-md text-sm text-neutral-500 transition-colors hover:text-black", focusRing)}>
      <ChevronLeft className="h-4 w-4" aria-hidden /> {label}
    </Link>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-neutral-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

function Avatar({ name, dark = false }: { name: string; dark?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        dark ? "h-12 w-12 rounded-2xl bg-white/15 text-lg text-white" : "h-9 w-9 bg-neutral-100 text-xs text-neutral-600 ring-1 ring-black/5",
      )}
    >
      {(name.trim() || "?").charAt(0).toUpperCase()}
    </span>
  );
}

/** "Por revisar: 2" / "Mensajes nuevos: 1" chips. */
function CountChip({ n, label, kind, numberOnly = false }: { n: number; label: string; kind: "docs" | "msgs"; numberOnly?: boolean }) {
  if (n <= 0) {
    return numberOnly ? <span className="text-xs text-neutral-300">0<span className="sr-only"> {label}</span></span> : null;
  }
  const Icon = kind === "docs" ? FileText : MessageCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        kind === "docs" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {numberOnly ? (<>{n}<span className="sr-only"> {label}</span></>) : `${label}: ${n}`}
    </span>
  );
}

// ── List ──
function ReturnList() {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const { data, isLoading, isError } = trpc.tax.adminList.useQuery(undefined, { refetchInterval: 120_000, refetchOnWindowFocus: true });
  const utils = trpc.useUtils();
  useTaxLive({ kind: "list" }, { onChanged: () => void utils.tax.adminList.invalidate() });
  const rows = data ?? [];
  const toReview = rows.reduce((n, r) => n + r.pendingDocs, 0);
  const unread = rows.reduce((n, r) => n + r.unreadMessages, 0);
  const href = (id: number) => `/admin/impuestos/${id}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-6">
      <BackLink to="/admin" label={t.admin.backPanel} />

      <div className="rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-800 p-5 text-white sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15" aria-hidden>
              <Receipt className="h-6 w-6 text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{t.admin.title}</h1>
              <p className="text-sm text-neutral-300">{t.admin.subtitle}</p>
            </div>
          </div>
          {(toReview > 0 || unread > 0) && (
            <div className="flex flex-wrap gap-2">
              <CountChip n={toReview} label={t.admin.toReview} kind="docs" />
              <CountChip n={unread} label={t.admin.newMessages} kind="msgs" />
            </div>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm" aria-label={t.admin.title}>
        {isLoading ? (
          <Loading label={t.admin.loading} />
        ) : isError ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-red-600" role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden /> {t.errors.generic}
          </p>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-sm text-neutral-400">
            <Inbox className="mx-auto mb-2 h-8 w-8 text-neutral-300" aria-hidden />
            {t.admin.empty}
          </div>
        ) : (
          <>
            {/* Phone: stacked cards */}
            <ul className="divide-y divide-neutral-100 md:hidden">
              {rows.map((r) => {
                const name = r.name || r.email || t.admin.noName;
                return (
                  <li key={r.id}>
                    <Link to={href(r.id)} className="flex items-start gap-3 px-4 py-4 outline-none transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900">
                      <Avatar name={name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-black">{name}</p>
                        {r.email && r.email !== name && <p className="truncate text-xs text-neutral-500">{r.email}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="border-neutral-200 text-[11px] text-neutral-600">{t.admin.mode[r.mode] ?? r.mode}</Badge>
                          <Badge variant="outline" className="border-neutral-200 text-[11px] text-neutral-600">
                            <span className="sr-only">{t.admin.year} </span>{r.taxYear}
                          </Badge>
                          <Badge className="border-0 bg-neutral-900 text-[11px] text-white">
                            <span className="sr-only">{t.admin.step}: </span>{stepLabel(t, r.step)}
                          </Badge>
                          <CountChip n={r.pendingDocs} label={t.admin.toReview} kind="docs" />
                          <CountChip n={r.unreadMessages} label={t.admin.newMessages} kind="msgs" />
                        </div>
                        <p className="mt-2 text-[11px] text-neutral-400">{t.admin.updated}: {fmtDate(r.updatedAt, locale)}</p>
                      </div>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-neutral-300" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-6 py-3 font-semibold">{t.admin.client}</th>
                  <th scope="col" className="px-3 py-3 font-semibold">{t.admin.kind}</th>
                  <th scope="col" className="px-3 py-3 font-semibold">{t.admin.year}</th>
                  <th scope="col" className="px-3 py-3 font-semibold">{t.admin.step}</th>
                  <th scope="col" className="px-3 py-3 text-center font-semibold">{t.admin.toReview}</th>
                  <th scope="col" className="px-3 py-3 text-center font-semibold">{t.admin.newMessages}</th>
                  <th scope="col" className="px-3 py-3 font-semibold">{t.admin.updated}</th>
                  <th scope="col" className="w-10 px-3 py-3"><span className="sr-only">{t.view}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => {
                  const name = r.name || r.email || t.admin.noName;
                  return (
                    <tr key={r.id} onClick={() => navigate(href(r.id))} className="group cursor-pointer transition-colors hover:bg-neutral-50/70">
                      <td className="w-full max-w-0 px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={name} />
                          <div className="min-w-0">
                            <Link
                              to={href(r.id)}
                              onClick={(e) => e.stopPropagation()}
                              className={cn("block truncate rounded-sm font-medium text-black hover:underline", focusRing)}
                            >
                              {name}
                            </Link>
                            {r.email && r.email !== name && <p className="truncate text-xs text-neutral-500">{r.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-neutral-600">{t.admin.mode[r.mode] ?? r.mode}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-neutral-600">{r.taxYear}</td>
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.step === DRAFT_STEP ? "bg-neutral-100 text-neutral-600" : "bg-neutral-900 text-white")}>
                          {stepLabel(t, r.step)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center"><CountChip n={r.pendingDocs} label={t.admin.toReview} kind="docs" numberOnly /></td>
                      <td className="px-3 py-3.5 text-center"><CountChip n={r.unreadMessages} label={t.admin.newMessages} kind="msgs" numberOnly /></td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-xs text-neutral-400">{fmtDate(r.updatedAt, locale)}</td>
                      <td className="px-3 py-3.5">
                        <ChevronRight className="h-4 w-4 text-neutral-300 transition-all group-hover:translate-x-0.5 group-hover:text-neutral-600" aria-hidden />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}

// ── Detail ──
function ReturnDetail({ returnId }: { returnId: number }) {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();
  const valid = Number.isInteger(returnId) && returnId > 0;
  const { data, isLoading, error } = trpc.tax.adminGet.useQuery({ returnId }, { enabled: valid, refetchInterval: 120_000, refetchOnWindowFocus: true });
  const [viewing, setViewing] = useState<Viewing>(null);
  // Live: what the client does shows at once; "escribiendo…" and "En línea" while they have the chat open.
  const typing = useTypingFlag();
  const [online, setOnline] = useState<boolean | null>(null);
  useTaxLive(valid ? { kind: "preparer", returnId } : null, {
    onChanged: () => { void utils.tax.adminGet.invalidate({ returnId }); void utils.tax.adminList.invalidate(); },
    onTyping: typing.ping, onPresence: setOnline,
  });
  // A new message from the client: "escribiendo…" stops.
  const lastClient = [...(data?.messages ?? [])].reverse().find((m) => m.fromRole === "client")?.id ?? 0;
  const { stop: stopTyping } = typing;
  useEffect(() => {
    if (!lastClient) return;
    const id = setTimeout(stopTyping, 0);
    return () => clearTimeout(id);
  }, [lastClient, stopTyping]);

  if (!valid || error) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-6">
        <BackLink to="/admin/impuestos" label={t.admin.back} />
        <p className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600" role="alert">
          <AlertCircle className="h-4 w-4 text-red-500" aria-hidden />
          {!valid || error?.data?.code === "NOT_FOUND" ? t.admin.notFound : error?.message || t.errors.generic}
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-6">
        <BackLink to="/admin/impuestos" label={t.admin.back} />
        <Loading label={t.admin.loading} />
      </div>
    );
  }

  const { ret, docs, messages, missing, idCheck, needs } = data;
  const mode: TaxMode = ret.mode;
  const name = ret.name || ret.email || t.admin.noName;
  const resultsKey = JSON.stringify([ret.filingStatus, ret.fedResult, ret.stateResult, ret.legalName]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6 xl:max-w-[1320px]">
      <BackLink to="/admin/impuestos" label={t.admin.back} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-800 p-5 text-white sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar name={name} dark />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold">{name}</h1>
            {ret.email && ret.email !== name && <p className="truncate text-sm text-neutral-300">{ret.email}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge className="border-0 bg-white/15 text-white">{t.admin.mode[mode] ?? mode}</Badge>
              <Badge className="border-0 bg-white/15 text-white">{t.admin.year} {ret.taxYear}</Badge>
              <Badge className="border-0 bg-white text-black">{stepLabel(t, ret.step, true)}</Badge>
              {ret.submittedAt && <span className="text-xs text-neutral-300">{t.admin.sentOn(fmtDate(ret.submittedAt, locale))}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <Card className="gap-4 border-neutral-200/80 shadow-sm">
        <CardHeader>
          <h2 className="text-base font-semibold leading-none">{t.admin.step}</h2>
        </CardHeader>
        <CardContent>
          <StepTracker step={ret.step} dates={ret.stepDates} />
          <StepControl key={ret.step} returnId={ret.id} step={ret.step} needs={needs} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <AnswersCard mode={mode} answers={ret.answers} missing={missing} />
        <ResultsForm key={resultsKey} returnId={ret.id} filingStatus={ret.filingStatus} fed={ret.fedResult} state={ret.stateResult} legalName={ret.legalName ?? ret.name ?? ""} />
      </div>

      <SignCard key={`${ret.step}-${idCheck?.checkedAt ?? ""}`} returnId={ret.id} step={ret.step} approvedAt={ret.approvedAt} idCheck={idCheck} legalName={ret.legalName ?? ret.name ?? ""} />
      <ClientDocs mode={mode} docs={docs} onView={setViewing} />
      <PreparerDocs returnId={ret.id} docs={docs} onView={setViewing} />
      </div>

      <AdminChat returnId={ret.id} clientName={name} messages={messages as ChatMsg[]} online={online ?? data.clientOnline} typing={typing.typing} />
      </div>

      <TaxFileViewer admin docId={viewing?.id ?? null} title={viewing?.title} onClose={() => setViewing(null)} />
    </div>
  );
}

// ── Signing the 8879: in person (photo ID checked, signing opened in the app) or on paper ──
type IdCheck = { idType: string; taxIdKind: string; taxIdLast4: string; checkedByName: string | null; checkedAt: string; openUntil: string | null; open: boolean } | null;

function SignCard({ returnId, step, approvedAt, idCheck, legalName }: { returnId: number; step: number; approvedAt: Date | string | null; idCheck: IdCheck; legalName: string }) {
  const t = useCopy(taxesCopy);
  const c = t.signCard;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefresh();
  const onError = useErrorToast();
  const ids = { type: useId(), name: useId(), kind: useId(), tin: useId(), address: useId(), dob: useId(), photo: useId() };
  const [again, setAgain] = useState(false);
  const [idType, setIdType] = useState<IdType>("license");
  const [name, setName] = useState(legalName);
  const [taxIdKind, setTaxIdKind] = useState<"ssn" | "itin">("ssn");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState("");
  const [photo, setPhoto] = useState(false);
  const done = { onSuccess: async () => { toast.success(t.admin.saved); setAgain(false); setTaxId(""); setPhoto(false); await refresh(); }, onError };
  const check = trpc.tax.adminIdCheck.useMutation(done);
  const openSigning = trpc.tax.adminOpenSigning.useMutation(done);
  const atSign = step === TAX_STEP.sign;
  const ready = name.trim().length >= 3 && taxId.replace(/\D/g, "").length === 9 && address.trim().length >= 5 && !!dob && photo;
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) : "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    check.mutate({ returnId, idType, name: name.trim(), taxIdKind, taxId, address: address.trim(), dob, photoMatched: true });
  };

  return (
    <Card className="gap-4 border-neutral-200/80 shadow-sm" data-sign-card="">
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base font-semibold leading-none"><Shield className="h-4 w-4" aria-hidden />{c.title}</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {approvedAt ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden />{c.signedOn(fmtDate(approvedAt, locale))}</p>
        ) : !atSign ? (
          <p className="text-sm text-neutral-500">{c.notYet}</p>
        ) : (
          <>
            {idCheck && !again ? (
              <div className="space-y-3">
                <p className="text-sm text-neutral-700">
                  {c.checked(fmtDateTime(idCheck.checkedAt, locale), idCheck.checkedByName ?? "—", c.idTypes[idCheck.idType] ?? idCheck.idType, `${idCheck.taxIdKind === "itin" ? "ITIN" : "SSN"} ***-**-${idCheck.taxIdLast4}`)}
                </p>
                <p className={cn("flex items-center gap-2 text-sm font-medium", idCheck.open ? "text-emerald-700" : "text-neutral-500")} data-sign-state={idCheck.open ? "open" : "closed"}>
                  <span className={cn("h-2 w-2 rounded-full", idCheck.open ? "animate-pulse bg-emerald-500 motion-reduce:animate-none" : "bg-neutral-300")} aria-hidden />
                  {idCheck.open ? c.openUntil(time(idCheck.openUntil)) : c.closed}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={openSigning.isPending} onClick={() => openSigning.mutate({ returnId, open: !idCheck.open })}
                    className={idCheck.open ? "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50" : "bg-black text-white hover:bg-neutral-800"}>
                    {openSigning.isPending && <Loader2 className="animate-spin" aria-hidden />}{idCheck.open ? c.close : c.open}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAgain(true)}>{c.again}</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-neutral-600">{c.intro}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.type} className="text-xs text-neutral-500">{c.idType}</Label>
                    <select id={ids.type} value={idType} onChange={(e) => { const v = ID_TYPES.find((x) => x === e.target.value); if (v) setIdType(v); }} className={selectClass}>
                      {ID_TYPES.map((k) => <option key={k} value={k}>{c.idTypes[k]}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.name} className="text-xs text-neutral-500">{c.name}</Label>
                    <Input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoComplete="off" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.tin} className="text-xs text-neutral-500">{c.taxId}</Label>
                    <div className="flex gap-2">
                      <select aria-label={c.taxIdKind} value={taxIdKind} onChange={(e) => setTaxIdKind(e.target.value === "itin" ? "itin" : "ssn")} className={cn(selectClass, "w-24 shrink-0")}>
                        <option value="ssn">SSN</option><option value="itin">ITIN</option>
                      </select>
                      <Input id={ids.tin} value={taxId} onChange={(e) => setTaxId(e.target.value)} inputMode="numeric" maxLength={11} autoComplete="off" placeholder="123-45-6789" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={ids.dob} className="text-xs text-neutral-500">{c.dob}</Label>
                    <Input id={ids.dob} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={ids.address} className="text-xs text-neutral-500">{c.address}</Label>
                    <Input id={ids.address} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={240} autoComplete="off" />
                  </div>
                </div>
                <label htmlFor={ids.photo} className="flex cursor-pointer items-start gap-2.5 text-sm text-neutral-800">
                  <input id={ids.photo} type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} className="mt-0.5 h-4 w-4 accent-black" />{c.photo}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!ready || check.isPending} className="bg-black text-white hover:bg-neutral-800">
                    {check.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}{c.save}
                  </Button>
                  {idCheck && <Button type="button" variant="outline" onClick={() => setAgain(false)}>{c.cancel}</Button>}
                </div>
              </form>
            )}
            <p className="border-t border-neutral-100 pt-3 text-xs text-neutral-500">{c.paper}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Steps ──
function StepTracker({ step, dates }: { step: number; dates: (string | null)[] | null }) {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const labels = t.stepsShort.slice(0, TAX_STEP_COUNT);
  const last = labels.length - 1;
  const progress = last > 0 ? (Math.max(0, Math.min(step, last)) / last) * (100 - 100 / labels.length) : 0;

  return (
    <div>
      {step === DRAFT_STEP && (
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden /> {t.draftStep}
        </p>
      )}
      <div className="relative">
        {/* Connecting line (wide screens, where the steps sit in one row) */}
        <div aria-hidden className="absolute top-4 hidden h-0.5 bg-neutral-200 sm:block" style={{ left: `${50 / labels.length}%`, right: `${50 / labels.length}%` }} />
        {step > 0 && (
          <div aria-hidden className="absolute top-4 hidden h-0.5 bg-neutral-900 sm:block" style={{ left: `${50 / labels.length}%`, width: `${progress}%` }} />
        )}
        <ol className="relative grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-8 sm:gap-x-0">
          {labels.map((label, i) => {
            const done = step > i;
            const current = step === i;
            const date = done || current ? dates?.[i] : null;
            return (
              <li key={i} aria-current={current ? "step" : undefined} className="flex min-w-0 flex-col items-center px-0.5 text-center">
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-xs font-semibold",
                    done && "bg-neutral-900 text-white",
                    current && "bg-white text-black ring-2 ring-neutral-900",
                    !done && !current && "bg-neutral-100 text-neutral-400",
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className={cn("mt-1.5 break-words text-[11px] font-medium leading-tight", current ? "text-black" : done ? "text-neutral-600" : "text-neutral-400")}>
                  {label}
                </span>
                {current && <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">{t.now}</span>}
                {date && <span className="mt-0.5 text-[10px] text-neutral-400">{new Date(date).toLocaleDateString(locale, { day: "numeric", month: "short" })}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function StepControl({ returnId, step, needs }: { returnId: number; step: number; needs: StepNeeds }) {
  const t = useCopy(taxesCopy);
  const l = useCopy(taxLiveCopy).admin;
  const refresh = useRefresh();
  const onError = useErrorToast();
  const id = useId();
  const [target, setTarget] = useState(step);
  const save = trpc.tax.adminSetStep.useMutation({
    onSuccess: async () => {
      toast.success(t.admin.saved);
      await refresh();
    },
    onError,
  });
  const name = (i: number) => (i === TAX_STEP.sign ? t.p.short[i] : t.stepsShort[i]) ?? String(i + 1);
  const why = (b: "docs" | "signature" | null) =>
    b === "docs" ? l.needDocs([!needs.fed && l.fed, !needs.f8879 && l.f8879].filter(Boolean).join(l.and))
      : b === "signature" ? l.needSignature : "";
  const next = step < TAX_STEP_COUNT - 1 ? step + 1 : null;
  const nextBlock = next !== null ? stepBlock(next, step, needs) : null;
  const targetBlock = stepBlock(target, step, needs);
  const move = (to: number) => save.mutate({ returnId, step: to });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (target !== step && !targetBlock) move(target);
  };
  const lock = (ok: boolean, label: string, text: string) => (
    <p className="flex items-start gap-2.5">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <Lock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden />}
      <span><b className="font-semibold text-neutral-900">{label}</b> {text}</span>
    </p>
  );

  return (
    <div className="mt-6 space-y-4 border-t border-neutral-100 pt-4" data-step-control="">
      <div className="flex flex-wrap items-center gap-2">
        {next !== null ? (
          <Button type="button" onClick={() => move(next)} disabled={!!nextBlock || save.isPending} className="bg-black text-white hover:bg-neutral-800" data-move-next="">
            {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}{l.moveTo(name(next))}<ChevronRight aria-hidden />
          </Button>
        ) : <span className="text-sm text-neutral-500">{l.last}</span>}
        {step > DRAFT_STEP && (
          <Button type="button" variant="outline" onClick={() => move(step - 1)} disabled={save.isPending}>{l.back}</Button>
        )}
        <span className={cn("text-xs", nextBlock ? "font-semibold text-amber-700" : "text-neutral-500")} data-step-reason="">{nextBlock ? why(nextBlock) : next !== null ? l.liveNote : ""}</span>
      </div>
      <div className="grid gap-2 rounded-xl bg-neutral-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-neutral-600">
        {lock(needs.fed && needs.f8879, name(TAX_STEP.sign), l.lockDocs)}
        {lock(needs.signed, name(TAX_STEP.filed), l.lockSign)}
        <p className="flex items-start gap-2.5"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden /><span>{l.backAlways}</span></p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={id} className="text-xs text-neutral-500">{l.toAny}</Label>
          <select id={id} value={target} onChange={(e) => setTarget(Number(e.target.value))} className={selectClass}>
            <option value={DRAFT_STEP}>{t.draftStep}</option>
            {t.steps.slice(0, TAX_STEP_COUNT).map(([label], i) => {
              const blocked = !!stepBlock(i, step, needs);
              return <option key={i} value={i} disabled={blocked}>{i + 1}. {label}{blocked ? ` (${l.locked})` : ""}</option>;
            })}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={target === step || !!targetBlock || save.isPending}>
          <Check aria-hidden />{l.go}
        </Button>
      </form>
    </div>
  );
}

// ── Answers and what's missing ──
function AnswersCard({ mode, answers, missing }: { mode: TaxMode; answers: Record<string, boolean | null> | null; missing: Missing }) {
  const t = useCopy(taxesCopy);
  const nothingMissing = missing.questions.length === 0 && missing.docs.length === 0 && !missing.income;

  return (
    <Card className="gap-4 border-neutral-200/80 shadow-sm">
      <CardHeader>
        <h2 className="text-base font-semibold leading-none">{t.admin.answers}</h2>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="divide-y divide-neutral-100">
          {TAX_QUESTIONS[mode].map((q) => {
            const v = answers?.[q];
            return (
              <div key={q} className="flex items-start justify-between gap-3 py-2.5">
                <dt className="text-sm text-neutral-700">{t.questions[mode][q]?.[0] ?? q}</dt>
                <dd
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    v === true ? "bg-neutral-900 text-white" : v === false ? "bg-neutral-100 text-neutral-700" : "text-neutral-400",
                  )}
                >
                  {v === true ? t.situation.yes : v === false ? t.situation.no : "—"}
                </dd>
              </div>
            );
          })}
        </dl>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t.admin.missing}</h3>
          {nothingMissing ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> {t.admin.nothingMissing}
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {missing.questions.length > 0 && <MissingItem text={t.admin.unanswered(missing.questions.length)} />}
              {missing.docs.map((kind) => <MissingItem key={kind} text={t.docs[mode][kind]?.title ?? kind} />)}
              {missing.income && <MissingItem text={t.admin.missingIncome} />}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MissingItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-amber-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden /> {text}
    </li>
  );
}

// ── Results ──
function parseAmount(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? Math.round(n * 100) / 100 : null;
}

function ResultsForm({ returnId, filingStatus, fed, state, legalName }: { returnId: number; filingStatus: string | null; fed: TaxResult; state: TaxResult; legalName: string }) {
  const t = useCopy(taxesCopy);
  const refresh = useRefresh();
  const onError = useErrorToast();
  const filingId = useId();
  const nameId = useId();
  const [filing, setFiling] = useState(filingStatus ?? "");
  // Starts as the account's name; the preparer corrects it from the ID (middle name, both last names).
  const [fullName, setFullName] = useState(legalName);
  const [fedChoice, setFedChoice] = useState<Choice>(fed?.kind ?? "none");
  const [fedAmount, setFedAmount] = useState(fed ? String(fed.amount) : "");
  const [stateChoice, setStateChoice] = useState<Choice>(state?.kind ?? "none");
  const [stateAmount, setStateAmount] = useState(state ? String(state.amount) : "");
  const save = trpc.tax.adminSetResults.useMutation({
    onSuccess: async () => {
      toast.success(t.admin.saved);
      await refresh();
    },
    onError,
  });

  const fedN = parseAmount(fedAmount);
  const stateN = parseAmount(stateAmount);
  const fedOk = fedChoice === "none" || fedN !== null;
  const stateOk = stateChoice === "none" || stateN !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!fedOk || !stateOk) return;
    save.mutate({
      returnId,
      filingStatus: filing.trim() || null,
      legalName: fullName.trim() || null,
      fed: fedChoice === "none" || fedN === null ? null : { kind: fedChoice, amount: fedN },
      state: stateChoice === "none" || stateN === null ? null : { kind: stateChoice, amount: stateN },
    });
  };

  return (
    <Card className="gap-4 border-neutral-200/80 shadow-sm">
      <CardHeader>
        <h2 className="text-base font-semibold leading-none">{t.results.title}</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor={nameId} className="text-xs text-neutral-500">{t.results.legalName}</Label>
            <Input id={nameId} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={160} autoComplete="off" />
            <p className="text-xs text-neutral-500">{t.results.legalHelp}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={filingId} className="text-xs text-neutral-500">{t.results.filing}</Label>
            <Input id={filingId} value={filing} onChange={(e) => setFiling(e.target.value)} maxLength={40} autoComplete="off" />
          </div>
          <ResultField legend={t.results.fed} choice={fedChoice} amount={fedAmount} invalid={!fedOk} onChoice={setFedChoice} onAmount={setFedAmount} />
          <ResultField legend={t.results.state} choice={stateChoice} amount={stateAmount} invalid={!stateOk} onChoice={setStateChoice} onAmount={setStateAmount} />
          <Button type="submit" disabled={!fedOk || !stateOk || save.isPending} className="w-full bg-black text-white hover:bg-neutral-800 sm:w-auto">
            {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            {t.admin.resultsSave}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ResultField({ legend, choice, amount, invalid, onChoice, onAmount }: {
  legend: string;
  choice: Choice;
  amount: string;
  invalid: boolean;
  onChoice: (c: Choice) => void;
  onAmount: (s: string) => void;
}) {
  const t = useCopy(taxesCopy);
  const name = useId();
  const amountId = useId();
  const options: { value: Choice; label: string }[] = [
    { value: "refund", label: t.results.refund },
    { value: "owe", label: t.results.owe },
    { value: "none", label: t.admin.none },
  ];

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-black">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} checked={choice === o.value} onChange={() => onChoice(o.value)} className="peer sr-only" />
            <span className="inline-flex h-8 items-center rounded-full border border-neutral-200 px-3 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-900 peer-focus-visible:ring-offset-2">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {choice !== "none" && (
        <div className="space-y-1.5">
          <Label htmlFor={amountId} className="text-xs text-neutral-500">{t.admin.amount}</Label>
          <div className="relative max-w-[14rem]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400" aria-hidden>$</span>
            <Input
              id={amountId}
              type="number"
              inputMode="decimal"
              min={0}
              max={MAX_AMOUNT}
              step="0.01"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              aria-invalid={invalid || undefined}
              className="pl-7"
            />
          </div>
        </div>
      )}
    </fieldset>
  );
}

// ── Client documents ──
function StatusBadge({ status }: { status: TaxDocMeta["status"] }) {
  const t = useCopy(taxesCopy);
  const cls = status === "ok"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "redo"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return <Badge variant="outline" className={cn("text-[11px]", cls)}>{t.docStatus[status] ?? status}</Badge>;
}

function ClientDocs({ mode, docs, onView }: { mode: TaxMode; docs: TaxDocMeta[]; onView: (v: Viewing) => void }) {
  const t = useCopy(taxesCopy);
  const clientDocs = docs.filter((d) => d.source === "client");
  const known = TAX_DOC_KINDS[mode].map((k) => k.id);
  const kinds = [
    ...known.filter((k) => clientDocs.some((d) => d.kind === k)),
    ...Array.from(new Set(clientDocs.map((d) => d.kind).filter((k) => !known.includes(k)))),
  ];
  const pending = clientDocs.filter((d) => d.status === "pending").length;

  return (
    <Card className="gap-4 border-neutral-200/80 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold leading-none">{t.admin.clientDocs}</h2>
          <CountChip n={pending} label={t.admin.toReview} kind="docs" />
        </div>
      </CardHeader>
      <CardContent>
        {kinds.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">{t.admin.noDocs}</p>
        ) : (
          <div className="space-y-5">
            {kinds.map((kind) => {
              const title = t.docs[mode][kind]?.title ?? t.preparerDocs[kind] ?? kind;
              const list = clientDocs.filter((d) => d.kind === kind);
              return (
                <section key={kind} aria-label={title}>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-black">
                    {title}
                    <span className="rounded-full bg-neutral-100 px-1.5 text-[11px] font-medium text-neutral-500">{list.length}</span>
                  </h3>
                  <ul className="mt-1 divide-y divide-neutral-100">
                    {list.map((d) => <ClientDocRow key={d.id} doc={d} onView={() => onView({ id: d.id, title })} />)}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientDocRow({ doc, onView }: { doc: TaxDocMeta; onView: () => void }) {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefresh();
  const onError = useErrorToast();
  const formId = useId();
  const noteId = useId();
  const [redoOpen, setRedoOpen] = useState(false);
  const [note, setNote] = useState("");
  const setDoc = trpc.tax.adminSetDoc.useMutation({
    onSuccess: async () => {
      toast.success(t.admin.saved);
      setRedoOpen(false);
      await refresh();
    },
    onError,
  });
  const busy = setDoc.isPending;

  const askAgain = (e: FormEvent) => {
    e.preventDefault();
    setDoc.mutate({ docId: doc.id, status: "redo", note: note.trim() || null });
  };

  return (
    <li className="py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100" aria-hidden>
            <FileText className="h-4 w-4 text-neutral-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-black" title={doc.fileName}>{doc.fileName}</p>
            <p className="text-xs text-neutral-500">{formatFileSize(doc.size)} · {fmtDate(doc.createdAt, locale)}</p>
            <div className="mt-1.5"><StatusBadge status={doc.status} /></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onView}>
            <Eye aria-hidden /> {t.view}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || doc.status === "ok"}
            onClick={() => setDoc.mutate({ docId: doc.id, status: "ok" })}
            className="bg-black text-white hover:bg-neutral-800"
          >
            {busy && !redoOpen ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} {t.admin.approve}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={redoOpen}
            aria-controls={redoOpen ? formId : undefined}
            onClick={() => {
              setNote(doc.note ?? "");
              setRedoOpen((o) => !o);
            }}
          >
            <RotateCcw aria-hidden /> {t.admin.redo}
          </Button>
        </div>
      </div>

      {doc.status === "redo" && doc.note && !redoOpen && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 sm:ml-12">{doc.note}</p>
      )}

      {redoOpen && (
        <form id={formId} onSubmit={askAgain} className="mt-3 space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 sm:ml-12">
          <Label htmlFor={noteId} className="text-xs text-neutral-600">{t.admin.redoNote}</Label>
          <Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="min-h-0 bg-white" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRedoOpen(false)}>{t.admin.cancel}</Button>
            <Button type="submit" size="sm" disabled={busy} className="bg-black text-white hover:bg-neutral-800">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />} {t.admin.redo}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

// ── Preparer documents ──
function PreparerDocs({ returnId, docs, onView }: { returnId: number; docs: TaxDocMeta[]; onView: (v: Viewing) => void }) {
  const t = useCopy(taxesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefresh();
  const onError = useErrorToast();
  const kindId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PreparerDocKind>("final_fed");
  const [busy, setBusy] = useState(false);
  const upload = trpc.tax.adminUpload.useMutation();
  const del = trpc.tax.adminDeleteDoc.useMutation({
    onSuccess: async () => {
      toast.success(t.removed);
      await refresh();
    },
    onError,
  });
  const prepDocs = docs.filter((d) => d.source === "preparer");

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ""; // the same file can be picked again
    if (!file) return;
    setBusy(true);
    try {
      const payload = await prepareTaxUpload(file);
      const r = await upload.mutateAsync({ returnId, kind, ...payload });
      toast.success(r.movedToSign ? t.signCard.movedToSign : t.uploaded);
      await refresh();
    } catch (err) {
      toast.error(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-4 border-neutral-200/80 shadow-sm">
      <CardHeader>
        <h2 className="text-base font-semibold leading-none">{t.admin.preparerDocs}</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {prepDocs.length === 0 ? (
          <p className="text-sm text-neutral-400">{t.admin.noPreparerDocs}</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {prepDocs.map((d) => {
              const title = t.preparerDocs[d.kind] ?? d.kind;
              const removing = del.isPending && del.variables?.docId === d.id;
              return (
                <li key={d.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-900" aria-hidden>
                      <FileText className="h-4 w-4 text-white" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-black">{title}</p>
                      <p className="truncate text-xs text-neutral-500" title={d.fileName}>
                        {d.fileName} · {formatFileSize(d.size)} · {fmtDate(d.createdAt, locale)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => onView({ id: d.id, title })}>
                      <Eye aria-hidden /> {t.view}
                    </Button>
                    {d.kind !== "f8879_signed" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={removing}
                        onClick={() => { if (window.confirm(t.removeConfirm)) del.mutate({ docId: d.id }); }}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        {removing ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />} {t.remove}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-xl border border-dashed border-neutral-300 p-3 sm:p-4">
          <p className="text-sm font-medium text-black">{t.admin.uploadFinal}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={kindId} className="text-xs text-neutral-500">{t.admin.kind}</Label>
              <select
                id={kindId}
                value={kind}
                onChange={(e) => { const k = PREPARER_DOC_KINDS.find((x) => x === e.target.value); if (k) setKind(k); }}
                className={selectClass}
              >
                {PREPARER_DOC_KINDS.map((k) => <option key={k} value={k}>{t.preparerDocs[k] ?? k}</option>)}
              </select>
            </div>
            <input ref={fileRef} type="file" accept={TAX_ACCEPT} onChange={onPick} className="hidden" tabIndex={-1} aria-hidden />
            <Button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="bg-black text-white hover:bg-neutral-800">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {busy ? t.uploading : t.upload}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chat with the client, live ──
function AdminChat({ returnId, clientName, messages, online, typing }: { returnId: number; clientName: string; messages: ChatMsg[]; online: boolean; typing: boolean }) {
  const t = useCopy(taxesCopy);
  const tl = useCopy(taxLiveCopy).chat;
  const utils = trpc.useUtils();
  const adminGet = utils.tax.adminGet;
  const adminList = utils.tax.adminList;
  const refetch = useCallback(() => adminGet.invalidate({ returnId }), [adminGet, returnId]);
  const chat = useTaxChat({ side: "preparer", returnId }, refetch, t.errors);
  const box = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [viewing, setViewing] = useState<Viewing>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(!!e && e.isIntersecting && e.intersectionRatio >= 0.3), { threshold: [0, 0.3, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // "En línea" for the client while this chat is on screen.
  useChatPresence(inView, chat.presence);
  // On screen: the client's messages count as read (they see "Visto").
  const unread = messages.filter((m) => m.fromRole === "client" && !m.readAt).length;
  const { mutate: markRead } = trpc.tax.adminMarkRead.useMutation();
  useEffect(() => {
    if (!inView || unread === 0) return;
    const id = setTimeout(() => {
      if (document.visibilityState === "visible") markRead({ returnId }, { onSuccess: () => { void refetch(); void adminList.invalidate(); } });
    }, 700);
    return () => clearTimeout(id);
  }, [inView, unread, markRead, returnId, refetch, adminList]);
  const initials = clientName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";

  return (
    <div ref={box} className="h-[620px] overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm xl:sticky xl:top-6 xl:h-[calc(100dvh-3rem)] xl:max-h-[820px]" data-admin-chat="">
      <TaxChat me="preparer" tone="admin" title={clientName} initials={initials} online={online} typing={typing} messages={messages} pending={chat.pending}
        onSend={chat.send} onFiles={(f) => void chat.sendFiles(f)} onTyping={chat.typing} onRetry={chat.retry}
        onOpenFile={(f) => setViewing({ id: f.id, title: f.fileName })} onSaveFile={(f) => void chat.save(f)}
        placeholder={tl.adminPlaceholder} emptyText={tl.adminEmpty} className="h-full" />
      <TaxFileViewer admin chat docId={viewing?.id ?? null} title={viewing?.title} onClose={() => setViewing(null)} />
    </div>
  );
}
