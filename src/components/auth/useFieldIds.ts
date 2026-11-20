import { useId } from "react";

/** Stable ids for label/input pairs. */
export function useFieldIds<T extends string>(...names: T[]): Record<T, string> {
  const base = useId();
  return Object.fromEntries(names.map((n) => [n, `${base}-${n}`])) as Record<T, string>;
}
