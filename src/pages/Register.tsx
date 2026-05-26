import { useState } from "react";
import { Link, Navigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, Receipt, Wallet, TrendingUp, Shield, Building2, User } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"business" | "personal">("business");
  const { isAuthenticated, user } = useAuth();

  // If already authenticated, redirect based on mode
  if (isAuthenticated && user?.modePreference) {
    return <Navigate to={user.modePreference === "personal" ? "/personal" : "/"} replace />;
  }

  const registerMut = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        toast.success("Cuenta creada exitosamente");
        // Redirect based on user's registered mode from backend
        const isPersonal = data.user.modePreference === "personal";
        console.log("[Register] User mode:", data.user.modePreference, "Redirect to:", isPersonal ? "/personal" : "/onboarding");
        window.location.href = isPersonal ? "/personal" : "/onboarding";
      } else {
        toast.error(data.error || "Error al crear cuenta");
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      toast.error("Completa todos los campos");
      return;
    }
    if (password.length < 6) {
      toast.error("La contrasena debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Las contrasenas no coinciden");
      return;
    }
    registerMut.mutate({ email, password, name, mode });
  };

  return (
    <div className="min-h-screen flex relative">
      {/* Mobile video background - full screen */}
      <div className="absolute inset-0 z-0 lg:hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="w-full h-full object-cover"
        >
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* ─── LEFT PANEL: Video background (desktop only) ─── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col justify-between p-10 relative overflow-hidden">
        {/* Video background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
        >
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
        </video>

        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/50 z-[1]" />

        {/* Top */}
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <div>
              <span className="text-white font-semibold text-lg">Ai Aethel</span>
              <p className="text-neutral-400 text-[10px]">Accountant</p>
            </div>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
              Empieza a<br />
              <span className="text-neutral-300">crecer hoy.</span>
            </h2>
            <p className="text-neutral-300 text-sm max-w-sm">
              Unete a miles de empresarios que ya gestionan sus finanzas con Aethel. Rapido, seguro y sin complicaciones.
            </p>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {[
              { icon: Wallet, label: "Contabilidad Autónoma", desc: "Tu libro diario con Ai Aethel se actualiza solo, sin tocar una tecla" },
              { icon: TrendingUp, label: "Análisis Predictivo", desc: "Proyecta tu flujo de caja con Ai Aethel y detecta riesgos antes de que ocurran" },
              { icon: Shield, label: "Cumplimiento Fiscal", desc: "Reportes listos para la DGII con Ai Aethel, calculados en tiempo real" },
              { icon: Receipt, label: "Banca Conectada", desc: "Tus transacciones con Ai Aethel se concilian automáticamente cada día" },
            ].map((f) => (
              <div key={f.label} className="bg-black/60 border border-white/10 rounded-lg p-3 backdrop-blur-md">
                <f.icon className="w-4 h-4 text-white mb-2" />
                <p className="text-white text-xs font-medium leading-tight">{f.label}</p>
                <p className="text-neutral-300 text-[11px] leading-relaxed mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: AI agent tagline */}
        <div className="relative z-10">
          <p className="text-neutral-400 text-xs">
            Agente de AI contable profesional para tu negocio, marketing y asistencia artificial para tu base de datos de clientes
          </p>
        </div>
      </div>

      {/* ─── RIGHT PANEL: Register Form ─── */}
      <div className="flex-1 flex items-center justify-center lg:bg-white p-6 sm:p-8 lg:p-8 relative z-10">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
            <Logo className="w-10 h-10" />
            <div className="text-center">
              <span className="text-white font-semibold text-xl block">Ai Aethel</span>
              <p className="text-neutral-300 text-xs">Accountant</p>
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className={`text-3xl font-semibold transition-colors duration-300 ${mode === "personal" ? "text-white" : "text-black"}`}>Crea tu cuenta</h1>
            <p className={`text-base transition-colors duration-300 ${mode === "personal" ? "text-neutral-400" : "text-neutral-400"}`}>Empieza gratis, sin tarjeta de credito</p>
          </div>

          <Card className={`rounded-2xl shadow-none border transition-colors duration-300 ${
            mode === "personal" ? "bg-black border-white/20 text-white" : "bg-white border-neutral-200 text-black"
          }`}>
            <CardContent className="p-6 sm:p-8">
              {/* Mode Toggle */}
              {/* Animated Mode Switch — Business = Black, Personal = White */}
              <div className="flex items-center justify-center mb-5">
                <div className="relative flex items-center p-1 bg-neutral-200 rounded-xl w-full max-w-[280px] overflow-hidden">
                  {/* Sliding background pill — Black for Business, White for Personal */}
                  <div
                    className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-lg transition-all duration-300 ease-out ${
                      mode === "personal" ? "bg-black" : "bg-white"
                    }`}
                    style={{
                      left: mode === "business" ? "4px" : "calc(50%)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setMode("business")}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors duration-300 ${
                      mode === "business" ? "text-black" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    <Building2 className={`w-4 h-4 transition-transform duration-300 ${mode === "business" ? "scale-110" : "scale-100"}`} /> Negocios
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("personal")}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors duration-300 ${
                      mode === "personal" ? "text-white" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    <User className={`w-4 h-4 transition-transform duration-300 ${mode === "personal" ? "scale-110" : "scale-100"}`} /> Personal
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-400" : "text-neutral-500"}`}>Nombre completo</Label>
                  <Input
                    placeholder="Tu nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`mt-1.5 rounded-xl h-12 text-base transition-colors duration-300 ${mode === "personal" ? "border-white/30 bg-white/10 text-white placeholder:text-neutral-500" : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"}`}
                  />
                </div>
                <div>
                  <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-400" : "text-neutral-500"}`}>Email</Label>
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`mt-1.5 rounded-xl h-12 text-base transition-colors duration-300 ${mode === "personal" ? "border-white/30 bg-white/10 text-white placeholder:text-neutral-500" : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"}`}
                  />
                </div>
                <div>
                  <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-400" : "text-neutral-500"}`}>Contrasena</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`pr-10 rounded-xl h-12 text-base transition-colors duration-300 ${mode === "personal" ? "border-white/30 bg-white/10 text-white placeholder:text-neutral-500" : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-300 ${mode === "personal" ? "text-neutral-400 hover:text-white" : "text-neutral-400 hover:text-neutral-600"}`}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-400" : "text-neutral-500"}`}>Confirmar contrasena</Label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Repite tu contrasena"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`mt-1.5 rounded-xl h-12 text-base transition-colors duration-300 ${mode === "personal" ? "border-white/30 bg-white/10 text-white placeholder:text-neutral-500" : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"}`}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={registerMut.isPending}
                  className={`w-full rounded-lg h-10 mt-2 transition-colors duration-300 !text-white ${mode === "personal" ? "bg-white !text-black hover:bg-neutral-200" : "bg-black hover:bg-neutral-800"}`}
                >
                  {registerMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Crear Cuenta
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="text-center space-y-3">
            <p className="text-sm text-neutral-300 lg:text-neutral-400">
              Al registrarte, aceptas nuestros <Link to="#" className="text-white lg:text-black hover:underline">Terminos</Link> y <Link to="#" className="text-white lg:text-black hover:underline">Privacidad</Link>
            </p>
            <p className={`text-sm transition-colors duration-300 ${mode === "personal" ? "text-neutral-500" : "text-neutral-400"}`}>
              Ya tienes cuenta?{" "}
              <Link to="/login" className="text-white transition-colors duration-300 hover:underline font-medium hover:text-neutral-200">Inicia sesion</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
