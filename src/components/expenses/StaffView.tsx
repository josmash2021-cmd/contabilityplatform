// Gastos for a team employee (role "staff"): only the receipt photo and the month's receipts.
// Employees may read receipts.* and call receipts.create (api/lib/team.ts); nothing else is asked for here.
import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertCircle, Camera, Loader2, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { useCopy } from "@/i18n/useI18n";
import { expensesCopy, spendCategoryLabel } from "@/i18n/copy/expenses";
import { btn, fmtMoney } from "./ui";
import { Dst, MonthNav, PageHead } from "./proto";
import { shortDay, upperFirst, monthName, type ReceiptUsageOut } from "./shared";

type Props = {
  month: { year: number; month: number };
  thisMonth: { year: number; month: number };
  locale: string;
  usage: ReceiptUsageOut | undefined;
  busy: boolean;
  onPhoto: () => void;
  onMonth: (m: { year: number; month: number }) => void;
};

export function StaffView({ month, thisMonth, locale, usage, busy, onPhoto, onMonth }: Props) {
  const t = useCopy(expensesCopy);
  const list = trpc.receipts.list.useQuery(month, { placeholderData: keepPreviousData });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const blocked = usage ? !usage.canUpload : false;
  const isCurrent = month.year === thisMonth.year && month.month === thisMonth.month;
  const shift = (d: number) => {
    const i = month.year * 12 + month.month - 1 + d;
    onMonth({ year: Math.floor(i / 12), month: (i % 12) + 1 });
  };

  return (
    <>
      <PageHead
        title={t.title}
        sub={t.staff.sub}
        right={(
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {usage && usage.cap !== null && <span className="text-[13px] text-slate-500">{t.quota(Math.min(usage.used, usage.cap), usage.cap)}</span>}
            <button type="button" className={btn("primary", "w-full sm:w-auto")} onClick={onPhoto} disabled={busy || blocked}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}{t.actions.photo}
            </button>
          </div>
        )}
      />
      {blocked && <p className="mb-3 text-[13px] text-amber-700">{t.staff.cap}</p>}
      <p className="mb-2 flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{t.form.pickHint}
      </p>

      <div className="mb-1 mt-[18px] flex flex-wrap items-end justify-between gap-x-3 border-b border-slate-200">
        <h2 className="pb-3 pt-2.5 text-sm font-semibold text-slate-900">{t.staff.list}</h2>
        <MonthNav
          groupLabel={t.month.label} label={upperFirst(monthName(month.year, month.month, locale, true))}
          prevLabel={t.month.prev} nextLabel={t.month.next} currentLabel={t.month.current}
          canPrev={month.year > 2000} canNext={!isCurrent} isCurrent={isCurrent}
          onPrev={() => shift(-1)} onNext={() => shift(1)} onCurrent={() => onMonth(thisMonth)}
        />
      </div>

      {list.isLoading ? (
        <div className="grid gap-2" role="status" aria-label={t.loading}>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-[14px]" />)}</div>
      ) : list.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-red-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm text-slate-900" role="alert"><AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />{t.error}</p>
          <button type="button" className={btn("sm")} onClick={() => void list.refetch()}>{t.retry}</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">{t.staff.empty}</p>
          ) : (
            <ul>
              {items.map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-t border-slate-200 px-4 py-3 text-sm first:border-t-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <MerchantLogo name={r.merchant} size={32} />
                    <div className="min-w-0">
                      <b className="block truncate font-[650] text-slate-900">{r.merchant}</b>
                      <span className="block truncate text-xs text-slate-500">{shortDay(r.date, locale)} · {spendCategoryLabel(t, r.category)} · {t.method[r.paymentMethod]}</span>
                    </div>
                  </div>
                  <div className="grid justify-items-end gap-1">
                    <b className="font-bold tabular-nums text-slate-900">{fmtMoney(-r.amount)}</b>
                    <Dst label={t.status.with} tone="good" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
