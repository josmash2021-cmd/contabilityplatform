import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AlertCircle, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { assistantCopy } from "@/i18n/copy/assistant";

/** First day of next month, e.g. "1 de diciembre": when the monthly questions renew. */
function renewDate(locale: string): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString(locale, { day: "numeric", month: "long" });
}

export default function Assistant() {
  const t = useCopy(assistantCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.assistant.status.useQuery();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: async () => { await utils.assistant.status.invalidate(); setPending(null); },
    onError: (e) => { setPending(null); toast.error(e.message || t.error); },
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

  if (isLoading || !data) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-neutral-400" /></div>
      </AnimatedPage>
    );
  }

  const { mode, limit, remaining, ready } = data;
  const outOfQuestions = limit > 0 && remaining <= 0;
  const disabled = !ready || limit === 0 || outOfQuestions;

  return (
    <AnimatedPage className="p-4 lg:p-6">
      <div className="mx-auto flex max-w-3xl flex-col" style={{ minHeight: "calc(100dvh - 9rem)" }}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm"><Sparkles className="h-5 w-5" /></span>
            <div>
              <h1 className="text-xl font-semibold text-black">{t.title}</h1>
              <p className="text-sm text-neutral-500">{t.subtitle[mode]}</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" className="border-neutral-200" disabled={clear.isPending} onClick={() => { if (window.confirm(t.clearConfirm)) clear.mutate(); }}>
              <Trash2 className="h-3.5 w-3.5" /> <span className="ml-1">{t.clear}</span>
            </Button>
          )}
        </header>

        {limit > 0 && (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-black">{t.remaining(remaining, limit)}</span>
              <span className="text-xs text-neutral-500">{t.renews(renewDate(locale))}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={limit - remaining} aria-label={t.remaining(remaining, limit)}>
              <div className={`h-full rounded-full ${remaining / limit < 0.1 ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, ((limit - remaining) / limit) * 100)}%` }} />
            </div>
          </div>
        )}

        {!ready && (
          <p className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{t.notReady}</p>
        )}

        <section className="mt-4 flex-1 space-y-3" aria-live="polite">
          {messages.length === 0 && !pending && (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
              <p className="text-lg font-semibold text-black">{t.empty}</p>
              <p className="mt-1 text-sm text-neutral-500">{t.emptyText}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {t.suggestions[mode].map((s) => (
                  <button key={s} disabled={disabled} onClick={() => send(s)}
                    className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
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
              <div className="flex items-center gap-2 text-sm text-neutral-500" role="status">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-100"><Sparkles className="h-3.5 w-3.5 text-violet-600" /></span>
                <Loader2 className="h-4 w-4 animate-spin" /> {t.thinking}
              </div>
            </>
          )}
          <div ref={endRef} />
        </section>

        <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-white via-white to-transparent pb-2 pt-3">
          {outOfQuestions && (
            <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-amber-800">{t.used} <Link to="/settings" className="font-semibold underline underline-offset-2">{t.changePlan}</Link></p>
          )}
          {limit === 0 && <p className="mb-2 text-sm text-neutral-600">{t.noPlan} <Link to="/settings" className="font-semibold underline underline-offset-2">{t.changePlan}</Link></p>}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(question); }}>
            <label htmlFor="assistant-q" className="sr-only">{t.placeholder}</label>
            <textarea
              id="assistant-q" value={question} rows={1} maxLength={1000} placeholder={t.placeholder} disabled={disabled}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(question); } }}
              className="min-h-[48px] flex-1 resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-neutral-400 focus:outline-none disabled:bg-neutral-50"
            />
            <Button type="submit" disabled={disabled || !question.trim() || ask.isPending} className="h-12 w-12 shrink-0 rounded-2xl bg-black p-0 text-white hover:bg-neutral-800" aria-label={t.send}>
              {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-neutral-400">{t.disclaimer}</p>
        </div>
      </div>
    </AnimatedPage>
  );
}

function Bubble({ mine, text, label }: { mine: boolean; text: string; label: string }) {
  return (
    <div className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-100" aria-hidden><Sparkles className="h-3.5 w-3.5 text-violet-600" /></span>}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${mine ? "rounded-br-sm bg-black text-white" : "rounded-bl-sm border border-neutral-200 bg-white text-neutral-800"}`}>
        <span className="sr-only">{label}: </span>
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
}
