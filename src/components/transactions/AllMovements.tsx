import { useId, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Landmark, Pencil, Receipt, RotateCcw, Search, ShoppingCart,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { isReviewed } from "../../../api/lib/bankReview";
import { CategoryDialog } from "./CategoryDialog";
import {
  accountLabel, asMoneyType, bankDay, categoryLabel, dayLabel, money, signedMoney,
  type BankRow, type MoneyType, type Movement, type SaleRow,
} from "./shared";

export type Account = { id: number | string; bankName: string; accountType?: string | null; accountNumber?: string | null; currentBalance?: string | number | null };
export type YearMonth = { y: number; m: number };

type Props = {
  hasBank: boolean;
  checkingBank: boolean;
  accounts: Account[];
  accountId: string;
  onAccountChange: (id: string) => void;
  period: YearMonth;
  /** Months to choose from, newest first. */
  months: YearMonth[];
  onPeriodChange: (p: YearMonth) => void;
  bankRows: BankRow[];
  bankLoading: boolean;
  bankError: boolean;
  onRetryBank: () => void;
  sales: SaleRow[];
  salesLoading: boolean;
  canReview: boolean;
  onSaved: (saved: { id: number; category: string; type: MoneyType }) => void;
};

// ─── Filters (same rules as before the redesign) ───
const lower = (t: BankRow) => (t.description || "").toLowerCase();
const isZelleRecibido = (t: BankRow) => t.category === "zelle_income";
const isZelleEnviado = (t: BankRow) => t.category === "zelle_sent";
const isCashDeposit = (t: BankRow) => t.category === "cash_deposit";
const isCashWithdrawal = (t: BankRow) => t.category === "cash_withdrawal";
const isDevolucion = (t: BankRow) => {
  const n = lower(t);
  return t.category === "refund" || n.includes("refund") || n.includes("devolucion") || n.includes("reembolso");
};
// P2P: Cash App, Square, Clover, Venmo, PayPal, Facebook Pay
const P2P_KEYWORDS = ["paypal", "cash app", "venmo", "square", "clover", "facebook pay"];
const isP2P = (t: BankRow) => t.category === "transfer" || P2P_KEYWORDS.some((k) => lower(t).includes(k));
const GAS_BRANDS = [
  // Major brands
  "shell", "exxon", "chevron", "bp", "mobil", "texaco", "marathon", "speedway",
  "valero", "citgo", "phillips 66", "sinclair", "gulf", "esso", "arco",
  // Regional chains
  "76", "union 76", "kum & go", "kum and go", "quik trip", "quiktrip", "race trac",
  "racetrac", "sheetz", "wawa", "pilot", "flying j", "love's", "maverik", "thorntons",
  "stripes", "murphy usa", "casey's", "caseys", "holiday", "cumberland farms",
  "royal farms", "getgo", "parkers", "parker's", "quick chek", "quickchek",
  "stewart's", "stewarts", "oncue", "p66", "kennedy",
  // Warehouse/club gas
  "costco gas", "walmart gas", "sam's club gas", "buc-ee's", "bucees",
  "7-eleven gas", "7 eleven gas",
  // Generic keywords
  "gasoline", "petrol", "fuel", "gas station", "gas sta", "gasoline station",
];
const GAS_RES = GAS_BRANDS.map((b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
const isGas = (t: BankRow) => {
  const n = lower(t);
  // Zelle transactions are never gas, even if the bank side mis-categorized them.
  if (n.includes("zelle")) return false;
  if (t.category === "gasolina") return true;
  // Word boundaries avoid false positives like "arco" inside "alarcon".
  return GAS_RES.some((re) => re.test(n));
};
const STREAMING_SERVICES = [
  "netflix", "spotify", "disney", "hulu", "hbo", "max", "paramount", "peacock",
  "prime video", "youtube premium", "youtube tv", "crunchyroll", "twitch",
  "starz", "showtime", "amc+", "apple tv", "apple music", "apple arcade",
  "amazon prime", "netflix.com", "disneyplus", "hbomax",
];
const isStreaming = (t: BankRow) => t.category === "subscription" || t.category === "membership" || STREAMING_SERVICES.some((s) => lower(t).includes(s));

const BANK_FILTERS: Array<{ key: string; test: (t: BankRow) => boolean }> = [
  { key: "income", test: (t) => t.type === "income" },
  { key: "expense", test: (t) => t.type === "expense" },
  { key: "devoluciones", test: isDevolucion },
  { key: "zelle_in", test: isZelleRecibido },
  { key: "zelle_out", test: isZelleEnviado },
  { key: "cash_deposit", test: isCashDeposit },
  { key: "cash_withdrawal", test: isCashWithdrawal },
  { key: "gasolina", test: isGas },
  { key: "streaming", test: isStreaming },
  { key: "p2p", test: isP2P },
];

type ListItem =
  | { kind: "bank"; key: string; when: number; row: BankRow }
  | { kind: "sale"; key: string; when: number; sale: SaleRow };

const num = (v: unknown) => Number(v ?? 0) || 0;

/** "Todos": the month's bank movements (with the filters and search the page always had) and the sales. */
export function AllMovements(props: Props) {
  const { hasBank, checkingBank, accounts, accountId, period, months, bankRows, sales, canReview } = props;
  const t = useCopy(movimientosCopy);
  const a = t.all;
  const locale = intlLocale(useLang().lang);
  const navigate = useNavigate();
  const uid = useId();
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState<Movement | null>(null);

  const isSalesFilter = filterType === "ventas" || filterType === "devoluciones";
  const filterDef = BANK_FILTERS.find((f) => f.key === filterType);
  const filteredBank = filterDef ? bankRows.filter(filterDef.test) : bankRows;
  const q = searchQuery.trim().toLowerCase();
  const searchedBank = q ? filteredBank.filter((tx) => lower(tx).includes(q)) : filteredBank;

  // Sales (no bank needed)
  const salesShown = filterType === "ventas" ? sales.filter((s) => s.status === "completed")
    : filterType === "devoluciones" ? sales.filter((s) => s.status === "refunded")
      : filterType === "all" ? sales : [];

  // What the list shows. "Devoluciones" with a bank connected: the bank's refunds (the reason the chip shows) and refunded sales.
  const items: ListItem[] = (() => {
    const saleItems: ListItem[] = salesShown.map((s) => ({ kind: "sale", key: `sale-${s.id}`, when: new Date(s.createdAt).getTime(), sale: s }));
    const bankItems: ListItem[] = searchedBank.map((row, i) => ({ kind: "bank", key: String(row.id ?? row.plaidTransactionId ?? `row-${i}`), when: new Date(`${bankDay(row.transactionDate)}T12:00:00Z`).getTime(), row }));
    if (filterType === "ventas") return saleItems;
    if (filterType === "devoluciones") return hasBank ? [...bankItems, ...saleItems].sort((x, y) => y.when - x.when) : saleItems;
    return hasBank ? bankItems : [];
  })();

  const totalIncome = bankRows.filter((tx) => tx.type === "income").reduce((s, tx) => s + num(tx.amount), 0);
  const totalExpense = bankRows.filter((tx) => tx.type === "expense").reduce((s, tx) => s + num(tx.amount), 0);
  const selectedAccount = accounts.find((acc) => String(acc.id) === accountId);
  const liveBalance = num(selectedAccount?.currentBalance);

  // Only offer a filter when the month has movements for it.
  const filterKeys = hasBank
    ? ["all", ...BANK_FILTERS.filter((f) => bankRows.some(f.test)).map((f) => f.key)]
    : ["all", "ventas", "devoluciones"];

  const loading = props.bankLoading || props.salesLoading;
  const title = t.titles[filterType] ?? t.titles.all;
  const monthName = `${t.monthsLong[period.m - 1]} ${period.y}`;
  const countLine = isSalesFilter
    ? a.records(items.length)
    : [a.countOf(searchedBank.length, bankRows.length), q ? a.searching(searchQuery.trim()) : "", monthName].filter(Boolean).join(" · ");

  const monthIdx = months.findIndex((p) => p.y === period.y && p.m === period.m);
  const older = monthIdx >= 0 && monthIdx < months.length - 1 ? months[monthIdx + 1] : null;
  const newer = monthIdx > 0 ? months[monthIdx - 1] : null;

  const openEditor = (row: BankRow) => {
    if (typeof row.id !== "number") return;
    setEditing({
      id: row.id, description: row.description ?? "", amount: num(row.amount), type: asMoneyType(row.type), category: row.category ?? "other",
      date: bankDay(row.transactionDate), plaidAmount: row.plaidAmount, importedFrom: row.importedFrom,
    });
  };

  const control = "h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10";

  return (
    <div className="space-y-5">
      {/* Account, month, search and filters */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label={a.filtersLabel}>
        {hasBank && (
          <div className={cn("grid gap-3 sm:grid-cols-2", accounts.length > 1 ? "lg:grid-cols-[minmax(0,16rem)_minmax(0,17rem)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]")}>
            {/* With one account there's nothing to choose; its name shows on the balance below. */}
            {accounts.length > 1 && (
              <div>
                <label htmlFor={`${uid}-acct`} className="mb-1.5 block text-xs font-medium text-slate-600">{a.account}</label>
                <select id={`${uid}-acct`} value={accountId} onChange={(e) => props.onAccountChange(e.target.value)} className={control}>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={String(acc.id)}>
                      {accountLabel(acc.bankName, acc.accountNumber, t)} · {money(num(acc.currentBalance))}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor={`${uid}-month`} className="mb-1.5 block text-xs font-medium text-slate-600">{a.month}</label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => older && props.onPeriodChange(older)} disabled={!older} aria-label={a.prevMonth}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 sm:h-10 sm:w-10">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <select id={`${uid}-month`} value={`${period.y}-${period.m}`} className={control}
                  onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); props.onPeriodChange({ y, m }); }}>
                  {months.map((p) => <option key={`${p.y}-${p.m}`} value={`${p.y}-${p.m}`}>{t.monthsLong[p.m - 1]} {p.y}</option>)}
                </select>
                <button type="button" onClick={() => newer && props.onPeriodChange(newer)} disabled={!newer} aria-label={a.nextMonth}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 sm:h-10 sm:w-10">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <div className={cn(accounts.length > 1 && "sm:col-span-2 lg:col-span-1")}>
              <label htmlFor={`${uid}-q`} className="mb-1.5 block text-xs font-medium text-slate-600">{a.search}</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input id={`${uid}-q`} type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={a.searchPh}
                  className={cn(control, "pl-9")} />
              </div>
            </div>
          </div>
        )}

        <div className={cn("-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5", hasBank && "mt-4")} style={{ scrollbarWidth: "none" }}>
          <div className="flex w-max gap-2" role="group" aria-label={a.filtersLabel}>
            {filterKeys.map((key) => (
              <button key={key} type="button" onClick={() => setFilterType(key)} aria-pressed={filterType === key}
                className={cn(
                  "h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9",
                  filterType === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}>
                {t.filters[key]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Month totals (bank only) */}
      {hasBank && !isSalesFilter && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={monthName}>
          <Kpi label={a.in} value={`+${money(totalIncome)}`} sub={a.inSub} tone="good" loading={props.bankLoading} />
          <Kpi label={a.out} value={`−${money(totalExpense)}`} sub={a.outSub} loading={props.bankLoading} />
          <Kpi label={a.balance} value={money(liveBalance)} sub={selectedAccount ? accountLabel(selectedAccount.bankName, selectedAccount.accountNumber, t) : a.balanceSub} tone={liveBalance < 0 ? "bad" : undefined} className="col-span-2 sm:col-span-1" />
        </section>
      )}

      {/* No bank and a bank view picked: invite to connect */}
      {!hasBank && !checkingBank && !isSalesFilter && (
        <section className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Landmark className="h-6 w-6" aria-hidden /></span>
          <h2 className="mt-5 text-xl font-bold tracking-tight">{t.noBank.title}</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">{t.noBank.text}</p>
          <button onClick={() => navigate("/bank")}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <Landmark className="h-4 w-4" aria-hidden />{t.noBank.button}
          </button>
        </section>
      )}

      {/* The list */}
      {(hasBank || isSalesFilter) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby={`${uid}-list`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id={`${uid}-list`} className="font-semibold text-slate-900">{title}</h2>
            {!loading && !props.bankError && <p className="text-xs text-slate-500">{countLine}</p>}
          </div>

          {loading ? (
            <div className="mt-3 space-y-2" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : props.bankError && !isSalesFilter ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-700">{a.loadError}</p>
              <button onClick={props.onRetryBank}
                className="mt-3 inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10">
                {t.retry}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Receipt className="h-6 w-6" aria-hidden /></span>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {filterType === "ventas" ? a.noSales : filterType === "devoluciones" ? a.noRefunds : q && filteredBank.length > 0 ? a.noMatch : a.noTransactions}
              </p>
              <p className="mt-1 text-xs text-slate-500">{isSalesFilter ? a.createInvoiceHint : a.syncHint}</p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {items.map((it) => it.kind === "sale"
                ? <SaleItem key={it.key} sale={it.sale} locale={locale} />
                : <BankItem key={it.key} row={it.row} locale={locale} editable={canReview && typeof it.row.id === "number"} onEdit={() => openEditor(it.row)} />)}
            </ul>
          )}
        </section>
      )}

      {editing && <CategoryDialog movement={editing} onClose={() => setEditing(null)} onSaved={props.onSaved} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone, loading, className }: { label: string; value: string; sub: string; tone?: "good" | "bad"; loading?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4", className)}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-2 h-7 w-28 rounded-md" /> : (
        <p className={cn("mt-1 text-xl font-bold tabular-nums tracking-tight sm:text-2xl", tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900")}>{value}</p>
      )}
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function BankItem({ row, locale, editable, onEdit }: { row: BankRow; locale: string; editable: boolean; onEdit: () => void }) {
  const t = useCopy(movimientosCopy);
  const income = row.type === "income";
  const description = row.description ?? "";
  const reviewed = isReviewed(row.isReconciled);
  const Icon = income ? ArrowDownLeft : ArrowUpRight;
  const body = (
    <>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", income ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600")}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">{description}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{dayLabel(bankDay(row.transactionDate), locale)}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{categoryLabel(row.category, t)}</span>
          {reviewed && <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{t.all.reviewed}</span>}
        </span>
      </span>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", income ? "text-emerald-700" : "text-slate-900")}>{signedMoney(num(row.amount), row.type)}</span>
      {editable && <Pencil className="hidden h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500 sm:block" aria-hidden />}
    </>
  );
  return (
    <li>
      {editable ? (
        <button type="button" onClick={onEdit} aria-label={`${t.all.changeAria(description)} · ${signedMoney(num(row.amount), row.type)}`}
          className="group -mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {body}
        </button>
      ) : (
        <div className="flex min-h-14 items-center gap-3 py-3">{body}</div>
      )}
    </li>
  );
}

function SaleItem({ sale, locale }: { sale: SaleRow; locale: string }) {
  const t = useCopy(movimientosCopy);
  const refunded = sale.status === "refunded";
  const created = new Date(sale.createdAt);
  const when = Number.isNaN(created.getTime()) ? "" : `${created.toLocaleDateString(locale, { day: "numeric", month: "short" })} · ${created.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;
  const name = sale.items?.map((i) => i.serviceName).join(", ") || sale.invoiceNumber;
  const total = num(sale.total);
  return (
    <li className="flex min-h-14 items-center gap-3 py-3">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", refunded ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600")}>
        {refunded ? <RotateCcw className="h-4 w-4" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
        <span className="block truncate text-xs text-slate-500">{sale.invoiceNumber} · {sale.customerName || t.all.walkIn}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{when}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{t.methods[sale.paymentMethod] || sale.paymentMethod || t.all.sale}</span>
        </span>
      </span>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", refunded ? "text-red-700" : "text-emerald-700")}>{refunded ? "−" : "+"}{money(total)}</span>
    </li>
  );
}
