import { Link } from "react-router";
import { CreditCard, HandCoins, Landmark, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopy } from "@/i18n/useI18n";
import { bancoNegocioCopy } from "@/i18n/copy/bancoNegocio";
import { isDebt, money, type BankAccountView } from "./bankUtils";

type Props = {
  accounts: BankAccountView[];
  loading: boolean;
  /** Banks connected, counted like the plan limit. */
  used: number;
  /** The plan's bank limit; null = no limit (admins). Undefined while loading. */
  limit: number | null | undefined;
  canConnect: boolean;
  onConnect: () => void;
};

/** Every connected account with its balance (cards and loans as what you owe), the plan's bank usage and "Conectar otro banco". */
export function BankAccountsCard({ accounts, loading, used, limit, canConnect, onConnect }: Props) {
  const t = useCopy(bancoNegocioCopy);
  const full = typeof limit === "number" && used >= limit;

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 lg:col-start-1 lg:row-start-1" aria-labelledby="bank-accounts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="bank-accounts" className="font-semibold text-slate-900">{t.accounts.title}</h2>
        {canConnect && (
          <button onClick={onConnect} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9">
            <Plus className="h-4 w-4" />{t.accounts.connectAnother}
          </button>
        )}
      </div>

      {limit !== undefined && (
        <div className="mt-2">
          <p className="text-xs text-slate-500">{limit === null ? t.usage.unlimited(used) : t.usage.line(used, limit)}</p>
          {typeof limit === "number" && (
            <div className="mt-1.5 flex gap-1" role="img" aria-label={t.usage.label(used, limit)}>
              {Array.from({ length: limit }).map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < used ? (full ? "bg-amber-500" : "bg-blue-600") : "bg-slate-200"}`} />
              ))}
            </div>
          )}
          {full && canConnect && (
            <p className="mt-2 text-xs text-amber-800">
              {t.usage.full} <Link to="/settings" className="font-semibold underline underline-offset-2 hover:text-amber-900">{t.usage.plans}</Link>
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="mt-3"><Skeleton className="h-16 rounded-xl" /></div>
      ) : accounts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t.accounts.empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {accounts.map((a) => {
            const debt = isDebt(a.type);
            const Icon = a.type === "credit" ? CreditCard : a.type === "loan" ? HandCoins : Landmark;
            const typeLabel = t.accounts.types[a.type] ?? a.type;
            return (
              <li key={a.key} className="flex items-center gap-3 py-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${debt ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{a.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {typeLabel}{a.mask ? `${typeLabel ? " · " : ""}${t.accounts.ending(a.mask)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-sm font-semibold tabular-nums ${debt ? "text-amber-700" : a.balance < 0 ? "text-red-700" : "text-slate-900"}`}>{money(a.balance)}</span>
                  <span className="block text-[11px] text-slate-500">{debt ? t.accounts.owe : t.accounts.available}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
