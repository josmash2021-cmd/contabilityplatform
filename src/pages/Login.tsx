import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useFieldIds } from "@/components/auth/useFieldIds";
import { trpc } from "@/providers/trpc";
import {
  AuthHeading, Field, ModeToggle, PasswordInput, SubmitButton, TextInput, type AccountMode,
} from "@/components/auth/AuthUI";
import { TRIAL_DAYS } from "@/components/marketing/content";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AccountMode>("business");
  const ids = useFieldIds("email", "password");

  // Redirected here because the session expired (see providers/trpc.tsx).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired") === "1") {
      toast.info("Tu sesión expiró. Inicia sesión de nuevo.");
    }
  }, []);

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
        toast.error(data.error || "Error al iniciar sesión");
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
    <div>
      <AuthHeading title="Bienvenido de vuelta" subtitle="Inicia sesión para continuar con tus finanzas." />

      <div className="mt-8">
        <ModeToggle value={mode} onChange={setMode} label="Tipo de cuenta" />
        <p className="mt-2 text-[13px] text-slate-500">Elige el tipo de cuenta con el que te registraste.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        <Field label="Correo electrónico" htmlFor={ids.email}>
          <TextInput
            id={ids.email}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="Contraseña"
          htmlFor={ids.password}
          action={
            <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          }
        >
          <PasswordInput
            id={ids.password}
            autoComplete="current-password"
            placeholder="Tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <SubmitButton loading={loginMut.isPending}>Iniciar sesión</SubmitButton>
      </form>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
        ¿Aún no tienes cuenta?{" "}
        <Link to="/register" className="font-semibold text-slate-900 hover:underline">
          Prueba {TRIAL_DAYS} días gratis
        </Link>
      </div>
    </div>
  );
}
