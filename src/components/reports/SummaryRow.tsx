import { Link } from "react-router";
import { ArrowDownLeft, ArrowUpRight, Landmark, PiggyBank, TrendingDown, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { reportesCopy } from "@/i18n/copy/reportes";
import { money, percent } from "./format";

type Tone = "in" | "out" | "good" | "bad" | "bank";

const ICON_TONE: Record<Tone, string> = {
  in: "bg-emerald-50 text-emerald-600",
  out: "bg-red-50 text-red-600",
  good: "bg-emerald-50 text-emerald-600",
  bad: "bg-red-50 text-red-600",
  bank: "bg-blue-50 text-blue-600",
};

/** Lo que entró · Lo que salió · Te quedó (with margin) · En el banco. */
export function SummaryRow({
  loading, stale, moneyIn, moneyOut, salesCount, bank, locale,
}: {
  loading: boolean;
  /** True while a new period loads: the old numbers stay, dimmed. */
  stale: boolean;
  moneyIn: number;
  moneyOut: number;
  /** Paid sales in the period, when the page knows it. */
  salesCount: number | null;
  bank: { connected: boolean; loading: boolean; balance: number; name: string; accounts: number };
  locale: string;
}) {
  const t = useCopy(reportesCopy).summary;
  const net = moneyIn - moneyOut;
  const loss = net < -0.004;
  const keptSub = moneyIn > 0 ? t.keptMargin(percent(net / moneyIn, locale)) : t.keptNone;

  return (
    <section aria-label={t.label} aria-busy={loading || stale || undefined} className={cn("grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4", stale && "opacity-60")}>
      <Tile icon={ArrowDownLeft} tone="in" label={t.in} value={money(moneyIn)} sub={salesCount != null ? t.inSales(salesCount) : t.inNoCount} loading={loading} />
      <Tile icon={ArrowUpRight} tone="out" label={t.out} value={money(moneyOut)} sub={t.outSub} loading={loading} />
      <Tile
        icon={loss ? TrendingDown : PiggyBank}
        tone={loss ? "bad" : "good"}
        label={loss ? t.lost : t.kept}
        value={money(loss ? -Math.abs(net) : net)}
        valueClass={loss ? "text-red-700" : moneyIn > 0 ? "text-emerald-700" : undefined}
        sub={loss ? t.lostSub : keptSub}
        loading={loading}
      />
      <Link to="/bank" className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <Tile
          icon={Landmark}
          tone="bank"
          label={t.bank}
          value={bank.connected ? money(bank.balance) : "—"}
          sub={bank.connected ? t.bankSub(bank.name, bank.accounts) : t.bankNone}
          loading={bank.loading}
          hover
        />
      </Link>
    </section>
  );
}

function Tile({ icon: Icon, tone, label, value, valueClass, sub, loading, hover }: {
  icon: LucideIcon; tone: Tone; label: string; value: string; valueClass?: string; sub: string; loading: boolean; hover?: boolean;
}) {
  return (
    <div className={cn("h-full rounded-2xl border border-slate-200 bg-white p-4", hover && "transition group-hover:border-slate-300 group-hover:shadow-sm")}>
      <div className="flex items-center gap-2">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", ICON_TONE[tone])}><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <p className="min-w-0 truncate text-xs font-medium text-slate-500">{label}</p>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-2.5 h-7 w-28 bg-slate-100" />
          <Skeleton className="mt-2 h-3.5 w-24 bg-slate-100" />
        </>
      ) : (
        <>
          <p className={cn("mt-2 text-xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-2xl", valueClass)}>{value}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{sub}</p>
        </>
      )}
    </div>
  );
}
