import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, Receipt, Wallet, TrendingUp, Shield, Building2, User } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"business" | "personal">("business");

  const loginMut = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        toast.success("Bienvenido");
        // Redirect based on user mode from backend
        const isPersonal = data.user.modePreference === "personal";
        window.location.href = isPersonal ? "/personal" : "/";
      } else {
        toast.error(data.error || "Error al iniciar sesion");
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Completa todos los campos");
      return;
    }
    loginMut.mutate({ email, password, mode });
  };

  return (
    <div className="min-h-screen flex relative">
      {/* Video background - ALL screen sizes */}
      <div className="fixed inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/logo.png"
          className="w-full h-full object-cover"
          style={{ minHeight: "100vh", minWidth: "100vw" }}
        >
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
        </video>
        {/* Overlay: lighter on mobile, darker on desktop */}
        <div className="absolute inset-0 bg-black/20 lg:bg-black/50" />
      </div>

      {/* ─── LEFT PANEL: Content over video (desktop only) ─── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col justify-between p-10 relative z-10">

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
              Tu negocio,<br />
              <span className="text-neutral-300">organizado.</span>
            </h2>
            <p className="text-neutral-300 text-sm max-w-sm">
              La plataforma contable que automatiza tus finanzas, conecta tu banco y simplifica tu día a día.
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
              <div key={f.label} className="bg-white/10 border border-white/20 rounded-lg p-3 backdrop-blur-md">
                <f.icon className="w-4 h-4 text-white mb-2" />
                <p className="text-white text-xs font-medium leading-tight">{f.label}</p>
                <p className="text-white/80 text-[11px] leading-relaxed mt-1">{f.desc}</p>
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

      {/* ─── RIGHT PANEL: Login Form ─── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-8 relative z-10">
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
            <h1 className="text-3xl font-semibold text-white lg:text-black">Bienvenido de vuelta</h1>
            <p className="text-neutral-300 lg:text-neutral-400 text-base">Inicia sesion en tu cuenta</p>
          </div>

          <Card className="border-white/20 rounded-2xl shadow-none bg-black/60 backdrop-blur-md lg:bg-white lg:border-neutral-200">
            <CardContent className="p-6 sm:p-8">
              {/* Mode Toggle */}
              {/* Animated Mode Switch */}
              <div className="flex items-center justify-center mb-5">
                <div className="relative flex items-center p-1 bg-neutral-100/80 backdrop-blur-sm rounded-xl w-full max-w-[280px]">
                  {/* Sliding background pill */}
                  <div
                    className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-md transition-all duration-300 ease-out"
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
                      mode === "personal" ? "text-black" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    <User className={`w-4 h-4 transition-transform duration-300 ${mode === "personal" ? "scale-110" : "scale-100"}`} /> Personal
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <Label className="text-xs text-neutral-300 lg:text-neutral-500">Email</Label>
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 rounded-xl border-white/30 bg-white/10 text-white placeholder:text-neutral-400 lg:bg-white lg:border-neutral-200 lg:text-black h-12 text-base"
                  />
                </div>
                <div>
                  <Label className="text-xs text-neutral-300 lg:text-neutral-500">Contrasena</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Tu contrasena"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10 rounded-xl border-white/30 bg-white/10 text-white placeholder:text-neutral-400 lg:bg-white lg:border-neutral-200 lg:text-black h-12 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loginMut.isPending}
                  className="w-full bg-black text-white hover:bg-neutral-800 rounded-lg h-10 mt-2"
                >
                  {loginMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Iniciar Sesion
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="text-center space-y-3 mt-4">
            <p className="text-sm">
              <Link to="/forgot-password" className="text-white/80 hover:text-white hover:underline">Olvidaste tu contrasena?</Link>
            </p>
            <p className="text-sm text-white/60">
              No tienes cuenta?{" "}
              <Link to="/register" className="text-white hover:underline font-medium">Registrate</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
