import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ui } from "./personalUtils";

/** "Are you sure?" before something that can't be undone. Stays open while `busy`; the caller closes it when done. */
export function ConfirmDialog({ open, onOpenChange, title, text, confirmLabel, cancelLabel, onConfirm, busy = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <AlertDialogContent className="rounded-2xl bg-white sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold tracking-tight text-slate-900">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-slate-600">{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={busy} className={`${ui.secondary} m-0`}>{cancelLabel}</AlertDialogCancel>
          {/* A plain button (not AlertDialogAction) so the dialog stays open until the delete finishes. */}
          <button type="button" onClick={onConfirm} disabled={busy} className={ui.danger}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
