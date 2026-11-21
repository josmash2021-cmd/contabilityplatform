// The top of Gastos (.ex-top): "Por categoría" (tap a bar to filter the list), "Listo para impuestos"
// and "Límites del mes".
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { expensesCopy, spendCategoryLabel } from "@/i18n/copy/expenses";
import { limitState } from "../../../api/lib/expenses";
import type { SpendCategory } from "../../../api/lib/expenses";
import { CARD, H3, btn, fmt0 } from "./ui";
import { Dst, ProgressBar } from "./proto";
import type { Overview } from "./shared";

/** "Por categoría": one bar per category, biggest first; pressed = the list shows only that one. */
export function CategoryCard({ rows, selected, onSelect }: {
  rows: Overview["byCategory"];
  selected: SpendCategory | null;
  onSelect: (c: SpendCategory | null) => void;
}) {
  const t = useCopy(expensesCopy);
  const max = rows[0]?.total ?? 0;
  return (
    <section className={CARD} aria-labelledby="ex-cats">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="ex-cats" className={H3}>{t.categories.title}</h2>
        {rows.length > 0 && <span className="text-right text-xs text-slate-500">{t.categories.hint}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{t.categories.empty}</p>
      ) : (
        <div className="mt-3 grid gap-2.5">
          {rows.map((r) => {
            const label = spendCategoryLabel(t, r.category);
            const on = selected === r.category;
            return (
              <button
                key={r.category}
                type="button"
                aria-pressed={on}
                aria-label={t.categories.filterAria(label, fmt0(r.total))}
                onClick={() => onSelect(on ? null : r.category)}
                className={cn(
                  "grid min-h-11 w-full grid-cols-[minmax(0,110px)_minmax(0,1fr)_72px] items-center gap-2.5 rounded-lg px-1.5 py-[5px] text-left text-sm text-slate-900 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0 sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_80px]",
                  on && "bg-blue-50 hover:bg-blue-50",
                )}
              >
                <span className="min-w-0 break-words">{label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <span className="block h-full rounded-full bg-blue-600" style={{ width: `${max > 0 ? ((r.total / max) * 100).toFixed(1) : 0}%` }} />
                </span>
                <span className="text-right tabular-nums">{fmt0(r.total)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** "Listo para impuestos": how many of the month's expenses that need a receipt (not digital payments) have it. */
export function ReadyCard({ withReceipt, count }: { withReceipt: number; count: number }) {
  const t = useCopy(expensesCopy);
  const pct = count > 0 ? Math.round((withReceipt / count) * 100) : 0;
  const missing = count - withReceipt;
  return (
    <section className={CARD} aria-labelledby="ex-ready">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="ex-ready" className={H3}>{t.ready.title}</h2>
        {count > 0 && <Dst label={`${pct}%`} tone={missing ? "warn" : "good"} />}
      </div>
      {count === 0 ? (
        <p className="text-[13px] text-slate-500">{t.ready.empty}</p>
      ) : (
        <>
          <ProgressBar pct={pct} label={t.ready.progress} />
          <p className="mt-2 text-[13px] text-slate-500">{t.ready.text(withReceipt, count)}{missing ? t.ready.missing(missing) : t.ready.done}</p>
          <p className="mt-1 text-xs text-slate-400">{t.ready.digitalNote}</p>
        </>
      )}
    </section>
  );
}

/** "Límites del mes": spent against each limit; red past it (and says by how much), amber close to it. */
export function LimitsCard({ limits, canChange, onEdit }: { limits: Overview["limits"]; canChange: boolean; onEdit: () => void }) {
  const t = useCopy(expensesCopy);
  return (
    <section className={CARD} aria-labelledby="ex-limits">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="ex-limits" className={H3}>{t.limits.title}</h2>
        {canChange && limits.length > 0 && <button type="button" className={btn("ghost", "sm", "-my-1.5 text-blue-700")} onClick={onEdit}>{t.limits.edit}</button>}
      </div>
      {limits.length === 0 ? (
        <>
          <p className="text-[13px] text-slate-500">{t.limits.empty}</p>
          {canChange && <button type="button" className={btn("sm", "mt-3")} onClick={onEdit}>{t.limits.add}</button>}
        </>
      ) : (
        <div className="mt-1 grid gap-3">
          {limits.map((l) => {
            const label = spendCategoryLabel(t, l.category);
            const s = limitState(Math.round(l.used * 100), Math.round(l.limit * 100));
            return (
              <div key={l.category}>
                <div className="flex justify-between gap-2 text-[13px]">
                  <b className="font-semibold text-slate-900">{label}</b>
                  <span className={cn("tabular-nums", s.tone === "over" ? "text-red-600" : s.tone === "near" ? "text-amber-700" : "text-slate-500")}>
                    {t.limits.of(fmt0(l.used), fmt0(l.limit))}
                  </span>
                </div>
                <ProgressBar pct={s.pct} tone={s.tone === "over" ? "bad" : s.tone === "near" ? "warn" : "good"} label={t.limits.progress(label)} />
                {s.tone === "over" && <span className="mt-1 block text-xs text-red-600">{t.limits.over(s.overPct)}</span>}
                {s.tone === "near" && <span className="mt-1 block text-xs text-amber-700">{t.limits.near}</span>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
