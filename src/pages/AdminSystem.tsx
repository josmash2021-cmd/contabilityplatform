// Admin · Sistema: whether email, the bank (Plaid) and payments (Stripe) are connected, and maintenance mode
// (turning it on asks first: customers can't use the app while it's on).
import { useState } from "react";
import { CheckCircle2, CreditCard, Landmark, Mail, Wrench, XCircle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { adminCopy } from "@/i18n/copy/admin";
import { cn } from "@/lib/utils";

const card = "rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-20px_rgba(15,23,42,0.25)]";

export default function AdminSystem() {
  const all = useCopy(adminCopy);
  const t = all.system.page;
  const title = all.system.title;
  const utils = trpc.useUtils();
  const { data: o } = trpc.admin.overview.useQuery(undefined, { refetchOnWindowFocus: true });
  const { data: m } = trpc.admin.maintenanceStatus.useQuery();
  const [ask, setAsk] = useState(false);
  const toggle = trpc.admin.toggleMaintenance.useMutation({
    onSuccess: (r) => {
      toast.success(r.enabled ? t.turnedOn : t.turnedOff);
      setAsk(false);
      void Promise.all([utils.admin.maintenanceStatus.invalidate(), utils.admin.overview.invalidate()]);
    },
  });
  const on = !!m?.enabled;
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
          <div key={name} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="grid min-w-0 flex-1"><b className="text-sm">{name}</b><span className="text-[13px] text-slate-500">{text}</span></span>
            {ok === undefined ? <span className="text-sm text-slate-400">…</span> : ok
              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{t.connected}</span>
              : <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"><XCircle className="h-3.5 w-3.5" aria-hidden="true" />{t.missing}</span>}
          </div>
        ))}
      </section>

      <section aria-label={t.maintenance} className={cn(card, "flex flex-wrap items-center gap-4 p-5")}>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", on ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700")}><Wrench className="h-5 w-5" aria-hidden="true" /></span>
        <div className="grid min-w-0 flex-[1_1_260px] gap-0.5">
          <h2 className="text-base font-bold">{t.maintenance} · <span className={on ? "text-amber-700" : "text-slate-500"}>{on ? t.on : t.off}</span></h2>
          <p className="text-[13px] text-slate-500">{t.maintenanceText}</p>
        </div>
        <button type="button" disabled={!m || toggle.isPending} onClick={() => (on ? toggle.mutate({ enabled: false }) : setAsk(true))}
          className={cn("inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold transition-[background-color,transform] duration-200 active:scale-[0.98] disabled:opacity-50", on ? "bg-slate-900 text-white hover:bg-slate-800" : "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100")}>
          {on ? t.turnOff : t.turnOn}
        </button>
      </section>

      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.maintenance}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmOn}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{all.sheet.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); toggle.mutate({ enabled: true }); }}>{t.turnOn}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
