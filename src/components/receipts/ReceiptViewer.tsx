import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Download, Expand, FileText, ImageOff, Loader2, Pencil, Trash2 } from "lucide-react";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { receiptsCopy, receiptCategoryLabel } from "@/i18n/copy/receipts";
import { downloadFile, formatIsoDate, openFileInNewTab } from "./receiptFiles";
import { BTN } from "./ui";

export type ReceiptItem = inferRouterOutputs<AppRouter>["receipts"]["list"]["items"][number];

type Props = {
  receipt: ReceiptItem;
  /** Edit and delete are the owner's (team members can't: api/lib/team.ts). */
  canChange: boolean;
  deleting: boolean;
  onClose: () => void;
  onEdit: (receipt: ReceiptItem) => void;
  onDelete: (receipt: ReceiptItem) => void;
};

/** One receipt: the photo (or PDF), its details, and edit / delete. Mount it to open it. */
export function ReceiptViewer({ receipt, canChange, deleting, onClose, onEdit, onDelete }: Props) {
  const t = useCopy(receiptsCopy);
  const v = t.view;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const file = trpc.receipts.file.useQuery({ id: receipt.id }, { staleTime: 60_000, gcTime: 0, retry: 1 });
  const [confirming, setConfirming] = useState(false);
  const [broken, setBroken] = useState(false);

  const data = file.data ?? null;
  const isPdf = receipt.mimeType === "application/pdf";
  // A data: URL needs no cleanup (a blob URL would have to be revoked).
  const src = useMemo(() => (data && !isPdf ? `data:${data.mimeType};base64,${data.dataBase64}` : null), [data, isPdf]);
  const amount = formatCurrency(receipt.amount);
  const dateLabel = formatIsoDate(receipt.date, locale, { day: "numeric", month: "long", year: "numeric" });

  const details: Array<[string, string]> = [
    [v.amount, amount],
    [v.date, dateLabel],
    [v.category, receiptCategoryLabel(t, receipt.category)],
    [v.payment, t.payment[receipt.paymentMethod]],
  ];
  if (receipt.notes) details.push([v.notes, receipt.notes]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !deleting) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-y-auto bg-white p-0 sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="truncate text-lg font-bold tracking-tight text-slate-900">{receipt.merchant}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500"><span className="font-semibold tabular-nums text-slate-900">{amount}</span> · {dateLabel}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[35vh] shrink-0 items-center justify-center bg-slate-50 p-3">
          {file.isLoading && (
            <span role="status" className="flex flex-col items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden="true" />
              {v.loading}
            </span>
          )}
          {file.isError && <p role="alert" className="px-4 text-center text-sm text-red-700">{file.error.message || v.error}</p>}
          {data && isPdf && (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm" aria-hidden="true"><FileText className="h-6 w-6 text-slate-500" /></span>
              <p className="text-sm text-slate-600">{v.pdfText}</p>
              <button type="button" className={BTN.primary} onClick={() => openFileInNewTab(data.dataBase64, data.mimeType)}>
                <Expand className="h-4 w-4" aria-hidden="true" /> {v.openPdf}
              </button>
            </div>
          )}
          {src && !broken && (
            <img
              src={src}
              alt={`${t.form.preview}: ${receipt.merchant}`}
              className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain"
              onError={() => setBroken(true)}
            />
          )}
          {src && broken && (
            <p className="flex max-w-xs flex-col items-center gap-2 text-center text-sm text-slate-600">
              <ImageOff className="h-6 w-6 text-slate-400" aria-hidden="true" />
              {v.cantShow}
            </p>
          )}
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className={cn("break-words text-slate-900", label === v.amount && "font-semibold tabular-nums")}>{value}</dd>
              </div>
            ))}
          </dl>
          {receipt.expenseId !== null && <p className="text-xs text-slate-500">{receipt.attached ? v.attachedNote : v.linked}</p>}
          {!canChange && <p className="text-xs text-slate-500">{t.ui.ownerOnly}</p>}
        </div>

        <div className="sticky bottom-0 mt-auto grid grid-cols-2 gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex sm:flex-wrap sm:px-6">
          {data && !isPdf && !broken && (
            <button type="button" className={BTN.secondary} onClick={() => openFileInNewTab(data.dataBase64, data.mimeType)}>
              <Expand className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">{v.openFull}</span>
            </button>
          )}
          {data && (
            <button type="button" className={BTN.secondary} onClick={() => downloadFile(data.dataBase64, data.mimeType, data.fileName)}>
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">{v.download}</span>
            </button>
          )}
          {canChange && (
            <div className="col-span-2 grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
              {/* A photo added to an expense that already existed: the expense is changed in Gastos, not here. */}
              {!receipt.attached && (
                <button type="button" className={BTN.secondary} onClick={() => onEdit(receipt)} disabled={deleting}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> {v.edit}
                </button>
              )}
              <button type="button" className={BTN.dangerOutline} onClick={() => setConfirming(true)} disabled={deleting}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> {v.delete}
              </button>
            </div>
          )}
        </div>

        <AlertDialog open={confirming} onOpenChange={(open) => { if (!deleting) setConfirming(open); }}>
          <AlertDialogContent className="bg-white sm:rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-900">{t.confirmDelete.title}</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600">{receipt.attached ? t.confirmDelete.textAttached : t.confirmDelete.text(receipt.merchant, amount)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11 sm:h-10" disabled={deleting}>{t.confirmDelete.cancel}</AlertDialogCancel>
              <AlertDialogAction
                className="h-11 bg-red-600 text-white hover:bg-red-700 sm:h-10"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault(); // stay open while deleting; the viewer closes when it's done
                  onDelete(receipt);
                }}
              >
                {deleting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {deleting ? t.confirmDelete.deleting : t.confirmDelete.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
