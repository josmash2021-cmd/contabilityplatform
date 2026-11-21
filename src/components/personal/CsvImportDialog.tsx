import { useId, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { personalBankCopy } from "@/i18n/copy/personalBank";
import { accountLabel, type OverviewAccount } from "./txKit";
import { ui } from "./personalUtils";

/**
 * "Importar CSV" (the prototype's Cuentas tools): a bank statement file into one of your bank accounts, through
 * bank.importBankStatement (the same import the business bank screen has). Movements already saved aren't duplicated.
 */
export function CsvImportDialog({ accounts, onClose }: { accounts: readonly OverviewAccount[]; onClose: () => void }) {
  const t = useCopy(personalBankCopy);
  const c = t.csv;
  const uid = useId();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(() => String(accounts.find((a) => a.kind === "cash")?.id ?? accounts[0]?.id ?? ""));
  const importMutation = trpc.bank.importBankStatement.useMutation();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importMutation.mutateAsync({ csv: await file.text(), accountId: accountId ? Number(accountId) : undefined, format: "auto" });
      if (result.success) {
        toast.success(c.done(result.added));
        void Promise.all([utils.bank.getMonthData.invalidate(), utils.bank.listAccounts.invalidate(), utils.banks.overview.invalidate(), utils.review.count.invalidate()]);
        onClose();
      } else {
        toast.error(("error" in result && result.error) || c.error);
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : c.error);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !importMutation.isPending) onClose(); }}>
      <DialogContent className="rounded-2xl bg-white sm:max-w-md">
        <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{c.title}</DialogTitle>
        <DialogDescription className="text-sm text-slate-600">{c.text}</DialogDescription>
        <div>
          <label htmlFor={`${uid}-acct`} className={ui.label}>{c.account}</label>
          <select id={`${uid}-acct`} value={accountId} onChange={(e) => setAccountId(e.target.value)} className={ui.control}>
            {accounts.map((a) => <option key={a.id} value={String(a.id)}>{accountLabel(a, t.accountFallback)}</option>)}
          </select>
        </div>
        <input id={`${uid}-file`} ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="sr-only" tabIndex={-1} aria-label={c.file} />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={importMutation.isPending} className={ui.secondary}>{c.close}</button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending || !accountId} className={ui.primary}>
            {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
            {importMutation.isPending ? c.uploading : c.file}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
