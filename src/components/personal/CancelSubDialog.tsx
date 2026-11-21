import { useId, useState } from "react";
import { CalendarClock, CheckCircle2, ExternalLink, Loader2, Mail, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getCancelGuide } from "@/lib/cancelGuides";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { personalPagesCopy } from "@/i18n/copy/personalPages";
import { ui } from "./personalUtils";

type Tab = "guide" | "email" | "tips";

/** How to cancel a recurring charge (guide, ready email, tips), then "I cancelled it" (bank.cancelSubscription). */
export function CancelSubDialog({ name, monthly, when, busy, onConfirm, onClose }: {
  name: string;
  /** "$15.49" */
  monthly: string;
  /** "Próximo cobro: 9 de diciembre", or the last charge when the next isn't known. */
  when: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const all = useCopy(personalPagesCopy);
  const t = all.subs.modal;
  const { lang } = useLang();
  const uid = useId();
  const [tab, setTab] = useState<Tab>("guide");
  const guide = getCancelGuide(name, lang);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent showCloseButton={false} className="grid-cols-1 content-start gap-0 overflow-y-auto bg-white p-0 sm:max-h-[calc(100dvh-4rem)] sm:max-w-lg sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold capitalize tracking-tight text-slate-900">{t.title(name)}</DialogTitle>
            <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="tabular-nums">{t.sub(monthly)}</span>
              <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{when}</span>
            </DialogDescription>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={all.shared.close}
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 px-4 py-5 sm:px-6">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label={t.tabsLabel}>
            {(["guide", "email", "tips"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
                className={cn("h-10 rounded-lg px-1 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
                {t.tabs[k]}
              </button>
            ))}
          </div>

          {tab === "guide" && (
            <div className="space-y-3">
              {guide.link && (
                <a href={guide.link} target="_blank" rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />{t.goTo(guide.linkLabel)}
                </a>
              )}
              <p className="text-xs font-semibold text-slate-500">{t.steps(guide.estimatedTime)}</p>
              <ol className="space-y-2.5">
                {guide.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-700">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600" aria-hidden="true">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {tab === "email" && (
            <div className="space-y-3">
              <label htmlFor={`${uid}-mail`} className="block text-sm text-slate-600">{t.copyEmail}</label>
              <textarea id={`${uid}-mail`} readOnly value={t.emailBody(name)} aria-label={t.emailLabel}
                className="h-48 w-full resize-none rounded-[10px] border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
              <a href={`mailto:support@${name.toLowerCase().replace(/\s+/g, "")}.com?subject=${encodeURIComponent(t.emailSubject)}`}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <Mail className="h-4 w-4" aria-hidden="true" />{t.openMail}
              </a>
            </div>
          )}

          {tab === "tips" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">{t.before}</p>
                <ul className="mt-2 space-y-1.5 text-sm text-amber-800">
                  {t.beforeTips.map((tip, i) => <li key={i} className="flex gap-2"><span className="shrink-0">{i + 1}.</span><span>{tip}</span></li>)}
                </ul>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-900">{t.after}</p>
                <ul className="mt-2 space-y-1.5 text-sm text-emerald-800">
                  {t.afterTips.map((tip, i) => <li key={i} className="flex gap-2"><span className="shrink-0">{i + 1}.</span><span>{tip}</span></li>)}
                </ul>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className={ui.secondary}>{t.close}</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={ui.primary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {busy ? t.saving : t.confirm}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
