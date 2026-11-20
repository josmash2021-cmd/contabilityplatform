import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useFieldIds } from "@/components/auth/useFieldIds";
import { trpc } from "@/providers/trpc";
import {
  AuthHeading, Field, ModeToggle, PasswordInput, SubmitButton, TextInput, type AccountMode,
} from "@/components/auth/AuthUI";
import { TRIAL_DAYS } from "@/components/marketing/content";
import { useCopy } from "@/i18n/useI18n";
import { authCopy } from "@/i18n/copy/auth";

export default function Login() {
  const { login: t } = useCopy(authCopy);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AccountMode>("business");
  const ids = useFieldIds("email", "password");

  // Redirected here because the session expired (see providers/trpc.tsx).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired") === "1") {
      toast.info(t.expired);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show once on arrival
  }, []);

  const loginMut = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (data.success && data.user) {
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        toast.success(t.welcome);
        // Redirect based on user mode from backend
        const isPersonal = data.user.modePreference === "personal";
        window.location.href = isPersonal ? "/personal" : "/";
      } else {
        toast.error(data.error || t.error);
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t.fillAll);
      return;
    }
    loginMut.mutate({ email, password, mode });
  };

  return (
    <div>
      <AuthHeading title={t.title} subtitle={t.subtitle} />

      <div className="mt-8">
        <ModeToggle value={mode} onChange={setMode} />
        <p className="mt-2 text-[13px] text-slate-500">{t.modeHint}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
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
        <Field
          label={t.password}
          htmlFor={ids.password}
          action={
            <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
              {t.forgot}
            </Link>
          }
        >
          <PasswordInput
            id={ids.password}
            autoComplete="current-password"
            placeholder={t.passwordPh}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <SubmitButton loading={loginMut.isPending}>{t.submit}</SubmitButton>
      </form>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
        {t.noAccount}{" "}
        <Link to="/register" className="font-semibold text-slate-900 hover:underline">
          {t.tryFree(TRIAL_DAYS)}
        </Link>
      </div>
    </div>
  );
}
