import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Logo } from "@/components/Logo";
import { Loader2, Building2, MapPin, Phone, Mail, Home, Briefcase, Store, Building, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useCopy } from "@/i18n/useI18n";
import { authCopy } from "@/i18n/copy/auth";
import { settingsCopy } from "@/i18n/copy/settings";

type Pending = { email: string; password: string; name: string; mode: "business" | "personal"; acceptTerms?: boolean; marketing?: boolean };

// The bits of Google Places this page uses (the script is loaded at runtime).
type PlaceComponent = { types: string[]; long_name: string; short_name: string };
type Place = { address_components?: PlaceComponent[]; formatted_address?: string };
type Autocomplete = { addListener: (event: string, fn: () => void) => void; getPlace: () => Place };
type Places = { Autocomplete: new (input: HTMLInputElement, opts: object) => Autocomplete };
const places = (): Places | undefined => (window as unknown as { google?: { maps?: { places?: Places } } }).google?.maps?.places;

const ADDRESS_TYPES: { value: string; icon: LucideIcon }[] = [
  { value: "Casa", icon: Home },
  { value: "Apartamento", icon: Building },
  { value: "Oficina", icon: Briefcase },
  { value: "Tienda", icon: Store },
];

const INPUT =
  "h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:text-sm";

/** The sign-up in progress (step 1 saved it for this tab only). */
function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem("register_pending");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Pending>;
    return parsed.email && parsed.password && parsed.name && parsed.mode ? (parsed as Pending) : null;
  } catch {
    return null;
  }
}

function Field({ id, label, icon: Icon, children }: { id: string; label: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />}
        {children}
      </div>
    </div>
  );
}

/** Step 2 of sign-up (business): the details that go on receipts. Creates the account at the end. */
export default function Onboarding() {
  const { onboarding: t } = useCopy(authCopy);
  const s = useCopy(settingsCopy).onboarding;
  const navigate = useNavigate();
  const [pendingRegistration] = useState<Pending | null>(readPending);
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [addressType, setAddressType] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [autocompleteLoaded, setAutocompleteLoaded] = useState(() => !!places());
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Older versions kept the pending sign-up (with the plain-text password) in localStorage forever.
    try { localStorage.removeItem("register_pending"); } catch { /* ignore */ }
    if (!pendingRegistration) {
      sessionStorage.removeItem("register_pending");
      navigate("/register", { replace: true });
    }
  }, [navigate, pendingRegistration]);

  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyDs8MIOA8qk0JwxOkxd8rGxtAmVTeB7CF0";

  useEffect(() => {
    if (autocompleteLoaded) return;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => setAutocompleteLoaded(true);
    document.head.appendChild(script);
  }, [GOOGLE_MAPS_API_KEY, autocompleteLoaded]);

  useEffect(() => {
    const p = places();
    if (!autocompleteLoaded || !addressRef.current || !p) return;
    const autocomplete = new p.Autocomplete(addressRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;
      let street = "", cityVal = "", stateVal = "", zipVal = "";
      place.address_components.forEach((comp) => {
        const kind = comp.types[0];
        if (kind === "street_number") street = comp.long_name + " ";
        if (kind === "route") street += comp.long_name;
        if (kind === "locality") cityVal = comp.long_name;
        if (kind === "administrative_area_level_1") stateVal = comp.short_name;
        if (kind === "postal_code") zipVal = comp.long_name;
      });
      setAddress(street || place.formatted_address || "");
      setCity(cityVal); setState(stateVal); setZipCode(zipVal);
    });
  }, [autocompleteLoaded]);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => { toast.success(t.done); sessionStorage.removeItem("register_pending"); window.location.href = "/"; },
    onError: (err) => toast.error(err.message),
  });

  const registerMut = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        updateSettings.mutate({ companyName, address, addressType, city, state, zipCode, phone, email });
      } else {
        toast.error(data.error || t.createError);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) { toast.error(t.errCompany); return; }
    if (!phone.trim()) { toast.error(t.errPhone); return; }
    if (!email.trim()) { toast.error(t.errEmail); return; }
    if (!address.trim()) { toast.error(t.errAddress); return; }
    if (!city.trim() || !state.trim() || !zipCode.trim()) { toast.error(t.errCity); return; }
    if (!addressType) { toast.error(t.errType); return; }
    if (!pendingRegistration) { toast.error(t.errPending); return; }
    registerMut.mutate(pendingRegistration);
  };

  const handleCancel = () => {
    if (window.confirm(t.cancelConfirm)) {
      sessionStorage.removeItem("register_pending");
      navigate("/login", { replace: true });
    }
  };

  const busy = registerMut.isPending || updateSettings.isPending;

  return (
    <div className="font-brand relative flex min-h-screen items-start justify-center overflow-hidden bg-[#060B18] px-4 pb-10 pt-16 sm:items-center sm:py-12">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[120px]" />
      <div className="relative w-full max-w-lg animate-in fade-in slide-in-from-bottom-3 rounded-2xl bg-white p-5 shadow-[0_30px_80px_-20px_rgba(2,6,23,0.6)] duration-500 sm:p-7">
        <button
          type="button"
          onClick={handleCancel}
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={t.cancel}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <Logo className="mb-4 h-10 w-10" />
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold text-blue-600">{t.step}</p>
            <div className="flex flex-1 gap-1" aria-hidden>
              <span className="h-1.5 flex-1 rounded-full bg-blue-600" />
              <span className="h-1.5 flex-1 rounded-full bg-blue-600" />
            </div>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id="ob-company" label={t.company} icon={Building2}>
            <input id="ob-company" placeholder={t.companyPh} value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="organization" className={`${INPUT} pl-9`} />
          </Field>
          <p className="-mt-2 text-xs text-slate-500">{s.companyHint}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ob-phone" label={t.phone} icon={Phone}>
              <input id="ob-phone" type="tel" inputMode="tel" placeholder="(555) 000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" className={`${INPUT} pl-9`} />
            </Field>
            <Field id="ob-email" label={t.email} icon={Mail}>
              <input id="ob-email" type="email" placeholder={t.emailPh} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={`${INPUT} pl-9`} />
            </Field>
          </div>

          <Field id="ob-address" label={t.address} icon={MapPin}>
            <input id="ob-address" ref={addressRef} placeholder={t.addressPh} value={address} onChange={(e) => setAddress(e.target.value)} className={`${INPUT} pl-9`} />
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,1fr)]">
            <div className="col-span-2 sm:col-span-1">
              <Field id="ob-city" label={t.city}>
                <input id="ob-city" placeholder={t.cityPh} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" className={INPUT} />
              </Field>
            </div>
            <Field id="ob-state" label={t.state}>
              <input id="ob-state" placeholder="AL" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} autoComplete="address-level1" className={`${INPUT} uppercase`} />
            </Field>
            <Field id="ob-zip" label={t.zip}>
              <input id="ob-zip" placeholder="12345" value={zipCode} onChange={(e) => setZipCode(e.target.value)} maxLength={10} inputMode="numeric" autoComplete="postal-code" className={INPUT} />
            </Field>
          </div>

          <div role="radiogroup" aria-labelledby="ob-type">
            <p id="ob-type" className="mb-1.5 text-sm font-medium text-slate-700">{t.type}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ADDRESS_TYPES.map(({ value, icon: Icon }) => {
                const sel = addressType === value;
                return (
                  <button key={value} type="button" role="radio" aria-checked={sel} onClick={() => setAddressType(value)}
                    className={`flex h-14 flex-col items-center justify-center gap-1 rounded-[10px] border px-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${sel ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                    {t.types[value] ?? value}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-slate-500">{s.required}</p>

          <button type="submit" disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
