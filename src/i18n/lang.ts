// Language selection: Spanish when the device is set to Spanish, English otherwise.
// A manual choice (language switcher) is remembered and wins over the device setting.

export type Lang = "es" | "en";

const STORAGE_KEY = "lang";

export function detectDeviceLang(): Lang {
  if (typeof navigator === "undefined") return "es";
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  const first = (prefs[0] || "").toLowerCase();
  return first.startsWith("es") ? "es" : "en";
}

export function getStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "es" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

export function storeLang(lang: Lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ }
}

// Current language for non-React code (e.g. the tRPC client sends it to the server).
let current: Lang = getStoredLang() ?? detectDeviceLang();
export const getLang = () => current;
export const setCurrentLang = (lang: Lang) => { current = lang; };

/** Locale for Intl number/date formatting. */
export const intlLocale = (lang: Lang) => (lang === "es" ? "es-US" : "en-US");
