import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { MAX_BILL_AMOUNT, amountInput, errorText, parseAmount, type BillItem, type VendorItem } from "./shared";

const NEW_VENDOR = "__new__";
type Field = "vendor" | "description" | "amount" | "due";

type Props = {
  /** The bill to edit; without it, a new bill. */
  bill?: BillItem;
  /** Vendor picked beforehand (from a vendor's detail). */
  vendorId?: number;
  /** Active vendors for the picker. */
  vendors: readonly VendorItem[];
  today: string;
  onClose: () => void;
};

/** "Nueva factura" / "Editar factura": vendor (pick one or type a new one), concept, amount, due date, note. */
export function BillFormDialog({ bill, vendorId, vendors, today, onClose }: Props) {
  const copy = useCopy(vendorsCopy);
  const t = copy.billForm;
  const utils = trpc.useUtils();
  const uid = useId();
  const ids = { vendor: `${uid}-vendor`, newVendor: `${uid}-new-vendor`, description: `${uid}-desc`, amount: `${uid}-amount`, due: `${uid}-due`, notes: `${uid}-notes` };

  // The bill's own vendor stays pickable even if it was archived since.
  const options = bill && !vendors.some((v) => v.id === bill.vendorId)
    ? [...vendors, { id: bill.vendorId, name: bill.vendorName }]
    : vendors;
  const initialVendor = bill ? String(bill.vendorId) : vendorId ? String(vendorId) : vendors.length === 0 ? NEW_VENDOR : "";

  const [vendor, setVendor] = useState(initialVendor);
  const [newVendorName, setNewVendorName] = useState("");
  const [description, setDescription] = useState(bill?.description ?? "");
  const [amount, setAmount] = useState(bill ? amountInput(bill.amount) : "");
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? today);
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const done = (message: string) => {
    toast.success(message);
    void utils.vendors.invalidate();
    onClose();
  };
  const create = trpc.vendors.bills.create.useMutation({ onSuccess: () => done(t.created), onError: (e) => toast.error(errorText(e, copy.error)) });
  const update = trpc.vendors.bills.update.useMutation({ onSuccess: () => done(t.updated), onError: (e) => toast.error(errorText(e, copy.error)) });
  const pending = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    const isNew = vendor === NEW_VENDOR;
    if (isNew ? !newVendorName.trim() : !vendor) next.vendor = t.errors.vendor;
    if (!description.trim()) next.description = t.errors.description;
    const value = parseAmount(amount);
    if (value === null) next.amount = t.errors.amount;
    else if (value > MAX_BILL_AMOUNT) next.amount = t.errors.amountMax;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) next.due = t.errors.due;
    setErrors(next);
    if (Object.keys(next).length > 0 || value === null) {
      const first = (["vendor", "description", "amount", "due"] as const).find((f) => next[f]);
      if (first) document.getElementById(first === "vendor" ? (isNew ? ids.newVendor : ids.vendor) : ids[first])?.focus();
      return;
    }
    const input = {
      ...(isNew ? { newVendorName: newVendorName.trim() } : { vendorId: Number(vendor) }),
      description: description.trim(),
      amount: value,
      dueDate,
      notes: notes.trim() || null,
    };
    if (bill) update.mutate({ id: bill.id, ...input });
    else create.mutate(input);
  };

  const errorProps = (f: Field, id: string) => (errors[f] ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {});
  const errorLine = (f: Field, id: string) => errors[f] && <p id={`${id}-error`} className="text-xs text-red-600">{errors[f]}</p>;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-black">{bill ? t.titleEdit : t.titleNew}</DialogTitle>
          <DialogDescription className="text-xs text-neutral-500">{t.text}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            {vendor === NEW_VENDOR ? (
              <>
                <Label htmlFor={ids.newVendor} className="text-xs text-neutral-600">{t.newVendorName}</Label>
                <Input
                  id={ids.newVendor} value={newVendorName} maxLength={120} autoComplete="organization"
                  placeholder={t.newVendorPlaceholder} onChange={(e) => setNewVendorName(e.target.value)}
                  {...errorProps("vendor", ids.newVendor)}
                />
                {errorLine("vendor", ids.newVendor)}
                {options.length > 0 && (
                  <button type="button" className="text-xs text-neutral-600 underline underline-offset-2 hover:text-black" onClick={() => setVendor("")}>
                    {t.pickExisting}
                  </button>
                )}
              </>
            ) : (
              <>
                <Label htmlFor={ids.vendor} className="text-xs text-neutral-600">{t.vendor}</Label>
                <Select value={vendor} onValueChange={setVendor}>
                  <SelectTrigger id={ids.vendor} className="w-full" {...errorProps("vendor", ids.vendor)}>
                    <SelectValue placeholder={t.vendorPlaceholder} />
                  </SelectTrigger>
                  <SelectContent className="bg-white" position="popper">
                    {options.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                    {options.length > 0 && <SelectSeparator />}
                    <SelectItem value={NEW_VENDOR}>{t.addVendor}</SelectItem>
                  </SelectContent>
                </Select>
                {errorLine("vendor", ids.vendor)}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.description} className="text-xs text-neutral-600">{t.description}</Label>
            <Input
              id={ids.description} value={description} maxLength={255} placeholder={t.descriptionPlaceholder}
              onChange={(e) => setDescription(e.target.value)} {...errorProps("description", ids.description)}
            />
            {errorLine("description", ids.description)}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={ids.amount} className="text-xs text-neutral-600">{t.amount}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400" aria-hidden="true">$</span>
                <Input
                  id={ids.amount} value={amount} inputMode="decimal" autoComplete="off" placeholder="0.00" className="pl-6 tabular-nums"
                  onChange={(e) => setAmount(e.target.value)} {...errorProps("amount", ids.amount)}
                />
              </div>
              {errorLine("amount", ids.amount)}
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={ids.due} className="text-xs text-neutral-600">{t.due}</Label>
              <Input id={ids.due} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} {...errorProps("due", ids.due)} />
              {errorLine("due", ids.due)}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.notes} className="text-xs text-neutral-600">{t.notes}</Label>
            <Textarea id={ids.notes} value={notes} maxLength={1000} rows={2} placeholder={t.notesPlaceholder} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" className="border-neutral-200" disabled={pending} onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" className="bg-black text-white hover:bg-neutral-800" disabled={pending}>{pending ? t.saving : t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
