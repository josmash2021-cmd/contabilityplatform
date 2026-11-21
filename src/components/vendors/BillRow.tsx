// One bill in the prototype's table (.srow.bill): vendor and concept, when it's due in words, the amount, its
// state, and "Marcar pagada" (+ edit / delete; "Marcar como no pagada" once paid).
// Phones: vendor and amount, then when it's due and its state, then the actions.
import { CheckCircle2, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { btn, fmtMoney } from "@/components/expenses/ui";
import { Dst } from "@/components/expenses/proto";
import { formatDay, type BillItem } from "./shared";
import { BILL_GRID } from "./ui";

type Props = {
  bill: BillItem;
  today: string;
  busy?: boolean;
  canChange: boolean;
  onVendor?: (vendorId: number) => void;
  /** Inside a narrow card (a vendor's page): the phone layout at every width. */
  compact?: boolean;
  onPay: (bill: BillItem) => void;
  onEdit: (bill: BillItem) => void;
  onDelete: (bill: BillItem) => void;
  onUnpay: (bill: BillItem) => void;
};

export function BillRow({ bill, today, busy, canChange, onVendor, compact, onPay, onEdit, onDelete, onUnpay }: Props) {
  const c = useCopy(vendorsCopy);
  const p = c.proto;
  const { lang } = useLang();
  const paid = bill.status === "paid";
  const days = bill.daysUntilDue ?? 0;
  const [dueText, dueTone] = paid
    ? [p.due.paidOn(formatDay(bill.paidAt, lang, today)), ""]
    : days < 0 ? [p.due.late(p.days(-days)), "text-red-600"]
      : days === 0 ? [p.due.today, "text-amber-700"]
        : days === 1 ? [p.due.tomorrow, "text-amber-700"]
          : [p.due.inDays(p.days(days), formatDay(bill.dueDate, lang, today)), ""];
  // Wide: the table's five columns from `md`; compact: two columns always (who | amount, due | state, actions).
  const md = (cls: string) => (compact ? "" : cls);
  const state = paid ? <Dst label={p.state.paid} tone="good" /> : days < 0 ? <Dst label={p.state.late} tone="bad" /> : <Dst label={p.state.open} tone="muted" />;

  return (
    <li className={cn(compact ? "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1" : BILL_GRID, "items-center border-t border-slate-200 px-4 py-3 text-sm first:border-t-0", md("md:first:border-t"))}>
      <div className="min-w-0">
        {onVendor ? (
          <button
            type="button" onClick={() => onVendor(bill.vendorId)}
            className="block max-w-full truncate rounded text-left font-[650] text-slate-900 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {bill.vendorName}
          </button>
        ) : (
          <b className="block truncate font-[650] text-slate-900">{bill.description}</b>
        )}
        {onVendor && <span className="block truncate text-xs text-slate-500">{bill.description}</span>}
      </div>
      <span className={cn("col-start-1 row-start-2 text-xs", md("md:col-start-auto md:row-start-auto md:text-[13px]"), dueTone)}>{dueText}</span>
      <span className={cn("col-start-2 row-start-1 text-right", md("md:col-start-auto md:row-start-auto"))}>
        <b className="font-bold tabular-nums text-slate-900">{fmtMoney(bill.amount)}</b>
      </span>
      <span className={cn("col-start-2 row-start-2 justify-self-end", md("md:col-start-auto md:row-start-auto md:justify-self-start"))}>{state}</span>
      <span className={cn("col-span-2 flex items-center justify-start gap-1.5 empty:hidden", md("md:col-span-1 md:justify-end"))}>
        {paid && bill.paymentMethod && <span className="text-xs text-slate-500">{c.methods[bill.paymentMethod]}</span>}
        {canChange && !paid && (
          <button type="button" className={btn("sm")} disabled={busy} onClick={() => onPay(bill)} aria-label={c.actions.payAria(bill.description, bill.vendorName)}>
            <CheckCircle2 className={cn("h-[15px] w-[15px]", md("md:hidden"))} aria-hidden="true" />{c.actions.pay}
          </button>
        )}
        {canChange && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={btn("sm", "icon", "w-11 sm:w-auto")} disabled={busy} aria-label={p.more(bill.description)}>
                <MoreHorizontal className="h-[15px] w-[15px]" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white">
              {!paid ? (
                <>
                  <DropdownMenuItem className="min-h-10" onSelect={() => onEdit(bill)}><Pencil className="h-4 w-4" aria-hidden="true" />{c.actions.edit}</DropdownMenuItem>
                  <DropdownMenuItem className="min-h-10 text-red-600 focus:text-red-700" onSelect={() => onDelete(bill)}><Trash2 className="h-4 w-4" aria-hidden="true" />{c.actions.delete}</DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem className="min-h-10" onSelect={() => onUnpay(bill)}><RotateCcw className="h-4 w-4" aria-hidden="true" />{c.actions.unpay}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
    </li>
  );
}
