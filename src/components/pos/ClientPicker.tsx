import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { Check, Search, UserRound, Users } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { PosSheet } from "./PosSheet";
import { customerName, norm, type CustomerRow } from "./posTypes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId?: number;
  onSelect: (c: { id: number; name: string } | undefined) => void;
  t: CobrarCopy["pos"];
  closeLabel: string;
};

/** Pick the sale's client (optional): the first ones by name, or search all of them. */
export function ClientPicker({ open, onOpenChange, selectedId, onSelect, t, closeLabel }: Props) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Same list as before the redesign; a search asks the server so clients past the first page show up too.
  const base = trpc.customers.list.useQuery({ type: "all" });
  const found = trpc.customers.list.useQuery({ type: "all", search: debounced }, { enabled: debounced.length > 0, placeholderData: keepPreviousData });

  const onType = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(v.trim()), 250);
  };

  const query = q.trim();
  const baseRows = (base.data ?? []) as CustomerRow[];
  const rows: CustomerRow[] = query
    ? (debounced && found.data ? (found.data as CustomerRow[]) : baseRows.filter((c) => norm(customerName(c)).includes(norm(query))))
    : baseRows;
  const loading = base.isLoading || (!!query && debounced !== query && rows.length === 0);

  const choose = (c: CustomerRow | undefined) => {
    onSelect(c ? { id: c.id, name: customerName(c) } : undefined);
    onOpenChange(false);
    setQ(""); setDebounced("");
  };

  return (
    <PosSheet open={open} onOpenChange={onOpenChange} title={t.clients.title} closeLabel={closeLabel} focusSheet>
      <label htmlFor="pos-client-search" className="block text-xs font-medium text-slate-500">{t.clients.search}</label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id="pos-client-search" type="search" value={q} placeholder={t.clients.searchPh} autoComplete="off"
          onChange={(e) => onType(e.target.value)}
          className="h-11 w-full rounded-[10px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:text-sm"
        />
      </div>

      <ul className="mt-3 divide-y divide-slate-100">
        {!query && (
          <li>
            <Row label={t.clients.none} sub={t.clients.noneSub} on={!selectedId} onClick={() => choose(undefined)} icon />
          </li>
        )}
        {loading
          ? Array.from({ length: 4 }, (_, i) => <li key={i} className="py-2"><Skeleton className="h-11 rounded-lg" /></li>)
          : rows.map((c) => (
            <li key={c.id}>
              <Row label={customerName(c)} sub={c.phone ?? undefined} on={c.id === selectedId} onClick={() => choose(c)} />
            </li>
          ))}
      </ul>

      {!loading && base.isError && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{t.clients.loadError}</p>}
      {!loading && !base.isError && rows.length === 0 && (
        query ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">{t.clients.noMatch(query)}</p>
        ) : (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-xl bg-slate-50 px-4 py-6 text-center">
            <Users className="h-6 w-6 text-slate-400" aria-hidden />
            <p className="text-sm text-slate-500">{t.clients.empty}</p>
            <Link to="/customers" className="inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t.clients.add}</Link>
          </div>
        )
      )}
    </PosSheet>
  );
}

function Row({ label, sub, on, onClick, icon }: { label: string; sub?: string; on: boolean; onClick: () => void; icon?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={on} className="flex min-h-[56px] w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${icon ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-700"}`} aria-hidden>
        {icon ? <UserRound className="h-4 w-4" /> : label.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{label}</span>
        {sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}
      </span>
      {on && <Check className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />}
    </button>
  );
}
