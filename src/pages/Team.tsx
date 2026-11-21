import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { BookOpen, Check, Copy, Crown, Link2, Loader2, Lock, MessageCircle, RefreshCw, Trash2, UserPlus, Users, type LucideIcon } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { teamCopy } from "@/i18n/copy/team";

type Role = "staff" | "accountant";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const CARD = "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5";
const ROLE_ICON: Record<Role, LucideIcon> = { staff: Users, accountant: BookOpen };
const initialOf = (s: string | null | undefined) => (s || "?").trim().charAt(0).toUpperCase();

/** The 2.0 team page (Negocio): seats, invite by link, people and open invitations. */
export default function Team() {
  const t = useCopy(teamCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const plan = trpc.subscription.planInfo.useQuery();
  const hasTeam = plan.data?.features.includes("team") ?? false;
  const list = trpc.team.list.useQuery(undefined, { enabled: hasTeam });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [link, setLink] = useState<{ url: string; days: number; email: string } | null>(null);

  const refresh = () => utils.team.list.invalidate();
  const onError = (e: { message: string }) => toast.error(e.message);
  const invite = trpc.team.invite.useMutation({
    onSuccess: (r, vars) => { setLink({ url: r.link, days: r.expiresInDays, email: vars.email }); setEmail(""); refresh(); },
    onError,
  });
  const revoke = trpc.team.revokeInvite.useMutation({ onSuccess: refresh, onError });
  const remove = trpc.team.removeMember.useMutation({ onSuccess: () => { toast.success(t.removed); refresh(); }, onError });
  const changeRole = trpc.team.changeRole.useMutation({ onSuccess: () => { toast.success(t.roleChanged); refresh(); }, onError });

  if (plan.isLoading) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-5" role="status" aria-label={t.title}>
          <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-80 max-w-full" /></div>
          <div className="grid grid-cols-2 gap-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
          <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
        </div>
      </AnimatedPage>
    );
  }

  if (!hasTeam) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-xl">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Lock className="h-5 w-5" /></span>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{t.locked.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t.locked.text}</p>
            <ul className="mt-4 space-y-2">
              {t.locked.points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{p}</li>
              ))}
            </ul>
            <button onClick={() => navigate("/settings")} className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:w-auto ${FOCUS}`}>
              {t.locked.cta}
            </button>
          </section>
        </div>
      </AnimatedPage>
    );
  }

  const data = list.data;
  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success(t.invite.copied); } catch { toast.error(url); }
  };
  // Seats: the owner plus the employees (open invitations count too). The accountant is apart.
  const seatsTotal = data ? data.staffSeats + 1 : 0;
  const seatsUsed = data ? data.staffUsed + 1 : 0;
  const seatsFull = !!data && data.staffUsed >= data.staffSeats;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
        </header>

        {/* Seats */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={t.seats(data?.staffUsed ?? 0, data?.staffSeats ?? 0)}>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Users className="h-3.5 w-3.5" />{t.usersTitle}</p>
            {data ? (
              <>
                <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${seatsFull ? "text-amber-700" : "text-slate-900"}`}>{t.usersCount(seatsUsed, seatsTotal)}</p>
                <div className="mt-2 flex gap-1" aria-hidden>
                  {Array.from({ length: seatsTotal }, (_, i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i === 0 ? "bg-slate-900" : i < seatsUsed ? "bg-blue-600" : "bg-slate-200"}`} />
                  ))}
                </div>
                <p className="mt-2 text-xs leading-snug text-slate-500">{t.usersSub}</p>
              </>
            ) : list.isError ? <p className="mt-1 text-sm text-slate-500">—</p> : <Skeleton className="mt-2 h-14" />}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><BookOpen className="h-3.5 w-3.5" />{t.accountantTitle}</p>
            {data ? (
              <>
                <p className={`mt-1 text-2xl font-bold tracking-tight ${data.accountantUsed ? "text-slate-900" : "text-emerald-700"}`}>{data.accountantUsed ? t.accountantTaken : t.accountantFree}</p>
                <p className="mt-2 text-xs leading-snug text-slate-500">{t.accountantSub}</p>
              </>
            ) : list.isError ? <p className="mt-1 text-sm text-slate-500">—</p> : <Skeleton className="mt-2 h-14" />}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
          {/* Invite */}
          <section className={CARD} aria-labelledby="team-invite">
            <h2 id="team-invite" className="flex items-center gap-2 font-semibold text-slate-900"><UserPlus className="h-4 w-4 text-blue-600" />{t.invite.title}</h2>
            <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); if (email.trim()) invite.mutate({ email: email.trim(), role }); }}>
              <div>
                <label htmlFor="team-email" className="mb-1.5 block text-sm font-medium text-slate-700">{t.invite.email}</label>
                <input id="team-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.invite.emailPh} autoComplete="off"
                  className="h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:text-sm" />
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-slate-700">{t.invite.role}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["staff", "accountant"] as const).map((r) => {
                    const on = role === r;
                    const Icon = ROLE_ICON[r];
                    const note = r === "accountant" && data?.accountantUsed ? t.accountantNote : r === "staff" && seatsFull ? t.seatsFull : null;
                    return (
                      <label key={r} className={`relative flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${on ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-300"}`}>
                        <input type="radio" name="team-role" value={r} checked={on} onChange={() => setRole(r)} className="sr-only" />
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-900">{t.roles[r].name}</span>
                          <span className="mt-0.5 block text-xs leading-snug text-slate-500">{t.roles[r].text}</span>
                          {note && <span className="mt-1.5 block text-xs font-medium text-amber-700">{note}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <button type="submit" disabled={invite.isPending || !email.trim()}
                className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto ${FOCUS} focus-visible:ring-offset-2`}>
                {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {invite.isPending ? t.invite.creating : t.invite.button}
              </button>
            </form>

            {link && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><Check className="h-4 w-4" />{t.invite.ready}</p>
                <p className="mt-0.5 break-all text-xs text-emerald-700">{t.invite.forEmail(link.email)}</p>
                <label htmlFor="team-link" className="mt-3 block text-xs font-semibold text-emerald-900">{t.invite.linkLabel}</label>
                <div className="mt-1 flex items-center gap-2 rounded-[10px] bg-white px-3 ring-1 ring-emerald-200">
                  <Link2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <input id="team-link" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()}
                    className="h-11 min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-700 outline-none" />
                </div>
                <div className="mt-3 grid gap-2 sm:flex">
                  <button type="button" onClick={() => copyLink(link.url)}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100/60 sm:h-10 ${FOCUS}`}>
                    <Copy className="h-4 w-4" />{t.invite.copy}
                  </button>
                  <a href={`https://wa.me/?text=${encodeURIComponent(t.invite.message(link.url))}`} target="_blank" rel="noopener noreferrer"
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#1DA851] px-4 text-sm font-semibold text-white hover:bg-[#178f45] sm:h-10 ${FOCUS}`}>
                    <MessageCircle className="h-4 w-4" />{t.invite.whatsapp}
                  </a>
                </div>
                <p className="mt-3 text-xs text-emerald-800">{t.invite.expires(link.days)}</p>
              </div>
            )}
          </section>

          {/* People and open invitations */}
          <section className={CARD} aria-labelledby="team-members">
            <h2 id="team-members" className="flex items-center gap-2 font-semibold text-slate-900"><Users className="h-4 w-4 text-blue-600" />{t.members}</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {/* The owner: always first, takes one of the 10 seats */}
              <li className="flex items-center gap-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{initialOf(user?.name || user?.email)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{user?.name || user?.email}</p>
                  <p className="truncate text-xs text-slate-500">{t.you}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"><Crown className="h-3.5 w-3.5" />{t.owner}</span>
              </li>
              {list.isError ? (
                <li className="py-4 text-center">
                  <p className="text-sm text-slate-600">{t.loadError}</p>
                  <button onClick={() => list.refetch()} className={`mt-2 inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${FOCUS}`}><RefreshCw className="h-4 w-4" />{t.retry}</button>
                </li>
              ) : !data ? (
                <li className="space-y-2 py-3"><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /></li>
              ) : data.members.length === 0 ? (
                <li className="py-4 text-sm text-slate-500">{t.noMembers}</li>
              ) : data.members.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${m.role === "accountant" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>{initialOf(m.name || m.email)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{m.name || m.email}</p>
                      <p className="truncate text-xs text-slate-500">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <label className="sr-only" htmlFor={`role-${m.id}`}>{t.invite.roleShort}</label>
                    <select id={`role-${m.id}`} value={m.role} disabled={changeRole.isPending} onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Role })}
                      className={`h-11 min-w-0 flex-1 rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 sm:h-9 sm:flex-none ${FOCUS}`}>
                      <option value="staff">{t.roles.staff.name}</option>
                      <option value="accountant">{t.roles.accountant.name}</option>
                    </select>
                    <button onClick={() => { if (window.confirm(t.removeConfirm(m.name || m.email || ""))) remove.mutate({ id: m.id }); }}
                      className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-slate-200 px-3 text-sm font-semibold text-red-600 hover:border-red-200 hover:bg-red-50 sm:h-9 ${FOCUS}`}>
                      <Trash2 className="h-4 w-4" />{t.remove}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {data && data.invites.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {t.pending}<span className="normal-case tracking-normal">{t.invitesCount(data.invites.length)}</span>
                </h3>
                <ul className="mt-1 divide-y divide-slate-100">
                  {data.invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2.5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-slate-300 text-slate-400"><UserPlus className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{i.email}</p>
                        <p className="truncate text-xs text-slate-500">{t.roles[i.role].name} · {t.expiresOn(new Date(i.expiresAt).toLocaleDateString(locale, { day: "numeric", month: "short" }))}</p>
                      </div>
                      <button onClick={() => revoke.mutate({ id: i.id })} disabled={revoke.isPending}
                        className={`inline-flex h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 sm:h-9 ${FOCUS}`}>
                        {t.revoke}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </AnimatedPage>
  );
}
