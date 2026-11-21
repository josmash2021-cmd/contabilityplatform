import { toast } from "sonner";
import { Info } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCopy } from "@/i18n/useI18n";
import { invoicesCopy } from "@/i18n/copy/invoices";
import type { ReminderKind, ReminderSettings } from "../../../api/lib/invoices";
import { btn } from "./ui";

const KINDS: ReminderKind[] = ["before", "onDue", "after", "weekly"];

/** The prototype's "Recordatorios automáticos" panel, saying plainly that the user sends them. */
export function RemindersDialog({ open, onClose, settings, canChange }: {
  open: boolean;
  onClose: () => void;
  settings: ReminderSettings;
  canChange: boolean;
}) {
  const t = useCopy(invoicesCopy);
  const utils = trpc.useUtils();
  const save = trpc.invoices.saveSettings.useMutation({
    onSuccess: () => { void utils.invoices.invalidate(); toast.success(t.reminders.saved); },
    onError: (e) => toast.error(e.message || t.toasts.error),
  });
  const toggle = (k: ReminderKind, on: boolean) => save.mutate({ ...settings, [k]: on });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 bg-white p-0 sm:max-w-[460px] sm:rounded-2xl">
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left">
          <DialogTitle className="text-[17px] font-[750] text-slate-900">{t.reminders.title}</DialogTitle>
          <DialogDescription className="flex gap-2 pt-1 text-[13px] text-slate-500">
            <Info className="mt-0.5 h-4 w-4 flex-none text-blue-600" aria-hidden="true" />
            <span>{t.reminders.honest}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 px-4 pb-4 pt-2">
          {KINDS.map((k) => (
            <label key={k} className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-900 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500">
              <input
                type="checkbox"
                checked={settings[k]}
                disabled={!canChange || save.isPending}
                onChange={(e) => toggle(k, e.target.checked)}
                className="h-5 w-5 flex-none accent-blue-600"
              />
              {t.reminders.options[k]}
            </label>
          ))}
          {!canChange && <p className="text-xs text-slate-500">{t.reminders.readOnly}</p>}
          <button type="button" className={btn("mt-1 w-full")} onClick={onClose}>{t.reminders.close}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
