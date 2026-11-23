import { useNavigate } from "react-router";

/**
 * Back to the previous page of the app. A page opened on its own (a new tab from "Leer el texto completo", a link
 * in an email, typed in) has no previous page, so `navigate(-1)` would do nothing: then it goes to `fallback`.
 * React Router keeps the position in `history.state.idx` (0 = the first page of this visit).
 */
export function useBack(fallback = "/") {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
