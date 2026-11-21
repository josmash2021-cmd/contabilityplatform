import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Banknote, CreditCard, Send, type LucideIcon } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { PAYMENT_METHODS, errorText, type BillItem, type PaymentMethod } from "./shared";
import { BTN, FIELD, LABEL } from "./ui";

const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = { cash: Banknote, zelle: Send, card: CreditCard };

type Props = { bill: BillItem; today: string; onClose: () => void };

/** "Marcar pagada": how and when it was paid. The server records the expense with that date and method. */
export function PayBillDialog({ bill, today, onClose }: Props) {
  const copy = useCopy(vendorsCopy);
  const t = copy.payForm;
  const utils = trpc.useUtils();
  const uid = useId();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidDate, setPaidDate] = useState(today);
  const [dateError, setDateError] = useState<string | null>(null);

  const pay = trpc.vendors.bills.markPaid.useMutation({
    onSuccess: () => {
      toast.success(t.done);
      void utils.vendors.invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorText(e, copy.error)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return setDateError(copy.billForm.errors.due);
    if (paidDate > today) return setDateError(t.futureDate);
    setDateError(null);
    pay.mutate({ id: bill.id, paidDate, method });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pay.isPending) onClose(); }}>
      <DialogContent className="max-h-[100dvh] grid-cols-1 content-start overflow-y-auto bg-white sm:max-w-md sm:rounded-2xl">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{t.title}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            <span className="text-base font-semibold tabular-nums text-slate-900">{t.text(formatCurrency(bill.amount), bill.vendorName)}</span>
            <span className="block truncate text-xs text-slate-500">{bill.description}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend id={`${uid}-method`} className="mb-1.5 text-sm font-medium text-slate-700">{t.method}</legend>
            <RadioGroup
              value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}
              aria-labelledby={`${uid}-method`} className="grid grid-cols-3 gap-2"
            >
              {PAYMENT_METHODS.map((m) => {
                const Icon = METHOD_ICONS[m];
                const id = `${uid}-${m}`;
                return (
                  <Label
                    key={m} htmlFor={id}
                    className={cn(
                      "relative flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500",
                      method === m ? "border-blue-600 bg-blue-50 font-semibold text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <RadioGroupItem id={id} value={m} className="sr-only" />
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {copy.methods[m]}
                  </Label>
                );
              })}
            </RadioGroup>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-date`} className={LABEL}>{t.date}</Label>
            <Input
              className={FIELD}
              id={`${uid}-date`} type="date" value={paidDate} max={today} onChange={(e) => setPaidDate(e.target.value)}
              {...(dateError ? { "aria-invalid": true, "aria-describedby": `${uid}-date-error` } : {})}
            />
            {dateError && <p id={`${uid}-date-error`} className="text-xs text-red-600">{dateError}</p>}
          </div>

          <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{t.note}</p>

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" className={BTN.secondary} disabled={pay.isPending} onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" className={BTN.primary} disabled={pay.isPending}>{pay.isPending ? t.saving : t.confirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
