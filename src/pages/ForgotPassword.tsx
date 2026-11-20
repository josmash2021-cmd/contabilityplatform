import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useFieldIds } from "@/components/auth/useFieldIds";
import { trpc } from "@/providers/trpc";
import { AuthHeading, Field, PasswordInput, SubmitButton, TextInput, inputCls } from "@/components/auth/AuthUI";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const ids = useFieldIds("email", "code", "password", "confirm");

  const forgotMut = trpc.auth.forgotPassword.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        setStep("code");
      } else {
        toast.error(data.error || "Error");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const resetMut = trpc.auth.resetPassword.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Contraseña actualizada");
        setStep("success");
      } else {
        toast.error(data.error || "Error");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Ingresa tu correo"); return; }
    forgotMut.mutate({ email });
  };

  const handleVerifyAndReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) { toast.error("Ingresa el código de 6 dígitos"); return; }
    if (!newPassword || newPassword.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { toast.error("Las contraseñas no coinciden"); return; }
    resetMut.mutate({ email, code, newPassword });
  };

  if (step === "success") {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">Contraseña actualizada</h1>
        <p className="mt-2 text-[15px] text-slate-600">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <Link
          to="/login"
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-[15px] font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div>
      {step === "email" ? (
        <>
          <AuthHeading title="Recupera tu contraseña" subtitle="Escribe el correo de tu cuenta y te enviaremos un código de verificación." />
          <form onSubmit={handleSendCode} className="mt-8 space-y-5" noValidate>
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
            <SubmitButton loading={forgotMut.isPending}>Enviar código</SubmitButton>
          </form>
        </>
      ) : (
        <>
          <AuthHeading title="Revisa tu correo" subtitle={<>Si <span className="font-medium text-slate-900">{email}</span> tiene una cuenta, recibirás un código de 6 dígitos.</>} />
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <MailCheck className="h-5 w-5 shrink-0 text-slate-500" /> El código vence en 30 minutos.
          </div>
          <form onSubmit={handleVerifyAndReset} className="mt-6 space-y-5" noValidate>
            <Field label="Código de verificación" htmlFor={ids.code}>
              <input
                id={ids.code}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputCls} text-center text-lg font-semibold tracking-[0.5em]`}
              />
            </Field>
            <Field label="Nueva contraseña" htmlFor={ids.password} hint="Mínimo 6 caracteres.">
              <PasswordInput id={ids.password} autoComplete="new-password" placeholder="Nueva contraseña" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field label="Confirmar contraseña" htmlFor={ids.confirm}>
              <PasswordInput id={ids.confirm} autoComplete="new-password" placeholder="Repite la contraseña" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>
            <SubmitButton loading={resetMut.isPending}>Actualizar contraseña</SubmitButton>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" /> Usar otro correo
            </button>
          </form>
        </>
      )}

      <p className="mt-8 text-center text-sm text-slate-600">
        ¿Recordaste tu contraseña?{" "}
        <Link to="/login" className="font-semibold text-slate-900 hover:underline">Inicia sesión</Link>
      </p>
    </div>
  );
}
