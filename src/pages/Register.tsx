import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, Eye, EyeOff, Receipt, Wallet, TrendingUp, Shield,
  Building2, User, CreditCard, Target, PiggyBank, BarChart3,
  Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"business" | "personal">("business");

  // Real-time validation
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordReqs = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
  const isPasswordValid = mode === "business"
    ? passwordReqs.length && passwordReqs.uppercase && passwordReqs.number && passwordReqs.special
    : password.length >= 6;

  const { isAuthenticated, user } = useAuth();

  // If already authenticated, redirect based on mode
  if (isAuthenticated && user?.modePreference) {
    return <Navigate to={user.modePreference === "personal" ? "/personal" : "/"} replace />;
  }

  const personalRegisterMut = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        toast.success("Cuenta creada exitosamente");
        window.location.href = "/personal";
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
    if (mode === "business" && !isEmailValid) {
      toast.error("Ingresa un correo electronico valido");
      return;
    }
    if (mode === "business" && !isPasswordValid) {
      toast.error("La contrasena no cumple con todos los requisitos");
      return;
    }
    if (mode === "personal" && password.length < 6) {
      toast.error("La contrasena debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Las contrasenas no coinciden");
      return;
    }

    if (mode === "business") {
      // Save pending registration and continue to onboarding
      localStorage.setItem("register_pending", JSON.stringify({ email, password, name, mode }));
      navigate("/onboarding");
      return;
    }

    // Personal mode: create account immediately
    personalRegisterMut.mutate({ email, password, name, mode });
  };

  return (
    <div className={`relative z-10 w-full lg:w-[45%] lg:ml-auto min-h-screen lg:min-h-0 lg:h-full flex flex-col lg:overflow-y-auto p-6 sm:p-8 lg:p-5 xl:p-6 transition-colors duration-500 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500 ${
      mode === "business" ? "lg:bg-black" : "lg:bg-white"
    }`}>
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
                  <>Empieza a<br /><span className="text-neutral-400">crecer hoy.</span></>
                ) : (
                  <>Toma el control<br /><span className="text-neutral-500">de tu dinero.</span></>
                )}
              </h2>
              <p className={`text-sm transition-all duration-500 ${mode === "business" ? "text-neutral-300" : "text-neutral-600"}`}>
                {mode === "business"
                  ? "Unete a miles de empresarios que ya gestionan sus finanzas con Aethel. Rapido, seguro y sin complicaciones."
                  : "Conecta tus cuentas, categoriza tus gastos y descubre donde va tu dinero con inteligencia artificial."
                }
              </p>
            </div>

            <div className="text-center space-y-1">
              <h1 className={`text-2xl lg:text-3xl font-semibold text-white transition-colors duration-500 ${mode === "business" ? "lg:text-white" : "lg:text-black"}`}>Crea tu cuenta</h1>
              <p className={`text-neutral-300 text-sm transition-colors duration-500 ${mode === "business" ? "lg:text-neutral-400" : "lg:text-neutral-500"}`}>Empieza gratis, sin tarjeta de credito</p>
            </div>

            <Card className={`rounded-2xl shadow-xl border transition-colors duration-300 ${
              mode === "personal"
                ? "bg-black border-white/20 text-white"
                : "bg-white border-neutral-200 text-black"
            }`}>
              <CardContent className="p-5 sm:p-6">
                {/* Mode Toggle */}
                <div className="flex items-center justify-center mb-4">
                  <div className={`relative flex items-center p-1 rounded-xl w-full max-w-[280px] overflow-hidden transition-colors duration-300 ${
                    mode === "personal" ? "bg-black" : "bg-white border border-neutral-200"
                  }`}>
                    <div
                      className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-lg transition-all duration-300 ease-out ${
                        mode === "personal" ? "bg-white" : "bg-black"
                      }`}
                      style={{ left: mode === "business" ? "4px" : "calc(50%)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setMode("business")}
                      className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors duration-300 ${
                        mode === "business" ? "text-white" : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      <Building2 className="w-4 h-4" /> Negocios
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("personal")}
                      className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors duration-300 ${
                        mode === "personal" ? "text-black" : "text-neutral-500 hover:text-neutral-700"
                      }`}
                    >
                      <User className="w-4 h-4" /> Personal
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-300" : "text-neutral-500"}`}>
                      {mode === "business" ? "Nombre y Apellido" : "Nombre completo"}
                    </Label>
                    <Input
                      placeholder={mode === "business" ? "Tu nombre y apellido" : "Tu nombre"}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`mt-1 rounded-xl h-11 text-sm transition-colors duration-300 ${
                        mode === "personal"
                          ? "border-white/30 bg-black text-white placeholder:text-neutral-500"
                          : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
                      }`}
                    />
                  </div>
                  <div>
                    <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-300" : "text-neutral-500"}`}>Email</Label>
                    <div className="relative mt-1">
                      <Input
                        type="email"
                        placeholder="tu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`rounded-xl h-11 text-sm pr-10 transition-colors duration-300 ${
                          mode === "personal"
                            ? "border-white/30 bg-black text-white placeholder:text-neutral-500"
                            : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
                        }`}
                      />
                      {email.length > 0 && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {isEmailValid ? (
                            <Check className="w-5 h-5 text-green-500" />
                          ) : (
                            <X className="w-5 h-5 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                    {mode === "business" && email.length > 0 && !isEmailValid && (
                      <p className="text-[11px] text-red-500 mt-1">Formato de correo invalido</p>
                    )}
                  </div>
                  <div>
                    <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-300" : "text-neutral-500"}`}>Contrasena</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder={mode === "business" ? "Minimo 8 caracteres" : "Minimo 6 caracteres"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`pr-10 rounded-xl h-11 text-sm transition-colors duration-300 ${
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
                    {mode === "business" && password.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {[
                          { label: "8+ caracteres", met: passwordReqs.length },
                          { label: "Una mayuscula", met: passwordReqs.uppercase },
                          { label: "Un numero", met: passwordReqs.number },
                          { label: "Un caracter especial", met: passwordReqs.special },
                        ].map((req) => (
                          <div key={req.label} className="flex items-center gap-2">
                            {req.met ? (
                              <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-neutral-400 shrink-0" />
                            )}
                            <span className={`text-[11px] ${req.met ? "text-green-600" : "text-neutral-500"}`}>
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className={`text-xs transition-colors duration-300 ${mode === "personal" ? "text-neutral-300" : "text-neutral-500"}`}>Confirmar contrasena</Label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Repite tu contrasena"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`mt-1 rounded-xl h-11 text-sm transition-colors duration-300 ${
                        mode === "personal"
                          ? "border-white/30 bg-black text-white placeholder:text-neutral-500"
                          : "border-neutral-200 bg-white text-black placeholder:text-neutral-400"
                      }`}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={personalRegisterMut.isPending}
                    className={`w-full rounded-lg h-10 font-medium transition-colors duration-300 ${mode === "personal" ? "bg-white text-black hover:bg-neutral-200" : "bg-black text-white hover:bg-neutral-800"}`}
                  >
                    {personalRegisterMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Crear Cuenta
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="text-center space-y-2">
              <p className={`text-xs transition-colors duration-300 text-neutral-300 ${mode === "business" ? "lg:text-neutral-400" : "lg:text-neutral-500"}`}>
                Al registrarte, aceptas nuestros{" "}
                <Link to="#" className={`hover:underline text-white ${mode === "business" ? "lg:text-white" : "lg:text-black"}`}>Terminos</Link>{" "}
                y{" "}
                <Link to="#" className={`hover:underline text-white ${mode === "business" ? "lg:text-white" : "lg:text-black"}`}>Privacidad</Link>
              </p>
              <p className={`text-sm transition-colors duration-300 text-neutral-300 ${mode === "business" ? "lg:text-neutral-400" : "lg:text-neutral-500"}`}>
                Ya tienes cuenta?{" "}
                <Link to="/login" className={`hover:underline font-medium text-white hover:text-neutral-200 ${mode === "business" ? "lg:text-white lg:hover:text-neutral-200" : "lg:text-black lg:hover:text-neutral-600"}`}>Inicia sesion</Link>
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
