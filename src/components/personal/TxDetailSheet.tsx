import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, List, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { personalPagesCopy } from "@/i18n/copy/personalPages";
import { categoriesFor } from "../../../api/lib/bankReview";
import { AccountLogo, TxLogo } from "./TxLogo";
import { accountLabel, dayLabel, institutionOf, isNew, smBtn, useCatLabel, type Days, type Institution, type TxRow } from "./txKit";
import { money, type YearMonth } from "./personalUtils";

type AccountLite = { id: number; bankName?: string | null; name?: string | null; nickname?: string | null; accountNumber?: string | null; mask?: string | null };

/**
 * The prototype's movement panel (ptxDetail) for a bank movement: who, when, how much, the account, the bank's
 * own text, whether it's still new, and its category. Changing the category (review.setCategory) or keeping it
 * (review.confirm) is the same review the business screen uses; budgets follow the category. Mount it per row.
 */
export function TxDetailSheet({ row, onClose, monthRows, accounts, institutions, days, locale, period }: {
  row: TxRow;
  onClose: () => void;
  monthRows: readonly TxRow[];
  accounts: readonly AccountLite[];
  institutions: readonly Institution[] | undefined;
  days: Days;
  locale: string;
  period: YearMonth;
}) {
  const all = useCopy(personalPagesCopy);
  const t = all.tx;
  const d = t.detail;
  const catLabel = useCatLabel();
  const utils = trpc.useUtils();
  const [category, setCategory] = useState(row.category);
  const [type, setType] = useState(row.type);
  const [fresh, setFresh] = useState(isNew(row, days));

  const refresh = () => Promise.all([
    utils.bank.getMonthData.invalidate(), utils.review.count.invalidate(), utils.review.list.invalidate(),
    utils.personal.listBudgets.invalidate(), utils.bank.listByCategory.invalidate(),
  ]);
  const setCat = trpc.review.setCategory.useMutation({
    onSuccess: (r) => {
      setCategory(r.category); setType(r.type); setFresh(false);
      toast.success(d.changed(row.name, catLabel(r.category, r.type)));
      void refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const confirm = trpc.review.confirm.useMutation({
    onSuccess: () => { setFresh(false); toast.success(d.confirmedOne); void refresh(); },
    onError: (e) => toast.error(e.message),
  });

  const acc = accounts.find((a) => a.id === row.accountId);
  const inst = institutionOf(institutions, row.accountId);
  const acctText = acc ? accountLabel(acc, all.shared.accountFallback) : accountLabel({ bankName: row.bankName, accountNumber: row.accountNumber }, all.shared.accountFallback);
  const same = monthRows.filter((x) => !x.manual && x.name.toLowerCase() === row.name.toLowerCase());
  const sameOut = same.reduce((s, x) => s + (x.isIn ? 0 : x.amount), 0);
  const options = [...new Set([...categoriesFor(type === "income" ? "income" : "expense"), category])];
  const busy = setCat.isPending || confirm.isPending;
  const isIn = type === "income";

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 px-5 py-4">
          <SheetTitle className="text-base font-bold text-slate-900">{d.title}</SheetTitle>
          <SheetDescription className="sr-only">{row.raw}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <TxLogo row={{ ...row, category, type }} size={46} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold text-slate-900">{row.name}</p>
              <p className="text-[13px] text-slate-500">{dayLabel(row.day, row.date, days, locale, { today: t.today, yesterday: t.yesterday })}</p>
            </div>
            <p className={cn("shrink-0 text-2xl font-extrabold tabular-nums tracking-tight", isIn ? "text-emerald-600" : "text-slate-900")}>
              {isIn ? "+" : "−"}{money(row.amount, true)}
            </p>
          </div>

          <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-slate-500">{d.account}</dt>
              <dd className="flex min-w-0 items-center gap-1.5 font-medium text-slate-900">
                <AccountLogo inst={inst} fallbackName={row.bankName ?? acctText} size={18} /><span className="truncate">{acctText}</span>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
              <dt className="shrink-0 text-slate-500">{d.raw}</dt>
              <dd className="min-w-0 break-words text-right font-medium text-slate-900">{row.raw}</dd>
            </div>
            {row.id !== null && <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-slate-500">{d.status}</dt>
              <dd className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold", fresh ? "text-blue-600" : "text-emerald-600")}>
                <i className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />{fresh ? d.statusNew : d.statusOk}
              </dd>
            </div>}
          </dl>

          <section aria-labelledby="txd-cat">
            <h3 id="txd-cat" className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{d.category}</h3>
            {row.id === null ? (
              <p className="mt-2 rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-600">{d.notSaved}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">{d.categoryHint}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {options.map((c) => {
                    const on = c === category;
                    return (
                      <button key={c} type="button" aria-pressed={on} disabled={busy} data-guide={`cat-${c}`}
                        onClick={() => { if (!on && row.id !== null) setCat.mutate({ id: row.id, category: c }); }}
                        className={cn(smBtn, "min-h-10", on && "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-50")}>
                        {catLabel(c, type)}
                      </button>
                    );
                  })}
                </div>
                {fresh && (
                  <button type="button" onClick={() => { if (row.id !== null) confirm.mutate({ ids: [row.id] }); }} disabled={busy}
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                    {confirm.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{d.confirm}
                  </button>
                )}
              </>
            )}
          </section>

          {same.length > 1 && (
            <p className="flex items-start gap-2.5 rounded-[10px] bg-slate-100 px-3 py-2.5 text-[13px] text-slate-700">
              <List className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
              <span>{d.same(same.length, row.name, sameOut > 0 ? money(sameOut, true) : "")}</span>
            </p>
          )}

          <Link to={`/personal/category/${encodeURIComponent(category)}?month=${period.m}&year=${period.y}`} onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
            {d.seeAll(catLabel(category, type))}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
