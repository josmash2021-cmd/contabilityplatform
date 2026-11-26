import { useEffect, useMemo, useState } from "react";
import { Landmark, Loader2, Lock, Plus, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PullToRefresh } from "@/components/layout/PullToRefresh";
import { pullCopy } from "@/i18n/copy/pull";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSheet } from "@/components/personal/AccountSheet";
import { CsvImportDialog } from "@/components/personal/CsvImportDialog";
import { ReconnectBank } from "@/components/personal/ReconnectBank";
import { AccountLogo } from "@/components/personal/TxLogo";
import { accountLabel, accountTypeLabel, institutionOf, relTime, smBtn, type Institution, type OverviewAccount } from "@/components/personal/txKit";
import { money, ui } from "@/components/personal/personalUtils";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalBankCopy, type PersonalBankCopy } from "@/i18n/copy/personalBank";

/**
 * 2.0 personal Cuentas, as the prototype's pAccounts: what you have, what you owe and your net worth; every account
 * by kind with its bank's original logo, its balance ("Debes" on cards and loans), a card's limit use and when it
 * last updated; a panel per account (name of your own, reconnect, disconnect that bank only); connect another bank,
 * import a CSV statement and refresh balances. Every bank is refreshed quietly on arrival (banks.refreshItems).
 */
export default function PersonalBank() {
  const t = useCopy(personalBankCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();
  const [connecting, setConnecting] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [reconnecting, setReconnecting] = useState<{ itemId: string; name: string } | null>(null);

  const { data: bank, isLoading: checking } = trpc.bank.checkConnection.useQuery(undefined, { staleTime: 30_000 });
  const hasBank = bank?.hasBank === true;
  const overviewQ = trpc.banks.overview.useQuery(undefined, { enabled: hasBank, staleTime: 30_000 });
  const { data: institutions } = trpc.brand.institutions.useQuery(undefined, { enabled: hasBank, staleTime: 60_000, retry: false });
  const insts = institutions as Institution[] | undefined;
  const accounts = useMemo(() => overviewQ.data?.accounts ?? [], [overviewQ.data]);
  // "hace 5 min" is counted from when this data arrived (keeps render pure).
  const now = overviewQ.dataUpdatedAt;

  const refreshAll = () => Promise.all([
    utils.banks.overview.invalidate(), utils.brand.institutions.invalidate(), utils.bank.listAccounts.invalidate(),
    utils.bank.checkConnection.invalidate(), utils.bank.getMonthData.invalidate(), utils.bank.getAllPlaidAccounts.invalidate(),
  ]);

  // Quietly bring every bank up to date on arrival (balances, a card's limit, the last days of movements).
  const { mutate: quietRefresh, mutateAsync: refreshItemsNow } = trpc.banks.refreshItems.useMutation({
    onSuccess: (d) => { if (d.results.some((r) => r.ok)) { void utils.banks.overview.invalidate(); void utils.bank.getMonthData.invalidate(); } void utils.brand.institutions.invalidate(); },
    onError: () => {},
  });
  useEffect(() => { if (hasBank) quietRefresh(); }, [hasBank, quietRefresh]);
  // Pull down to refresh (phones): every bank again, then the page
  const pullT = useCopy(pullCopy);
  const pullRefresh = async () => {
    if (hasBank) await refreshItemsNow().catch(() => undefined);
    await utils.invalidate();
  };

  const refresh = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: (d) => {
      if (d.success) { toast.success(t.refreshed); void refreshAll(); }
      else toast.error(t.refreshError);
    },
    onError: () => toast.error(t.refreshError),
  });

  const cash = accounts.filter((a) => a.kind === "cash");
  const debts = accounts.filter((a) => a.kind !== "cash");
  const have = cash.reduce((s, a) => s + a.balance, 0);
  const owe = debts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const net = have - owe;
  const oweSub = owe === 0 ? t.kpi.oweNone : debts.length === 1 ? accountLabel(debts[0], t.accountFallback) : t.kpi.oweMany(debts.length);
  const open = openId !== null ? accounts.find((a) => a.id === openId) ?? null : null;
  // When the bank's data really came (Plaid's last update), not when the app last asked Plaid
  const updatedOf = (a: OverviewAccount) => relTime(institutionOf(insts, a.id)?.bankUpdatedAt ?? a.lastSyncedAt, now, locale, t.justNow);
  const reconnect = (a: OverviewAccount) => {
    const inst = institutionOf(insts, a.id);
    setOpenId(null);
    setReconnecting({ itemId: a.itemId, name: inst?.name || a.name });
  };
  const plan = overviewQ.data?.plan;

  const group = (title: string, list: OverviewAccount[]) => list.length > 0 && (
    <section aria-label={title}>
      <h2 className="mb-1.5 mt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{title}</h2>
      <ul className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
        {list.map((a) => (
          <li key={a.id} className="border-t border-slate-200 first:border-t-0">
            <AccountRow account={a} inst={institutionOf(insts, a.id)} updated={updatedOf(a)} t={t}
              onOpen={() => setOpenId(a.id)} onReconnect={() => reconnect(a)} />
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <PullToRefresh onRefresh={pullRefresh} label={pullT} />
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
          </div>
          {hasBank && plan && plan.used > 0 && (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{t.banksTag(plan.used, plan.limit)}</span>
          )}
        </header>

        {checking ? <Skeleton className="h-48 rounded-2xl" /> : !hasBank ? (
          <section className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Landmark className="h-6 w-6" aria-hidden="true" /></span>
            <h2 className="mt-5 text-xl font-bold tracking-tight">{t.connect.title}</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">{t.connect.text}</p>
            <ul className="mt-5 space-y-2">
              {t.connect.points.map((p) => <li key={p} className="flex items-start gap-2 text-sm text-slate-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />{p}</li>)}
            </ul>
            <button type="button" onClick={() => setConnecting(true)} data-guide="bank-connect" className="mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
              <Landmark className="h-4 w-4" aria-hidden="true" />{t.connect.button}
            </button>
          </section>
        ) : overviewQ.isError ? (
          <div className="rounded-[14px] border border-dashed border-slate-200 px-4 py-9 text-center">
            <p className="text-sm text-slate-700" role="alert">{t.loadError}</p>
            <button type="button" onClick={() => void overviewQ.refetch()} className={cn(ui.secondary, "mt-3")}>{t.retry}</button>
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3" aria-label={t.title}>
              <Kpi label={t.kpi.have} value={money(have, true)} sub={t.kpi.haveSub} loading={overviewQ.isLoading} />
              <Kpi label={t.kpi.owe} value={money(owe, true)} sub={oweSub} tone={owe > 0 ? "bad" : "good"} loading={overviewQ.isLoading} />
              <Kpi label={t.kpi.net} value={money(net, true)} sub={t.kpi.netSub} tone={net >= 0 ? "good" : "bad"} loading={overviewQ.isLoading} />
            </section>

            <section className="mt-3.5 rounded-[14px] border border-slate-200 bg-white p-4">
              {overviewQ.isLoading ? (
                <div className="space-y-2" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
              ) : (
                <div className="space-y-2">
                  {group(t.groups.cash, cash)}
                  {group(t.groups.credit, debts.filter((a) => a.kind === "credit"))}
                  {group(t.groups.loan, debts.filter((a) => a.kind === "loan"))}
                </div>
              )}
              <div className="mt-3.5 flex flex-wrap gap-2">
                <button type="button" onClick={() => setConnecting(true)} data-guide="bank-connect" className={cn(ui.secondary, "font-semibold")}><Plus className="h-4 w-4" aria-hidden="true" />{t.connectAnother}</button>
                <button type="button" onClick={() => setCsvOpen(true)} disabled={accounts.length === 0} className={ui.secondary}><Upload className="h-4 w-4" aria-hidden="true" />{t.importCsv}</button>
                <button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending} className={ui.secondary}>
                  {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}{t.refresh}
                </button>
              </div>
            </section>

            <p className="mt-3.5 flex items-center gap-2 text-xs text-slate-500"><Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t.footnote}</p>
          </>
        )}
      </div>

      {open && (
        <AccountSheet key={open.id} account={open} inst={institutionOf(insts, open.id)} siblings={accounts.filter((a) => a.itemId === open.itemId).length}
          updated={updatedOf(open)} onReconnect={() => reconnect(open)} onClose={() => setOpenId(null)} />
      )}
      {reconnecting && <ReconnectBank itemId={reconnecting.itemId} name={reconnecting.name} onDone={() => setReconnecting(null)} />}
      {csvOpen && <CsvImportDialog accounts={accounts} onClose={() => setCsvOpen(false)} />}
      {connecting && <PlaidLinkOverlay onClose={() => setConnecting(false)} onSuccess={() => { setConnecting(false); void refreshAll(); }} />}
    </AnimatedPage>
  );
}

function Kpi({ label, value, sub, tone, loading }: { label: string; value: string; sub: string; tone?: "good" | "bad"; loading?: boolean }) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-[13px] text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-1.5 h-7 w-32 rounded-md" /> : <p className="mt-0.5 truncate text-[23px] font-bold tabular-nums tracking-tight text-slate-900">{value}</p>}
      <p className={cn("mt-0.5 truncate text-xs", tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-500")}>{sub}</p>
    </div>
  );
}

/** One account (the prototype's .acct-row): logo, name, type · status · when it updated, the balance; a card's limit use. */
function AccountRow({ account: a, inst, updated, t, onOpen, onReconnect }: {
  account: OverviewAccount;
  inst: Institution | null;
  updated: string | null;
  t: PersonalBankCopy;
  onOpen: () => void;
  onReconnect: () => void;
}) {
  const needs = inst?.status === "needs_reconnect";
  const debt = a.kind !== "cash";
  const owes = debt && a.balance > 0;
  const name = accountLabel(a, t.accountFallback);
  const used = a.kind === "credit" && a.creditLimit ? Math.round((Math.max(0, a.balance) / a.creditLimit) * 100) : null;
  return (
    <div>
      <button type="button" onClick={onOpen} aria-label={t.openAria(name)}
        className="grid min-h-[60px] w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        <AccountLogo inst={inst} fallbackName={a.name} size={36} />
        <span className="min-w-0">
          <b className="block truncate text-sm font-semibold text-slate-900">{name}</b>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span>{accountTypeLabel(a, t.types)}</span>
            {needs && <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700"><i className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />{t.needsReconnect}</span>}
            <span>{updated ? (inst?.bankUpdatedAt ? t.fromBank(updated) : t.updated(updated)) : t.neverUpdated}</span>
          </span>
        </span>
        <span className={cn("text-right text-sm font-bold tabular-nums", owes ? "text-red-600" : "text-slate-900")}>
          {owes ? t.owes(money(a.balance, true)) : money(debt ? Math.abs(a.balance) : a.balance, true)}
        </span>
      </button>
      {(used !== null || needs) && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-3.5 pb-3 sm:pl-[62px]">
          {used !== null && a.creditLimit && (
            <div className="min-w-0 flex-[1_1_240px] text-[13px]">
              <div className="flex flex-wrap justify-between gap-x-2.5 gap-y-1">
                <span className="text-slate-700">{t.utilUse} <b className="text-slate-900">{used}%</b> {t.utilOf(money(a.creditLimit))}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${used}%`}>
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(used, 1))}%` }} />
              </div>
              <small className="mt-1 block text-xs text-slate-500">{t.utilHint}</small>
            </div>
          )}
          {needs && <button type="button" onClick={onReconnect} className={cn(smBtn, "min-h-10 border-blue-600 bg-blue-600 text-white hover:bg-blue-500")}>{t.reconnectBtn}</button>}
        </div>
      )}
    </div>
  );
}
