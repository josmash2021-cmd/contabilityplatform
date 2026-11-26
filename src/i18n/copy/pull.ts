import type { Lang } from "@/i18n/lang";

// Pull down to refresh (src/components/layout/PullToRefresh.tsx): what screen readers hear.
const es = {
  pulling: "Suelta para actualizar",
  refreshing: "Actualizando…",
  done: "Listo, al día",
};
export type PullCopy = typeof es;
const en: PullCopy = {
  pulling: "Release to refresh",
  refreshing: "Refreshing…",
  done: "Done, up to date",
};
export const pullCopy: Record<Lang, PullCopy> = { es, en };
