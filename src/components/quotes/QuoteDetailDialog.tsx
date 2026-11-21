import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CalendarX2, CircleCheck, CircleX, Copy, Pencil, Printer, Receipt, RotateCcw, Send, Trash2, type LucideIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
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

type View = "detail" | "convert" | "print";
type Action = { key: string; label: string; icon: LucideIcon; onClick: () => void; danger?: boolean };

/** A quote with everything that can be done with it: send, answer, convert, print, share. */
export function QuoteDetailDialog({ quoteId, company, onClose, onEdit }: {
  quoteId: number | null;
  company: CompanyInfo;
  onClose: () => void;
  onEdit: (id: number) => void;
}) {
  return (
    <Dialog open={quoteId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh] sm:max-w-2xl">
        {quoteId !== null && <DetailBody key={quoteId} quoteId={quoteId} company={company} onClose={onClose} onEdit={onEdit} />}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ quoteId, company, onClose, onEdit }: {
  quoteId: number;
  company: CompanyInfo;
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
        <DialogHeader className="border-b border-neutral-100 px-4 py-3 pr-12 text-left sm:px-6">
          <DialogTitle className="text-base">{t.detail.loading}</DialogTitle>
          <DialogDescription className="sr-only">{t.detail.loading}</DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-neutral-600" role="alert">{query.error.message || t.error}</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t.retry}</Button>
          </div>
        ) : (
          <div className="space-y-3 p-6" role="status" aria-label={t.detail.loading}>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
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
  const primary = primaryByStatus[q.status];
  const secondary = [
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
      <DialogHeader className="border-b border-neutral-100 px-4 py-3 pr-12 text-left sm:px-6">
        <DialogTitle className="text-base">{t.detail.title(q.number)}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <QuoteStatusChip status={q.status} label={t.status[q.status]} />
            {expired && <Chip icon={CalendarX2} label={t.expired} className="bg-amber-50 text-amber-800" />}
          </div>
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="text-[11px] text-neutral-500">{t.detail.customer}</dt>
            <dd className="truncate text-black">{q.customerName || t.quotes.noCustomer}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutral-500">{t.detail.created}</dt>
            <dd className="text-black">{formatDate(q.createdAt, locale)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutral-500">{t.detail.validUntil}</dt>
            <dd className="text-black">{q.validUntil ? formatDay(q.validUntil, locale) : t.detail.noDate}</dd>
          </div>
        </dl>

        {expired && q.validUntil && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t.detail.expiredNote(formatDay(q.validUntil, locale))}</p>}
        {q.status === "converted" && q.invoiceNumber && (
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            {t.detail.convertedTo(q.invoiceNumber, q.saleStatus ? t.detail.saleStatus[q.saleStatus] : "")}
          </p>
        )}

        <section aria-labelledby={`quote-${q.id}-items`}>
          <h3 id={`quote-${q.id}-items`} className="mb-1 text-xs font-medium text-neutral-600">{t.detail.items}</h3>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {q.items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="break-words text-sm text-black">{it.description}</p>
                  <p className="text-[11px] text-neutral-500">{it.quantity} × {formatCurrency(it.unitPrice)}</p>
                </div>
                <p className="shrink-0 text-sm font-medium text-black">{formatCurrency(it.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <dl className="ml-auto mt-2 max-w-[16rem] space-y-0.5 text-sm">
            {q.discount > 0 && (
              <>
                <div className="flex justify-between text-neutral-600"><dt>{t.form.subtotal}</dt><dd>{formatCurrency(q.subtotal)}</dd></div>
                <div className="flex justify-between text-neutral-600"><dt>{t.form.discountLine}</dt><dd>-{formatCurrency(q.discount)}</dd></div>
              </>
            )}
            <div className="flex justify-between text-base font-semibold text-black"><dt>{t.form.total}</dt><dd>{formatCurrency(q.total)}</dd></div>
          </dl>
        </section>

        {q.notes && (
          <section>
            <h3 className="mb-1 text-xs font-medium text-neutral-600">{t.detail.notes}</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-neutral-700">{q.notes}</p>
          </section>
        )}
      </div>

      <div className="space-y-2 border-t border-neutral-100 bg-white px-4 py-3 sm:px-6" role="group" aria-label={t.detail.actionsLabel}>
        <Button className="h-10 w-full bg-black text-white hover:bg-neutral-800" disabled={busy} onClick={primary.onClick}>
          <primary.icon className="mr-1.5 h-4 w-4" aria-hidden="true" /> {primary.label}
        </Button>
        {primary === a.send && <p className="text-center text-[11px] text-neutral-500">{t.detail.sendHint}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {secondary.map((x) => (
            <Button
              key={x.key}
              variant="outline"
              disabled={busy}
              onClick={x.onClick}
              className={cn("h-9 min-w-0 border-neutral-200 text-xs", x.danger && "text-red-600 hover:bg-red-50 hover:text-red-700")}
            >
              <x.icon className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">{x.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteQuote.title(q.number)}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteQuote.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteQuote.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => remove.mutate({ id: q.id })}>
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
      <DialogHeader className="border-b border-neutral-100 px-4 py-3 pr-12 text-left sm:px-6">
        <DialogTitle className="text-base">{t.convert.title(q.number)}</DialogTitle>
        <DialogDescription className="text-xs">{t.convert.text}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
          <p className="min-w-0 truncate text-sm text-neutral-700">{q.customerName || t.quotes.noCustomer}</p>
          <p className="shrink-0 text-lg font-semibold text-black">{formatCurrency(q.total)}</p>
        </div>
        <PaymentChoice legend={t.convert.question} options={options} value={choice} onChange={setChoice} />
        <p className="text-xs text-neutral-600" aria-live="polite">{choice === "pending" ? t.convert.pendingHint : t.convert.paidHint}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-100 bg-white px-4 py-3 sm:px-6">
        <Button variant="ghost" onClick={onBack} className="text-neutral-600">
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> {t.convert.back}
        </Button>
        <Button
          className="bg-black text-white hover:bg-neutral-800"
          disabled={convert.isPending}
          onClick={() => convert.mutate({ id: q.id, payment: choice })}
        >
          {convert.isPending ? t.convert.working : t.convert.confirm(formatCurrency(q.total))}
        </Button>
      </div>
    </>
  );
}

function PrintView({ q, t, company, locale, onBack }: { q: QuoteDetail; t: QuotesCopy; company: CompanyInfo; locale: string; onBack: () => void }) {
  return (
    <>
      <DialogHeader className="border-b border-neutral-100 px-4 py-3 pr-12 text-left sm:px-6">
        <DialogTitle className="text-base">{t.print.title}</DialogTitle>
        <DialogDescription className="text-xs">{t.print.hint}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-3 py-4 sm:px-6">
        <div className="mx-auto max-w-[44rem] rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-8">
          <QuoteDocument q={q} company={company} t={t} locale={locale} />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-100 bg-white px-4 py-3 sm:px-6">
        <Button variant="ghost" onClick={onBack} className="text-neutral-600">
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> {t.print.back}
        </Button>
        <Button className="bg-black text-white hover:bg-neutral-800" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.print.print}
        </Button>
      </div>
      <PrintPortal>
        <QuoteDocument q={q} company={company} t={t} locale={locale} />
      </PrintPortal>
    </>
  );
}
