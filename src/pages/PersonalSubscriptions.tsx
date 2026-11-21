import { useEffect, useId, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpCircle, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { ConnectBankHero } from "@/components/personal/ConnectBankHero";
import { SubDetailSheet, type SubItem } from "@/components/personal/SubDetailSheet";
import { SubAddSheet } from "@/components/personal/SubAddSheet";
import { Dst, Kpi, Note, PageHead, pbtn, pbtnSm, pbtnSmPrimary, pcard } from "@/components/personal/planKit";
import { daysFrom, shortDay, useToday } from "@/components/personal/planDates";
import { listNames, type Institution } from "@/components/personal/txKit";
import { money } from "@/components/personal/personalUtils";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalPagesCopy } from "@/i18n/copy/personalPages";

const fmt = (n: number) => money(n, true);
const fmt0 = (n: number) => money(Math.round(n));

/**
 * The prototype's Suscripciones (pSubs): what they cost a month and a year and the next charge; "Para revisar"
 * (a cancellation that didn't go through, a yearly renewal coming, a price rise, two video services);
 * every subscription in order of its next charge, then the cancelled ones and the ones waiting to confirm.
 * Detection (subs.list, api/lib/subscriptions.ts) needs similar amounts at a regular interval, enough times,
 * and never counts gas, groceries or transfers. The bank is brought up to date quietly when the page opens.
 */
export default function PersonalSubscriptions() {
  const all = useCopy(personalPagesCopy);
  const t = all.subs.p;
  const old = all.subs;
  const locale = intlLocale(useLang().lang);
  const uid = useId();
  const utils = trpc.useUtils();
  const today = useToday();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showPlaid, setShowPlaid] = useState(false);

  const { data: accounts, isLoading: loadingAccounts } = trpc.bank.listAccounts.useQuery();
  const hasAccounts = (accounts?.length ?? 0) > 0;
  const q = trpc.subs.list.useQuery({ today: today.key }, { staleTime: 60_000 });
  const { data: institutions } = trpc.brand.institutions.useQuery(undefined, { enabled: hasAccounts, staleTime: 5 * 60_000, retry: false });
  const insts = institutions as Institution[] | undefined;
  const refresh = () => { void utils.subs.list.invalidate(); };

  // Bring the latest movements in, quietly (new charges, or a cancelled one that charged again).
  const { mutate: syncRecent } = trpc.bank.syncRecent.useMutation({ onSuccess: refresh, onError: () => { /* quiet */ } });
  useEffect(() => { if (hasAccounts) syncRecent(); }, [hasAccounts, syncRecent]);

  // Pending database update: only admins see it (and only they can apply it); a customer never does.
  const { isAdmin } = useAuth();
  const { data: migrationStatus } = trpc.bank.checkMigrationStatus.useQuery(undefined, { enabled: isAdmin });
  const runMigration = trpc.bank.runMigration.useMutation({
    onSuccess: (d) => {
      if (d.success) { toast.success(("message" in d && d.message) || old.migration.done); void utils.bank.checkMigrationStatus.invalidate(); }
      else toast.error(("error" in d && d.error) || old.migration.error);
    },
    onError: (err) => toast.error(err.message),
  });

  const fail = (e: { message: string }) => toast.error(e.message);
  const markSeen = trpc.subs.markSeen.useMutation({ onError: fail });
  const answer = trpc.subs.answerVideo.useMutation({ onError: fail });
  const undo = (fn: () => void) => ({ action: { label: t.toast.undo, onClick: fn } });

  const data = q.data;
  const items = data?.items ?? [];
  const on = items.filter((s) => s.status === "on");
  const gone = items.filter((s) => s.status !== "on");
  const upcoming = on; // the server orders by next charge
  const opened = openKey ? items.find((s) => s.key === openKey) ?? null : null;
  const day = (s: string) => shortDay(s, locale, today.y);
  const inDays = (s: string) => t.inDays(daysFrom(today, s));

  // ── Para revisar ──
  type Alert = { key: string; logo: SubItem; title: string; meta: string; acts: ReactNode; ask?: ReactNode; info?: boolean };
  const alerts: Alert[] = [];
  for (const s of on.filter((x) => x.failed)) {
    alerts.push({
      key: `f-${s.key}`, logo: s, title: t.alert.failed(s.name, fmt(s.amount)), meta: t.alert.failedText,
      acts: <>
        <button type="button" onClick={() => setOpenKey(s.key)} className={pbtnSmPrimary}>{t.alert.retry}</button>
        <button type="button" onClick={() => markSeen.mutate({ key: s.key, name: s.name, kind: "failed" }, { onSuccess: refresh })} className={pbtnSm}>{t.alert.ok}</button>
      </>,
    });
  }
  for (const s of on.filter((x) => x.renewsSoon)) {
    alerts.push({
      key: `r-${s.key}`, logo: s, title: t.alert.renew(s.name, day(s.next), fmt(s.amount)), meta: t.alert.renewText(inDays(s.next)),
      acts: <>
        <button type="button" onClick={() => setOpenKey(s.key)} className={pbtnSm}>{t.alert.view}</button>
        <button type="button" onClick={() => markSeen.mutate({ key: s.key, name: s.name, kind: "renew", date: s.next }, {
          onSuccess: () => { refresh(); toast.success(t.toast.renewSeen(day(s.next))); },
        })} className={pbtnSm}>{t.alert.ok}</button>
      </>,
    });
  }
  for (const s of on.filter((x) => x.raised && !x.raiseSeen)) {
    const r = s.raised!;
    alerts.push({
      key: `p-${s.key}`, logo: s, title: t.alert.raised(s.name, fmt(r.from), fmt(r.to)), meta: t.alert.raisedText(fmt0((r.to - r.from) * (s.freq === "week" ? 52 : s.freq === "month" ? 12 : 1))),
      acts: <>
        <button type="button" onClick={() => setOpenKey(s.key)} className={pbtnSm}>{t.alert.view}</button>
        <button type="button" onClick={() => markSeen.mutate({ key: s.key, name: s.name, kind: "raise", amount: r.to }, {
          onSuccess: () => { refresh(); toast.success(t.toast.raiseSeen(s.name), undo(() => markSeen.mutate({ key: s.key, name: s.name, kind: "raise", amount: 0 }, { onSuccess: refresh }))); },
        })} className={pbtnSm}>{t.alert.ok}</button>
      </>,
    });
  }
  const unused = on.find((s) => s.unused);
  const video = on.filter((s) => s.video);
  if (unused) {
    alerts.push({
      key: `u-${unused.key}`, logo: unused, title: t.alert.unused(unused.name), meta: t.alert.unusedText(fmt(unused.perYear)),
      acts: <button type="button" onClick={() => setOpenKey(unused.key)} className={pbtnSmPrimary}>{t.alert.howCancel}</button>,
    });
  } else if (video.length > 1 && data?.videoAnswer === null) {
    const names = listNames(video.map((s) => s.name), t.and);
    const perMonth = video.reduce((s, x) => s + x.perMonth, 0);
    const reply = (value: string, item?: SubItem) => answer.mutate({ answer: value, unused: item ? { key: item.key, name: item.name } : undefined }, {
      onSuccess: () => {
        refresh();
        toast.success(item ? t.toast.unused(item.name, fmt(item.perYear)) : t.toast.both, undo(() => answer.mutate({ answer: null }, { onSuccess: refresh })));
      },
    });
    alerts.push({
      key: "video", logo: video[0], info: true, title: t.alert.video(names, fmt(perMonth)), meta: video.length === 2 ? t.alert.videoText2 : t.alert.videoTextN, acts: null,
      ask: (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => reply("both")} disabled={answer.isPending} className={pbtnSm}>{video.length === 2 ? t.alert.both2 : t.alert.bothN}</button>
          {video.map((s) => <button key={s.key} type="button" onClick={() => reply(s.key, s)} disabled={answer.isPending} className={pbtnSm}>{t.alert.notUse(s.name)}</button>)}
        </div>
      ),
    });
  }

  const row = (s: SubItem) => {
    const off = s.status !== "on";
    const flags: ReactNode[] = [];
    if (!off && s.failed) flags.push(<Dst key="f" tone="bad" className="text-xs">{t.flag.failed}</Dst>);
    if (!off && s.freq === "year" && daysFrom(today, s.next) <= 30) flags.push(<Dst key="r" tone="warn" className="text-xs">{t.flag.renewSoon}</Dst>);
    if (!off && s.raised) flags.push(<Dst key="p" tone="warn" className="text-xs">{t.flag.raised}</Dst>);
    if (!off && s.unused) flags.push(<Dst key="u" tone="warn" className="text-xs">{t.flag.unused}</Dst>);
    if (s.status === "pending") flags.push(<Dst key="pe" tone="open" className="text-xs">{t.flag.pending}</Dst>);
    if (s.status === "cancelled") flags.push(<Dst key="c" tone="good" className="text-xs">{t.flag.cancelled}</Dst>);
    if (s.via) flags.push(<span key="v">{t.via[s.via]}</span>);
    if (s.manual) flags.push(<span key="m">{t.manualTag}</span>);
    const since = s.since ? t.since(new Date(`${s.since}T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })) : "";
    const meta = s.status === "pending" ? t.metaPending(day(s.expectedOn ?? s.next))
      : s.status === "cancelled" ? (s.expectedOn ? t.metaCancelled(day(s.expectedOn)) : t.metaCancelledOn(day(s.cancelledOn ?? s.confirmedOn ?? today.key)))
      : [t.freq[s.freq], since].filter(Boolean).join(" · ");
    return (
      <li key={s.key} className="border-t border-slate-200 first:border-t-0">
        <button type="button" onClick={() => setOpenKey(s.key)} aria-label={t.open(s.name)}
          className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
          <MerchantLogo name={s.name} logoUrl={s.logoUrl} size={36} />
          <span className="min-w-0">
            <b className="block truncate text-sm font-semibold text-slate-900">{s.name}</b>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500"><span>{meta}</span>{flags}</span>
          </span>
          <span className="grid justify-items-end gap-px">
            <b className="text-sm tabular-nums text-slate-900">{fmt(s.amount)}<span className="ml-px text-xs font-semibold text-slate-500">{t.per[s.freq]}</span></b>
            <small className="whitespace-nowrap text-xs text-slate-500">{off ? t.off : t.when(day(s.next), inDays(s.next))}</small>
          </span>
        </button>
      </li>
    );
  };

  const next = upcoming[0];
  const showConnect = !loadingAccounts && !hasAccounts;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHead title={t.title} sub={t.subtitle} />

        {showConnect && <div className="mb-3.5"><ConnectBankHero onConnect={() => setShowPlaid(true)} /></div>}

        {isAdmin && migrationStatus && !migrationStatus.applied && (
          <section className="mb-3.5 flex items-start gap-3 rounded-[14px] border border-amber-200 bg-amber-50 p-4" role="status">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-900">{old.migration.title}</p>
              <p className="mt-0.5 text-sm text-amber-800">{old.migration.text}</p>
              <p className="mt-1 text-xs text-amber-700">{old.migration.missing(migrationStatus.details)}</p>
              <button type="button" onClick={() => runMigration.mutate()} disabled={runMigration.isPending}
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-[10px] bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60 sm:h-10">
                {runMigration.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />}
                {runMigration.isPending ? old.migration.applying : old.migration.apply}
              </button>
            </div>
          </section>
        )}

        {q.isLoading ? (
          <div className="space-y-3.5" role="status" aria-label={t.loading}>
            <div className="grid gap-3.5 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-[14px]" />)}</div>
            <Skeleton className="h-80 rounded-[14px]" />
          </div>
        ) : q.isError || !data ? (
          <section className={cn(pcard, "py-10 text-center")}>
            <p className="text-sm text-slate-700" role="alert">{t.loadError}</p>
            <button type="button" onClick={() => void q.refetch()} className={cn(pbtn, "mt-3")}>{t.retry}</button>
          </section>
        ) : (
          <>
            <div className="grid gap-3.5 sm:grid-cols-3">
              <Kpi k={data.totals.mixed ? t.kpi.avgMonth : t.kpi.payMonth} v={fmt(data.totals.perMonth)} s={`${t.kpi.active(data.totals.active)}${data.totals.mixed ? t.kpi.mixed : ""}`} />
              <Kpi k={t.kpi.year} v={fmt(data.totals.perYear)} s={t.kpi.yearSub} />
              <Kpi k={t.kpi.next} v={next ? fmt(next.amount) : "—"} s={next ? `${next.name} · ${day(next.next)}` : t.kpi.none} />
            </div>

            {alerts.length > 0 && (
              <section className={cn(pcard, "mt-3.5")} aria-labelledby={`${uid}-rev`}>
                <h2 id={`${uid}-rev`} className="font-semibold text-slate-900">{t.review}</h2>
                <ul className="mt-2.5 grid gap-2">
                  {alerts.map((a) => (
                    <li key={a.key} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl bg-slate-100 px-3.5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                      {a.info ? <Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true" /> : <MerchantLogo name={a.logo.name} logoUrl={a.logo.logoUrl} size={34} />}
                      <div className="min-w-0">
                        <b className="block text-sm text-slate-900">{a.title}</b>
                        <span className="block text-xs text-slate-500">{a.meta}</span>
                        {a.ask}
                      </div>
                      {a.acts && <span className="col-span-2 flex flex-wrap justify-end gap-1.5 sm:col-span-1">{a.acts}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className={cn(pcard, "mt-3.5")} aria-labelledby={`${uid}-list`}>
              <div className="flex items-center justify-between gap-3">
                <h2 id={`${uid}-list`} className="font-semibold text-slate-900">{t.list}</h2>
                <button type="button" onClick={() => setAdding(true)} className={pbtnSm}><Plus className="h-4 w-4" aria-hidden="true" />{t.addManual}</button>
              </div>
              {on.length ? (
                <>
                  <p className="mb-1 mt-2 text-xs text-slate-500">{t.order}</p>
                  <ul className="overflow-hidden rounded-[14px] border border-slate-200">{upcoming.map(row)}</ul>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">{hasAccounts ? t.noneActive : t.noBank}</p>
              )}
              {gone.length > 0 && (
                <>
                  <h3 className="mb-1.5 mt-4 text-[13px] font-semibold text-slate-700">{gone.some((s) => s.status === "pending") ? t.gonePending : t.gone}</h3>
                  <ul className="overflow-hidden rounded-[14px] border border-slate-200">{gone.map(row)}</ul>
                </>
              )}
            </section>
          </>
        )}
        <Note icon={<Search className="h-3.5 w-3.5" />}>{t.note}</Note>
      </div>

      {opened && <SubDetailSheet key={opened.key} item={opened} today={today} institutions={insts} onClose={() => setOpenKey(null)} onChanged={refresh} />}
      {adding && data && (
        <SubAddSheet items={items} removed={data.removed} today={today} onClose={() => setAdding(false)}
          onDone={(msg, fn) => { refresh(); setAdding(false); toast.success(msg, fn ? undo(() => { fn(); setTimeout(refresh, 400); }) : undefined); }} />
      )}
      {showConnect && showPlaid && (
        <PlaidLinkOverlay onSuccess={() => { setShowPlaid(false); void utils.invalidate(); }} onClose={() => setShowPlaid(false)} />
      )}
    </AnimatedPage>
  );
}
