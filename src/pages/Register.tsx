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
import { useCopy } from "@/i18n/useI18n";
import { authCopy } from "@/i18n/copy/auth";

export default function Register() {
  const { register: t } = useCopy(authCopy);
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
  const passwordReqs = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[!@#$%^&*(),.?":{}|<>]/.test(password),
  ];
  const isPasswordValid = mode === "business" ? passwordReqs.every(Boolean) : password.length >= 6;
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const personalRegisterMut = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        toast.success(t.created);
        window.location.href = "/personal";
      } else {
        toast.error(data.error || t.error);
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
      toast.error(t.fillAll);
      return;
    }
    if (!isEmailValid) {
      toast.error(t.invalidEmail);
      return;
    }
    if (!isPasswordValid) {
      toast.error(mode === "business" ? t.pwBusiness : t.pwPersonal);
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t.mismatch);
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

  return (
    <div>
      <AuthHeading
        eyebrow={mode === "business" ? t.step : undefined}
        title={t.title}
        subtitle={mode === "business" ? t.subtitleBusiness : t.subtitlePersonal}
      />

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <Gift className="h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-sm text-emerald-900">
          <span className="font-semibold">{t.trialBold(TRIAL_DAYS)}</span>{t.trialRest}
        </p>
      </div>

      <div className="mt-6">
        <ModeToggle value={mode} onChange={setMode} />
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        <Field label={mode === "business" ? t.nameBusiness : t.namePersonal} htmlFor={ids.name}>
          <TextInput
            id={ids.name}
            autoComplete="name"
            placeholder={mode === "business" ? t.namePhBusiness : t.namePhPersonal}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label={t.email} htmlFor={ids.email} error={email.length > 0 && !isEmailValid ? t.emailInvalid : undefined}>
          <TextInput
            id={ids.email}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t.emailPh}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={email.length > 0 && !isEmailValid}
          />
        </Field>

        <Field label={t.password} htmlFor={ids.password} hint={mode === "personal" ? t.passwordHintPersonal : undefined}>
          <PasswordInput
            id={ids.password}
            autoComplete="new-password"
            placeholder={mode === "business" ? t.passwordPhBusiness : t.passwordPhPersonal}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "business" && (
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label={t.reqsLabel}>
              {t.reqs.map((label, i) => {
                const met = passwordReqs[i];
                return (
                  <li key={label} className={`flex items-center gap-1.5 text-[13px] transition-colors ${met ? "text-emerald-700" : "text-slate-500"}`}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${met ? "bg-emerald-500 text-white" : "border border-slate-300"}`}>
                      {met && <Check className="h-3 w-3" />}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>
          )}
        </Field>

        <Field label={t.confirm} htmlFor={ids.confirm} error={confirmMismatch ? t.mismatch : undefined}>
          <PasswordInput
            id={ids.confirm}
            autoComplete="new-password"
            placeholder={t.confirmPh}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={confirmMismatch}
          />
        </Field>

        <SubmitButton loading={personalRegisterMut.isPending}>
          {mode === "business" ? t.submitBusiness : t.submitPersonal}
        </SubmitButton>

        <p className="text-center text-[13px] text-slate-500">
          {t.privacyPrefix}{" "}
          <Link to="/privacy" className="font-medium text-slate-700 underline-offset-2 hover:underline">{t.privacy}</Link>.
        </p>
      </form>

      <p className="mt-8 text-center text-sm text-slate-600">
        {t.haveAccount}{" "}
        <Link to="/login" className="font-semibold text-slate-900 hover:underline">{t.login}</Link>
      </p>
    </div>
  );
}
