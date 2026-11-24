import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Clock3, Settings, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SupportBubble } from "@/components/support/SupportBubble";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { appCopy } from "@/i18n/copy/app";
import { adminCopy } from "@/i18n/copy/admin";
import { CONTACT_EMAIL } from "@contracts/constants";

/**
 * What customers see while maintenance is on (Admin · Sistema): open and light, in their language, with the admin's
 * message (or the default), when it's expected back if the admin said, where to write if it's urgent, and the site's
 * support bubble (its calls are public, so maintenance doesn't block them). It comes
 * in softly and fades away by itself when maintenance is turned off. `onClose` = the admin's preview.
 */
export function MaintenanceScreen({ message, until, leaving = false, onClose }: {
  message: string | null; until: string | null; leaving?: boolean; onClose?: () => void;
}) {
  const t = useCopy(appCopy).maintenance;
  const locale = intlLocale(useLang().lang);
  // The return time hides itself once it has passed.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const back = until ? new Date(until) : null;
  const showBack = !!back && !Number.isNaN(back.getTime()) && back.getTime() > now - 60_000;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="mt-title" data-maintenance="" data-leaving={leaving}
      className="mt-screen fixed inset-0 z-[100] grid grid-rows-[auto_1fr_auto] justify-items-center overflow-y-auto px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))] text-center text-slate-900">
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t.close}
          className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full text-slate-500 transition-colors hover:bg-white/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <p className="flex max-w-full items-center gap-2 text-[13px] font-bold text-slate-700">
        <Logo className="h-5 w-5 shrink-0 text-blue-600" /><span className="truncate">Personal &amp; Business Solutions</span>
      </p>
      <div className="mt-box grid w-full max-w-[600px] justify-items-center gap-3 self-center py-8">
        <span className="relative h-[58px] w-[74px]" aria-hidden="true">
          <Settings className="mt-gear absolute left-0 top-1.5 h-12 w-12 text-blue-600" strokeWidth={1.5} />
          <Settings className="mt-gear-rev absolute right-0 top-0 h-7 w-7 text-blue-300" strokeWidth={1.7} />
        </span>
        <p className="inline-flex items-center gap-2 text-[13px] font-bold text-amber-800">
          <i className="mt-ping relative h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />{t.status}
        </p>
        <h1 id="mt-title" className="text-[clamp(26px,5vw,38px)] font-extrabold leading-[1.1] tracking-[-0.025em] [text-wrap:balance]">{t.title}</h1>
        <p className="max-w-[38ch] text-[15px] leading-relaxed text-slate-600">{message || t.text}</p>
        {showBack && back && (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Clock3 className="h-4 w-4" aria-hidden="true" />{t.back(back.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }))}
          </p>
        )}
        <p className="inline-flex flex-wrap items-center justify-center gap-2 text-[13px] text-slate-500">
          {t.auto}<span className="tx-dots flex gap-1" aria-hidden="true"><span /><span /><span /></span>
        </p>
      </div>
      {/* On phones it sits above the support bubble, so the bubble never covers it. */}
      <p className="mb-[76px] max-w-full text-[13px] text-slate-500 [overflow-wrap:anywhere] sm:mb-0">{t.urgent} <b className="select-all font-semibold text-slate-700">{CONTACT_EMAIL}</b></p>
      {/* The site's support chat, on top of everything: questions get answered even during maintenance. */}
      <SupportBubble />
    </div>,
    document.body,
  );
}

/**
 * For the admin, at the top of the admin and of the app while maintenance is on: a thin amber line, plain words and
 * "Apagar", so it isn't forgotten on.
 */
export function MaintenanceReminder({ className }: { className?: string }) {
  const t = useCopy(adminCopy).system.page;
  const utils = trpc.useUtils();
  const { data } = trpc.admin.maintenanceStatus.useQuery(undefined, { refetchInterval: 15_000, refetchOnWindowFocus: true });
  const off = trpc.admin.toggleMaintenance.useMutation({
    onSuccess: () => {
      toast.success(t.turnedOff);
      void utils.admin.maintenanceStatus.invalidate();
      void utils.admin.overview.invalidate();
    },
  });
  if (!data?.enabled) return null;
  return (
    <div role="status" data-maintenance-reminder="" className={`mt-remind relative flex flex-wrap items-center gap-x-3 gap-y-1 pb-2.5 pt-3.5 text-[13px] font-semibold text-amber-800 ${className ?? ""}`}>
      <i className="mt-ping relative h-[7px] w-[7px] shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
      <span className="min-w-0">{t.reminder}</span>
      <button type="button" onClick={() => off.mutate({ enabled: false })} disabled={off.isPending}
        className="ml-auto font-bold underline decoration-amber-800/35 decoration-[1.5px] underline-offset-[3px] transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50">
        {t.turnOff}
      </button>
    </div>
  );
}
