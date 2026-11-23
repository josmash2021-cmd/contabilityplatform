import { useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { authCopy } from "@/i18n/copy/auth";

type Which = "terms" | "privacy";
const FULL: Record<Which, string> = { terms: "/terminos-de-uso", privacy: "/privacy" };

/**
 * "Acepto los Términos de uso y la Política de privacidad" (required, starts unchecked) and the optional box for
 * tips and news by email. Each link opens a short summary with "Leer el texto completo", without ticking the box.
 */
export function AgreeBoxes({ agree, onAgree, marketing, onMarketing, showNeed }: {
  agree: boolean; onAgree: (v: boolean) => void; marketing: boolean; onMarketing: (v: boolean) => void; showNeed?: boolean;
}) {
  const t = useCopy(authCopy).register;
  const [open, setOpen] = useState<Which | null>(null);
  const [a, termsLink, mid, privacyLink, end] = t.agree;
  const sum = open ? t.summaries[open] : null;
  const link = (w: Which, text: string) => (
    <button type="button" onClick={(e) => { e.preventDefault(); setOpen(w); }}
      className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 transition-colors hover:decoration-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      {text}
    </button>
  );
  const box = (checked: boolean, onChange: (v: boolean) => void, body: React.ReactNode, data: string) => (
    <label data-agree={data} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-700 transition-colors",
      checked ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-slate-900" />
      <span>{body}</span>
    </label>
  );

  return (
    <div className="grid gap-2.5">
      {box(agree, onAgree, <>{a}{link("terms", termsLink)}{mid}{link("privacy", privacyLink)}{end}</>, "terms")}
      {box(marketing, onMarketing, t.marketing, "marketing")}
      {showNeed && !agree && <p className="text-[13px] font-medium text-amber-700" role="alert">{t.needAgree}</p>}

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="top-auto bottom-0 h-auto max-h-[92dvh] gap-0 overflow-y-auto rounded-t-[24px] p-0 sm:bottom-auto sm:max-w-[480px] sm:rounded-[20px]">
          {sum && open && (
            <div className="grid gap-3 p-5 sm:p-6">
              <DialogTitle className="pr-8 text-lg font-bold text-slate-900">{sum.title}</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">{sum.intro}</DialogDescription>
              <ul className="grid gap-2">
                {sum.items.map(([h, x]) => (
                  <li key={h} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-[13.5px] text-slate-600">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-900 text-white"><Check className="h-3 w-3" strokeWidth={3.2} aria-hidden="true" /></span>
                    <span><b className="block text-slate-900">{h}</b>{x}</span>
                  </li>
                ))}
              </ul>
              <a href={FULL[open]} target="_blank" rel="noopener noreferrer" className="w-fit text-sm font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700">{t.read}</a>
              <button type="button" onClick={() => setOpen(null)}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                {t.ok}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
