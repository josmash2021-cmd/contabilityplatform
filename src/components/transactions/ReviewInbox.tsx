import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CheckCheck, CheckCircle2, ListChecks, Loader2, Pencil, Tag } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { REVIEW_LIST_MAX, REVIEW_PAGE } from "../../../api/lib/bankReview";
import { CategoryDialog } from "./CategoryDialog";
import { accountLabel, categoryLabel, dayLabel, errorText, signedMoney, type MoneyType, type Movement } from "./shared";

type Props = {
  /** The owner (not a team member): may confirm and change. */
  canReview: boolean;
  onSeeAll: () => void;
  /** Something was confirmed or changed: the page updates its other lists. */
  onReviewed: (ids: number[], patch?: { category: string; type: MoneyType }) => void;
  onReopened: (ids: number[]) => void;
};

/** "Por revisar": the bank movements whose category the owner hasn't confirmed yet, newest first. */
export function ReviewInbox({ canReview, onSeeAll, onReviewed, onReopened }: Props) {
  const t = useCopy(movimientosCopy);
  const r = t.review;
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const [limit, setLimit] = useState(REVIEW_PAGE);
  const [editing, setEditing] = useState<Movement | null>(null);
  const [askAll, setAskAll] = useState(false);

  const key = { limit };
  const list = trpc.review.list.useQuery(key, { placeholderData: keepPreviousData });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  /** Take movements off the list right away; the server answer settles it. */
  const drop = (ids: number[]) => {
    utils.review.list.setData(key, (d) => d && { total: Math.max(0, d.total - ids.length), items: d.items.filter((i) => !ids.includes(i.id)) });
    utils.review.count.setData(undefined, (c) => c && { count: Math.max(0, c.count - ids.length) });
  };
  const refresh = () => Promise.all([utils.review.list.invalidate(), utils.review.count.invalidate()]);

  const reopen = trpc.review.reopen.useMutation({
    onSuccess: (_d, { ids }) => onReopened(ids),
    onError: (e) => toast.error(errorText(e, t.error)),
    onSettled: () => { void refresh(); },
  });

  const confirm = trpc.review.confirm.useMutation({
    onMutate: async ({ ids }) => {
      await utils.review.list.cancel();
      const before = utils.review.list.getData(key);
      drop(ids);
      return { before };
    },
    onSuccess: (_d, { ids }) => {
      onReviewed(ids);
      toast.success(ids.length === 1 ? r.confirmedOne : r.confirmedMany(ids.length), {
        action: { label: r.undo, onClick: () => reopen.mutate({ ids }) },
      });
    },
    onError: (e, _v, ctx) => {
      if (ctx?.before) utils.review.list.setData(key, ctx.before);
      toast.error(errorText(e, t.error));
    },
    onSettled: () => { void refresh(); },
  });

  const confirmAll = () => {
    const ids = items.map((i) => i.id);
    setAskAll(false);
    if (ids.length) confirm.mutate({ ids });
  };

  if (list.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-14 rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl sm:h-24" />)}
      </div>
    );
  }

  if (list.isError) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-700">{r.loadError}</p>
        <button onClick={() => void list.refetch()}
          className="mt-3 inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10">
          {t.retry}
        </button>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-7 w-7" aria-hidden /></span>
        <h2 className="mt-4 text-lg font-bold tracking-tight text-slate-900">{r.doneTitle}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{r.doneText}</p>
        <button onClick={onSeeAll}
          className="mt-5 inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10">
          {r.seeAll}
        </button>
      </section>
    );
  }

  const canLoadMore = items.length < total && limit < REVIEW_LIST_MAX;

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <span>{canReview ? r.intro : r.readOnly}</span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500" aria-live="polite">{r.showing(items.length, total)}</p>
        {canReview && items.length > 1 && (
          <button onClick={() => setAskAll(true)} disabled={confirm.isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 sm:h-10 sm:w-auto">
            <CheckCheck className="h-4 w-4" aria-hidden />{r.confirmAll(items.length)}
          </button>
        )}
      </div>

      <ul className="space-y-3">
        {items.map((item) => {
          const label = categoryLabel(item.category, t);
          const amount = signedMoney(item.amount, item.type);
          const income = item.type === "income";
          const busy = confirm.isPending && confirm.variables?.ids.includes(item.id);
          return (
            <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:flex sm:items-center sm:gap-5 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 min-w-0 break-words font-semibold text-slate-900">{item.description}</p>
                  <p className={cn("shrink-0 font-semibold tabular-nums sm:hidden", income ? "text-emerald-700" : "text-slate-900")}>{amount}</p>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span className="min-w-0 truncate">{[dayLabel(item.date, locale), accountLabel(item.bankName, item.accountNumber, t)].filter(Boolean).join(" · ")}</span>
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{r.suggested}:</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-800">
                      <Tag className="h-3 w-3" aria-hidden />{label}
                    </span>
                  </span>
                </div>
              </div>
              <p className={cn("hidden w-28 shrink-0 text-right font-semibold tabular-nums sm:block", income ? "text-emerald-700" : "text-slate-900")}>{amount}</p>
              {canReview && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0">
                  <button onClick={() => confirm.mutate({ ids: [item.id] })} disabled={busy} aria-label={r.okAria(item.description)}
                    className="inline-flex h-12 items-center justify-center gap-1.5 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:h-10">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{r.ok}
                  </button>
                  <button
                    onClick={() => setEditing({ id: item.id, description: item.description, amount: item.amount, type: item.type, category: item.category, date: item.date, plaidAmount: item.plaidAmount, importedFrom: item.importedFrom })}
                    aria-label={r.changeAria(item.description)}
                    className="inline-flex h-12 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10">
                    <Pencil className="h-4 w-4" aria-hidden />{r.change}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canLoadMore && (
        <button onClick={() => setLimit((n) => Math.min(REVIEW_LIST_MAX, n + REVIEW_PAGE))} disabled={list.isFetching}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60">
          {list.isFetching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{r.more}
        </button>
      )}

      {editing && (
        <CategoryDialog
          movement={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { drop([saved.id]); void refresh(); onReviewed([saved.id], { category: saved.category, type: saved.type }); }}
        />
      )}

      {askAll && (
        <AlertDialog open onOpenChange={(open) => { if (!open) setAskAll(false); }}>
          <AlertDialogContent className="bg-white sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base font-semibold text-slate-900">{r.confirmAllTitle(items.length)}</AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-slate-600">{r.confirmAllText}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="h-11 border-slate-200 sm:h-10">{r.cancel}</AlertDialogCancel>
              <button onClick={confirmAll}
                className="inline-flex h-11 items-center justify-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-10">
                {r.confirmAllYes}
              </button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
