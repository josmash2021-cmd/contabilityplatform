import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  text: string;
  confirm: string;
  cancel: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Asks before something that can't be undone; stays open (busy) until the change is done. */
export function ConfirmDialog({ title, text, confirm, cancel, pending, destructive, onConfirm, onClose }: Props) {
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <AlertDialogContent className="bg-white sm:max-w-md sm:rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold tracking-tight text-slate-900">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-slate-600">{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-11 border-slate-200 sm:h-10" disabled={pending}>{cancel}</AlertDialogCancel>
          <Button
            className={cn("h-11 rounded-[10px] px-4 font-semibold text-white sm:h-10", destructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-500")}
            disabled={pending} aria-busy={pending} onClick={onConfirm}
          >
            {confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
