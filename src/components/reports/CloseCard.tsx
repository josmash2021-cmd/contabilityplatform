import { Link } from "react-router";
import { Download, Landmark, Lock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import { addDays, partsOf } from "../../../api/lib/reportBooks";
import { BTN, BTN_LOCKED, BTN_SM, CARD, H3, dayLabel } from "./ui";

export type CloseStatus = { allowed: boolean; accounts: Array<{ id: number; name: string; mask: string | null; closedThrough: string | null }> };

/**
 * "Cierre de mes" (.rp-close): whether last month is reconciled and closed in Bancos, and the actions to send the
 * books to the accountant: Excel, PDF, invite. Locked buttons say which plan has them.
 */
export function CloseCard({ status, today, locale, canExport, canInvite, inviteLockedLabel, onExport, c }: {
  status: CloseStatus | undefined;
  today: string;
  locale: string;
  /** The plan includes the accountant reports (Pro and Negocio). */
  canExport: boolean;
  /** null: hidden (team members); false: locked; true: link to Equipo. */
  canInvite: boolean | null;
  inviteLockedLabel: string;
  onExport: (tab: "xlsx" | "pdf") => void;
  c: ReportesCopy;
}) {
  const t = partsOf(today);
  const lastMonthEnd = addDays(`${today.slice(0, 8)}01`, -1);
  const last = partsOf(lastMonthEnd);
  const lastName = c.monthName(last.month).replace(/^./, (x) => x.toUpperCase());
  const thisName = c.monthName(t.month).replace(/^./, (x) => x.toUpperCase());
  const accounts = status?.accounts ?? [];
  const closedAll = accounts.length > 0 && accounts.every((a) => a.closedThrough !== null && a.closedThrough >= lastMonthEnd);
  const through = accounts.map((a) => a.closedThrough).filter((x): x is string => !!x).sort()[0] ?? null;

  let line;
  if (!status) line = <span className="inline-block h-4 w-64 max-w-full animate-pulse rounded bg-slate-100" />;
  else if (accounts.length === 0) line = c.close.noBank;
  else if (!status.allowed) line = c.close.locked;
  else {
    line = (
      <>
        {lastName}{" "}
        <span className={cn("inline-flex items-center gap-1.5 font-semibold", closedAll ? "text-emerald-600" : "text-amber-700")}>
          <i className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />{closedAll ? c.close.closed : c.close.open}
        </span>
        {" · "}{closedAll || !through ? c.close.next(thisName) : c.close.through(dayLabel(through, locale))}
      </>
    );
  }

  return (
    <section className={CARD} aria-labelledby="rp-close-h">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h3 id="rp-close-h" className={H3}>{c.close.title}</h3>
          <p className="mt-0.5 text-[13px] text-slate-500">{line}</p>
        </div>
        <Link to="/bank" className={BTN_SM}><Landmark className="h-[15px] w-[15px]" aria-hidden="true" />{accounts.length === 0 && status ? c.close.goBank : c.close.go}</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {canExport ? (
          <>
            <button type="button" className={BTN} onClick={() => onExport("xlsx")}><Download className="h-4 w-4" aria-hidden="true" />{c.close.excel}</button>
            <button type="button" className={BTN} onClick={() => onExport("pdf")}><Download className="h-4 w-4" aria-hidden="true" />{c.close.pdf}</button>
          </>
        ) : (
          <>
            <Link to="/settings?sec=plan" className={BTN_LOCKED} title={c.close.lockedExport}><Lock className="h-[15px] w-[15px]" aria-hidden="true" />{c.close.excel}</Link>
            <Link to="/settings?sec=plan" className={BTN_LOCKED} title={c.close.lockedExport}><Lock className="h-[15px] w-[15px]" aria-hidden="true" />{c.close.pdf}</Link>
          </>
        )}
        {canInvite === true && <Link to="/team" className={BTN}><User className="h-4 w-4" aria-hidden="true" />{c.close.invite}</Link>}
        {canInvite === false && <Link to="/settings?sec=plan" className={BTN_LOCKED} title={inviteLockedLabel}><Lock className="h-[15px] w-[15px]" aria-hidden="true" />{c.close.invite}</Link>}
      </div>
    </section>
  );
}
