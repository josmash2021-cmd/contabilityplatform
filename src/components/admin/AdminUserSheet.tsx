// A person's card in the admin ("Ver"): who they are, their status and plan, payments, banks, team and taxes,
// and the actions with their names: email them, give more free days, give or remove free access, block, delete.
import { useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowLeftRight, ArrowRight, Clock, Gift, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useCopy, useLang } from "@/i18n/useI18n";
import { adminCopy } from "@/i18n/copy/admin";
import { taxesCopy } from "@/i18n/copy/taxes";
import { cn } from "@/lib/utils";
import { Avatar, StatusChip } from "./adminUi";
import { fmtDay, fmtMoney, planLabel, timeAgo } from "./adminFormat";

const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[background-color,transform] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";

export function AdminUserSheet({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const t = useCopy(adminCopy);
  const steps = useCopy(taxesCopy).stepsShort;
  const { lang } = useLang();
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const { data: d } = trpc.admin.userDetail.useQuery({ userId: userId ?? 0 }, { enabled: !!userId });
  const [ask, setAsk] = useState<null | "extend" | "grant" | "block" | "delete" | "mode">(null);

  const refresh = () => Promise.all([utils.admin.userDetail.invalidate(), utils.admin.listUsers.invalidate(), utils.admin.overview.invalidate(), utils.admin.stats.invalidate()]);
  const fail = () => toast.error(t.sheet.error);
  const extend = trpc.admin.extendTrial.useMutation({
    onSuccess: (r) => { if (r.success) { toast.success(t.sheet.extended(fmtDay(r.until, lang, true))); setAsk(null); void refresh(); } else fail(); },
    onError: fail,
  });
  const grant = trpc.subscription.grantSubscription.useMutation({
    onSuccess: (r) => { if (r.success) { toast.success(t.sheet.granted); setAsk(null); void refresh(); } else fail(); },
    onError: fail,
  });
  const revoke = trpc.subscription.revokeSubscription.useMutation({
    onSuccess: () => { toast.success(t.sheet.revoked); void refresh(); },
    onError: fail,
  });
  const block = trpc.admin.toggleUserBlock.useMutation({
    onSuccess: (r) => { if (r.success) { setAsk(null); void refresh(); } else fail(); },
    onError: fail,
  });
  const setMode = trpc.admin.setMode.useMutation({
    onSuccess: (r, input) => {
      // Their own account: no need to sign out, the saved session takes the new mode and the app opens on that side.
      if (r.success && me && Number(input.userId) === Number(me.id)) {
        try { localStorage.setItem("auth_user", JSON.stringify({ ...me, modePreference: r.mode })); } catch { /* the next sign-in has it */ }
        window.location.assign(r.mode === "personal" ? "/personal" : "/");
        return;
      }
      if (r.success) { toast.success(t.sheet.modeDone(t.kind[r.mode])); setAsk(null); void refresh(); return; }
      toast.error(r.error === "teamMember" ? t.sheet.modeTeamMember : r.error === "hasTeam" ? t.sheet.modeHasTeam : t.sheet.error);
      setAsk(null);
    },
    onError: fail,
  });
  const del = trpc.admin.deleteUser.useMutation({
    onSuccess: (r) => { if (r.success) { setAsk(null); onClose(); void refresh(); } else fail(); },
    onError: fail,
  });

  const u = d?.user;
  const s = d?.status;
  const name = u?.name || u?.email || "";
  const isAdmin = s?.kind === "admin";
  // The admin's own card: they can switch their own account between Negocio and Personal (not block or delete it).
  const isMe = !!u && !!me && Number(u.id) === Number(me.id);
  const canExtend = !!s && ["trial", "ended", "canceled", "free"].includes(s.kind);
  const canGrant = !!s && !isAdmin && s.kind !== "blocked" && s.kind !== "gift" && s.kind !== "paying";
  const otherMode = u?.mode === "personal" ? "business" : "personal";
  const paysSomething = !!s && (s.kind === "paying" || s.kind === "failed");
  const lastFailed = d?.payments.find((p) => p.status === "failed");
  const taxText = !d?.tax ? t.sheet.noTax : d.tax.submitted && d.tax.step >= 0 ? t.sheet.taxStep(d.tax.year, steps[d.tax.step] ?? "") : t.sheet.taxDraft(d.tax.year);

  const facts: [string, string][] = d && u ? [
    [t.sheet.joined, fmtDay(u.createdAt, lang, true)],
    [t.sheet.seen, timeAgo(u.lastSignInAt, lang, t)],
    [t.sheet.paid, fmtMoney(d.paidTotal, lang)],
    [t.sheet.banks, d.banks.length ? `${d.banks.length} (${d.banks.join(", ")})` : t.sheet.noBanks],
    [t.sheet.team, t.sheet.teamN(d.team)],
    [t.sheet.taxes, taxText],
  ] : [];

  return (
    <Sheet open={!!userId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[560px] [&>button]:hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 pb-5 pt-[max(20px,env(safe-area-inset-top))]">
          <div className="flex items-center justify-end">
            <button type="button" onClick={onClose} aria-label={t.sheet.close} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <Avatar name={u?.name} email={u?.email} className="h-14 w-14 text-xl" />
            <div className="grid min-w-0 gap-1">
              <SheetTitle className="truncate text-[22px] font-extrabold tracking-tight">{name || "…"}</SheetTitle>
              <SheetDescription className="truncate text-slate-500">{u?.email}{u ? ` · ${t.kind[u.mode]}` : ""}</SheetDescription>
              {s && u && (
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip status={s} t={t} />
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{planLabel(s, u.mode, t, lang)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid flex-1 content-start gap-5 px-6 py-5">
          {s?.kind === "failed" && lastFailed && (
            <div className="flex gap-3 rounded-2xl bg-red-50 p-4 text-red-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
              <div className="grid gap-0.5"><b>{t.sheet.failedNote(fmtDay(lastFailed.paidAt, lang))}</b><span className="text-[13px]">{t.sheet.failedText}</span></div>
            </div>
          )}
          {isAdmin && <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">{t.sheet.adminNote}</p>}

          <dl className="grid grid-cols-2 gap-3">
            {facts.map(([k, v]) => (
              <div key={k} className="grid gap-0.5 rounded-2xl border border-slate-200 px-4 py-3">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-sm font-semibold text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>

          <section className="grid gap-2">
            <h3 className="text-[15px] font-bold">{t.sheet.payments}</h3>
            {d && d.payments.length === 0 && <p className="text-sm text-slate-500">{t.sheet.noPayments}</p>}
            {d && d.payments.length > 0 && (
              <ul className="overflow-hidden rounded-2xl border border-slate-200">
                {d.payments.map((p) => {
                  const st = p.gift ? "gift" : p.status;
                  return (
                    <li key={p.id} className="grid grid-cols-[1.4fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-sm last:border-0">
                      <span className="min-w-0 truncate">{fmtDay(p.paidAt, lang)} · {t.plan[p.plan]}</span>
                      <b className={cn(p.gift && "text-slate-400")}>{fmtMoney(p.amount, lang)}</b>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", st === "succeeded" ? "bg-emerald-50 text-emerald-700" : st === "failed" ? "bg-red-50 text-red-700" : st === "gift" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600")}>
                        {t.sheet.payStatus[st as keyof typeof t.sheet.payStatus] ?? st}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {u && <Link to={`/admin/actividad/${u.id}`} onClick={onClose} className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">{t.sheet.activity}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
          </section>

          {/* Give more free days: the choice opens right here */}
          {ask === "extend" && u && (
            <div className="grid gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <div className="grid gap-0.5"><b>{t.sheet.extendTitle}</b><span className="text-[13px] text-slate-600">{t.sheet.extendText}</span></div>
              <div className="grid grid-cols-4 gap-2">
                {[3, 7, 14, 30].map((n) => (
                  <button key={n} type="button" disabled={extend.isPending} onClick={() => extend.mutate({ userId: u.id, days: n })} className={cn(btn, "h-10 border border-blue-200 bg-white px-2 text-blue-800 hover:bg-blue-50")}>{t.sheet.days(n)}</button>
                ))}
              </div>
              <button type="button" onClick={() => setAsk(null)} className="w-fit text-sm font-semibold text-slate-600 hover:text-slate-900">{t.sheet.cancel}</button>
            </div>
          )}
          {ask === "grant" && u?.email && (
            <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
              <div className="grid gap-0.5"><b>{t.sheet.grantTitle}</b><span className="text-[13px] text-slate-600">{t.sheet.grantText}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={grant.isPending} onClick={() => grant.mutate({ email: u.email!, plan: "monthly" })} className={cn(btn, "h-10 border border-violet-200 bg-white text-violet-800 hover:bg-violet-50")}>{t.sheet.grantMonthly}</button>
                <button type="button" disabled={grant.isPending} onClick={() => grant.mutate({ email: u.email!, plan: "annual" })} className={cn(btn, "h-10 border border-violet-200 bg-white text-violet-800 hover:bg-violet-50")}>{t.sheet.grantAnnual}</button>
              </div>
              <button type="button" onClick={() => setAsk(null)} className="w-fit text-sm font-semibold text-slate-600 hover:text-slate-900">{t.sheet.cancel}</button>
            </div>
          )}
        </div>

        {/* The actions, with their names */}
        {u && s && (
          <div className="grid gap-2.5 border-t border-slate-200 px-6 pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-4">
            <div className="grid grid-cols-2 gap-2.5">
              <a href={u.email ? `mailto:${u.email}` : undefined} className={cn(btn, "bg-slate-900 text-white hover:bg-slate-800", !canExtend && s.kind !== "gift" && !canGrant && "col-span-2")}><Mail className="h-4 w-4" aria-hidden="true" />{t.sheet.write}</a>
              {canExtend
                ? <button type="button" onClick={() => setAsk("extend")} className={cn(btn, "border border-slate-200 bg-white hover:bg-slate-50")}><Clock className="h-4 w-4" aria-hidden="true" />{t.sheet.extend}</button>
                : s.kind === "gift"
                  ? <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate({ userId: u.id })} className={cn(btn, "border border-slate-200 bg-white hover:bg-slate-50")}><Gift className="h-4 w-4" aria-hidden="true" />{t.sheet.revoke}</button>
                  : canGrant ? <button type="button" onClick={() => setAsk("grant")} className={cn(btn, "border border-slate-200 bg-white hover:bg-slate-50")}><Gift className="h-4 w-4" aria-hidden="true" />{t.sheet.grant}</button> : null}
            </div>
            {canExtend && canGrant && (
              <button type="button" onClick={() => setAsk("grant")} className={cn(btn, "border border-slate-200 bg-white hover:bg-slate-50")}><Gift className="h-4 w-4" aria-hidden="true" />{t.sheet.grant}</button>
            )}
            {isAdmin && isMe && (
              <button type="button" onClick={() => setAsk("mode")} className={cn(btn, "border border-slate-200 bg-white hover:bg-slate-50")} data-self-mode="">
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />{t.sheet.mode(t.kind[otherMode])}
              </button>
            )}
            {!isAdmin && (
              <>
                <button type="button" onClick={() => setAsk("mode")} className={cn(btn, "border border-slate-200 bg-white hover:bg-slate-50")}>
                  <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />{t.sheet.mode(t.kind[otherMode])}
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  {s.kind === "blocked"
                    ? <button type="button" disabled={block.isPending} onClick={() => block.mutate({ userId: u.id })} className={cn(btn, "border border-slate-200 bg-white hover:bg-slate-50")}>{t.sheet.unblock}</button>
                    : <button type="button" onClick={() => setAsk("block")} className={cn(btn, "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100")}>{t.sheet.block}</button>}
                  <button type="button" onClick={() => setAsk("delete")} className={cn(btn, "border border-red-200 bg-white text-red-700 hover:bg-red-50")}>{t.sheet.delete}</button>
                </div>
                <p className="text-center text-xs text-slate-500">{t.sheet.confirmNote}</p>
              </>
            )}
          </div>
        )}

        <AlertDialog open={ask === "block" || ask === "delete" || ask === "mode"} onOpenChange={(o) => { if (!o) setAsk(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{ask === "delete" ? t.sheet.delete : ask === "mode" ? t.sheet.modeTitle(t.kind[otherMode]) : t.sheet.block}</AlertDialogTitle>
              {ask === "mode" ? (
                <AlertDialogDescription asChild>
                  <div className="grid gap-2 text-sm text-slate-600">
                    <p>{isMe ? t.sheet.modeSelfText(t.kind[otherMode]) : t.sheet.modeText(name, t.kind[otherMode])}</p>
                    <p>{isMe ? t.sheet.modeSelfKeep(t.kind[otherMode === "personal" ? "business" : "personal"]) : t.sheet.modeKeep}</p>
                    {paysSomething && <p className="font-medium text-amber-800">{t.sheet.modePaying}</p>}
                    <p>{isMe ? t.sheet.modeSelf(t.kind[otherMode]) : t.sheet.modeRelogin(t.kind[otherMode])}</p>
                  </div>
                </AlertDialogDescription>
              ) : (
                <AlertDialogDescription>{ask === "delete" ? t.sheet.deleteConfirm(name) : t.sheet.blockConfirm(name)}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.sheet.cancel}</AlertDialogCancel>
              <AlertDialogAction
                className={ask === "delete" ? "bg-red-600 hover:bg-red-700" : undefined}
                onClick={(e) => {
                  e.preventDefault(); if (!u) return;
                  if (ask === "delete") del.mutate({ userId: u.id });
                  else if (ask === "mode") setMode.mutate({ userId: u.id, mode: otherMode });
                  else block.mutate({ userId: u.id });
                }}
              >
                {ask === "delete" ? t.sheet.deleteYes : ask === "mode" ? t.sheet.modeYes(t.kind[otherMode]) : t.sheet.block}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
