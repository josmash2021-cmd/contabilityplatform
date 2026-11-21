import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { settingsCopy } from "@/i18n/copy/settings";
import { authCopy } from "@/i18n/copy/auth";
import { Fld, SetTitle } from "./ui";
import { BTN, BTN_PRIMARY, BTN_SM, INP } from "./styles";
import { LogoPrepError, prepareLogo, LOGO_TYPES } from "./logo";

type CompanyForm = {
  companyName: string; phone: string; email: string; address: string; city: string; state: string; zipCode: string;
  addressType: string; unitNumber: string; rif: string; zelleEmail: string; currency: string;
};
type Saved = { [K in keyof CompanyForm]?: string | null } & { logo?: string | null };

/** Keys are the values saved on the server; only the labels are translated. */
const PLACES = ["Casa", "Apartamento", "Oficina", "Tienda"] as const;

function formFrom(s: Saved | null | undefined): CompanyForm {
  return {
    companyName: s?.companyName || "", phone: s?.phone || "", email: s?.email || "", address: s?.address || "",
    city: s?.city || "", state: s?.state || "", zipCode: s?.zipCode || "", addressType: s?.addressType || "",
    unitNumber: s?.unitNumber || "", rif: s?.rif || "", zelleEmail: s?.zelleEmail || "", currency: s?.currency || "USD",
  };
}

/** "Tu negocio": the logo for documents and the details on receipts, invoices and quotes. */
export function BusinessSection() {
  const t = useCopy(settingsCopy);
  const { data, isLoading, isError, refetch, isFetching } = trpc.settings.get.useQuery();
  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={t.business.title}>
        <Skeleton className="h-6 w-40" /><Skeleton className="h-[68px] rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[62px] rounded-[10px]" />)}</div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-4 text-center" role="alert">
        <p className="font-semibold text-slate-900">{t.loadError}</p>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className={`mt-3 ${BTN}`}><RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />{t.retry}</button>
      </div>
    );
  }
  return (
    <>
      <SetTitle>{t.business.title}</SetTitle>
      <LogoRow logo={data?.logo ?? null} name={data?.companyName ?? ""} />
      {/* Mounted once the saved settings arrive, so the form starts from them. */}
      <CompanyFormView initial={formFrom(data)} />
    </>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase();
}

function LogoRow({ logo, name }: { logo: string | null; name: string }) {
  const t = useCopy(settingsCopy).business;
  const utils = trpc.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const upload = trpc.settings.uploadLogo.useMutation({
    onSuccess: () => { toast.success(t.logoSaved); utils.settings.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.settings.removeLogo.useMutation({
    onSuccess: () => { toast.success(t.logoRemoved); utils.settings.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const busy = preparing || upload.isPending || remove.isPending;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      upload.mutate(await prepareLogo(file));
    } catch (e) {
      const reason = e instanceof LogoPrepError ? e.reason : "read";
      toast.error(reason === "type" ? t.logoType : reason === "tooBig" ? t.logoTooBig : t.logoRead);
    } finally {
      setPreparing(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-100 p-3">
      {logo
        ? <img src={logo} alt={t.logo} className="h-10 w-auto max-w-[7rem] shrink-0 rounded-[10px] bg-white object-contain ring-1 ring-slate-200" />
        : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-slate-900 text-sm font-extrabold text-white" aria-hidden>{initials(name) || "·"}</span>}
      <div className="min-w-0 flex-[1_1_180px]">
        <b className="block text-sm font-semibold text-slate-900">{t.logo}</b>
        <span className="block text-[13px] text-slate-500">{t.logoText}</span>
        <span className="block text-xs text-slate-500">{t.logoRules}</span>
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        {logo && (
          <button type="button" className={BTN_SM} disabled={busy} onClick={() => { if (window.confirm(t.removeConfirm)) remove.mutate(); }}>{t.remove}</button>
        )}
        <button type="button" className={BTN_SM} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <ImagePlus className="h-[15px] w-[15px]" />}{logo ? t.change : t.upload}
        </button>
        <input ref={input} type="file" accept={LOGO_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}

function CompanyFormView({ initial }: { initial: CompanyForm }) {
  const t = useCopy(settingsCopy);
  const b = t.business;
  const types = useCopy(authCopy).onboarding.types;
  const utils = trpc.useUtils();
  const [form, setForm] = useState<CompanyForm>(initial);
  const [saved, setSaved] = useState<CompanyForm>(initial);
  const update = trpc.settings.update.useMutation({
    onSuccess: (_r, vars) => { utils.settings.get.invalidate(); toast.success(t.saved); setSaved({ ...saved, ...(vars as Partial<CompanyForm>) }); },
    onError: (err) => toast.error(err.message),
  });
  const set = (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const dirty = (Object.keys(form) as (keyof CompanyForm)[]).some((k) => form[k] !== saved[k]);
  const unit = form.addressType === "Apartamento" || form.addressType === "Oficina";

  return (
    <form onSubmit={(e) => { e.preventDefault(); update.mutate({ ...form, unitNumber: unit ? form.unitNumber : "" }); }}>
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <Fld id="set-name" label={b.name}><input id="set-name" value={form.companyName} onChange={set("companyName")} maxLength={255} autoComplete="organization" className={INP} /></Fld>
        <Fld id="set-phone" label={b.phone}><input id="set-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} maxLength={50} autoComplete="tel" className={INP} /></Fld>
        <Fld id="set-address" label={b.address}><input id="set-address" value={form.address} onChange={set("address")} maxLength={500} autoComplete="street-address" className={INP} /></Fld>
        <Fld id="set-ein" label={b.ein} hint={b.einHint}><input id="set-ein" value={form.rif} onChange={set("rif")} maxLength={50} autoComplete="off" className={INP} /></Fld>
        <Fld id="set-city" label={b.city}><input id="set-city" value={form.city} onChange={set("city")} maxLength={100} autoComplete="address-level2" className={INP} /></Fld>
        <div className="grid grid-cols-2 gap-3">
          <Fld id="set-state" label={b.state}><input id="set-state" value={form.state} onChange={set("state")} maxLength={2} autoComplete="address-level1" className={`${INP} uppercase`} /></Fld>
          <Fld id="set-zip" label={b.zip}><input id="set-zip" value={form.zipCode} onChange={set("zipCode")} maxLength={20} inputMode="numeric" autoComplete="postal-code" className={INP} /></Fld>
        </div>
        <Fld id="set-place" label={b.place}>
          <select id="set-place" value={form.addressType} onChange={set("addressType")} className={INP}>
            <option value="">{b.placeNone}</option>
            {PLACES.map((p) => <option key={p} value={p}>{types[p] ?? p}</option>)}
          </select>
        </Fld>
        {unit ? (
          <Fld id="set-unit" label={form.addressType === "Apartamento" ? b.aptNumber : b.officeNumber}>
            <input id="set-unit" value={form.unitNumber} onChange={set("unitNumber")} maxLength={50} className={INP} />
          </Fld>
        ) : <div className="hidden sm:block" aria-hidden />}
        <Fld id="set-email" label={b.email}><input id="set-email" type="email" value={form.email} onChange={set("email")} maxLength={320} autoComplete="email" className={INP} /></Fld>
        <Fld id="set-currency" label={b.currency}>
          <select id="set-currency" value={form.currency} onChange={set("currency")} className={INP}><option value="USD">{b.usd}</option></select>
        </Fld>
        <Fld id="set-zelle" label={b.zelle} hint={b.zelleHint} className="sm:col-span-2">
          <input id="set-zelle" value={form.zelleEmail} onChange={set("zelleEmail")} maxLength={320} autoComplete="off" className={`${INP} sm:max-w-[calc(50%-6px)]`} />
        </Fld>
      </div>
      <p className="mt-3 text-[13px] text-slate-500">{b.receiptNote}</p>
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={update.isPending} className={BTN_PRIMARY}>
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{update.isPending ? t.saving : t.save}
        </button>
        <span className={cn("flex items-center gap-1.5 text-[13px]", dirty ? "font-medium text-amber-700" : "text-slate-500")} role="status">
          {dirty ? <><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />{t.unsaved}</> : <><Check className="h-4 w-4 text-emerald-600" aria-hidden />{t.upToDate}</>}
        </span>
      </div>
    </form>
  );
}
