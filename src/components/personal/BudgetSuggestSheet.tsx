import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { budgetsCopy } from "@/i18n/copy/budgets";
import { money } from "./personalUtils";
import { listNames, useCatLabel } from "./txKit";
import { pbtn, pbtnPrimary } from "./planKit";

const fmt0 = (n: number) => money(Math.round(n));

/**
 * The prototype's "Presupuesto sugerido" (pbSugPanel): for each category, today's limit, what was spent on
 * average in the last 3 months (personal.suggestBudgets, months with bank data only) and the suggestion
 * rounded up to $10. "Usar este presupuesto" saves them all (personal.applyBudgets), with undo.
 */
export function BudgetSuggestSheet({ year, month, onClose, onApplied }: { year: number; month: number; onClose: () => void; onApplied: () => void }) {
  const t = useCopy(budgetsCopy).p;
  const locale = intlLocale(useLang().lang);
  const catLabel = useCatLabel();
  const q = trpc.personal.suggestBudgets.useQuery({ year, month }, { staleTime: 5 * 60_000 });
  const apply = trpc.personal.applyBudgets.useMutation({ onError: (e) => toast.error(e.message) });

  const rows = q.data?.rows ?? [];
  const usable = rows.filter((r) => r.suggested !== null);
  const now = rows.reduce((s, r) => s + (r.current ?? 0), 0);
  const avg = rows.reduce((s, r) => s + (r.average ?? 0), 0);
  const tot = rows.reduce((s, r) => s + (r.suggested ?? 0), 0);
  const monthNames = (q.data?.months ?? []).map((m) => new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString(locale, { month: "long", timeZone: "UTC" }));
  const changed = usable.filter((r) => r.suggested !== r.current);

  const use = () => {
    if (changed.length === 0) { onClose(); return; }
    const before = changed.map((r) => ({ category: r.category, limit: r.current }));
    apply.mutate({ year, month, limits: changed.map((r) => ({ category: r.category, limit: r.suggested })) }, {
      onSuccess: () => {
        onApplied();
        onClose();
        toast.success(t.sug.applied(fmt0(tot)), { action: { label: t.undo, onClick: () => apply.mutate({ year, month, limits: before }, { onSuccess: onApplied }) } });
      },
    });
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-slate-200 px-5 py-4">
          <SheetTitle className="text-base font-bold text-slate-900">{t.sug.title}</SheetTitle>
          <SheetDescription className="text-sm text-slate-500">
            {q.data && q.data.used > 0 ? t.sug.sub(listNames(monthNames, t.and)) : q.isLoading ? t.sug.loading : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 py-5">
          {q.isLoading ? (
            <div className="space-y-2" role="status" aria-label={t.sug.loading}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
          ) : q.isError ? (
            <p className="text-sm text-red-600" role="alert">{t.sug.error}</p>
          ) : !q.data || q.data.used === 0 || rows.length === 0 ? (
            <p className="rounded-[10px] bg-slate-100 px-3 py-3 text-sm text-slate-700">{t.sug.none}</p>
          ) : (
            <>
              <table className="w-full border-collapse text-[13px] sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th scope="col" className="py-2 pr-2 font-semibold">{t.sug.cols.cat}</th>
                    <th scope="col" className="py-2 pr-2 text-right font-semibold">{t.sug.cols.now}</th>
                    <th scope="col" className="py-2 pr-2 text-right font-semibold">{t.sug.cols.avg}</th>
                    <th scope="col" className="py-2 text-right font-semibold">{t.sug.cols.sug}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dir = r.suggested !== null && r.current !== null ? (r.suggested > r.current ? "up" : r.suggested < r.current ? "down" : "") : "";
                    return (
                      <tr key={r.category} className="border-b border-slate-100">
                        <td className="py-2.5 pr-2 text-slate-900">{catLabel(r.category, "expense")}</td>
                        <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">{r.current !== null ? fmt0(r.current) : "—"}</td>
                        <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">{r.average !== null ? fmt0(r.average) : "—"}</td>
                        <td className={cn("py-2.5 text-right tabular-nums", dir === "up" ? "text-amber-700" : dir === "down" ? "text-emerald-600" : "text-slate-900")}>
                          <b>{r.suggested !== null ? fmt0(r.suggested) : "—"}</b>
                          {dir && <span className="sr-only"> ({dir === "up" ? t.sug.up : t.sug.down})</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold text-slate-900">
                    <td className="py-2.5 pr-2">{t.sug.total}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">{fmt0(now)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">{fmt0(avg)}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmt0(tot)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="mt-2.5 text-sm text-slate-500">{tot < now ? t.sug.less(fmt0(now - tot)) : tot > now ? t.sug.more(fmt0(tot - now)) : t.sug.same}</p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <button type="button" onClick={use} disabled={apply.isPending} className={pbtnPrimary}>
                  {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t.sug.use}
                </button>
                <button type="button" onClick={onClose} className={pbtn}>{t.sug.keep}</button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
