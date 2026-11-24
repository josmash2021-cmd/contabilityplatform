// The client's chat with the preparer, live, on the Impuestos page: where it lives (phones: a bubble that opens a
// sheet; computers before sending: a bubble that opens a window; computers after sending: a column beside the
// return that folds into the bubble 30 minutes after the last message, or with "—"), what the bubble shows while it's
// closed (the number of new messages and a speech bubble with the newest), and what tells the preparer "En línea".
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useChatPresence, useTaxLive, useTypingFlag } from "@/hooks/useTaxLive";
import { showsAsPicture } from "@/lib/taxFiles";
import { useTaxChat } from "./useTaxChat";
import type { ChatMsg } from "./TaxChat";
import type { Peek } from "./TaxChatDock";
import type { Current } from "./taxView";

/** After this long without messages, the computer's chat column folds into the bubble. */
export const FOLD_AFTER_MS = 30 * 60_000;

type Words = { photo: string; errors: { tooBig: string; type: string; generic: string } };

export function useClientChat(data: Current, desktop: boolean, sent: boolean, words: Words) {
  const utils = trpc.useUtils();
  const current = utils.tax.current;
  const refetch = useCallback(() => current.invalidate(), [current]);
  const typing = useTypingFlag();
  const [online, setOnline] = useState(data.preparerOnline);
  useTaxLive({ kind: "client" }, { onChanged: () => void refetch(), onTyping: typing.ping, onPresence: setOnline });

  const messages = data.messages as ChatMsg[];
  const chat = useTaxChat({ side: "client" }, refetch, words.errors);
  const unread = messages.filter((m) => m.fromRole === "preparer" && !m.readAt).length;
  const lastAt = messages.length ? new Date(messages[messages.length - 1].createdAt).getTime() : 0;
  const lastIncoming = [...messages].reverse().find((m) => m.fromRole === "preparer")?.id ?? 0;

  const docked = desktop && sent;
  const [sheet, setSheet] = useState(false);
  const [win, setWin] = useState(false);
  // Open when there's something to read or they've been talking in the last 30 minutes; else the bubble.
  const [folded, setFolded] = useState(() => !(unread > 0 || (lastAt > 0 && Date.now() - lastAt < FOLD_AFTER_MS)));
  const visible = docked ? !folded : desktop ? win : sheet;
  const [focusKey, setFocusKey] = useState(0);
  const busy = useRef(false);
  const activity = useRef(0);
  const [peekId, setPeekId] = useState<number | null>(null);
  const [seenIncoming, setSeenIncoming] = useState(lastIncoming);
  const [viewing, setViewing] = useState<{ id: number; title: string } | null>(null);

  const open = useCallback(() => {
    activity.current = Date.now();
    setPeekId(null);
    if (docked) setFolded(false);
    else if (desktop) setWin(true);
    else setSheet(true);
    setFocusKey((k) => k + 1);
  }, [docked, desktop]);
  const close = useCallback(() => {
    if (docked) setFolded(true);
    else if (desktop) setWin(false);
    else setSheet(false);
  }, [docked, desktop]);
  const setBusy = useCallback((b: boolean) => { busy.current = b; if (b) activity.current = Date.now(); }, []);

  // 30 minutes after the last message, the column folds into the bubble (never while they're writing).
  useEffect(() => {
    if (!docked || folded) return;
    if (!activity.current) activity.current = Date.now();
    const id = setInterval(() => {
      if (!busy.current && Date.now() - Math.max(activity.current, lastAt) > FOLD_AFTER_MS) setFolded(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [docked, folded, lastAt]);

  // A new message from the preparer: "escribiendo" stops, and if the chat is closed it peeks out of the bubble.
  useEffect(() => {
    if (lastIncoming <= seenIncoming) return;
    const id = setTimeout(() => {
      setSeenIncoming(lastIncoming);
      typing.stop();
      activity.current = Date.now();
      if (!visible) setPeekId(lastIncoming);
    }, 0);
    return () => clearTimeout(id);
  }, [lastIncoming, seenIncoming, visible, typing]);
  useEffect(() => {
    if (peekId === null) return;
    const id = setTimeout(() => setPeekId(null), 8000);
    return () => clearTimeout(id);
  }, [peekId]);

  // Open and in front: the preparer's messages count as read (and they see "Visto").
  const { mutate: markRead } = trpc.tax.markRead.useMutation();
  useEffect(() => {
    if (!visible || unread === 0) return;
    const id = setTimeout(() => {
      if (document.visibilityState === "visible") markRead(undefined, { onSuccess: () => void refetch() });
    }, 700);
    return () => clearTimeout(id);
  }, [visible, unread, markRead, refetch]);

  // "En línea" for the preparer while this chat is open and in front.
  useChatPresence(visible, chat.presence);

  const peekMsg = peekId ? messages.find((m) => m.id === peekId) : undefined;
  const peekText = peekMsg ? peekMsg.body || (peekMsg.files[0] ? (showsAsPicture(peekMsg.files[0].mimeType) ? words.photo : peekMsg.files[0].fileName) : "") : "";
  const peek: Peek | null = visible ? null : typing.typing ? { kind: "typing" } : peekText ? { kind: "text", text: peekText } : null;
  const name = data.preparerName?.trim() || "";

  return {
    messages, online, typing: typing.typing, unread, peek, visible, docked, folded, desktop, sheet, win, open, close, focusKey, setBusy,
    chat, viewing, setViewing, name, initials: (name.charAt(0) || "P").toUpperCase(),
    // Typing in the box counts as being active (the column doesn't fold then).
    onTyping: () => { activity.current = Date.now(); chat.typing(); },
  };
}

export type ClientChat = ReturnType<typeof useClientChat>;
