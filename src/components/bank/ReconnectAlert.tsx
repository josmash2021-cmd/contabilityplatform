import { useEffect } from "react";
import { usePlaidLink, type PlaidLinkError } from "react-plaid-link";
import { Loader2, TriangleAlert } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { bancosCopy } from "@/i18n/copy/bancos";
import type { BankInfo } from "./bankView";

/** "Wells Fargo necesita que vuelvas a entrar", with Reconectar (owner only), like the prototype's .bank-alert. */
export function ReconnectAlert({ bank, now, canManage, busy, onReconnect }: {
  bank: BankInfo; now: number; canManage: boolean; busy: boolean; onReconnect: () => void;
}) {
  const t = useCopy(bancosCopy).alert;
  const last = bank.lastSuccessAt ? new Date(bank.lastSuccessAt).getTime() : NaN;
  const days = Number.isFinite(last) && now > 0 ? Math.floor((now - last) / 86_400_000) : null;
  return (
    <div role="status" className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-3 rounded-[14px] border border-amber-700/20 bg-amber-50 px-3.5 py-3 motion-safe:animate-fade-up sm:grid-cols-[20px_minmax(0,1fr)_auto]">
      <TriangleAlert className="h-5 w-5 text-amber-700" aria-hidden="true" />
      <div className="min-w-0">
        <b className="block text-sm font-bold text-slate-900">{t.title(bank.name)}</b>
        <span className="block text-[13px] text-slate-500">{t.since(days)} {canManage ? t.why : t.ownerOnly}</span>
      </div>
      {canManage && (
        <button type="button" onClick={onReconnect} disabled={busy}
          className="col-start-2 inline-flex min-h-11 items-center justify-center gap-1.5 justify-self-start rounded-[10px] bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:col-start-3 sm:min-h-[34px]">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t.button}
        </button>
      )}
    </div>
  );
}

/**
 * Opens Plaid Link in update mode with a link token from banks.updateLinkToken (the owner signs in to the
 * bank again; the connection and its access token stay the same, so there's nothing to exchange after).
 * Mounted only while reconnecting, so Plaid's script loads only then.
 */
export function PlaidUpdateLink({ token, onSuccess, onExit }: { token: string; onSuccess: () => void; onExit: (failed: boolean) => void }) {
  const { open, ready, error } = usePlaidLink({
    token,
    onSuccess: () => onSuccess(),
    onExit: (err: PlaidLinkError | null) => onExit(!!err),
  });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  // Plaid's script didn't load: give the button back instead of waiting forever.
  useEffect(() => {
    if (error) onExit(true);
  }, [error, onExit]);
  return null;
}
