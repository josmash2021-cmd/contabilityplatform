import { Link } from "react-router";
import { AlertCircle, Calculator, Plus, Search, Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { stockState } from "../../../api/lib/ventas";
import { SEARCH_BOX, SEARCH_INPUT, btn } from "./ui";
import { money, num, type ServiceRow } from "./posTypes";

type Props = {
  services: ServiceRow[];
  /** The catalog is empty (not just the search). */
  noServices: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  retryLabel: string;
  search: string;
  onSearch: (v: string) => void;
  qtyById: Map<number, number>;
  onPick: (s: ServiceRow) => void;
  onFree: () => void;
  canManage: boolean;
  t: CobrarCopy["pos"];
};

/** The prototype's left column: "Busca un servicio" and the tiles (`.posgrid` / `.tile` / `.qbadge`). */
export function ServiceTiles({ services, noServices, loading, error, onRetry, retryLabel, search, onSearch, qtyById, onPick, onFree, canManage, t }: Props) {
  if (loading) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-2.5 h-11 rounded-xl" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[14px] border border-red-200 bg-white px-5 py-10 text-center">
        <AlertCircle className="h-6 w-6 text-red-600" aria-hidden />
        <p className="text-sm text-slate-700">{t.loadError}</p>
        <button type="button" onClick={onRetry} className={btn()}>{retryLabel}</button>
      </div>
    );
  }
  if (noServices) {
    return (
      <div className="flex flex-col items-center rounded-[14px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Wrench className="h-6 w-6" aria-hidden /></span>
        <b className="mt-3 text-base text-slate-900">{t.empty.title}</b>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{canManage ? t.empty.text : t.empty.staff}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {canManage && <Link to="/services" className={btn("primary")}><Plus className="h-4 w-4" aria-hidden />{t.empty.cta}</Link>}
          <button type="button" onClick={onFree} className={btn()}><Calculator className="h-4 w-4" aria-hidden />{t.freeAmount}</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t.empty.orFree}</p>
      </div>
    );
  }
  const q = search.trim();
  return (
    <div className="min-w-0">
      <label className={cn(SEARCH_BOX, "mb-2.5")}>
        <Search className="h-[18px] w-[18px] flex-none" aria-hidden />
        <input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t.search} aria-label={t.search} autoComplete="off" className={SEARCH_INPUT} />
      </label>
      {services.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">{t.noMatch(q)}</p>
      ) : (
        <div className="grid grid-cols-2 content-start gap-2.5 lg:grid-cols-3">
          {services.map((s) => {
            const inCart = qtyById.get(s.id) ?? 0;
            const price = num(s.price);
            const st = stockState(!!s.trackStock, s.stock ?? 0);
            return (
              <button
                key={s.id} type="button" onClick={() => onPick(s)}
                aria-label={inCart ? `${s.name}, ${money(price)}, ${t.cart.qty(s.name, inCart)}` : undefined}
                className="relative grid min-h-[88px] content-start gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-4 text-left transition hover:border-blue-600 hover:shadow-[0_6px_18px_-10px_rgba(37,99,235,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.98]"
              >
                {inCart > 0 && (
                  <span className="absolute right-2 top-2 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-blue-600 px-1.5 text-xs font-bold tabular-nums text-white" aria-hidden>{inCart}</span>
                )}
                <b className={cn("text-sm font-[650] text-slate-900 [overflow-wrap:anywhere]", inCart > 0 && "pr-6")}>{s.name}</b>
                <span className="text-[13px] tabular-nums text-slate-500">
                  {price > 0 ? money(price) : t.variable}
                  {st === "low" && <span className="font-semibold text-amber-700"> · {t.stockLeft(s.stock ?? 0)}</span>}
                  {st === "out" && <span className="font-semibold text-red-600"> · {t.stockOut}</span>}
                  {st === "ok" && <span> · {t.stockLeft(s.stock ?? 0)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
