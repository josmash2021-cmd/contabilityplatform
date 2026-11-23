// The screen shown instead of a blank page when something fails while loading (src/components/ErrorBoundary.tsx).
import type { Lang } from "../lang";

const es = {
  title: "Esta página no cargó bien",
  text: "Puede ser que acabamos de publicar una versión nueva. Recarga la página y sigue donde estabas.",
  updating: "Cargando la versión nueva…",
  reload: "Recargar",
  home: "Ir al inicio",
  details: "Detalles para soporte",
};

export type AppErrorCopy = typeof es;

const en: AppErrorCopy = {
  title: "This page didn't load right",
  text: "We may have just published a new version. Reload the page and pick up where you were.",
  updating: "Loading the new version…",
  reload: "Reload",
  home: "Go to the home page",
  details: "Details for support",
};

export const appErrorCopy: Record<Lang, AppErrorCopy> = { es, en };
