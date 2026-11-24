import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Camera, ChevronLeft, Download, FileText, Images, Minus, Plus, SendHorizontal } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { taxLiveCopy } from "@/i18n/copy/taxLive";
import { useExit } from "@/hooks/useTaxLive";
import { base64ToBlobUrl, formatFileSize, showsAsPicture } from "@/lib/taxFiles";

export type ChatFile = { id: number; messageId: number; fileName: string; mimeType: string; size: number };
export type ChatMsg = { id: number; fromRole: "client" | "preparer"; body: string; readAt: Date | string | null; createdAt: Date | string; files: readonly ChatFile[] };
/** A message on its way: shown at once, swapped for the real one when the server has it. */
export type PendingMsg = { key: string; body: string; sentAt: number; file: { name: string; size: number; url: string | null } | null; failed: boolean };

type Tone = "app" | "admin";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** Same calendar day in the viewer's time. */
function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

/** A photo from the chat, shown as a picture (its bytes come decrypted from the server). */
function ChatPicture({ file, side, onOpen, onSave, saveLabel, openLabel }: {
  file: ChatFile; side: "client" | "preparer"; onOpen: () => void; onSave: () => void; saveLabel: string; openLabel: string;
}) {
  const opts = (on: boolean) => ({ enabled: on, staleTime: Infinity, gcTime: 10 * 60_000 });
  const own = trpc.tax.chatFile.useQuery({ id: file.id }, opts(side === "client"));
  const prep = trpc.tax.adminChatFile.useQuery({ id: file.id }, opts(side === "preparer"));
  const data = side === "client" ? own.data : prep.data;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const u = base64ToBlobUrl(data.dataBase64, data.mimeType);
    const t = setTimeout(() => setUrl(u), 0);
    return () => { clearTimeout(t); URL.revokeObjectURL(u); };
  }, [data]);
  return (
    <figure className="relative m-0 aspect-[4/3] w-60 max-w-full overflow-hidden rounded-[18px] bg-slate-200">
      <button type="button" onClick={onOpen} aria-label={`${openLabel}: ${file.fileName}`} className={cn("block h-full w-full cursor-zoom-in", FOCUS)}>
        {url ? <img src={url} alt={file.fileName} className="h-full w-full object-cover transition-[filter] duration-300 hover:brightness-95" /> : <span className="block h-full w-full animate-pulse bg-slate-200" />}
      </button>
      <SaveButton onClick={onSave} label={saveLabel} className="absolute bottom-2 right-2" />
    </figure>
  );
}

function SaveButton({ onClick, label, className }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/90 text-slate-900 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.35)] backdrop-blur transition-transform duration-200 hover:scale-105 hover:bg-white", FOCUS, className)}>
      <Download className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function FileCard({ name, size, mine, tone, onOpen, onSave, saveLabel, extra }: {
  name: string; size: number; mine: boolean; tone: Tone; onOpen?: () => void; onSave?: () => void; saveLabel: string; extra?: ReactNode;
}) {
  const ext = (name.split(".").pop() || "").toUpperCase().slice(0, 4) || "PDF";
  return (
    <div className={cn("relative flex w-64 max-w-full items-center gap-3 overflow-hidden rounded-[18px] p-2.5", mine ? (tone === "admin" ? "bg-neutral-100" : "bg-blue-50") : tone === "admin" ? "bg-neutral-100" : "bg-slate-100")}>
      <button type="button" onClick={onOpen} disabled={!onOpen} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left disabled:cursor-default", FOCUS)}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-100 text-[10px] font-extrabold text-red-600">{ext === "JPEG" ? "JPG" : ext}</span>
        <span className="min-w-0">
          <b className="block truncate text-[13px] font-semibold text-slate-900">{name}</b>
          <small className="block text-[11.5px] text-slate-500">{ext === "PDF" ? "PDF · " : ""}{formatFileSize(size)}</small>
        </span>
      </button>
      {onSave && <SaveButton onClick={onSave} label={saveLabel} className="bg-white shadow-sm" />}
      {extra}
    </div>
  );
}

/**
 * The chat with the preparer (or, for the preparer, with the client): minimal and live. Each message opens its own
 * space and rises in out of a soft blur; "escribiendo…" comes and goes the same; "En línea" shows only while the other
 * side has the chat open. Photos and documents go with the +: camera, gallery or a PDF, each with "Guardar".
 * The scrollbar stays hidden and the messages fade out at the top instead of being cut by a line.
 */
export function TaxChat({
  me, tone, title, initials, online, typing, messages, pending, onSend, onFiles, onTyping, onRetry, onOpenFile, onSaveFile,
  onBack, onMinimize, placeholder, emptyText, stagger = false, focusKey, onBusyChange, className,
}: {
  me: "client" | "preparer"; tone: Tone; title: string; initials: string; online: boolean; typing: boolean;
  messages: readonly ChatMsg[]; pending: readonly PendingMsg[];
  onSend: (text: string) => void; onFiles: (files: File[]) => void; onTyping: () => void; onRetry: (key: string) => void;
  onOpenFile: (f: ChatFile) => void; onSaveFile: (f: ChatFile) => void;
  onBack?: () => void; onMinimize?: () => void; placeholder: string; emptyText: string;
  /** The messages come in one after another (when the chat opens). */
  stagger?: boolean;
  /** Changing it puts the cursor in the box. */
  focusKey?: number;
  /** Writing or with text in the box (the chat doesn't fold away then). */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}) {
  const t = useCopy(taxLiveCopy).chat;
  const locale = intlLocale(useLang().lang);
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [focused, setFocused] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLButtonElement>(null);
  const cameraIn = useRef<HTMLInputElement>(null);
  const galleryIn = useRef<HTMLInputElement>(null);
  const docIn = useRef<HTMLInputElement>(null);
  // What was already there when the chat appeared: only those come in one after another (and only when it opens).
  const [initial] = useState(() => new Set(messages.map((m) => m.id)));
  const typingRow = useExit(typing, 450);

  const busy = focused || text.trim().length > 0;
  const busyRef = useRef(onBusyChange);
  useEffect(() => { busyRef.current = onBusyChange; });
  useEffect(() => { busyRef.current?.(busy); }, [busy]);

  useEffect(() => {
    if (!focusKey) return;
    const id = setTimeout(() => area.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(id);
  }, [focusKey]);

  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!menuRef.current?.contains(n) && !clipRef.current?.contains(n)) setMenu(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const grow = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText("");
    requestAnimationFrame(grow);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  const pick = (k: "camera" | "gallery" | "doc") => {
    setMenu(false);
    const el = (k === "camera" ? cameraIn : k === "gallery" ? galleryIn : docIn).current;
    if (el) { el.value = ""; el.click(); }
  };
  const picked = (list: FileList | null) => { const files = Array.from(list ?? []).slice(0, 6); if (files.length) onFiles(files); };

  // A message already on the server isn't shown twice while its "sending" copy is still around.
  const shownPending = pending.filter((p) => !messages.some((m) => m.fromRole === me && new Date(m.createdAt).getTime() >= p.sentAt - 120_000
    && (p.file ? m.files.some((f) => f.fileName === p.file?.name) : m.body === p.body)));
  const lastMine = [...messages].reverse().find((m) => m.fromRole === me);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const dayLabel = (d: Date) => dayKey(d) === dayKey(today) ? t.today : dayKey(d) === dayKey(yesterday) ? t.yesterday
    : d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const bubble = (mine: boolean) => cn("whitespace-pre-wrap rounded-[20px] px-3.5 py-2 text-[13.5px] leading-[1.45] [overflow-wrap:anywhere]",
    mine ? cn("rounded-br-md text-white", tone === "admin" ? "bg-neutral-900" : "bg-blue-600") : cn("rounded-bl-md", tone === "admin" ? "bg-neutral-100 text-neutral-900" : "bg-slate-100 text-slate-900"));
  const seenClass = tone === "admin" ? "font-semibold text-emerald-700" : "font-semibold text-blue-600";

  const rows: ReactNode[] = [];
  let lastDay = "";
  const staggerFrom = Math.max(0, messages.length - 6);
  messages.forEach((m, i) => {
    const at = new Date(m.createdAt);
    if (dayKey(at) !== lastDay) {
      lastDay = dayKey(at);
      rows.push(<p key={`d-${lastDay}`} className="mt-3 justify-self-center text-[11.5px] font-semibold text-slate-400 first:mt-0">{dayLabel(at)}</p>);
    }
    const mine = m.fromRole === me;
    const isNew = !initial.has(m.id) && !mine;
    const enter = isNew || (stagger && initial.has(m.id) && i >= staggerFrom);
    const delay = !isNew && enter ? `${250 + (i - staggerFrom) * 130}ms` : undefined;
    rows.push(
      <div key={m.id} className={cn("tx-row", enter && "tx-enter")} style={delay ? { animationDelay: delay } : undefined}>
        <div className={cn("grid max-w-[82%] gap-[3px]", mine ? "justify-self-end justify-items-end" : "justify-self-start justify-items-start")}>
          {m.files.map((f) => showsAsPicture(f.mimeType)
            ? <ChatPicture key={f.id} file={f} side={me} onOpen={() => onOpenFile(f)} onSave={() => onSaveFile(f)} saveLabel={t.saveAria(f.fileName)} openLabel={t.openPhoto} />
            : <FileCard key={f.id} name={f.fileName} size={f.size} mine={mine} tone={tone} onOpen={() => onOpenFile(f)} onSave={() => onSaveFile(f)} saveLabel={t.saveAria(f.fileName)} />)}
          {m.body && <p className={bubble(mine)}>{m.body}</p>}
          <time dateTime={at.toISOString()} className="px-2 text-[10.5px] text-slate-400">
            {time(at)}{mine && m.id === lastMine?.id && !shownPending.length ? <> · <span className={m.readAt ? seenClass : undefined}>{m.readAt ? t.seen : t.sent}</span></> : null}
          </time>
        </div>
      </div>,
    );
  });
  for (const p of shownPending) {
    rows.push(
      <div key={p.key} className="tx-row tx-enter">
        <div className="grid max-w-[82%] gap-[3px] justify-self-end justify-items-end">
          {p.file && (p.file.url
            ? <figure className="relative m-0 aspect-[4/3] w-60 max-w-full overflow-hidden rounded-[18px] bg-slate-200"><img src={p.file.url} alt={p.file.name} className="h-full w-full object-cover" />{!p.failed && <span className="absolute inset-x-0 bottom-0 h-1 bg-black/10"><span className="tx-bar block h-full bg-blue-600" /></span>}</figure>
            : <FileCard name={p.file.name} size={p.file.size} mine tone={tone} saveLabel="" extra={!p.failed ? <span className="absolute inset-x-0 bottom-0 h-1 bg-black/5"><span className="tx-bar block h-full bg-blue-600" /></span> : null} />)}
          {p.body && <p className={bubble(true)}>{p.body}</p>}
          <span className="px-2 text-[10.5px] text-slate-400">
            {p.failed ? <><span className="font-semibold text-red-600">{t.failed}</span> · <button type="button" onClick={() => onRetry(p.key)} className={cn("font-semibold text-blue-600 underline-offset-2 hover:underline", FOCUS)}>{t.retry}</button></> : p.file ? t.uploading : t.sending}
          </span>
        </div>
      </div>,
    );
  }
  if (typingRow.mounted) {
    rows.push(
      <div key="typing" className={cn("tx-row", typingRow.leaving ? "tx-leave" : "tx-enter")} aria-live="polite">
        <div className="flex items-center gap-2 justify-self-start text-xs text-slate-500">
          <span className={cn("tx-dots flex gap-1 rounded-[20px] rounded-bl-md px-3.5 py-3", tone === "admin" ? "bg-neutral-100" : "bg-slate-100")}><span /><span /><span /></span>{t.typing}
        </div>
      </div>,
    );
  }

  const accent = tone === "admin" ? "bg-neutral-900" : "bg-blue-600";
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden bg-white", className)} aria-label={title}>
      <header className="flex items-center gap-3 px-4 pb-1.5 pt-4" data-on={online}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label={t.close} className={cn("-ml-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-blue-600 transition-colors hover:bg-blue-50", FOCUS)}>
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
        <span className={cn("relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white", accent)} aria-hidden="true">
          {initials}
          <span className="tx-ondot absolute -bottom-px -right-px h-3 w-3 rounded-full border-2 border-white bg-green-500" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{title}</b>
          <div className="tx-presence" data-on={online}><div><span className="text-xs font-semibold text-emerald-700">{t.online}</span></div></div>
        </div>
        {onMinimize && (
          <button type="button" onClick={onMinimize} aria-label={t.minimize} title={t.minimize} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900", FOCUS)}>
            <Minus className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="tx-scroll flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 pb-2 pt-5" role="log" aria-label={t.log} aria-live="polite" tabIndex={0}>
        <div className="grid content-end gap-1.5">
          {rows.length ? rows : <p className="mx-auto max-w-[240px] py-10 text-center text-[13px] leading-relaxed text-slate-400">{emptyText}</p>}
        </div>
      </div>

      <form onSubmit={submit} className="relative px-3.5 pb-3.5 pt-2">
        {menu && (
          <div ref={menuRef} role="menu" className="tx-menu absolute bottom-[62px] left-3.5 z-10 grid min-w-[232px] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_44px_-16px_rgba(15,23,42,0.38)]">
            {([["camera", Camera, t.camera, t.cameraSub, "text-blue-600"], ["gallery", Images, t.gallery, t.gallerySub, "text-emerald-600"], ["doc", FileText, t.doc, t.docSub, "text-red-600"]] as const).map(([k, Icon, label, sub, color]) => (
              <button key={k} type="button" role="menuitem" onClick={() => pick(k)} className={cn("group flex items-center gap-3 rounded-[11px] px-2.5 py-2 text-left transition-colors hover:bg-slate-50", FOCUS)}>
                <Icon className={cn("h-[23px] w-[23px] shrink-0 transition-transform duration-300 group-hover:scale-110", color)} strokeWidth={1.6} aria-hidden="true" />
                <span><b className="block text-[13.5px] font-semibold text-slate-900">{label}</b><small className="block text-[11.5px] text-slate-500">{sub}</small></span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1 rounded-3xl bg-slate-100 p-1.5 transition-[background-color,box-shadow] duration-300 focus-within:bg-white focus-within:shadow-[0_0_0_1px_#d6dde6,0_10px_26px_-14px_rgba(15,23,42,0.3)]">
          <button ref={clipRef} type="button" onClick={() => setMenu((v) => !v)} aria-label={t.attach} aria-expanded={menu} aria-haspopup="menu"
            className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-600 transition-[transform,background-color,color] duration-500 [transition-timing-function:cubic-bezier(0.33,0,0.15,1)] hover:bg-slate-200", menu && "rotate-45 bg-blue-50 text-blue-600", FOCUS)}>
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
          <textarea ref={area} rows={1} value={text} maxLength={2000} placeholder={placeholder} aria-label={placeholder}
            onChange={(e) => { setText(e.target.value); grow(); if (e.target.value.trim()) onTyping(); }}
            onKeyDown={onKey} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            className="max-h-[120px] min-w-0 flex-1 resize-none border-0 bg-transparent px-1.5 py-2 text-[14px] leading-[1.4] text-slate-900 outline-none placeholder:text-slate-400 focus:outline-none focus-visible:outline-none" />
          <button type="submit" disabled={!text.trim()} aria-label={t.send}
            className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-white transition-[background-color,transform] duration-300 active:scale-90 disabled:cursor-default", text.trim() ? accent : "bg-slate-300", FOCUS)}>
            <SendHorizontal className="h-[17px] w-[17px]" aria-hidden="true" />
          </button>
        </div>
        <input ref={cameraIn} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => picked(e.target.files)} />
        <input ref={galleryIn} type="file" accept="image/*" multiple className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => picked(e.target.files)} />
        <input ref={docIn} type="file" accept="application/pdf,image/*" multiple className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => picked(e.target.files)} />
      </form>
    </section>
  );
}
