import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Check, Eye, Link2, Lock, Minus, Monitor, MoreHorizontal, Plus, RefreshCw, UserCog, X } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { teamCopy, type TeamCopy } from "@/i18n/copy/team";
import { PERM_COLUMNS, ROLE_HOME, permTable, type PermLevel, type TeamRole } from "@/components/team/roles";
import { startViewAs, useViewAsWired } from "@/components/team/viewAs";
import { InviteDialog, TourDialog, ViewAsDialog, type InviteStart } from "@/components/team/TeamDialogs";
import { JoinCardPreview } from "@/components/team/JoinCard";
import { BTN, BTN_PRIMARY, CARD, DST, DST_TONE, FOCUS, firstOf } from "@/components/team/ui";

type PendingInvite = { id: number; email: string; role: TeamRole; name: string | null; expiresAt: Date | string };
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-t border-slate-200 px-4 py-3 text-sm first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_130px_60px]";

/** "Ahora", "Hace 12 min", "Hoy 10:12", "Ayer", "Hace 3 días", "16 nov". */
function lastSeen(at: Date | string | null, now: number, t: TeamCopy, locale: string): string {
  if (!at) return t.last.never;
  const d = new Date(at);
  const ms = now - d.getTime();
  if (ms < 5 * 60_000) return t.last.now;
  if (ms < 60 * 60_000) return t.last.minutes(Math.floor(ms / 60_000));
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return t.last.today(d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }));
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return t.last.yesterday;
  const days = Math.floor(ms / 86_400_000);
  if (days < 7) return t.last.days(Math.max(2, days));
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** The timeline's date column: "Hoy 10:12", "Ayer 17:05", "lun 16 nov". */
function whenLabel(at: Date | string, now: number, t: TeamCopy, locale: string): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date(now).toDateString()) return t.last.today(time);
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return `${t.last.yesterday} ${time}`;
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }).replace(",", "").replace(".", "");
}

function Dst({ tone, children }: { tone: keyof typeof DST_TONE; children: React.ReactNode }) {
  return <span className={cn(DST, DST_TONE[tone])}><i className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" aria-hidden />{children}</span>;
}

/** The prototype's team screen: people and invitations, what each role can do, seats and activity. */
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
  const settings = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const company = { name: settings.data?.companyName?.trim() || null, logo: settings.data?.logo ?? null };
  const wired = useViewAsWired();
  // "Now" for the relative times: when the list arrived from the server.
  const now = list.dataUpdatedAt;
  const perms = useMemo(() => permTable(), []);

  const [invite, setInvite] = useState<{ start: InviteStart | null; key: number } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [viewAs, setViewAs] = useState<{ role: TeamRole; name: string | null } | null>(null);
  const [linkPreview, setLinkPreview] = useState<PendingInvite | null>(null);

  const refresh = () => utils.team.list.invalidate();
  const onError = (e: { message: string }) => toast.error(e.message);
  const revoke = trpc.team.revokeInvite.useMutation({ onSuccess: () => { toast.success(t.revoked); refresh(); }, onError });
  const remove = trpc.team.removeMember.useMutation({ onSuccess: () => { toast.success(t.removed); refresh(); }, onError });
  const changeRole = trpc.team.changeRole.useMutation({ onSuccess: () => { toast.success(t.roleChanged); refresh(); }, onError });

  const data = list.data;
  const ownerName = user?.name || null;
  const seatsTotal = data ? data.staffSeats + 1 : 10;
  const seatsUsed = data ? data.staffUsed + 1 : 1;
  const staffFull = !!data && data.staffUsed >= data.staffSeats;
  const day = (d: Date | string) => new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const openInvite = (start: InviteStart | null) => setInvite((v) => ({ start, key: (v?.key ?? 0) + 1 }));

  const headTools = (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-[13px] tabular-nums text-slate-500">{hasTeam ? t.seatsLine(seatsUsed, seatsTotal) : t.seatsLocked}</span>
      <button type="button" className={BTN} onClick={() => setTourOpen(true)}><Monitor className="h-4 w-4" aria-hidden />{t.tourBtn}</button>
      {hasTeam
        ? <button type="button" className={BTN_PRIMARY} onClick={() => openInvite(null)} disabled={!data}><Plus className="h-4 w-4" aria-hidden />{t.inviteBtn}</button>
        : <button type="button" className={BTN} onClick={() => navigate("/settings?sec=plan")} title={t.locked.title}><Lock className="h-4 w-4 text-slate-400" aria-hidden />{t.inviteBtn}</button>}
    </div>
  );

  if (plan.isLoading) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-4" role="status" aria-label={t.title}>
          <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-72 max-w-full" /></div>
          <Skeleton className="h-60 rounded-[14px]" />
          <div className="grid gap-3.5 lg:grid-cols-2"><Skeleton className="h-80 rounded-[14px]" /><Skeleton className="h-80 rounded-[14px]" /></div>
        </div>
      </AnimatedPage>
    );
  }

  const ownerRow = (
    <div className={ROW}>
      <div className="min-w-0">
        <b className="block truncate font-semibold text-slate-900">{ownerName || user?.email}</b>
        <span className="block truncate text-xs text-slate-500">{user?.email}</span>
      </div>
      <span className="col-start-1 row-start-2 min-w-0 md:col-start-auto md:row-start-auto"><b className="text-[13px] font-semibold text-slate-900">{t.owner}</b><span className="block text-xs text-slate-500">{t.roleShort.owner}</span></span>
      <span className="hidden text-[13px] text-slate-500 md:block">{t.last.now}</span>
      <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start"><Dst tone="good">{t.status.in}</Dst></span>
      <span className="col-start-2 row-start-2 justify-self-end text-xs text-slate-500 md:col-start-auto md:row-start-auto">{t.you}</span>
    </div>
  );

  const menuItem = "gap-2 py-2.5 text-sm";
  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-[750] tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
          </div>
          {headTools}
        </header>

        {/* People and invitations */}
        <section className="overflow-hidden rounded-[14px] border border-slate-200 bg-white" aria-label={t.members}>
          {ownerRow}
          {hasTeam && list.isError && (
            <div className="border-t border-slate-200 px-4 py-5 text-center" role="alert">
              <p className="text-sm text-slate-600">{t.loadError}</p>
              <button type="button" onClick={() => list.refetch()} className={`mt-2 ${BTN}`}><RefreshCw className="h-4 w-4" />{t.retry}</button>
            </div>
          )}
          {hasTeam && !data && !list.isError && <div className="space-y-2 border-t border-slate-200 p-4" role="status" aria-label={t.members}><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div>}
          {data?.members.map((m) => {
            const who = m.name || m.email || "";
            return (
              <div key={`m${m.id}`} className={ROW}>
                <div className="min-w-0">
                  <b className="block truncate font-semibold text-slate-900">{who}</b>
                  <span className="block truncate text-xs text-slate-500">{m.email}</span>
                </div>
                <span className="col-start-1 row-start-2 min-w-0 md:col-start-auto md:row-start-auto"><b className="text-[13px] font-semibold text-slate-900">{t.roles[m.role].name}</b><span className="block text-xs text-slate-500">{t.roleShort[m.role]}</span></span>
                <span className="hidden text-[13px] text-slate-500 md:block">{lastSeen(m.lastSignInAt, now, t, locale)}</span>
                <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start"><Dst tone="good">{t.status.in}</Dst></span>
                <span className="col-start-2 row-start-2 justify-self-end md:col-start-auto md:row-start-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={t.menu.label(who)} title={t.menu.label(who)} className={`grid h-10 w-10 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 ${FOCUS}`}><MoreHorizontal className="h-4 w-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem className={menuItem} onSelect={() => setViewAs({ role: m.role, name: m.name })}><Eye className="h-4 w-4" />{t.menu.viewAs(firstOf(who))}</DropdownMenuItem>
                      <DropdownMenuItem className={menuItem} disabled={changeRole.isPending} onSelect={() => changeRole.mutate({ id: m.id, role: m.role === "staff" ? "accountant" : "staff" })}>
                        <UserCog className="h-4 w-4" />{t.menu.changeTo(t.roles[m.role === "staff" ? "accountant" : "staff"].name)}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className={`${menuItem} text-red-600 focus:text-red-700`} onSelect={() => { if (window.confirm(t.removeConfirm(who))) remove.mutate({ id: m.id }); }}><X className="h-4 w-4" />{t.menu.remove}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            );
          })}
          {data?.invites.map((i) => {
            const who = i.name || i.email;
            return (
              <div key={`i${i.id}`} className={ROW}>
                <div className="min-w-0">
                  <b className="block truncate font-semibold text-slate-900">{who}</b>
                  <span className="block truncate text-xs text-slate-500">{i.name ? i.email : t.status.invited}</span>
                </div>
                <span className="col-start-1 row-start-2 min-w-0 md:col-start-auto md:row-start-auto"><b className="text-[13px] font-semibold text-slate-900">{t.roles[i.role].name}</b><span className="block text-xs text-slate-500">{t.roleShort[i.role]}</span></span>
                <span className="hidden text-[13px] text-slate-500 md:block">{t.expiresOn(day(i.expiresAt))}</span>
                <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start"><Dst tone="open">{t.status.invited}</Dst></span>
                <span className="col-start-2 row-start-2 justify-self-end md:col-start-auto md:row-start-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={t.menu.label(who)} title={t.menu.label(who)} className={`grid h-10 w-10 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 ${FOCUS}`}><MoreHorizontal className="h-4 w-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuItem className={menuItem} onSelect={() => setLinkPreview(i)}><Eye className="h-4 w-4" />{t.menu.preview}</DropdownMenuItem>
                      <DropdownMenuItem className={menuItem} onSelect={() => openInvite({ email: i.email, name: i.name, role: i.role })}><Link2 className="h-4 w-4" />{t.menu.newLink}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className={`${menuItem} text-red-600 focus:text-red-700`} onSelect={() => { if (window.confirm(t.revokeConfirm(i.email))) revoke.mutate({ id: i.id }); }}><X className="h-4 w-4" />{t.menu.cancel}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            );
          })}
        </section>

        <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* What each role can do: straight from the server's rules */}
          <section className={CARD} aria-labelledby="tm-perm">
            <h2 id="tm-perm" className="text-[15px] font-bold text-slate-900">{t.perm.title}</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-2 pr-2 text-left font-semibold"><span className="sr-only">{t.perm.title}</span></th>
                    {PERM_COLUMNS.map((c) => <th key={c} scope="col" className="px-1.5 py-2 text-center font-semibold">{c === "owner" ? t.owner : t.roles[c].name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {perms.map((row) => (
                    <tr key={row.key} className="border-b border-slate-200 last:border-b-0">
                      <th scope="row" className="py-2.5 pr-2 text-left font-normal text-slate-900">{t.perm.rows[row.key]}</th>
                      {PERM_COLUMNS.map((c) => <td key={c} className="px-1.5 py-2.5 text-center"><PermCell level={row.levels[c]} t={t} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[13px] text-slate-500">{t.perm.note}</p>
          </section>

          <div className="grid gap-3.5">
            {hasTeam ? (
              <>
                <section className={CARD} aria-labelledby="tm-seats">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h2 id="tm-seats" className="text-[15px] font-bold text-slate-900">{t.seatsCard.title}</h2>
                    {data && <Dst tone={staffFull ? "warn" : "good"}>{staffFull ? t.seatsCard.full : t.seatsCard.left(data.staffSeats - data.staffUsed)}</Dst>}
                  </div>
                  <p className="text-[13px] text-slate-500">{t.seatsCard.text}</p>
                  {data && (
                    <>
                      <div className="mt-2.5 flex gap-1" aria-hidden>
                        {Array.from({ length: seatsTotal }, (_, n) => <span key={n} className={cn("h-1.5 flex-1 rounded-full", n === 0 ? "bg-slate-900" : n < seatsUsed ? "bg-blue-600" : "bg-slate-200")} />)}
                      </div>
                      <p className="mt-2 text-[13px] text-slate-700">{t.seatsCard.accountant(data.accountantUsed)}</p>
                    </>
                  )}
                </section>
                <section className={CARD} aria-labelledby="tm-act">
                  <h2 id="tm-act" className="text-[15px] font-bold text-slate-900">{t.activity.title}</h2>
                  {!data ? <Skeleton className="mt-3 h-24 rounded-xl" /> : data.activity.length === 0 ? (
                    <p className="mt-2 text-[13px] text-slate-500">{t.activity.empty}</p>
                  ) : (
                    <ul className="mt-3">
                      {data.activity.map((a, n) => {
                        const who = a.name || a.email || t.activity.someone;
                        return (
                          <li key={`${a.kind}-${n}`} className="relative grid grid-cols-[78px_minmax(0,1fr)] gap-2.5 pb-3.5 text-[13px] last:pb-0">
                            <span className="text-xs text-slate-500">{whenLabel(a.at, now, t, locale)}</span>
                            <span className={cn("absolute left-[88px] top-[5px] h-2 w-2 rounded-full", a.kind === "joined" ? "bg-emerald-600" : "bg-blue-600")} aria-hidden />
                            {n < data.activity.length - 1 && <span className="absolute bottom-0 left-[91.5px] top-[15px] w-px bg-slate-200" aria-hidden />}
                            <span className="pl-[18px] text-slate-700">
                              {a.kind === "invited"
                                ? <><b className="font-semibold text-slate-900">{t.activity.youWho}</b> {t.activity.invited(who, t.roles[a.role].name)}</>
                                : <><b className="font-semibold text-slate-900">{who}</b> {a.kind === "joined" ? t.activity.joined : t.activity.signedIn}</>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </>
            ) : (
              <section className={CARD} aria-labelledby="tm-locked">
                <h2 id="tm-locked" className="flex items-center gap-2 text-[15px] font-bold text-slate-900"><Lock className="h-4 w-4 text-slate-400" aria-hidden />{t.locked.title}</h2>
                <p className="mt-1 text-[13px] text-slate-500">{t.locked.text}</p>
                <ul className="mt-3 grid gap-1.5">
                  {t.locked.points.map((p) => <li key={p} className="flex items-start gap-2 text-[13px] text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{p}</li>)}
                </ul>
                <button type="button" onClick={() => navigate("/settings?sec=plan")} className={`mt-3.5 ${BTN_PRIMARY}`}>{t.locked.cta}</button>
              </section>
            )}
          </div>
        </div>
      </div>

      {invite && data && (
        <InviteDialog key={invite.key} open onClose={() => setInvite(null)} start={invite.start} staffFull={staffFull} accountantTaken={data.accountantUsed}
          company={company} ownerName={ownerName} onCreated={refresh} />
      )}
      <TourDialog open={tourOpen} onClose={() => setTourOpen(false)} company={company} ownerName={ownerName} />
      <ViewAsDialog target={viewAs} onClose={() => setViewAs(null)} company={company} canEnter={wired}
        onEnter={() => { if (!viewAs) return; startViewAs(viewAs); setViewAs(null); navigate(ROLE_HOME[viewAs.role]); }} />
      <Dialog open={!!linkPreview} onOpenChange={(o) => { if (!o) setLinkPreview(null); }}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-h-[90vh] sm:max-w-[520px] sm:rounded-2xl">
          <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left">
            <DialogTitle className="text-[17px] font-[750] text-slate-900">{t.invite.previewTitle}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">{linkPreview ? linkPreview.email : ""}</DialogDescription>
          </DialogHeader>
          {linkPreview && (
            <div className="overflow-y-auto px-4 pb-4 pt-2">
              <div className="rounded-xl bg-slate-100 p-3.5">
                <JoinCardPreview companyName={company.name} logo={company.logo} ownerName={ownerName} role={linkPreview.role} email={linkPreview.email} name={linkPreview.name}
                  expires={new Date(linkPreview.expiresAt).toLocaleDateString(locale, { day: "numeric", month: "long" })} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  );
}

function PermCell({ level, t }: { level: PermLevel; t: TeamCopy }) {
  if (level === "none") return <><Minus className="mx-auto h-4 w-4 text-slate-400" aria-hidden /><span className="sr-only">{t.perm.no}</span></>;
  return (
    <span className="inline-grid justify-items-center">
      <Check className="h-4 w-4 text-emerald-600" aria-hidden /><span className="sr-only">{t.perm.yes}</span>
      {level === "read" && <span className="block text-xs font-medium text-slate-500">{t.perm.readOnly}</span>}
    </span>
  );
}
