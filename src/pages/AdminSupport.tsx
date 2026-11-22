// ── Soporte: the admins' side of the site's chat bubble ──
// /admin/soporte      → every chat, newest activity first (and, on computers, the one picked beside it).
// /admin/soporte/:id  → one chat: read it, answer as an agent, hand it back to the AI or close it.
// The AI answers visitors on its own; the first answer here takes the chat from it (api/support-router.ts).
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { ArrowUp, Check, ChevronLeft, Globe, Headphones, Inbox, Loader2, Mail, Shield, Sparkles, UserRound, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { supportCopy } from "@/i18n/copy/support";
import { SupportIcon } from "@/components/support/SupportIcon";
import { cn } from "@/lib/utils";

type Status = "ai" | "waiting" | "agent" | "closed";
type Filter = "all" | "waiting" | "agent" | "closed";

const STATUS_TONE: Record<Status, string> = {
  ai: "bg-blue-50 text-blue-700 ring-blue-200",
  waiting: "bg-amber-50 text-amber-700 ring-amber-200",
  agent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-100 text-slate-500 ring-slate-200",
};

function StatusChip({ status }: { status: string }) {
  const t = useCopy(supportCopy).admin;
  const s = (["ai", "waiting", "agent", "closed"].includes(status) ? status : "ai") as Status;
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", STATUS_TONE[s])}>{s === "waiting" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}{t.status[s]}</span>;
}

function timeAgo(d: Date | string, locale: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const min = Math.round(ms / 60_000);
  if (min < 1) return rtf.format(0, "minute");
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  return new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export default function AdminSupport() {
  const { isAdmin } = useAuth();
  const { id } = useParams<{ id: string }>();
  const t = useCopy(supportCopy).admin;
  const chatId = id && /^\d+$/.test(id) ? Number(id) : null;
  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <Shield className="mx-auto mb-3 h-12 w-12 text-neutral-300" aria-hidden />
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-7xl flex-col p-4 lg:p-6">
      <Link to={chatId ? "/admin/soporte" : "/admin"} className="mb-3 inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium text-neutral-500 hover:text-neutral-900 lg:hidden">
        <ChevronLeft className="h-4 w-4" aria-hidden />{chatId ? t.backToList : t.back}
      </Link>
      <Link to="/admin" className="mb-3 hidden w-fit items-center gap-1 rounded-md text-sm font-medium text-neutral-500 hover:text-neutral-900 lg:inline-flex">
        <ChevronLeft className="h-4 w-4" aria-hidden />{t.back}
      </Link>

      <div className={cn("relative overflow-hidden rounded-2xl bg-[#0B1224] p-5 text-white", chatId && "hidden lg:block")}>
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-20 h-48 w-48 rounded-full bg-blue-600/40 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><SupportIcon className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{t.title}</h1>
            <p className="text-sm text-slate-300">{t.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <ChatList selected={chatId} className={chatId ? "hidden lg:flex" : "flex"} />
        {chatId ? <ChatView key={chatId} chatId={chatId} /> : (
          <div className="hidden h-[calc(100dvh-15rem)] items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white text-sm text-neutral-400 lg:flex">
            <span className="flex items-center gap-2"><Inbox className="h-4 w-4" aria-hidden />{t.pick}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatList({ selected, className }: { selected: number | null; className?: string }) {
  const t = useCopy(supportCopy).admin;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading } = trpc.support.adminList.useQuery(undefined, { refetchInterval: 6000, refetchOnWindowFocus: true });
  const all = data ?? [];
  const rows = all.filter((r) => filter === "all" || r.status === filter);
  const waiting = all.filter((r) => r.status === "waiting").length;
  return (
    <section className={cn("h-[calc(100dvh-15rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm", className)} aria-label={t.title}>
      <div className="flex gap-1.5 overflow-x-auto border-b border-neutral-100 p-2.5">
        {(["all", "waiting", "agent", "closed"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", filter === f ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900")}>
            {t.filters[f]}{f === "waiting" && waiting > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] text-neutral-900">{waiting}</span>}
          </button>
        ))}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
        {isLoading && <li className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-neutral-300" aria-hidden /></li>}
        {!isLoading && rows.length === 0 && <li className="p-8 text-center text-sm text-neutral-400">{t.empty}</li>}
        {rows.map((r) => {
          const who = r.name || r.email || t.visitor(r.id);
          const on = r.id === selected;
          const prefix = r.lastRole === "ai" ? `${t.from.ai}: ` : r.lastRole === "agent" ? `${t.from.agent}: ` : "";
          return (
            <li key={r.id}>
              <Link to={`/admin/soporte/${r.id}`} aria-current={on ? "page" : undefined}
                className={cn("flex gap-3 px-3.5 py-3 transition-colors", on ? "bg-blue-50/70" : "hover:bg-neutral-50")}>
                <span aria-hidden className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold", r.name || r.email ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white" : "bg-neutral-100 text-neutral-500")}>
                  {r.name || r.email ? (r.name || r.email || "?").charAt(0).toUpperCase() : <UserRound className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn("truncate text-sm", r.unread ? "font-semibold text-neutral-900" : "font-medium text-neutral-800")}>{who}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-neutral-400">{timeAgo(r.updatedAt, locale)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", r.unread ? "text-neutral-800" : "text-neutral-500")}>{prefix}{r.lastBody ?? ""}</span>
                    {r.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white">{r.unread}</span>}
                  </span>
                  <span className="mt-1.5 flex items-center gap-2"><StatusChip status={r.status} />{r.page && <span className="truncate text-[11px] text-neutral-400">{r.page}</span>}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChatView({ chatId }: { chatId: number }) {
  const all = useCopy(supportCopy);
  const t = all.admin;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();
  const { data, isLoading, isError } = trpc.support.adminGet.useQuery({ chatId }, { refetchInterval: 4000, refetchOnWindowFocus: true });
  const reply = trpc.support.adminReply.useMutation();
  const setStatus = trpc.support.adminSetStatus.useMutation();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const messages = data?.messages ?? [];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const refresh = () => Promise.all([utils.support.adminGet.invalidate({ chatId }), utils.support.adminList.invalidate(), utils.support.adminUnread.invalidate()]);
  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || reply.isPending) return;
    try {
      const r = await reply.mutateAsync({ chatId, body });
      setDraft("");
      toast.success(r.mailed ? t.mailed : t.sent);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : all.error);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };
  const change = async (status: "ai" | "closed") => {
    await setStatus.mutateAsync({ chatId, status }).catch(() => undefined);
    await refresh();
  };

  if (isLoading) return <div className="flex h-[calc(100dvh-15rem)] items-center justify-center rounded-2xl border border-neutral-200/80 bg-white"><Loader2 className="h-6 w-6 animate-spin text-neutral-300" aria-hidden /></div>;
  if (isError || !data) return <div className="flex h-[calc(100dvh-15rem)] items-center justify-center rounded-2xl border border-neutral-200/80 bg-white text-sm text-neutral-400">{all.error}</div>;
  const c = data.chat;
  const who = c.name || c.email || t.visitor(c.id);

  return (
    <section className="flex h-[calc(100dvh-12rem)] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm lg:h-[calc(100dvh-15rem)]" aria-label={who}>
      {/* Who it is */}
      <div className="flex flex-wrap items-start gap-3 border-b border-neutral-100 p-4">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-base font-semibold text-white">
          {c.name || c.email ? who.charAt(0).toUpperCase() : <UserRound className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-base font-semibold text-neutral-900">{who}</h1>
            <StatusChip status={c.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", c.online ? "bg-emerald-500" : "bg-neutral-300")} />{c.online ? t.online : t.away}</span>
            <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" aria-hidden />{c.email ?? t.noEmail}</span>
            {c.page && <span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" aria-hidden />{t.page}: {c.page}</span>}
            {c.signedIn && <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" aria-hidden />{t.signedIn}</span>}
            <span className="uppercase">{c.lang}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {(c.status === "agent" || c.status === "waiting") && (
            <button type="button" onClick={() => void change("ai")} disabled={setStatus.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-100">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />{t.toAi}
            </button>
          )}
          {c.status !== "closed" && (
            <button type="button" onClick={() => void change("closed")} disabled={setStatus.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-200">
              <X className="h-3.5 w-3.5" aria-hidden />{t.closeChat}
            </button>
          )}
        </div>
      </div>

      {/* The conversation (the visitor on the left, the AI and agents on the right) */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.map((m) => {
          if (m.fromRole === "system") {
            const text = m.body === "joined" ? all.notes.joined(m.authorName || all.agentRole) : m.body === "closed" ? all.notes.closed : m.body === "toAi" ? all.notes.toAi : all.notes.handoff;
            return (
              <div key={m.id} className="flex justify-center">
                <p className="inline-flex max-w-full items-start gap-1.5 rounded-2xl bg-white px-3 py-1.5 text-center text-[12px] text-slate-500 ring-1 ring-slate-200"><Headphones className="mt-px h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden />{text}</p>
              </div>
            );
          }
          const mine = m.fromRole !== "visitor";
          const label = m.fromRole === "ai" ? all.aiName : m.fromRole === "agent" ? `${m.authorName || all.agentRole} · ${all.agentRole}` : who;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className="min-w-0 max-w-[80%]">
                <p className={cn("mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-500", mine ? "justify-end" : "")}>
                  {m.fromRole === "ai" && <Sparkles className="h-3 w-3 text-blue-600" aria-hidden />}
                  {label} · {new Date(m.createdAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                </p>
                <p className={cn("whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed",
                  m.fromRole === "visitor" ? "rounded-bl-md bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"
                    : m.fromRole === "ai" ? "rounded-br-md bg-blue-50 text-slate-800 ring-1 ring-blue-100"
                      : "rounded-br-md bg-gradient-to-br from-blue-600 to-blue-700 text-white")}>
                  {m.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Answer */}
      <form onSubmit={send} className="border-t border-neutral-100 p-3">
        <div className="flex items-end gap-2 rounded-2xl bg-slate-50 p-1.5 pl-3.5 ring-1 ring-slate-200 transition-shadow focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} rows={1} maxLength={2000}
            placeholder={t.reply} aria-label={t.reply}
            className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug text-slate-900 outline-none [field-sizing:content] placeholder:text-slate-400" />
          <button type="submit" disabled={!draft.trim() || reply.isPending}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 px-4 text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(37,99,235,0.9)] transition-[transform,opacity] hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:hover:scale-100">
            {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}{t.send}
          </button>
        </div>
      </form>
    </section>
  );
}
