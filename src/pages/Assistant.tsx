import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUp, Bell, CheckCircle2, Clock, FileText, Inbox, Link2, Loader2, Lock, PieChart, RefreshCw, Sparkles, Trash2, Users, type LucideIcon,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { data, isLoading, isError, refetch, isFetching } = trpc.assistant.status.useQuery();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: async () => { await utils.assistant.status.invalidate(); setPending(null); },
    onError: (e, vars) => {
      setPending(null);
      // Give the question back so it can be sent again.
      setQuestion((q) => q || vars.question);
      toast.error(e.message || t.error);
    },
  });
  const clear = trpc.assistant.clear.useMutation({ onSuccess: () => utils.assistant.status.invalidate() });

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const chatRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: messages.length ? "smooth" : "auto" });
  }, [messages.length, pending]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || ask.isPending) return;
    setPending(q);
    setQuestion("");
    ask.mutate({ question: q });
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
    <button key={q} type="button" disabled={disabled || ask.isPending} onClick={() => send(q)}
      className={`max-w-full whitespace-normal rounded-full border border-slate-200 bg-white px-3.5 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}>{q}</button>
  );
  const planNote = (outOfQuestions || limit === 0) && (
    <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-amber-800">
      {limit === 0 && <Lock className="h-3.5 w-3.5" aria-hidden />}
      {limit === 0 ? t.noPlan : t.used}
      <Link to="/settings?sec=plan" className="font-semibold text-blue-600 underline-offset-2 hover:underline">{t.changePlan}</Link>
    </p>
  );
  const composer = (
    <form className="flex items-center gap-2 rounded-[26px] border border-slate-200 bg-white p-1.5 pl-5 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)] transition focus-within:border-blue-500 focus-within:ring-[3px] focus-within:ring-blue-50"
      onSubmit={(e) => { e.preventDefault(); send(question); }}>
      <input
        value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} disabled={disabled}
        placeholder={t.placeholder} aria-label={t.label} autoComplete="off"
        className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed sm:text-[15px]"
      />
      <button type="submit" disabled={disabled || !question.trim() || ask.isPending} aria-label={ask.isPending ? t.sending : t.send}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${FOCUS}`}>
        {ask.isPending ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /> : <ArrowUp className="h-[18px] w-[18px]" aria-hidden />}
      </button>
    </form>
  );

  return (
    <AnimatedPage className="flex min-h-full flex-col p-4 lg:p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {/* Head: title, the month's limit (one bar), clear */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[22px] font-[750] tracking-tight text-slate-900">{t.title}</h1>
          <div className="flex items-center gap-3">
            {limit > 0 && <LimitBar limit={limit} used={used} remaining={remaining} t={t} />}
            {messages.length > 0 && (
              <button type="button" disabled={clear.isPending} onClick={() => { if (window.confirm(t.clearConfirm)) clear.mutate(); }}
                className={BTN_SM} aria-label={t.clear} title={t.clear}>
                {clear.isPending ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Trash2 className="h-[15px] w-[15px]" />}
                <span className="hidden sm:inline">{t.clearShort}</span>
              </button>
            )}
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
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <ReviewCard t={t} />
              <WeeklyCard t={t} locale={locale} canAsk={!disabled && !ask.isPending} onAsk={() => send(t.week.askQuestion)} />
            </div>
          </div>
        ) : (
          /* The conversation, newest at the bottom, and the box fixed under it. */
          <>
            <section ref={chatRef} aria-live="polite" aria-label={t.chatLabel} className="flex flex-1 flex-col gap-5 py-6">
              {messages.map((m) => (
                <Bubble key={m.id} mine={m.role === "user"} label={m.role === "user" ? t.you : t.assistant}>
                  {m.content}
                  {m.role === "assistant" && m.sources.length > 0 && <Sources sources={m.sources} t={t} locale={locale} />}
                </Bubble>
              ))}
              {pending && (
                <>
                  <Bubble mine label={t.you}>{pending}</Bubble>
                  <Bubble mine={false} label={t.assistant}>
                    <span className="inline-flex items-center gap-2 text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t.thinking}</span>
                  </Bubble>
                </>
              )}
              <div ref={endRef} />
            </section>
            <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-10 -mx-1 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-1 pb-1 pt-4 lg:bottom-0">
              <div className="grid gap-2">
                {planNote}
                {composer}
                <p className="text-center text-[11px] text-slate-400">{t.disclaimer}</p>
              </div>
            </div>
          </>
        )}
      </div>
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
  return (
    <section className={CARD} aria-labelledby="as-week">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
        <h2 id="as-week" className="inline-flex items-start gap-1.5 text-[15px] font-bold text-slate-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />{data ? t.week.title(monday) : t.week.title("…")}
        </h2>
        <span className="text-xs text-slate-500">{t.week.note}</span>
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
