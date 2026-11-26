import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PullToRefresh } from "@/components/layout/PullToRefresh";
import { pullCopy } from "@/i18n/copy/pull";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "@/components/bank/AccountCard";
import { AccountDetail } from "@/components/bank/AccountDetail";
import { DisconnectDialog, RenameDialog, SinceDialog } from "@/components/bank/AccountDialogs";
import { BankBottom } from "@/components/bank/BankBottom";
import { BankEmpty } from "@/components/bank/BankEmpty";
import { BankSummary } from "@/components/bank/BankSummary";
import { PlaidUpdateLink, ReconnectAlert } from "@/components/bank/ReconnectAlert";
import { ReconcileCard } from "@/components/bank/ReconcileCard";
import { accountName, accountTitle, localToday, shortDay, type OverviewAccount } from "@/components/bank/bankView";
import { useBankInfo, useInstitutions } from "@/components/bank/useBanks";
import { useQuietBankSync } from "@/components/bank/useQuietBankSync";
import { trpc } from "@/providers/trpc";
import { readAgain } from "@/lib/readAgain";
import { useCopy, useLang } from "@/i18n/useI18n";
import { bancosCopy } from "@/i18n/copy/bancos";
import { bankCopy } from "@/i18n/copy/bank";

/** Also read by /bank/category/:category, so the drill-down shows the same account. */
const ACCOUNT_KEY = "bank_selected_account_id";

type Health = "ok" | "needs_reconnect";
type SyncOutcome = { itemId: string; ok: true; added: number } | { itemId: string; ok: false; problem: "needs_reconnect" | "not_ready" | "gone" | "error" };

/** The minute clock for "Actualizado hace N min": ticks every minute, starting from when the data arrived. */
function useNow(base: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return Math.max(tick, base);
}

/**
 * 2.0 business Bancos, as in the prototype's banks(): what's in the bank and what changed in 30 days,
 * this week's bills and the card debt; a warning per bank that needs signing in again (Plaid update
 * mode); a card per account with its 30-day line, what's left to review and its menu; the reconciliation
 * card; connect another bank, import a CSV, and the Plaid line. "Ver movimientos" opens the account
 * (?account=ID), with the month view that used to be on this page.
 */
export default function Bank() {
  const c = useCopy(bancosCopy);
  const legacy = useCopy(bankCopy);
  const { lang } = useLang();
  const utils = trpc.useUtils();
  const [params, setParams] = useSearchParams();

  const today = useMemo(() => localToday(new Date()), []);
  const current = useMemo(() => { const d = new Date(); return { month: d.getMonth() + 1, year: d.getFullYear() }; }, []);

  // ── Team: the accountant only reads; staff never reach this page (AppLayout). The server enforces both (api/lib/team.ts). ──
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const isAccountant = membership?.role === "accountant";
  const canManage = membership === null;

  // ── Everything on the screen ──
  const overview = trpc.banks.overview.useQuery({ today }, { staleTime: 60_000, refetchInterval: 5 * 60_000, retry: 1 });
  const data = overview.data;
  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const hasBank = accounts.length > 0;
  const now = useNow(overview.dataUpdatedAt);

  // ── The open account (Ver movimientos) and its month, in the address so Back works ──
  const openId = Number(params.get("account")) || null;
  const open = accounts.find((a) => a.id === openId) ?? null;
  const year = Math.min(Number(params.get("year")) || current.year, current.year);
  const month = Math.min(Number(params.get("month")) || current.month, year === current.year ? current.month : 12);
  const go = (next: { account?: number | null; month?: number; year?: number }, replace = false) => {
    const p = new URLSearchParams(params);
    if (next.account !== undefined) { if (next.account) p.set("account", String(next.account)); else p.delete("account"); }
    if (next.month !== undefined) p.set("month", String(next.month));
    if (next.year !== undefined) p.set("year", String(next.year));
    if (next.account === null) { p.delete("month"); p.delete("year"); }
    setParams(p, { replace });
    // Opening or leaving an account starts at the top (the app scrolls inside <main>).
    if (next.account !== undefined) document.querySelector("main")?.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(ACCOUNT_KEY, String(open.id)); } catch { /* storage blocked */ }
  }, [open]);

  // ── Background syncing, quietly (upkeep any member may run) ──
  const firstId = accounts.reduce<number | undefined>((m, a) => (m === undefined || a.id < m ? a.id : m), undefined);
  const { needsReconnect: primaryNeeds } = useQuietBankSync({ enabled: hasBank, year, month, accountId: open?.id ?? firstId });

  // ── Each bank's health: stored by the logos system, updated by what this visit's Plaid calls found ──
  const { institutions, invalidate: invalidateInstitutions } = useInstitutions(hasBank);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const primaryItem = accounts.find((a) => a.id === firstId)?.itemId;
  const session = useMemo(
    () => (primaryNeeds && primaryItem && !health[primaryItem] ? { ...health, [primaryItem]: "needs_reconnect" as const } : health),
    [primaryNeeds, primaryItem, health],
  );
  const banks = useBankInfo(accounts, institutions, session, c.fallbackBank);
  const bankOf = (a: OverviewAccount) => banks.get(a.itemId) ?? { itemId: a.itemId, name: c.fallbackBank, logo: null, color: null, needsReconnect: false, lastSuccessAt: null, bankUpdatedAt: null };
  const note = (results: SyncOutcome[]) => setHealth((prev) => {
    const next = { ...prev };
    for (const r of results) {
      if (r.ok) next[r.itemId] = "ok";
      else if (r.problem === "needs_reconnect" || r.problem === "gone") next[r.itemId] = "needs_reconnect";
    }
    return next;
  });
  const refreshData = () => {
    void utils.banks.invalidate();
    void utils.bank.getMonthData.invalidate();
    void utils.bank.getYearData.invalidate();
    void utils.bank.listAccounts.invalidate();
    void utils.review.count.invalidate();
    void invalidateInstitutions();
  };

  // Every bank's balances and last week of movements once per visit (the owner's; members can't run it).
  const { mutate: refreshItems, mutateAsync: refreshItemsNow } = trpc.banks.refreshItems.useMutation({
    onSuccess: (r) => {
      note(r.results);
      if (r.results.some((x) => x.ok)) { void readAgain(utils.banks.overview, utils.brand.institutions).then(() => utils.banks.invalidate()); void invalidateInstitutions(); }
    },
    onError: () => { /* quiet */ },
  });
  // Pull down to refresh (phones): every bank again, then the page
  const pullT = useCopy(pullCopy);
  const pullRefresh = async () => {
    await refreshItemsNow().catch(() => undefined);
    await utils.invalidate();
  };
  useEffect(() => {
    if (hasBank && canManage) refreshItems({ today });
  }, [hasBank, canManage, refreshItems, today]);

  // ── Per-bank actions ──
  const syncItem = trpc.banks.syncItem.useMutation();
  const [syncing, setSyncing] = useState<ReadonlySet<string>>(() => new Set());
  const runSync = async (itemId: string, since?: string, quiet = false) => {
    const name = banks.get(itemId)?.name ?? c.fallbackBank;
    setSyncing((s) => new Set(s).add(itemId));
    try {
      const r = await syncItem.mutateAsync({ itemId, since, today });
      note([r]);
      if (r.ok) {
        if (!quiet) toast.success(since ? c.since.done(r.added, shortDay(r.since, lang, legacy.monthsShort)) : c.accounts.synced(name, r.added));
      } else if (!quiet || r.problem === "needs_reconnect") {
        toast.error(c.accounts.problem[r.problem](name));
      }
      refreshData();
      return r.ok;
    } catch (e: unknown) {
      if (!quiet) toast.error(e instanceof Error && e.message ? e.message : c.accounts.problem.error());
      return false;
    } finally {
      setSyncing((s) => { const n = new Set(s); n.delete(itemId); return n; });
    }
  };

  // Reconectar: Plaid Link in update mode for that bank.
  const updateToken = trpc.banks.updateLinkToken.useMutation();
  const [link, setLink] = useState<{ itemId: string; token: string } | null>(null);
  const reconnect = async (itemId: string) => {
    try {
      const r = await updateToken.mutateAsync({ itemId });
      setLink({ itemId, token: r.linkToken });
    } catch (e: unknown) {
      toast.error(e instanceof Error && e.message ? e.message : c.alert.error);
    }
  };
  const reconnected = (itemId: string) => {
    setLink(null);
    setHealth((h) => ({ ...h, [itemId]: "ok" }));
    toast.success(c.alert.done(banks.get(itemId)?.name ?? c.fallbackBank));
    void runSync(itemId, undefined, true);
  };

  const [renameId, setRenameId] = useState<number | null>(null);
  const [sinceId, setSinceId] = useState<number | null>(null);
  const [disconnectItem, setDisconnectItem] = useState<string | null>(null);
  const disconnect = trpc.banks.disconnectItem.useMutation();
  const doDisconnect = async () => {
    if (!disconnectItem) return false;
    const name = banks.get(disconnectItem)?.name ?? c.fallbackBank;
    try {
      const r = await disconnect.mutateAsync({ itemId: disconnectItem });
      toast.success(c.disconnect.done(name, r.keptMovements));
      if (open && open.itemId === disconnectItem) go({ account: null }, true);
      void utils.invalidate();
      void invalidateInstitutions();
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error && e.message ? e.message : c.disconnect.error);
      return false;
    }
  };

  const [connecting, setConnecting] = useState(false);
  const plan = data?.plan;
  const locked = !!plan && plan.limit !== null && plan.used >= plan.limit;
  const renameAcc = accounts.find((a) => a.id === renameId) ?? null;
  const sinceAcc = accounts.find((a) => a.id === sinceId) ?? null;
  const needing = [...banks.values()].filter((b) => b.needsReconnect);

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-[750] tracking-tight text-slate-900">{c.title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{c.subtitle}</p>
      </div>
      {plan && hasBank && (
        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          {plan.limit === null ? c.planTagUnlimited(plan.used) : c.planTag(plan.used, plan.limit)}
        </span>
      )}
    </header>
  );

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <PullToRefresh onRefresh={pullRefresh} label={pullT} />
      <div className="mx-auto max-w-6xl space-y-4">
        {overview.isLoading ? (
          <>
            {header}
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-32 rounded-[14px]" />
              <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-64 rounded-[14px]" /><Skeleton className="h-64 rounded-[14px]" /></div>
            </div>
          </>
        ) : overview.isError || !data ? (
          <>
            {header}
            <section className="rounded-[14px] border border-red-200 bg-white p-5 text-center">
              <AlertCircle className="mx-auto h-6 w-6 text-red-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-900">{c.loadError}</p>
              <button type="button" onClick={() => void overview.refetch()} className="mt-3 inline-flex min-h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:min-h-10">{c.retry}</button>
            </section>
          </>
        ) : open ? (
          <AccountDetail
            account={open}
            bank={bankOf(open)}
            now={now}
            canManage={canManage}
            syncing={syncing.has(open.itemId)}
            reconnecting={updateToken.isPending || !!link}
            month={month}
            year={year}
            current={current}
            onPeriod={(m, y) => go({ month: m, year: y }, true)}
            onBack={() => go({ account: null })}
            onReconnect={() => void reconnect(open.itemId)}
          />
        ) : !hasBank ? (
          <>
            {header}
            <BankEmpty canConnect={canManage} limit={plan?.limit ?? null} onConnect={() => setConnecting(true)} />
          </>
        ) : (
          <>
            {header}
            {isAccountant && (
              <p className="flex items-start gap-2 rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />{c.readOnly}
              </p>
            )}

            <BankSummary data={data} />

            {needing.map((b) => (
              <ReconnectAlert key={b.itemId} bank={b} now={now} canManage={canManage}
                busy={(updateToken.isPending && updateToken.variables?.itemId === b.itemId) || link?.itemId === b.itemId}
                onReconnect={() => void reconnect(b.itemId)} />
            ))}

            <section aria-labelledby="bank-accounts">
              <h2 id="bank-accounts" className="mb-2.5 mt-5 text-[15px] font-bold text-slate-900">{c.accounts.title(accounts.length)}</h2>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
                {accounts.map((a) => (
                  <AccountCard
                    key={a.id}
                    account={a}
                    bank={bankOf(a)}
                    now={now}
                    canManage={canManage}
                    syncing={syncing.has(a.itemId)}
                    reconnecting={(updateToken.isPending && updateToken.variables?.itemId === a.itemId) || link?.itemId === a.itemId}
                    onView={() => go({ account: a.id })}
                    onReconnect={() => void reconnect(a.itemId)}
                    onSync={() => void runSync(a.itemId)}
                    onRename={() => setRenameId(a.id)}
                    onSince={() => setSinceId(a.id)}
                    onDisconnect={() => setDisconnectItem(a.itemId)}
                  />
                ))}
              </div>
            </section>

            <ReconcileCard accounts={accounts.map((a) => ({ id: a.id, name: accountName(a), mask: a.mask, institution: bankOf(a).name, balance: a.balance }))} />

            <BankBottom accounts={accounts} canManage={canManage} locked={locked} limit={plan?.limit ?? null} onConnect={() => setConnecting(true)} />
          </>
        )}
      </div>

      <RenameDialog account={renameAcc} onClose={() => setRenameId(null)} />
      <SinceDialog account={sinceAcc} bankName={sinceAcc ? bankOf(sinceAcc).name : ""} today={data?.today ?? today}
        onClose={() => setSinceId(null)}
        onPick={(since) => { const acc = sinceAcc; setSinceId(null); if (acc) void runSync(acc.itemId, since); }} />
      <DisconnectDialog
        open={!!disconnectItem}
        bankName={disconnectItem ? banks.get(disconnectItem)?.name ?? c.fallbackBank : ""}
        accounts={accounts.filter((a) => a.itemId === disconnectItem).map(accountTitle)}
        pending={disconnect.isPending}
        onClose={() => setDisconnectItem(null)}
        onConfirm={doDisconnect}
      />
      {link && <PlaidUpdateLink key={link.token} token={link.token} onSuccess={() => reconnected(link.itemId)} onExit={(failed) => { setLink(null); if (failed) toast.error(c.alert.error); }} />}
      {connecting && <PlaidLinkOverlay onClose={() => setConnecting(false)} onSuccess={() => { setConnecting(false); void utils.invalidate(); void invalidateInstitutions(); }} />}
    </AnimatedPage>
  );
}
