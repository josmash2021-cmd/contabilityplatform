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
      <AlertDialogContent className="bg-white sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold text-black">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-neutral-600">{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="border-neutral-200" disabled={pending}>{cancel}</AlertDialogCancel>
          <Button
            className={cn("text-white", destructive ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-neutral-800")}
            disabled={pending} aria-busy={pending} onClick={onConfirm}
          >
            {confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
