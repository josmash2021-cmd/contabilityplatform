// Admin · Usuarios (and Bloqueados): everyone with their status in a colored chip, filters (En prueba, Pagan,
// Pago no pasó…), search, Excel, and "Ver" opens the person's card. ?q= searches, ?estado= picks the filter.
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { adminCopy } from "@/i18n/copy/admin";
import { cn } from "@/lib/utils";
import { AdminUserList } from "@/components/admin/AdminUserList";
import { AdminUserSheet } from "@/components/admin/AdminUserSheet";

type Filter = "all" | "trial" | "paying" | "failed" | "canceled" | "free" | "blocked";
const FILTERS: Filter[] = ["all", "trial", "paying", "failed", "canceled", "free"];
const PER_PAGE = 25;

export default function AdminUsers({ blocked = false }: { blocked?: boolean }) {
  const t = useCopy(adminCopy);
  const { lang } = useLang();
  const utils = trpc.useUtils();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const estado = (params.get("estado") as Filter | null) ?? "all";
  const filter: Filter = blocked ? "blocked" : FILTERS.includes(estado) ? estado : "all";
  const [draft, setDraft] = useState(q);
  const [mode, setMode] = useState<"all" | "business" | "personal">("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);

  const { data } = trpc.admin.listUsers.useQuery(
    { page, limit: PER_PAGE, search: q || undefined, mode, status: filter },
    { placeholderData: keepPreviousData, refetchInterval: 20_000, refetchOnWindowFocus: true },
  );
  const total = data?.pagination.total ?? 0;
  const pages = Math.max(1, data?.pagination.totalPages ?? 1);

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
    setPage(1);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); setParam("q", draft.trim() || null); };
  const excel = () => {
    void utils.admin.exportUsers.fetch().then((r) => {
      const url = URL.createObjectURL(new Blob(["﻿" + r.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-5 px-4 py-6 sm:px-8 sm:py-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-0.5">
          <h1 className="text-[26px] font-extrabold tracking-tight">{blocked ? t.list.blockedTitle : t.list.title}</h1>
          <p className="text-slate-500">{t.list.subtitle(total)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <form onSubmit={submit} role="search" className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15">
            <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} type="search" placeholder={t.home.search} aria-label={t.home.search} className="w-[180px] bg-transparent sm:w-[220px] text-sm outline-none placeholder:text-slate-400" />
          </form>
          <button type="button" onClick={excel} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold hover:bg-slate-50">
            <Download className="h-4 w-4" aria-hidden="true" />{t.list.excel}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!blocked && (
          <div role="group" aria-label={t.list.filter} className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setParam("estado", f === "all" ? null : f)}
                className={cn("h-9 rounded-[9px] px-3 text-[13px] transition-[background-color,color,box-shadow] duration-200", filter === f ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
                {t.list[f]}
              </button>
            ))}
          </div>
        )}
        <div role="group" aria-label={t.cols.kind} className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(["all", "business", "personal"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setPage(1); }}
              className={cn("h-9 rounded-[9px] px-3 text-[13px] transition-[background-color,color,box-shadow] duration-200", mode === m ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
              {m === "all" ? t.list.allKinds : t.list[m]}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-[18px] border border-slate-200 bg-white px-4 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-20px_rgba(15,23,42,0.25)] sm:p-4">
        <AdminUserList users={data?.users ?? []} onOpen={setOpen} t={t} lang={lang} />
        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 pt-3">
            <span className="text-[13px] text-slate-500">{t.list.page(page, pages)}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-9 rounded-[10px] border border-slate-200 px-3 text-[13px] font-semibold disabled:opacity-40">{t.list.prev}</button>
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="h-9 rounded-[10px] border border-slate-200 px-3 text-[13px] font-semibold disabled:opacity-40">{t.list.next}</button>
            </div>
          </div>
        )}
      </section>

      <AdminUserSheet userId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
