import { Link } from "react-router";
import { AlertCircle, Calculator, Plus, Search, Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { money, num, type ServiceRow } from "./posTypes";

type Props = {
  services: ServiceRow[];
  /** True when the user has no services at all (not just none matching the search). */
  noServices: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  retryLabel: string;
  search: string;
  onSearch: (q: string) => void;
  qtyById: Map<number, number>;
  onPick: (s: ServiceRow) => void;
  onFree: () => void;
  /** The owner can edit the list; an employee can't open Servicios. */
  canManage: boolean;
  t: CobrarCopy["pos"];
};

/** Search and pick: tiles on bigger screens, a list on the phone. */
export function ServicePicker({ services, noServices, loading, error, onRetry, retryLabel, search, onSearch, qtyById, onPick, onFree, canManage, t }: Props) {
  if (!loading && !error && noServices) return <NoServices canManage={canManage} onFree={onFree} t={t} />;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="pos-services">
      <div className="flex items-center justify-between gap-3">
        <h2 id="pos-services" className="font-semibold text-slate-900">{t.servicesTitle}</h2>
        {canManage && <Link to="/services" className="inline-flex min-h-[44px] items-center text-sm font-medium text-blue-600 hover:underline lg:min-h-0">{t.manage}</Link>}
      </div>

      <label htmlFor="pos-search" className="mt-2 block text-xs font-medium text-slate-500">{t.search}</label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id="pos-search" type="search" value={search} placeholder={t.searchPh} autoComplete="off"
          onChange={(e) => onSearch(e.target.value)}
          className="h-11 w-full rounded-[10px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:text-sm"
        />
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl sm:h-[120px] sm:rounded-2xl" />)}
        </div>
      ) : error ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-red-50 px-4 py-6 text-center text-sm text-red-800">
          <AlertCircle className="h-5 w-5 text-red-600" aria-hidden />
          <p>{t.loadError}</p>
          <button onClick={onRetry} className="inline-flex h-11 items-center rounded-[10px] border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-100">{retryLabel}</button>
        </div>
      ) : (
        <>
          {services.length === 0 && search.trim() && (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{t.noMatch(search.trim())}</p>
          )}
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
            {services.map((s) => (
              <li key={s.id}><ServiceTile s={s} qty={qtyById.get(s.id) ?? 0} onPick={onPick} t={t} /></li>
            ))}
            <li>
              <button
                onClick={onFree}
                className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-left text-slate-600 transition hover:border-blue-400 hover:bg-blue-50/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-full sm:min-h-[120px] sm:flex-col sm:items-start sm:justify-between sm:rounded-2xl sm:p-4"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Calculator className="h-5 w-5" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{t.freeAmountTile}</span>
                  <span className="block text-xs text-slate-500">{t.freeAmountTileSub}</span>
                </span>
              </button>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}

function ServiceTile({ s, qty, onPick, t }: { s: ServiceRow; qty: number; onPick: (s: ServiceRow) => void; t: CobrarCopy["pos"] }) {
  const price = num(s.price);
  const inSale = qty > 0;
  return (
    <button
      onClick={() => onPick(s)}
      className={`relative flex min-h-[64px] w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-full sm:min-h-[120px] sm:flex-col sm:items-stretch sm:justify-between sm:rounded-2xl sm:p-4 ${
        inSale ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3 sm:items-start">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${inSale ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"}`} aria-hidden>
          {(s.name || "?").trim().charAt(0).toUpperCase() || <Wrench className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">{s.name}</span>
          {s.description && <span className="mt-0.5 block truncate text-xs text-slate-500">{s.description}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 sm:justify-between">
        <span className={`text-right tabular-nums sm:text-left ${price > 0 ? "text-base font-bold text-slate-900 sm:text-lg" : "text-xs font-medium text-slate-500"}`}>
          {price > 0 ? money(price) : t.variable}
        </span>
        {inSale ? (
          <span className="grid h-8 min-w-8 place-items-center rounded-full bg-blue-600 px-2 text-sm font-bold tabular-nums text-white">
            <span aria-hidden>×{qty}</span><span className="sr-only">{t.inSale(qty)}</span>
          </span>
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600" aria-hidden><Plus className="h-4 w-4" /></span>
        )}
      </span>
    </button>
  );
}

function NoServices({ canManage, onFree, t }: { canManage: boolean; onFree: () => void; t: CobrarCopy["pos"] }) {
  return (
    <section className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center sm:py-14" aria-labelledby="pos-empty">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Wrench className="h-7 w-7" aria-hidden /></span>
      <h2 id="pos-empty" className="mt-4 text-lg font-semibold text-slate-900">{t.empty.title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{canManage ? t.empty.text : t.empty.staff}</p>
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        {canManage && (
          <Link to="/services" className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" aria-hidden />{t.empty.cta}
          </Link>
        )}
        <p className="mt-2 text-xs text-slate-500">{t.empty.orFree}</p>
        <button onClick={onFree} className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Calculator className="h-4 w-4" aria-hidden />{t.freeAmount}
        </button>
      </div>
    </section>
  );
}
