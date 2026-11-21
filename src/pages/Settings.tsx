import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Briefcase, Building, Building2, Check, ChevronDown, CreditCard, Globe, Home, Loader2, LogOut, Receipt, RefreshCw, Store, Unlink, Wifi,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import SubscriptionSettings from "@/components/SubscriptionSettings";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopy, useLang } from "@/i18n/useI18n";
import type { Lang } from "@/i18n/lang";
import { billingCopy } from "@/i18n/copy/billing";
import { authCopy } from "@/i18n/copy/auth";
import { settingsCopy } from "@/i18n/copy/settings";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const CARD = "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5";
const INPUT =
  "h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:text-sm";

/** Keys are the values saved on the server; only the labels are translated. */
const ADDRESS_TYPES: { value: "Casa" | "Apartamento" | "Oficina" | "Tienda"; icon: LucideIcon }[] = [
  { value: "Casa", icon: Home },
  { value: "Apartamento", icon: Building },
  { value: "Oficina", icon: Briefcase },
  { value: "Tienda", icon: Store },
];

export default function Settings() {
  const { user } = useAuth();
  const userMode = user?.modePreference || "business";
  if (userMode === "personal") return <PersonalSettings />;
  return <BusinessSettings />;
}

// ─── Shared pieces ───

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function CardTitle({ icon: Icon, id, title, text, tone = "blue" }: { icon: LucideIcon; id: string; title: string; text?: string; tone?: "blue" | "amber" | "slate" }) {
  const tones = { blue: "bg-blue-50 text-blue-600", amber: "bg-amber-50 text-amber-600", slate: "bg-slate-100 text-slate-600" };
  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <h2 id={id} className="font-semibold text-slate-900">{title}</h2>
        {text && <p className="mt-0.5 text-sm text-slate-500">{text}</p>}
      </div>
    </div>
  );
}

/** ES / EN, sized for a finger (the shared switcher is too small for a settings row). */
function LanguageToggle({ label }: { label: string }) {
  const { lang, setLang } = useLang();
  const options: [Lang, string][] = [["es", "Español"], ["en", "English"]];
  return (
    <div role="radiogroup" aria-label={label} className="inline-grid grid-cols-2 gap-1 rounded-[10px] bg-slate-100 p-1">
      {options.map(([o, name]) => (
        <button key={o} type="button" role="radio" aria-checked={lang === o} onClick={() => setLang(o)} lang={o}
          className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition sm:h-9 ${FOCUS} ${lang === o ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}>
          {lang === o && <Check className="h-3.5 w-3.5 text-blue-600" aria-hidden />}{name}
        </button>
      ))}
    </div>
  );
}

/** Who's logged in, the language, and logging out. */
function AccountCard() {
  const { user, logout } = useAuth();
  const s = useCopy(settingsCopy);
  const p = useCopy(billingCopy).settings.personal;
  return (
    <section className={CARD} aria-labelledby="set-account">
      <h2 id="set-account" className="font-semibold text-slate-900">{s.account.title}</h2>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-lg font-bold text-blue-700 ring-1 ring-blue-100">
          {(user?.name || "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{user?.name || p.noName}</p>
          <p className="truncate text-sm text-slate-500">{user?.email || p.noEmail}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><Globe className="h-4 w-4 text-slate-400" />{s.account.language}</p>
        <p className="mt-0.5 text-xs text-slate-500">{s.account.languageText}</p>
        <div className="mt-2"><LanguageToggle label={s.account.language} /></div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <button onClick={logout} className={`inline-flex h-11 w-full items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-red-600 hover:bg-red-50 ${FOCUS}`}>
          <LogOut className="h-4 w-4" />
          <span className="flex-1 text-left">{s.account.logout}</span>
        </button>
      </div>
    </section>
  );
}

/** Plan and billing: SubscriptionSettings does the Stripe work (checkout, portal, cancel, upgrade). */
function PlanCard() {
  const s = useCopy(settingsCopy);
  return (
    <section className={CARD} aria-labelledby="set-plan">
      <CardTitle icon={CreditCard} id="set-plan" title={s.plan.title} text={s.plan.text} />
      <div className="mt-5"><SubscriptionSettings /></div>
    </section>
  );
}

// ─── PERSONAL SETTINGS ───
function PersonalSettings() {
  const s = useCopy(settingsCopy);
  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{s.personal.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{s.personal.subtitle}</p>
        </header>
        <div className="max-w-xl"><AccountCard /></div>
        <PlanCard />
      </div>
    </AnimatedPage>
  );
}

// ─── BUSINESS SETTINGS ───
type CompanyForm = {
  companyName: string; address: string; city: string; state: string; zipCode: string;
  addressType: string; unitNumber: string; phone: string; email: string; zelleEmail: string;
};
type SavedSettings = { [K in keyof CompanyForm]?: string | null } | null | undefined;

function formFrom(settings: SavedSettings): CompanyForm {
  return {
    companyName: settings?.companyName || "Tu Placa",
    address: settings?.address || "",
    city: settings?.city || "",
    state: settings?.state || "",
    zipCode: settings?.zipCode || "",
    addressType: settings?.addressType || "",
    unitNumber: settings?.unitNumber || "",
    phone: settings?.phone || "",
    email: settings?.email || "",
    zelleEmail: settings?.zelleEmail || "",
  };
}

function BusinessSettings() {
  const s = useCopy(settingsCopy);
  const { data: settings, isLoading, isError, refetch, isFetching } = trpc.settings.get.useQuery();

  const aside = (
    <>
      <AccountCard />
      <CloverSettings />
    </>
  );

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{s.business.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{s.business.subtitle}</p>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="space-y-3" role="status" aria-label={s.business.companyTitle}><Skeleton className="h-[520px] rounded-2xl" /></div>
            <div className="space-y-5">{aside}</div>
          </div>
        ) : isError ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className={`${CARD} text-center`} role="alert">
              <p className="font-semibold text-slate-900">{s.loadError}</p>
              <button onClick={() => refetch()} disabled={isFetching} className={`mt-4 inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />{s.retry}
              </button>
            </div>
            <div className="space-y-5">{aside}</div>
          </div>
        ) : (
          // Mounted once the saved settings arrive, so the form starts from them.
          <BusinessForm initial={formFrom(settings)} aside={aside} />
        )}

        <PlanCard />
      </div>
    </AnimatedPage>
  );
}

function BusinessForm({ initial, aside }: { initial: CompanyForm; aside: ReactNode }) {
  const copy = useCopy(billingCopy).settings;
  const b = copy.business;
  const s = useCopy(settingsCopy).business;
  const types = useCopy(authCopy).onboarding.types;
  const utils = trpc.useUtils();
  const [form, setForm] = useState<CompanyForm>(initial);
  const [saved, setSaved] = useState<CompanyForm>(initial);
  const update = trpc.settings.update.useMutation({
    onSuccess: (_r, vars) => { utils.settings.get.invalidate(); toast.success(b.saved); setSaved({ ...saved, ...vars }); },
    onError: (err) => toast.error(err.message),
  });
  const set = (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const dirty = (Object.keys(form) as (keyof CompanyForm)[]).some((k) => form[k] !== saved[k]);

  // The receipt header, built the same way as in Cobrar.
  const addr = [form.address, form.unitNumber].filter(Boolean).join(", ");
  const cityLine = [form.city, [form.state, form.zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const receiptLines = [addr, cityLine, form.phone].filter(Boolean);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <form className={CARD} aria-labelledby="set-company" onSubmit={(e) => { e.preventDefault(); update.mutate(form); }}>
        <CardTitle icon={Building2} id="set-company" title={s.companyTitle} text={s.companyText} />

        <div className="mt-5 space-y-4">
          <Field id="set-name" label={b.companyName}>
            <input id="set-name" value={form.companyName} onChange={set("companyName")} autoComplete="organization" className={INPUT} />
          </Field>

          <fieldset className="space-y-4 border-t border-slate-100 pt-4">
            <legend className="sr-only">{s.where}</legend>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400" aria-hidden>{s.where}</p>
            <Field id="set-address" label={b.address}>
              <input id="set-address" value={form.address} onChange={set("address")} autoComplete="street-address" className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,1fr)]">
              <div className="col-span-2 sm:col-span-1">
                <Field id="set-city" label={b.city}><input id="set-city" value={form.city} onChange={set("city")} autoComplete="address-level2" className={INPUT} /></Field>
              </div>
              <Field id="set-state" label={b.state}><input id="set-state" value={form.state} onChange={set("state")} maxLength={2} autoComplete="address-level1" className={`${INPUT} uppercase`} /></Field>
              <Field id="set-zip" label={b.zip}><input id="set-zip" value={form.zipCode} onChange={set("zipCode")} inputMode="numeric" autoComplete="postal-code" className={INPUT} /></Field>
            </div>
            <div role="radiogroup" aria-labelledby="set-type-label">
              <p id="set-type-label" className="mb-1.5 text-sm font-medium text-slate-700">{b.locationType}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ADDRESS_TYPES.map(({ value, icon: Icon }) => {
                  const on = form.addressType === value;
                  return (
                    <button key={value} type="button" role="radio" aria-checked={on}
                      onClick={() => setForm({ ...form, addressType: value, unitNumber: value === "Casa" || value === "Tienda" ? "" : form.unitNumber })}
                      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border px-2 text-sm font-semibold transition ${FOCUS} ${on ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />{types[value] ?? value}
                    </button>
                  );
                })}
              </div>
            </div>
            {(form.addressType === "Apartamento" || form.addressType === "Oficina") && (
              <div className="sm:max-w-xs">
                <Field id="set-unit" label={form.addressType === "Apartamento" ? b.aptNumber : b.officeNumber}>
                  <input id="set-unit" value={form.unitNumber} onChange={set("unitNumber")} placeholder={copy.example(form.addressType === "Apartamento" ? "4B" : "201")} className={INPUT} />
                </Field>
              </div>
            )}
          </fieldset>

          <fieldset className="border-t border-slate-100 pt-4">
            <legend className="sr-only">{s.contact}</legend>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400" aria-hidden>{s.contact}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="set-phone" label={b.phone}><input id="set-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" className={INPUT} /></Field>
              <Field id="set-email" label={b.businessEmail}><input id="set-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" className={INPUT} /></Field>
            </div>
          </fieldset>

          <fieldset className="border-t border-slate-100 pt-4">
            <legend className="sr-only">{s.payTitle}</legend>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400" aria-hidden>{s.payTitle}</p>
            <div className="sm:max-w-md">
              <Field id="set-zelle" label={b.zelleEmail} hint={s.zelleHint}>
                <input id="set-zelle" type="email" value={form.zelleEmail} onChange={set("zelleEmail")} placeholder={b.zellePh} autoComplete="off" className={INPUT} />
              </Field>
            </div>
          </fieldset>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`flex items-center gap-1.5 text-sm ${dirty ? "font-medium text-amber-700" : "text-slate-500"}`} role="status">
            {dirty ? <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden /> : <Check className="h-4 w-4 text-emerald-600" aria-hidden />}
            {dirty ? s.unsaved : s.upToDate}
          </p>
          <button type="submit" disabled={update.isPending}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60 sm:h-10 ${FOCUS} focus-visible:ring-offset-2`}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {update.isPending ? b.saving : s.save}
          </button>
        </div>
      </form>

      <div className="space-y-5">
        <section className={CARD} aria-labelledby="set-preview">
          <h2 id="set-preview" className="flex items-center gap-2 font-semibold text-slate-900"><Receipt className="h-4 w-4 text-blue-600" />{s.preview}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{s.previewNote}</p>
          <div className="mx-auto mt-4 max-w-[260px] rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-center font-mono shadow-sm">
            <p className={`text-sm font-bold ${form.companyName.trim() ? "text-slate-900" : "text-slate-400"}`}>{form.companyName.trim() || s.previewEmpty}</p>
            {receiptLines.map((l) => <p key={l} className="mt-0.5 break-words text-[11px] text-slate-600">{l}</p>)}
            <div className="my-3 border-t border-dashed border-slate-300" aria-hidden />
            <div className="space-y-1.5" aria-hidden>
              <div className="flex justify-between gap-6"><span className="h-2 w-24 rounded bg-slate-200" /><span className="h-2 w-10 rounded bg-slate-200" /></div>
              <div className="flex justify-between gap-6"><span className="h-2 w-16 rounded bg-slate-200" /><span className="h-2 w-10 rounded bg-slate-200" /></div>
              <div className="flex justify-between gap-6 pt-1"><span className="h-2 w-12 rounded bg-slate-300" /><span className="h-2 w-12 rounded bg-slate-300" /></div>
            </div>
          </div>
        </section>
        {aside}
      </div>
    </div>
  );
}

// ─── Clover terminal (card payments in Cobrar) ───
function CloverSettings() {
  const { settings } = useCopy(billingCopy);
  const t = settings.clover;
  const s = useCopy(settingsCopy).business;
  const utils = trpc.useUtils();
  const { data: account } = trpc.clover.getAccount.useQuery();
  const connectMut = trpc.clover.connect.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(t.connected(String(data.merchantName))); utils.clover.getAccount.invalidate(); setMerchantId(""); setAccessToken(""); setIsOpen(false); }
      else { toast.error(data.error || t.connectError); }
    },
    onError: (err) => toast.error(err.message),
  });
  const disconnectMut = trpc.clover.disconnect.useMutation({
    onSuccess: () => { toast.success(t.disconnected); utils.clover.getAccount.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const [merchantId, setMerchantId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const isConnected = !!account;

  return (
    <section className={CARD} aria-labelledby="set-clover">
      <button type="button" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-controls="set-clover-body"
        className={`-m-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-xl p-1 text-left ${FOCUS}`}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Receipt className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span id="set-clover" className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            {s.cloverTitle}
            {isConnected && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100"><Wifi className="h-3 w-3" />{t.connectedBadge}</span>}
          </span>
          <span className="block text-sm text-slate-500">{s.cloverText}</span>
        </span>
        <span className="hidden shrink-0 text-sm font-semibold text-blue-600 sm:inline">{isOpen ? s.cloverClose : s.cloverOpen}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {isOpen && (
        <div id="set-clover-body" className="mt-4 border-t border-slate-100 pt-4">
          {isConnected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Wifi className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-slate-900">{account.merchantName || t.connectedFallback}</span>
                <span className="text-xs text-slate-500">({account.merchantId})</span>
              </div>
              {account.deviceId && <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600"><span className="text-slate-500">{t.terminal}</span> {account.deviceName || account.deviceId}</p>}
              {!account.deviceId && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">{t.noTerminal}</p>}
              <button type="button" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}
                className={`inline-flex h-11 items-center gap-2 rounded-[10px] border border-red-200 px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 sm:h-10 ${FOCUS}`}>
                {disconnectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}{t.disconnect}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">{t.intro}</p>
              <Field id="clover-merchant" label={`${s.merchantId} ${s.requiredMark}`}>
                <input id="clover-merchant" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder={settings.example("ABCD123456789")} autoComplete="off" className={INPUT} />
              </Field>
              <Field id="clover-token" label={`${s.apiToken} ${s.requiredMark}`} hint={t.tokenHint}>
                <input id="clover-token" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={settings.example("12345678-1234-1234-1234-123456789abc")} autoComplete="off" className={INPUT} />
              </Field>
              <Field id="clover-device" label={t.deviceLabel} hint={t.deviceHint}>
                <input id="clover-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder={settings.example("C081UG42553306")} autoComplete="off" className={INPUT} />
              </Field>
              <button type="button" onClick={() => connectMut.mutate({ merchantId, accessToken, deviceId: deviceId || undefined })} disabled={connectMut.isPending || !merchantId || !accessToken}
                className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:h-10 ${FOCUS}`}>
                {connectMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />{t.connecting}</> : <><Wifi className="h-4 w-4" />{t.connect}</>}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
