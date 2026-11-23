// Soporte 24/7: the chat bubble on the site's pages. The AI answers right away; with the first message the chat
// says a specialist will join in a few minutes (the admins are told), and from then on an agent can answer from
// /admin/soporte. The visitor is known by a random key kept in this browser (api/support-router.ts).
// Phones: the chat opens full screen. Words: src/i18n/copy/support.ts.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUp, Check, Headphones, Mail, Sparkles, UserRound, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { supportCopy, type SupportCopy } from "@/i18n/copy/support";
import { useMedia } from "@/hooks/useMedia";
import { cn } from "@/lib/utils";
import { fx } from "@/lib/fx";
import { SupportIcon } from "./SupportIcon";

const TOKEN_KEY = "pbs_support";
const TEASER_KEY = "pbs_support_teaser";
const NO_TOKEN = "0".repeat(48);

function readToken(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && /^[a-f0-9]{48}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const t = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private window: the chat lives while the page is open */ }
  return t;
}

type Msg = { id: number; fromRole: string; authorName: string | null; body: string };

/** The text with its web addresses as links (opened in a new tab). */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const url = p.replace(/[.,;:!?]+$/, "");
        const rest = p.slice(url.length);
        return <span key={i}><a href={url} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-current/40 underline-offset-2 hover:decoration-current">{url.replace(/^https?:\/\//, "")}</a>{rest}</span>;
      })}
    </>
  );
}

function AiAvatar() {
  return <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_6px_14px_-6px_rgba(37,99,235,0.8)]"><Sparkles className="h-3.5 w-3.5" /></span>;
}

function AgentAvatar({ name }: { name: string }) {
  return <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-[12px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(5,150,105,0.8)]">{name.charAt(0).toUpperCase()}</span>;
}

function Line({ m, t }: { m: Msg; t: SupportCopy }) {
  if (m.fromRole === "system") {
    const text = m.body === "joined" ? t.notes.joined(m.authorName || t.agentRole) : m.body === "closed" ? t.notes.closed : m.body === "toAi" ? t.notes.toAi : t.notes.handoff;
    const Icon = m.body === "joined" ? Check : m.body === "toAi" ? Sparkles : Headphones;
    return (
      <div className="day-rise flex justify-center px-2">
        <p className="inline-flex max-w-full items-start gap-1.5 rounded-2xl bg-white px-3 py-1.5 text-center text-[12px] leading-snug text-slate-600 shadow-sm ring-1 ring-slate-200/80">
          <Icon aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-blue-600" />{text}
        </p>
      </div>
    );
  }
  if (m.fromRole === "visitor") {
    return (
      <div className="day-rise flex justify-end">
        <p className="max-w-[82%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 to-blue-700 px-3.5 py-2 text-[14px] leading-relaxed text-white shadow-[0_8px_20px_-12px_rgba(37,99,235,0.9)]">{m.body}</p>
      </div>
    );
  }
  const agent = m.fromRole === "agent";
  const name = agent ? `${m.authorName || t.agentRole} · ${t.agentRole}` : t.aiName;
  return (
    <div className="day-rise flex items-end gap-2">
      {agent ? <AgentAvatar name={m.authorName || "S"} /> : <AiAvatar />}
      <div className="min-w-0 max-w-[82%]">
        <p className="mb-1 ml-1 text-[11px] font-medium text-slate-500">{name}</p>
        <p className={cn("whitespace-pre-line break-words rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[14px] leading-relaxed text-slate-800 shadow-sm ring-1", agent ? "ring-emerald-200" : "ring-slate-200/80")}>
          <Linked text={m.body} />
        </p>
      </div>
    </div>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <div className="day-rise flex items-end gap-2" role="status" aria-label={label}>
      <AiAvatar />
      <span className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-sm ring-1 ring-slate-200/80">
        <i className="typing-dot" /><i className="typing-dot [animation-delay:160ms]" /><i className="typing-dot [animation-delay:320ms]" />
      </span>
    </div>
  );
}

/** `enterAt`: on the sign-in screens the bubble comes in last with the rest of the page (data-fx, ms), only the first time. */
export function SupportBubble({ enterAt }: { enterAt?: number } = {}) {
  const t = useCopy(supportCopy);
  const [entering, setEntering] = useState(enterAt !== undefined);
  useEffect(() => {
    if (enterAt === undefined) return;
    const id = window.setTimeout(() => setEntering(false), enterAt + 1300);
    return () => window.clearTimeout(id);
  }, [enterAt]);
  const [open, setOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("soporte") === "1");
  const [token, setToken] = useState<string | null>(() => (typeof window === "undefined" ? null : readToken()));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactBad, setContactBad] = useState(false);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [skipContact, setSkipContact] = useState(false);
  // Closing plays the opening backwards (index.css .sup-panel-out), then the chat goes away.
  const [closing, setClosing] = useState(false);
  const shown = open && !closing;
  const phone = useMedia("(max-width: 639px)");
  const utils = trpc.useUtils();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // While the chat is open it checks every few seconds (an agent may answer); closed, now and then, for the badge.
  const q = trpc.support.get.useQuery(
    { token: token ?? NO_TOKEN, open },
    { enabled: !!token, refetchInterval: open ? 3000 : 20000, placeholderData: (prev) => prev, retry: false },
  );
  const send = trpc.support.send.useMutation();
  const askHuman = trpc.support.askHuman.useMutation();
  const setContact = trpc.support.setContact.useMutation();
  const chat = q.data?.chat ?? null;
  const messages: Msg[] = q.data?.messages ?? [];
  const status = chat?.status ?? "none";
  const unread = !open && chat ? chat.unread : 0;
  // In case the animation's end never arrives (a hidden tab), it still closes; opening again cancels it.
  const closeTimer = useRef<number | undefined>(undefined);
  const finishClose = () => { window.clearTimeout(closeTimer.current); setOpen(false); setClosing(false); };
  const close = () => {
    if (!open || closing) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { finishClose(); return; }
    setClosing(true);
    closeTimer.current = window.setTimeout(finishClose, 450);
  };
  const reopen = () => { window.clearTimeout(closeTimer.current); setClosing(false); setOpen(true); };

  // A small "¿Tienes preguntas?" next to the bubble, once per visit, if they haven't written yet.
  useEffect(() => {
    let seen = true;
    try { seen = sessionStorage.getItem(TEASER_KEY) === "1"; } catch { /* no storage: no teaser */ }
    if (seen || readToken()) return;
    const id = window.setTimeout(() => setTeaser(true), 6000);
    return () => window.clearTimeout(id);
  }, []);
  const hideTeaser = () => {
    setTeaser(false);
    try { sessionStorage.setItem(TEASER_KEY, "1"); } catch { /* fine */ }
  };

  // The newest line stays in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, open]);

  // Opening: the box to write gets the focus (computers), Esc closes, and on phones the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    if (!phone) inputRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setOpen(false); setClosing(false); return; }
      setClosing(true);
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => { setOpen(false); setClosing(false); }, 450);
    };
    window.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [open, phone]);

  const submit = async (raw: string) => {
    const text = raw.trim().slice(0, 1000);
    if (!text || pending) return;
    const tk = token ?? newToken();
    if (!token) setToken(tk);
    setPending(text);
    setDraft("");
    setFailed(false);
    hideTeaser();
    try {
      await send.mutateAsync({ token: tk, body: text, page: window.location.pathname });
      await utils.support.get.fetch({ token: tk, open: true }, { staleTime: 0 });
    } catch {
      setFailed(true);
      setDraft(text);
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void submit(draft); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(draft); }
  };
  const human = async () => {
    if (!token) return;
    await askHuman.mutateAsync({ token }).catch(() => undefined);
    await utils.support.get.fetch({ token, open: true }, { staleTime: 0 });
  };
  const saveContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const email = contactEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setContactBad(true); return; }
    try {
      await setContact.mutateAsync({ token, email, name: contactName.trim() || undefined });
      setSavedEmail(email.toLowerCase());
      setContactBad(false);
      await utils.support.get.fetch({ token, open: true }, { staleTime: 0 });
    } catch {
      setContactBad(true);
    }
  };

  const handedOff = messages.some((m) => m.fromRole === "system" && m.body === "handoff");
  const showContact = !!chat && !chat.hasEmail && !skipContact && handedOff && status !== "closed";
  const statusText = status === "agent" ? t.status.agent(chat?.agentName || t.agentRole) : status === "waiting" ? t.status.waiting : status === "closed" ? t.status.closed : t.status.ai;
  const empty = !messages.length && !pending;

  let thread: ReactNode = null;
  if (open) {
    thread = (
      <div
        role="dialog"
        aria-label={t.dialog}
        onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) finishClose(); }}
        className={cn(
          closing ? "sup-panel-out" : "sup-panel-in",
          "fixed z-[70] flex flex-col overflow-hidden bg-slate-50",
          phone
            ? "inset-0 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)]"
            : "bottom-[calc(6.25rem+env(safe-area-inset-bottom,0px))] right-5 h-[min(640px,calc(100dvh-8rem))] w-[390px] rounded-[28px] shadow-[0_1px_2px_rgba(2,6,23,0.06),0_10px_28px_-8px_rgba(2,6,23,0.18),0_30px_70px_-12px_rgba(2,6,23,0.26)] ring-1 ring-slate-900/10",
        )}
      >
        {/* Header */}
        <div className="relative overflow-hidden bg-[#0B1224] px-4 pb-4 pt-4 text-white">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-blue-600/40 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 left-6 h-32 w-32 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 backdrop-blur">
              <SupportIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold tracking-tight">{t.title}</p>
              <p className="flex items-center gap-1.5 truncate text-[12px] text-slate-300">
                <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", status === "closed" ? "bg-slate-500" : "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]")} />
                <span className="truncate">{statusText}</span>
              </p>
            </div>
            <button type="button" onClick={close} aria-label={t.close}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* The conversation */}
        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
          {empty && (
            <>
              <Line m={{ id: 0, fromRole: "ai", authorName: null, body: t.welcome }} t={t} />
              <div className="day-rise space-y-2 pl-9" style={{ animationDelay: "120ms" }}>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{t.suggestionsLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {t.suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => void submit(s)}
                      className="rounded-full bg-white px-3 py-1.5 text-left text-[13px] font-medium text-blue-700 shadow-sm ring-1 ring-blue-200 transition-[background-color,transform] hover:bg-blue-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {messages.map((m) => <Line key={m.id} m={m} t={t} />)}
          {pending && <Line m={{ id: -1, fromRole: "visitor", authorName: null, body: pending }} t={t} />}
          {pending && status !== "agent" && <Typing label={t.typing} />}
          {showContact && (
            <form onSubmit={saveContact} className="day-rise rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/80">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900"><Mail aria-hidden className="h-4 w-4 text-blue-600" />{t.contact.title}</p>
              <p className="mt-1 text-[12px] leading-snug text-slate-500">{t.contact.text}</p>
              <div className="mt-2.5 grid gap-2">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={t.contact.name} aria-label={t.contact.name} maxLength={80} autoComplete="name"
                  className="h-10 rounded-xl bg-slate-50 px-3 text-[14px] text-slate-900 outline-none ring-1 ring-slate-200 transition-shadow placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500" />
                <input value={contactEmail} onChange={(e) => { setContactEmail(e.target.value); setContactBad(false); }} placeholder={t.contact.email} aria-label={t.contact.email} type="email" inputMode="email" maxLength={255} autoComplete="email" required
                  aria-invalid={contactBad || undefined}
                  className={cn("h-10 rounded-xl bg-slate-50 px-3 text-[14px] text-slate-900 outline-none ring-1 transition-shadow placeholder:text-slate-400 focus:bg-white focus:ring-2", contactBad ? "ring-rose-300 focus:ring-rose-500" : "ring-slate-200 focus:ring-blue-500")} />
                {contactBad && <p className="text-[12px] text-rose-600">{t.contact.bad}</p>}
              </div>
              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setSkipContact(true)} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800">{t.contact.later}</button>
                <button type="submit" disabled={setContact.isPending}
                  className="rounded-full bg-blue-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(37,99,235,0.9)] transition-[background-color,transform] hover:bg-blue-700 active:scale-[0.97] disabled:opacity-60">
                  {t.contact.save}
                </button>
              </div>
            </form>
          )}
          {savedEmail && (
            <p className="day-rise flex items-center justify-center gap-1.5 text-center text-[12px] text-emerald-700"><Check aria-hidden className="h-3.5 w-3.5" />{t.contact.saved(savedEmail)}</p>
          )}
        </div>

        {/* Writing */}
        <div className="border-t border-slate-200/80 bg-white px-3 pb-3 pt-2.5">
          {status === "ai" && (
            <button type="button" onClick={() => void human()} disabled={askHuman.isPending}
              className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-200">
              <UserRound aria-hidden className="h-3.5 w-3.5" />{t.human}
            </button>
          )}
          {failed && <p role="alert" className="mb-1.5 px-1 text-[12px] text-rose-600">{t.error}</p>}
          <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-2xl bg-slate-50 p-1.5 pl-3.5 ring-1 ring-slate-200 transition-shadow focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={1000}
              placeholder={t.placeholder}
              aria-label={t.placeholder}
              className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug text-slate-900 outline-none [field-sizing:content] placeholder:text-slate-400"
            />
            <button type="submit" aria-label={t.send} disabled={!draft.trim() || !!pending}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_8px_18px_-8px_rgba(37,99,235,0.9)] transition-[transform,opacity] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100">
              <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </button>
          </form>
          <p className="mt-1.5 px-1 text-[11px] leading-snug text-slate-400">{t.privacy}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {thread}
      {/* The bubble (hidden behind the full-screen chat on phones). */}
      {!(shown && phone) && (
        <div {...(entering ? { "data-fx": "pop", style: fx(enterAt ?? 0) } : {})} className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-[70] flex items-center gap-3 sm:right-5">
          {teaser && !shown && (
            <div className="sup-teaser-in relative hidden max-w-[240px] rounded-2xl bg-white py-2.5 pl-3.5 pr-8 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5 sm:block">
              <button type="button" onClick={() => { hideTeaser(); reopen(); }} className="text-left">
                <span className="block text-[13px] font-semibold text-slate-900">{t.teaser.title}</span>
                <span className="block text-[12px] text-slate-500">{t.teaser.text}</span>
              </button>
              <button type="button" onClick={hideTeaser} aria-label={t.teaser.dismiss} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => { hideTeaser(); if (shown) close(); else reopen(); }}
            aria-label={shown ? t.close : t.open}
            aria-expanded={shown}
            className="group relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white shadow-[0_18px_40px_-12px_rgba(37,99,235,0.75)] ring-1 ring-white/20 transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            {!shown && <span aria-hidden className="sup-ring pointer-events-none absolute inset-0 rounded-full ring-2 ring-blue-400/70" />}
            <span className={cn("transition-transform duration-300", shown ? "rotate-90 scale-90" : "")}>
              {shown ? <X className="h-6 w-6" /> : <SupportIcon className="h-7 w-7" />}
            </span>
            {!shown && (unread > 0
              ? <span className="day-pop absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">{unread}</span>
              : <span aria-hidden className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-white" />)}
          </button>
        </div>
      )}
    </>
  );
}
