import { useState } from "react";
import { fx } from "@/lib/fx";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { CHOSEN_PLAN_KEY, LANDING_PLAN_GROUPS } from "@/components/marketing/content";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useFieldIds } from "@/components/auth/useFieldIds";
import { AgreeBoxes } from "@/components/auth/AgreeBoxes";
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
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // "Acepto los Términos de uso y la Política de privacidad" (required) and tips by email (optional).
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [tried, setTried] = useState(false);
  // After the first Negocio / Personal change, what comes back enters at once (no first-load delays).
  const [switched, setSwitched] = useState(false);
  // Pricing cards link here with ?mode=personal|business
  const [mode, setModeState] = useState<AccountMode>(params.get("mode") === "personal" ? "personal" : "business");
  // The mode also goes in the address (?mode=), so the side panel shows the matching example.
  const setMode = (m: AccountMode) => {
    setModeState(m);
    setSwitched(true);
    setParams((p) => { const n = new URLSearchParams(p); n.set("mode", m); return n; }, { replace: true });
  };
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
  // The same safe password for both modes.
  const isPasswordValid = passwordReqs.every(Boolean);
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const personalRegisterMut = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        toast.success(t.created);
        // Picked the free Básico (taxes) on the landing page: start there.
        window.location.href = params.get("plan") === "personal" ? "/personal/taxes" : "/personal";
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
      toast.error(t.pwBusiness);
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t.mismatch);
      return;
    }
    if (!agree) {
      // The message shows right under the box (no toast on top of it).
      setTried(true);
      return;
    }

    // Remember the plan picked on the landing page, to preselect it when the trial ends.
    const chosen = LANDING_PLAN_GROUPS[mode].find((p) => p.key === params.get("plan"));
    try {
      if (chosen) localStorage.setItem(CHOSEN_PLAN_KEY, chosen.key);
      else localStorage.removeItem(CHOSEN_PLAN_KEY);
    } catch { /* storage blocked: no preselection */ }

    if (mode === "business") {
      // Save pending registration (this tab only) and continue to onboarding
      sessionStorage.setItem("register_pending", JSON.stringify({ email, password, name, mode, acceptTerms: true, marketing }));
      navigate("/onboarding");
      return;
    }

    // Personal mode: create account immediately
    personalRegisterMut.mutate({ email, password, name, mode, acceptTerms: true, marketing });
  };

  return (
    <div data-switched={switched || undefined}>
      <div key={`h-${mode}`} data-fx-group>
        <AuthHeading
          eyebrow={mode === "business" ? t.step : undefined}
          title={t.title}
          subtitle={mode === "business" ? t.subtitleBusiness : t.subtitlePersonal}
        />
      </div>

      {/* What you get, in three checks (no box): it changes with Negocio / Personal. */}
      <ul key={mode} data-fx-group className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px] font-medium text-slate-700" data-trial={mode}>
        {(mode === "personal" ? t.ticksPersonal(TRIAL_DAYS) : t.ticks(TRIAL_DAYS)).map((x, i) => (
          <li key={x} data-fx="slide" style={fx(400 + i * 85, 2 + i)} className="flex items-center gap-1.5"><Check data-fx="pop" style={fx(490 + i * 85, 3 + i)} className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.6} aria-hidden="true" />{x}</li>
        ))}
      </ul>

      <div className="mt-6" data-fx-group>
        <ModeToggle value={mode} onChange={setMode} />
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        <Field key={`n-${mode}`} label={mode === "business" ? t.nameBusiness : t.namePersonal} htmlFor={ids.name}>
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

        <Field label={t.password} htmlFor={ids.password}>
          <PasswordInput
            id={ids.password}
            autoComplete="new-password"
            placeholder={t.passwordPhBusiness}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {(
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label={t.reqsLabel}>
              {t.reqs.map((label, i) => {
                const met = passwordReqs[i];
                return (
                  <li key={label} className={`flex items-center gap-1.5 text-[13px] transition-colors ${met ? "text-emerald-700" : "text-slate-500"}`}>
                    <Check className={`h-4 w-4 shrink-0 transition-colors duration-300 ${met ? "text-emerald-600" : "text-slate-300"}`} strokeWidth={2.6} aria-hidden="true" />
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

        <AgreeBoxes agree={agree} onAgree={setAgree} marketing={marketing} onMarketing={setMarketing} showNeed={tried} />

        <SubmitButton key={`b-${mode}`} loading={personalRegisterMut.isPending}>
          {mode === "business" ? t.submitBusiness : t.submitPersonal}
        </SubmitButton>
      </form>

      <p className="mt-8 text-center text-sm text-slate-600">
        {t.haveAccount}{" "}
        <Link to="/login" viewTransition className="font-semibold text-slate-900 hover:underline">{t.login}</Link>
      </p>
    </div>
  );
}
