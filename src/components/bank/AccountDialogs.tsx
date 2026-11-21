import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { bancosCopy } from "@/i18n/copy/bancos";
import { MAX_HISTORY_DAYS, MAX_NICKNAME, displayAccountName } from "../../../api/lib/banks";
import { addDays } from "../../../api/lib/vendors";
import type { OverviewAccount } from "./bankView";

const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:min-h-10";
const PRIMARY = cn(BTN, "bg-blue-600 text-white hover:bg-blue-700");
const SECONDARY = cn(BTN, "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50");
const INPUT = "h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus-visible:border-blue-500 focus-visible:ring-[3px] focus-visible:ring-blue-50 sm:h-10 sm:text-sm";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** "Cambiar nombre": a nickname for the account in the app (banks.rename). Saving the bank's own name, or nothing, removes it. */
export function RenameDialog({ account, onClose }: { account: OverviewAccount | null; onClose: () => void }) {
  return (
    <Dialog open={!!account} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-white sm:max-w-md sm:rounded-2xl">
        {account && <RenameForm key={account.id} account={account} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ account, onDone }: { account: OverviewAccount; onDone: () => void }) {
  const t = useCopy(bancosCopy).rename;
  const id = useId();
  const utils = trpc.useUtils();
  const rename = trpc.banks.rename.useMutation();
  const bankName = displayAccountName(account.name, account.mask) || account.name;
  const [value, setValue] = useState(account.nickname ?? bankName);

  const save = async (nickname: string | null) => {
    try {
      const r = await rename.mutateAsync({ accountId: account.id, nickname });
      toast.success(r.nickname ? t.saved(r.nickname) : t.removed);
      void utils.banks.overview.invalidate();
      onDone();
    } catch (e: unknown) {
      toast.error(errorText(e, t.error));
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    void save(!v || v === bankName ? null : v);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-slate-900">{t.title}</DialogTitle>
        <DialogDescription className="text-slate-600">{t.text}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] font-semibold text-slate-900">{t.label}</label>
        <input id={`${id}-name`} value={value} onChange={(e) => setValue(e.target.value)} maxLength={MAX_NICKNAME} autoComplete="off" className={INPUT} />
        <p className="text-xs text-slate-500">{t.bankName(`${bankName}${account.mask ? ` ••${account.mask}` : ""}`)}</p>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {account.nickname ? (
          <button type="button" onClick={() => void save(null)} disabled={rename.isPending} className={cn(SECONDARY, "border-transparent text-blue-600 hover:bg-blue-50")}>{t.reset}</button>
        ) : <span className="hidden sm:block" />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={onDone} disabled={rename.isPending} className={SECONDARY}>{t.cancel}</button>
          <button type="submit" disabled={rename.isPending} className={PRIMARY}>{rename.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t.save}</button>
        </div>
      </DialogFooter>
    </form>
  );
}

/** "Traer movimientos desde…": pick the first day; the page runs banks.syncItem with it (as far back as Plaid allows). */
export function SinceDialog({ account, bankName, today, onClose, onPick }: {
  account: OverviewAccount | null; bankName: string; today: string; onClose: () => void; onPick: (since: string) => void;
}) {
  return (
    <Dialog open={!!account} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-white sm:max-w-md sm:rounded-2xl">
        {account && <SinceForm key={account.id} bankName={bankName} today={today} onCancel={onClose} onPick={onPick} />}
      </DialogContent>
    </Dialog>
  );
}

/** The same day `months` months earlier (the 31st falls back to the month's last day). */
function monthsBefore(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

function SinceForm({ bankName, today, onCancel, onPick }: { bankName: string; today: string; onCancel: () => void; onPick: (since: string) => void }) {
  const t = useCopy(bancosCopy).since;
  const id = useId();
  const earliest = addDays(today, -MAX_HISTORY_DAYS);
  const clamp = (v: string) => (v < earliest ? earliest : v > today ? today : v);
  const [value, setValue] = useState(() => clamp(monthsBefore(today, 3)));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) onPick(clamp(value));
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-slate-900">{t.title}</DialogTitle>
        <DialogDescription className="text-slate-600">{t.text(bankName)}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.title}>
        {t.presets.map((p) => {
          const v = clamp(monthsBefore(today, p.months));
          return (
            <button key={p.months} type="button" onClick={() => setValue(v)} aria-pressed={value === v}
              className={cn("min-h-11 rounded-full border px-3 text-[13px] font-semibold sm:min-h-9",
                value === v ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-since`} className="text-[13px] font-semibold text-slate-900">{t.label}</label>
        <input id={`${id}-since`} type="date" value={value} min={earliest} max={today} required onChange={(e) => setValue(e.target.value)} className={INPUT} />
      </div>
      <DialogFooter className="gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY}>{t.cancel}</button>
        <button type="submit" className={PRIMARY}>{t.bring}</button>
      </DialogFooter>
    </form>
  );
}

/** "Desconectar": confirms before banks.disconnectItem (only this bank; its movements stay). */
export function DisconnectDialog({ bankName, accounts, open, pending, onClose, onConfirm }: {
  bankName: string; accounts: string[]; open: boolean; pending: boolean; onClose: () => void; onConfirm: () => Promise<boolean>;
}) {
  const t = useCopy(bancosCopy).disconnect;
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <AlertDialogContent className="bg-white sm:rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-900">{t.title(bankName)}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2 text-sm text-slate-600">
              <p>{t.text(bankName, accounts.join(", "))}</p>
              <p>{t.keep}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-11 rounded-[10px] sm:h-10" disabled={pending}>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction disabled={pending}
            onClick={(e) => { e.preventDefault(); void onConfirm().then((ok) => { if (ok) onClose(); }); }}
            className="h-11 rounded-[10px] bg-red-600 text-white hover:bg-red-700 sm:h-10">
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{pending ? t.working : t.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
