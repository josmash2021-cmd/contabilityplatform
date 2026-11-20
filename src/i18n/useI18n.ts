import { useContext } from "react";
import { I18nContext } from "./context";
import type { Lang } from "./lang";

export function useLang() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLang must be used inside <I18nProvider>");
  return ctx;
}

/** Picks the copy for the current language from a { es, en } dictionary. */
export function useCopy<T>(dict: Record<Lang, T>): T {
  return dict[useLang().lang];
}
