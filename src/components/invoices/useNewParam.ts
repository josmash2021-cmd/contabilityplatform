import { useEffect, useEffectEvent } from "react";
import { useSearchParams } from "react-router";

/**
 * "?new=1" (from the app's "+ Nuevo" menu) opens the page's create form once it's `ready`, when
 * `allowed`, then drops the param (replacing the history entry) so Back doesn't reopen the form.
 */
export function useNewParam(open: () => void, ready: boolean, allowed: boolean) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get("new") === "1";
  const consume = useEffectEvent(() => {
    if (allowed) open();
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("new");
      return next;
    }, { replace: true });
  });
  useEffect(() => {
    if (wanted && ready) consume();
  }, [wanted, ready]);
}
