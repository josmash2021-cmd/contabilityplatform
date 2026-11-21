import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Ban, CheckCircle2, HandCoins } from "lucide-react";
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
import { quotesCopy } from "@/i18n/copy/quotes";
import type { PaymentMethod } from "../../../api/lib/quotes";
import { PaymentChoice } from "./PaymentChoice";
import { formatDate, formatDay, useRefreshQuotes, type Receivable } from "./shared";
import { BTN, CARD } from "./ui";

/** Rows shown before "show more". */
const FIRST_ROWS = 4;

/** Pending sales from quotes and recurring invoices, to mark as paid (or void). */
export function Receivables({ items, loading, error, onRetry, canChange }: {
  items: readonly Receivable[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** False for a read-only team member (the accountant): no collect / void. */
  canChange: boolean;
}) {
  const t = useCopy(quotesCopy);
  const r = t.receivables;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const refresh = useRefreshQuotes();
  const [expanded, setExpanded] = useState(false);
  const [collecting, setCollecting] = useState<Receivable | null>(null);
  const [voiding, setVoiding] = useState<Receivable | null>(null);
  const cancel = trpc.quotes.cancelPending.useMutation({
    onSuccess: (res) => { toast.success(t.toasts.cancelled(res.invoiceNumber)); setVoiding(null); refresh(true); },
    onError: (e) => toast.error(e.message || t.toasts.error),
  });

  if (loading) return <Skeleton className="h-32 rounded-2xl" />;
  if (error) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-white p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-900" role="alert"><AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />{t.error}</p>
        <button type="button" className={BTN.secondary} onClick={onRetry}>{t.retry}</button>
      </section>
    );
  }

  const sum = items.reduce((s, i) => s + Math.round(i.total * 100), 0) / 100;
  const shown = expanded ? items : items.slice(0, FIRST_ROWS);

  return (
    <section className={CARD} aria-labelledby="quotes-receivables">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600" aria-hidden="true">
            <HandCoins className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="quotes-receivables" className="font-semibold text-slate-900">{r.title}</h2>
            <p className="text-sm text-slate-500">{items.length === 0 ? t.ui.receivablesEmpty : r.text}</p>
          </div>
        </div>
        {items.length > 0 && (
          <div className="w-full text-left sm:w-auto sm:text-right">
            <p className="text-xs font-medium text-slate-500">{t.ui.owed}</p>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{formatCurrency(sum)}</p>
            <p className="text-xs text-slate-500">{t.ui.salesCount(items.length)}</p>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {shown.map((s) => (
            <li key={s.saleId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start justify-between gap-3 sm:flex-1">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-900">
                    <span className="font-semibold">{s.customerName || t.quotes.noCustomer}</span>
                    <span className="text-slate-500"> · {s.invoiceNumber}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.quoteNumber ? r.fromQuote(s.quoteNumber) : s.periodDate ? r.fromRecurring(formatDay(s.periodDate, locale)) : formatDate(s.createdAt, locale)}
                  </p>
                </div>
                <p className="shrink-0 font-bold tabular-nums text-slate-900 sm:hidden">{formatCurrency(s.total)}</p>
              </div>
              <p className="hidden shrink-0 font-bold tabular-nums text-slate-900 sm:block sm:w-28 sm:text-right">{formatCurrency(s.total)}</p>
              {canChange && (
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                  <button
                    type="button" className={cn(BTN.ghost, "text-slate-600 hover:bg-red-50 hover:text-red-700")}
                    aria-label={r.cancelAria(s.invoiceNumber)} disabled={cancel.isPending}
                    onClick={() => setVoiding(s)}
                  >
                    <Ban className="h-4 w-4" aria-hidden="true" /> {r.cancel}
                  </button>
                  <button
                    type="button" className={BTN.primary}
                    aria-label={r.collectAria(s.invoiceNumber)}
                    onClick={() => setCollecting(s)}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {r.collect}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length > FIRST_ROWS && (
        <button type="button" className={cn(BTN.ghost, "mt-1 w-full text-blue-700")} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? r.less : r.more(items.length - FIRST_ROWS)}
        </button>
      )}

      <Dialog open={collecting !== null} onOpenChange={(o) => { if (!o) setCollecting(null); }}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-md sm:rounded-2xl">
          {collecting && <CollectForm key={collecting.saleId} sale={collecting} onDone={() => setCollecting(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={voiding !== null} onOpenChange={(o) => { if (!o) setVoiding(null); }}>
        <AlertDialogContent className="bg-white sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">{voiding ? r.cancelTitle(voiding.invoiceNumber) : ""}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">{r.cancelText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10">{r.back}</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-red-600 text-white hover:bg-red-700 sm:h-10" onClick={() => { if (voiding) cancel.mutate({ saleId: voiding.saleId }); }}>
              {r.cancelConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function CollectForm({ sale, onDone }: { sale: Receivable; onDone: () => void }) {
  const t = useCopy(quotesCopy);
  const r = t.receivables;
  const refresh = useRefreshQuotes();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const collect = trpc.quotes.collect.useMutation({
    onSuccess: (res) => { toast.success(t.toasts.collected(res.invoiceNumber)); refresh(true); onDone(); },
    onError: (e) => toast.error(e.message || t.toasts.error),
  });
  const options: Array<{ value: PaymentMethod; label: string }> = [
    { value: "cash", label: t.paymentMethods.cash },
    { value: "zelle", label: t.paymentMethods.zelle },
    { value: "card", label: t.paymentMethods.card },
  ];

  return (
    <>
      <DialogHeader className="border-b border-slate-100 px-4 py-4 pr-12 text-left sm:px-6">
        <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{r.collectTitle(sale.invoiceNumber)}</DialogTitle>
        <DialogDescription className="text-sm text-slate-500">{r.collectText(formatCurrency(sale.total))}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <p className="min-w-0 truncate text-sm text-slate-700">{sale.customerName || t.quotes.noCustomer}</p>
          <p className="shrink-0 text-xl font-bold tabular-nums text-slate-900">{formatCurrency(sale.total)}</p>
        </div>
        <PaymentChoice legend={r.method} options={options} value={method} onChange={setMethod} />
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onDone} className={BTN.ghost}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {r.back}
        </button>
        <button type="button" className={BTN.primary} disabled={collect.isPending} onClick={() => collect.mutate({ saleId: sale.saleId, method })}>
          {collect.isPending ? r.working : r.confirm}
        </button>
      </div>
    </>
  );
}
