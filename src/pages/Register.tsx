import { useState } from "react";
import { Link, Navigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Eye, EyeOff, Receipt, Wallet, TrendingUp, Shield,
  Building2, User, CreditCard, Target, PiggyBank, BarChart3,
} from "lucide-react";
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
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Video background - FULL SCREEN for all devices */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover z-0"
      >
        <source src="/videos/hero-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/50 z-[1]" />

      {/* ─── LEFT PANEL: Hero content (desktop only) ─── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col justify-between p-10 relative z-10">
        {/* Top */}
        <div className="flex items-center gap-2">
          <Logo className="w-8 h-8" />
          <div>
            <span className="text-white font-semibold text-lg">Ai Aethel</span>
            <p className="text-neutral-400 text-[10px]">Accountant</p>
          </div>
        </div>

        {/* Center content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight transition-all duration-500">
              {mode === "business" ? (
                <>Empieza a<br /><span className="text-neutral-300">crecer hoy.</span></>
              ) : (
                <>Toma el control<br /><span className="text-neutral-300">de tu dinero.</span></>
              )}
            </h2>
            <p className="text-neutral-300 text-sm max-w-sm transition-all duration-500">
              {mode === "business"
                ? "Unete a miles de empresarios que ya gestionan sus finanzas con Aethel. Rapido, seguro y sin complicaciones."
                : "Conecta tus cuentas, categoriza tus gastos y descubre donde va tu dinero con inteligencia artificial."
              }
            </p>
          </div>

          {/* Feature cards - animated */}
          <div className="grid grid-cols-2 gap-3 max-w-md" key={mode}>
            {(mode === "business" ? [
              { icon: Wallet, label: "Contabilidad Autónoma", desc: "Tu libro diario con Ai Aethel se actualiza solo, sin tocar una tecla" },
              { icon: TrendingUp, label: "Análisis Predictivo", desc: "Proyecta tu flujo de caja con Ai Aethel y detecta riesgos antes de que ocurran" },
              { icon: Shield, label: "Cumplimiento Fiscal", desc: "Reportes listos para la DGII con Ai Aethel, calculados en tiempo real" },
              { icon: Receipt, label: "Banca Conectada", desc: "Tus transacciones con Ai Aethel se concilian automáticamente cada día" },
            ] : [
              { icon: CreditCard, label: "Control de Gastos", desc: "Categoriza automáticamente cada compra y ve en qué gastas tu dinero" },
              { icon: Target, label: "Presupuesto Inteligente", desc: "Establece límites por categoría y recibe alertas antes de pasarte" },
              { icon: PiggyBank, label: "Metas de Ahorro", desc: "Visualiza tus objetivos de ahorro y el progreso mes a mes" },
              { icon: BarChart3, label: "Banca Conectada", desc: "Conecta todas tus cuentas bancarias en un solo lugar, en tiempo real" },
            ]).map((f, i) => (
              <div
                key={f.label}
                className="bg-white/10 border border-white/20 rounded-lg p-3 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-500"
                style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
              >
                <f.icon className="w-4 h-4 text-white mb-2" />
                <p className="text-white text-xs font-medium leading-tight">{f.label}</p>
                <p className="text-white/80 text-[11px] leading-relaxed mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="text-neutral-400 text-xs transition-all duration-500">
          {mode === "business"
            ? "Agente de AI contable profesional para tu negocio, marketing y asistencia artificial para tu base de datos de clientes"
            : "Asistente de finanzas personales con AI: presupuestos, ahorro y análisis de gastos automatizado"
          }
        </p>
      </div>

      {/* ─── RIGHT PANEL: Register Form (transparent glassmorphism) ─── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative z-10">
        <div className="w-full max-w-sm space-y-6 animate-in fade-in slide-in-from-right-8 duration-700">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
            <Logo className="w-10 h-10" />
            <div className="text-center">
              <span className="text-white font-semibold text-xl block">Ai Aethel</span>
              <p className="text-neutral-300 text-xs">Accountant</p>
            </div>
          </div>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3">
            <Logo className="w-10 h-10" />
            <div className="text-center">
              <span className="text-white font-semibold text-xl block">Ai Aethel</span>
              <p className="text-neutral-300 text-xs">Accountant</p>
            </div>
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-2xl font-semibold text-white">Crea tu cuenta</h1>
            <p className="text-sm text-neutral-400">Empieza gratis, sin tarjeta de credito</p>
          </div>

          {/* Glassmorphism card */}
          <div className="bg-white/10 border border-white/20 rounded-2xl backdrop-blur-md">
            <div className="p-5 sm:p-6">
              {/* Mode Toggle */}
              <div className="flex items-center justify-center mb-4">
                <div className="relative flex items-center p-1 bg-neutral-200/20 rounded-xl w-full max-w-[280px] overflow-hidden">
                  <div
                    className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-lg transition-all duration-300 ease-out"
                    style={{ left: mode === "business" ? "4px" : "calc(50%)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setMode("business")}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors duration-300 ${
                      mode === "business" ? "text-black" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Building2 className="w-4 h-4" /> Negocios
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("personal")}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors duration-300 ${
                      mode === "personal" ? "text-black" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <User className="w-4 h-4" /> Personal
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-xs text-neutral-400">Nombre completo</Label>
                  <Input
                    placeholder="Tu nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 rounded-xl border-white/30 bg-gray-900/80 text-white placeholder:text-neutral-500 h-11 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-neutral-400">Email</Label>
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 rounded-xl border-white/30 bg-gray-900/80 text-white placeholder:text-neutral-500 h-11 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-neutral-400">Contrasena</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10 rounded-xl border-white/30 bg-gray-900/80 text-white placeholder:text-neutral-500 h-11 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-neutral-400">Confirmar contrasena</Label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Repite tu contrasena"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 rounded-xl border-white/30 bg-gray-900/80 text-white placeholder:text-neutral-500 h-11 text-sm"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={registerMut.isPending}
                  className="w-full rounded-lg h-10 bg-white text-black hover:bg-neutral-200 font-medium"
                >
                  {registerMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Crear Cuenta
                </Button>
              </form>
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-xs text-neutral-400">
              Al registrarte, aceptas nuestros <Link to="#" className="text-white hover:underline">Terminos</Link> y <Link to="#" className="text-white hover:underline">Privacidad</Link>
            </p>
            <p className="text-sm text-neutral-400">
              Ya tienes cuenta?{" "}
              <Link to="/login" className="text-white hover:underline font-medium">Inicia sesion</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
