// Each page's code comes in its own piece (lazy), so the first tap on a menu item used to wait for a download.
// The layouts warm those pieces up once the app is idle: the app's pages for everyone, the admin's for the admin.
// The browser keeps them, and React.lazy then finds them ready. Skipped when the phone asks to save data.
export type PreloadGroup = "app" | "admin";

const loaders: Record<PreloadGroup, (() => Promise<unknown>)[]> = { app: [], admin: [] };
const started = new Set<PreloadGroup>();
let warming = 0;

/** True while a page is warming up in the background: if its piece can't be fetched then, that's no reason to
 * reload the app (main.tsx); when the person opens that page, its own loader reloads if the code is really gone. */
export function warmingUp() {
  return warming > 0;
}

export function registerPreload(group: PreloadGroup, load: () => Promise<unknown>) {
  loaders[group].push(load);
}

export function preloadWhenIdle(group: PreloadGroup) {
  if (typeof window === "undefined" || started.has(group)) return;
  started.add(group);
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData) return;
  const run = async () => {
    for (const load of loaders[group]) {
      warming++;
      try { await load(); } catch { /* a page that fails here loads (and reports) when it's opened */ } finally { warming--; }
      await new Promise((r) => window.setTimeout(r, 40)); // one at a time, never in the way
    }
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  window.setTimeout(() => (idle ? idle(() => void run(), { timeout: 4000 }) : void run()), 1200);
}
