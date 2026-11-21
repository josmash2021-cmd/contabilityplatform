import { Link } from "react-router";
import { CalendarDays, CheckCircle2, Ellipsis, RefreshCw, Tag, Unplug } from "lucide-react";
import { BankLogo } from "@/components/brand/BankLogo";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { bancosCopy } from "@/i18n/copy/bancos";
import { Sparkline } from "./Sparkline";
import { BTN_SM, BTN_SM_PRIMARY, accountTitle, money, money0, relTime, reviewLink, signed0, typeLabel, type BankInfo, type OverviewAccount } from "./bankView";

type Props = {
  account: OverviewAccount;
  bank: BankInfo;
  now: number;
  canManage: boolean;
  syncing: boolean;
  reconnecting: boolean;
  onView: () => void;
  onReconnect: () => void;
  onSync: () => void;
  onRename: () => void;
  onSince: () => void;
  onDisconnect: () => void;
};

/** One account, like the prototype's acctCard(): logo, status, balance, its 30-day line (or a card's limit), what's left to review, and its actions. */
export function AccountCard({ account: a, bank, now, canManage, syncing, reconnecting, onView, onReconnect, onSync, onRename, onSince, onDisconnect }: Props) {
  const c = useCopy(bancosCopy);
  const t = c.accounts;
  const needs = bank.needsReconnect;
  const debt = a.kind !== "cash";
  const title = accountTitle(a);
  const updated = relTime(a.lastSyncedAt, now, c.rel);
  const usedPct = a.creditLimit ? Math.min(100, Math.max(0, (a.balance / a.creditLimit) * 100)) : null;

  return (
    <article className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-[14px] border bg-white px-4 py-3.5 transition-colors", needs ? "border-amber-700/35" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <BankLogo name={bank.name} logo={bank.logo} color={bank.color} size={38} />
          <div className="min-w-0">
            <b className="block truncate text-[15px] font-bold text-slate-900">{title}</b>
            <span className="block truncate text-xs text-slate-500">{typeLabel(a, t.types)} · {bank.name}</span>
          </div>
        </div>
        <StatusPill state={syncing ? "sync" : needs ? "needs" : "ok"} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-extrabold tracking-[-0.02em] text-slate-900 tabular-nums">{money(a.balance)}</span>
        <small className="text-xs text-slate-500">{debt ? t.owe : needs ? t.lastBalance : t.inBank}</small>
      </div>

      {a.kind === "cash" && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <Sparkline points={a.series} down={a.change30 < 0} />
          <span className={cn("whitespace-nowrap text-xs font-semibold", a.change30 > 0 ? "text-emerald-600" : "text-slate-500")}>
            {a.change30 === 0 ? t.noChange : t.change(signed0(a.change30))}
          </span>
        </div>
      )}
      {a.kind === "credit" && usedPct !== null && a.creditLimit && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t.usage(money0(a.balance), money0(a.creditLimit))}>
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${usedPct.toFixed(1)}%` }} />
          </div>
          <p className="mt-[5px] text-xs text-slate-500">{t.usage(money0(a.balance), money0(a.creditLimit))}</p>
        </div>
      )}

      {a.unreviewed > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-[10px] bg-slate-100 px-2.5 py-2 text-[13px] text-slate-900">
          <span>{t.pending(a.unreviewed)} <span className="hidden text-slate-500 sm:inline">{t.pendingHint}</span></span>
          {/* 44px tap target on phones without making the row taller. */}
          <Link to={reviewLink(a.id)} className="-my-2 inline-flex min-h-11 items-center font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700 sm:my-0 sm:min-h-0">{t.review(a.unreviewed)}</Link>
        </div>
      ) : (
        <div className="flex items-center gap-[5px] rounded-[10px] bg-emerald-50 px-2.5 py-2 text-[13px] font-semibold text-emerald-600">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t.allReviewed}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{updated ? t.updated(updated) : t.never}</span>
        <div className="flex items-center gap-1.5">
          {needs && canManage && (
            <button type="button" onClick={onReconnect} disabled={reconnecting} className={BTN_SM_PRIMARY}>{c.alert.button}</button>
          )}
          <button type="button" onClick={onView} className={BTN_SM}>{t.view}</button>
          {canManage && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={t.more(title)} title={t.more(title)}
                  className={cn(BTN_SM, "w-11 px-0 data-[state=open]:border-blue-600 data-[state=open]:ring-[3px] data-[state=open]:ring-blue-50 sm:w-[34px]")}>
                  <Ellipsis className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} aria-label={t.more(title)}
                className="w-[236px] rounded-[14px] border-slate-200 bg-white p-1.5 shadow-[0_20px_44px_-16px_rgba(15,23,42,0.30),0_2px_6px_rgba(15,23,42,0.05)]">
                <MenuItem icon={RefreshCw} label={t.menu.sync} onSelect={onSync} disabled={syncing} />
                <MenuItem icon={Tag} label={t.menu.rename} onSelect={onRename} />
                <MenuItem icon={CalendarDays} label={t.menu.since} onSelect={onSince} disabled={syncing} />
                <DropdownMenuSeparator className="mx-1.5 my-1 bg-slate-200" />
                <MenuItem icon={Unplug} label={t.menu.disconnect} onSelect={onDisconnect} danger />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </article>
  );
}

function MenuItem({ icon: Icon, label, onSelect, danger, disabled }: { icon: typeof Tag; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={disabled}
      className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm font-medium focus:bg-slate-100 sm:min-h-0",
        danger ? "text-red-600 focus:text-red-600" : "text-slate-900")}>
      <Icon className={cn("h-4 w-4", danger ? "text-red-600" : "text-slate-500")} aria-hidden="true" />{label}
    </DropdownMenuItem>
  );
}

export function StatusPill({ state }: { state: "ok" | "needs" | "sync" }) {
  const t = useCopy(bancosCopy).accounts;
  if (state === "sync") {
    return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-blue-600"><RefreshCw className="h-[13px] w-[13px] motion-safe:animate-spin" aria-hidden="true" />{t.syncing}</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold", state === "needs" ? "text-amber-700" : "text-emerald-600")}>
      <i className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />{state === "needs" ? t.needs : t.ok}
    </span>
  );
}
