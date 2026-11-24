// Impuestos, live: when the preparer moves a step, uploads a document or writes, the client's page changes at once
// (and the other way around), with "escribiendo…" and "En línea". The server keeps, in memory, who is listening:
//   r:<returnId>  the preparer's page of one return
//   u:<userId>    a client's Impuestos page (their returns, even before one exists)
//   admin         the preparers' list
// The stream only says THAT something changed (and typing / online); the data itself is still fetched through
// tax.current / tax.adminGet, which keep their checks (the client's email code included). One server process (Railway
// runs one); if there were more, the pages still catch up on their own every couple of minutes.
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

export type ChatRole = "client" | "preparer";
export type LiveEvent =
  | { type: "changed" }
  | { type: "typing"; role: ChatRole }
  | { type: "presence"; role: ChatRole; online: boolean };

type Listener = (e: LiveEvent) => void;
const channels = new Map<string, Set<Listener>>();

export function subscribe(keys: readonly string[], fn: Listener): () => void {
  for (const k of keys) {
    let set = channels.get(k);
    if (!set) channels.set(k, (set = new Set()));
    set.add(fn);
  }
  return () => {
    for (const k of keys) {
      const set = channels.get(k);
      if (!set) continue;
      set.delete(fn);
      if (!set.size) channels.delete(k);
    }
  };
}

function publish(keys: readonly string[], e: LiveEvent) {
  const seen = new Set<Listener>();
  for (const k of keys) {
    for (const fn of channels.get(k) ?? []) {
      if (seen.has(fn)) continue;
      seen.add(fn);
      try { fn(e); } catch { /* a closed stream */ }
    }
  }
}

const keysOf = (returnId: number, userId: number | null | undefined) =>
  userId ? [`r:${returnId}`, `u:${userId}`, "admin"] : [`r:${returnId}`, "admin"];

/** Something about a return changed (step, documents, messages, read marks): both sides fetch it again. */
export function taxChanged(returnId: number, userId?: number | null) {
  publish(keysOf(returnId, userId), { type: "changed" });
}

/** A client's page changed without a return involved (e.g. the return was just created). */
export function taxUserChanged(userId: number) {
  publish([`u:${userId}`], { type: "changed" });
}

// ── "escribiendo…" ──
const lastTyping = new Map<string, number>();
/** Someone is typing in the chat of a return (at most one signal per second and side). */
export function taxTyping(returnId: number, userId: number, role: ChatRole, now = Date.now()) {
  const k = `${returnId}:${role}`;
  if (now - (lastTyping.get(k) ?? 0) < 1000) return;
  lastTyping.set(k, now);
  if (lastTyping.size > 5000) lastTyping.clear();
  publish([`r:${returnId}`, `u:${userId}`], { type: "typing", role });
}

// ── "En línea": while that side has the chat open (every open tab sends a heartbeat) ──
export const PRESENCE_TTL_MS = 50_000;
const presence = new Map<string, { returnId: number; userId: number; role: ChatRole; until: number }>();
const pkey = (returnId: number, role: ChatRole, tab: string) => `${returnId}:${role}:${tab}`;

export function isOnline(returnId: number, role: ChatRole, now = Date.now()): boolean {
  for (const p of presence.values()) if (p.returnId === returnId && p.role === role && p.until > now) return true;
  return false;
}

/** A tab opened (or still has) the chat, or closed it. Tells the other side when "En línea" changes. */
export function setPresence(returnId: number, userId: number, role: ChatRole, tab: string, open: boolean, now = Date.now()) {
  const before = isOnline(returnId, role, now);
  const k = pkey(returnId, role, tab.slice(0, 40));
  if (open) presence.set(k, { returnId, userId, role, until: now + PRESENCE_TTL_MS });
  else presence.delete(k);
  const after = isOnline(returnId, role, now);
  if (before !== after) publish([`r:${returnId}`, `u:${userId}`], { type: "presence", role, online: after });
}

/** Tabs that stopped sending heartbeats (closed, asleep, lost signal) go offline. */
export function sweepPresence(now = Date.now()) {
  const gone: { returnId: number; userId: number; role: ChatRole }[] = [];
  for (const [k, p] of presence) {
    if (p.until > now) continue;
    presence.delete(k);
    gone.push(p);
  }
  for (const p of gone) {
    if (!isOnline(p.returnId, p.role, now)) publish([`r:${p.returnId}`, `u:${p.userId}`], { type: "presence", role: p.role, online: false });
  }
}
const sweeper = setInterval(() => sweepPresence(), 15_000);
sweeper.unref?.();

/** Only for tests. */
export function resetLive() {
  channels.clear();
  presence.clear();
  lastTyping.clear();
}

// ── The stream: GET /api/tax/live ──
export type LiveWho =
  | { kind: "client"; userId: number; returnId: number | null }
  | { kind: "preparer"; returnId: number | null };

/**
 * Server-sent events for one page: "hello" (with whether the other side has the chat open), then "changed",
 * "typing" and "presence" as they happen, and a "ping" every 25 s so proxies keep the line open.
 */
export function liveStream(c: Context, who: LiveWho) {
  const keys = who.kind === "client" ? [`u:${who.userId}`] : who.returnId ? [`r:${who.returnId}`] : ["admin"];
  const other: ChatRole = who.kind === "client" ? "preparer" : "client";
  c.header("X-Accel-Buffering", "no");
  c.header("Cache-Control", "no-cache, no-transform");
  return streamSSE(c, async (stream) => {
    const queue: LiveEvent[] = [];
    let wake: (() => void) | null = null;
    let closed = false;
    const unsubscribe = subscribe(keys, (e) => {
      // Each side only hears the other one typing / coming online.
      if (e.type !== "changed" && e.role !== other) return;
      queue.push(e);
      wake?.();
    });
    stream.onAbort(() => { closed = true; unsubscribe(); wake?.(); });
    try {
      await stream.writeSSE({ event: "hello", data: JSON.stringify({ online: who.returnId ? isOnline(who.returnId, other) : false }) });
      while (!closed) {
        if (!queue.length) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 25_000);
            wake = () => { clearTimeout(t); resolve(); };
          });
          wake = null;
        }
        if (closed) break;
        const e = queue.shift();
        if (!e) { await stream.writeSSE({ event: "ping", data: "{}" }); continue; }
        await stream.writeSSE({ event: e.type, data: JSON.stringify(e) });
      }
    } finally {
      unsubscribe();
    }
  });
}
