import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { errorText, type VendorItem } from "./shared";
import { BTN, FIELD, LABEL } from "./ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = { vendor?: VendorItem; onClose: () => void };

const TERMS = [0, 7, 15, 30, 45, 60, 90];

/** "Nuevo proveedor" / "Editar proveedor": name, what you buy, phone, email, terms, contractor (W-9), notes. */
export function VendorFormDialog({ vendor, onClose }: Props) {
  const copy = useCopy(vendorsCopy);
  const t = copy.vendorForm;
  const utils = trpc.useUtils();
  const uid = useId();
  const [name, setName] = useState(vendor?.name ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [what, setWhat] = useState(vendor?.what ?? "");
  const [terms, setTerms] = useState<string>(vendor?.terms === null || vendor?.terms === undefined ? "" : String(vendor.terms));
  const [contractor, setContractor] = useState(vendor?.contractor ?? false);
  const [w9, setW9] = useState(vendor?.w9 ?? false);
  const p = copy.proto.form;
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
    const input = {
      name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null,
      what: what.trim() || null, terms: terms === "" ? null : Number(terms), contractor, w9: contractor && w9,
    };
    if (vendor) update.mutate({ id: vendor.id, ...input });
    else create.mutate(input);
  };

  const invalid = (f: "name" | "email") => (errors[f] ? { "aria-invalid": true, "aria-describedby": `${uid}-${f}-error` } : {});

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent className="max-h-[100dvh] grid-cols-1 content-start overflow-y-auto bg-white sm:max-w-md sm:rounded-2xl">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{vendor ? t.titleEdit : t.titleNew}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-name`} className={LABEL}>{t.name}</Label>
            <Input
              className={FIELD}
              id={`${uid}-name`} value={name} maxLength={120} autoComplete="organization" placeholder={t.namePlaceholder}
              onChange={(e) => setName(e.target.value)} {...invalid("name")}
            />
            {errors.name && <p id={`${uid}-name-error`} className="text-xs text-red-600">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-what`} className={LABEL}>{p.what}</Label>
            <Input className={FIELD} id={`${uid}-what`} value={what} maxLength={120} placeholder={p.whatPlaceholder} onChange={(e) => setWhat(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${uid}-phone`} className={LABEL}>{t.phone}</Label>
              <Input className={FIELD} id={`${uid}-phone`} type="tel" value={phone} maxLength={40} autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${uid}-email`} className={LABEL}>{t.email}</Label>
              <Input
                className={FIELD}
                id={`${uid}-email`} type="email" value={email} maxLength={320} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} {...invalid("email")}
              />
              {errors.email && <p id={`${uid}-email-error`} className="text-xs text-red-600">{errors.email}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-terms`} className={LABEL}>{p.terms}</Label>
            <select
              id={`${uid}-terms`} value={terms} onChange={(e) => setTerms(e.target.value)}
              className={cn(FIELD, "w-full border px-3 focus-visible:outline-none")}
            >
              <option value="">{p.termsNone}</option>
              {TERMS.map((n) => <option key={n} value={String(n)}>{n === 0 ? p.termsCash : p.termsDays(n)}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-slate-800 sm:min-h-0">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={contractor} onChange={(e) => setContractor(e.target.checked)} />
              {p.contractor}
            </label>
            {contractor && (
              <label className="ml-6 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-slate-800 sm:min-h-0">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={w9} onChange={(e) => setW9(e.target.checked)} />
                {p.w9}
              </label>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-notes`} className={LABEL}>{t.notes}</Label>
            <Textarea className={cn(FIELD, "min-h-[4.5rem] py-2")} id={`${uid}-notes`} value={notes} maxLength={1000} rows={2} placeholder={t.notesPlaceholder} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" className={BTN.secondary} disabled={pending} onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" className={BTN.primary} disabled={pending}>{pending ? t.saving : t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
