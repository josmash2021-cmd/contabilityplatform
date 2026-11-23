import type { CSSProperties } from "react";

/**
 * Entrance timing for an element with `data-fx` (see index.css): `d` = when it starts on first load (ms);
 * `i` = its order when it comes back after a change (e.g. Negocio / Personal), 70 ms apart.
 */
export const fx = (d: number, i?: number): CSSProperties =>
  ({ "--d": `${d}ms`, ...(i === undefined ? {} : { "--i": i }) }) as CSSProperties;
