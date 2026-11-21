import { useMemo, useState } from "react";
import { AlertCircle, EyeOff, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCopy } from "@/i18n/useI18n";
import { cobrarCopy, type CobrarCopy } from "@/i18n/copy/cobrar";
import { ServiceForm, type ServiceFormValues } from "@/components/pos/ServiceForm";
import { SERVER_CUSTOM_SERVICE, money, norm, num, type ServiceRow } from "@/components/pos/posTypes";

const EMPTY: ServiceFormValues = { name: "", description: "", price: "", cost: "", type: "service", isActive: true };

/**
 * A sold service can't be deleted (sale lines point to it): the database refuses with a
 * foreign-key error, which reaches us as drizzle's raw "Failed query: delete from `services`…".
 */
const isInUse = (msg: string) => /foreign key|a parent row|ER_ROW_IS_REFERENCED|Failed query: delete/i.test(msg);

/** Servicios 2.0: what the business sells, with its price. They show up in Cobrar. */
export default function Services() {
  const copy = useCopy(cobrarCopy);
  const t = copy.services;
  const { data: servicesList, isLoading, error, refetch } = trpc.services.list.useQuery();
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const readOnly = membership?.role === "accountant"; // reads everything, changes nothing (api/lib/team.ts)
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [initial, setInitial] = useState<ServiceFormValues>(EMPTY);
  const [toDelete, setToDelete] = useState<ServiceRow | null>(null);

  const create = trpc.services.create.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); setFormOpen(false); toast.success(t.toast.created); },
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.services.update.useMutation({
    onSuccess: (_d, vars) => {
      utils.services.list.invalidate(); setFormOpen(false); setEditing(null);
      toast.success("name" in vars ? t.toast.updated : t.toast.hidden); // the form always sends the name; "Ocultar" doesn't
    },
    onError: (err) => toast.error(err.message),
  });
  const del = trpc.services.delete.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); toast.success(t.toast.deleted); },
    onError: (err, vars) => {
      if (isInUse(err.message)) {
        toast.error(t.inUse, { duration: 10_000, action: { label: t.hide, onClick: () => update.mutate({ id: vars.id, isActive: false }) } });
      } else toast.error(err.message);
    },
  });

  // The server's own catch-all for custom charges isn't something the owner made: keep it out of the list.
  const items = useMemo(
    () => (Array.isArray(servicesList) ? (servicesList as ServiceRow[]) : []).filter((s) => !(s?.name === SERVER_CUSTOM_SERVICE && num(s.price) === 0)),
    [servicesList],
  );
  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return q ? items.filter((s) => norm(s?.name || "").includes(q)) : items;
  }, [items, search]);

  const openNew = () => { setEditing(null); setInitial(EMPTY); setFormKey((k) => k + 1); setFormOpen(true); };
  const openEdit = (s: ServiceRow) => {
    setEditing(s.id);
    setInitial({
      name: s?.name || "", description: s?.description || "", price: String(s?.price || ""), cost: String(s?.cost || ""),
      type: "service", isActive: s.isActive === null ? true : !!s.isActive,
    });
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  // Same payload as before the redesign (+ "Mostrar en Cobrar" when editing).
  const save = (form: ServiceFormValues) => {
    const data = { name: form.name, description: form.description, price: form.price.replace(/^\$/, ""), cost: form.cost.replace(/^\$/, "") || undefined };
    if (editing) update.mutate({ id: editing, ...data, isActive: form.isActive });
    else create.mutate(data);
  };

  const newBtn = !readOnly && (
    <button onClick={openNew} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2">
      <Plus className="h-4 w-4" aria-hidden />{t.new}
    </button>
  );

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.sub(items.length)}</p>
          </div>
          {newBtn}
        </header>

        {readOnly && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t.readOnly}</p>}

        {error ? (
          <section className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-white px-5 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-red-600" aria-hidden />
            <p className="text-sm text-red-800">{t.loadError(error.message)}</p>
            <button onClick={() => refetch()} className="inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{copy.retry}</button>
          </section>
        ) : isLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-hidden>
            <Skeleton className="h-11 rounded-[10px]" />
            <div className="mt-4 space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          </section>
        ) : items.length === 0 ? (
          <section className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center" aria-labelledby="svc-empty">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Wrench className="h-7 w-7" aria-hidden /></span>
            <h2 id="svc-empty" className="mt-4 text-lg font-semibold text-slate-900">{t.empty.title}</h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">{t.empty.text}</p>
            {!readOnly && (
              <button onClick={openNew} className="mt-5 inline-flex h-11 items-center gap-2 rounded-[10px] bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
                <Plus className="h-4 w-4" aria-hidden />{t.empty.cta}
              </button>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="svc-list">
            <h2 id="svc-list" className="sr-only">{t.listTitle}</h2>
            <label htmlFor="svc-search" className="block text-xs font-medium text-slate-500">{t.search}</label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="svc-search" type="search" value={search} placeholder={t.searchPh} autoComplete="off"
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-[10px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:text-sm"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm text-slate-500">{t.noMatch(search.trim())}</p>
                <button onClick={() => setSearch("")} className="inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t.showAll}</button>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {filtered.map((s) => (
                  <ServiceItem key={s.id} s={s} t={t} readOnly={readOnly} onEdit={() => openEdit(s)} onDelete={() => setToDelete(s)} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <ServiceForm
        key={formKey} open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        initial={initial} editing={!!editing} pending={create.isPending || update.isPending}
        onSubmit={save} t={t} closeLabel={copy.close}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">{t.del.title(toDelete?.name || t.noName)}</AlertDialogTitle>
            <AlertDialogDescription>{t.del.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-[10px]">{t.del.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-[10px] bg-red-600 text-white hover:bg-red-500"
              onClick={() => { if (toDelete) del.mutate({ id: toDelete.id }); }}
            >
              {t.del.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatedPage>
  );
}

function ServiceItem({ s, t, readOnly, onEdit, onDelete }: { s: ServiceRow; t: CobrarCopy["services"]; readOnly: boolean; onEdit: () => void; onDelete: () => void }) {
  const price = num(s.price);
  const cost = num(s.cost);
  const name = s?.name || t.noName;
  const hidden = s.isActive !== null && !s.isActive;
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={`hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid ${hidden ? "bg-slate-100 text-slate-400" : "bg-blue-50 text-blue-600"}`} aria-hidden>
        <Wrench className="h-5 w-5" />
      </span>
      {/* Phone: price under the name. Bigger screens: price in its own column. */}
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <p className={`text-sm font-semibold [overflow-wrap:anywhere] ${hidden ? "text-slate-500" : "text-slate-900"}`}>{name}</p>
          {s.description && <p className="truncate text-xs text-slate-500">{s.description}</p>}
          {hidden && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              <EyeOff className="h-3 w-3" aria-hidden />{t.hidden}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 sm:mt-0 sm:block sm:shrink-0 sm:text-right">
          <p className={`tabular-nums ${price > 0 ? "text-sm font-bold text-slate-900 sm:text-base sm:font-semibold" : "text-xs font-medium text-slate-500"}`}>{price > 0 ? money(price) : t.variable}</p>
          {cost > 0 && (
            <p className="text-xs tabular-nums text-slate-500">
              {t.cost(money(cost))}
              {price > 0 && <span> · {t.keep(money(price - cost))}</span>}
            </p>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="flex shrink-0 items-center">
          <button onClick={onEdit} aria-label={t.edit(name)} className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:h-9 lg:w-9">
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button onClick={onDelete} aria-label={t.remove(name)} className="grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 lg:h-9 lg:w-9">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}
