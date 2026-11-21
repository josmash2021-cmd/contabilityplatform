import { useId, useState, type FormEvent } from "react";
import { Check, FileText, ImageOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { receiptsCopy } from "@/i18n/copy/receipts";
import { BTN, FIELD, LABEL } from "./ui";
import {
  MAX_MERCHANT_LENGTH, MAX_NOTES_LENGTH, RECEIPT_CATEGORIES, RECEIPT_PAYMENT_METHODS, isIsoDate, isReceiptCategory, parseAmount,
  type ReceiptCategory, type ReceiptPaymentMethod,
} from "../../../api/lib/receipts";

export type ReceiptFormValues = {
  merchant: string;
  amount: number;
  date: string;
  category: ReceiptCategory;
  paymentMethod: ReceiptPaymentMethod;
  notes: string;
};

export type ReceiptFormInitial = {
  merchant?: string;
  amount?: number;
  date: string;
  category?: string;
  paymentMethod?: ReceiptPaymentMethod;
  notes?: string | null;
};

/** The file just picked, shown above the form so the total can be read off the photo. */
export type ReceiptPreview = { url: string | null; isPdf: boolean; fileName: string };

type Props = {
  mode: "new" | "edit";
  initial: ReceiptFormInitial;
  /** Latest date allowed (today, YYYY-MM-DD). */
  maxDate: string;
  preview?: ReceiptPreview;
  saving: boolean;
  onSave: (values: ReceiptFormValues) => void;
  onClose: () => void;
};

type Field = "merchant" | "amount" | "date" | "category";
const FIELD_ORDER: readonly Field[] = ["merchant", "amount", "date", "category"];

/** "25" or "25.50": what goes back in the amount box when editing. */
function amountText(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Comercio, monto, fecha, categoría, forma de pago y nota, for a new receipt or to edit one. Mount it to open it. */
export function ReceiptFormDialog({ mode, initial, maxDate, preview, saving, onSave, onClose }: Props) {
  const t = useCopy(receiptsCopy);
  const f = t.form;
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const [merchant, setMerchant] = useState(initial.merchant ?? "");
  const [amount, setAmount] = useState(initial.amount ? amountText(initial.amount) : "");
  const [date, setDate] = useState(initial.date);
  const [category, setCategory] = useState<ReceiptCategory | "">(
    initial.category && isReceiptCategory(initial.category) ? initial.category : "",
  );
  const [payment, setPayment] = useState<ReceiptPaymentMethod>(initial.paymentMethod ?? "card");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [previewBroken, setPreviewBroken] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    const name = merchant.trim();
    const value = parseAmount(amount);
    if (!name) next.merchant = f.errors.merchant;
    if (value === null) next.amount = f.errors.amount;
    if (!isIsoDate(date)) next.date = f.errors.date;
    else if (date > maxDate) next.date = f.errors.dateFuture;
    if (!category) next.category = f.errors.category;
    setErrors(next);
    const first = FIELD_ORDER.find((k) => next[k]);
    if (first || value === null || !category) {
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    onSave({ merchant: name, amount: value, date, category, paymentMethod: payment, notes: notes.trim() });
  };

  const describedBy = (field: Field) => (errors[field] ? fieldId(`${field}-error`) : undefined);
  const errorText = (field: Field) =>
    errors[field] ? <p id={fieldId(`${field}-error`)} className="text-xs text-red-700">{errors[field]}</p> : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-y-auto bg-white p-0 sm:max-h-[92vh] sm:max-w-lg sm:rounded-2xl">
        <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{mode === "new" ? f.newTitle : f.editTitle}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">{mode === "new" ? f.newText : f.editText}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
          <div className="space-y-4 px-4 py-4 sm:px-6">
            {preview && (
              <figure className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {preview.isPdf || !preview.url || previewBroken ? (
                  <div className="flex items-center gap-3 p-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-white" aria-hidden="true">
                      {preview.isPdf ? <FileText className="h-5 w-5 text-slate-500" /> : <ImageOff className="h-5 w-5 text-slate-400" />}
                    </span>
                    <figcaption className="min-w-0">
                      <span className="block truncate text-sm text-slate-900">{preview.fileName}</span>
                      {!preview.isPdf && <span className="block text-xs text-slate-500">{f.noPreview}</span>}
                    </figcaption>
                  </div>
                ) : (
                  <img
                    src={preview.url}
                    alt={f.preview}
                    className="mx-auto max-h-56 w-full object-contain sm:max-h-64"
                    onError={() => setPreviewBroken(true)}
                  />
                )}
              </figure>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={fieldId("merchant")} className={LABEL}>{f.merchant}</Label>
              <Input
                id={fieldId("merchant")}
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder={f.merchantPlaceholder}
                maxLength={MAX_MERCHANT_LENGTH}
                autoComplete="off"
                enterKeyHint="next"
                aria-invalid={!!errors.merchant}
                aria-describedby={describedBy("merchant")}
                className={FIELD}
              />
              {errorText("merchant")}
            </div>

            <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={fieldId("amount")} className={LABEL}>{f.amount}</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500" aria-hidden="true">$</span>
                  <Input
                    id={fieldId("amount")}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={f.amountPlaceholder}
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="next"
                    aria-invalid={!!errors.amount}
                    aria-describedby={describedBy("amount")}
                    className={cn(FIELD, "pl-7 tabular-nums")}
                  />
                </div>
                {errorText("amount")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fieldId("date")} className={LABEL}>{f.date}</Label>
                <Input
                  id={fieldId("date")}
                  type="date"
                  value={date}
                  max={maxDate}
                  onChange={(e) => setDate(e.target.value)}
                  aria-invalid={!!errors.date}
                  aria-describedby={describedBy("date")}
                  className={FIELD}
                />
                {errorText("date")}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={fieldId("category")} className={LABEL}>{f.category}</Label>
              <Select value={category} onValueChange={(v) => { if (isReceiptCategory(v)) setCategory(v); }}>
                <SelectTrigger
                  id={fieldId("category")}
                  className={cn(FIELD, "w-full data-[size=default]:h-11 sm:data-[size=default]:h-10")}
                  aria-invalid={!!errors.category}
                  aria-describedby={describedBy("category")}
                >
                  <SelectValue placeholder={f.categoryPlaceholder} />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  {RECEIPT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{t.categories[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorText("category")}
            </div>

            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-sm font-medium leading-none text-slate-700">{f.payment}</legend>
              <div className="grid grid-cols-3 gap-2">
                {RECEIPT_PAYMENT_METHODS.map((p) => {
                  const on = payment === p;
                  return (
                    <label
                      key={p}
                      className={cn(
                        "flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border px-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-1 sm:h-10",
                        on ? "border-blue-600 bg-blue-50 font-semibold text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={fieldId("payment")}
                        value={p}
                        checked={on}
                        onChange={() => setPayment(p)}
                        className="sr-only"
                      />
                      {on && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      <span className="truncate">{t.payment[p]}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor={fieldId("notes")} className={LABEL}>
                {f.notes} <span className="font-normal text-slate-500">{f.optional}</span>
              </Label>
              <Textarea
                id={fieldId("notes")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={f.notesPlaceholder}
                maxLength={MAX_NOTES_LENGTH}
                rows={2}
                className={cn(FIELD, "min-h-[4.5rem] py-2 sm:h-auto")}
              />
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 mt-auto gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
            <button type="button" className={BTN.secondary} onClick={onClose} disabled={saving}>
              {f.cancel}
            </button>
            <button type="submit" className={BTN.primary} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? f.saving : mode === "new" ? f.save : f.saveChanges}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
