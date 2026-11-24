import { useId, useRef } from "react";
import { useNavigate } from "react-router";
import { Landmark, Loader2, Lock, Plus, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { bancosCopy } from "@/i18n/copy/bancos";
import { accountTitle, type OverviewAccount } from "./bankView";

/** Prototype .btn */
const BTN = "inline-flex min-h-11 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 sm:min-h-10";

/** "Conexión segura y de solo lectura por [Plaid]" with Plaid's original logo. */
export function SecureLine({ className }: { className?: string }) {
  const t = useCopy(bancosCopy).bottom;
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-[13px] text-slate-500", className)}>
      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
      <span>{t.secure}</span>
      <img src="/brands/plaid.svg" alt="Plaid" width={50} height={19} className="h-[19px] w-auto shrink-0" />
    </p>
  );
}

/**
 * The bottom row: "Conectar otro banco" (Plaid; locked when the plan's banks are used up),
 * "Importar estado de cuenta (CSV)" (bank.importBankStatement, same input as before) and the Plaid line.
 */
export function BankBottom({ accounts, canManage, locked, limit, onConnect }: {
  accounts: OverviewAccount[]; canManage: boolean; locked: boolean; limit: number | null; onConnect: () => void;
}) {
  const t = useCopy(bancosCopy).bottom;
  const navigate = useNavigate();
  const id = useId();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<number | null>(null);
  const importCsv = trpc.bank.importBankStatement.useMutation();

  const pick = (accountId: number) => {
    target.current = accountId;
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const r = await importCsv.mutateAsync({ csv: text, accountId: target.current ?? undefined, format: "auto" });
      if (r.success) {
        toast.success(t.csvDone(r.added, "latestBalance" in r ? r.latestBalance : null));
        void utils.banks.invalidate();
        void utils.bank.getMonthData.invalidate();
        void utils.bank.getYearData.invalidate();
        void utils.bank.listAccounts.invalidate();
        void utils.bank.getLiveBalance.invalidate();
        void utils.review.invalidate();
      } else {
        toast.error(("error" in r && r.error) || t.csvError);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : t.csvError);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      {canManage && (
        <div className="flex flex-wrap gap-1.5">
          {locked && limit !== null ? (
            <button type="button" onClick={() => navigate("/settings?sec=plan")} title={t.locked(limit)} aria-describedby={`${id}-lock`}
              className={cn(BTN, "border-dashed bg-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-700")}>
              <Lock className="h-[15px] w-[15px]" aria-hidden="true" />{t.connect}
              <span id={`${id}-lock`} className="sr-only">{t.locked(limit)}</span>
            </button>
          ) : (
            <button type="button" onClick={onConnect} data-guide="bank-connect" className={BTN}><Plus className="h-4 w-4" aria-hidden="true" />{t.connect}</button>
          )}

          <label htmlFor={`${id}-csv`} className="sr-only">{t.csvFile}</label>
          <input id={`${id}-csv`} ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" tabIndex={-1} />
          {accounts.length > 1 ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" disabled={importCsv.isPending} className={BTN}>
                  {importCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                  {importCsv.isPending ? t.csvWorking : t.csv}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={8} className="w-[260px] rounded-[14px] border-slate-200 bg-white p-1.5">
                <DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-semibold text-slate-500">{t.csvWhich}</DropdownMenuLabel>
                {accounts.map((a) => (
                  <DropdownMenuItem key={a.id} onSelect={() => pick(a.id)} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 text-sm font-medium text-slate-900 focus:bg-slate-100 sm:min-h-9">
                    <Landmark className="h-4 w-4 text-slate-500" aria-hidden="true" /><span className="truncate">{accountTitle(a)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button type="button" onClick={() => accounts[0] && pick(accounts[0].id)} disabled={importCsv.isPending || !accounts[0]} className={BTN}>
              {importCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              {importCsv.isPending ? t.csvWorking : t.csv}
            </button>
          )}
        </div>
      )}
      <SecureLine className="mt-3.5" />
    </div>
  );
}
