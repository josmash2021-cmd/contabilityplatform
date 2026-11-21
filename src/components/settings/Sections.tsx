import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, Bell, CheckCircle2, CreditCard, Download, KeyRound, Landmark, Loader2, LogOut, Unlink, Wifi } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import type { Lang } from "@/i18n/lang";
import { settingsCopy } from "@/i18n/copy/settings";
import { billingCopy } from "@/i18n/copy/billing";
import { Dst, Fld, Item, SetTitle } from "./ui";
import { BTN_PRIMARY, BTN_SM, FOCUS, INP, READONLY, SET_SUB } from "./styles";

type Mode = "business" | "personal";

// ── Tu cuenta / Tu perfil ──

/** The person's name (saved on the server) and their login email (read-only). */
export function AccountSection({ mode, onLanguage }: { mode: Mode; onLanguage: () => void }) {
  const t = useCopy(settingsCopy);
  const a = t.account;
  const { user, setAuthUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const save = trpc.settings.updateProfile.useMutation({
    onSuccess: (r) => {
      if (user) setAuthUser({ ...user, name: r.name });
      toast.success(a.nameSaved);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) { toast.error(a.nameEmpty); return; } save.mutate({ name: name.trim() }); }}>
      <SetTitle>{mode === "personal" ? a.titlePersonal : a.title}</SetTitle>
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <Fld id="set-acc-name" label={a.name}><input id="set-acc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoComplete="name" className={INP} /></Fld>
        <Fld id="set-acc-email" label={a.email} hint={a.emailHint}><input id="set-acc-email" value={user?.email ?? ""} readOnly aria-readonly="true" className={`${INP} ${READONLY}`} /></Fld>
      </div>
      <p className="mt-2 text-[13px] text-slate-500">
        {a.langNote.split(a.goLanguage)[0]}
        <button type="button" onClick={onLanguage} className={`font-semibold text-blue-600 underline underline-offset-2 ${FOCUS}`}>{a.goLanguage}</button>
        {a.langNote.split(a.goLanguage)[1] ?? ""}
      </p>
      <div className="mt-3.5">
        <button type="submit" disabled={save.isPending} className={BTN_PRIMARY}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{save.isPending ? t.saving : t.save}
        </button>
      </div>
    </form>
  );
}

// ── Conexiones ──

/** Real connections only: the banks (Plaid) and, for a business, the Clover card terminal. */
export function ConnectionsSection({ mode }: { mode: Mode }) {
  const t = useCopy(settingsCopy).connections;
  const banks = trpc.brand.institutions.useQuery(undefined, { staleTime: 60_000 });
  const list = banks.data ?? [];
  const trouble = list.find((b) => b.status === "needs_reconnect") ?? list.find((b) => b.status === "error");
  const bankStatus = banks.isLoading ? null
    : trouble ? <Dst tone="warn">{trouble.status === "needs_reconnect" ? t.banksNeed(trouble.name) : t.banksError(trouble.name)}</Dst>
      : list.length ? <Dst tone="good">{t.banksOk(list.length)}</Dst>
        : <Dst tone="muted">{t.banksNone}</Dst>;
  const bankPath = mode === "personal" ? "/personal/bank" : "/bank";
  return (
    <>
      <SetTitle>{t.title}</SetTitle>
      <ul className="mt-2.5 grid gap-2">
        <Item icon={<Landmark className="h-5 w-5" aria-hidden />} title={t.banks} meta={bankStatus ?? <Skeleton className="mt-1 h-3.5 w-40" />}
          right={<Link to={bankPath} className={BTN_SM}>{list.length ? t.see : t.connect}</Link>} />
        {mode === "business" && <CloverItem />}
      </ul>
      <p className="mt-3 text-[13px] text-slate-500">{t.note}</p>
    </>
  );
}

/** The Clover terminal (card payments in Cobrar): connect with Merchant ID and API token, or disconnect. */
function CloverItem() {
  const t = useCopy(settingsCopy).connections;
  const { settings } = useCopy(billingCopy);
  const c = settings.clover;
  const utils = trpc.useUtils();
  const { data: account, isLoading } = trpc.clover.getAccount.useQuery();
  const [open, setOpen] = useState(false);
  const [merchantId, setMerchantId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const connect = trpc.clover.connect.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(c.connected(String(data.merchantName))); utils.clover.getAccount.invalidate(); setMerchantId(""); setAccessToken(""); setOpen(false); }
      else toast.error(data.error || c.connectError);
    },
    onError: (err) => toast.error(err.message),
  });
  const disconnect = trpc.clover.disconnect.useMutation({
    onSuccess: () => { toast.success(c.disconnected); utils.clover.getAccount.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const on = !!account;
  return (
    <li className="rounded-xl bg-slate-100 px-3 py-[11px]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span className="grid w-[22px] place-items-center text-blue-600"><CreditCard className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <b className="block text-sm font-semibold text-slate-900">{t.clover}</b>
          <span className="block text-xs text-slate-500">
            {isLoading ? <Skeleton className="mt-1 h-3.5 w-40" /> : on ? <Dst tone="good">{t.cloverOn(account.merchantName || c.connectedFallback)}</Dst> : t.cloverOff}
          </span>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="set-clover" className={cn(BTN_SM, "col-start-2 justify-self-start sm:col-start-auto sm:justify-self-end")}>
          {open ? t.close : on ? t.see : t.setup}
        </button>
      </div>
      {open && (
        <div id="set-clover" className="mt-3 border-t border-slate-200 pt-3">
          {on ? (
            <div className="space-y-2.5">
              <p className="flex flex-wrap items-center gap-2 text-sm"><Wifi className="h-4 w-4 text-emerald-600" aria-hidden /><b className="font-semibold text-slate-900">{account.merchantName || c.connectedFallback}</b><span className="text-xs text-slate-500">({account.merchantId})</span></p>
              {account.deviceId
                ? <p className="rounded-lg bg-white p-2.5 text-xs text-slate-600"><span className="text-slate-500">{c.terminal}</span> {account.deviceName || account.deviceId}</p>
                : <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">{c.noTerminal}</p>}
              <button type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className={`${BTN_SM} border-red-200 text-red-600 hover:bg-red-50`}>
                {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}{c.disconnect}
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-[13px] text-slate-500">{c.intro}</p>
              <Fld id="clover-merchant" label={`${t.merchantId} ${t.required}`}>
                <input id="clover-merchant" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder={settings.example("ABCD123456789")} autoComplete="off" className={INP} />
              </Fld>
              <Fld id="clover-token" label={`${t.apiToken} ${t.required}`} hint={c.tokenHint}>
                <input id="clover-token" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={settings.example("12345678-1234-1234-1234-123456789abc")} autoComplete="off" className={INP} />
              </Fld>
              <Fld id="clover-device" label={c.deviceLabel} hint={c.deviceHint}>
                <input id="clover-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder={settings.example("C081UG42553306")} autoComplete="off" className={INP} />
              </Fld>
              <button type="button" onClick={() => connect.mutate({ merchantId, accessToken, deviceId: deviceId || undefined })} disabled={connect.isPending || !merchantId || !accessToken} className={`${BTN_PRIMARY} justify-self-start`}>
                {connect.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />{c.connecting}</> : <><Wifi className="h-4 w-4" />{c.connect}</>}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── Avisos ──

/** Only what's real: the bell inside the app. No email, text or push yet, and the page says so. */
export function NoticesSection({ mode }: { mode: Mode }) {
  const t = useCopy(settingsCopy).notices;
  const rows = mode === "personal" ? t.personal : t.business;
  return (
    <>
      <SetTitle>{t.title}</SetTitle>
      <p className="text-[13px] text-slate-500">{t.sub}</p>
      <p className="mt-2.5 flex items-start gap-2 rounded-[10px] bg-blue-50 px-3 py-2.5 text-[13px] text-slate-800"><Bell className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />{t.honest}</p>
      <p className={SET_SUB}>{t.whatTitle}</p>
      <ul>
        {rows.map(([title, sub]) => (
          <li key={title} className="flex items-center justify-between gap-3 border-t border-slate-200 py-2.5 first:border-t-0">
            <span className="min-w-0"><b className="block text-sm font-semibold text-slate-900">{title}</b><small className="block text-xs text-slate-500">{sub}</small></span>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t.always}</span>
          </li>
        ))}
      </ul>
      <p className={SET_SUB}>{t.whereTitle}</p>
      <ul className="mt-1.5 grid gap-2">
        <Item icon={<Bell className="h-[18px] w-[18px]" aria-hidden />} title={t.inApp} meta={t.inAppSub} right={<Dst tone="good">{t.on}</Dst>} />
      </ul>
    </>
  );
}

// ── Idioma ──

export function LanguageSection() {
  const t = useCopy(settingsCopy).language;
  const { lang, setLang } = useLang();
  const options: [Lang, string][] = [["es", t.es], ["en", t.en]];
  return (
    <>
      <SetTitle>{t.title}</SetTitle>
      <p className="text-[13px] text-slate-500">{t.sub}</p>
      <div role="radiogroup" aria-label={t.title} className="mt-3 grid max-w-xs gap-1.5">
        {options.map(([o, label]) => (
          <label key={o} lang={o} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500", lang === o ? "border-blue-600 bg-blue-50 text-slate-900" : "border-slate-200 text-slate-700 hover:bg-slate-50")}>
            <input type="radio" name="set-lang" value={o} checked={lang === o} onChange={() => setLang(o)} className="h-4 w-4 accent-blue-600" />{label}
          </label>
        ))}
      </div>
    </>
  );
}

// ── Seguridad ──

export function SecuritySection() {
  const t = useCopy(settingsCopy).security;
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const change = trpc.settings.changePassword.useMutation({
    onSuccess: () => { toast.success(t.saved); setOpen(false); setCurrent(""); setNext(""); setRepeat(""); },
    onError: (e) => toast.error(e.message),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { toast.error(t.short); return; }
    if (next !== repeat) { toast.error(t.mismatch); return; }
    change.mutate({ current, next });
  };
  return (
    <>
      <SetTitle>{t.title}</SetTitle>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-2.5">
        <span className="min-w-0"><b className="block text-sm font-semibold text-slate-900">{t.password}</b><small className="block text-xs text-slate-500">{t.passwordSub}</small></span>
        {!open && <button type="button" className={BTN_SM} onClick={() => setOpen(true)}><KeyRound className="h-[15px] w-[15px]" />{t.change}</button>}
      </div>
      {open && (
        <form onSubmit={submit} className="grid gap-3 border-b border-slate-200 py-3 sm:max-w-md">
          <Fld id="pw-current" label={t.current}><input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required className={INP} /></Fld>
          <Fld id="pw-next" label={t.next} hint={t.hint}><input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required className={INP} /></Fld>
          <Fld id="pw-repeat" label={t.repeat}><input id="pw-repeat" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" minLength={8} required className={INP} /></Fld>
          <p className="text-xs text-slate-500">{t.otherDevices}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={change.isPending || !current || !next || !repeat} className={BTN_PRIMARY}>{change.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t.save}</button>
            <button type="button" className={BTN_SM + " min-h-10"} onClick={() => setOpen(false)}>{t.cancel}</button>
          </div>
        </form>
      )}
      <p className={SET_SUB}>{t.session}</p>
      <ul className="mt-1.5 grid gap-2">
        <Item icon={<CheckCircle2 className="h-[18px] w-[18px]" aria-hidden />} title={t.session} meta={t.sessionSub(user?.email ?? "")}
          right={<button type="button" onClick={logout} className={`${BTN_SM} text-red-600`}><LogOut className="h-[15px] w-[15px]" />{t.logout}</button>} />
      </ul>
    </>
  );
}

// ── Tus datos ──

export function DataSection({ mode }: { mode: Mode }) {
  const t = useCopy(settingsCopy).data;
  return (
    <>
      <SetTitle>{t.title}</SetTitle>
      <p className="text-[13px] text-slate-500">{t.sub}</p>
      {mode === "business" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/reports" className={`inline-flex min-h-10 items-center gap-[7px] rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 ${FOCUS}`}><Download className="h-4 w-4" />{t.reports}</Link>
          <span className="text-xs text-slate-500">{t.reportsNote}</span>
        </div>
      )}
      <div className="mt-4 grid justify-items-start gap-1.5 rounded-xl border border-red-600/25 bg-red-50 p-3.5">
        <b className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />{t.deleteTitle}</b>
        <p className="text-[13px] text-slate-600">{t.deleteText}</p>
        <Link to="/privacy" className={BTN_SM}>{t.deleteHow}</Link>
      </div>
    </>
  );
}
