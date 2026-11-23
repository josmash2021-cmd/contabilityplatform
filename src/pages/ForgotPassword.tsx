import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useFieldIds } from "@/components/auth/useFieldIds";
import { trpc } from "@/providers/trpc";
import { AuthHeading, Field, PasswordInput, SubmitButton, TextInput, inputCls } from "@/components/auth/AuthUI";
import { useCopy } from "@/i18n/useI18n";
import { authCopy } from "@/i18n/copy/auth";

export default function ForgotPassword() {
  const { forgot: t } = useCopy(authCopy);
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
        toast.success(t.updated);
        setStep("success");
      } else {
        toast.error(data.error || "Error");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error(t.enterEmail); return; }
    forgotMut.mutate({ email });
  };

  const handleVerifyAndReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) { toast.error(t.enterCode); return; }
    if (!newPassword || newPassword.length < 6) { toast.error(t.pwMin); return; }
    if (newPassword !== confirmPassword) { toast.error(t.mismatch); return; }
    resetMut.mutate({ email, code, newPassword });
  };

  if (step === "success") {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">{t.successTitle}</h1>
        <p className="mt-2 text-[15px] text-slate-600">{t.successText}</p>
        <Link
          to="/login"
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-[15px] font-semibold text-white transition-colors hover:bg-slate-800"
        >
          {t.login}
        </Link>
      </div>
    );
  }

  return (
    <div>
      {step === "email" ? (
        <>
          <AuthHeading title={t.title} subtitle={t.subtitle} />
          <form onSubmit={handleSendCode} className="mt-8 space-y-5" noValidate>
            <Field label={t.email} htmlFor={ids.email}>
              <TextInput
                id={ids.email}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t.emailPh}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <SubmitButton loading={forgotMut.isPending}>{t.send}</SubmitButton>
          </form>
        </>
      ) : (
        <>
          <AuthHeading title={t.checkTitle} subtitle={<>{t.checkPrefix}<span className="font-medium text-slate-900">{email}</span>{t.checkSuffix}</>} />
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <MailCheck className="h-5 w-5 shrink-0 text-slate-500" /> {t.expires}
          </div>
          <form onSubmit={handleVerifyAndReset} className="mt-6 space-y-5" noValidate>
            <Field label={t.code} htmlFor={ids.code}>
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
            <Field label={t.newPassword} htmlFor={ids.password} hint={t.hint}>
              <PasswordInput id={ids.password} autoComplete="new-password" placeholder={t.newPasswordPh} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field label={t.confirm} htmlFor={ids.confirm}>
              <PasswordInput id={ids.confirm} autoComplete="new-password" placeholder={t.confirmPh} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>
            <SubmitButton loading={resetMut.isPending}>{t.submit}</SubmitButton>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" /> {t.otherEmail}
            </button>
          </form>
        </>
      )}

      <p className="mt-8 text-center text-sm text-slate-600">
        {t.remembered}{" "}
        <Link to="/login" viewTransition className="font-semibold text-slate-900 hover:underline">{t.login}</Link>
      </p>
    </div>
  );
}
