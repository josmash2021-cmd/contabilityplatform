import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { Loader2, Building2, MapPin, Phone, Mail, ArrowLeft, Home, Briefcase, Store, Building } from "lucide-react";
import { toast } from "sonner";

// Google Places types
declare global {
  interface Window {
    google: any;
  }
}

const ADDRESS_TYPES = [
  { value: "Casa", label: "Casa", icon: Home },
  { value: "Apartamento", label: "Apartamento", icon: Building },
  { value: "Oficina", label: "Oficina", icon: Briefcase },
  { value: "Tienda", label: "Tienda", icon: Store },
];

export default function Onboarding() {
  const navigate = useNavigate();
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

  // Load Google Places API
  useEffect(() => {
    if (window.google?.maps?.places) {
      setAutocompleteLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_MAPS_API_KEY || ""}&libraries=places`;
    script.async = true;
    script.onload = () => setAutocompleteLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize autocomplete on address input
  useEffect(() => {
    if (!autocompleteLoaded || !addressRef.current || !window.google?.maps?.places) return;

    const autocomplete = new window.google.maps.places.Autocomplete(addressRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      let street = "";
      let cityVal = "";
      let stateVal = "";
      let zipVal = "";

      place.address_components.forEach((comp: any) => {
        const type = comp.types[0];
        if (type === "street_number") street = comp.long_name + " ";
        if (type === "route") street += comp.long_name;
        if (type === "locality") cityVal = comp.long_name;
        if (type === "administrative_area_level_1") stateVal = comp.short_name;
        if (type === "postal_code") zipVal = comp.long_name;
      });

      setAddress(street || place.formatted_address || "");
      setCity(cityVal);
      setState(stateVal);
      setZipCode(zipVal);
    });
  }, [autocompleteLoaded]);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Negocio configurado exitosamente");
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) { toast.error("El nombre del negocio es requerido"); return; }
    if (!address.trim()) { toast.error("La direccion es requerida"); return; }
    if (!addressType) { toast.error("Selecciona el tipo de direccion"); return; }
    if (!phone.trim()) { toast.error("El telefono es requerido"); return; }
    if (!email.trim()) { toast.error("El email del negocio es requerido"); return; }
    if (!city.trim() || !state.trim() || !zipCode.trim()) {
      toast.error("Completa la direccion completa con ciudad, estado y ZIP");
      return;
    }

    updateSettings.mutate({
      companyName: companyName.trim(),
      address: address.trim(),
      addressType,
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
  };

  const isComplete = companyName.trim() && address.trim() && addressType && phone.trim() && email.trim() && city.trim() && state.trim() && zipCode.trim();

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>

        <div className="text-center space-y-2">
          <Logo className="w-12 h-12 mx-auto mb-3" />
          <h1 className="text-2xl font-medium text-black">Configura tu negocio</h1>
          <p className="text-neutral-400 text-sm">
            Ingresa la informacion de tu empresa para comenzar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Company Name */}
          <div>
            <Label className="text-xs text-neutral-500">Nombre del negocio *</Label>
            <div className="relative mt-1">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Ej: Ai Aethel Accountant, LLC"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="pl-10 rounded-lg border-neutral-200"
                autoFocus
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <Label className="text-xs text-neutral-500">Telefono *</Label>
            <div className="relative mt-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="(555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-10 rounded-lg border-neutral-200"
                type="tel"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <Label className="text-xs text-neutral-500">Email del negocio *</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                type="email"
                placeholder="negocio@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 rounded-lg border-neutral-200"
              />
            </div>
          </div>

          {/* Address with Google Autocomplete */}
          <div>
            <Label className="text-xs text-neutral-500">Direccion *</Label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 z-10" />
              <Input
                ref={addressRef}
                placeholder="Escribe tu direccion..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="pl-10 rounded-lg border-neutral-200"
              />
            </div>
            {!autocompleteLoaded && (
              <p className="text-[11px] text-neutral-400 mt-1">Cargando autocomplete...</p>
            )}
          </div>

          {/* City, State, ZIP in a row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-neutral-500">Ciudad *</Label>
              <Input
                placeholder="Ciudad"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 rounded-lg border-neutral-200"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-500">Estado *</Label>
              <Input
                placeholder="CA"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1 rounded-lg border-neutral-200"
                maxLength={2}
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-500">ZIP *</Label>
              <Input
                placeholder="12345"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="mt-1 rounded-lg border-neutral-200"
                maxLength={10}
              />
            </div>
          </div>

          {/* Address Type */}
          <div>
            <Label className="text-xs text-neutral-500">Tipo de ubicacion *</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {ADDRESS_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = addressType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setAddressType(type.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border transition-all duration-200 ${
                      isSelected
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={updateSettings.isPending || !isComplete}
            className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-11 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateSettings.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Continuar
          </Button>
        </form>
      </div>
    </div>
  );
}
