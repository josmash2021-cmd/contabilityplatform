import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Download, Expand, FileText, ImageOff, Loader2, Pencil, Trash2 } from "lucide-react";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { receiptsCopy, receiptCategoryLabel } from "@/i18n/copy/receipts";
import { downloadFile, formatIsoDate, openFileInNewTab } from "./receiptFiles";

export type ReceiptItem = inferRouterOutputs<AppRouter>["receipts"]["list"]["items"][number];

type Props = {
  receipt: ReceiptItem;
  deleting: boolean;
  onClose: () => void;
  onEdit: (receipt: ReceiptItem) => void;
  onDelete: (receipt: ReceiptItem) => void;
};

/** One receipt: the photo (or PDF), its details, and edit / delete. Mount it to open it. */
export function ReceiptViewer({ receipt, deleting, onClose, onEdit, onDelete }: Props) {
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
      <DialogContent className="flex flex-col gap-0 overflow-y-auto p-0 sm:max-h-[92vh] sm:max-w-2xl">
        <DialogHeader className="border-b border-neutral-100 px-5 py-4 pr-12 text-left">
          <DialogTitle className="truncate text-base">{receipt.merchant}</DialogTitle>
          <DialogDescription className="text-xs">{amount} · {dateLabel}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[35vh] items-center justify-center bg-neutral-50 p-3">
          {file.isLoading && (
            <span role="status" className="flex flex-col items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" aria-hidden="true" />
              {v.loading}
            </span>
          )}
          {file.isError && <p role="alert" className="px-4 text-center text-sm text-red-700">{file.error.message || v.error}</p>}
          {data && isPdf && (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-white shadow-sm" aria-hidden="true"><FileText className="h-6 w-6 text-neutral-500" /></span>
              <p className="text-sm text-neutral-600">{v.pdfText}</p>
              <Button className="bg-black text-white hover:bg-neutral-800" onClick={() => openFileInNewTab(data.dataBase64, data.mimeType)}>
                <Expand aria-hidden="true" /> {v.openPdf}
              </Button>
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
            <p className="flex max-w-xs flex-col items-center gap-2 text-center text-sm text-neutral-600">
              <ImageOff className="h-6 w-6 text-neutral-400" aria-hidden="true" />
              {v.cantShow}
            </p>
          )}
        </div>

        <div className="space-y-4 px-5 py-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-neutral-500">{label}</dt>
                <dd className="break-words text-black">{value}</dd>
              </div>
            ))}
          </dl>
          {receipt.expenseId !== null && <p className="text-xs text-neutral-500">{v.linked}</p>}
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-wrap gap-2 border-t border-neutral-100 bg-white px-5 py-3">
          {data && !isPdf && !broken && (
            <Button variant="outline" className="h-10 border-neutral-200" onClick={() => openFileInNewTab(data.dataBase64, data.mimeType)}>
              <Expand aria-hidden="true" /> {v.openFull}
            </Button>
          )}
          {data && (
            <Button variant="outline" className="h-10 border-neutral-200" onClick={() => downloadFile(data.dataBase64, data.mimeType, data.fileName)}>
              <Download aria-hidden="true" /> {v.download}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" className="h-10 border-neutral-200" onClick={() => onEdit(receipt)} disabled={deleting}>
              <Pencil aria-hidden="true" /> {v.edit}
            </Button>
            <Button variant="outline" className="h-10 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setConfirming(true)} disabled={deleting}>
              <Trash2 aria-hidden="true" /> {v.delete}
            </Button>
          </div>
        </div>

        <AlertDialog open={confirming} onOpenChange={(open) => { if (!deleting) setConfirming(open); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.confirmDelete.title}</AlertDialogTitle>
              <AlertDialogDescription>{t.confirmDelete.text(receipt.merchant, amount)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t.confirmDelete.cancel}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
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
