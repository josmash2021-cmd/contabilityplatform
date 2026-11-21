import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CalendarX2, CircleCheck, CircleX, Copy, Pencil, Printer, Receipt, RotateCcw, Send, Trash2, type LucideIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { quotesCopy, type QuotesCopy } from "@/i18n/copy/quotes";
import {
  canConvertQuote, canDeleteQuote, canEditQuote, localIsoDate, quoteExpired, type ManualQuoteStatus, type PaymentMethod,
} from "../../../api/lib/quotes";
import { Chip, QuoteStatusChip } from "./StatusChip";
import { PaymentChoice } from "./PaymentChoice";
import { PrintPortal, QuoteDocument } from "./QuoteDocument";
import { copyText, formatDate, formatDay, quoteShareText, useRefreshQuotes, type CompanyInfo, type QuoteDetail } from "./shared";
import { BTN } from "./ui";

type View = "detail" | "convert" | "print";
type Action = { key: string; label: string; icon: LucideIcon; onClick: () => void; danger?: boolean };

/** A quote with everything that can be done with it: send, answer, convert, print, share. */
export function QuoteDetailDialog({ quoteId, company, canChange, onClose, onEdit }: {
  quoteId: number | null;
  company: CompanyInfo;
  /** False for a read-only team member (the accountant): only print and copy. */
  canChange: boolean;
  onClose: () => void;
  onEdit: (id: number) => void;
}) {
  return (
    <Dialog open={quoteId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
        {quoteId !== null && <DetailBody key={quoteId} quoteId={quoteId} company={company} canChange={canChange} onClose={onClose} onEdit={onEdit} />}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ quoteId, company, canChange, onClose, onEdit }: {
  quoteId: number;
  company: CompanyInfo;
  canChange: boolean;
  onClose: () => void;
  onEdit: (id: number) => void;
}) {
  const t = useCopy(quotesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefreshQuotes();
  const [today] = useState(() => localIsoDate(new Date()));
  const [view, setView] = useState<View>("detail");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = trpc.quotes.get.useQuery({ id: quoteId });
  const q = query.data;

  const setStatus = trpc.quotes.setStatus.useMutation({ onError: (e) => toast.error(e.message || t.toasts.error) });
  const remove = trpc.quotes.delete.useMutation({
    onSuccess: () => { toast.success(t.toasts.deleted); refresh(); onClose(); },
    onError: (e) => toast.error(e.message || t.toasts.error),
  });

  if (!q) {
    return (
      <>
        <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{t.detail.loading}</DialogTitle>
          <DialogDescription className="sr-only">{t.detail.loading}</DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-slate-700" role="alert">{query.error.message || t.error}</p>
            <button type="button" className={BTN.secondary} onClick={() => void query.refetch()}>{t.retry}</button>
          </div>
        ) : (
          <div className="space-y-3 p-6" role="status" aria-label={t.detail.loading}>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-11 rounded-xl" />
          </div>
        )}
      </>
    );
  }

  const changeStatus = (status: ManualQuoteStatus, done: string) =>
    setStatus.mutate({ id: q.id, status }, { onSuccess: () => { toast.success(done); refresh(); } });

  const send = async () => {
    // Copy first, while the click still counts as a user gesture for the clipboard.
    const copied = await copyText(quoteShareText(q, t, company, locale));
    changeStatus("sent", copied ? t.toasts.sent : t.toasts.sentNoCopy);
  };
  const copy = async () => {
    if (await copyText(quoteShareText(q, t, company, locale))) toast.success(t.toasts.copied);
    else toast.error(t.toasts.copyFailed);
  };

  const a: Record<string, Action> = {
    send: { key: "send", label: t.detail.send, icon: Send, onClick: () => void send() },
    accept: { key: "accept", label: t.detail.accept, icon: CircleCheck, onClick: () => changeStatus("accepted", t.toasts.status(t.status.accepted)) },
    reject: { key: "reject", label: t.detail.reject, icon: CircleX, onClick: () => changeStatus("rejected", t.toasts.status(t.status.rejected)) },
    reopen: { key: "reopen", label: t.detail.reopen, icon: RotateCcw, onClick: () => changeStatus("draft", t.toasts.status(t.status.draft)) },
    convert: { key: "convert", label: t.detail.convert, icon: Receipt, onClick: () => setView("convert") },
    print: { key: "print", label: t.detail.print, icon: Printer, onClick: () => setView("print") },
    copy: { key: "copy", label: t.detail.copy, icon: Copy, onClick: () => void copy() },
    edit: { key: "edit", label: t.detail.edit, icon: Pencil, onClick: () => onEdit(q.id) },
    delete: { key: "delete", label: t.detail.delete, icon: Trash2, onClick: () => setConfirmDelete(true), danger: true },
  };
  const primaryByStatus = { draft: a.send, sent: a.accept, accepted: a.convert, rejected: a.reopen, converted: a.print };
  const primary = canChange ? primaryByStatus[q.status] : a.print;
  const secondary = !canChange ? [a.copy] : [
    q.status === "draft" && a.accept,
    (q.status === "draft" || q.status === "sent" || q.status === "accepted") && a.reject,
    canConvertQuote(q.status) && primary !== a.convert && a.convert,
    primary !== a.print && a.print,
    a.copy,
    canEditQuote(q.status) && a.edit,
    canDeleteQuote(q.status) && a.delete,
  ].filter((x): x is Action => Boolean(x));

  const expired = quoteExpired(q.validUntil, q.status, today);
  const busy = setStatus.isPending || remove.isPending;

  if (view === "convert") return <ConvertView q={q} t={t} onBack={() => setView("detail")} />;
  if (view === "print") return <PrintView q={q} t={t} company={company} locale={locale} onBack={() => setView("detail")} />;

  return (
    <>
      <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
        <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{t.detail.title(q.number)}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <QuoteStatusChip status={q.status} label={t.status[q.status]} />
            {expired && <Chip icon={CalendarX2} label={t.expired} className="bg-amber-50 text-amber-800 ring-1 ring-amber-200" />}
          </div>
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="text-xs text-slate-500">{t.detail.customer}</dt>
            <dd className="truncate font-medium text-slate-900">{q.customerName || t.quotes.noCustomer}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t.detail.created}</dt>
            <dd className="text-slate-900">{formatDate(q.createdAt, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{t.detail.validUntil}</dt>
            <dd className="text-slate-900">{q.validUntil ? formatDay(q.validUntil, locale) : t.detail.noDate}</dd>
          </div>
        </dl>

        {expired && q.validUntil && <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{t.detail.expiredNote(formatDay(q.validUntil, locale))}</p>}
        {q.status === "converted" && q.invoiceNumber && (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            {t.detail.convertedTo(q.invoiceNumber, q.saleStatus ? t.detail.saleStatus[q.saleStatus] : "")}
          </p>
        )}

        <section aria-labelledby={`quote-${q.id}-items`}>
          <h3 id={`quote-${q.id}-items`} className="mb-1.5 text-sm font-semibold text-slate-900">{t.detail.items}</h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {q.items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="break-words text-sm text-slate-900">{it.description}</p>
                  <p className="text-xs tabular-nums text-slate-500">{it.quantity} × {formatCurrency(it.unitPrice)}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(it.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <dl className="ml-auto mt-3 max-w-[18rem] space-y-1 text-sm tabular-nums">
            {q.discount > 0 && (
              <>
                <div className="flex justify-between text-slate-600"><dt>{t.form.subtotal}</dt><dd>{formatCurrency(q.subtotal)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>{t.form.discountLine}</dt><dd>−{formatCurrency(q.discount)}</dd></div>
              </>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-lg font-bold text-slate-900"><dt>{t.form.total}</dt><dd>{formatCurrency(q.total)}</dd></div>
          </dl>
        </section>

        {q.notes && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-slate-900">{t.detail.notes}</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{q.notes}</p>
          </section>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-6" role="group" aria-label={t.detail.actionsLabel}>
        <button type="button" className={cn(BTN.primary, "h-12 w-full text-base sm:h-11")} disabled={busy} onClick={primary.onClick}>
          <primary.icon className="h-5 w-5" aria-hidden="true" /> {primary.label}
        </button>
        {primary === a.send && <p className="text-center text-xs text-slate-500">{t.detail.sendHint}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {secondary.map((x) => (
            <button
              key={x.key}
              type="button"
              disabled={busy}
              onClick={x.onClick}
              className={cn(x.danger ? BTN.dangerOutline : BTN.secondary, "min-w-0 px-3")}
            >
              <x.icon className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">{x.label}</span>
            </button>
          ))}
        </div>
      </div>

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

function ConvertView({ q, t, onBack }: { q: QuoteDetail; t: QuotesCopy; onBack: () => void }) {
  const refresh = useRefreshQuotes();
  const [choice, setChoice] = useState<ConvertChoice>("pending");
  const convert = trpc.quotes.convertToSale.useMutation({
    onSuccess: (r) => {
      toast.success(r.pending ? t.toasts.convertedPending(r.invoiceNumber) : t.toasts.convertedPaid(r.invoiceNumber));
      refresh(true);
      onBack();
    },
    onError: (e) => toast.error(e.message || t.toasts.error),
  });
  const options: Array<{ value: ConvertChoice; label: string }> = [
    { value: "pending", label: t.convert.pending },
    { value: "cash", label: t.paymentMethods.cash },
    { value: "zelle", label: t.paymentMethods.zelle },
    { value: "card", label: t.paymentMethods.card },
  ];

  return (
    <>
      <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
        <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{t.convert.title(q.number)}</DialogTitle>
        <DialogDescription className="text-sm text-slate-500">{t.convert.text}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <p className="min-w-0 truncate text-sm text-slate-700">{q.customerName || t.quotes.noCustomer}</p>
          <p className="shrink-0 text-xl font-bold tabular-nums text-slate-900">{formatCurrency(q.total)}</p>
        </div>
        <PaymentChoice legend={t.convert.question} options={options} value={choice} onChange={setChoice} />
        <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-900" aria-live="polite">{choice === "pending" ? t.convert.pendingHint : t.convert.paidHint}</p>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onBack} className={BTN.ghost}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.convert.back}
        </button>
        <button
          type="button"
          className={BTN.primary}
          disabled={convert.isPending}
          onClick={() => convert.mutate({ id: q.id, payment: choice })}
        >
          {convert.isPending ? t.convert.working : t.convert.confirm(formatCurrency(q.total))}
        </button>
      </div>
    </>
  );
}

function PrintView({ q, t, company, locale, onBack }: { q: QuoteDetail; t: QuotesCopy; company: CompanyInfo; locale: string; onBack: () => void }) {
  return (
    <>
      <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
        <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{t.print.title}</DialogTitle>
        <DialogDescription className="text-sm text-slate-500">{t.print.hint}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-6">
        <div className="mx-auto max-w-[44rem] rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">
          <QuoteDocument q={q} company={company} t={t} locale={locale} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onBack} className={BTN.ghost}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.print.back}
        </button>
        <button type="button" className={BTN.primary} onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> {t.print.print}
        </button>
      </div>
      <PrintPortal>
        <QuoteDocument q={q} company={company} t={t} locale={locale} />
      </PrintPortal>
    </>
  );
}
