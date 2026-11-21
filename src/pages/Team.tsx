import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Copy, Loader2, Lock, MessageCircle, Trash2, UserPlus, Users } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { teamCopy } from "@/i18n/copy/team";

type Role = "staff" | "accountant";

export default function Team() {
  const t = useCopy(teamCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const plan = trpc.subscription.planInfo.useQuery();
  const hasTeam = plan.data?.features.includes("team") ?? false;
  const list = trpc.team.list.useQuery(undefined, { enabled: hasTeam });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [link, setLink] = useState<{ url: string; days: number } | null>(null);

  const refresh = () => utils.team.list.invalidate();
  const onError = (e: { message: string }) => toast.error(e.message);
  const invite = trpc.team.invite.useMutation({
    onSuccess: (r) => { setLink({ url: r.link, days: r.expiresInDays }); setEmail(""); refresh(); },
    onError,
  });
  const revoke = trpc.team.revokeInvite.useMutation({ onSuccess: refresh, onError });
  const remove = trpc.team.removeMember.useMutation({ onSuccess: () => { toast.success(t.removed); refresh(); }, onError });
  const changeRole = trpc.team.changeRole.useMutation({ onSuccess: () => { toast.success(t.roleChanged); refresh(); }, onError });

  if (plan.isLoading) {
    return <AnimatedPage className="p-4 lg:p-6"><Loader2 className="mx-auto mt-16 h-5 w-5 animate-spin text-neutral-400" /></AnimatedPage>;
  }

  if (!hasTeam) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100"><Lock className="h-5 w-5 text-neutral-500" /></span>
          <h1 className="mt-4 text-lg font-semibold text-black">{t.locked.title}</h1>
          <p className="mt-2 text-sm text-neutral-600">{t.locked.text}</p>
          <Button className="mt-5 w-full bg-black text-white hover:bg-neutral-800" onClick={() => navigate("/settings")}>{t.locked.cta}</Button>
        </div>
      </AnimatedPage>
    );
  }

  const data = list.data;
  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success(t.invite.copied); } catch { toast.error(url); }
  };

  return (
    <AnimatedPage className="p-4 lg:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <h1 className="text-xl font-semibold text-black">{t.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t.subtitle}</p>
          {data && <p className="mt-2 text-xs font-medium text-neutral-600">{t.seats(data.staffUsed, data.staffSeats)}</p>}
        </header>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="team-invite">
          <h2 id="team-invite" className="flex items-center gap-2 font-semibold text-black"><UserPlus className="h-4 w-4" />{t.invite.title}</h2>
          <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (email.trim()) invite.mutate({ email: email.trim(), role }); }}>
            <div>
              <label htmlFor="team-email" className="text-xs font-medium text-neutral-600">{t.invite.email}</label>
              <Input id="team-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" className="mt-1" autoComplete="off" />
            </div>
            <fieldset>
              <legend className="text-xs font-medium text-neutral-600">{t.invite.role}</legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {(["staff", "accountant"] as const).map((r) => (
                  <label key={r} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${role === r ? "border-black bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                    <input type="radio" name="team-role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                    <span className="flex items-center gap-2 font-medium text-black">
                      <span className={`grid h-4 w-4 place-items-center rounded-full border ${role === r ? "border-black" : "border-neutral-300"}`}>{role === r && <span className="h-2 w-2 rounded-full bg-black" />}</span>
                      {t.roles[r].name}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500">{t.roles[r].text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" disabled={invite.isPending || !email.trim()} className="bg-black text-white hover:bg-neutral-800">
              {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span className="ml-1">{invite.isPending ? t.invite.creating : t.invite.button}</span>
            </Button>
          </form>

          {link && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3" role="status">
              <p className="text-sm font-medium text-emerald-800">{t.invite.ready}</p>
              <p className="mt-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-neutral-700 ring-1 ring-emerald-200">{link.url}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="border-emerald-300 bg-white" onClick={() => copyLink(link.url)}><Copy className="h-3.5 w-3.5" /><span className="ml-1">{t.invite.copy}</span></Button>
                <a className="inline-flex h-8 items-center gap-1 rounded-md bg-[#25D366] px-3 text-xs font-medium text-white hover:opacity-90"
                  href={`https://wa.me/?text=${encodeURIComponent(t.invite.message(link.url))}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" />{t.invite.whatsapp}
                </a>
              </div>
              <p className="mt-2 text-xs text-emerald-700">{t.invite.expires(link.days)}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="team-members">
          <h2 id="team-members" className="flex items-center gap-2 font-semibold text-black"><Users className="h-4 w-4" />{t.members}</h2>
          {!data ? <Loader2 className="mt-3 h-4 w-4 animate-spin text-neutral-400" /> : data.members.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">{t.noMembers}</p>
          ) : (
            <ul className="mt-2 divide-y divide-neutral-100">
              {data.members.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-black">{m.name || m.email}</p>
                    <p className="truncate text-xs text-neutral-500">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${m.id}`}>{t.invite.role}</label>
                    <select id={`role-${m.id}`} value={m.role} onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Role })}
                      className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-sm">
                      <option value="staff">{t.roles.staff.name}</option>
                      <option value="accountant">{t.roles.accountant.name}</option>
                    </select>
                    <Button variant="outline" size="sm" className="border-neutral-200 text-red-600 hover:bg-red-50"
                      onClick={() => { if (window.confirm(t.removeConfirm(m.name || m.email || ""))) remove.mutate({ id: m.id }); }}>
                      <Trash2 className="h-3.5 w-3.5" /><span className="ml-1">{t.remove}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data && data.invites.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t.pending}</h3>
              <ul className="mt-1 divide-y divide-neutral-100">
                {data.invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-black">{i.email}</p>
                      <p className="text-xs text-neutral-500">{t.roles[i.role].name} · {t.expiresOn(new Date(i.expiresAt).toLocaleDateString(locale, { day: "numeric", month: "short" }))}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate({ id: i.id })}>{t.revoke}</Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </AnimatedPage>
  );
}
