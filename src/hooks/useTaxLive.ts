// Impuestos, live (api/lib/taxLive.ts, GET /api/tax/live): the page hears at once when something about the return
// changes ("changed": fetch it again), when the other side is typing and when they open or close the chat. The stream
// carries no data; tax.current / tax.adminGet still bring it, with their checks. It reconnects by itself (and fetches
// again then, to catch up); coming back to the tab fetches again too.
import { useCallback, useEffect, useRef, useState } from "react";
import { getLang } from "@/i18n/lang";

export type LiveTarget = { kind: "client" } | { kind: "preparer"; returnId: number } | { kind: "list" };
type Handlers = { onChanged: () => void; onTyping?: () => void; onPresence?: (online: boolean) => void };

function urlOf(t: LiveTarget): string {
  if (t.kind === "client") return "/api/tax/live";
  if (t.kind === "list") return "/api/tax/live?list=1";
  return `/api/tax/live?returnId=${t.returnId}`;
}

export function useTaxLive(target: LiveTarget | null, handlers: Handlers) {
  const ref = useRef(handlers);
  useEffect(() => { ref.current = handlers; });
  const url = target ? urlOf(target) : null;

  useEffect(() => {
    if (!url) return;
    let stopped = false;
    let ctrl: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    let connectedBefore = false;
    const parse = (data: string): Record<string, unknown> => { try { return JSON.parse(data || "{}") as Record<string, unknown>; } catch { return {}; } };
    const dispatch = (event: string, data: string) => {
      const h = ref.current;
      if (event === "hello") {
        // A reconnect may have missed something: fetch again (the first time the page just did).
        if (connectedBefore) h.onChanged();
        connectedBefore = true;
        h.onPresence?.(parse(data).online === true);
      } else if (event === "changed") h.onChanged();
      else if (event === "typing") h.onTyping?.();
      else if (event === "presence") h.onPresence?.(parse(data).online === true);
    };
    const connect = async () => {
      ctrl = new AbortController();
      try {
        const headers: Record<string, string> = { Accept: "text/event-stream", "x-lang": getLang() };
        const token = localStorage.getItem("auth_token");
        if (token) headers["x-auth-token"] = token;
        const res = await fetch(url, { headers, signal: ctrl.signal, cache: "no-store", credentials: "same-origin" });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        tries = 0;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value.replace(/\r\n/g, "\n");
          let cut = buf.indexOf("\n\n");
          while (cut >= 0) {
            const chunk = buf.slice(0, cut);
            buf = buf.slice(cut + 2);
            let event = "message";
            let data = "";
            for (const line of chunk.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            dispatch(event, data);
            cut = buf.indexOf("\n\n");
          }
        }
      } catch { /* closed, offline or signed out: try again below */ }
      if (stopped) return;
      ref.current.onPresence?.(false);
      tries++;
      timer = setTimeout(() => { void connect(); }, Math.min(15_000, 1000 * 2 ** Math.min(tries, 4)));
    };
    void connect();
    const onVisible = () => { if (document.visibilityState === "visible") ref.current.onChanged(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      ctrl?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url]);
}

/**
 * "En línea" for the other side: while this tab has the chat open and visible, it says so every 20 s (the server
 * forgets a tab after 50 s without news); closing the chat, hiding the tab or leaving the page says it at once.
 */
export function useChatPresence(open: boolean, report: (open: boolean, tab: string) => void) {
  const [tab] = useState(() => Math.random().toString(36).slice(2, 12));
  const ref = useRef(report);
  useEffect(() => { ref.current = report; });
  useEffect(() => {
    let told = false;
    const tell = () => {
      const on = open && document.visibilityState === "visible";
      if (on || told) ref.current(on, tab);
      told = on;
    };
    tell();
    const beat = setInterval(() => { if (told) ref.current(true, tab); }, 20_000);
    document.addEventListener("visibilitychange", tell);
    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", tell);
      if (told) ref.current(false, tab);
    };
  }, [open, tab]);
}

/** "escribiendo…": shown for a few seconds after the other side's last keystroke signal, hidden when they send. */
export function useTypingFlag(ms = 4500) {
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const ping = useCallback(() => {
    setTyping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTyping(false), ms);
  }, [ms]);
  const stop = useCallback(() => { clearTimeout(timer.current); setTyping(false); }, []);
  return { typing, ping, stop };
}

/** Keeps something mounted while it animates out ("leaving"), then unmounts it; `enterAfter` waits before it comes back. */
export function useExit(show: boolean, ms: number, enterAfter = 0) {
  const [state, setState] = useState({ mounted: show, leaving: false });
  useEffect(() => {
    if (show) {
      const t = setTimeout(() => setState({ mounted: true, leaving: false }), enterAfter);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => setState((s) => (s.mounted ? { mounted: true, leaving: true } : s)), 0);
    const t2 = setTimeout(() => setState({ mounted: false, leaving: false }), ms);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [show, ms, enterAfter]);
  return state;
}
