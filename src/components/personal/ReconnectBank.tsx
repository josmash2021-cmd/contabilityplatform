import { useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { personalBankCopy } from "@/i18n/copy/personalBank";

/**
 * "Volver a entrar" for one bank: asks for a Plaid Link token in update mode (banks.updateLinkToken), opens Plaid so
 * the person signs in to the bank again, then brings that bank up to date (banks.syncItem). Nothing is added: it's
 * the same connection. Mount it only while reconnecting; it calls onDone when Plaid closes.
 */
export function ReconnectBank({ itemId, name, onDone }: { itemId: string; name: string; onDone: () => void }) {
  const t = useCopy(personalBankCopy).reconnect;
  const utils = trpc.useUtils();
  const [token, setToken] = useState<string | null>(null);
  const opened = useRef(false);

  const refreshAll = () => Promise.all([
    utils.brand.institutions.invalidate(), utils.banks.overview.invalidate(), utils.bank.listAccounts.invalidate(),
    utils.bank.getMonthData.invalidate(), utils.review.count.invalidate(),
  ]);
  const sync = trpc.banks.syncItem.useMutation({
    onSettled: () => { void refreshAll(); },
  });
  const { mutate: getToken } = trpc.banks.updateLinkToken.useMutation({
    onSuccess: (d) => setToken(d.linkToken),
    onError: (e) => { toast.error(e.message || t.error); onDone(); },
  });
  useEffect(() => { getToken({ itemId }); }, [getToken, itemId]);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: () => {
      toast.success(t.done(name));
      sync.mutate({ itemId });
      onDone();
    },
    onExit: () => onDone(),
  });
  useEffect(() => {
    if (token && ready && !opened.current) { opened.current = true; open(); }
  }, [token, ready, open]);

  return null;
}
