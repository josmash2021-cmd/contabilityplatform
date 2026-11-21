import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertCircle, Info, Loader2, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { BankAccountsCard } from "@/components/bank/BankAccountsCard";
import { BankConnectHero } from "@/components/bank/BankConnectHero";
import { BankDangerZone } from "@/components/bank/BankDangerZone";
import { BankMonthCard } from "@/components/bank/BankMonthCard";
import { BankStatementCard } from "@/components/bank/BankStatementCard";
import { countBanks, isDebt, mergeAccounts, money, type DbAccount, type LiveAccount, type MonthTx } from "@/components/bank/bankUtils";
import { useQuietBankSync } from "@/components/bank/useQuietBankSync";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { bankCopy } from "@/i18n/copy/bank";
import { bancoNegocioCopy } from "@/i18n/copy/bancoNegocio";
import { BUSINESS_BANK_LIMITS } from "@contracts/planFeatures";

/** Also read by /bank/category/:category, so the drill-down shows the same account. */
const ACCOUNT_KEY = "bank_selected_account_id";

/** 2.0 business bank: total available, accounts, plan bank usage, the month's movements, statement upload, disconnect. */
export default function Bank() {
  const t = useCopy(bancoNegocioCopy);
  const legacy = useCopy(bankCopy);
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const [searchParams] = useSearchParams();

  const now = useMemo(() => { const d = new Date(); return { month: d.getMonth() + 1, year: d.getFullYear() }; }, []);
  const [pickedMonth, setPickedMonth] = useState<number | null>(() => Number(searchParams.get("month")) || null);
  const [pickedYear, setPickedYear] = useState<number | null>(() => Number(searchParams.get("year")) || null);
  const year = pickedYear ?? now.year;
  const month = Math.min(pickedMonth ?? now.month, year === now.year ? now.month : 12);
  const [pickedAccount, setPickedAccount] = useState<number | null>(() => {
    try { return Number(localStorage.getItem(ACCOUNT_KEY)) || null; } catch { return null; }
  });
  const [connecting, setConnecting] = useState(false);

  // ── Team: the accountant only reads; staff never reach this page (AppLayout). The server enforces both (api/lib/team.ts). ──
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const isAccountant = membership?.role === "accountant";
  const canManage = !membership;

  // ── Connection and accounts ──
  const connection = trpc.bank.checkConnection.useQuery(undefined, { retry: false });
  const hasBank = connection.data?.hasBank === true;
  const dbQ = trpc.bank.listAccounts.useQuery(undefined, { enabled: hasBank, retry: false, staleTime: 2 * 60_000 });
  const liveQ = trpc.bank.getAllPlaidAccounts.useQuery(undefined, { enabled: hasBank, retry: false, staleTime: 2 * 60_000 });
  const dbAccounts = useMemo(() => (dbQ.data ?? []) as DbAccount[], [dbQ.data]);
  const accounts = useMemo(
    () => mergeAccounts(dbAccounts, (liveQ.data?.accounts ?? []) as LiveAccount[], legacy.bank.accountFallback),
    [dbAccounts, liveQ.data, legacy.bank.accountFallback],
  );
  const pickable = accounts.filter((a) => a.dbId !== null);
  const account = pickable.find((a) => a.dbId === pickedAccount) ?? pickable[0] ?? null;
  const accountId = account?.dbId ?? undefined;
  useEffect(() => {
    if (!accountId) return;
    try { localStorage.setItem(ACCOUNT_KEY, String(accountId)); } catch { /* storage blocked */ }
  }, [accountId]);

  // ── Plan bank limit, the same numbers the server enforces (bankLimit in api/lib/plans.ts: admins none, last paid plan, else Negocio) ──
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 60_000 });
  const limitApplies = !!plan && plan.mode === "business" && !plan.admin;
  const { data: paid } = trpc.subscription.currentTier.useQuery(undefined, { enabled: limitApplies, staleTime: 60_000 });
  const limit: number | null | undefined = !plan ? undefined : !limitApplies ? null : !paid ? undefined : BUSINESS_BANK_LIMITS[paid.tier ?? "business"];
  const used = countBanks(dbAccounts);

  // ── The month ──
  const monthQ = trpc.bank.getMonthData.useQuery(
    { year, month, accountId },
    { enabled: hasBank && !!accountId, retry: 1, refetchInterval: 5 * 60_000 },
  );
  const yearQ = trpc.bank.getYearData.useQuery({ year, accountId }, { enabled: hasBank && !!accountId });

  // ── Background syncing, quietly ──
  const { syncing, needsReconnect, handleSyncResult } = useQuietBankSync({ enabled: hasBank, year, month, accountId });

  // ── Refresh (asked for, so it answers with a toast) ──
  const refreshBalances = trpc.bank.refreshAllBalances.useMutation();
  const syncNow = trpc.bank.syncTransactions.useMutation();
  const refreshing = refreshBalances.isPending || syncNow.isPending;
  const refresh = async () => {
    const [bal, sync] = await Promise.allSettled([
      refreshBalances.mutateAsync(),
      accountId ? syncNow.mutateAsync({ year, month, accountId }) : Promise.resolve(undefined),
    ]);
    const s = sync.status === "fulfilled" ? sync.value : undefined;
    handleSyncResult(s);
    const balOk = bal.status === "fulfilled" && bal.value.success;
    if (s && !s.success && s.error === "TOKEN_INVALID") toast.error(t.reconnect.title);
    else if (balOk || s?.success) toast.success((s?.added ?? 0) > 0 ? t.refreshedNew(s?.added ?? 0) : t.refreshed);
    else toast.error(t.refreshError);
    void Promise.all([
      utils.bank.listAccounts.invalidate(), utils.bank.getAllPlaidAccounts.invalidate(),
      utils.bank.getMonthData.invalidate(), utils.bank.getYearData.invalidate(), utils.bank.checkConnection.invalidate(),
    ]);
  };

  // ── Disconnect (every bank: bank.disconnect deletes all accounts and their transactions) ──
  const disconnect = trpc.bank.disconnect.useMutation();
  const doDisconnect = async () => {
    try {
      const d = await disconnect.mutateAsync();
      if (!d.success) { toast.error(("error" in d && d.error) || t.danger.error); return false; }
      toast.success(t.danger.done);
      try { localStorage.removeItem(ACCOUNT_KEY); } catch { /* storage blocked */ }
      void utils.invalidate();
      return true;
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.danger.error);
      return false;
    }
  };

  const available = accounts.filter((a) => !isDebt(a.type)).reduce((s, a) => s + a.balance, 0);
  const owed = accounts.filter((a) => isDebt(a.type)).reduce((s, a) => s + a.balance, 0);
  const latest = accounts.reduce((m, a) => Math.max(m, a.lastSyncedAt), 0);
  const updatedText = latest ? t.updated(new Date(latest).toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) : t.neverUpdated;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
        </header>

        {connection.isLoading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-32 rounded-2xl" />
            <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
          </div>
        ) : connection.isError ? (
          <section className="rounded-2xl border border-red-200 bg-white p-5 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
            <p className="mt-2 text-sm font-medium text-slate-900">{t.loadError}</p>
            <button onClick={() => void connection.refetch()} className="mt-3 inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:h-10">{t.retry}</button>
          </section>
        ) : !hasBank ? (
          <BankConnectHero canConnect={canManage} limit={limit} onConnect={() => setConnecting(true)} />
        ) : (
          <>
            {needsReconnect && canManage && (
              <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">{t.reconnect.title}</p>
                    <p className="text-sm text-amber-800">{t.reconnect.text}</p>
                  </div>
                </div>
                <button onClick={() => setConnecting(true)} className="inline-flex h-11 shrink-0 items-center justify-center rounded-[10px] bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 sm:h-10">
                  {t.reconnect.button}
                </button>
              </section>
            )}

            {isAccountant && (
              <p className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{t.readOnly}
              </p>
            )}

            <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="bank-total">
              <div className="min-w-0">
                <p id="bank-total" className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Wallet className="h-3.5 w-3.5" />{t.total}</p>
                {dbQ.isLoading ? <Skeleton className="mt-1 h-9 w-48" /> : (
                  <p className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${available < 0 ? "text-red-700" : "text-slate-900"}`}>{money(available)}</p>
                )}
                {owed > 0 && <p className="mt-1 text-sm font-medium text-amber-700">{t.owedCards(money(owed))}</p>}
                <p className="mt-1 text-xs text-slate-500">{t.totalHint}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite">
                  {updatedText}
                  {syncing && <><span aria-hidden>·</span><Loader2 className="h-3 w-3 animate-spin" />{t.syncing}</>}
                </p>
              </div>
              <button onClick={() => void refresh()} disabled={refreshing}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 sm:h-10 sm:w-auto">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{refreshing ? t.refreshing : t.refresh}
              </button>
            </section>

            {/* Phone: accounts, month, statement. Desktop: accounts and statement on the left, the month on the right. */}
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1.2fr] lg:grid-rows-[auto_1fr]">
              <BankAccountsCard
                accounts={accounts}
                loading={dbQ.isLoading}
                used={used}
                limit={limit}
                canConnect={canManage}
                onConnect={() => setConnecting(true)}
              />
              <BankMonthCard
                accounts={accounts}
                accountId={accountId}
                onAccount={setPickedAccount}
                month={month}
                year={year}
                onMonth={setPickedMonth}
                onYear={setPickedYear}
                now={now}
                data={monthQ.data as { income: string; expense: string; transactions: MonthTx[] } | undefined}
                loading={dbQ.isLoading || monthQ.isLoading}
                error={monthQ.isError && !monthQ.data}
                onRetry={() => void monthQ.refetch()}
                yearData={yearQ.data}
                className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
              />
              {canManage && (
                <BankStatementCard
                  accountId={accountId}
                  accountName={account ? `${account.name}${account.mask ? ` ··${account.mask}` : ""}` : null}
                  className="lg:col-start-1 lg:row-start-2"
                />
              )}
            </div>

            {canManage && <BankDangerZone pending={disconnect.isPending} onConfirm={doDisconnect} />}
          </>
        )}
      </div>
      {connecting && <PlaidLinkOverlay onClose={() => setConnecting(false)} onSuccess={() => { setConnecting(false); void utils.invalidate(); }} />}
    </AnimatedPage>
  );
}
