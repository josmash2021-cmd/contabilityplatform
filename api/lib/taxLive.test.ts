import { afterEach, describe, expect, it } from "vitest";
import { PRESENCE_TTL_MS, isOnline, resetLive, setPresence, subscribe, sweepPresence, taxChanged, taxTyping, type LiveEvent } from "./taxLive";
import { stepBlock } from "@contracts/taxRules";

afterEach(() => resetLive());

describe("taxLive", () => {
  it("tells the return's page, the client's page and the preparers' list that something changed", () => {
    const heard: Record<string, LiveEvent[]> = { r: [], u: [], admin: [], other: [] };
    subscribe(["r:7"], (e) => heard.r.push(e));
    subscribe(["u:3"], (e) => heard.u.push(e));
    subscribe(["admin"], (e) => heard.admin.push(e));
    subscribe(["u:4"], (e) => heard.other.push(e));
    taxChanged(7, 3);
    expect(heard.r).toEqual([{ type: "changed" }]);
    expect(heard.u).toEqual([{ type: "changed" }]);
    expect(heard.admin).toEqual([{ type: "changed" }]);
    expect(heard.other).toEqual([]);
  });

  it("a page listening on two keys hears an event once", () => {
    const heard: LiveEvent[] = [];
    subscribe(["r:7", "u:3"], (e) => heard.push(e));
    taxChanged(7, 3);
    expect(heard).toHaveLength(1);
  });

  it("stops hearing after unsubscribing", () => {
    const heard: LiveEvent[] = [];
    const off = subscribe(["u:3"], (e) => heard.push(e));
    off();
    taxChanged(7, 3);
    expect(heard).toHaveLength(0);
  });

  it("typing: at most one signal per second and side", () => {
    const heard: LiveEvent[] = [];
    subscribe(["u:3"], (e) => heard.push(e));
    taxTyping(7, 3, "preparer", 1000);
    taxTyping(7, 3, "preparer", 1500);
    taxTyping(7, 3, "preparer", 2100);
    taxTyping(7, 3, "client", 2100);
    expect(heard).toEqual([{ type: "typing", role: "preparer" }, { type: "typing", role: "preparer" }, { type: "typing", role: "client" }]);
  });

  it("'En línea' while some tab has the chat open; tells only when it changes", () => {
    const heard: LiveEvent[] = [];
    subscribe(["u:3"], (e) => heard.push(e));
    setPresence(7, 3, "preparer", "tab-a", true, 0);
    setPresence(7, 3, "preparer", "tab-b", true, 0);
    expect(isOnline(7, "preparer", 10)).toBe(true);
    setPresence(7, 3, "preparer", "tab-a", false, 20);
    expect(isOnline(7, "preparer", 20)).toBe(true);
    setPresence(7, 3, "preparer", "tab-b", false, 30);
    expect(isOnline(7, "preparer", 30)).toBe(false);
    expect(heard).toEqual([{ type: "presence", role: "preparer", online: true }, { type: "presence", role: "preparer", online: false }]);
  });

  it("a tab that stops sending heartbeats goes offline", () => {
    const heard: LiveEvent[] = [];
    subscribe(["r:7"], (e) => heard.push(e));
    setPresence(7, 3, "client", "tab-a", true, 0);
    sweepPresence(PRESENCE_TTL_MS - 1);
    expect(isOnline(7, "client", PRESENCE_TTL_MS - 1)).toBe(true);
    sweepPresence(PRESENCE_TTL_MS + 1);
    expect(isOnline(7, "client", PRESENCE_TTL_MS + 1)).toBe(false);
    expect(heard.at(-1)).toEqual({ type: "presence", role: "client", online: false });
  });
});

describe("stepBlock: what moving forward needs", () => {
  const none = { fed: false, f8879: false, signed: false };
  const docs = { fed: true, f8879: true, signed: false };
  const all = { fed: true, f8879: true, signed: true };
  it("up to Preparando needs nothing", () => {
    expect(stepBlock(0, -1, none)).toBeNull();
    expect(stepBlock(2, 0, none)).toBeNull();
  });
  it("Revisa y firma (and later) needs the 1040 and the 8879", () => {
    expect(stepBlock(3, 2, none)).toBe("docs");
    expect(stepBlock(3, 2, { ...none, fed: true })).toBe("docs");
    expect(stepBlock(3, 2, { ...none, f8879: true })).toBe("docs");
    expect(stepBlock(3, 2, docs)).toBeNull();
    expect(stepBlock(5, 2, none)).toBe("docs");
  });
  it("Enviada (and later) needs the client's signature", () => {
    expect(stepBlock(4, 3, docs)).toBe("signature");
    expect(stepBlock(7, 3, docs)).toBe("signature");
    expect(stepBlock(4, 3, all)).toBeNull();
    expect(stepBlock(7, 6, all)).toBeNull();
  });
  it("going back (or staying) is always allowed", () => {
    expect(stepBlock(2, 7, none)).toBeNull();
    expect(stepBlock(-1, 5, none)).toBeNull();
    expect(stepBlock(5, 5, none)).toBeNull();
  });
});
