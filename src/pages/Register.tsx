import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Check, Gift } from "lucide-react";
import { toast } from "sonner";
import { useFieldIds } from "@/components/auth/useFieldIds";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  AuthHeading, Field, ModeToggle, PasswordInput, SubmitButton, TextInput, type AccountMode,
} from "@/components/auth/AuthUI";
import { TRIAL_DAYS } from "@/components/marketing/content";

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Pricing cards link here with ?mode=personal|business
  const [mode, setMode] = useState<AccountMode>(params.get("mode") === "personal" ? "personal" : "business");
  const ids = useFieldIds("name", "email", "password", "confirm");
  const { isAuthenticated, user } = useAuth();

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
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const personalRegisterMut = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        toast.success("Cuenta creada. Tu prueba gratis ya empezó.");
        window.location.href = "/personal";
      } else {
        toast.error(data.error || "Error al crear la cuenta");
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // If already authenticated, redirect based on mode (after all hooks run)
  if (isAuthenticated && user?.modePreference) {
    return <Navigate to={user.modePreference === "personal" ? "/personal" : "/"} replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      toast.error("Completa todos los campos");
      return;
    }
    if (!isEmailValid) {
      toast.error("Ingresa un correo electrónico válido");
      return;
    }
    if (!isPasswordValid) {
      toast.error(mode === "business" ? "La contraseña no cumple con todos los requisitos" : "La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (mode === "business") {
      // Save pending registration (this tab only) and continue to onboarding
      sessionStorage.setItem("register_pending", JSON.stringify({ email, password, name, mode }));
      navigate("/onboarding");
      return;
    }

    // Personal mode: create account immediately
    personalRegisterMut.mutate({ email, password, name, mode });
  };

  const reqs = [
    { label: "8 o más caracteres", met: passwordReqs.length },
    { label: "Una mayúscula", met: passwordReqs.uppercase },
    { label: "Un número", met: passwordReqs.number },
    { label: "Un carácter especial", met: passwordReqs.special },
  ];

  return (
    <div>
      <AuthHeading
        eyebrow={mode === "business" ? "Paso 1 de 2" : undefined}
        title="Crea tu cuenta"
        subtitle={mode === "business" ? "Después te pediremos algunos datos de tu negocio." : "Toma menos de un minuto."}
      />

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <Gift className="h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-sm text-emerald-900">
          <span className="font-semibold">{TRIAL_DAYS} días gratis</span> con acceso completo. Sin tarjeta de crédito.
        </p>
      </div>

      <div className="mt-6">
        <ModeToggle value={mode} onChange={setMode} label="Tipo de cuenta" />
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        <Field label={mode === "business" ? "Nombre y apellido" : "Nombre"} htmlFor={ids.name}>
          <TextInput
            id={ids.name}
            autoComplete="name"
            placeholder={mode === "business" ? "Tu nombre y apellido" : "Tu nombre"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Correo electrónico"
          htmlFor={ids.email}
          error={email.length > 0 && !isEmailValid ? "Revisa el formato del correo" : undefined}
        >
          <TextInput
            id={ids.email}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={email.length > 0 && !isEmailValid}
          />
        </Field>

        <Field
          label="Contraseña"
          htmlFor={ids.password}
          hint={mode === "personal" ? "Mínimo 6 caracteres." : undefined}
        >
          <PasswordInput
            id={ids.password}
            autoComplete="new-password"
            placeholder={mode === "business" ? "Crea una contraseña segura" : "Mínimo 6 caracteres"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "business" && (
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label="Requisitos de la contraseña">
              {reqs.map((r) => (
                <li key={r.label} className={`flex items-center gap-1.5 text-[13px] transition-colors ${r.met ? "text-emerald-700" : "text-slate-500"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${r.met ? "bg-emerald-500 text-white" : "border border-slate-300"}`}>
                    {r.met && <Check className="h-3 w-3" />}
                  </span>
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </Field>

        <Field label="Confirmar contraseña" htmlFor={ids.confirm} error={confirmMismatch ? "Las contraseñas no coinciden" : undefined}>
          <PasswordInput
            id={ids.confirm}
            autoComplete="new-password"
            placeholder="Repite tu contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={confirmMismatch}
          />
        </Field>

        <SubmitButton loading={personalRegisterMut.isPending}>
          {mode === "business" ? "Continuar" : "Crear cuenta gratis"}
        </SubmitButton>

        <p className="text-center text-[13px] text-slate-500">
          Al crear tu cuenta aceptas nuestra{" "}
          <Link to="/privacy" className="font-medium text-slate-700 underline-offset-2 hover:underline">Política de privacidad</Link>.
        </p>
      </form>

      <p className="mt-8 text-center text-sm text-slate-600">
        ¿Ya tienes cuenta?{" "}
        <Link to="/login" className="font-semibold text-slate-900 hover:underline">Inicia sesión</Link>
      </p>
    </div>
  );
}
