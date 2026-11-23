// Language selection: Spanish when the device (phone or computer) is set to Spanish, English otherwise.
// There's no switch on the site; only a choice made inside the app (Perfil > Idioma) is remembered and wins.
// It's kept under "lang_pref": what the old ES/EN switch saved under "lang" no longer counts.

export type Lang = "es" | "en";

const STORAGE_KEY = "lang_pref";

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
