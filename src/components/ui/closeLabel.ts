import { useContext } from "react";
import { I18nContext } from "@/i18n/context";

/** Screen-reader label for the X button of sheets and dialogs, in the app's language (Spanish by default). */
export function useCloseLabel(): string {
  const ctx = useContext(I18nContext);
  return ctx?.lang === "en" ? "Close" : "Cerrar";
}
