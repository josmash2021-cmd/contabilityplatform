import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { quotesCopy } from "@/i18n/copy/quotes";

/**
 * Creates the recurring invoices that are due when the page opens (the server timer does it too;
 * running twice is harmless). Says so only when something was created. Not for read-only members.
 */
export function useRunDueOnce(enabled: boolean) {
  const t = useCopy(quotesCopy);
  const utils = trpc.useUtils();
  const ran = useRef(false);
  const { mutate } = trpc.quotes.recurring.runDue.useMutation({
    onSuccess: (r) => {
      if (r.created > 0) {
        toast.success(t.toasts.ranDue(r.created));
        void utils.quotes.invalidate();
        void utils.invoices.invalidate();
        void utils.sales.invalidate();
        void utils.dashboard.invalidate();
      }
    },
  });
  useEffect(() => {
    if (ran.current || !enabled) return;
    ran.current = true;
    mutate();
  }, [mutate, enabled]);
}
