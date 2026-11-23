// If something fails while a page loads, a clear screen instead of a blank page: "Recargar" and "Ir al inicio".
// When the cause is code from an older version (a tab opened before we published), it reloads by itself once
// (src/lib/newVersion.ts). `resetKey`: changing it (the address) gives the page another chance.
import { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { getLang } from "@/i18n/lang";
import { appErrorCopy } from "@/i18n/copy/appError";
import { isStaleCodeError, reloadForNewVersion } from "@/lib/newVersion";

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
  reloading: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    if (isStaleCodeError(error) && reloadForNewVersion()) this.setState({ reloading: true });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, reloading: false });
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    const t = appErrorCopy[getLang()];
    return (
      <div role="alert" className="grid min-h-[70vh] place-items-center bg-white px-5 py-16">
        <div className="grid w-full max-w-md justify-items-center gap-4 rounded-[24px] border border-slate-200 p-8 text-center shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] animate-in fade-in [animation-duration:500ms]">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <RefreshCw className={reloading ? "h-6 w-6 animate-spin" : "h-6 w-6"} aria-hidden="true" />
          </span>
          {reloading ? (
            <p className="text-[15px] font-semibold text-slate-900">{t.updating}</p>
          ) : (
            <>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{t.title}</h1>
              <p className="text-[15px] leading-relaxed text-slate-600">{t.text}</p>
              <div className="mt-2 grid w-full gap-2.5 sm:grid-cols-2">
                <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800">{t.reload}</button>
                <a href="/" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50">{t.home}</a>
              </div>
              <details className="w-full text-left text-xs text-slate-400">
                <summary className="cursor-pointer select-none">{t.details}</summary>
                <p className="mt-2 break-words">{error.message}</p>
              </details>
            </>
          )}
        </div>
      </div>
    );
  }
}
