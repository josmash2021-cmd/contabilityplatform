import { AlertTriangle, Archive, ArchiveRestore, Mail, Pencil, Phone, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { BillCard } from "./BillCard";
import type { BillItem, VendorItem } from "./shared";
import { BTN } from "./ui";

type Props = {
  vendor: VendorItem;
  today: string;
  busy?: boolean;
  /** False for a read-only team member (the accountant). */
  canChange?: boolean;
  onClose: () => void;
  onNewBill: (vendorId: number) => void;
  onEdit: (vendor: VendorItem) => void;
  onArchive: (vendor: VendorItem) => void;
  onRestore: (vendor: VendorItem) => void;
  onPay: (bill: BillItem) => void;
  onEditBill: (bill: BillItem) => void;
  onDeleteBill: (bill: BillItem) => void;
  onUnpay: (bill: BillItem) => void;
};

/** A vendor's card: contact, what you owe them, and all their bills (to pay first, then paid). */
export function VendorDetailDialog({ vendor, today, busy, canChange = true, onClose, onNewBill, onEdit, onArchive, onRestore, ...billActions }: Props) {
  const c = useCopy(vendorsCopy);
  const t = c.vendorDetail;
  const bills = trpc.vendors.bills.list.useQuery({ filter: "all", vendorId: vendor.id, today, limit: 200 });
  const overdue = vendor.overdueCount > 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[100dvh] flex-col gap-0 overflow-y-auto bg-white p-0 sm:max-w-lg sm:rounded-2xl">
        <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="break-words text-lg font-bold tracking-tight text-slate-900">{vendor.name}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-sm text-slate-600">
              {vendor.archived && <p className="text-xs font-medium text-slate-500">{t.archivedNote}</p>}
              {vendor.phone && (
                <a href={`tel:${vendor.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-[32px] items-center gap-2 rounded-md hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={t.call(vendor.phone)}>
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{vendor.phone}</span>
                </a>
              )}
              {vendor.email && (
                <a href={`mailto:${vendor.email}`} className="flex min-h-[32px] min-w-0 items-center gap-2 rounded-md hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={t.mail(vendor.email)}>
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{vendor.email}</span>
                </a>
              )}
              {vendor.notes && <p className="whitespace-pre-line break-words text-xs text-slate-500">{vendor.notes}</p>}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-6">
          <div className={cn("rounded-2xl border p-4", overdue ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50")}>
            <p className="text-xs font-medium text-slate-500">{t.owes}</p>
            <p className={cn("mt-0.5 text-2xl font-bold tabular-nums tracking-tight", overdue ? "text-red-700" : "text-slate-900")}>{formatCurrency(vendor.unpaidTotal)}</p>
            {overdue && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{t.overdue(vendor.overdueCount)}
              </p>
            )}
          </div>

          {canChange && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {!vendor.archived && (
                <button type="button" className={cn(BTN.primary, "col-span-2")} onClick={() => onNewBill(vendor.id)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />{t.newBill}
                </button>
              )}
              <button type="button" className={BTN.secondary} onClick={() => onEdit(vendor)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />{t.edit}
              </button>
              {vendor.archived ? (
                <button type="button" className={BTN.secondary} disabled={busy} onClick={() => onRestore(vendor)}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />{t.unarchive}
                </button>
              ) : (
                <button type="button" className={BTN.secondary} disabled={busy} onClick={() => onArchive(vendor)}>
                  <Archive className="h-4 w-4" aria-hidden="true" />{t.archive}
                </button>
              )}
            </div>
          )}

          <section aria-labelledby={`vendor-${vendor.id}-bills`} className="space-y-2">
            <h3 id={`vendor-${vendor.id}-bills`} className="font-semibold text-slate-900">{t.bills}</h3>
            {bills.isLoading ? (
              <div className="space-y-2" role="status" aria-label={c.loading}>
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            ) : bills.isError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-200 p-3">
                <p className="text-sm text-slate-700" role="alert">{c.loadError}</p>
                <button type="button" className={BTN.secondary} onClick={() => void bills.refetch()}>{c.retry}</button>
              </div>
            ) : (bills.data?.items.length ?? 0) === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">{t.noBills}</p>
            ) : (
              <ul className="space-y-2">
                {bills.data?.items.map((b) => (
                  <BillCard
                    key={b.id} bill={b} today={today} hideVendor busy={busy} canChange={canChange}
                    onPay={billActions.onPay} onEdit={billActions.onEditBill} onDelete={billActions.onDeleteBill} onUnpay={billActions.onUnpay}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
