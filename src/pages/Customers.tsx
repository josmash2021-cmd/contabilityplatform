import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertCircle, Loader2, Search, Upload, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { CustomerDetail } from "@/components/customers/CustomerDetail";
import { ImportCustomersDialog } from "@/components/customers/ImportCustomersDialog";
import { firstName, fullName, matchesSearch, messageLink, type Customer } from "@/components/customers/customerUtils";
import { Note, PageHead, SegTabs } from "@/components/pos/proto";
import { FOCUS, SEARCH_BOX, SEARCH_INPUT, SLIST, SROW_HEAD, btn } from "@/components/pos/ui";
import { DEVICE_TZ, money0C, moneyC, shortDay } from "@/components/pos/posTypes";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { clientesCopy } from "@/i18n/copy/clientes";

/** The server returns at most 200 per page (customers.list). */
const PAGE = 200;

type Tab = "all" | "owe" | "late" | "idle";
type Stats = { billedYearCents: number | null; owedCents: number; late: boolean; lastVisit: string | null; idle: boolean };
type Row = Pick<Customer, "id" | "name" | "lastName" | "phone" | "email"> & { s: Stats | undefined };

/**
 * Clientes (the prototype's `customers` screen): who owes you, who's late, who stopped coming;
 * each client's card at `?c=<id>`; `?new=1` opens the new-client form (from "+ Nuevo").
 */
export default function Customers() {
  const t = useCopy(clientesCopy);
  const locale = intlLocale(useLang().lang);
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get("c")) || 0;
  const wantNew = params.get("new") === "1";

  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const [tab, setTab] = useState<Tab>("all");
  const [dialog, setDialog] = useState<{ open: boolean; customer: Customer | null }>({ open: false, customer: null });
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // ── Who can do what (api/lib/team.ts): staff create and edit, only the owner deletes and imports, the accountant only reads ──
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const roleKnown = membership !== undefined;
  const role = !roleKnown ? null : membership === null ? "owner" : membership.role;
  const canEdit = roleKnown && role !== "accountant";
  const canImport = role === "owner";
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 60_000 });
  const { data: settings } = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const company = settings?.companyName?.trim() || "";

  // "+ Nuevo" → /customers?new=1 opens the form once (adjusting state while rendering, then the URL drops the flag).
  const [newHandled, setNewHandled] = useState(false);
  if (wantNew && !newHandled && roleKnown) {
    setNewHandled(true);
    if (canEdit) setDialog({ open: true, customer: null });
  }
  if (!wantNew && newHandled) setNewHandled(false);
  useEffect(() => {
    if (!wantNew || !roleKnown) return;
    setParams((p) => { const n = new URLSearchParams(p); n.delete("new"); return n; }, { replace: true });
  }, [wantNew, roleKnown, setParams]);

  const utils = trpc.useUtils();
  const list = trpc.customers.list.useQuery({ type: "all", limit: PAGE });
  const { data: stats } = trpc.customers.stats.useQuery();
  const ov = trpc.customers.overview.useQuery({ timeZone: DEVICE_TZ });
  const loaded = useMemo(() => (list.data ?? []) as Customer[], [list.data]);
  const total = Math.max(Number(stats?.total ?? 0), loaded.length);

  // Over 200 clients: the name search also asks the server, so nobody is out of reach.
  const searchServer = query.length > 0 && total > loaded.length;
  const remote = trpc.customers.list.useQuery({ type: "all", search: query, limit: PAGE }, { enabled: searchServer });

  const statsById = useMemo(() => new Map((ov.data?.rows ?? []).map((r) => [r.customerId, r])), [ov.data]);
  const canSeeBilled = !!ov.data?.canSeeBilled;
  const today = ov.data?.today ?? "";

  const rows: Row[] = useMemo(() => {
    if (tab === "all") {
      let base = loaded;
      if (query) {
        const local = loaded.filter((c) => matchesSearch(c, query));
        const seen = new Set(local.map((c) => c.id));
        base = [...local, ...((remote.data ?? []) as Customer[]).filter((c) => !seen.has(c.id))];
      }
      return base.map((c) => ({ id: c.id, name: c.name, lastName: c.lastName, phone: c.phone, email: c.email, s: statsById.get(c.id) }));
    }
    // The other groups come whole from the server's numbers (every client with sales is there).
    const pick = (ov.data?.rows ?? []).filter((r) => (tab === "owe" ? r.owedCents > 0 : tab === "late" ? r.late : r.idle));
    pick.sort((a, b) => (tab === "idle" ? (a.lastVisit ?? "").localeCompare(b.lastVisit ?? "") : b.owedCents - a.owedCents));
    return pick
      .map((r) => ({ id: r.customerId, name: r.name, lastName: r.lastName, phone: r.phone, email: r.email, s: r }))
      .filter((r) => !query || matchesSearch(r, query));
  }, [tab, loaded, query, remote.data, statsById, ov.data]);

  const del = trpc.customers.delete.useMutation({
    onSuccess: () => {
      void utils.customers.list.invalidate();
      void utils.customers.stats.invalidate();
      void utils.customers.overview.invalidate();
      toast.success(t.toast.deleted);
      setToDelete(null);
      if (openId) closeDetail();
    },
    onError: (err) => toast.error(err.message),
  });

  const scrollTop = () => document.querySelector("main")?.scrollTo({ top: 0 });
  const openDetail = (id: number) => { setParams((p) => { const n = new URLSearchParams(p); n.set("c", String(id)); return n; }); scrollTop(); };
  function closeDetail() { setParams((p) => { const n = new URLSearchParams(p); n.delete("c"); return n; }); scrollTop(); }
  const openNew = () => setDialog({ open: true, customer: null });

  const isEmpty = list.isSuccess && total === 0 && loaded.length === 0;
  const totals = ov.data?.totals;
  const sub = list.isLoading ? " " : t.sub(total, totals && totals.owedCents > 0 ? money0C(totals.owedCents) : null, ov.data?.top?.name ?? null);
  const idle = ov.data?.idle;
  const winback = idle ? messageLink(idle, t.msg.winback(firstName(idle), company), company) : null;
  const cols = canSeeBilled
    ? "md:grid-cols-[minmax(0,1fr)_130px_130px_110px_110px]"
    : "md:grid-cols-[minmax(0,1fr)_130px_110px_110px]";

  const dialogs = (
    <>
      <CustomerDialog
        open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} customer={dialog.customer}
        onCreated={(id) => { if (!openId) openDetail(id); }}
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
              disabled={del.isPending} className="h-11 bg-red-600 text-white hover:bg-red-700 sm:h-10"
            >
              {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {del.isPending ? t.del.deleting : t.del.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (openId) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <CustomerDetail
            id={openId} role={role} features={plan?.features ?? []} company={company} locale={locale}
            onBack={closeDetail} onEdit={(c) => setDialog({ open: true, customer: c })} onDelete={setToDelete}
          />
        </div>
        {dialogs}
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHead
          title={t.title}
          sub={sub}
          right={(canImport || canEdit) && !isEmpty ? (
            <div className="flex flex-wrap gap-1.5">
              {canImport && <button type="button" onClick={() => setImportOpen(true)} className={btn()}><Upload className="h-4 w-4" aria-hidden />{t.importExcel}</button>}
              {canEdit && <button type="button" onClick={openNew} className={btn("primary")}>{t.newClient}</button>}
            </div>
          ) : undefined}
        />

        {idle && (
          <Note action={winback && canEdit ? <a href={winback} target="_blank" rel="noopener noreferrer" className={btn("sm")}>{t.writeTo}</a> : undefined}>
            {t.idleTip(idle.name, shortDay(idle.lastVisit, locale, today))}
          </Note>
        )}

        {list.isLoading ? (
          <div className={cn(SLIST, "mt-[18px]")} aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="border-t border-slate-200 px-4 py-3 first:border-t-0"><Skeleton className="h-10 rounded-lg" /></div>)}
          </div>
        ) : list.isError ? (
          <section className="mt-[18px] rounded-[14px] border border-red-200 bg-white p-5 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-red-600" aria-hidden />
            <p className="mt-2 text-sm font-medium text-slate-900">{t.loadError}</p>
            <button type="button" onClick={() => void list.refetch()} className={cn(btn(), "mt-3")}>{t.retry}</button>
          </section>
        ) : isEmpty ? (
          <EmptyState canEdit={canEdit} canImport={canImport} onNew={openNew} onImport={() => setImportOpen(true)} />
        ) : (
          <>
            <SegTabs
              label={t.tabsLabel} value={tab} onChange={setTab}
              items={[
                { value: "all", label: t.tabs.all, count: total },
                { value: "owe", label: t.tabs.owe, count: totals?.oweCount ?? 0 },
                { value: "late", label: t.tabs.late, count: totals?.lateCount ?? 0 },
                { value: "idle", label: t.tabs.idle, count: totals?.idleCount ?? 0 },
              ]}
            />

            {total > 8 && (
              <label className={cn(SEARCH_BOX, "mt-3 max-w-sm")}>
                <Search className="h-[18px] w-[18px] flex-none" aria-hidden />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPh} aria-label={t.searchLabel} autoComplete="off" className={SEARCH_INPUT} />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label={t.clearSearch} className={`-mr-2 grid h-11 w-11 place-items-center text-slate-400 hover:text-slate-700 ${FOCUS}`}><X className="h-4 w-4" aria-hidden /></button>
                )}
              </label>
            )}

            <div className={cn(SLIST, "mt-3")}>
              <div className={cn("hidden gap-x-3.5 md:grid", cols, SROW_HEAD)} aria-hidden>
                <span>{t.cols.client}</span>
                {canSeeBilled && <span className="text-right">{t.cols.billed}</span>}
                <span className="text-right">{t.cols.owes}</span>
                <span className="text-right">{t.cols.last}</span>
                <span />
              </div>
              {rows.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500">
                  {searchServer && remote.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : query ? t.noResults(query) : t.noneInGroup}
                </div>
              ) : (
                <ul>
                  {rows.map((r) => (
                    <CustomerRow
                      key={r.id} r={r} cols={cols} canSeeBilled={canSeeBilled} canMessage={canEdit} company={company}
                      locale={locale} today={today} loadingStats={ov.isLoading} onOpen={() => openDetail(r.id)}
                    />
                  ))}
                </ul>
              )}
            </div>

            {tab === "all" && !query && total > loaded.length && <p className="mt-2 text-xs text-slate-500">{t.showing(loaded.length, total)}</p>}
          </>
        )}
      </div>
      {dialogs}
    </AnimatedPage>
  );
}

/** One `.srow.cust`: who and how to reach them; billed this year; what they owe; last visit; Recordar / Escribirle. */
function CustomerRow({ r, cols, canSeeBilled, canMessage, company, locale, today, loadingStats, onOpen }: {
  r: Row; cols: string; canSeeBilled: boolean; canMessage: boolean; company: string; locale: string; today: string; loadingStats: boolean; onOpen: () => void;
}) {
  const t = useCopy(clientesCopy);
  const name = fullName(r);
  const s = r.s;
  const owes = s?.owedCents ?? 0;
  const contact = [r.phone, r.email].filter(Boolean).join(" · ");
  const remind = owes > 0 ? messageLink(r, t.msg.remind(firstName(r), moneyC(owes), company), t.msg.remindSubject(company)) : null;
  const winback = !owes && s?.idle ? messageLink(r, t.msg.winback(firstName(r), company), company) : null;
  const action = canMessage ? (remind ? { href: remind, label: t.remind } : winback ? { href: winback, label: t.writeTo } : null) : null;

  return (
    <li
      onClick={onOpen}
      className={cn("grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-t border-slate-200 px-4 py-3 text-sm transition first:border-t-0 hover:bg-slate-100", cols)}
    >
      <div className="col-start-1 row-start-1 min-w-0">
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className={`max-w-full truncate text-left font-[650] text-slate-900 hover:text-blue-600 ${FOCUS}`}>{name}</button>
        <span className="block truncate text-xs text-slate-500">{contact || "—"}</span>
      </div>
      {canSeeBilled && <span className="hidden text-right tabular-nums text-slate-900 md:block">{s?.billedYearCents != null ? money0C(s.billedYearCents) : "$0"}</span>}
      <span className="col-start-2 row-start-1 grid justify-items-end text-right md:col-auto md:row-auto">
        {loadingStats ? <Skeleton className="h-4 w-14 rounded" /> : owes > 0 ? (
          <>
            <b className={cn("tabular-nums", s?.late ? "text-red-600" : "text-slate-900")}>{moneyC(owes)}</b>
            {s?.late && <span className="text-xs font-medium text-red-600">{t.lateWord}</span>}
          </>
        ) : <span className="text-slate-500">{t.upToDate}</span>}
      </span>
      <span className={cn("hidden text-right md:block", s?.idle ? "text-amber-700" : "text-slate-500")}>{s?.lastVisit ? shortDay(s.lastVisit, locale, today) : t.never}</span>
      <span className={cn("col-start-2 row-start-2 flex justify-end md:col-auto md:row-auto", !action && "hidden md:flex")}>
        {action && (
          <a href={action.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={btn("sm")}>{action.label}</a>
        )}
      </span>
    </li>
  );
}

function EmptyState({ canEdit, canImport, onNew, onImport }: { canEdit: boolean; canImport: boolean; onNew: () => void; onImport: () => void }) {
  const t = useCopy(clientesCopy);
  return (
    <section className="mt-[18px] rounded-[14px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center sm:py-14">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Users className="h-6 w-6" aria-hidden /></span>
      <h2 className="mt-3 text-base font-bold text-slate-900">{canEdit ? t.empty.title : t.empty.readOnlyTitle}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{canEdit ? t.empty.text : t.empty.readOnlyText}</p>
      {canEdit && (
        <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          <button type="button" onClick={onNew} className={btn("primary")}><UserPlus className="h-4 w-4" aria-hidden />{t.empty.add}</button>
          {canImport && <button type="button" onClick={onImport} className={btn()}><Upload className="h-4 w-4" aria-hidden />{t.importExcel}</button>}
        </div>
      )}
      {canImport && <p className="mt-3 text-xs text-slate-500">{t.empty.importHint}</p>}
    </section>
  );
}
