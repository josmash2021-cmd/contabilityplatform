import { createContext } from "react";
import type { Lang } from "./lang";

export type I18nState = { lang: Lang; setLang: (lang: Lang) => void };

export const I18nContext = createContext<I18nState | null>(null);
