import { useState } from "react";
import { CreditCard, Landmark, Loader2, Plus, RefreshCw, ShieldCheck, Unplug, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalBankCopy } from "@/i18n/copy/personalBank";

type Account = { id: number; bankName: string; accountType: string | null; accountNumber: string | null; currentBalance: string | null; lastSyncedAt: string | Date | null };

/** Plaid reports what you owe on cards and loans as their balance. */
const isDebt = (type: string | null) => type === "credit" || type === "loan";
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 2.0 personal bank: connected accounts and balances, refresh, add another, disconnect. */
export default function PersonalBank() {
  const t = useCopy(personalBankCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();
  const [connecting, setConnecting] = useState(false);

  const { data: bank, isLoading: checking } = trpc.bank.checkConnection.useQuery(undefined, { staleTime: 30_000 });
  const hasBank = bank?.hasBank === true;
  const { data: rawAccounts, isLoading: loadingAccounts } = trpc.bank.listAccounts.useQuery(undefined, { enabled: hasBank });
  const accounts = (rawAccounts ?? []) as Account[];

  const refreshAll = () => Promise.all([
    utils.bank.listAccounts.invalidate(), utils.bank.checkConnection.invalidate(),
    utils.bank.getMonthData.invalidate(), utils.bank.getAllPlaidAccounts.invalidate(),
  ]);

  const refresh = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: (d) => {
      if (d.success) { toast.success(t.refreshed); void utils.bank.listAccounts.invalidate(); }
      else toast.error(t.refreshError);
    },
    onError: () => toast.error(t.refreshError),
  });
  const disconnect = trpc.bank.disconnect.useMutation({
    onSuccess: (d) => {
      if (!d.success) { toast.error("error" in d && d.error ? d.error : t.refreshError); return; }
      toast.success(t.danger.done);
      try { localStorage.removeItem("aethel_bank_connected"); } catch { /* storage blocked */ }
      void refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const total = accounts.filter((a) => !isDebt(a.accountType)).reduce((a, acc) => a + Number(acc.currentBalance ?? 0), 0);
  const owed = accounts.filter((a) => isDebt(a.accountType)).reduce((a, acc) => a + Number(acc.currentBalance ?? 0), 0);
  const latest = accounts.reduce<number>((m, a) => Math.max(m, a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0), 0);
  const updatedText = latest ? t.updated(new Date(latest).toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) : t.neverUpdated;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
        </header>

        {checking ? <Skeleton className="h-48 rounded-2xl" /> : !hasBank ? (
          <section className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Landmark className="h-6 w-6" /></span>
            <h2 className="mt-5 text-xl font-bold tracking-tight">{t.connect.title}</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">{t.connect.text}</p>
            <ul className="mt-5 space-y-2">
              {t.connect.points.map((p) => <li key={p} className="flex items-start gap-2 text-sm text-slate-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{p}</li>)}
            </ul>
            <button onClick={() => setConnecting(true)} className="mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
              <Landmark className="h-4 w-4" />{t.connect.button}
            </button>
          </section>
        ) : (
          <>
            <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Wallet className="h-3.5 w-3.5" />{t.total}</p>
                <p className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${total < 0 ? "text-red-700" : "text-slate-900"}`}>{money(total)}</p>
                {owed > 0 && <p className="mt-1 text-sm text-amber-700">{t.owedCards(money(owed))}</p>}
                <p className="mt-1 text-xs text-slate-500">{updatedText}</p>
              </div>
              <button onClick={() => refresh.mutate()} disabled={refresh.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t.refresh}
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="pb-accounts">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="pb-accounts" className="font-semibold text-slate-900">{t.accounts}</h2>
                <button onClick={() => setConnecting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">
                  <Plus className="h-4 w-4" />{t.addAccount}
                </button>
              </div>
              {loadingAccounts ? <Skeleton className="mt-3 h-24 rounded-xl" /> : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {accounts.map((a) => {
                    const credit = a.accountType === "credit";
                    const Icon = credit ? CreditCard : Landmark;
                    const bal = Number(a.currentBalance ?? 0);
                    const debt = isDebt(a.accountType);
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{a.bankName}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {t.types[a.accountType ?? ""] ?? a.accountType ?? ""}{a.accountNumber ? ` · ${t.ending(a.accountNumber)}` : ""}
                          </span>
                        </span>
                        {debt
                          ? <span className="shrink-0 text-right"><span className="block text-sm font-semibold tabular-nums text-amber-700">{money(bal)}</span><span className="block text-[11px] text-slate-500">{t.owe}</span></span>
                          : <span className={`shrink-0 text-sm font-semibold tabular-nums ${bal < 0 ? "text-red-700" : "text-slate-900"}`}>{money(bal)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-red-200 bg-white p-4 sm:p-5" aria-labelledby="pb-danger">
              <h2 id="pb-danger" className="font-semibold text-slate-900">{t.danger.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.danger.text}</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button disabled={disconnect.isPending} className="mt-4 inline-flex h-10 items-center gap-2 rounded-[10px] border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                    {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}{t.danger.button}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.danger.confirmTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{t.danger.confirmText}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.danger.cancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => disconnect.mutate()} className="bg-red-600 hover:bg-red-700">{t.danger.confirm}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
          </>
        )}
      </div>
      {connecting && <PlaidLinkOverlay onClose={() => setConnecting(false)} onSuccess={() => { setConnecting(false); void refreshAll(); }} />}
    </AnimatedPage>
  );
}
