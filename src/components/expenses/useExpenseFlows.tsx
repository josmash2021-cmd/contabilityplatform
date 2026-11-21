// The ways a new expense comes in from the Gastos page: "Gasto en efectivo" (the form, an optional photo),
// "Foto de recibo" (pick a photo → read it when the server can → check the form → save), and "Subir recibo" on a
// row (a photo for an expense or bank charge that's already there). One hook so the owner's page and the
// employee's page share it; it renders its own hidden file inputs and dialogs (`elements`).
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TAX_ACCEPT } from "@/lib/taxFiles";
import { useCopy } from "@/i18n/useI18n";
import { expensesCopy } from "@/i18n/copy/expenses";
import { ExpenseFormDialog, type ExpenseInitial, type ExpenseValues } from "./ExpenseFormDialog";
import { fileErrorText, preparePhoto, serverText, type PhotoDraft } from "./shared";
import { fmtMoney } from "./ui";

/** Types Claude can read on the server (HEIC goes straight to the form). */
const READABLE = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

type Flow =
  | { stage: "preparing" }
  | { stage: "reading" }
  | { stage: "form"; draft: PhotoDraft; initial: ExpenseInitial; notice: string | null; key: number };

type AttachTarget = { key: string; expenseId?: number; bankTransactionId?: number };

let seq = 0;

export function useExpenseFlows({ today, canRead, canAddPhoto, photoBlocked, quota, onSaved }: {
  today: string;
  /** The photo can be read on the server (owner, server has a Claude key). */
  canRead: boolean;
  /** Cash expenses may get a photo (photos left this month). */
  canAddPhoto: boolean;
  photoBlocked: string | null;
  /** Básico: photos used and cap, for the photo strip. */
  quota: { used: number; cap: number } | null;
  /** Called with the saved expense's date, so the page can show its month. */
  onSaved: (date: string) => void;
}) {
  const t = useCopy(expensesCopy);
  const utils = trpc.useUtils();
  const photoRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [cashKey, setCashKey] = useState<number | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [attachTarget, setAttachTarget] = useState<AttachTarget | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);

  const read = trpc.receipts.read.useMutation();
  const createReceipt = trpc.receipts.create.useMutation();
  const createExpense = trpc.expenses.create.useMutation();
  const attach = trpc.receipts.attach.useMutation();

  const refresh = () => Promise.all([utils.expenses.overview.invalidate(), utils.receipts.invalidate()]);
  const closeFlow = () => {
    if (flow?.stage === "form" && flow.draft.previewUrl) URL.revokeObjectURL(flow.draft.previewUrl);
    setFlow(null);
  };

  /** "Foto de recibo": opens the phone's camera / file picker (needs the tap itself). */
  const openPhoto = () => {
    setPickOpen(false);
    photoRef.current?.click();
  };

  const startPhoto = async (file: File | undefined) => {
    if (photoRef.current) photoRef.current.value = "";
    if (!file) return;
    setFlow({ stage: "preparing" });
    let draft: PhotoDraft;
    try {
      draft = await preparePhoto(file);
    } catch (e) {
      setFlow(null);
      toast.error(fileErrorText(t, e));
      return;
    }
    const base: ExpenseInitial = { date: today, paymentMethod: "card" };
    if (!canRead || !READABLE.has(draft.upload.mimeType)) {
      const notice = canRead ? t.form.noReadHeic : t.form.typeIt;
      setFlow({ stage: "form", draft, initial: base, notice, key: ++seq });
      return;
    }
    setFlow({ stage: "reading" });
    try {
      const res = await read.mutateAsync({ file: { mimeType: draft.upload.mimeType, dataBase64: draft.upload.dataBase64 }, today });
      if (res.status === "read" && (res.fields.amount !== null || res.fields.merchant)) {
        const r = res.fields;
        setFlow({
          stage: "form", draft, notice: null, key: ++seq,
          initial: {
            who: r.merchant ?? undefined, amount: r.amount ?? undefined, category: r.category ?? undefined,
            date: r.date && r.date <= today ? r.date : today, paymentMethod: r.paymentMethod ?? "card",
          },
        });
      } else {
        setFlow({ stage: "form", draft, initial: base, notice: res.status === "unsupported" ? t.form.noReadHeic : t.form.notRead, key: ++seq });
      }
    } catch (e) {
      const err = e as { data?: { code?: string } | null; message?: string };
      if (err.data?.code === "FORBIDDEN") {
        // No photos left this month: it couldn't be saved either.
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        setFlow(null);
        toast.error(serverText(t, err));
        return;
      }
      setFlow({ stage: "form", draft, initial: base, notice: err.data?.code === "TOO_MANY_REQUESTS" ? serverText(t, err) : t.form.notRead, key: ++seq });
    }
  };

  const savePhotoExpense = (v: ExpenseValues, photo: PhotoDraft, onDone: () => void) => {
    createReceipt.mutate(
      {
        merchant: v.who, amount: v.amount, date: v.date, category: v.category, paymentMethod: v.paymentMethod, notes: v.notes || undefined,
        file: { ...photo.upload, thumbBase64: photo.thumb ?? undefined },
      },
      {
        onSuccess: () => {
          toast.success(t.toasts.savedReceipt(fmtMoney(v.amount)));
          onDone();
          onSaved(v.date);
          void refresh();
        },
        onError: (e) => {
          toast.error(serverText(t, e));
          void utils.receipts.usage.invalidate();
        },
      },
    );
  };

  const saveCash = (v: ExpenseValues, photo: PhotoDraft | null) => {
    const done = () => {
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      setCashKey(null);
    };
    if (photo) return savePhotoExpense(v, photo, done);
    createExpense.mutate(
      { description: v.who, category: v.category, amount: v.amount, paymentMethod: v.paymentMethod, date: v.date, notes: v.notes || undefined },
      {
        onSuccess: () => {
          toast.success(t.toasts.saved(fmtMoney(v.amount)));
          done();
          onSaved(v.date);
          void refresh();
        },
        onError: (e) => toast.error(serverText(t, e)),
      },
    );
  };

  /** "Subir recibo" on a row: pick the photo, then it's saved straight away. */
  const startAttach = (target: AttachTarget) => {
    setAttachTarget(target);
    attachRef.current?.click();
  };
  const doAttach = async (file: File | undefined) => {
    if (attachRef.current) attachRef.current.value = "";
    const target = attachTarget;
    if (!file || !target) return;
    setAttaching(target.key);
    try {
      const d = await preparePhoto(file);
      if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
      await attach.mutateAsync({
        file: { ...d.upload, thumbBase64: d.thumb ?? undefined },
        ...(target.expenseId ? { expenseId: target.expenseId } : { bankTransactionId: target.bankTransactionId }),
      });
      toast.success(t.toasts.attached);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error && "data" in e ? serverText(t, e) : fileErrorText(t, e));
      void utils.receipts.usage.invalidate();
    } finally {
      setAttaching(null);
    }
  };

  const busy = flow?.stage === "preparing" || flow?.stage === "reading";

  const elements: ReactNode = (
    <>
      <input ref={photoRef} type="file" name="receipt-photo" accept={TAX_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void startPhoto(e.target.files?.[0])} />
      <input ref={attachRef} type="file" name="receipt-attach" accept={TAX_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void doAttach(e.target.files?.[0])} />

      {/* From "+ Nuevo → Foto de recibo" (?photo=1): one tap here opens the camera. */}
      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="content-start bg-white sm:max-w-[420px] sm:rounded-2xl">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-[17px] font-bold text-slate-900">{t.form.pickTitle}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">{t.form.pickText}</DialogDescription>
          </DialogHeader>
          <button
            type="button" onClick={openPhoto}
            className="grid min-h-28 place-items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-100 p-5 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Camera className="h-7 w-7 text-blue-600" aria-hidden="true" />
            {t.form.pickCta}
          </button>
          <p className="text-xs text-slate-500">{t.form.pickHint}{quota ? ` · ${t.form.photosLeft(quota.used, quota.cap)}` : ""}</p>
        </DialogContent>
      </Dialog>

      {/* .rc-read: while the photo is prepared and read */}
      <Dialog open={busy} onOpenChange={() => undefined}>
        <DialogContent className="content-start bg-white sm:max-w-[420px] sm:rounded-2xl" showCloseButton={false}>
          <DialogHeader className="text-left">
            <DialogTitle className="text-[17px] font-bold text-slate-900">{t.form.photoTitle}</DialogTitle>
            <DialogDescription className="sr-only">{t.form.readingSub}</DialogDescription>
          </DialogHeader>
          <div className="grid justify-items-center gap-1.5 px-2.5 py-7 text-center" role="status" aria-live="polite">
            {flow?.stage === "reading"
              ? <RefreshCw className="h-6 w-6 animate-spin text-blue-600 motion-reduce:animate-none" aria-hidden="true" />
              : <Loader2 className="h-6 w-6 animate-spin text-blue-600 motion-reduce:animate-none" aria-hidden="true" />}
            <b className="text-slate-900">{flow?.stage === "reading" ? t.form.reading : t.form.preparing}</b>
            {flow?.stage === "reading" && <span className="text-[13px] text-slate-500">{t.form.readingSub}</span>}
          </div>
        </DialogContent>
      </Dialog>

      {flow?.stage === "form" && (
        <ExpenseFormDialog
          key={flow.key}
          mode="receipt"
          initial={flow.initial}
          maxDate={today}
          photo={flow.draft}
          notice={flow.notice}
          quota={quota ? { used: quota.used + 1, cap: quota.cap } : null}
          saving={createReceipt.isPending}
          onSave={(v, photo) => savePhotoExpense(v, photo ?? flow.draft, () => closeFlow())}
          onClose={closeFlow}
        />
      )}

      {cashKey !== null && (
        <ExpenseFormDialog
          key={cashKey}
          mode="cash"
          initial={{ date: today, paymentMethod: "cash" }}
          maxDate={today}
          photo={null}
          quota={quota}
          canAddPhoto={canAddPhoto}
          photoBlocked={photoBlocked}
          saving={createExpense.isPending || createReceipt.isPending}
          onSave={saveCash}
          onClose={() => setCashKey(null)}
        />
      )}
    </>
  );

  return {
    elements,
    /** "Foto de recibo" button: straight to the camera. */
    openPhoto,
    /** "+ Nuevo → Foto de recibo": a dialog with one big button (a link can't open the camera by itself). */
    askPhoto: () => setPickOpen(true),
    openCash: () => setCashKey(++seq),
    startAttach,
    /** The row whose photo is being uploaded, if any. */
    attaching,
    busy: busy || attaching !== null,
  };
}
