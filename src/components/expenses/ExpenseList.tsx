// The month's expenses (.slist with .srow.exp): date, who (with the merchant's logo), category and account,
// amount, receipt status and the action (Revisar / Subir recibo). Phones: who and amount, the status under the
// amount, the action below.
import { Link } from "react-router";
import { Camera, Loader2 } from "lucide-react";
import { MovementLogo } from "@/components/brand/MovementLogo";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { expensesCopy, spendCategoryLabel } from "@/i18n/copy/expenses";
import { btn, fmtMoney } from "./ui";
import { Dst } from "./proto";
import { shortDay, type SpendRow } from "./shared";

const GRID = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 md:grid-cols-[64px_minmax(0,1fr)_120px_140px_150px]";

type Props = {
  items: readonly SpendRow[];
  locale: string;
  /** "rec" tab: the sub line says when it's charged next. */
  showNext: boolean;
  emptyText: string;
  /** Owner with photos left: "Subir recibo" shows. */
  canUpload: boolean;
  attaching: string | null;
  onOpen: (item: SpendRow) => void;
  onUpload: (item: SpendRow) => void;
};

export function ExpenseList({ items, locale, showNext, emptyText, canUpload, attaching, onOpen, onUpload }: Props) {
  const t = useCopy(expensesCopy);
  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
      <div className={cn(GRID, "hidden bg-slate-100 px-4 py-[9px] text-xs font-semibold text-slate-500 md:grid")} aria-hidden="true">
        <span>{t.table.date}</span><span>{t.table.who}</span><span className="text-right">{t.table.amount}</span><span>{t.table.receipt}</span><span />
      </div>
      {items.length === 0 ? (
        <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500 first:border-t-0 md:first:border-t">{emptyText}</p>
      ) : (
        <ul>
          {items.map((i) => {
            const day = shortDay(i.date, locale);
            const where = i.account ?? (i.method ? t.method[i.method] : null);
            const sub = showNext && i.nextCharge
              ? [t.nextCharge(shortDay(i.nextCharge, locale)), where]
              : [spendCategoryLabel(t, i.category), i.detail, where];
            const subText = sub.filter(Boolean).join(" · ");
            const busy = attaching === i.key;
            return (
              <li
                key={i.key}
                className={cn(GRID, "cursor-pointer items-center border-t border-slate-200 px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-slate-50 md:first:border-t")}
                onClick={() => onOpen(i)}
              >
                <span className="hidden text-slate-500 md:block">{day}</span>
                <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 md:col-start-auto md:row-start-auto">
                  <MovementLogo name={i.who} logoUrl={i.logoUrl} accountId={i.bankAccountId} size={32} />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpen(i); }}
                      className="block max-w-full truncate rounded text-left font-[650] text-slate-900 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {i.who}
                    </button>
                    <span className="block truncate text-xs text-slate-500">
                      <span className="md:hidden">{day} · </span>{subText}
                    </span>
                  </div>
                </div>
                <span className="col-start-2 row-start-1 grid justify-items-end text-right md:col-start-auto md:row-start-auto">
                  <b className="font-bold tabular-nums text-slate-900">{fmtMoney(-i.amount)}</b>
                </span>
                <span className="col-start-2 row-start-2 justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start">
                  {i.inReview ? <Dst label={t.status.review} tone="open" /> : i.hasReceipt ? <Dst label={t.status.with} tone="good" /> : <Dst label={t.status.without} tone="warn" />}
                </span>
                <span className="col-span-2 flex justify-start gap-1.5 empty:hidden md:col-span-1 md:justify-end" onClick={(e) => e.stopPropagation()}>
                  {i.inReview ? (
                    <Link to="/transactions" className={btn("sm")} aria-label={t.actions.reviewAria(i.who)}>{t.actions.review}</Link>
                  ) : !i.hasReceipt && canUpload ? (
                    <button type="button" className={btn("sm")} disabled={!!attaching} onClick={() => onUpload(i)} aria-label={t.actions.uploadAria(i.who)}>
                      {busy ? <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden="true" /> : <Camera className="h-[15px] w-[15px]" aria-hidden="true" />}
                      {busy ? t.actions.uploading : t.actions.upload}
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
