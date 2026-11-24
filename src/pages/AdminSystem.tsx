// Admin · Sistema: whether email, the bank (Plaid) and payments (Stripe) are connected, and maintenance mode: a switch
// (turning it on asks first), an optional message for customers, when it's expected back, and a preview of what
// customers see (src/components/MaintenanceScreen.tsx). Open design: no icon tiles, no boxed labels.
import { useId, useRef, useState } from "react";
import { CreditCard, Landmark, Mail, ShieldCheck, Wrench, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { adminCopy } from "@/i18n/copy/admin";
import { cn } from "@/lib/utils";

const card = "rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-20px_rgba(15,23,42,0.25)]";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
type State = { enabled: boolean; message: string | null; until: string | null };

export default function AdminSystem() {
  const all = useCopy(adminCopy);
  const t = all.system.page;
  const title = all.system.title;
  const { data: o } = trpc.admin.overview.useQuery(undefined, { refetchOnWindowFocus: true });
  const { data: m } = trpc.admin.maintenanceStatus.useQuery(undefined, { refetchOnWindowFocus: true });
  const services: [LucideIcon, string, string, boolean | undefined][] = [
    [Mail, t.email, t.emailText, o?.system.email],
    [Landmark, t.bank, t.bankText, o?.system.bank],
    [CreditCard, t.payments, t.paymentsText, o?.system.payments],
  ];

  return (
    <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-5 px-4 py-6 sm:px-8 sm:py-7">
      <header className="grid gap-0.5">
        <h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>
        <p className="text-slate-500">{t.subtitle}</p>
      </header>

      <section aria-label={t.services} className={cn(card, "grid gap-1 p-5")}>
        <h2 className="mb-2 text-base font-bold">{t.services}</h2>
        {services.map(([Icon, name, text, ok]) => (
          <div key={name} className="flex items-center gap-3.5 border-b border-slate-100 py-3 last:border-0">
            <Icon className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.8} aria-hidden="true" />
            <span className="grid min-w-0 flex-1"><b className="text-sm">{name}</b><span className="text-[13px] text-slate-500">{text}</span></span>
            {ok === undefined ? <span className="text-sm text-slate-400">…</span> : (
              <span className={cn("inline-flex items-center gap-2 text-xs font-semibold", ok ? "text-emerald-700" : "text-red-700")}>
                <i className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")} aria-hidden="true" />{ok ? t.connected : t.missing}
              </span>
            )}
          </div>
        ))}
      </section>

      {m && <MaintenanceCard key={`${m.enabled}|${m.message ?? ""}|${m.until ?? ""}`} state={m} />}
    </div>
  );
}

function MaintenanceCard({ state }: { state: State }) {
  const all = useCopy(adminCopy);
  const t = all.system.page;
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const msgId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const on = state.enabled;
  const [message, setMessage] = useState(state.message ?? "");
  // null = untouched (keeps the time already set while it's on)
  const [minutes, setMinutes] = useState<number | null>(null);
  const [ask, setAsk] = useState(false);
  const [preview, setPreview] = useState<{ until: string | null } | null>(null);
  const save = trpc.admin.toggleMaintenance.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(!vars.enabled ? t.turnedOff : on ? t.updated : t.turnedOn);
      setAsk(false);
      void Promise.all([utils.admin.maintenanceStatus.invalidate(), utils.admin.overview.invalidate()]);
    },
    onError: (e) => toast.error(e.message),
  });
  const text = message.trim();
  const changed = on && (text !== (state.message ?? "") || minutes !== null);
  const chosen = minutes ?? (on && state.until ? -1 : 0);
  const backAt = on && minutes === null && state.until ? new Date(state.until).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) : null;
  const grow = () => { const el = area.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  const openPreview = () => {
    const until = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : minutes === 0 ? null : on ? state.until : null;
    setPreview({ until });
  };

  return (
    <section aria-label={t.maintenance} className={cn(card, "grid gap-5 p-5")} data-maintenance-card="">
      <div className="flex items-center gap-3.5">
        <Wrench className={cn("h-6 w-6 shrink-0 transition-[color,transform] duration-500", on ? "-rotate-[20deg] text-amber-600" : "text-slate-400")} strokeWidth={1.8} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold">{t.maintenance}</h2>
          <p className="text-[13px] text-slate-500"><span className={cn("font-bold", on ? "text-amber-700" : "text-slate-500")}>{on ? t.on : t.off}</span> · {t.always}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={t.maintenance} disabled={save.isPending}
          onClick={() => (on ? save.mutate({ enabled: false }) : setAsk(true))}
          className={cn("relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60", on ? "bg-amber-500" : "bg-slate-300", FOCUS)}>
          <span className={cn("absolute left-[3px] top-[3px] h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.25)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.3,1.4,0.5,1)]", on && "translate-x-[22px]")} />
        </button>
      </div>

      <div className="grid gap-1">
        <label htmlFor={msgId} className="text-[12.5px] font-semibold text-slate-600">{t.message}</label>
        <textarea ref={area} id={msgId} rows={1} value={message} maxLength={300} placeholder={t.messagePh}
          onChange={(e) => { setMessage(e.target.value); grow(); }}
          className="resize-none border-0 border-b-[1.5px] border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-900 outline-none transition-colors duration-300 placeholder:text-slate-400 focus:border-blue-600" />
      </div>

      <div className="grid gap-1">
        <span className="text-[12.5px] font-semibold text-slate-600" id={`${msgId}-when`}>{t.when}</span>
        <div role="radiogroup" aria-labelledby={`${msgId}-when`} className="flex flex-wrap gap-x-5 gap-y-1">
          {t.whenOptions.map(([mins, label]) => {
            const sel = chosen === mins;
            return (
              <button key={mins} type="button" role="radio" aria-checked={sel} onClick={() => setMinutes(mins)}
                className={cn("relative py-1.5 text-[13.5px] font-semibold transition-colors duration-300 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-slate-900 after:transition-transform after:duration-500",
                  sel ? "text-slate-900 after:scale-x-100" : "text-slate-400 after:scale-x-0 hover:text-slate-600", FOCUS)}>
                {label}
              </button>
            );
          })}
        </div>
        {backAt && <p className="text-xs text-slate-500">{t.backAt(backAt)}</p>}
      </div>

      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{t.note}
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" onClick={openPreview} className={cn("text-[13px] font-semibold text-blue-600 underline-offset-[3px] hover:underline", FOCUS)}>{t.preview}</button>
        {changed && (
          <button type="button" onClick={() => save.mutate({ enabled: true, message: text || null, ...(minutes !== null ? { minutes } : {}) })} disabled={save.isPending}
            className={cn("text-[13px] font-bold text-slate-900 underline decoration-slate-300 decoration-[1.5px] underline-offset-[3px] hover:decoration-current disabled:opacity-60", FOCUS)}>
            {t.update}
          </button>
        )}
      </div>

      {preview && <MaintenanceScreen message={text || null} until={preview.until} onClose={() => setPreview(null)} />}

      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.maintenance}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmOn}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{all.sheet.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); save.mutate({ enabled: true, message: text || null, minutes: minutes ?? 0 }); }}>{t.turnOn}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
