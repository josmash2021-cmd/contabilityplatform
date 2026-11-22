import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUp, Bell, CheckCircle2, Clock, FileText, History, Inbox, Link2, Loader2, Lock, Mic, Paperclip, PieChart, Plus, RefreshCw, Sparkles, Square, SquarePen, Trash2, Users, type LucideIcon,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
import { AnimatedPage } from "@/components/AnimatedPage";
import { useMedia } from "@/hooks/useMedia";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { FileChip, Typewriter, TypingDots } from "@/components/assistant/chatKit";
import { FileProblem, MAX_FILES, toAttachment } from "@/components/assistant/chatFiles";
import { useDictation } from "@/components/assistant/useDictation";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { assistantCopy, type AssistantCopy } from "@/i18n/copy/assistant";
import { appCopy } from "@/i18n/copy/app";
import { personalCopy } from "@/i18n/copy/personal";
import { budgetCategoryLabel } from "@/i18n/copy/budgets";

type Out = inferRouterOutputs<AppRouter>["assistant"];
type Message = Out["status"]["messages"][number];
type Source = Message["sources"][number];
type Weekly = Out["weekly"];
type Chat = Out["status"]["chats"][number];
type Notice = { key: string; kind: string; params: Record<string, string | number>; date: string; urgent: boolean; path: string; read: boolean };

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";
const CARD = "rounded-[14px] border border-slate-200 bg-white p-4";
const BTN = `inline-flex min-h-10 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`;
const BTN_SM = `inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-[11px] py-1.5 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`;
const SRC_LINK = `rounded text-xs font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700 ${FOCUS}`;
const money = (n: number) => formatCurrency(n);
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const NOTICE_ICON: Record<string, LucideIcon> = { review: Inbox, bill_late: AlertTriangle, bill_soon: Bell, owed: Users, budget_near: PieChart, budget_over: PieChart, tax_redo: FileText };

/** "1–21 nov" inside one month, else "28 oct – 3 nov". */
function rangeLabel(from: string | undefined, to: string | undefined, locale: string): string {
  if (!from || !to) return "";
  const d = (s: string) => new Date(`${s}T12:00:00`);
  const month = (s: string) => d(s).toLocaleDateString(locale, { month: "short" }).replace(".", "");
  if (from === to) return `${d(from).getDate()} ${month(from)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${d(from).getDate()}–${d(to).getDate()} ${month(to)}`;
  return `${d(from).getDate()} ${month(from)} – ${d(to).getDate()} ${month(to)}`;
}

function sourceLabel(s: Source, t: AssistantCopy, locale: string): string {
  const range = rangeLabel(s.from, s.to, locale);
  switch (s.kind) {
    case "bank": return t.source.bank(range);
    case "bankTx": return t.source.bankTx(s.count ?? 0, range);
    case "sales": return t.source.sales(range);
    case "expenses": return t.source.expenses(range);
    case "receivables": return t.source.receivables(s.count ?? 0);
    case "invoice": return t.source.invoice(s.name ?? "", money(s.amount ?? 0));
    case "bills": return t.source.bills(s.count ?? 0);
    case "goals": return t.source.goals;
    default: return t.source.budgets;
  }
}

/** The assistant: a chat with sources, suggested questions, today's check and the week's summary, and the month's limit. */
export default function Assistant() {
  const t = useCopy(assistantCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const { user } = useAuth();
  const utils = trpc.useUtils();
  // The chat on screen: a saved one's id, null for a new one, undefined for the most recent.
  const [selected, setSelected] = useState<number | null | undefined>(undefined);
  const { data, isLoading, isError, refetch, isFetching } = trpc.assistant.status.useQuery(
    selected === undefined ? undefined : { chatId: selected },
    { placeholderData: (prev) => prev },
  );
  const [question, setQuestion] = useState("");
  // The question on its way: its text and the names of the files it carries.
  const [pending, setPending] = useState<{ text: string; files: Array<{ name: string; mime: string }> } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(false);
  // Answers newer than this message write themselves in (only the ones that arrive while the page is open).
  const [typingFrom, setTypingFrom] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sentFiles = useRef<File[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: async (res) => { setSelected(res.chatId); await utils.assistant.status.invalidate(); setPending(null); },
    onError: (e, vars) => {
      setPending(null);
      // Give the question (and its files) back so it can be sent again.
      setQuestion((q) => q || vars.question);
      setFiles((f) => (f.length ? f : sentFiles.current));
      toast.error(e.message || t.error);
    },
  });
  const clear = trpc.assistant.clear.useMutation({ onSuccess: () => { setSelected(undefined); void utils.assistant.status.invalidate(); } });
  const openChat = (id: number | null) => { setSelected(id); setPending(null); setTypingFrom(null); setPanelOpen(false); };
  const removeChat = (id: number) => { if (window.confirm(t.chats.removeConfirm)) clear.mutate({ chatId: id }); };

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const chatRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: messages.length ? "smooth" : "auto" });
  }, [messages.length, pending]);

  const scrollEnd = () => endRef.current?.scrollIntoView({ block: "end" });

  // Phones and tablets (where the app's tab bar shows): the box to write sits at the bottom of the screen, right
  // above the tab bar, on a solid background, however long the chat is. It's drawn outside the page so the page's
  // entrance animation can't move it. The chat keeps that much room at its end so the last message never hides.
  const hasChat = messages.length > 0 || !!pending;
  const phone = useMedia("(max-width: 1023px)");
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockH, setDockH] = useState(0);
  useEffect(() => {
    const el = dockRef.current;
    if (!el || !phone || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setDockH(el.offsetHeight);
      document.documentElement.style.setProperty("--chat-dock", `${el.offsetHeight}px`);
    });
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty("--chat-dock"); };
  }, [phone, hasChat]);

  // Speaking instead of typing: what's heard goes into the box after what was already written.
  const dictBase = useRef("");
  const dict = useDictation(lang === "en" ? "en-US" : "es-US",
    (settled, hearing) => setQuestion(`${dictBase.current}${dictBase.current && (settled || hearing) ? " " : ""}${settled}${hearing}`.slice(0, 1000)),
    (code) => toast.error(code === "not-allowed" || code === "service-not-allowed" ? t.micDenied : t.micError));
  const toggleMic = () => {
    if (dict.listening) { dict.stop(); return; }
    dictBase.current = question.trim();
    dict.start();
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const chosen = Array.from(list);
    if (files.length + chosen.length > MAX_FILES) toast.error(t.fileMax);
    setFiles((f) => [...f, ...chosen].slice(0, MAX_FILES));
    if (fileInput.current) fileInput.current.value = "";
  };

  const send = async (text: string) => {
    const q = text.trim();
    if ((!q && files.length === 0) || ask.isPending || preparing) return;
    if (dict.listening) dict.stop();
    let attachments: Awaited<ReturnType<typeof toAttachment>>[] | undefined;
    if (files.length) {
      setPreparing(true);
      try {
        attachments = await Promise.all(files.map(toAttachment));
      } catch (e) {
        toast.error(e instanceof FileProblem && e.kind === "size" ? t.fileSize : t.fileType);
        setPreparing(false);
        return;
      }
      setPreparing(false);
    }
    sentFiles.current = files;
    setPending({ text: q, files: (attachments ?? []).map((a) => ({ name: a.name, mime: a.mime })) });
    setTypingFrom(messages.length ? messages[messages.length - 1].id : 0);
    setQuestion("");
    setFiles([]);
    ask.mutate({ question: q, chatId: data?.chatId ?? null, attachments });
  };

  if (isLoading) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-4" role="status" aria-label={t.thinking}>
          <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-80 max-w-full" /></div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-3.5"><Skeleton className="h-40 rounded-[14px]" /><Skeleton className="h-72 rounded-[14px]" /></div>
            <div className="space-y-3.5"><Skeleton className="h-28 rounded-[14px]" /><Skeleton className="h-48 rounded-[14px]" /></div>
          </div>
        </div>
      </AnimatedPage>
    );
  }
  if (isError || !data) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className={`mx-auto max-w-3xl text-center ${CARD} p-6`} role="alert">
          <p className="font-semibold text-slate-900">{t.loadError}</p>
          <button onClick={() => refetch()} disabled={isFetching} className={`mt-4 ${BTN}`}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />{t.retry}
          </button>
        </div>
      </AnimatedPage>
    );
  }

  const { mode, limit, used, remaining, ready } = data;
  const outOfQuestions = limit > 0 && remaining <= 0;
  const disabled = !ready || limit === 0 || outOfQuestions;
  const firstName = (user?.name || "").trim().split(/\s+/)[0] ?? "";
  const examples = t.suggestions[mode];
  const chatting = messages.length > 0 || !!pending;
  const chip = (q: string) => (
    <button key={q} type="button" disabled={disabled || ask.isPending} onClick={() => void send(q)}
      className={`max-w-full whitespace-normal rounded-full border border-slate-200 bg-white px-3.5 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}>{q}</button>
  );
  const planNote = (outOfQuestions || limit === 0) && (
    <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-amber-800">
      {limit === 0 && <Lock className="h-3.5 w-3.5" aria-hidden />}
      {limit === 0 ? t.noPlan : t.used}
      <Link to="/settings?sec=plan" className="font-semibold text-blue-600 underline-offset-2 hover:underline">{t.changePlan}</Link>
    </p>
  );
  // The right column: saved conversations, what the app did today, and the week's summary.
  const side = (
    <>
      <ChatList chats={data.chats} current={data.chatId} t={t} locale={locale} busy={clear.isPending} onOpen={openChat} onRemove={removeChat} />
      <ActivityCard t={t} locale={locale} />
      <WeeklyCard t={t} locale={locale} canAsk={!disabled && !ask.isPending} onAsk={() => { setPanelOpen(false); void send(t.week.askQuestion); }} />
    </>
  );
  const iconBtn = `grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
  const composer = (
    <form className="rounded-[26px] border border-slate-200 bg-white p-1.5 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)] transition focus-within:border-blue-500 focus-within:ring-[3px] focus-within:ring-blue-50"
      onSubmit={(e) => { e.preventDefault(); void send(question); }}>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2 pb-1 pt-1.5">
          {files.map((f, i) => (
            <FileChip key={`${f.name}-${i}`} name={f.name} mime={f.type === "application/pdf" ? "application/pdf" : "image/jpeg"}
              removeLabel={t.removeFile(f.name)} onRemove={() => setFiles((list) => list.filter((_, k) => k !== i))} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} tabIndex={-1} aria-hidden="true" />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={disabled || files.length >= MAX_FILES} aria-label={t.attach} title={t.attach}
          className={`${iconBtn} text-slate-500 hover:bg-slate-100 hover:text-slate-900`}>
          <Paperclip className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <input
          value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} disabled={disabled}
          placeholder={dict.listening ? t.listening : preparing ? t.filePrep : t.placeholder} aria-label={t.label} autoComplete="off"
          className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-base text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed sm:text-[15px]"
        />
        {dict.supported && (
          <button type="button" onClick={toggleMic} disabled={disabled} aria-pressed={dict.listening} aria-label={dict.listening ? t.micStop : t.mic} title={dict.listening ? t.micStop : t.mic}
            className={cn(iconBtn, dict.listening ? "animate-pulse bg-red-600 text-white hover:bg-red-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900")}>
            {dict.listening ? <Square className="h-3.5 w-3.5 fill-current" aria-hidden /> : <Mic className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        )}
        <button type="submit" disabled={disabled || (!question.trim() && files.length === 0) || ask.isPending || preparing} aria-label={ask.isPending ? t.sending : t.send}
          className={`${iconBtn} bg-blue-600 text-white hover:brightness-110 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100`}>
          {ask.isPending || preparing ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /> : <ArrowUp className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      </div>
    </form>
  );

  return (
    <AnimatedPage className="flex min-h-full flex-col p-4 lg:p-8">
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col">
        {/* Head: title, the month's limit (one bar), clear */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[22px] font-[750] tracking-tight text-slate-900">{t.title}</h1>
          <div className="flex items-center gap-2">
            {limit > 0 && <LimitBar limit={limit} used={used} remaining={remaining} t={t} />}
            {chatting && (
              <button type="button" onClick={() => openChat(null)} className={`${BTN_SM} lg:hidden`} aria-label={t.chats.new} title={t.chats.new}>
                <SquarePen className="h-[15px] w-[15px]" aria-hidden /><span className="hidden sm:inline">{t.chats.new}</span>
              </button>
            )}
            {/* Phone and tablet: the right column (conversations, what I did, the week) in a sheet. */}
            <button type="button" onClick={() => setPanelOpen(true)} className={`${BTN_SM} lg:hidden`} aria-label={t.chats.open} title={t.chats.open}>
              <History className="h-[15px] w-[15px]" aria-hidden />
            </button>
          </div>
        </header>

        {!ready ? (
          <div className="m-auto max-w-md px-2 py-10 text-center" role="status">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500"><Clock className="h-5 w-5" /></span>
            <p className="mt-3 font-semibold text-slate-900">{t.notReady.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{t.notReady.text}</p>
          </div>
        ) : !chatting ? (
          /* Nothing asked yet: the question box in the middle, examples under it, then today's check and the week. */
          <div className="flex flex-1 flex-col justify-center gap-5 py-8">
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Sparkles className="h-6 w-6" aria-hidden /></span>
              <h2 className="mt-3 text-[26px] font-[750] tracking-tight text-slate-900 sm:text-[30px]">{t.emptyTitle(firstName)}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
            </div>
            {planNote}
            {composer}
            <div className="flex flex-wrap justify-center gap-2">
              {examples.main.map(chip)}
              <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} aria-controls="as-more"
                className={`rounded-full px-2 py-2 text-[13px] font-semibold text-blue-600 hover:text-blue-700 ${FOCUS}`}>
                {moreOpen ? t.lessExamples : t.moreExamples}
              </button>
            </div>
            <div id="as-more" className={cn("flex-wrap justify-center gap-2", moreOpen ? "flex" : "hidden")}>{examples.more.map(chip)}</div>
            <div className="mt-2 grid gap-3">
              <ReviewCard t={t} />
            </div>
          </div>
        ) : (
          /* The conversation, newest at the bottom, and the box fixed under it. */
          <>
            <section ref={chatRef} aria-live="polite" aria-label={t.chatLabel} className="flex flex-1 flex-col gap-5 py-6">
              {messages.map((m) => {
                const sources = m.role === "assistant" && m.sources.length > 0 ? <Sources sources={m.sources} t={t} locale={locale} /> : null;
                const fresh = m.role === "assistant" && typingFrom !== null && m.id > typingFrom;
                return (
                  <Bubble key={m.id} mine={m.role === "user"} label={m.role === "user" ? t.you : t.assistant}>
                    {m.attachments.length > 0 && (
                      <span className={cn("flex flex-wrap gap-1.5", m.content && "mb-1.5")}>
                        {m.attachments.map((a, i) => <FileChip key={`${a.name}-${i}`} name={a.name} mime={a.mime} light />)}
                      </span>
                    )}
                    {fresh ? <Typewriter text={m.content} onTick={scrollEnd} after={sources} /> : <>{m.content}{sources}</>}
                  </Bubble>
                );
              })}
              {pending && (
                <>
                  <Bubble mine label={t.you}>
                    {pending.files.length > 0 && (
                      <span className={cn("flex flex-wrap gap-1.5", pending.text && "mb-1.5")}>
                        {pending.files.map((a, i) => <FileChip key={`${a.name}-${i}`} name={a.name} mime={a.mime} light />)}
                      </span>
                    )}
                    {pending.text}
                  </Bubble>
                  <Bubble mine={false} label={t.assistant}><TypingDots label={pending.files.length ? t.reading : t.writing} /></Bubble>
                </>
              )}
              <div ref={endRef} style={phone ? { scrollMarginBottom: dockH + 8 } : undefined} />
              {/* After the last message: room for the box at the bottom (the page's own bottom space is 112px). */}
              {phone && <div aria-hidden style={{ height: Math.max(0, dockH + 8 - 112) }} />}
            </section>
            {phone ? createPortal(
              <div ref={dockRef} data-chat-dock="" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-slate-50 px-4 pb-[calc(88px+env(safe-area-inset-bottom,0px))] pt-3">
                <div className="mx-auto grid max-w-3xl gap-2">
                  {planNote}
                  {composer}
                  <p className="text-center text-[11px] text-slate-400">{t.disclaimer}</p>
                </div>
              </div>,
              document.body,
            ) : (
              <div className="sticky bottom-0 z-10 -mx-1 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-1 pb-1 pt-4">
                <div className="grid gap-2">
                  {planNote}
                  {composer}
                  <p className="text-center text-[11px] text-slate-400">{t.disclaimer}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <aside className="hidden min-w-0 lg:block"><div className="sticky top-4 grid gap-3.5">{side}</div></aside>
      </div>
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="bottom" className="max-h-[86vh] gap-0 overflow-y-auto rounded-t-[18px] bg-slate-50 p-4 pb-[calc(18px+env(safe-area-inset-bottom,0px))] lg:hidden">
          <SheetHeader className="min-h-8 justify-center p-0 pr-10 text-left"><SheetTitle className="text-[19px] font-[750] tracking-tight text-slate-900">{t.chats.open}</SheetTitle></SheetHeader>
          <div className="mt-3 grid gap-3.5">{side}</div>
        </SheetContent>
      </Sheet>
    </AnimatedPage>
  );
}

function Bubble({ mine, label, children }: { mine: boolean; label: string; children: ReactNode }) {
  return (
    <div className={cn("text-[15px] leading-relaxed", mine ? "max-w-[85%] self-end rounded-[20px] rounded-br-[6px] bg-blue-600 px-4 py-2.5 text-white" : "w-full self-start text-slate-900")}>
      <span className="sr-only">{label}: </span>
      <div className="whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}

/** The prototype's `.src` row: links to the screens and records an answer's numbers came from. */
function Sources({ sources, t, locale }: { sources: Source[]; t: AssistantCopy; locale: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 whitespace-normal border-t border-slate-200 pt-2 text-xs text-slate-500">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
      <span>{t.sources}</span>
      {sources.map((s) => <Link key={`${s.kind}-${s.path}-${s.from ?? ""}`} to={s.path} className={SRC_LINK}>{sourceLabel(s, t, locale)}</Link>)}
    </div>
  );
}

/** "Revisión de hoy": the same real notices as the bell (bills, money owed, movements to review, budgets). */
function ReviewCard({ t }: { t: AssistantCopy }) {
  const app = useCopy(appCopy);
  const { categories } = useCopy(personalCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const { data, isLoading, isError } = trpc.notices.list.useQuery(undefined, { staleTime: 60_000 });
  const items = ((data?.items ?? []) as Notice[]);
  const shown = items.slice(0, 4);
  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const bell = app.shell.bell;
  const words = (n: Notice): [string, string] => {
    const p = n.params;
    const amt = (k: string) => money(Number(p[k] ?? 0));
    switch (n.kind) {
      case "review": return bell.review(Number(p.count ?? 0));
      case "bill_late": return bell.billLate(String(p.vendor ?? ""), amt("amount"), day(String(p.due)));
      case "bill_soon": return bell.billSoon(String(p.vendor ?? ""), amt("amount"), day(String(p.due)));
      case "owed": return bell.owed(String(p.client ?? ""), amt("amount"), day(String(p.since)));
      case "budget_near": return bell.budgetNear(budgetCategoryLabel(String(p.category), categories.expense), Number(p.percent ?? 0), amt("spent"), amt("limit"));
      case "budget_over": return bell.budgetOver(budgetCategoryLabel(String(p.category), categories.expense), amt("spent"), amt("limit"));
      default: return bell.taxRedo;
    }
  };
  return (
    <section className={CARD} aria-labelledby="as-review">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 id="as-review" className="inline-flex items-center gap-1.5 text-[15px] font-bold text-slate-900"><Sparkles className="h-4 w-4 text-slate-900" aria-hidden />{t.review.title}</h2>
        <span className="text-xs text-slate-500">{t.review.sub}</span>
      </div>
      {isLoading ? (
        <div className="space-y-2" role="status" aria-label={t.review.title}><Skeleton className="h-[60px] rounded-xl" /><Skeleton className="h-[60px] rounded-xl" /></div>
      ) : isError || shown.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{t.review.ok}</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((n) => {
            const [title, body] = words(n);
            const Icon = n.urgent ? AlertTriangle : NOTICE_ICON[n.kind] ?? Bell;
            return (
              <li key={n.key} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl bg-slate-100 px-3 py-[11px] sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <span className="grid w-[22px] place-items-center"><Icon className={cn("h-[18px] w-[18px]", n.urgent ? "text-red-600" : "text-blue-600")} aria-hidden /></span>
                <div className="min-w-0">
                  <b className="block text-sm font-semibold text-slate-900">{title}</b>
                  <span className="block text-xs text-slate-500">{body}</span>
                </div>
                {n.path && (
                  <button type="button" onClick={() => navigate(n.path)}
                    className={cn("col-start-2 justify-self-start sm:col-start-auto sm:justify-self-end", n.urgent ? `inline-flex min-h-[34px] items-center rounded-[10px] bg-blue-600 px-[11px] text-[13px] font-semibold text-white hover:brightness-110 ${FOCUS}` : BTN_SM)}>
                    {t.review.see}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > shown.length && <p className="mt-2 text-xs text-slate-500">{t.review.more(items.length - shown.length)}</p>}
    </section>
  );
}

/** "Tus conversaciones": a new chat, and the saved ones (named after their first question), most recent first. */
function ChatList({ chats, current, t, locale, busy, onOpen, onRemove }: {
  chats: Chat[]; current: number | null; t: AssistantCopy; locale: string; busy: boolean; onOpen: (id: number | null) => void; onRemove: (id: number) => void;
}) {
  const when = (iso: string) => {
    const d = new Date(iso);
    const day = (x: Date) => x.toLocaleDateString("en-CA");
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (day(d) === day(now)) return t.chats.today;
    if (day(d) === day(yesterday)) return t.chats.yesterday;
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(".", "");
  };
  return (
    <section className={CARD} aria-labelledby="as-chats">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 id="as-chats" className="text-[15px] font-bold text-slate-900">{t.chats.title}</h2>
        <button type="button" onClick={() => onOpen(null)} className={BTN_SM}><Plus className="h-[15px] w-[15px]" aria-hidden />{t.chats.new}</button>
      </div>
      {chats.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t.chats.empty}</p>
      ) : (
        <ul className="-mx-1.5 grid max-h-[320px] gap-0.5 overflow-y-auto">
          {chats.map((c) => {
            const on = c.id === current;
            const title = c.title || t.chats.untitled;
            return (
              <li key={c.id} className={cn("group flex items-center gap-1 rounded-[10px] pr-1", on ? "bg-slate-100" : "hover:bg-slate-50")}>
                <button type="button" onClick={() => onOpen(c.id)} aria-current={on ? "true" : undefined}
                  className={`min-w-0 flex-1 rounded-[10px] px-2.5 py-2 text-left ${FOCUS}`}>
                  <span className={cn("block truncate text-[13px]", on ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>{title}</span>
                  <span className="block text-[11px] text-slate-400">{when(c.at)}</span>
                </button>
                <button type="button" disabled={busy} onClick={() => onRemove(c.id)} aria-label={t.chats.remove(title)} title={t.chats.remove(title)}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 opacity-100 transition hover:bg-white hover:text-red-600 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${FOCUS}`}>
                  <Trash2 className="h-[15px] w-[15px]" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** "Lo que hice": what the app did on its own today, from real data (no question used). */
function ActivityCard({ t, locale }: { t: AssistantCopy; locale: string }) {
  const { data, isLoading, isError } = trpc.assistant.activity.useQuery(undefined, { staleTime: 60_000 });
  const D = t.did;
  const time = useMemo(() => {
    if (!data?.lastSync) return "";
    const d = new Date(data.lastSync);
    const sameDay = d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) === data.today;
    return sameDay ? d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?\s?m\.?/i, " $1m").toLowerCase() : "";
  }, [data, locale]);
  const lines: Array<{ key: string; text: string; path?: string; link?: string }> = [];
  if (data) {
    if (data.banks === 0) lines.push({ key: "bank", text: D.noBank, path: data.mode === "personal" ? "/personal/bank" : "/bank", link: D.connect });
    else lines.push({ key: "bank", text: D.banks(data.added) });
    if (data.mode === "business") {
      if (data.banks > 0) lines.push(data.toConfirm > 0 ? { key: "review", text: D.toConfirm(data.toConfirm), path: "/transactions" } : { key: "review", text: D.allReviewed });
      lines.push(data.owed.late > 0 ? { key: "owed", text: D.late(data.owed.late), path: "/invoices" }
        : data.owed.count > 0 ? { key: "owed", text: D.owed(data.owed.count), path: "/invoices" } : { key: "owed", text: D.noOwed });
      if (data.bills.count > 0) lines.push({ key: "bills", text: D.bills(data.bills.count, data.bills.late), path: "/vendors" });
    }
  }
  return (
    <section className={CARD} aria-labelledby="as-did">
      <h2 id="as-did" className="text-[15px] font-bold text-slate-900">{D.title}</h2>
      {isLoading ? (
        <div className="mt-2 space-y-2" role="status" aria-label={D.title}><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
      ) : isError || !data ? (
        <p className="mt-1.5 text-sm text-slate-500">{D.error}</p>
      ) : (
        <>
          <p className="mt-1.5 text-xs font-semibold text-slate-500">{D.when(time)}</p>
          <ul className="mt-1 grid gap-1.5 text-sm leading-snug text-slate-800">
            {lines.map((l) => (
              <li key={l.key}>
                {l.text}
                {l.path && <> · <Link to={l.path} className={SRC_LINK}>{l.link ?? D.see}</Link></>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The month's questions as one bar: "Límite", filling with the share used (red when it's all used). */
function LimitBar({ limit, used, remaining, t }: { limit: number; used: number; remaining: number; t: AssistantCopy }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const out = remaining <= 0;
  const low = remaining / limit < 0.1;
  return (
    <div className="flex items-center gap-2" title={t.limitTitle(used, limit)}>
      <span className="text-xs font-semibold text-slate-500">{t.limit}</span>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 sm:w-32" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t.limitTitle(used, limit)}>
        <div className={cn("h-full rounded-full transition-[width] duration-500", out ? "bg-red-600" : low ? "bg-amber-500" : "bg-blue-600")} style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }} />
      </div>
      <span className={cn("w-9 text-right text-xs font-semibold tabular-nums", out ? "text-red-600" : low ? "text-amber-700" : "text-slate-700")}>{pct}%</span>
    </div>
  );
}

/** "Tu resumen del lunes": last week and this week, worked out on the server from real data (no question used). */
function WeeklyCard({ t, locale, canAsk, onAsk }: { t: AssistantCopy; locale: string; canAsk: boolean; onAsk: () => void }) {
  const { data, isLoading, isError } = trpc.assistant.weekly.useQuery(undefined, { staleTime: 5 * 60_000 });
  const { categories } = useCopy(personalCopy);
  // "lunes 16 nov" / "Monday Nov 16", like the prototype's title.
  const monday = useMemo(() => {
    if (!data) return "";
    const d = new Date(`${data.monday}T12:00:00`);
    const weekday = d.toLocaleDateString(locale, { weekday: "long" });
    const month = d.toLocaleDateString(locale, { month: "short" }).replace(".", "");
    return locale.startsWith("es") ? `${weekday} ${d.getDate()} ${month}` : `${weekday}, ${month} ${d.getDate()}`;
  }, [data, locale]);
  const utils = trpc.useUtils();
  const prefs = trpc.assistant.prefs.useQuery(undefined, { staleTime: 5 * 60_000 });
  const setEmail = trpc.assistant.setWeeklyEmail.useMutation({
    onSuccess: (r) => { utils.assistant.prefs.setData(undefined, (p) => p && { ...p, weeklyEmail: r.weeklyEmail }); toast.success(r.weeklyEmail ? t.week.emailOn : t.week.emailOff); },
    onError: () => toast.error(t.error),
  });
  return (
    <section className={CARD} aria-labelledby="as-week">
      {/* Like the 2.0 card: the title, and the Monday email switch beside it (green when on). */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="as-week" className="inline-flex items-start gap-1.5 text-[15px] font-bold text-slate-900">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />{data ? t.week.title(monday) : t.week.title("…")}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{t.week.note}</p>
        </div>
        {prefs.data?.mailReady && (
          <label className="flex max-w-[150px] shrink-0 cursor-pointer items-center gap-2 text-right text-xs leading-snug text-slate-500">
            <span>{t.week.email}</span>
            <Switch checked={!!prefs.data.weeklyEmail} disabled={setEmail.isPending} onCheckedChange={(on) => setEmail.mutate({ on })} aria-label={t.week.email}
              className="shrink-0 data-[state=checked]:bg-emerald-600" />
          </label>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2" role="status" aria-label={t.week.loading}><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-4/6" /></div>
      ) : isError || !data ? (
        <p className="text-sm text-slate-500">{t.week.error}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1.5 pl-[18px] text-sm leading-snug text-slate-800 marker:text-slate-400">
          {weekLines(data, t, (k) => budgetCategoryLabel(k, categories.expense)).map((l) => (
            <li key={l.key}>
              {l.text}
              {l.path && <> · <Link to={l.path} className={SRC_LINK}>{l.link ?? t.week.see}</Link></>}
            </li>
          ))}
        </ul>
      )}
      {canAsk && data && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <button type="button" onClick={onAsk} className={BTN_SM}><Sparkles className="h-[15px] w-[15px] text-blue-600" aria-hidden />{t.week.ask}</button>
          <span className="text-xs text-slate-500">{t.week.askNote}</span>
        </div>
      )}
    </section>
  );
}

type WeekLine = { key: string; text: ReactNode; path?: string; link?: string };

function bold(parts: [string, string, string]): ReactNode {
  return <>{parts[0]}<b className="font-bold tabular-nums">{parts[1]}</b>{parts[2]}</>;
}

/** The summary's lines, in the prototype's order: what moved last week, money owed, what to pay this week. */
function weekLines(w: Weekly, t: AssistantCopy, catLabel: (k: string) => string): WeekLine[] {
  const L = t.week;
  if (w.mode === "personal") {
    const out: WeekLine[] = [];
    const monthPath = `/personal/transactions?year=${Number(w.from.slice(0, 4))}&month=${Number(w.from.slice(5, 7))}`;
    out.push(w.spent > 0
      ? { key: "spent", text: bold(L.spent(money(w.spent), w.top ? catLabel(w.top.category) : "", w.top ? money0(w.top.amount) : "")), path: monthPath }
      : { key: "spent", text: L.noSpent });
    if (w.over) out.push({ key: "over", text: L.over(catLabel(w.over.category), money0(w.over.spent - w.over.limit)), path: "/personal/budgets" });
    else if (w.budgets > 0) out.push({ key: "over", text: L.inBudget });
    else out.push({ key: "over", text: L.noBudgets, path: "/personal/budgets", link: L.create });
    if (w.goals.count > 0) out.push({ key: "goals", text: L.goals(money0(w.goals.saved), money0(w.goals.target)), path: "/personal/goals" });
    return out;
  }
  const out: WeekLine[] = [];
  if (w.bank.count > 0) out.push({ key: "moved", text: bold(L.bank(money(w.bank.moneyIn), money(w.bank.moneyOut))), path: "/bank" });
  else if (w.sales.count > 0 || w.expenses.count > 0) out.push({ key: "moved", text: bold(L.sold(money(w.sales.total), money(w.expenses.total))), path: "/reports" });
  else out.push({ key: "moved", text: L.quiet });
  const top = w.owed.top;
  if (w.owed.late > 0 && top) out.push({ key: "owed", text: L.late(w.owed.late, top.client, money(top.balance)), path: `/invoices?id=s${top.saleId}` });
  else if (w.owed.count > 0) out.push({ key: "owed", text: L.owed(money(w.owed.total), w.owed.count), path: "/invoices" });
  else out.push({ key: "owed", text: L.noOwed });
  out.push(w.bills.count > 0 ? { key: "bills", text: L.bills(money(w.bills.total), w.bills.late), path: "/vendors" } : { key: "bills", text: L.noBills });
  return out;
}
