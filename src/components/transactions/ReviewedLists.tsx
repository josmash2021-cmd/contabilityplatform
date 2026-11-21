import { toast } from "sonner";
import { CheckCircle2, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { useCopy } from "@/i18n/useI18n";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { categoryLabel, errorText, money } from "./shared";
import { transferTarget } from "../../../api/lib/banks";

const item = "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-slate-100 px-3 py-[11px]";

function Loading() {
  return <div className="space-y-2 rounded-[14px] border border-slate-200 bg-white p-4" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;
}
function Failed({ onRetry }: { onRetry: () => void }) {
  const t = useCopy(movimientosCopy);
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-6 text-center">
      <p className="text-sm text-slate-700">{t.error}</p>
      <button type="button" onClick={onRetry} className="mt-3 inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10">{t.retry}</button>
    </div>
  );
}
const Empty = ({ text }: { text: string }) => <div className="rounded-[14px] border border-dashed border-slate-200 px-4 py-9 text-center text-slate-500">{text}</div>;

/** "Revisados hoy": what the owner approved, changed, linked, split or answered today. */
export function DoneList({ since }: { since: string }) {
  const t = useCopy(movimientosCopy);
  const r = t.rv;
  const q = trpc.review.done.useQuery({ since });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed onRetry={() => void q.refetch()} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <Empty text={r.doneEmpty} />;
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-4">
      <ul className="grid gap-2">
        {rows.map((x) => {
          const isTransfer = x.action === "transfer";
          const cat = isTransfer ? null : x.parts.length ? x.parts.map((p) => `${categoryLabel(p.category, t)} ${money(p.amount)}`).join(" + ") : categoryLabel(x.category, t);
          // A transfer says where the money went ("Transferencia a Way2save Savings ••8492").
          const target = isTransfer ? transferTarget(x.description) : null;
          const name = !isTransfer ? x.who : target ? (x.type === "income" ? r.transferFrom(target) : r.transferTo(target)) : r.betweenAccounts;
          return (
            <li key={x.id} className={item}>
              <MerchantLogo name={name} logoUrl={isTransfer ? null : x.logoUrl} size={22} fallback={<span className="grid w-[22px] place-items-center text-emerald-600"><CheckCircle2 className="h-5 w-5" aria-hidden /></span>} />
              <div className="min-w-0">
                <b className="block truncate text-sm font-[650] text-slate-900">{name}</b>
                <span className="block truncate text-xs text-slate-500">{[r.how[x.action] ?? r.how.approved, cat].filter(Boolean).join(" · ")}</span>
              </div>
              <span className="text-sm font-bold tabular-nums text-slate-900">{x.type === "income" ? "+" : "−"}{money(x.amount)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Excluidos": left out of the reports (duplicates, transfers between accounts, others), with "Restaurar". */
export function ExcludedList({ canReview, onRestored }: { canReview: boolean; onRestored: () => void }) {
  const t = useCopy(movimientosCopy);
  const r = t.rv;
  const utils = trpc.useUtils();
  const q = trpc.review.excluded.useQuery();
  const restore = trpc.review.reopen.useMutation({
    onSuccess: (_d, v) => {
      const who = q.data?.find((x) => x.id === v.ids[0])?.who ?? "";
      toast.success(r.tRestored(who));
      void utils.review.excluded.invalidate();
      void utils.review.list.invalidate();
      void utils.review.count.invalidate();
      onRestored();
    },
    onError: (e) => toast.error(errorText(e, t.error)),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed onRetry={() => void q.refetch()} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <Empty text={r.excludedEmpty} />;
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-4">
      <ul className="grid gap-2">
        {rows.map((x) => (
          <li key={x.id} className={item}>
            <MerchantLogo name={x.who} logoUrl={x.logoUrl} size={22} fallback={<span className="grid w-[22px] place-items-center text-amber-700"><X className="h-5 w-5" aria-hidden /></span>} />
            <div className="min-w-0">
              <b className="block truncate text-sm font-[650] text-slate-900">{x.who}</b>
              <span className="block truncate text-xs text-slate-500">{r.reasons[x.reason] ?? r.reasons.other} · {r.excludedMeta(`${x.type === "income" ? "+" : "−"}${money(x.amount)}`)}</span>
            </div>
            {canReview && (
              <button type="button" onClick={() => restore.mutate({ ids: [x.id] })} disabled={restore.isPending && restore.variables?.ids[0] === x.id}
                className="inline-flex min-h-11 items-center rounded-[10px] border border-slate-200 bg-white px-[11px] text-[13px] font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-45 sm:min-h-[34px]">
                {r.restore}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
