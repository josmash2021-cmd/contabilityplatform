// One expense: what it was, where the money left from, "De dónde sale" (.src: its receipt, its bank charge,
// its bill, Por revisar), and what can be done with it (add the receipt, undo a wrong match, delete a cash one).
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Camera, Link2, Loader2, Trash2, Unlink } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MovementLogo } from "@/components/brand/MovementLogo";
import type { ReceiptItem } from "@/components/receipts/ReceiptViewer";
import { useCopy } from "@/i18n/useI18n";
import { expensesCopy, spendCategoryLabel } from "@/i18n/copy/expenses";
import { SRC_LINK, btn, fmtMoney } from "./ui";
import { Dst, Note, SrcLine } from "./proto";
import { serverText, shortDay, type SpendRow } from "./shared";

type Props = {
  item: SpendRow;
  locale: string;
  canChange: boolean;
  canUpload: boolean;
  hasVendors: boolean;
  onClose: () => void;
  onUpload: (item: SpendRow) => void;
  onOpenReceipt: (receipt: ReceiptItem) => void;
};

export function ExpenseDetailDialog({ item, locale, canChange, canUpload, hasVendors, onClose, onUpload, onOpenReceipt }: Props) {
  const t = useCopy(expensesCopy);
  const d = t.detail;
  const utils = trpc.useUtils();
  const [confirm, setConfirm] = useState(false);
  const [year, month] = item.date.split("-").map(Number);
  const receipts = trpc.receipts.list.useQuery({ year, month }, { enabled: item.receiptId !== null, staleTime: 60_000 });
  const receipt = receipts.data?.items.find((r) => r.id === item.receiptId) ?? null;

  const refresh = () => utils.expenses.overview.invalidate();
  const unpair = trpc.expenses.unpair.useMutation({
    onSuccess: () => { toast.success(d.notSameDone); void refresh(); onClose(); },
    onError: (e) => toast.error(serverText(t, e)),
  });
  const del = trpc.expenses.delete.useMutation({
    onSuccess: () => { toast.success(d.deleted); void refresh(); setConfirm(false); onClose(); },
    onError: (e) => toast.error(serverText(t, e)),
  });

  const amount = fmtMoney(-item.amount);
  const facts: Array<[string, string]> = [
    [d.date, shortDay(item.date, locale)],
    [d.category, spendCategoryLabel(t, item.category)],
  ];
  if (item.method) facts.push([d.method, t.method[item.method]]);
  if (item.account) facts.push([d.account, item.account]);
  const canDelete = canChange && item.source === "manual" && !item.hasReceipt && item.expenseId !== null;
  const canUnpair = canChange && item.expenseId !== null && item.bankTransactionId !== null && (item.pairedBy === "auto" || item.pairedBy === "linked");

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !del.isPending) onClose(); }}>
      <DialogContent className="max-h-[100dvh] content-start gap-0 overflow-y-auto bg-white p-0 sm:max-w-[460px] sm:rounded-2xl">
        <DialogHeader className="flex-row items-center gap-3 px-4 pb-2 pt-4 pr-12 text-left sm:px-5">
          <MovementLogo name={item.who} logoUrl={item.logoUrl} accountId={item.bankAccountId} bankOwn={item.bankOwn} size={40} />
          <div className="min-w-0">
            <DialogTitle className="truncate text-[17px] font-bold text-slate-900">{item.who}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              <b className="font-bold tabular-nums text-slate-900">{amount}</b>{item.detail ? ` · ${item.detail}` : ""}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid gap-3 px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
          <div>
            {item.inReview ? <Dst label={t.status.review} tone="open" /> : item.hasReceipt ? <Dst label={t.status.with} tone="good" /> : <Dst label={t.status.without} tone="warn" />}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="break-words text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>

          {item.pairedBy && item.account && (
            <Note icon={Link2}>{d.joined(item.account, item.pairedBy)}</Note>
          )}
          {item.source === "bank" && !item.hasReceipt && !item.inReview && <p className="text-[13px] text-slate-500">{d.bankHint}</p>}

          <SrcLine label={d.from}>
            {item.receiptId !== null && (
              <button type="button" className={SRC_LINK} disabled={!receipt} onClick={() => receipt && onOpenReceipt(receipt)}>
                {receipts.isLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}{d.receipt}
              </button>
            )}
            {item.bankTransactionId !== null && <Link to="/bank" className={SRC_LINK}>{item.account ? d.bank(item.account) : d.bankPlain}</Link>}
            {item.billId !== null && (hasVendors
              ? <Link to={`/vendors?v=${item.vendorId}`} className={SRC_LINK}>{d.bill(item.who)}</Link>
              : <span className="font-semibold text-slate-600">{d.bill(item.who)}</span>)}
            {item.inReview && <Link to="/transactions" className={SRC_LINK}>{d.review}</Link>}
            {item.receiptId === null && item.bankTransactionId === null && item.billId === null && <span className="font-semibold text-slate-600">{t.source[item.source]}</span>}
          </SrcLine>

          {(canChange || canUnpair || canDelete) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {!item.hasReceipt && !item.inReview && canUpload && (
                <button type="button" className={btn("primary")} onClick={() => { onClose(); onUpload(item); }}>
                  <Camera className="h-4 w-4" aria-hidden="true" />{d.upload}
                </button>
              )}
              {canUnpair && (
                <button
                  type="button" className={btn()} disabled={unpair.isPending}
                  onClick={() => unpair.mutate({ expenseId: item.expenseId!, bankTransactionId: item.bankTransactionId! })}
                >
                  {unpair.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlink className="h-4 w-4" aria-hidden="true" />}{d.notSame}
                </button>
              )}
              {canDelete && (
                <button type="button" className={btn("ml-auto text-red-700 hover:bg-red-50")} onClick={() => setConfirm(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />{d.delete}
                </button>
              )}
            </div>
          )}
        </div>

        <AlertDialog open={confirm} onOpenChange={(open) => { if (!del.isPending) setConfirm(open); }}>
          <AlertDialogContent className="bg-white sm:rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-900">{d.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600">{d.deleteText(item.who, fmtMoney(item.amount))}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11 sm:h-10" disabled={del.isPending}>{d.cancel}</AlertDialogCancel>
              <AlertDialogAction
                className="h-11 bg-red-600 text-white hover:bg-red-700 sm:h-10"
                disabled={del.isPending}
                onClick={(e) => { e.preventDefault(); del.mutate({ id: item.expenseId! }); }}
              >
                {del.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}{d.deleteConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
