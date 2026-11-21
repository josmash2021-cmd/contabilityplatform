import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Ban, HandCoins } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { quotesCopy } from "@/i18n/copy/quotes";
import type { PaymentMethod } from "../../../api/lib/quotes";
import { PaymentChoice } from "./PaymentChoice";
import { formatDate, formatDay, useRefreshQuotes, type Receivable } from "./shared";

/** Rows shown before "show more". */
const FIRST_ROWS = 4;

/** Pending sales from quotes and recurring invoices, to mark as paid (or void). Hidden when there are none. */
export function Receivables({ items }: { items: readonly Receivable[] }) {
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

  if (items.length === 0) return null;
  const sum = items.reduce((s, i) => s + Math.round(i.total * 100), 0) / 100;
  const shown = expanded ? items : items.slice(0, FIRST_ROWS);

  return (
    <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100" aria-hidden="true">
              <HandCoins className="h-4 w-4 text-neutral-600" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-black">{r.title}</h2>
              <p className="text-[11px] text-neutral-500">{r.text}</p>
            </div>
          </div>
          <p className="text-sm font-semibold text-black">{r.summary(items.length, formatCurrency(sum))}</p>
        </div>

        <ul className="mt-3 divide-y divide-neutral-100">
          {shown.map((s) => (
            <li key={s.saleId} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm text-black">
                  <span className="font-medium">{s.invoiceNumber}</span>
                  {s.customerName ? ` · ${s.customerName}` : ""}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {s.quoteNumber ? r.fromQuote(s.quoteNumber) : s.periodDate ? r.fromRecurring(formatDay(s.periodDate, locale)) : formatDate(s.createdAt, locale)}
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                <p className="text-sm font-semibold text-black">{formatCurrency(s.total)}</p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost" size="sm" className="h-8 text-xs text-neutral-500 hover:text-red-600"
                    aria-label={r.cancelAria(s.invoiceNumber)} disabled={cancel.isPending}
                    onClick={() => setVoiding(s)}
                  >
                    <Ban className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {r.cancel}
                  </Button>
                  <Button
                    size="sm" className="h-8 bg-black text-xs text-white hover:bg-neutral-800"
                    aria-label={r.collectAria(s.invoiceNumber)}
                    onClick={() => setCollecting(s)}
                  >
                    {r.collect}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {items.length > FIRST_ROWS && (
          <Button variant="ghost" size="sm" className="mt-1 h-8 w-full text-xs text-neutral-600" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? r.less : r.more(items.length - FIRST_ROWS)}
          </Button>
        )}
      </CardContent>

      <Dialog open={collecting !== null} onOpenChange={(o) => { if (!o) setCollecting(null); }}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          {collecting && <CollectForm key={collecting.saleId} sale={collecting} onDone={() => setCollecting(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={voiding !== null} onOpenChange={(o) => { if (!o) setVoiding(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{voiding ? r.cancelTitle(voiding.invoiceNumber) : ""}</AlertDialogTitle>
            <AlertDialogDescription>{r.cancelText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{r.back}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => { if (voiding) cancel.mutate({ saleId: voiding.saleId }); }}>
              {r.cancelConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
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
      <DialogHeader className="border-b border-neutral-100 px-4 py-3 pr-12 text-left sm:px-6">
        <DialogTitle className="text-base">{r.collectTitle(sale.invoiceNumber)}</DialogTitle>
        <DialogDescription className="text-xs">{r.collectText(formatCurrency(sale.total))}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
          <p className="min-w-0 truncate text-sm text-neutral-700">{sale.customerName || t.quotes.noCustomer}</p>
          <p className="shrink-0 text-lg font-semibold text-black">{formatCurrency(sale.total)}</p>
        </div>
        <PaymentChoice legend={r.method} options={options} value={method} onChange={setMethod} />
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-100 bg-white px-4 py-3 sm:px-6">
        <Button variant="ghost" onClick={onDone} className="text-neutral-600">
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> {r.back}
        </Button>
        <Button className="bg-black text-white hover:bg-neutral-800" disabled={collect.isPending} onClick={() => collect.mutate({ saleId: sale.saleId, method })}>
          {collect.isPending ? r.working : r.confirm}
        </Button>
      </div>
    </>
  );
}
