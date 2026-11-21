import { useDeferredValue, useId, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, FileSpreadsheet, Loader2, Pencil, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { ImportCustomersDialog } from "@/components/customers/ImportCustomersDialog";
import { fullName, initials, matchesSearch, money, type Customer } from "@/components/customers/customerUtils";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { clientesCopy } from "@/i18n/copy/clientes";

const pad = (n: number) => String(n).padStart(2, "0");
/** The server returns at most 200 per page (customers.list). */
const PAGE = 200;

type Bought = { total: number; salesCount: number };

/** 2.0 Clientes: search, list (cards on phone, table on desktop), create/edit dialog, delete with confirm, Excel import. */
export default function Customers() {
  const t = useCopy(clientesCopy);
  const locale = intlLocale(useLang().lang);
  const searchId = useId();
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const [dialog, setDialog] = useState<{ open: boolean; customer: Customer | null }>({ open: false, customer: null });
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // ── Who can do what (api/lib/team.ts): staff create and edit, only the owner deletes and imports, the accountant only reads ──
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const roleKnown = membership !== undefined;
  const role = membership?.role ?? null;
  const canEdit = role !== "accountant";
  const canDelete = roleKnown && role === null;
  const canImport = roleKnown && role === null;

  const utils = trpc.useUtils();
  const list = trpc.customers.list.useQuery({ type: "all", limit: PAGE });
  const { data: stats } = trpc.customers.stats.useQuery();
  const loaded = useMemo(() => (list.data ?? []) as Customer[], [list.data]);
  const total = Math.max(Number(stats?.total ?? 0), loaded.length);

  // Over 200 clients: the name search also asks the server, so nobody is out of reach.
  const searchServer = query.length > 0 && total > loaded.length;
  const remote = trpc.customers.list.useQuery({ type: "all", search: query, limit: PAGE }, { enabled: searchServer });

  // What each client has bought: only where the plan includes reports by client (Negocio) and the role can read reports.
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 60_000 });
  const showBought = roleKnown && role !== "staff" && !!plan?.features.includes("clientReports");
  const today = useMemo(() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }, []);
  const { data: report } = trpc.reports.byClient.useQuery({ startDate: "2000-01-01", endDate: today }, { enabled: showBought, staleTime: 60_000, retry: false });
  const bought = useMemo(() => {
    const m = new Map<number, Bought>();
    for (const r of report?.rows ?? []) if (r.customerId != null) m.set(r.customerId, { total: r.total, salesCount: r.salesCount });
    return m;
  }, [report]);

  const shown = useMemo(() => {
    if (!query) return loaded;
    const local = loaded.filter((c) => matchesSearch(c, query));
    const seen = new Set(local.map((c) => c.id));
    const extra = ((remote.data ?? []) as Customer[]).filter((c) => !seen.has(c.id));
    return [...local, ...extra];
  }, [loaded, query, remote.data]);

  const del = trpc.customers.delete.useMutation({
    onSuccess: () => {
      void utils.customers.list.invalidate();
      void utils.customers.stats.invalidate();
      toast.success(t.toast.deleted);
      setToDelete(null);
      setDialog({ open: false, customer: null });
    },
    onError: (err) => toast.error(err.message),
  });

  const openNew = () => setDialog({ open: true, customer: null });
  const openClient = (c: Customer) => setDialog({ open: true, customer: c });
  const since = (c: Customer) => t.since(new Date(c.createdAt).toLocaleDateString(locale, { month: "short", year: "numeric" }));

  const isEmpty = list.isSuccess && total === 0 && loaded.length === 0;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{list.isLoading ? " " : t.count(total)}</p>
          </div>
          {(canImport || canEdit) && !isEmpty && (
            <div className="flex w-full gap-2 sm:w-auto">
              {canImport && (
                <button onClick={() => setImportOpen(true)}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:h-10 sm:flex-none">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />{t.importExcel}
                </button>
              )}
              {canEdit && (
                <button onClick={openNew}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:h-10 sm:flex-none">
                  <UserPlus className="h-4 w-4" />{t.newClient}
                </button>
              )}
            </div>
          )}
        </header>

        {!isEmpty && (
          <div className="max-w-md">
            <label htmlFor={searchId} className="mb-1.5 block text-sm font-medium text-slate-700">{t.searchLabel}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id={searchId} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPh} autoComplete="off"
                className="h-11 w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-11 text-base text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:text-sm [&::-webkit-search-cancel-button]:hidden" />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label={t.clearSearch}
                  className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-r-[10px] text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {list.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        ) : list.isError ? (
          <section className="rounded-2xl border border-red-200 bg-white p-5 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
            <p className="mt-2 text-sm font-medium text-slate-900">{t.loadError}</p>
            <button onClick={() => void list.refetch()} className="mt-3 inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:h-10">{t.retry}</button>
          </section>
        ) : isEmpty ? (
          <EmptyState canEdit={canEdit} canImport={canImport} onNew={openNew} onImport={() => setImportOpen(true)} />
        ) : shown.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
            {searchServer && remote.isFetching ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /> : (
              <>
                <p className="text-sm text-slate-600">{t.noResults(query)}</p>
                <button onClick={() => setSearch("")} className="mt-3 inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:h-10">{t.clearSearch}</button>
              </>
            )}
          </section>
        ) : (
          <>
            {/* Phone: cards */}
            <ul className="space-y-2 md:hidden">
              {shown.map((c) => {
                const b = bought.get(c.id);
                const contact = [c.phone, c.email].filter(Boolean).join(" · ");
                return (
                  <li key={c.id}>
                    <button onClick={() => openClient(c)}
                      className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <Avatar c={c} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-900">{fullName(c)}</span>
                        <span className="block truncate text-xs text-slate-500">{contact || t.noPhone}</span>
                        {showBought && <span className="mt-0.5 block truncate text-xs font-medium tabular-nums text-slate-700">{b ? t.bought(money(b.total), b.salesCount) : t.noBuys}</span>}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="w-[32%] px-4 py-3 font-medium">{t.table.name}</th>
                    <th scope="col" className="w-[18%] px-4 py-3 font-medium">{t.table.phone}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t.table.email}</th>
                    {showBought && <th scope="col" className="w-[18%] px-4 py-3 text-right font-medium">{t.table.bought}</th>}
                    <th scope="col" className="w-[104px] px-4 py-3"><span className="sr-only">{t.table.actions}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((c) => {
                    const name = fullName(c);
                    const b = bought.get(c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <button onClick={() => openClient(c)} className="flex w-full min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                            <Avatar c={c} />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-900 hover:text-blue-700">{name}</span>
                              <span className="block truncate text-xs text-slate-500">{since(c)}</span>
                            </span>
                          </button>
                        </td>
                        <td className="truncate px-4 py-3 tabular-nums text-slate-700">{c.phone || <Missing label={t.noPhone} />}</td>
                        <td className="truncate px-4 py-3 text-slate-700">{c.email || <Missing label={t.noEmail} />}</td>
                        {showBought && (
                          <td className="px-4 py-3 text-right tabular-nums">
                            {b ? (
                              <>
                                <span className="block font-semibold text-slate-900">{money(b.total)}</span>
                                <span className="block text-xs text-slate-500">{t.purchases(b.salesCount)}</span>
                              </>
                            ) : <span className="text-slate-400">{t.noBuys}</span>}
                          </td>
                        )}
                        <td className="px-2 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openClient(c)} aria-label={canEdit ? t.edit(name) : t.view(name)} title={canEdit ? t.edit(name) : t.view(name)}
                              className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                              {canEdit ? <Pencil className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                            {canDelete && (
                              <button onClick={() => setToDelete(c)} aria-label={t.remove(name)} title={t.remove(name)}
                                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!query && total > loaded.length && <p className="text-xs text-slate-500">{t.showing(loaded.length, total)}</p>}
          </>
        )}
      </div>

      <CustomerDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        customer={dialog.customer}
        canEdit={canEdit}
        canDelete={canDelete}
        onDelete={setToDelete}
      />

      {canImport && <ImportCustomersDialog open={importOpen} onOpenChange={setImportOpen} />}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => { if (!open && !del.isPending) setToDelete(null); }}>
        <AlertDialogContent className="bg-white sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">{toDelete ? t.del.title(fullName(toDelete)) : ""}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">{t.del.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10" disabled={del.isPending}>{t.del.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (toDelete) del.mutate({ id: toDelete.id }); }}
              disabled={del.isPending}
              className="h-11 bg-red-600 text-white hover:bg-red-700 sm:h-10">
              {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {del.isPending ? t.del.deleting : t.del.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatedPage>
  );
}

function Avatar({ c }: { c: Customer }) {
  return <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">{initials(c)}</span>;
}

function Missing({ label }: { label: string }) {
  return <span className="text-slate-400"><span aria-hidden>—</span><span className="sr-only">{label}</span></span>;
}

function EmptyState({ canEdit, canImport, onNew, onImport }: { canEdit: boolean; canImport: boolean; onNew: () => void; onImport: () => void }) {
  const t = useCopy(clientesCopy);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center sm:py-14">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Users className="h-7 w-7" /></span>
      <h2 className="mt-4 text-lg font-bold tracking-tight text-slate-900">{canEdit ? t.empty.title : t.empty.readOnlyTitle}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">{canEdit ? t.empty.text : t.empty.readOnlyText}</p>
      {canEdit && (
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          <button onClick={onNew} className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
            <UserPlus className="h-4 w-4" />{t.empty.add}
          </button>
          {canImport && (
            <button onClick={onImport} className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />{t.importExcel}
            </button>
          )}
        </div>
      )}
      {canImport && <p className="mt-3 text-xs text-slate-500">{t.empty.importHint}</p>}
    </section>
  );
}
