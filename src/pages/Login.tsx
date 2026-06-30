import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, Receipt, Wallet, TrendingUp, Shield, Building2, User, PiggyBank, Target, BarChart3, CreditCard } from "lucide-react";
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
    <div className={`relative z-10 w-full min-h-screen lg:min-h-0 lg:h-full flex flex-col p-4 sm:p-6 lg:py-4 lg:px-2 xl:py-5 xl:px-3 transition-colors duration-500 bg-black/60 backdrop-blur-sm ${
      mode === "business"
        ? "lg:bg-black"
        : "lg:bg-white"
    }`}>
        {/* Mobile: centered form over Spline */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm lg:max-w-md space-y-4">
            {/* Mobile logo */}
            <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
              <Logo className="w-10 h-10" />
              <div className="text-center">
                <span className="text-white font-semibold text-xl block">Ai Aethel</span>
                <p className="text-neutral-300 text-xs">Accountant</p>
              </div>
            </div>

            {/* Headline - desktop only */}
            <div className="hidden lg:block space-y-1">
              <h2 className={`text-3xl xl:text-4xl font-bold leading-tight transition-all duration-500 ${mode === "business" ? "text-white" : "text-black"}`}>
                {mode === "business" ? (
                  <>Tu negocio,<br /><span className="text-neutral-400">organizado.</span></>
                ) : (
                  <>Tus finanzas,<br /><span className="text-neutral-500">en control.</span></>
                )}
              </h2>
              <p className={`text-sm transition-all duration-500 ${mode === "business" ? "text-neutral-300" : "text-neutral-600"}`}>
                {mode === "business"
                  ? "La plataforma contable que automatiza tus finanzas, conecta tu banco y simplifica tu día a día."
                  : "Conecta tu banco, categoriza tus gastos y toma el control de tu dinero personal con inteligencia artificial."
                }
              </p>
            </div>

            <div className="text-center space-y-1">
              <h1 className={`text-2xl lg:text-3xl font-semibold text-white transition-colors duration-500 ${mode === "business" ? "lg:text-white" : "lg:text-black"}`}>Bienvenido de vuelta</h1>
              <p className={`text-neutral-300 text-base transition-colors duration-500 ${mode === "business" ? "lg:text-neutral-400" : "lg:text-neutral-500"}`}>Inicia sesion en tu cuenta</p>
            </div>

            <Card className={`rounded-2xl shadow-xl border transition-colors duration-300 ${
              mode === "personal"
                ? "bg-black border-white/20 text-white"
                : "bg-white border-neutral-200 text-black"
            }`}>
              <CardContent className="p-6 sm:p-8">
                {/* Mode Toggle */}
                <div className="flex items-center justify-center mb-5">
                  <div className={`relative flex items-center p-1 rounded-xl w-full max-w-[280px] overflow-hidden transition-colors duration-300 ${
                    mode === "personal" ? "bg-black" : "bg-white border border-neutral-200"
                  }`}>
                    {/* Sliding background pill */}
                    <div
                      className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-lg transition-all duration-300 ease-out ${
                        mode === "personal" ? "bg-white" : "bg-black"
                      }`}
                      style={{
                        left: mode === "business" ? "4px" : "calc(50%)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setMode("business")}
                      className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors duration-300 ${
                        mode === "business" ? "text-white" : "text-neutral-500 hover:text-neutral-300"
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
                    <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-300" : "text-neutral-500"}`}>Email</Label>
                    <Input
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`mt-1.5 rounded-xl h-12 text-base transition-colors duration-300 ${
                        mode === "personal"
                          ? "border-white/30 bg-black text-white placeholder:text-neutral-500"
                          : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
                      }`}
                    />
                  </div>
                  <div>
                    <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-300" : "text-neutral-500"}`}>Contrasena</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Tu contrasena"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`pr-10 rounded-xl h-12 text-base transition-colors duration-300 ${
                          mode === "personal"
                            ? "border-white/30 bg-black text-white placeholder:text-neutral-500"
                            : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
                        }`}
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
                    className={`w-full rounded-lg h-10 mt-2 transition-colors duration-300 !text-white ${mode === "personal" ? "bg-white !text-black hover:bg-neutral-200" : "bg-black hover:bg-neutral-800"}`}
                  >
                    {loginMut.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Iniciar Sesion
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="text-center space-y-3">
              <p className="text-sm">
                <Link to="/forgot-password" className={`transition-colors duration-300 hover:underline text-neutral-300 hover:text-white ${mode === "business" ? "lg:text-neutral-400 lg:hover:text-white" : "lg:text-neutral-500 lg:hover:text-black"}`}>Olvidaste tu contrasena?</Link>
              </p>
              <p className={`text-sm transition-colors duration-300 text-neutral-300 ${mode === "business" ? "lg:text-neutral-400" : "lg:text-neutral-500"}`}>
                No tienes cuenta?{" "}
                <Link to="/register" className={`transition-colors duration-300 hover:underline font-medium text-white hover:text-neutral-200 ${mode === "business" ? "lg:text-white lg:hover:text-neutral-200" : "lg:text-black lg:hover:text-neutral-600"}`}>Registrate</Link>
              </p>
            </div>
          </div>
        </div>

        {/* Feature cards - desktop only, centered in right panel */}
        <div className="hidden lg:block mt-6 w-full" key={mode}>
          <div className="max-w-md mx-auto">
            <div className="grid grid-cols-4 gap-2">
              {(mode === "business" ? [
                { icon: Wallet, label: "Contabilidad" },
                { icon: TrendingUp, label: "Análisis" },
                { icon: Shield, label: "Fiscal" },
                { icon: Receipt, label: "Banca" },
              ] : [
                { icon: CreditCard, label: "Gastos" },
                { icon: Target, label: "Presupuesto" },
                { icon: PiggyBank, label: "Ahorro" },
                { icon: BarChart3, label: "Banca" },
              ]).map((f, i) => (
                <div
                  key={f.label}
                  className="bg-black border border-white/20 rounded-lg p-2 text-center animate-in fade-in slide-in-from-bottom-4 duration-500"
                  style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
                >
                  <f.icon className="w-5 h-5 text-white mx-auto mb-1" />
                  <p className="text-white text-[10px] font-medium leading-tight">{f.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom tagline - desktop only, centered in right panel */}
        <div className="hidden lg:block mt-4 w-full">
          <div className="max-w-md mx-auto text-center">
            <p className={`text-xs transition-all duration-500 ${mode === "business" ? "text-neutral-400" : "text-neutral-500"}`}>
              {mode === "business"
                ? "Agente de AI contable profesional para tu negocio, marketing y asistencia artificial para tu base de datos de clientes"
                : "Asistente de finanzas personales con AI: presupuestos, ahorro y análisis de gastos automatizado"
              }
            </p>
          </div>
        </div>
      </div>
  );
}
