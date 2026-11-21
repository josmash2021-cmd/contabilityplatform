import { useId, useState, type FormEvent } from "react";
import { Loader2, ShoppingBag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { clientesCopy } from "@/i18n/copy/clientes";
import { fullName, money, type Customer, type CustomerForm } from "./customerUtils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = a new client. */
  customer: Customer | null;
  canEdit: boolean;
  canDelete: boolean;
  onDelete: (c: Customer) => void;
};

/** Create, edit (or, read-only, view) one client, with what they've bought. Full screen on phone, centered on desktop. */
export function CustomerDialog({ open, onOpenChange, customer, canEdit, canDelete, onDelete }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="grid-cols-1 content-start gap-0 overflow-y-auto bg-white p-0 sm:max-h-[calc(100dvh-4rem)] sm:max-w-lg sm:rounded-2xl">
        <CustomerFormBody
          key={customer?.id ?? "new"}
          customer={customer}
          canEdit={canEdit}
          canDelete={canDelete}
          onDelete={onDelete}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CustomerFormBody({ customer, canEdit, canDelete, onDelete, onClose }: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const t = useCopy(clientesCopy);
  const utils = trpc.useUtils();
  const id = useId();
  const [form, setForm] = useState<CustomerForm>(() => ({
    name: customer?.name ?? "", lastName: customer?.lastName ?? "", email: customer?.email ?? "",
    phone: customer?.phone ?? "", address: customer?.address ?? "",
  }));

  const refresh = () => { void utils.customers.list.invalidate(); void utils.customers.stats.invalidate(); };
  const create = trpc.customers.create.useMutation({
    onSuccess: () => { refresh(); toast.success(t.toast.created); onClose(); },
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.customers.update.useMutation({
    onSuccess: () => { refresh(); toast.success(t.toast.updated); onClose(); },
    onError: (err) => toast.error(err.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (customer) update.mutate({ id: customer.id, ...form });
    else create.mutate(form);
  };

  const busy = create.isPending || update.isPending;
  const readOnly = !canEdit;
  const title = !customer ? t.form.titleNew : readOnly ? t.form.titleView : t.form.titleEdit;
  const set = (k: keyof CustomerForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{customer ? fullName(customer) : title}</DialogTitle>
          <DialogDescription className="mt-0.5 text-sm text-slate-500">{customer ? title : t.form.hint}</DialogDescription>
        </div>
        <button type="button" onClick={onClose} aria-label={t.form.close}
          className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <X className="h-5 w-5" />
        </button>
      </header>

      <form onSubmit={submit} className="space-y-4 px-4 py-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-name`} label={t.form.firstName} hint={canEdit ? t.form.required : undefined}>
            <input id={`${id}-name`} value={form.name} onChange={set("name")} required readOnly={readOnly} autoComplete="off" autoFocus={!customer} className={inputCls} />
          </Field>
          <Field id={`${id}-last`} label={t.form.lastName}>
            <input id={`${id}-last`} value={form.lastName} onChange={set("lastName")} readOnly={readOnly} autoComplete="off" className={inputCls} />
          </Field>
          <Field id={`${id}-phone`} label={t.form.phone}>
            <input id={`${id}-phone`} type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} readOnly={readOnly} autoComplete="off" className={inputCls} />
          </Field>
          <Field id={`${id}-email`} label={t.form.email}>
            <input id={`${id}-email`} type="email" value={form.email} onChange={set("email")} readOnly={readOnly} autoComplete="off" className={inputCls} />
          </Field>
        </div>
        <Field id={`${id}-addr`} label={t.form.address}>
          <input id={`${id}-addr`} value={form.address} onChange={set("address")} readOnly={readOnly} autoComplete="off" className={inputCls} />
        </Field>

        {canEdit && (
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="h-11 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:h-10">
              {t.form.cancel}
            </button>
            <button type="submit" disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 sm:h-10">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t.form.saving : customer ? t.form.save : t.form.create}
            </button>
          </div>
        )}
      </form>

      {customer && <PurchaseHistory customerId={customer.id} />}

      {customer && canDelete && (
        <div className="mt-auto border-t border-slate-100 px-4 py-4 sm:px-6">
          <button type="button" onClick={() => onDelete(customer)}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:h-10">
            <Trash2 className="h-4 w-4" />{t.del.button}
          </button>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 read-only:bg-slate-50 read-only:text-slate-700 sm:text-sm";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}{hint && <span className="ml-1 font-normal text-slate-500">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

type Sale = {
  id: number;
  total: string | number;
  paymentMethod: string;
  status: string;
  createdAt: string | Date | null;
  items?: { serviceName: string; quantity?: number | null }[];
};

/** "Cambio de aceite ×4, Alineación": one entry per item name with its total quantity. */
function summarizeItems(items: Sale["items"]): string {
  const qty = new Map<string, number>();
  for (const i of items ?? []) if (i.serviceName) qty.set(i.serviceName, (qty.get(i.serviceName) ?? 0) + Math.max(1, Number(i.quantity ?? 1)));
  return [...qty].map(([name, q]) => (q > 1 ? `${name} ×${q}` : name)).join(", ");
}

/** One client's sales (sales.byCustomer), newest first. */
function PurchaseHistory({ customerId }: { customerId: number }) {
  const t = useCopy(clientesCopy);
  const locale = intlLocale(useLang().lang);
  const { data, isLoading, isError } = trpc.sales.byCustomer.useQuery({ customerId });
  const sales = (data ?? []) as Sale[];

  return (
    <section className="border-t border-slate-100 px-4 py-5 sm:px-6" aria-labelledby={`hist-${customerId}`}>
      <h3 id={`hist-${customerId}`} className="flex items-center gap-2 font-semibold text-slate-900">
        <ShoppingBag className="h-4 w-4 text-slate-500" />{t.history.title}
      </h3>
      {isLoading ? (
        <div className="mt-3 space-y-2" aria-label={t.history.loading}><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /></div>
      ) : isError ? (
        <p className="mt-2 text-sm text-red-700">{t.history.error}</p>
      ) : sales.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t.history.none}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {sales.map((s) => {
            const what = summarizeItems(s.items) || t.history.noItems;
            const when = s.createdAt ? new Date(s.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
            const voided = s.status === "cancelled" || s.status === "refunded";
            const status = t.history.status[s.status];
            return (
              <li key={s.id} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{what}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {when}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{t.methods[s.paymentMethod] ?? s.paymentMethod}</span>
                    {status && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{status}</span>}
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${voided ? "text-slate-400 line-through" : "text-slate-900"}`}>{money(Number(s.total ?? 0))}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
