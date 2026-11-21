import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { bancosCopy } from "@/i18n/copy/bancos";
import { bankCopy } from "@/i18n/copy/bank";
import { accountTitle, money, money0, shortDay, signed0, type Overview } from "./bankView";

/**
 * The money at the top, like the prototype's .bank-sum: what's in the bank accounts and the real
 * change of the last 30 days; on the side, what's left after this week's vendor bills (plans with
 * Proveedores) and what's owed on cards. Cards and loans never count as money you have.
 */
export function BankSummary({ data }: { data: Overview }) {
  const t = useCopy(bancosCopy).summary;
  const { lang } = useLang();
  const { monthsShort } = useCopy(bankCopy);
  const { totals, week } = data;
  const cards = data.accounts.filter((a) => a.kind === "credit");
  const up = totals.change30 > 0;
  const down = totals.change30 < 0;
  const side = week !== null || cards.length > 0;

  return (
    <section aria-label={t.haveIn(totals.cashCount)}
      className={cn("grid grid-cols-[minmax(0,1fr)] items-center gap-4 rounded-[14px] border border-slate-200 bg-white p-4", side && "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]")}>
      <div className="min-w-0">
        <span className="block text-[13px] text-slate-500">{t.haveIn(totals.cashCount)}</span>
        <p className="mb-1 mt-0.5 text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em] text-slate-900 tabular-nums md:text-[30px]">{money(totals.cash)}</p>
        <span className={cn("inline-flex items-center gap-[5px] text-xs", up ? "font-semibold text-emerald-600" : "text-slate-500")}>
          {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : down ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          {up || down ? t.change(signed0(totals.change30)) : t.noChange}
        </span>
      </div>
      {side && (
        <div className="grid min-w-0 gap-2">
          {week && (
            <SideRow label={t.afterWeek} value={money(week.after)}
              sub={week.bills.length
                ? week.bills.map((b) => `${b.vendor} ${money0(b.amount)} · ${shortDay(b.dueDate, lang, monthsShort)}`).join(" · ")
                : t.noWeekBills} />
          )}
          {cards.length > 0 && (
            <SideRow label={t.cardOwed(cards.length)} value={money(totals.cardOwed)} sub={cards.map(accountTitle).join(" · ")} />
          )}
        </div>
      )}
    </section>
  );
}

function SideRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5 rounded-xl bg-slate-100 px-3 py-2.5">
      <span className="text-[13px] text-slate-500">{label}</span>
      <b className="text-right text-base font-[750] text-slate-900 tabular-nums">{value}</b>
      <span className="col-span-2 text-xs text-slate-500">{sub}</span>
    </div>
  );
}
