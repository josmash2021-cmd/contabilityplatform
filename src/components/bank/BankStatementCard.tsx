import { useId, useRef } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { bancoNegocioCopy } from "@/i18n/copy/bancoNegocio";

/** Secondary action: add a bank statement CSV to the chosen account (bank.importBankStatement, same input as before). */
export function BankStatementCard({ accountId, accountName, className = "" }: { accountId: number | undefined; accountName: string | null; className?: string }) {
  const t = useCopy(bancoNegocioCopy).statement;
  const id = useId();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = trpc.bank.importBankStatement.useMutation();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const result = await importMutation.mutateAsync({ csv: text, accountId, format: "auto" });
      if (result.success) {
        toast.success(t.done(result.added, "latestBalance" in result ? result.latestBalance : null));
        void utils.bank.getLiveBalance.invalidate();
        void utils.bank.getMonthData.invalidate();
        void utils.bank.getYearData.invalidate();
        void utils.bank.listAccounts.invalidate();
      } else {
        toast.error(("error" in result && result.error) || t.error);
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.error);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 lg:flex-col lg:items-start ${className}`} aria-labelledby={`${id}-title`}>
      <div className="min-w-0">
        <h2 id={`${id}-title`} className="font-semibold text-slate-900">{t.title}</h2>
        <p className="mt-1 max-w-xl text-sm text-slate-500">{t.text}</p>
        {accountName && <p className="mt-1 text-xs font-medium text-slate-600">{t.target(accountName)}</p>}
      </div>
      <label htmlFor={`${id}-file`} className="sr-only">{t.fileLabel}</label>
      <input id={`${id}-file`} ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="sr-only" tabIndex={-1} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 sm:h-10">
        {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {importMutation.isPending ? t.uploading : t.button}
      </button>
    </section>
  );
}
