import { AlertTriangle, CalendarClock, CheckCircle2, Clock, MoreVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { formatDay, timingText, type BillItem } from "./shared";
import { BTN } from "./ui";

const TIMING_STYLE: Record<BillItem["timing"], { badge: string; icon: typeof Clock }> = {
  overdue: { badge: "bg-red-50 text-red-700 ring-1 ring-red-200", icon: AlertTriangle },
  dueToday: { badge: "bg-amber-50 text-amber-800 ring-1 ring-amber-200", icon: CalendarClock },
  dueSoon: { badge: "bg-amber-50 text-amber-800 ring-1 ring-amber-200", icon: CalendarClock },
  later: { badge: "bg-slate-100 text-slate-600", icon: Clock },
  paid: { badge: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
};

type Props = {
  bill: BillItem;
  today: string;
  /** Hide the vendor's name (inside the vendor's own detail). */
  hideVendor?: boolean;
  busy?: boolean;
  /** False for a read-only team member (the accountant): no actions. */
  canChange?: boolean;
  onPay: (bill: BillItem) => void;
  onEdit: (bill: BillItem) => void;
  onDelete: (bill: BillItem) => void;
  onUnpay: (bill: BillItem) => void;
};

/** One bill: who, what, how much, and where it stands ("Vencida hace 3 días" in words, not only in red). */
export function BillCard({ bill, today, hideVendor, busy, canChange = true, onPay, onEdit, onDelete, onUnpay }: Props) {
  const t = useCopy(vendorsCopy);
  const { lang } = useLang();
  const style = TIMING_STYLE[bill.timing];
  const Icon = style.icon;
  const overdue = bill.timing === "overdue";
  const paid = bill.status === "paid";
  const title = hideVendor ? bill.description : bill.vendorName;
  const subtitle = hideVendor ? null : bill.description;

  return (
    <li className={cn("rounded-2xl border bg-white p-4", overdue ? "border-red-200" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">
            {title}
            {!hideVendor && bill.vendorArchived && <span className="ml-1 text-xs font-normal text-slate-500">({t.archivedVendor})</span>}
          </p>
          {subtitle && <p className="truncate text-sm text-slate-500">{subtitle}</p>}
        </div>
        <p className={cn("shrink-0 text-lg font-bold tabular-nums tracking-tight", paid ? "text-slate-500" : overdue ? "text-red-700" : "text-slate-900")}>
          {formatCurrency(bill.amount)}
        </p>
      </div>

      {bill.notes && <p className="mt-1 line-clamp-2 break-words text-xs text-slate-500">{bill.notes}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", style.badge)}>
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {timingText(bill, t, lang, today)}
          </span>
          {paid && bill.expenseId && <span className="text-xs text-slate-500">{t.expenseLinked}</span>}
        </div>

        {canChange && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {!paid && (
              <button
                type="button" className={cn(BTN.primary, "flex-1 sm:flex-none")}
                aria-label={t.actions.payAria(bill.description, bill.vendorName)}
                disabled={busy}
                onClick={() => onPay(bill)}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t.actions.pay}
              </button>
            )}
            {/* Not modal: the dialogs it opens manage focus and scrolling themselves. */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button" className={cn(BTN.secondary, "w-11 shrink-0 px-0 sm:w-10", paid && "ml-auto")}
                  aria-label={t.actions.more(bill.description)} disabled={busy}
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white">
                {!paid ? (
                  <>
                    <DropdownMenuItem className="min-h-10" onSelect={() => onEdit(bill)}><Pencil className="h-4 w-4" aria-hidden="true" />{t.actions.edit}</DropdownMenuItem>
                    <DropdownMenuItem className="min-h-10 text-red-600 focus:text-red-700" onSelect={() => onDelete(bill)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />{t.actions.delete}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem className="min-h-10" onSelect={() => onUnpay(bill)}><RotateCcw className="h-4 w-4" aria-hidden="true" />{t.actions.unpay}</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {paid && (
        <p className="mt-2 text-xs text-slate-500">{t.dueWas(formatDay(bill.dueDate, lang, today))}</p>
      )}
    </li>
  );
}
