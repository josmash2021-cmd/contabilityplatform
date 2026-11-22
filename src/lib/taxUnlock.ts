// The key that keeps Impuestos open in this tab after "confirma que eres tú" (api/lib/taxGate.ts).
// Kept for the tab only (sessionStorage): closing the tab, or another tab, asks for a new code.
// If the browser blocks storage, it lives in memory until the page reloads.
const KEY = "tax_unlock";
let memory: string | null = null;

export function getTaxUnlock(): string | null {
  try { return sessionStorage.getItem(KEY) ?? memory; } catch { return memory; }
}

export function setTaxUnlock(token: string): void {
  memory = token;
  try { sessionStorage.setItem(KEY, token); } catch { /* memory only */ }
}

export function clearTaxUnlock(): void {
  memory = null;
  try { sessionStorage.removeItem(KEY); } catch { /* nothing stored */ }
}
