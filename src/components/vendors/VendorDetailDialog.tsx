import { Archive, ArchiveRestore, Mail, Pencil, Phone, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { BillCard } from "./BillCard";
import type { BillItem, VendorItem } from "./shared";

type Props = {
  vendor: VendorItem;
  today: string;
  busy?: boolean;
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
export function VendorDetailDialog({ vendor, today, busy, onClose, onNewBill, onEdit, onArchive, onRestore, ...billActions }: Props) {
  const c = useCopy(vendorsCopy);
  const t = c.vendorDetail;
  const bills = trpc.vendors.bills.list.useQuery({ filter: "all", vendorId: vendor.id, today, limit: 200 });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto bg-white sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="break-words pr-6 text-base font-semibold text-black">{vendor.name}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-sm text-neutral-600">
              {vendor.archived && <p className="text-xs font-medium text-neutral-500">{t.archivedNote}</p>}
              {vendor.phone && (
                <a href={`tel:${vendor.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 hover:text-black" aria-label={t.call(vendor.phone)}>
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{vendor.phone}</span>
                </a>
              )}
              {vendor.email && (
                <a href={`mailto:${vendor.email}`} className="flex min-w-0 items-center gap-2 hover:text-black" aria-label={t.mail(vendor.email)}>
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{vendor.email}</span>
                </a>
              )}
              {vendor.notes && <p className="whitespace-pre-line break-words text-xs text-neutral-500">{vendor.notes}</p>}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">{t.owes}</p>
          <p className="text-xl font-semibold tabular-nums text-black">{formatCurrency(vendor.unpaidTotal)}</p>
          {vendor.overdueCount > 0 && <p className="mt-0.5 text-xs font-medium text-red-700">{t.overdue(vendor.overdueCount)}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {!vendor.archived && (
            <Button size="sm" className="bg-black text-white hover:bg-neutral-800" onClick={() => onNewBill(vendor.id)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />{t.newBill}
            </Button>
          )}
          <Button size="sm" variant="outline" className="border-neutral-200" onClick={() => onEdit(vendor)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />{t.edit}
          </Button>
          {vendor.archived ? (
            <Button size="sm" variant="outline" className="border-neutral-200" disabled={busy} onClick={() => onRestore(vendor)}>
              <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />{t.unarchive}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="border-neutral-200" disabled={busy} onClick={() => onArchive(vendor)}>
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />{t.archive}
            </Button>
          )}
        </div>

        <section aria-labelledby={`vendor-${vendor.id}-bills`} className="space-y-2">
          <h3 id={`vendor-${vendor.id}-bills`} className="text-sm font-semibold text-black">{t.bills}</h3>
          {bills.isLoading ? (
            <div className="space-y-2" role="status" aria-label={c.loading}>
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
          ) : bills.isError ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 p-3">
              <p className="text-sm text-neutral-600" role="alert">{c.loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void bills.refetch()}>{c.retry}</Button>
            </div>
          ) : (bills.data?.items.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-500">{t.noBills}</p>
          ) : (
            <ul className="space-y-2">
              {bills.data?.items.map((b) => (
                <BillCard
                  key={b.id} bill={b} today={today} hideVendor busy={busy}
                  onPay={billActions.onPay} onEdit={billActions.onEditBill} onDelete={billActions.onDeleteBill} onUnpay={billActions.onUnpay}
                />
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
