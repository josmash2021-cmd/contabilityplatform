import { AlertTriangle, CalendarClock, CheckCircle2, Clock, MoreVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { formatDay, timingText, type BillItem } from "./shared";

const TIMING_STYLE: Record<BillItem["timing"], { badge: string; icon: typeof Clock }> = {
  overdue: { badge: "bg-red-50 text-red-700", icon: AlertTriangle },
  dueToday: { badge: "bg-amber-50 text-amber-800", icon: CalendarClock },
  dueSoon: { badge: "bg-amber-50 text-amber-800", icon: CalendarClock },
  later: { badge: "bg-neutral-100 text-neutral-600", icon: Clock },
  paid: { badge: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
};

type Props = {
  bill: BillItem;
  today: string;
  /** Hide the vendor's name (inside the vendor's own detail). */
  hideVendor?: boolean;
  busy?: boolean;
  onPay: (bill: BillItem) => void;
  onEdit: (bill: BillItem) => void;
  onDelete: (bill: BillItem) => void;
  onUnpay: (bill: BillItem) => void;
};

/** One bill: who, what, how much, and where it stands ("Vencida hace 3 días" in words, not only in red). */
export function BillCard({ bill, today, hideVendor, busy, onPay, onEdit, onDelete, onUnpay }: Props) {
  const t = useCopy(vendorsCopy);
  const { lang } = useLang();
  const style = TIMING_STYLE[bill.timing];
  const Icon = style.icon;
  const overdue = bill.timing === "overdue";
  const title = hideVendor ? bill.description : bill.vendorName;
  const subtitle = hideVendor ? null : bill.description;

  return (
    <li className={cn("rounded-xl border bg-white p-3 sm:p-4", overdue ? "border-red-200" : "border-neutral-200")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-black">
            {title}
            {!hideVendor && bill.vendorArchived && <span className="ml-1 text-[11px] font-normal text-neutral-400">({t.archivedVendor})</span>}
          </p>
          {subtitle && <p className="truncate text-xs text-neutral-500">{subtitle}</p>}
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-black">{formatCurrency(bill.amount)}</p>
      </div>

      {bill.notes && <p className="mt-1 line-clamp-2 break-words text-xs text-neutral-500">{bill.notes}</p>}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", style.badge)}>
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {timingText(bill, t, lang, today)}
          </span>
          {bill.status === "paid" && bill.expenseId && <span className="text-[11px] text-neutral-500">{t.expenseLinked}</span>}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {bill.status === "unpaid" && (
            <Button
              size="sm" className="h-8 bg-black text-white hover:bg-neutral-800"
              aria-label={t.actions.payAria(bill.description, bill.vendorName)}
              disabled={busy}
              onClick={() => onPay(bill)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t.actions.pay}
            </Button>
          )}
          {/* Not modal: the dialogs it opens manage focus and scrolling themselves. */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-500" aria-label={t.actions.more(bill.description)} disabled={busy}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white">
              {bill.status === "unpaid" ? (
                <>
                  <DropdownMenuItem onSelect={() => onEdit(bill)}><Pencil className="h-4 w-4" aria-hidden="true" />{t.actions.edit}</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => onDelete(bill)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />{t.actions.delete}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onSelect={() => onUnpay(bill)}><RotateCcw className="h-4 w-4" aria-hidden="true" />{t.actions.unpay}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bill.status === "paid" && (
        <p className="mt-1 text-[11px] text-neutral-400">{t.dueWas(formatDay(bill.dueDate, lang, today))}</p>
      )}
    </li>
  );
}
