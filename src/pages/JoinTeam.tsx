import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { teamCopy } from "@/i18n/copy/team";
import { useAuth } from "@/hooks/useAuth";

/**
 * /join?invite=… — someone invited by a business owner creates an account (or logs in)
 * with the invited email, then joins the team.
 */
export default function JoinTeam() {
  const t = useCopy(teamCopy);
  const [params] = useSearchParams();
  const token = params.get("invite") ?? "";
  const { isAuthenticated } = useAuth();
  const preview = trpc.team.invitePreview.useQuery({ token }, { enabled: token.length >= 10, retry: false });
  const [haveAccount, setHaveAccount] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const register = trpc.auth.register.useMutation();
  const login = trpc.auth.login.useMutation();
  const accept = trpc.team.acceptInvite.useMutation();

  const join = async () => {
    await accept.mutateAsync({ token });
    toast.success(t.joined);
    window.location.href = preview.data?.valid && preview.data.role === "staff" ? "/pos" : "/";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview.data?.valid) return;
    setBusy(true);
    try {
      if (!isAuthenticated) {
        const email = preview.data.email;
        const data = haveAccount
          ? await login.mutateAsync({ email, password, mode: "business" })
          : await register.mutateAsync({ email, password, name: name.trim(), mode: "business" });
        if (!data.success || !("token" in data) || !data.token) throw new Error(("error" in data && data.error) || t.inviteInvalid);
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
      }
      await join();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.inviteInvalid);
    } finally {
      setBusy(false);
    }
  };

  if (!token || preview.isError || (preview.data && !preview.data.valid)) {
    return <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t.inviteInvalid}</p>;
  }
  if (!preview.data) return <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-neutral-400" />;

  const { email, role, ownerName } = preview.data;
  const roleName = t.roles[role].name;
  const canSubmit = isAuthenticated || (password.length >= 8 && (haveAccount || name.trim().length > 0));

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-black text-white"><Users className="h-5 w-5" /></span>
        <h1 className="text-xl font-semibold text-slate-900">{ownerName ? t.invited(ownerName, roleName) : t.invitedGeneric(roleName)}</h1>
      </div>
      <p className="mt-3 text-sm text-slate-600">{t.roles[role].text}</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {!isAuthenticated && (
          <>
            <div>
              <p className="text-xs font-medium text-slate-600">{t.invitedUseEmail}</p>
              <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900">{email}</p>
            </div>
            {!haveAccount && (
              <div>
                <label htmlFor="join-name" className="text-xs font-medium text-slate-600">{t.name}</label>
                <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-1" />
              </div>
            )}
            <div>
              <label htmlFor="join-pass" className="text-xs font-medium text-slate-600">{t.password}</label>
              <Input id="join-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={haveAccount ? "current-password" : "new-password"} minLength={8} className="mt-1" />
              {!haveAccount && <p className="mt-1 text-xs text-slate-500">{t.passwordHint}</p>}
            </div>
          </>
        )}
        <Button type="submit" disabled={busy || !canSubmit} className="h-11 w-full bg-black text-white hover:bg-slate-800">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="ml-1">{isAuthenticated ? t.joinNow : haveAccount ? t.loginAndJoin : t.createAndJoin}</span>
        </Button>
        {!isAuthenticated && (
          <button type="button" onClick={() => setHaveAccount((v) => !v)} className="block w-full text-center text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
            {haveAccount ? t.newAccount : t.haveAccount}
          </button>
        )}
      </form>
    </div>
  );
}
