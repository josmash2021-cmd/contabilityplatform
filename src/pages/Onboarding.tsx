import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { Loader2, Building2, MapPin, Phone, Mail, Home, Briefcase, Store, Building, X } from "lucide-react";
import { toast } from "sonner";

declare global {
  interface Window {
    google: any;
  }
}

const ADDRESS_TYPES = [
  { value: "Casa", icon: Home },
  { value: "Apartamento", icon: Building },
  { value: "Oficina", icon: Briefcase },
  { value: "Tienda", icon: Store },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [pendingRegistration, setPendingRegistration] = useState<{ email: string; password: string; name: string; mode: "business" | "personal" } | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [addressType, setAddressType] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [autocompleteLoaded, setAutocompleteLoaded] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem("register_pending");
    if (!raw) {
      navigate("/register", { replace: true });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.email || !parsed.password || !parsed.name || !parsed.mode) {
        localStorage.removeItem("register_pending");
        navigate("/register", { replace: true });
        return;
      }
      setPendingRegistration(parsed);
    } catch {
      localStorage.removeItem("register_pending");
      navigate("/register", { replace: true });
    }
  }, [navigate]);

  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyDs8MIOA8qk0JwxOkxd8rGxtAmVTeB7CF0";

  useEffect(() => {
    if (window.google?.maps?.places) {
      setAutocompleteLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => setAutocompleteLoaded(true);
    document.head.appendChild(script);
  }, [GOOGLE_MAPS_API_KEY]);

  useEffect(() => {
    if (!autocompleteLoaded || !addressRef.current || !window.google?.maps?.places) return;
    const autocomplete = new window.google.maps.places.Autocomplete(addressRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;
      let street = "", cityVal = "", stateVal = "", zipVal = "";
      place.address_components.forEach((comp: any) => {
        const t = comp.types[0];
        if (t === "street_number") street = comp.long_name + " ";
        if (t === "route") street += comp.long_name;
        if (t === "locality") cityVal = comp.long_name;
        if (t === "administrative_area_level_1") stateVal = comp.short_name;
        if (t === "postal_code") zipVal = comp.long_name;
      });
      setAddress(street || place.formatted_address || "");
      setCity(cityVal); setState(stateVal); setZipCode(zipVal);
    });
  }, [autocompleteLoaded]);

  // Auto-run DB migration on page load
  const migrateQuery = trpc.settings.migrate.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => { toast.success("Negocio configurado"); localStorage.removeItem("register_pending"); window.location.href = "/"; },
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
        toast.error(data.error || "Error al crear cuenta");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) { toast.error("Nombre del negocio requerido"); return; }
    if (!phone.trim()) { toast.error("Telefono requerido"); return; }
    if (!email.trim()) { toast.error("Email requerido"); return; }
    if (!address.trim()) { toast.error("Direccion requerida"); return; }
    if (!city.trim() || !state.trim() || !zipCode.trim()) { toast.error("Completa ciudad, estado y ZIP"); return; }
    if (!addressType) { toast.error("Selecciona tipo de ubicacion"); return; }
    if (!pendingRegistration) { toast.error("No hay registro pendiente"); return; }
    registerMut.mutate(pendingRegistration);
  };

  const handleCancel = () => {
    if (window.confirm("Estas seguro que quieres salirte? Perderas el progreso de registro")) {
      localStorage.removeItem("register_pending");
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 overflow-hidden">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        {/* Cancel button */}
        <button
          type="button"
          onClick={handleCancel}
          className="absolute top-3 right-3 p-1.5 rounded-full text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
          aria-label="Cancelar registro"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-4">
          <Logo className="w-8 h-8 mx-auto mb-2" />
          <h1 className="text-lg font-semibold text-black">Tu negocio</h1>
          <p className="text-[11px] text-neutral-400">Completa para comenzar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Row 1: Company + Phone */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-neutral-500">Negocio *</Label>
              <div className="relative">
                <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <Input placeholder="Nombre" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="pl-7 h-9 text-xs rounded-lg border-neutral-200" />
              </div>
            </div>
            <div>
              <Label className="text-[10px] text-neutral-500">Telefono *</Label>
              <div className="relative">
                <Phone className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <Input placeholder="(555) 000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-7 h-9 text-xs rounded-lg border-neutral-200" type="tel" />
              </div>
            </div>
          </div>

          {/* Row 2: Email */}
          <div>
            <Label className="text-[10px] text-neutral-500">Email del negocio *</Label>
            <div className="relative">
              <Mail className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
              <Input type="email" placeholder="negocio@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-7 h-9 text-xs rounded-lg border-neutral-200" />
            </div>
          </div>

          {/* Row 3: Address */}
          <div>
            <Label className="text-[10px] text-neutral-500">Direccion *</Label>
            <div className="relative">
              <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 z-10" />
              <Input ref={addressRef} placeholder="Escribe tu direccion..." value={address} onChange={(e) => setAddress(e.target.value)} className="pl-7 h-9 text-xs rounded-lg border-neutral-200" />
            </div>
          </div>

          {/* Row 4: City / State / ZIP */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] text-neutral-500">Ciudad *</Label>
              <Input placeholder="Ciudad" value={city} onChange={(e) => setCity(e.target.value)} className="h-9 text-xs rounded-lg border-neutral-200" />
            </div>
            <div>
              <Label className="text-[10px] text-neutral-500">Estado *</Label>
              <Input placeholder="CA" value={state} onChange={(e) => setState(e.target.value)} className="h-9 text-xs rounded-lg border-neutral-200" maxLength={2} />
            </div>
            <div>
              <Label className="text-[10px] text-neutral-500">ZIP *</Label>
              <Input placeholder="12345" value={zipCode} onChange={(e) => setZipCode(e.target.value)} className="h-9 text-xs rounded-lg border-neutral-200" maxLength={10} />
            </div>
          </div>

          {/* Row 5: Address Type */}
          <div>
            <Label className="text-[10px] text-neutral-500">Tipo *</Label>
            <div className="grid grid-cols-4 gap-2 mt-0.5">
              {ADDRESS_TYPES.map((t) => {
                const Icon = t.icon;
                const sel = addressType === t.value;
                return (
                  <button key={t.value} type="button" onClick={() => setAddressType(t.value)}
                    className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border transition-all text-[10px] font-medium ${sel ? "border-black bg-black text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}>
                    <Icon className="w-4 h-4" />
                    {t.value}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <Button type="submit" disabled={registerMut.isPending || updateSettings.isPending}
            className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-10 text-sm mt-1">
            {registerMut.isPending || updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Continuar
          </Button>
        </form>
      </div>
    </div>
  );
}
