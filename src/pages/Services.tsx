import { useMemo, useState } from "react";
import { AlertCircle, EyeOff, Plus, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { cobrarCopy, type CobrarCopy } from "@/i18n/copy/cobrar";
import { marginPct, stockState, toCents } from "../../api/lib/ventas";
import { ProductForm, type ProductFormValues } from "@/components/products/ProductForm";
import { PageHead } from "@/components/pos/proto";
import { FOCUS, SEARCH_BOX, SEARCH_INPUT, SLIST, SROW_HEAD, btn } from "@/components/pos/ui";
import { DEVICE_TZ, SERVER_CUSTOM_SERVICE, money, norm, num, type ServiceRow } from "@/components/pos/posTypes";

const EMPTY: ProductFormValues = { name: "", description: "", price: "", cost: "", kind: "service", stock: "", isActive: true };

/**
 * A sold service can't be deleted (sale lines point to it): the database refuses with a
 * foreign-key error, which reaches us as drizzle's raw "Failed query: delete from `services`…".
 */
const isInUse = (msg: string) => /foreign key|a parent row|ER_ROW_IS_REFERENCED|Failed query: delete/i.test(msg);

/** `.trow` columns: Nombre · Precio · Costo · Margen (phone: name and price). */
const COLS = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1.6fr)_100px_100px_90px]";

/**
 * Productos y servicios (the prototype's `products` screen): the catalog with price, cost and
 * margin, what each one sold this month, product stock, and the form. They show up in Cobrar.
 */
export default function Services() {
  const copy = useCopy(cobrarCopy);
  const t = copy.services;
  const { data: servicesList, isLoading, error, refetch } = trpc.services.list.useQuery({ timeZone: DEVICE_TZ });
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  // Only the owner changes the catalog (api/lib/team.ts): the accountant reads, staff only sell.
  const canEdit = membership === null;
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [initial, setInitial] = useState<ProductFormValues>(EMPTY);
  const [toDelete, setToDelete] = useState<ServiceRow | null>(null);

  const refresh = () => void utils.services.list.invalidate();
  const create = trpc.services.create.useMutation({
    onSuccess: () => { refresh(); setFormOpen(false); toast.success(t.toast.created); },
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.services.update.useMutation({
    onSuccess: (_d, vars) => {
      refresh(); setFormOpen(false); setEditing(null);
      toast.success("name" in vars ? t.toast.updated : t.toast.hidden); // the form always sends the name; "Ocultar" doesn't
    },
    onError: (err) => toast.error(err.message),
  });
  const del = trpc.services.delete.useMutation({
    onSuccess: () => { refresh(); setFormOpen(false); setEditing(null); toast.success(t.toast.deleted); },
    onError: (err, vars) => {
      if (isInUse(err.message)) {
        toast.error(t.inUse, { duration: 10_000, action: { label: t.hide, onClick: () => update.mutate({ id: vars.id, isActive: false }) } });
      } else toast.error(err.message);
    },
  });

  // The server's own catch-all for custom charges isn't something the owner made: keep it out of the list.
  // What sells the most this month comes first.
  const items = useMemo(
    () => (Array.isArray(servicesList) ? (servicesList as ServiceRow[]) : [])
      .filter((s) => !(s?.name === SERVER_CUSTOM_SERVICE && num(s.price) === 0))
      .sort((a, b) => (b.soldThisMonth ?? 0) - (a.soldThisMonth ?? 0) || (a.name || "").localeCompare(b.name || "")),
    [servicesList],
  );
  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return q ? items.filter((s) => norm(s?.name || "").includes(q)) : items;
  }, [items, search]);

  const openNew = () => { setEditing(null); setInitial(EMPTY); setFormKey((k) => k + 1); setFormOpen(true); };
  const openEdit = (s: ServiceRow) => {
    setEditing(s);
    setInitial({
      name: s?.name || "", description: s?.description || "", price: String(s?.price || ""), cost: num(s.cost) > 0 ? String(s.cost) : "",
      kind: s.kind === "product" ? "product" : "service", stock: s.trackStock ? String(s.stock ?? 0) : "",
      isActive: s.isActive === null ? true : !!s.isActive,
    });
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  // Same payload as before the redesign, plus the type and (only when it changed) the stock.
  const save = (form: ProductFormValues) => {
    const data = { name: form.name.trim(), description: form.description, price: form.price.replace(/^\$/, ""), cost: form.cost.replace(/^\$/, "") || undefined };
    const stockText = form.kind === "product" ? form.stock.trim() : "";
    const stock = stockText === "" ? null : Number(stockText);
    if (editing) {
      const before = editing.trackStock ? String(editing.stock ?? 0) : "";
      const stockChanged = stockText !== before;
      update.mutate({ id: editing.id, ...data, isActive: form.isActive, kind: form.kind, ...(stockChanged ? { stock } : {}) });
    } else {
      create.mutate({ ...data, kind: form.kind, ...(stock !== null ? { stock } : {}) });
    }
  };

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHead
          title={t.title}
          sub={t.sub}
          right={canEdit ? <button type="button" onClick={openNew} className={btn("primary")}>{t.add}</button> : undefined}
        />

        {membership && <p className="mb-3.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{membership.role === "accountant" ? t.readOnly : t.staffOnly}</p>}

        {error ? (
          <section className="flex flex-col items-center gap-3 rounded-[14px] border border-red-200 bg-white px-5 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-red-600" aria-hidden />
            <p className="text-sm text-red-800">{t.loadError(error.message)}</p>
            <button type="button" onClick={() => void refetch()} className={btn()}>{copy.retry}</button>
          </section>
        ) : isLoading ? (
          <div className={SLIST} aria-busy="true">
            <div className={cn(SROW_HEAD, "h-9")} />
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="border-t border-slate-200 px-4 py-3"><Skeleton className="h-9 rounded-lg" /></div>)}
          </div>
        ) : items.length === 0 ? (
          <section className="flex flex-col items-center rounded-[14px] border border-dashed border-slate-200 bg-white px-5 py-12 text-center" aria-labelledby="svc-empty">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Wrench className="h-6 w-6" aria-hidden /></span>
            <h2 id="svc-empty" className="mt-3 text-base font-bold text-slate-900">{t.empty.title}</h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">{t.empty.text}</p>
            {canEdit && <button type="button" onClick={openNew} className={cn(btn("primary"), "mt-4")}><Plus className="h-4 w-4" aria-hidden />{t.empty.cta}</button>}
          </section>
        ) : (
          <>
            {items.length > 6 && (
              <label className={cn(SEARCH_BOX, "mb-2.5 max-w-md")}>
                <Search className="h-[18px] w-[18px] flex-none" aria-hidden />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} autoComplete="off" className={SEARCH_INPUT} />
              </label>
            )}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
                <p className="text-sm text-slate-500">{t.noMatch(search.trim())}</p>
                <button type="button" onClick={() => setSearch("")} className={btn()}>{t.showAll}</button>
              </div>
            ) : (
              <div className={SLIST}>
                <div className={cn(COLS, SROW_HEAD, "hidden md:grid")} aria-hidden>
                  <span>{t.cols.name}</span><span className="text-right">{t.cols.price}</span><span className="text-right">{t.cols.cost}</span><span className="text-right">{t.cols.margin}</span>
                </div>
                <ul>
                  {filtered.map((s) => <ProductRow key={s.id} s={s} t={t} onOpen={canEdit ? () => openEdit(s) : undefined} />)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <ProductForm
        key={formKey} open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        initial={initial} editing={!!editing} pending={create.isPending || update.isPending || del.isPending}
        onSubmit={save} onDelete={editing ? () => setToDelete(editing) : undefined} t={t} closeLabel={copy.close}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">{t.del.title(toDelete?.name || t.noName)}</AlertDialogTitle>
            <AlertDialogDescription>{t.del.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-[10px]">{t.del.cancel}</AlertDialogCancel>
            <AlertDialogAction className="h-11 rounded-[10px] bg-red-600 text-white hover:bg-red-500" onClick={() => { if (toDelete) del.mutate({ id: toDelete.id }); }}>
              {t.del.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatedPage>
  );
}

/** One `.trow`: name with its type, what it sold and its stock; price, cost and margin. */
function ProductRow({ s, t, onOpen }: { s: ServiceRow; t: CobrarCopy["services"]; onOpen?: () => void }) {
  const priceC = toCents(num(s.price));
  const costC = toCents(num(s.cost));
  const margin = marginPct(priceC, costC);
  const name = s?.name || t.noName;
  const hidden = s.isActive !== null && !s.isActive;
  const st = stockState(!!s.trackStock, s.stock ?? 0);
  const body = (
    <>
      <div className="min-w-0">
        <b className={cn("block truncate font-semibold", hidden ? "text-slate-500" : "text-slate-900")}>
          {name}
          {hidden && <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-px align-[1px] text-[11px] font-medium text-slate-600"><EyeOff className="h-3 w-3" aria-hidden />{t.hidden}</span>}
        </b>
        <span className="block text-xs text-slate-500">
          {t.kind[s.kind === "product" ? "product" : "service"]}
          {st === "ok" && <> · {t.stockLeft(s.stock ?? 0)}</>}
          {st === "low" && <> · <span className="font-semibold text-amber-700">{t.stockLeft(s.stock ?? 0)}</span></>}
          {st === "out" && <> · <span className="font-semibold text-red-600">{t.stockOut}</span></>}
          {" · "}{t.soldMonth(s.soldThisMonth ?? 0)}
        </span>
      </div>
      <span className="text-right tabular-nums text-slate-900">{priceC > 0 ? money(priceC / 100) : <span className="text-[13px] text-slate-500">{t.variable}</span>}</span>
      <span className="hidden text-right tabular-nums text-slate-900 md:block">{money(costC / 100)}</span>
      <span className={cn("hidden text-right font-[650] tabular-nums md:block", margin === null ? "text-slate-400" : margin >= 0 ? "text-emerald-600" : "text-red-600")} aria-label={margin === null ? undefined : t.marginOf(name, `${margin}%`)}>
        {margin === null ? "—" : `${margin < 0 ? "−" : ""}${Math.abs(margin)}%`}
      </span>
    </>
  );
  return (
    <li className="border-t border-slate-200 first:border-t-0">
      {onOpen ? (
        <button type="button" onClick={onOpen} title={t.open(name)} className={cn(COLS, `w-full px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${FOCUS} focus-visible:ring-inset`)}>{body}</button>
      ) : (
        <div className={cn(COLS, "px-4 py-3 text-sm")}>{body}</div>
      )}
    </li>
  );
}
