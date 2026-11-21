import { useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpCircle, CalendarClock, CheckCircle2, ChevronDown, Loader2, RefreshCw, RotateCcw, Tv } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { CancelSubDialog } from "@/components/personal/CancelSubDialog";
import { MerchantIcon } from "@/components/personal/CategoryIcon";
import { ConnectBankHero } from "@/components/personal/ConnectBankHero";
import { accountName, asDate, dayKey, localTodayKey, money, num, txDay, ui, type PersonalAccount } from "@/components/personal/personalUtils";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalPagesCopy } from "@/i18n/copy/personalPages";

type FilterType = "all" | "membership" | "monthly_payment" | "credit_card";
type HistoryRange = "all" | "3months" | "6months" | "12months";
const FILTERS: FilterType[] = ["all", "membership", "monthly_payment", "credit_card"];
const RANGES: HistoryRange[] = ["all", "3months", "6months", "12months"];

/** A recurring charge found by bank.getSubscriptions. */
type Sub = {
  name: string;
  monthlyAmount: string;
  totalAmount: string;
  count: number;
  lastDate: string | Date;
  subType: string;
  dates: string[];
  transactions: { description: string | null; amount: string; date: string | Date | null }[];
};
type CancelledSub = { id: number; merchantName: string; originalMonthlyAmount: string; cancelledAt: string | Date | null };

const SUB_TYPE_TONE: Record<string, string> = {
  membership: "bg-purple-50 text-purple-700",
  credit_card: "bg-blue-50 text-blue-700",
  monthly_payment: "bg-amber-50 text-amber-800",
};

/** The charge a month after the last one (a calendar day, in UTC); the 31st becomes the month's last day. */
function monthAfter(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

/**
 * 2.0 subscriptions: charges that repeat, what they cost a month and when the next one comes, with how to cancel each.
 * Same data as before (bank.getSubscriptions per account, cancelled ones, cancel/reactivate, the migration banner);
 * the bank sync that runs when the account changes is now quiet.
 */
export default function PersonalSubscriptions() {
  const all = useCopy(personalPagesCopy);
  const t = all.subs;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const uid = useId();
  const utils = trpc.useUtils();
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [cancelling, setCancelling] = useState<Sub | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showAll, setShowAll] = useState(false);
  const [detailSub, setDetailSub] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryRange>("all");
  const [showPlaidOverlay, setShowPlaidOverlay] = useState(false);

  // Today and the history cut-offs, as calendar days on this device.
  const days = useMemo(() => {
    const now = new Date();
    const back = (months: number) => localTodayKey(new Date(now.getFullYear(), now.getMonth() - months, now.getDate()));
    return { today: localTodayKey(now), cutoff: { all: "", "3months": back(3), "6months": back(6), "12months": back(12) } as Record<HistoryRange, string> };
  }, []);

  const { isLoading: isCheckingBank } = trpc.bank.checkConnection.useQuery(undefined, { staleTime: 30000 });
  const { data: accountsData, isLoading: loadingAccounts } = trpc.bank.listAccounts.useQuery();
  const accounts = (accountsData ?? []) as PersonalAccount[];
  const effectiveAccountId = selectedAccountId || (accounts[0] ? String(accounts[0].id) : "");
  const accountId = effectiveAccountId ? parseInt(effectiveAccountId) : undefined;

  // Pending database update (admins can apply it from here).
  const { data: migrationStatus } = trpc.bank.checkMigrationStatus.useQuery();
  const runMigration = trpc.bank.runMigration.useMutation({
    onSuccess: (d) => {
      if (d.success) {
        toast.success(("message" in d && d.message) || t.migration.done);
        void utils.bank.checkMigrationStatus.invalidate();
      } else {
        toast.error(("error" in d && d.error) || t.migration.error);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Bring the account's latest movements in when it's picked: quietly (only a manual refresh says something).
  const { mutate: sync, isPending: syncing } = trpc.bank.syncTransactions.useMutation({
    onSuccess: () => { void utils.bank.getSubscriptions.invalidate(); },
    onError: () => { /* quiet */ },
  });
  useEffect(() => {
    if (accountId) sync({ accountId });
  }, [accountId, sync]);
  const refresh = () => sync({ accountId }, {
    onSuccess: (d) => { if (d.success) toast.success(d.added && d.added > 0 ? t.synced(d.added) : t.upToDate); },
  });

  const subsQ = trpc.bank.getSubscriptions.useQuery(accountId ? { accountId } : undefined);
  const { data: cancelledData } = trpc.bank.getCancelledSubscriptions.useQuery();

  const cancelMutation = trpc.bank.cancelSubscription.useMutation({
    onSuccess: (r) => {
      if (r.success) {
        toast.success(t.markedCancelled);
        void utils.bank.getSubscriptions.invalidate();
        void utils.bank.getCancelledSubscriptions.invalidate();
        setCancelling(null);
      } else toast.error(r.error);
    },
    onError: (err) => toast.error(err.message),
  });
  const reactivateMutation = trpc.bank.reactivateSubscription.useMutation({
    onSuccess: (r) => {
      if (!r.success) { toast.error(t.cancelled.error); return; }
      toast.success(t.cancelled.reactivated);
      void utils.bank.getSubscriptions.invalidate();
      void utils.bank.getCancelledSubscriptions.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const data = subsQ.data;
  const allSubs = (data?.subscriptions ?? []) as Sub[];
  const filteredSubs = filter === "all" ? allSubs : allSubs.filter((s) => s.subType === filter);
  const cancelledSubs = (cancelledData?.subscriptions ?? []) as CancelledSub[];
  const totalMonthly = filter === "membership" ? num(data?.membershipMonthly)
    : filter === "monthly_payment" ? num(data?.paymentMonthly)
    : filter === "credit_card" ? num(data?.creditCardMonthly)
    : num(data?.totalMonthly);
  const displayed = showAll ? filteredSubs : filteredSubs.slice(0, 5);
  const cancelledSaving = cancelledSubs.reduce((s, c) => s + num(c.originalMonthlyAmount), 0);

  /** "Próximo cobro: 9 dic" when it's still ahead; the last charge when that date already went by. */
  const whenText = (sub: Sub, long = false) => {
    const last = asDate(sub.lastDate);
    if (!last) return t.noDate;
    const fmt: Intl.DateTimeFormatOptions = long ? { day: "numeric", month: "long" } : { day: "numeric", month: "short" };
    const next = monthAfter(last);
    return dayKey(next) >= days.today ? t.next(txDay(next, locale, fmt)) : t.last(txDay(last, locale, fmt));
  };

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{isCheckingBank ? t.checking : t.subtitle}</p>
      </div>
      {accounts.length > 0 && (
        <div className="flex w-full items-end gap-2 sm:w-auto">
          {accounts.length > 1 && (
            <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
              <label htmlFor={`${uid}-acct`} className="mb-1.5 block text-xs font-medium text-slate-600">{all.shared.account}</label>
              <select id={`${uid}-acct`} value={effectiveAccountId} onChange={(e) => { setSelectedAccountId(e.target.value); setDetailSub(null); setShowAll(false); }} className={ui.control}>
                {accounts.map((a) => <option key={a.id} value={String(a.id)}>{accountName(a, all.shared.accountFallback)}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={refresh} disabled={syncing} aria-label={t.refreshAria} title={t.refreshAria} className={cn(ui.secondary, accounts.length > 1 && "w-11 px-0 sm:w-auto sm:px-4")}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            <span className={cn(accounts.length > 1 && "hidden sm:inline")}>{t.refresh}</span>
          </button>
        </div>
      )}
    </header>
  );

  if (isCheckingBank) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-3xl space-y-5">
          {header}
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        </div>
      </AnimatedPage>
    );
  }

  // Only when there are no accounts at all: with accounts, the bank is connected.
  const showConnectBanner = !loadingAccounts && accounts.length === 0;
  const loading = subsQ.isLoading;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        {header}

        {showConnectBanner && <ConnectBankHero onConnect={() => setShowPlaidOverlay(true)} />}

        {migrationStatus && !migrationStatus.applied && (
          <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5" role="status">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-900">{t.migration.title}</p>
              <p className="mt-0.5 text-sm text-amber-800">{t.migration.text}</p>
              <p className="mt-1 text-xs text-amber-700">{t.migration.missing(migrationStatus.details)}</p>
              <button type="button" onClick={() => runMigration.mutate()} disabled={runMigration.isPending}
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-[10px] bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:h-10">
                {runMigration.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />}
                {runMigration.isPending ? t.migration.applying : t.migration.apply}
              </button>
            </div>
          </section>
        )}

        {/* What it costs */}
        {loading ? <Skeleton className="h-32 rounded-2xl" /> : filteredSubs.length > 0 && (
          <section className={ui.card} aria-labelledby={`${uid}-total`}>
            <p id={`${uid}-total`} className="text-xs font-medium text-slate-500">{t.totalLabel[filter]}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
              {money(totalMonthly, true)}<span className="text-base font-semibold text-slate-500">{t.perMonth}</span>
            </p>
            <p className="mt-0.5 text-sm text-slate-600">{t.totalSub(filteredSubs.length)}</p>
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t.perYear(money(totalMonthly * 12, true))}</p>
          </section>
        )}

        {/* The list */}
        <section className={ui.card} aria-labelledby={`${uid}-list`}>
          <h2 id={`${uid}-list`} className="sr-only">{t.title}</h2>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0" style={{ scrollbarWidth: "none" }}>
            <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap" role="group" aria-label={t.filtersLabel}>
              {FILTERS.map((f) => (
                <button key={f} type="button" onClick={() => { setFilter(f); setShowAll(false); }} aria-pressed={filter === f} className={ui.chip(filter === f)}>
                  {t.filters[f]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="mt-4 space-y-2" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : subsQ.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-700" role="alert">{t.loadError}</p>
              <button type="button" onClick={() => void subsQ.refetch()} className={cn(ui.secondary, "mt-3")}>{all.shared.retry}</button>
            </div>
          ) : filteredSubs.length === 0 ? (
            <div className="py-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Tv className="h-6 w-6" aria-hidden="true" /></span>
              <p className="mt-3 text-sm font-semibold text-slate-800">{syncing ? t.syncing : t.empty[filter]}</p>
              {!syncing && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{filter === "all" ? t.empty.text : t.empty.textFilter}</p>}
              {!syncing && accounts.length > 0 && filter === "all" && (
                <button type="button" onClick={refresh} className={cn(ui.secondary, "mt-4")}><RefreshCw className="h-4 w-4" aria-hidden="true" />{t.syncNow}</button>
              )}
            </div>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-slate-100">
                {displayed.map((sub, idx) => {
                  const open = detailSub === sub.name;
                  const monthly = money(num(sub.monthlyAmount), true);
                  const history = (sub.transactions ?? []).filter((x) => historyFilter === "all" || dayKey(x.date) >= days.cutoff[historyFilter]);
                  const panelId = `${uid}-sub-${idx}`;
                  return (
                    <li key={`${sub.name}_${idx}`}>
                      <button type="button" aria-expanded={open} aria-controls={panelId}
                        onClick={() => { setDetailSub(open ? null : sub.name); setHistoryFilter("all"); }}
                        className="-mx-2 flex min-h-[68px] w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        <MerchantIcon name={sub.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold capitalize text-slate-900">{sub.name}</span>
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{whenText(sub)}</span></span>
                          <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", SUB_TYPE_TONE[sub.subType] ?? SUB_TYPE_TONE.monthly_payment)}>
                            {t.types[sub.subType] ?? t.types.monthly_payment}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-slate-900">{monthly}<span className="text-xs font-medium text-slate-500">{t.perMonth}</span></span>
                          <span className="block text-[11px] text-slate-500">{t.charges(sub.count)}</span>
                        </span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} aria-hidden="true" />
                      </button>

                      {open && (
                        <div id={panelId} className="mb-3 rounded-xl bg-slate-50 p-3 sm:p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{t.history}</p>
                            <p className="text-xs tabular-nums text-slate-500">{t.chargesTotal(sub.count, money(num(sub.totalAmount), true))}</p>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200" role="group" aria-label={t.historyLabel}>
                            {RANGES.map((r) => (
                              <button key={r} type="button" onClick={() => setHistoryFilter(r)} aria-pressed={historyFilter === r}
                                className={cn("h-10 rounded-lg px-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9",
                                  historyFilter === r ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>
                                {t.historyRange[r]}
                              </button>
                            ))}
                          </div>
                          {history.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t.historyNone}</p> : (
                            <ul className="mt-2 max-h-64 divide-y divide-slate-200/70 overflow-y-auto">
                              {history.map((x, i) => (
                                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                                  <span className="min-w-0">
                                    <span className="block truncate text-slate-700" title={x.description ?? ""}>{x.description}</span>
                                    <span className="block text-xs text-slate-500">{txDay(x.date, locale, { day: "numeric", month: "short", year: "numeric" })}</span>
                                  </span>
                                  <span className="shrink-0 font-medium tabular-nums text-slate-900">−{money(num(x.amount), true)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <button type="button" onClick={() => { setCancelling(sub); setDetailSub(null); }} className={cn(ui.secondary, "mt-3 w-full")}>
                            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />{t.wantToCancel}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {filteredSubs.length > 5 && (
                <button type="button" onClick={() => setShowAll(!showAll)}
                  className="mt-2 h-11 w-full rounded-[10px] text-sm font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  {showAll ? t.showLess : t.showMore(filteredSubs.length - 5)}
                </button>
              )}
            </>
          )}
        </section>

        {/* Already cancelled */}
        {cancelledSubs.length > 0 && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5">
            <button type="button" onClick={() => setShowCancelled(!showCancelled)} aria-expanded={showCancelled} aria-controls={`${uid}-cancelled`}
              className="-m-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{t.cancelled.title(cancelledSubs.length)}</span>
                <span className="block text-sm tabular-nums text-emerald-700">{t.cancelled.saving(money(cancelledSaving, true))}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", showCancelled && "rotate-180")} aria-hidden="true" />
            </button>
            {showCancelled && (
              <ul id={`${uid}-cancelled`} className="mt-3 divide-y divide-slate-100">
                {cancelledSubs.map((sub) => (
                  <li key={sub.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold capitalize text-slate-900">{sub.merchantName}</span>
                      <span className="block text-xs text-slate-500">
                        {sub.cancelledAt ? t.cancelled.on(new Date(sub.cancelledAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })) : ""}
                        {" · "}<span className="tabular-nums text-emerald-700">{t.cancelled.saving(money(num(sub.originalMonthlyAmount), true))}</span>
                      </span>
                    </span>
                    <button type="button" onClick={() => reactivateMutation.mutate({ id: sub.id })} disabled={reactivateMutation.isPending}
                      aria-label={t.cancelled.reactivateAria(sub.merchantName)} className={ui.secondary}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />{t.cancelled.reactivate}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {cancelling && (
        <CancelSubDialog key={cancelling.name} name={cancelling.name} monthly={money(num(cancelling.monthlyAmount), true)} when={whenText(cancelling, true)}
          busy={cancelMutation.isPending} onClose={() => setCancelling(null)}
          onConfirm={() => cancelMutation.mutate({ merchantName: cancelling.name, monthlyAmount: cancelling.monthlyAmount })} />
      )}
      {showConnectBanner && showPlaidOverlay && (
        <PlaidLinkOverlay onSuccess={() => { setShowPlaidOverlay(false); void utils.invalidate(); }} onClose={() => setShowPlaidOverlay(false)} />
      )}
    </AnimatedPage>
  );
}
