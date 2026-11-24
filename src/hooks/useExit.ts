import { useEffect, useState } from "react";

/** Keeps something mounted while it animates out ("leaving"), then unmounts it; `enterAfter` waits before it comes back. */
export function useExit(show: boolean, ms: number, enterAfter = 0) {
  const [state, setState] = useState({ mounted: show, leaving: false });
  useEffect(() => {
    if (show) {
      const t = setTimeout(() => setState({ mounted: true, leaving: false }), enterAfter);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => setState((s) => (s.mounted ? { mounted: true, leaving: true } : s)), 0);
    const t2 = setTimeout(() => setState({ mounted: false, leaving: false }), ms);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [show, ms, enterAfter]);
  return state;
}
