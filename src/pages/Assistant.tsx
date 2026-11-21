import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { toast } from "sonner";
import { Clock, Loader2, Lock, RefreshCw, Send, Sparkles, Trash2 } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { assistantCopy } from "@/i18n/copy/assistant";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** The 2.0 assistant: monthly questions from the server, the conversation, and a send bar at the bottom. */
export default function Assistant() {
  const t = useCopy(assistantCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();
  const { data, isLoading, isError, refetch, isFetching } = trpc.assistant.status.useQuery();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // First day of next month, e.g. "1 de diciembre": when the monthly questions renew.
  const renews = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString(locale, { day: "numeric", month: "long" });
  }, [locale]);

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

  const messages = data?.messages ?? [];
  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
        <div className="mx-auto max-w-3xl space-y-5" role="status" aria-label={t.thinking}>
          <div className="flex items-center gap-3"><Skeleton className="h-11 w-11 rounded-xl" /><div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></div></div>
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </AnimatedPage>
    );
  }
  if (isError || !data) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 text-center" role="alert">
          <p className="font-semibold text-slate-900">{t.loadError}</p>
          <button onClick={() => refetch()} disabled={isFetching} className={`mt-4 inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />{t.retry}
          </button>
        </div>
      </AnimatedPage>
    );
  }

  const { mode, limit, used, remaining, ready } = data;
  const outOfQuestions = limit > 0 && remaining <= 0;
  const disabled = !ready || limit === 0 || outOfQuestions;
  const low = limit > 0 && remaining / limit < 0.1;

  return (
    // Leave room at the bottom for the send bar.
    <AnimatedPage className="p-4 pb-48 lg:p-8 lg:pb-48">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm"><Sparkles className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
              <p className="mt-0.5 text-sm text-slate-500">{t.subtitle[mode]}</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button disabled={clear.isPending} onClick={() => { if (window.confirm(t.clearConfirm)) clear.mutate(); }}
              className={`inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}>
              {clear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="sm:hidden">{t.clearShort}</span><span className="hidden sm:inline">{t.clear}</span>
            </button>
          )}
        </header>

        {limit > 0 && ready && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="as-usage">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 id="as-usage" className="text-sm font-semibold text-slate-900">{t.usageTitle}</h2>
              <span className={`text-sm font-semibold tabular-nums ${outOfQuestions ? "text-red-700" : low ? "text-amber-700" : "text-slate-900"}`}>{t.left(remaining)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={limit - remaining} aria-label={t.remaining(remaining, limit)}>
              <div className={`h-full rounded-full ${outOfQuestions ? "bg-red-500" : low ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, ((limit - remaining) / limit) * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500"><span className="tabular-nums">{t.usedOf(used, limit)}</span> · {t.renews(renews)}</p>
          </section>
        )}

        {!ready ? (
          // No API key on the server: a calm "not right now", not an error.
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8" role="status" aria-labelledby="as-off">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Clock className="h-6 w-6" /></span>
            <h2 id="as-off" className="mt-4 text-lg font-semibold text-slate-900">{t.notReady.title}</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{t.notReady.text}</p>
          </section>
        ) : (
          <section className="space-y-3" aria-live="polite" aria-label={t.title}>
            {messages.length === 0 && !pending && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Sparkles className="h-6 w-6" /></span>
                <p className="mt-4 text-lg font-semibold text-slate-900">{t.empty}</p>
                <p className="mt-1 text-sm text-slate-500">{t.emptyText}</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {t.suggestions[mode].map((s) => (
                    <button key={s} disabled={disabled} onClick={() => send(s)}
                      className={`min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/50 disabled:opacity-50 ${FOCUS}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => <Bubble key={m.id} mine={m.role === "user"} text={m.content} label={m.role === "user" ? t.you : t.assistant} />)}
            {pending && (
              <>
                <Bubble mine text={pending} label={t.you} />
                <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-50"><Sparkles className="h-4 w-4 text-violet-600" /></span>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t.thinking}
                </div>
              </>
            )}
            <div ref={endRef} />
          </section>
        )}
      </div>

      {/* Send bar: fixed above the phone tab bar. Rendered in <body> because the page's entrance
          animation (a transform) would otherwise pin "fixed" to the page instead of the screen. */}
      {createPortal(
        <div className="fixed inset-x-0 bottom-[calc(66px+env(safe-area-inset-bottom,0px))] z-30 border-t border-slate-200 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-6px_16px_-10px_rgba(15,23,42,0.25)] backdrop-blur lg:bottom-0 lg:left-60 lg:pb-3" role="region" aria-label={t.label}>
          <div className="mx-auto max-w-3xl">
            {outOfQuestions && (
              <p className="mb-2 flex flex-wrap items-center gap-x-2 text-sm font-medium text-amber-800">{t.used} <Link to="/settings" className="font-semibold text-blue-600 underline-offset-2 hover:underline">{t.changePlan}</Link></p>
            )}
            {limit === 0 && (
              <p className="mb-2 flex flex-wrap items-center gap-x-2 text-sm text-slate-600"><Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden />{t.noPlan} <Link to="/settings" className="font-semibold text-blue-600 underline-offset-2 hover:underline">{t.changePlan}</Link></p>
            )}
            <form onSubmit={(e) => { e.preventDefault(); send(question); }}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <label htmlFor="assistant-q" className="text-xs font-semibold text-slate-600">{t.label}</label>
                {!ready
                  ? <span className="text-xs text-slate-500">{t.notReady.tag}</span>
                  : limit > 0 && <span className="text-xs tabular-nums text-slate-500 sm:hidden">{t.left(remaining)}</span>}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  id="assistant-q" value={question} rows={1} maxLength={1000} placeholder={t.placeholder} disabled={disabled}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(question); } }}
                  className="max-h-40 min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 sm:text-sm"
                />
                <button type="submit" disabled={disabled || !question.trim() || ask.isPending} aria-label={t.send}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none focus-visible:ring-offset-2 ${FOCUS}`}>
                  {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
            <p className="mt-1.5 text-center text-[11px] text-slate-400">{t.disclaimer}</p>
          </div>
        </div>,
        document.body,
      )}
    </AnimatedPage>
  );
}

function Bubble({ mine, text, label }: { mine: boolean; text: string; label: string }) {
  return (
    <div className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine && <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-50" aria-hidden><Sparkles className="h-4 w-4 text-violet-600" /></span>}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}>
        <span className="sr-only">{label}: </span>
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
}
