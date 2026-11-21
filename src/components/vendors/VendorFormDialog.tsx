import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { errorText, type VendorItem } from "./shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = { vendor?: VendorItem; onClose: () => void };

/** "Nuevo proveedor" / "Editar proveedor": name, phone, email, notes. */
export function VendorFormDialog({ vendor, onClose }: Props) {
  const copy = useCopy(vendorsCopy);
  const t = copy.vendorForm;
  const utils = trpc.useUtils();
  const uid = useId();
  const [name, setName] = useState(vendor?.name ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const done = (message: string) => {
    toast.success(message);
    void utils.vendors.invalidate();
    onClose();
  };
  const create = trpc.vendors.create.useMutation({ onSuccess: () => done(t.created), onError: (e) => toast.error(errorText(e, copy.error)) });
  const update = trpc.vendors.update.useMutation({ onSuccess: () => done(t.updated), onError: (e) => toast.error(errorText(e, copy.error)) });
  const pending = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: { name?: string; email?: string } = {};
    if (!name.trim()) next.name = t.errors.name;
    if (email.trim() && !EMAIL_RE.test(email.trim())) next.email = t.errors.email;
    setErrors(next);
    if (next.name) return document.getElementById(`${uid}-name`)?.focus();
    if (next.email) return document.getElementById(`${uid}-email`)?.focus();
    const input = { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null };
    if (vendor) update.mutate({ id: vendor.id, ...input });
    else create.mutate(input);
  };

  const invalid = (f: "name" | "email") => (errors[f] ? { "aria-invalid": true, "aria-describedby": `${uid}-${f}-error` } : {});

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-black">{vendor ? t.titleEdit : t.titleNew}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-name`} className="text-xs text-neutral-600">{t.name}</Label>
            <Input
              id={`${uid}-name`} value={name} maxLength={120} autoComplete="organization" placeholder={t.namePlaceholder}
              onChange={(e) => setName(e.target.value)} {...invalid("name")}
            />
            {errors.name && <p id={`${uid}-name-error`} className="text-xs text-red-600">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${uid}-phone`} className="text-xs text-neutral-600">{t.phone}</Label>
              <Input id={`${uid}-phone`} type="tel" value={phone} maxLength={40} autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${uid}-email`} className="text-xs text-neutral-600">{t.email}</Label>
              <Input
                id={`${uid}-email`} type="email" value={email} maxLength={320} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} {...invalid("email")}
              />
              {errors.email && <p id={`${uid}-email-error`} className="text-xs text-red-600">{errors.email}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-notes`} className="text-xs text-neutral-600">{t.notes}</Label>
            <Textarea id={`${uid}-notes`} value={notes} maxLength={1000} rows={2} placeholder={t.notesPlaceholder} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" className="border-neutral-200" disabled={pending} onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" className="bg-black text-white hover:bg-neutral-800" disabled={pending}>{pending ? t.saving : t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
