import { useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { clientesCopy } from "@/i18n/copy/clientes";
import { PosSheet } from "@/components/pos/PosSheet";
import { FIELD, LABEL, btn } from "@/components/pos/ui";
import type { Customer, CustomerForm } from "./customerUtils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = a new client. */
  customer: Customer | null;
  /** After saving a new client (its id). */
  onCreated?: (id: number) => void;
};

/** The prototype's "Nuevo cliente" panel (and "Editar datos"). Bottom sheet on the phone, centered card on bigger screens. */
export function CustomerDialog({ open, onOpenChange, customer, onCreated }: Props) {
  const t = useCopy(clientesCopy);
  return (
    <PosSheet open={open} onOpenChange={onOpenChange} title={customer ? t.form.titleEdit : t.form.titleNew} closeLabel={t.form.close}>
      {open && <FormBody key={customer?.id ?? "new"} customer={customer} onClose={() => onOpenChange(false)} onCreated={onCreated} />}
    </PosSheet>
  );
}

function FormBody({ customer, onClose, onCreated }: { customer: Customer | null; onClose: () => void; onCreated?: (id: number) => void }) {
  const t = useCopy(clientesCopy);
  const f = t.form;
  const utils = trpc.useUtils();
  const id = useId();
  const [tried, setTried] = useState(false);
  const [form, setForm] = useState<CustomerForm>(() => ({
    name: customer?.name ?? "", lastName: customer?.lastName ?? "", email: customer?.email ?? "",
    phone: customer?.phone ?? "", address: customer?.address ?? "", notes: customer?.notes ?? "",
  }));

  const refresh = () => {
    void utils.customers.list.invalidate();
    void utils.customers.stats.invalidate();
    void utils.customers.overview.invalidate();
    void utils.customers.detail.invalidate();
    void utils.customers.byId.invalidate();
  };
  const create = trpc.customers.create.useMutation({
    onSuccess: (res) => { refresh(); toast.success(t.toast.created); onClose(); onCreated?.(res.id); },
    onError: (err) => toast.error(err.message),
  });
  const update = trpc.customers.update.useMutation({
    onSuccess: () => { refresh(); toast.success(t.toast.updated); onClose(); },
    onError: (err) => toast.error(err.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const clean = { ...form, name: form.name.trim() };
    if (!clean.name) return;
    if (customer) update.mutate({ id: customer.id, ...clean });
    else create.mutate(clean);
  };
  const set = (k: keyof CustomerForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((x) => ({ ...x, [k]: e.target.value }));
  const busy = create.isPending || update.isPending;
  const nameBad = tried && !form.name.trim();

  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span>{f.firstName} <small className="font-normal text-slate-500">({f.required})</small></span>
          <input value={form.name} onChange={set("name")} placeholder={f.firstNamePh} autoComplete="off" autoFocus={!customer} aria-invalid={nameBad}
            aria-describedby={nameBad ? `${id}-name-err` : undefined} className={cn(FIELD, nameBad && "border-red-300")} />
          {nameBad && <small id={`${id}-name-err`} className="text-xs font-normal text-red-700">{f.nameMissing}</small>}
        </label>
        <label className={LABEL}>
          {f.lastName}
          <input value={form.lastName} onChange={set("lastName")} placeholder={f.lastNamePh} autoComplete="off" className={FIELD} />
        </label>
        <label className={LABEL}>
          {f.phone}
          <input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 000-0000" autoComplete="off" className={FIELD} />
        </label>
        <label className={LABEL}>
          {f.email}
          <input type="email" value={form.email} onChange={set("email")} placeholder="nombre@correo.com" autoComplete="off" className={FIELD} />
        </label>
      </div>
      <label className={LABEL}>
        {f.address}
        <input value={form.address} onChange={set("address")} autoComplete="off" className={FIELD} />
      </label>
      <label className={LABEL}>
        {f.notes}
        <input value={form.notes} onChange={set("notes")} placeholder={f.notesPh} autoComplete="off" className={FIELD} />
      </label>
      <button type="submit" disabled={busy} className={cn(btn("primary"), "mt-1")}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? f.saving : customer ? f.save : f.create}
      </button>
      {!customer && <p className="text-[13px] text-slate-500">{f.hint}</p>}
    </form>
  );
}
