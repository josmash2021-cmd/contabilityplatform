import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { TAX_ACCEPT } from "@/lib/taxFiles";
import { fileErrorText, preparePhoto } from "@/components/expenses/shared";
import { expensesCopy } from "@/i18n/copy/expenses";
import { addDays } from "../../../api/lib/expenses";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { MAX_BILL_AMOUNT, amountInput, errorText, parseAmount, type BillItem, type VendorItem } from "./shared";

/** Same vendor name ignoring case, accents and spaces (as the server: api/lib/vendors.ts sameVendorName). */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
import { BTN, FIELD, LABEL } from "./ui";

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
  /** "Subir factura": the bill's photo or PDF can be read to fill in the form (the server has a Claude key). */
  canRead?: boolean;
  onClose: () => void;
};

/** "Nueva factura" / "Editar factura": vendor (pick one or type a new one), concept, amount, due date, note. */
export function BillFormDialog({ bill, vendorId, vendors, today, canRead, onClose }: Props) {
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
  // A new bill for a vendor with terms ("Plazo") is due that many days from today, until the date is changed.
  const termsOf = (id: string) => vendors.find((v) => String(v.id) === id)?.terms ?? null;
  const [dueDate, setDueDate] = useState(() => {
    if (bill) return bill.dueDate;
    const tm = termsOf(initialVendor);
    return tm ? addDays(today, tm) : today;
  });
  const [dueTouched, setDueTouched] = useState(!!bill);
  const pickVendor = (v: string) => {
    setVendor(v);
    const tm = termsOf(v);
    if (!dueTouched && tm !== null) setDueDate(addDays(today, tm));
  };
  // Reading a bill (photo or PDF): only to fill the form, nothing is stored.
  const ex = useCopy(expensesCopy);
  const r = copy.proto.read;
  const fileRef = useRef<HTMLInputElement>(null);
  const [readNote, setReadNote] = useState<string | null>(null);
  const read = trpc.vendors.bills.read.useMutation();
  const [reading, setReading] = useState(false);
  const readBill = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setReading(true);
    setReadNote(null);
    try {
      const d = await preparePhoto(file);
      if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
      const res = await read.mutateAsync({ file: { mimeType: d.upload.mimeType, dataBase64: d.upload.dataBase64 }, today });
      if (res.status !== "read") {
        setReadNote(res.status === "unsupported" ? r.unsupported : r.failed);
        return;
      }
      const f = res.fields;
      if (f.vendor) {
        const match = vendors.find((v) => norm(v.name) === norm(f.vendor!));
        if (match) pickVendor(String(match.id));
        else { setVendor(NEW_VENDOR); setNewVendorName(f.vendor); }
      }
      if (f.description) setDescription(f.description);
      if (f.amount !== null) setAmount(amountInput(f.amount));
      if (f.dueDate) { setDueDate(f.dueDate); setDueTouched(true); }
      setReadNote(r.done);
    } catch (e) {
      setReadNote(e instanceof Error && "data" in e ? errorText(e, r.failed) : fileErrorText(ex, e));
    } finally {
      setReading(false);
    }
  };
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
      <DialogContent className="max-h-[100dvh] grid-cols-1 content-start overflow-y-auto bg-white sm:max-w-md sm:rounded-2xl">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{bill ? t.titleEdit : t.titleNew}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">{t.text}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          {canRead && !bill && (
            <div className="space-y-1.5">
              <input ref={fileRef} type="file" accept={TAX_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void readBill(e.target.files?.[0])} />
              <button
                type="button" onClick={() => fileRef.current?.click()} disabled={reading}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-100 p-3 text-left text-[13px] font-semibold text-slate-700 transition hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {reading ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" /> : <FileText className="h-5 w-5 text-blue-600" aria-hidden="true" />}
                {reading ? r.reading : r.cta}
              </button>
              <p className="text-xs text-slate-500" role="status">{readNote ?? r.hint}</p>
            </div>
          )}
          <div className="space-y-1.5">
            {vendor === NEW_VENDOR ? (
              <>
                <Label htmlFor={ids.newVendor} className={LABEL}>{t.newVendorName}</Label>
                <Input
                  className={FIELD}
                  id={ids.newVendor} value={newVendorName} maxLength={120} autoComplete="organization"
                  placeholder={t.newVendorPlaceholder} onChange={(e) => setNewVendorName(e.target.value)}
                  {...errorProps("vendor", ids.newVendor)}
                />
                {errorLine("vendor", ids.newVendor)}
                {options.length > 0 && (
                  <button type="button" className="min-h-[32px] text-sm font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => setVendor("")}>
                    {t.pickExisting}
                  </button>
                )}
              </>
            ) : (
              <>
                <Label htmlFor={ids.vendor} className={LABEL}>{t.vendor}</Label>
                <Select value={vendor} onValueChange={pickVendor}>
                  <SelectTrigger id={ids.vendor} className={cn(FIELD, "w-full data-[size=default]:h-11 sm:data-[size=default]:h-10")} {...errorProps("vendor", ids.vendor)}>
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
            <Label htmlFor={ids.description} className={LABEL}>{t.description}</Label>
            <Input
              className={FIELD}
              id={ids.description} value={description} maxLength={255} placeholder={t.descriptionPlaceholder}
              onChange={(e) => setDescription(e.target.value)} {...errorProps("description", ids.description)}
            />
            {errorLine("description", ids.description)}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={ids.amount} className={LABEL}>{t.amount}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden="true">$</span>
                <Input
                  id={ids.amount} value={amount} inputMode="decimal" autoComplete="off" placeholder="0.00" className={cn(FIELD, "pl-7 tabular-nums")}
                  onChange={(e) => setAmount(e.target.value)} {...errorProps("amount", ids.amount)}
                />
              </div>
              {errorLine("amount", ids.amount)}
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={ids.due} className={LABEL}>{t.due}</Label>
              <Input className={FIELD} id={ids.due} type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} {...errorProps("due", ids.due)} />
              {errorLine("due", ids.due)}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.notes} className={LABEL}>{t.notes}</Label>
            <Textarea className={cn(FIELD, "min-h-[4.5rem] py-2")} id={ids.notes} value={notes} maxLength={1000} rows={2} placeholder={t.notesPlaceholder} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" className={BTN.secondary} disabled={pending} onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" className={BTN.primary} disabled={pending}>{pending ? t.saving : t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
