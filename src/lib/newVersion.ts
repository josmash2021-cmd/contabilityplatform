// After a new version is published, a tab opened before it may ask for a piece of code that no longer exists
// (its file name changed). Then the page reloads once by itself and gets the new version, instead of staying
// blank. If it already reloaded a moment ago, it doesn't loop: the error screen offers "Recargar".
const KEY = "new-version-reload-at";

/** True for "the code for this page couldn't be downloaded". */
export function isStaleCodeError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS|ChunkLoadError|Loading chunk/i.test(msg);
}

/** Reloads the page to get the new version, unless it did so in the last 15 s. True when it reloads. */
export function reloadForNewVersion(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* no storage: reload anyway */ }
  if (Date.now() - last < 15_000) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* fine */ }
  window.location.reload();
  return true;
}
