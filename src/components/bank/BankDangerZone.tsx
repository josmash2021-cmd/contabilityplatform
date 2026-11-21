import { useState } from "react";
import { Loader2, Unplug } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCopy } from "@/i18n/useI18n";
import { bancoNegocioCopy } from "@/i18n/copy/bancoNegocio";

/** Disconnect every bank (bank.disconnect), kept apart at the bottom and behind a confirm dialog. */
export function BankDangerZone({ pending, onConfirm }: { pending: boolean; onConfirm: () => Promise<boolean> }) {
  const t = useCopy(bancoNegocioCopy).danger;
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-4 sm:p-5" aria-labelledby="bank-danger">
      <h2 id="bank-danger" className="font-semibold text-slate-900">{t.title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">{t.text}</p>
      <AlertDialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
        <AlertDialogTrigger asChild>
          <button disabled={pending}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-[10px] border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 sm:h-10">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}{t.button}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-white sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">{t.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">{t.confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10" disabled={pending}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => { e.preventDefault(); void onConfirm().then((ok) => { if (ok) setOpen(false); }); }}
              className="h-11 bg-red-600 text-white hover:bg-red-700 sm:h-10">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? t.working : t.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
