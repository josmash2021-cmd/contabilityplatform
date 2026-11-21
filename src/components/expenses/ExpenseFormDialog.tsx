// The prototype's expense form (overlay "expense": "Gasto en efectivo") and the receipt form that follows a photo
// ("Revisa lo que se leyó"). Mount it to open it.
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Camera, Link2, Loader2, Receipt, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TAX_ACCEPT } from "@/lib/taxFiles";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { expensesCopy } from "@/i18n/copy/expenses";
import {
  MAX_MERCHANT_LENGTH, MAX_NOTES_LENGTH, RECEIPT_CATEGORIES, RECEIPT_PAYMENT_METHODS, isIsoDate, isReceiptCategory, parseAmount,
  type ReceiptCategory, type ReceiptPaymentMethod,
} from "../../../api/lib/receipts";
import { FIELD, LABEL, btn, fmtMoney } from "./ui";
import { Note } from "./proto";
import { fileErrorText, preparePhoto, type PhotoDraft } from "./shared";

export type ExpenseValues = {
  who: string;
  amount: number;
  date: string;
  category: ReceiptCategory;
  paymentMethod: ReceiptPaymentMethod;
  notes: string;
};

export type ExpenseInitial = Partial<Omit<ExpenseValues, "date">> & { date: string };

type Props = {
  /** "cash": a hand-written expense (an optional photo); "receipt": the form after a photo. */
  mode: "cash" | "receipt";
  initial: ExpenseInitial;
  /** Latest date allowed (today). */
  maxDate: string;
  /** The receipt photo (receipt mode) or none yet (cash mode). */
  photo: PhotoDraft | null;
  /** A line above the fields, e.g. "No pudimos leer este recibo. Escribe los datos." */
  notice?: string | null;
  /** Básico: photos used / cap this month, shown on the photo strip. */
  quota?: { used: number; cap: number } | null;
  /** Cash mode: a photo can be added (owner, photos left this month). */
  canAddPhoto?: boolean;
  /** Cash mode: why a photo can't be added (Básico used them up). */
  photoBlocked?: string | null;
  saving: boolean;
  onSave: (values: ExpenseValues, photo: PhotoDraft | null) => void;
  onClose: () => void;
};

type Field = "who" | "amount" | "date" | "category";
const ORDER: readonly Field[] = ["who", "amount", "date", "category"];

const amountText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function PhotoStrip({ photo, extra, action }: { photo: PhotoDraft; extra?: string | null; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-100 p-3 text-[13px] text-slate-500">
      {photo.previewUrl ? (
        <img src={photo.previewUrl} alt="" className="h-10 w-10 flex-none rounded-md border border-slate-200 bg-white object-cover" />
      ) : (
        <Receipt className="h-[26px] w-[26px] flex-none text-blue-600" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">{photo.upload.fileName}{extra ? ` · ${extra}` : ""}</span>
      {action}
    </div>
  );
}

export function ExpenseFormDialog({ mode, initial, maxDate, photo: initialPhoto, notice, quota, canAddPhoto, photoBlocked, saving, onSave, onClose }: Props) {
  const t = useCopy(expensesCopy);
  const f = t.form;
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [who, setWho] = useState(initial.who ?? "");
  const [amount, setAmount] = useState(initial.amount ? amountText(initial.amount) : "");
  const [date, setDate] = useState(initial.date);
  const [category, setCategory] = useState<ReceiptCategory | "">(initial.category && isReceiptCategory(initial.category) ? initial.category : "");
  const [method, setMethod] = useState<ReceiptPaymentMethod>(initial.paymentMethod ?? (mode === "cash" ? "cash" : "card"));
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [photo, setPhoto] = useState<PhotoDraft | null>(initialPhoto);
  const [preparing, setPreparing] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const isReceipt = mode === "receipt";
  const value = parseAmount(amount);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (!who.trim()) next.who = isReceipt ? f.errors.merchant : f.errors.who;
    if (value === null) next.amount = f.errors.amount;
    if (!isIsoDate(date)) next.date = f.errors.date;
    else if (date > maxDate) next.date = f.errors.future;
    if (!category) next.category = f.errors.category;
    setErrors(next);
    const first = ORDER.find((k) => next[k]);
    if (first || value === null || !category) {
      if (first) document.getElementById(id(first))?.focus();
      return;
    }
    onSave({ who: who.trim(), amount: value, date, category, paymentMethod: method, notes: notes.trim() }, photo);
  };

  const pick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setPreparing(true);
    try {
      const d = await preparePhoto(file);
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      setPhoto(d);
    } catch (err) {
      toast.error(fileErrorText(t, err));
    } finally {
      setPreparing(false);
    }
  };
  const dropPhoto = () => {
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
  };

  const errProps = (k: Field) => (errors[k] ? { "aria-invalid": true, "aria-describedby": id(`${k}-err`) } : {});
  const errLine = (k: Field) => errors[k] && <p id={id(`${k}-err`)} className="text-xs font-normal text-red-700">{errors[k]}</p>;
  const quotaText = quota ? f.photosLeft(quota.used, quota.cap) : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[100dvh] content-start gap-0 overflow-y-auto bg-white p-0 sm:max-w-[440px] sm:rounded-2xl">
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left sm:px-5">
          <DialogTitle className="text-[17px] font-bold text-slate-900">{isReceipt ? (notice ? f.photoTitle : f.readTitle) : f.cashTitle}</DialogTitle>
          <DialogDescription className="sr-only">{isReceipt ? f.typeIt : f.cashHelp}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="grid gap-3 px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
          {isReceipt && photo && <PhotoStrip photo={photo} extra={quotaText} />}
          {notice && <p className="text-[13px] text-slate-600" role="status">{notice}</p>}

          <label className={LABEL} htmlFor={id("who")}>
            {isReceipt ? f.merchant : f.who}
            <input
              id={id("who")} value={who} onChange={(e) => setWho(e.target.value)} maxLength={MAX_MERCHANT_LENGTH} autoComplete="off"
              placeholder={isReceipt ? f.merchantPlaceholder : f.whoPlaceholder} className={FIELD} {...errProps("who")}
            />
            {errLine("who")}
          </label>

          <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            {isReceipt ? (
              <label className={LABEL} htmlFor={id("date")}>
                {f.date}
                <input id={id("date")} type="date" value={date} max={maxDate} onChange={(e) => setDate(e.target.value)} className={FIELD} {...errProps("date")} />
                {errLine("date")}
              </label>
            ) : null}
            <label className={LABEL} htmlFor={id("amount")}>
              {isReceipt ? f.total : f.amount}
              <span className="relative block">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-slate-500" aria-hidden="true">$</span>
                <input
                  id={id("amount")} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00"
                  className={cn(FIELD, "pl-6 tabular-nums")} {...errProps("amount")}
                />
              </span>
              {errLine("amount")}
            </label>
            {!isReceipt && (
              <label className={LABEL} htmlFor={id("category")}>
                {f.category}
                <select id={id("category")} value={category} onChange={(e) => setCategory(isReceiptCategory(e.target.value) ? e.target.value : "")} className={FIELD} {...errProps("category")}>
                  <option value="" disabled>{f.categoryPlaceholder}</option>
                  {RECEIPT_CATEGORIES.map((c) => <option key={c} value={c}>{t.cat[c]}</option>)}
                </select>
                {errLine("category")}
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            {isReceipt ? (
              <label className={LABEL} htmlFor={id("category")}>
                {f.category}
                <select id={id("category")} value={category} onChange={(e) => setCategory(isReceiptCategory(e.target.value) ? e.target.value : "")} className={FIELD} {...errProps("category")}>
                  <option value="" disabled>{f.categoryPlaceholder}</option>
                  {RECEIPT_CATEGORIES.map((c) => <option key={c} value={c}>{t.cat[c]}</option>)}
                </select>
                {errLine("category")}
              </label>
            ) : (
              <label className={LABEL} htmlFor={id("date")}>
                {f.when}
                <input id={id("date")} type="date" value={date} max={maxDate} onChange={(e) => setDate(e.target.value)} className={FIELD} {...errProps("date")} />
                {errLine("date")}
              </label>
            )}
            <label className={LABEL} htmlFor={id("method")}>
              {f.paidWith}
              <select id={id("method")} value={method} onChange={(e) => setMethod(e.target.value as ReceiptPaymentMethod)} className={FIELD}>
                {RECEIPT_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t.method[m]}</option>)}
              </select>
            </label>
          </div>

          <label className={LABEL} htmlFor={id("notes")}>
            {f.notes}
            <input id={id("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={MAX_NOTES_LENGTH} autoComplete="off" placeholder={f.notesPlaceholder} className={FIELD} />
          </label>

          {/* Cash: the receipt photo is optional. */}
          {!isReceipt && (photo ? (
            <PhotoStrip
              photo={photo} extra={quotaText}
              action={(
                <button type="button" onClick={dropPhoto} className={btn("ghost", "sm", "icon", "w-11 sm:w-auto")} aria-label={f.removePhoto}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            />
          ) : canAddPhoto ? (
            <>
              <input ref={fileRef} type="file" accept={TAX_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
              <button
                type="button" onClick={() => fileRef.current?.click()} disabled={preparing}
                className="flex min-h-11 items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-100 p-3 text-left text-[13px] font-semibold text-slate-600 transition hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {preparing ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" /> : <Camera className="h-5 w-5 text-blue-600" aria-hidden="true" />}
                {preparing ? f.preparing : f.addPhoto}
              </button>
            </>
          ) : photoBlocked ? (
            <p className="text-xs text-slate-500">{photoBlocked}</p>
          ) : null)}

          {isReceipt && value !== null && (
            <Note icon={method === "cash" ? Wallet : Link2}>{method === "cash" ? f.cashNote : f.bankNote(fmtMoney(value))}</Note>
          )}

          <button type="submit" className={btn("primary", "mt-1 w-full")} disabled={saving || preparing}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? f.saving : f.save}
          </button>
          {!isReceipt && <p className="text-xs text-slate-500">{f.cashHelp}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
