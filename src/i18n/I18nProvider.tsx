import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext } from "./context";
import { getLang, setCurrentLang, storeLang, type Lang } from "./lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setCurrentLang(next);
    storeLang(next);
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
