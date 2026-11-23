import { useState } from "react";
import { AgreeBoxes } from "@/components/auth/AgreeBoxes";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { teamCopy } from "@/i18n/copy/team";
import { useAuth } from "@/hooks/useAuth";
import { FormField, JoinBrand, JoinHeading, JoinModeSwitch } from "@/components/team/JoinCard";
import { BTN_PRIMARY, INPUT, READONLY } from "@/components/team/ui";

/**
 * /join?invite=… — the page the invitation link opens (the prototype's join page): who invites you,
 * to which business and with which role; then create an account (or log in) with the invited email
 * and join the team.
 */
export default function JoinTeam() {
  const tt = useCopy(teamCopy);
  const t = tt.join;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const [params] = useSearchParams();
  const token = params.get("invite") ?? "";
  const { isAuthenticated, user } = useAuth();
  const preview = trpc.team.invitePreview.useQuery({ token }, { enabled: token.length >= 10, retry: false });
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // A new account accepts the Terms of Use and the Privacy Policy (same boxes as /register).
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const register = trpc.auth.register.useMutation();
  const login = trpc.auth.login.useMutation();
  const accept = trpc.team.acceptInvite.useMutation();

  const join = async () => {
    await accept.mutateAsync({ token });
    toast.success(tt.joined);
    window.location.href = preview.data?.valid && preview.data.role === "staff" ? "/pos" : "/";
  };

  // The name starts as the one they were invited with; whatever they type wins.
  const nameValue = name ?? (preview.data?.valid ? preview.data.name ?? "" : "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview.data?.valid) return;
    setBusy(true);
    try {
      if (!isAuthenticated) {
        const email = preview.data.email;
        const data = mode === "existing"
          ? await login.mutateAsync({ email, password, mode: "business" })
          : await register.mutateAsync({ email, password, name: nameValue.trim(), mode: "business", acceptTerms: agree, marketing });
        if (!data.success || !("token" in data) || !data.token) throw new Error(("error" in data && data.error) || tt.inviteInvalid);
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
      }
      await join();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt.inviteInvalid);
    } finally {
      setBusy(false);
    }
  };

  if (!token || preview.isError || (preview.data && !preview.data.valid)) {
    return <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">{tt.inviteInvalid}</p>;
  }
  if (!preview.data) return <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-slate-400" aria-label={t.titleGeneric} />;

  const { email, role, ownerName, companyName, logo, expiresAt } = preview.data;
  const canSubmit = isAuthenticated || (password.length >= 8 && (mode === "existing" || (nameValue.trim().length > 0 && agree)));
  const expires = new Date(expiresAt).toLocaleDateString(locale, { day: "numeric", month: "long" });

  return (
    <div className="mx-auto w-full max-w-[420px] py-1">
      <JoinBrand companyName={companyName} logo={logo} />
      <JoinHeading companyName={companyName} ownerName={ownerName} role={role} />

      {isAuthenticated ? (
        <p className="mt-3 rounded-[10px] bg-slate-100 px-3 py-2 text-sm text-slate-700">{t.loggedIn(user?.email || "")}</p>
      ) : (
        <JoinModeSwitch mode={mode} onChange={setMode} disabled={busy} />
      )}

      <form onSubmit={submit} className="mt-3 grid gap-3" noValidate>
        {!isAuthenticated && (
          <>
            <FormField label={t.email} hint={t.emailFixed} htmlFor="join-email">
              <input id="join-email" value={email} readOnly aria-readonly="true" className={`${INPUT} ${READONLY}`} />
            </FormField>
            {mode === "new" && (
              <FormField label={t.name} htmlFor="join-name">
                <input id="join-name" value={nameValue} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={255} className={INPUT} />
              </FormField>
            )}
            <FormField label={mode === "new" ? t.password : t.yourPassword} hint={mode === "new" ? t.passwordHint : undefined} htmlFor="join-pass">
              <input id="join-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "existing" ? "current-password" : "new-password"} minLength={8} className={INPUT} />
            </FormField>
            {mode === "new" && <AgreeBoxes agree={agree} onAgree={setAgree} marketing={marketing} onMarketing={setMarketing} />}
          </>
        )}
        <button type="submit" disabled={busy || !canSubmit} className={`${BTN_PRIMARY} min-h-[46px] text-[15px]`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {isAuthenticated ? t.joinNow : mode === "existing" ? t.login : t.create}
        </button>
      </form>
      <p className="mt-3 text-center text-xs text-slate-500">{t.expires(expires)}</p>
      <p className="mt-1 text-center text-xs text-slate-500">{t.notExpected}</p>
    </div>
  );
}
