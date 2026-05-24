import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2, Building2, MapPin, Phone, Mail, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Onboarding() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

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
    if (!companyName.trim()) {
      toast.error("El nombre del negocio es requerido");
      return;
    }
    if (!address.trim()) {
      toast.error("La direccion es requerida");
      return;
    }
    if (!phone.trim()) {
      toast.error("El telefono es requerido");
      return;
    }
    if (!email.trim()) {
      toast.error("El email del negocio es requerido");
      return;
    }
    updateSettings.mutate({
      companyName: companyName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
  };

  const isComplete = companyName.trim() && address.trim() && phone.trim() && email.trim();

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-sm space-y-6">
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

        <Card className="border-neutral-200 rounded-lg shadow-none">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs text-neutral-500">
                  Nombre del negocio *
                </Label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <Input
                    placeholder="Ej: Ai Aethel Accountant, LLC"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="pl-10 rounded-lg border-neutral-200"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-neutral-500">Direccion *</Label>
                <div className="relative mt-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <Input
                    placeholder="Calle, ciudad, estado"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="pl-10 rounded-lg border-neutral-200"
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-neutral-500">Telefono *</Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <Input
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10 rounded-lg border-neutral-200"
                    required
                  />
                </div>
              </div>

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
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={updateSettings.isPending || !isComplete}
                className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-10 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateSettings.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Continuar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
