// "Ver como": the owner previews the app as an employee or the accountant would see it.
// A client-side view mode only: it hides what that role can't open, like a real member's menu.
// It never signs in as anyone; everything the owner does meanwhile is still done as the owner.
//
// Wiring (AppLayout, by the lead):
//   const role = useEffectiveRole(memberRole);   // use `role` where AppLayout uses memberRole for the menu, tabs, "+ Nuevo" and the route guard
//   <ViewAsBanner />                             // from ./ViewAsBanner, inside <main>, above <TeamBanner />
// A real team member always wins over a preview (useEffectiveRole does that).
import { useSyncExternalStore } from "react";
import type { TeamRole } from "./roles";

export type ViewAs = { role: TeamRole; name: string | null };

const KEY = "pbs_view_as";
const listeners = new Set<() => void>();

function read(): ViewAs | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { role?: unknown; name?: unknown };
    if (v.role !== "staff" && v.role !== "accountant") return null;
    return { role: v.role, name: typeof v.name === "string" ? v.name.slice(0, 120) : null };
  } catch {
    return null;
  }
}

let current: ViewAs | null = typeof window === "undefined" ? null : read();
function emit() { listeners.forEach((l) => l()); }

/** Starts the preview (this browser tab only; it ends when the tab closes). */
export function startViewAs(v: ViewAs): void {
  current = { role: v.role, name: v.name };
  try { sessionStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable: lasts until reload */ }
  emit();
}

export function stopViewAs(): void {
  current = null;
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** The current preview, or null. Works without a provider (a small shared store). */
export function useViewAs(): ViewAs | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** The role the menu should follow: a real membership first, else the owner's preview. */
export function useEffectiveRole(memberRole: TeamRole | null | undefined): TeamRole | null {
  const v = useViewAs();
  return memberRole ?? v?.role ?? null;
}

// The Team page offers "Recorrer la app así" only once the shell shows the banner (otherwise
// nothing would hide and there'd be no way back): the banner registers itself while mounted.
let bannersMounted = 0;
const wiredListeners = new Set<() => void>();
function subscribeWired(l: () => void) {
  wiredListeners.add(l);
  return () => { wiredListeners.delete(l); };
}

/** Called by <ViewAsBanner /> on mount; returns its cleanup. */
export function registerViewAsBanner(): () => void {
  bannersMounted++;
  wiredListeners.forEach((l) => l());
  return () => {
    bannersMounted--;
    wiredListeners.forEach((l) => l());
  };
}

/** True when the app shell shows <ViewAsBanner /> (so a full-app preview can be started). */
export function useViewAsWired(): boolean {
  return useSyncExternalStore(subscribeWired, () => bannersMounted > 0, () => false);
}
