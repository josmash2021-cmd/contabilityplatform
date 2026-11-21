import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { personalBankCopy } from "@/i18n/copy/personalBank";
import { ConfirmDialog } from "./ConfirmDialog";
import { AccountLogo } from "./TxLogo";
import { accountLabel, accountTypeLabel, smBtn, type Institution, type OverviewAccount } from "./txKit";
import { money, ui } from "./personalUtils";

/**
 * The prototype's account panel (acctPanel): the account and its balance, a card's limit, a name of your own
 * (banks.rename) and the connection, with "Volver a entrar" when the bank asks for it or "Desconectar" for this
 * bank only (banks.disconnectItem, after a confirm). Mount it per account.
 */
export function AccountSheet({ account, inst, siblings, updated, onReconnect, onClose }: {
  account: OverviewAccount;
  inst: Institution | null;
  /** How many accounts this bank connection has (all of them are disconnected together). */
  siblings: number;
  /** "hace 5 min", or null when it never updated. */
  updated: string | null;
  onReconnect: () => void;
  onClose: () => void;
}) {
  const t = useCopy(personalBankCopy);
  const s = t.sheet;
  const uid = useId();
  const utils = trpc.useUtils();
  const [nick, setNick] = useState(account.nickname ?? "");
  const [confirming, setConfirming] = useState(false);
  const bank = inst?.name || account.name;
  const needs = inst?.status === "needs_reconnect";
  const debt = account.kind !== "cash";
  const used = account.creditLimit ? Math.round((Math.max(0, account.balance) / account.creditLimit) * 100) : null;

  const rename = trpc.banks.rename.useMutation({
    onSuccess: (r) => {
      toast.success(r.nickname ? s.renamed(r.nickname) : s.unnamed);
      void utils.banks.overview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const disconnect = trpc.banks.disconnectItem.useMutation({
    onSuccess: () => {
      toast.success(t.disconnect.done(bank));
      setConfirming(false);
      onClose();
      void Promise.all([
        utils.banks.overview.invalidate(), utils.brand.institutions.invalidate(), utils.bank.checkConnection.invalidate(),
        utils.bank.listAccounts.invalidate(), utils.bank.getAllPlaidAccounts.invalidate(), utils.bank.getMonthData.invalidate(),
      ]);
    },
    onError: (e) => { toast.error(e.message); setConfirming(false); },
  });

  return (
    <>
      <Sheet open={!confirming} onOpenChange={(o) => { if (!o && !confirming) onClose(); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-md">
          <SheetHeader className="border-b border-slate-200 px-5 py-4">
            <SheetTitle className="text-base font-bold text-slate-900">{s.title}</SheetTitle>
            <SheetDescription className="sr-only">{accountLabel(account, t.accountFallback)}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center gap-3">
              <AccountLogo inst={inst} fallbackName={account.name} size={46} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold text-slate-900">{accountLabel(account, t.accountFallback)}</p>
                <p className="truncate text-[13px] text-slate-500">
                  {accountTypeLabel(account, t.types)}{account.nickname ? ` · ${accountLabel({ ...account, nickname: null }, t.accountFallback)}` : ""}
                </p>
              </div>
              <p className={cn("shrink-0 text-2xl font-extrabold tabular-nums tracking-tight", debt && account.balance > 0 ? "text-red-600" : "text-slate-900")}>
                {money(Math.abs(account.balance), true)}
              </p>
            </div>

            {debt && (
              <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-slate-500">{s.owe}</dt><dd className="font-semibold tabular-nums text-slate-900">{money(Math.max(0, account.balance), true)}</dd>
                </div>
                {account.creditLimit && used !== null && (
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <dt className="text-slate-500">{s.limit}</dt><dd className="font-medium tabular-nums text-slate-900">{s.limitUse(money(account.creditLimit), used)}</dd>
                  </div>
                )}
              </dl>
            )}

            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); rename.mutate({ accountId: account.id, nickname: nick.trim() || null }); }}>
              <div className="min-w-0 flex-[1_1_200px]">
                <label htmlFor={`${uid}-nick`} className={ui.label}>{s.nickname}</label>
                <input id={`${uid}-nick`} value={nick} onChange={(e) => setNick(e.target.value)} placeholder={s.nicknamePh} autoComplete="off" maxLength={60} className={ui.control} />
              </div>
              <button type="submit" disabled={rename.isPending} className={cn(smBtn, "min-h-11 sm:min-h-10")}>
                {rename.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{s.saveName}
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{s.connection}</p>
                <p className={cn("text-xs", needs ? "font-semibold text-amber-700" : "text-slate-500")}>
                  {needs ? s.connNeeds(bank) : updated ? s.connOk(updated) : s.connNever}
                </p>
              </div>
              {needs ? (
                <button type="button" onClick={onReconnect} className={cn(ui.primary, "sm:h-9")}>{t.reconnectBtn}</button>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className={cn(smBtn, "min-h-11 border-red-200 text-red-700 hover:bg-red-50 sm:min-h-9")}>{s.disconnect}</button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog open={confirming} onOpenChange={(o) => { if (!o) setConfirming(false); }}
        title={t.disconnect.title(bank)} text={t.disconnect.text(siblings)} confirmLabel={t.disconnect.confirm} cancelLabel={t.disconnect.cancel}
        busy={disconnect.isPending} onConfirm={() => disconnect.mutate({ itemId: account.itemId })} />
    </>
  );
}
