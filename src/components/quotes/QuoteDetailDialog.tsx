import { useId, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bell, CircleCheck, CircleX, FileDown, Pencil, Receipt, RotateCcw, Send, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { quotesCopy, type QuotesCopy } from "@/i18n/copy/quotes";
import { DocPreview } from "@/components/invoices/DocPreview";
import { Dst, PopMenu, type MenuItem } from "@/components/invoices/proto";
import { FIELD, btn } from "@/components/invoices/ui";
import { SendDialog } from "@/components/invoices/SendDialog";
import { firstName, fmtDay } from "@/components/invoices/shared";
import { DEFAULT_TERMS, TERMS_OPTIONS } from "../../../api/lib/invoices";
import { canConvertQuote, canDeleteQuote, canEditQuote, localIsoDate, type ManualQuoteStatus, type PaymentMethod } from "../../../api/lib/quotes";
import { PaymentChoice } from "./PaymentChoice";
import { PrintPortal } from "./QuoteDocument";
import { quoteShareText, useRefreshQuotes, type CompanyInfo, type QuoteDetail } from "./shared";
import { quoteDocMeta, quoteTone, quoteView } from "./view";

export type QuoteOpen = { id: number; view: "detail" | "convert"; sheet: "send" | "remind" | null };

/** A quote as the client sees it, with everything that can be done with it: send, answer, convert, print. */
export function QuoteDetailDialog({ open, company, contactOf, canChange, onClose, onEdit, onConverted, onSeeInvoice }: {
  open: QuoteOpen | null;
  company: CompanyInfo;
  /** The client's phone and email, for WhatsApp and email. */
  contactOf: (customerId: number | null) => { phone: string | null; email: string | null };
  /** False for a read-only team member (the accountant): only print and copy. */
  canChange: boolean;
  onClose: () => void;
  onEdit: (id: number) => void;
  /** Turned into an invoice: `pending` when it's still to be paid. */
  onConverted: (invoiceRef: string, pending: boolean) => void;
  onSeeInvoice: (saleId: number) => void;
}) {
  return (
    <Dialog open={open !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-h-[90vh] sm:max-w-[620px] sm:rounded-2xl">
        {open !== null && (
          <Body
            key={`${open.id}-${open.view}-${open.sheet ?? ""}`}
            open={open} company={company} contactOf={contactOf} canChange={canChange}
            onClose={onClose} onEdit={onEdit} onConverted={onConverted} onSeeInvoice={onSeeInvoice}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({ open, company, contactOf, canChange, onClose, onEdit, onConverted, onSeeInvoice }: {
  open: QuoteOpen;
  company: CompanyInfo;
  contactOf: (customerId: number | null) => { phone: string | null; email: string | null };
  canChange: boolean;
  onClose: () => void;
  onEdit: (id: number) => void;
  onConverted: (invoiceRef: string, pending: boolean) => void;
  onSeeInvoice: (saleId: number) => void;
}) {
  const t = useCopy(quotesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefreshQuotes();
  const [today] = useState(() => localIsoDate(new Date()));
  const [view, setView] = useState(open.view);
  const [sheet, setSheet] = useState(open.sheet);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = trpc.quotes.get.useQuery({ id: open.id });
  const q = query.data;

  const setStatus = trpc.quotes.setStatus.useMutation({ onError: (e) => toast.error(e.message || t.toasts.error) });
  const remove = trpc.quotes.delete.useMutation({
    onSuccess: () => { toast.success(t.toasts.deleted); refresh(); onClose(); },
    onError: (e) => toast.error(e.message || t.toasts.error),
  });

  if (!q) {
    return (
      <>
        <DialogHeader className="px-4 pb-2 pt-4 pr-12 text-left">
          <DialogTitle className="text-[17px] font-[750] text-slate-900">{t.detail.loading}</DialogTitle>
          <DialogDescription className="sr-only">{t.detail.loading}</DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <div className="grid justify-items-center gap-3 p-8 text-center">
            <p className="text-sm text-slate-700" role="alert">{query.error.message || t.error}</p>
            <button type="button" className={btn()} onClick={() => void query.refetch()}>{t.retry}</button>
          </div>
        ) : (
          <div className="grid gap-3 p-6" role="status" aria-label={t.detail.loading}>
            <Skeleton className="h-6 w-40" /><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-11 rounded-xl" />
          </div>
        )}
      </>
    );
  }

  if (view === "convert") return <ConvertView q={q} t={t} onBack={() => setView("detail")} onConverted={onConverted} />;

  const v = quoteView(q, today);
  const changeStatus = (status: ManualQuoteStatus, done: string) =>
    setStatus.mutate({ id: q.id, status }, { onSuccess: () => { toast.success(done); refresh(); } });
  const busy = setStatus.isPending || remove.isPending;
  const printNow = () => window.print();

  const primary = !canChange ? null
    : q.status === "draft" ? { label: t.detail.send, icon: Send, run: () => setSheet("send") }
      : q.status === "sent" ? { label: t.detail.accept, icon: CircleCheck, run: () => changeStatus("accepted", t.toasts.status(t.state.accepted)) }
        : q.status === "accepted" ? { label: t.detail.convert, icon: Receipt, run: () => setView("convert") }
          : q.status === "rejected" ? { label: t.detail.reopen, icon: RotateCcw, run: () => changeStatus("draft", t.toasts.status(t.state.draft)) }
            : q.saleId ? { label: t.detail.seeInvoice, icon: Receipt, run: () => onSeeInvoice(q.saleId as number) } : null;

  const secondary = !canChange ? [] : [
    q.status === "sent" && { key: "remind", label: t.detail.remind, icon: Bell, run: () => setSheet("remind") },
    (q.status === "sent" || q.status === "accepted") && { key: "send", label: t.detail.sendAgain, icon: Send, run: () => setSheet("send") },
    q.status === "draft" && { key: "accept", label: t.detail.accept, icon: CircleCheck, run: () => changeStatus("accepted", t.toasts.status(t.state.accepted)) },
  ].filter((x): x is { key: string; label: string; icon: typeof Send; run: () => void } => Boolean(x));

  const menu: MenuItem[] = [{ key: "pdf", label: t.detail.print, icon: FileDown, onSelect: printNow }];
  if (!canChange) menu.push({ key: "send", label: t.detail.send, icon: Send, onSelect: () => setSheet("send") });
  if (canChange && canConvertQuote(q.status) && q.status !== "accepted") menu.push({ key: "convert", label: t.detail.convert, icon: Receipt, onSelect: () => setView("convert") });
  if (canChange && canEditQuote(q.status)) menu.push({ key: "edit", label: t.detail.edit, icon: Pencil, onSelect: () => onEdit(q.id) });
  if (canChange && (q.status === "draft" || q.status === "sent" || q.status === "accepted")) menu.push("sep", { key: "reject", label: t.detail.reject, icon: CircleX, onSelect: () => changeStatus("rejected", t.toasts.status(t.state.rejected)), danger: true });
  if (canChange && canDeleteQuote(q.status)) menu.push({ key: "delete", label: t.detail.delete, icon: Trash2, onSelect: () => setConfirmDelete(true), danger: true });

  const doc = (print: boolean) => (
    <DocPreview
      print={print}
      company={company}
      title={`${t.detail.doc.quote} ${q.number}`}
      meta={quoteDocMeta(q, t, locale, today)}
      customerName={q.customerName}
      lines={q.items.map((it) => ({ key: String(it.id), description: it.description, quantity: it.quantity, unitPriceCents: Math.round(it.unitPrice * 100), lineCents: Math.round(it.lineTotal * 100) }))}
      subtotalCents={Math.round(q.subtotal * 100)}
      discountCents={Math.round(q.discount * 100)}
      totalCents={Math.round(q.total * 100)}
      notes={q.notes}
      labels={t.detail.doc}
    />
  );

  const shareText = sheet === "remind"
    ? t.share.remind(firstName(q.customerName), q.number, formatCurrency(q.total), q.validUntil ? fmtDay(q.validUntil, locale, today) : null)
    : quoteShareText(q, t, company, locale);

  return (
    <>
      <DialogHeader className="border-b border-slate-100 px-4 pb-3 pt-4 pr-12 text-left">
        <DialogTitle className="text-[17px] font-[750] text-slate-900">{t.detail.title(q.number)}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[13px] text-slate-500">
            <span className="font-semibold text-slate-900">{q.customerName || t.noCustomer}</span>
            <Dst label={t.state[v]} tone={quoteTone(v)} />
          </div>
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-5">
        {v === "expired" && q.validUntil && <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{t.detail.expiredNote(fmtDay(q.validUntil, locale, today))}</p>}
        {q.status === "converted" && q.invoiceNumber && <p className="rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700 ring-1 ring-slate-200">{t.detail.convertedTo(q.invoiceNumber)}</p>}
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t.detail.asClient}</p>
        {doc(false)}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-4 py-3">
        {primary && (
          <button type="button" className={btn("primary")} disabled={busy} onClick={primary.run}>
            <primary.icon className="h-4 w-4" aria-hidden="true" />{primary.label}
          </button>
        )}
        {secondary.map((x) => (
          <button key={x.key} type="button" className={btn()} disabled={busy} onClick={x.run}>
            <x.icon className="h-4 w-4" aria-hidden="true" />{x.label}
          </button>
        ))}
        <PopMenu label={t.detail.more} items={menu} />
        {q.status === "draft" && canChange && <p className="basis-full text-xs text-slate-500">{t.detail.sendHint}</p>}
      </div>

      <PrintPortal>{doc(true)}</PrintPortal>

      <SendDialog
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === "remind" ? t.send.remindTitle(q.customerName || t.noCustomer) : t.send.title(q.number)}
        recipient={q.customerName}
        phone={contactOf(q.customerId).phone}
        email={contactOf(q.customerId).email}
        subject={sheet === "remind" ? t.share.remindSubject(q.number) : t.share.subject(q.number, company.name)}
        initialText={shareText}
        withPdf={sheet === "send"}
        onPdf={printNow}
        onSent={() => { if (q.status === "draft" && canChange) changeStatus("sent", t.toasts.sent); }}
        t={t.send}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="bg-white sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">{t.deleteQuote.title(q.number)}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">{t.deleteQuote.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10">{t.deleteQuote.cancel}</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-red-600 text-white hover:bg-red-700 sm:h-10" onClick={() => remove.mutate({ id: q.id })}>
              {t.deleteQuote.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ConvertChoice = "pending" | PaymentMethod;

function ConvertView({ q, t, onBack, onConverted }: { q: QuoteDetail; t: QuotesCopy; onBack: () => void; onConverted: (ref: string, pending: boolean) => void }) {
  const id = useId();
  const refresh = useRefreshQuotes();
  const [choice, setChoice] = useState<ConvertChoice>("pending");
  const [termsDays, setTermsDays] = useState<number>(DEFAULT_TERMS);
  const convert = trpc.quotes.convertToSale.useMutation({
    onSuccess: (r) => {
      toast.success(r.pending ? t.toasts.convertedPending(r.invoiceNumber) : t.toasts.convertedPaid(r.invoiceNumber));
      refresh(true);
      onConverted(r.invoiceRef, r.pending);
    },
    onError: (e) => toast.error(e.message || t.toasts.error),
  });
  const options: Array<{ value: ConvertChoice; label: string }> = [
    { value: "pending", label: t.convert.pending },
    { value: "cash", label: t.paymentMethods.cash },
    { value: "zelle", label: t.paymentMethods.zelle },
    { value: "card", label: t.paymentMethods.card },
  ];
  const total = formatCurrency(q.total);

  return (
    <>
      <DialogHeader className="border-b border-slate-100 px-4 pb-3 pt-4 pr-12 text-left">
        <DialogTitle className="text-[17px] font-[750] text-slate-900">{t.convert.title(q.number)}</DialogTitle>
        <DialogDescription className="text-sm text-slate-500">{t.convert.text}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-100 px-4 py-3">
          <p className="min-w-0 truncate text-sm text-slate-700">{q.customerName || t.noCustomer}</p>
          <p className="shrink-0 text-xl font-bold tabular-nums text-slate-900">{total}</p>
        </div>
        <PaymentChoice legend={t.convert.question} options={options} value={choice} onChange={setChoice} />
        {choice === "pending" && (
          <label htmlFor={`${id}-terms`} className="grid gap-1 text-[13px] font-semibold text-slate-900">
            {t.convert.terms}
            <select id={`${id}-terms`} value={termsDays} onChange={(e) => setTermsDays(Number(e.target.value))} className={FIELD}>
              {TERMS_OPTIONS.map((d) => <option key={d} value={d}>{t.convert.termsOptions[d]}</option>)}
            </select>
          </label>
        )}
        <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-900" aria-live="polite">{choice === "pending" ? t.convert.pendingHint : t.convert.paidHint}</p>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onBack} className={btn()}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.convert.back}
        </button>
        <button
          type="button"
          className={btn("primary")}
          disabled={convert.isPending}
          onClick={() => convert.mutate({ id: q.id, payment: choice, termsDays: choice === "pending" ? termsDays : undefined })}
        >
          {convert.isPending ? t.convert.working : choice === "pending" ? t.convert.confirmPending(total) : t.convert.confirmPaid(total)}
        </button>
      </div>
    </>
  );
}
