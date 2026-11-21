import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, Building2, CheckCircle2, CircleDollarSign, FileText, Fuel,
  HeartPulse, Landmark, Lock, PiggyBank, Receipt, Send, ShieldCheck, ShoppingBag, Sparkles, Target, TrendingDown, TrendingUp, Tv, Utensils, Wallet,
  type LucideIcon,
} from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalCopy } from "@/i18n/copy/personal";
import { budgetCategoryLabel } from "@/i18n/copy/budgets";
import { personalHomeCopy, type PersonalHomeCopy } from "@/i18n/copy/personalHome";
import { DRAFT_STEP } from "@contracts/taxRules";

const CAT_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  zelle_income: { icon: Send, tone: "bg-purple-50 text-purple-600" },
  transfer_income: { icon: ArrowUpRight, tone: "bg-sky-50 text-sky-600" },
  deposit: { icon: Building2, tone: "bg-blue-50 text-blue-600" },
  cash_deposit: { icon: Banknote, tone: "bg-amber-50 text-amber-600" },
  cash_income: { icon: CircleDollarSign, tone: "bg-emerald-50 text-emerald-600" },
  income: { icon: TrendingUp, tone: "bg-emerald-50 text-emerald-600" },
  paycheck: { icon: Banknote, tone: "bg-blue-50 text-blue-600" },
  zelle_sent: { icon: Send, tone: "bg-purple-50 text-purple-600" },
  cash_withdrawal: { icon: Banknote, tone: "bg-amber-50 text-amber-600" },
  subscription: { icon: Tv, tone: "bg-pink-50 text-pink-600" },
  shopping: { icon: ShoppingBag, tone: "bg-violet-50 text-violet-600" },
  home_expense: { icon: Utensils, tone: "bg-orange-50 text-orange-600" },
  business_expense: { icon: Receipt, tone: "bg-slate-100 text-slate-600" },
  gasolina: { icon: Fuel, tone: "bg-orange-50 text-orange-600" },
  medical: { icon: HeartPulse, tone: "bg-red-50 text-red-600" },
  food: { icon: Utensils, tone: "bg-orange-50 text-orange-600" },
};
const styleOf = (cat: string, type: string) => CAT_STYLE[cat] ?? (type === "income" ? { icon: ArrowUpRight, tone: "bg-emerald-50 text-emerald-600" } : { icon: Receipt, tone: "bg-slate-100 text-slate-600" });

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (n: number, cents = false) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
/** Plaid dates are calendar days sent as UTC midnight: read them in UTC so they don't slip a day. */
const txDay = (d: unknown, locale: string) => (d ? new Date(d as string).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }) : "");
/** Plaid reports what you owe on cards and loans as their balance. */
const isDebt = (type?: string | null) => type === "credit" || type === "loan";
const added = (d: unknown) => typeof d === "object" && d !== null && "added" in d && Number((d as { added?: unknown }).added) > 0;

type Tx = { id?: number; plaidTransactionId?: string; description: string; amount: string; type: string; category: string; transactionDate?: string | Date };
type Goal = { id: number; name: string; targetAmount: string; currentAmount: string; isActive: boolean | null };
type Tone = "bad" | "warn" | "info" | "good";
type Item = { tone: Tone; icon: LucideIcon; title: string; text: string; to?: string };

/** The 2.0 personal home: how the month is going, where the money goes, what needs a look. */
export default function PersonalDashboard() {
  const t = useCopy(personalHomeCopy);
  const { categories } = useCopy(personalCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [connecting, setConnecting] = useState(false);

  const when = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      long: upperFirst(now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })),
      monthName: now.toLocaleDateString(locale, { month: "long" }),
    };
  }, [locale]);

  const { data: bank } = trpc.bank.checkConnection.useQuery(undefined, { staleTime: 30_000 });
  const hasBank = bank?.hasBank === true;
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const canBudget = plan?.features.includes("budgets") ?? false;
  const { data: accounts } = trpc.bank.listAccounts.useQuery(undefined, { enabled: hasBank, staleTime: 60_000 });
  const { data: monthData } = trpc.bank.getMonthData.useQuery(
    { year: when.year, month: when.month },
    { enabled: hasBank, staleTime: 60_000, refetchInterval: 2 * 60_000 },
  );
  const { data: budgets } = trpc.personal.listBudgets.useQuery({ year: when.year, month: when.month }, { enabled: hasBank && canBudget, staleTime: 5 * 60_000, retry: false });
  const { data: goals } = trpc.personal.listGoals.useQuery(undefined, { staleTime: 5 * 60_000 });
  const { data: tax } = trpc.tax.current.useQuery(undefined, { staleTime: 5 * 60_000 });

  // ── Keep the bank fresh, quietly: new transactions and balances on arrival, then the month every 3 minutes ──
  const refreshMonth = () => { void utils.bank.getMonthData.invalidate(); };
  const { mutate: syncRecent } = trpc.bank.syncRecent.useMutation({ onSuccess: (d) => { if (added(d)) refreshMonth(); }, onError: () => {} });
  const { mutate: syncMonth } = trpc.bank.syncTransactions.useMutation({ onSuccess: (d) => { if (added(d)) refreshMonth(); }, onError: () => {} });
  const { mutate: refreshBalances } = trpc.bank.refreshAllBalances.useMutation({ onSuccess: () => { void utils.bank.listAccounts.invalidate(); }, onError: () => {} });
  const { mutate: autoFix } = trpc.bank.autoFixCategories.useMutation({ onSuccess: (d) => { if (d.fixed && d.fixed > 0) refreshMonth(); }, onError: () => {} });
  useEffect(() => {
    if (!hasBank) return;
    syncRecent();
    refreshBalances();
    const fix = setTimeout(() => autoFix(), 3000);
    const every = setInterval(() => syncMonth({ year: when.year, month: when.month }), 3 * 60_000);
    return () => { clearTimeout(fix); clearInterval(every); };
  }, [hasBank, syncRecent, refreshBalances, autoFix, syncMonth, when.year, when.month]);

  const firstName = (user?.name || "").trim().split(/\s+/)[0] ?? "";
  const labelOf = (cat: string, type: string) => budgetCategoryLabel(cat, type === "income" ? categories.income : categories.expense);

  // ── Tax items show for everyone (both personal plans include the return) ──
  const taxItems: Item[] = [];
  const redo = tax?.docs.filter((d) => d.source === "client" && d.status === "redo").length ?? 0;
  if (redo > 0) { const [a, b] = t.attention.taxRedo(redo); taxItems.push({ tone: "bad", icon: FileText, title: a, text: b, to: "/personal/taxes" }); }
  else if (tax?.access.allowed && (tax.ret?.step ?? DRAFT_STEP) === DRAFT_STEP && tax.missing && (tax.missing.docs.length > 0 || tax.missing.income)) {
    taxItems.push({ tone: "info", icon: FileText, title: t.attention.taxDocs[0], text: t.attention.taxDocs[1], to: "/personal/taxes" });
  }

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.hello(firstName)}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{when.long}</p>
      </div>
      <Link to="/personal/taxes" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
        <FileText className="h-4 w-4 text-blue-600" />{t.myReturn}
      </Link>
    </header>
  );

  // ── No bank yet: one clear next step, plus the return ──
  if (bank && !hasBank) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-5">
          {header}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Landmark className="h-6 w-6" /></span>
              <h2 className="mt-5 text-xl font-bold tracking-tight sm:text-2xl">{t.connect.title}</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">{t.connect.text}</p>
              <ul className="mt-5 space-y-2">
                {t.connect.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{p}</li>
                ))}
              </ul>
              <button onClick={() => setConnecting(true)} className="mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                <Landmark className="h-4 w-4" />{t.connect.button}
              </button>
            </section>
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText className="h-5 w-5" /></span>
                <h2 className="mt-3 font-semibold text-slate-900">{t.connect.taxTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.connect.taxText}</p>
                <Link to="/personal/taxes" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">{t.connect.taxButton}<ArrowRight className="h-4 w-4" /></Link>
              </section>
              {taxItems.length > 0 && <Attention items={taxItems} t={t} />}
            </div>
          </div>
          <Shortcuts t={t} lockBudgets={!!plan && !canBudget} />
        </div>
        {connecting && <PlaidLinkOverlay onClose={() => setConnecting(false)} />}
      </AnimatedPage>
    );
  }

  // ── Connected ──
  const txs: Tx[] = (monthData?.transactions ?? []) as Tx[];
  const income = Number(monthData?.income ?? 0);
  const expense = Number(monthData?.expense ?? 0);
  const kept = income - expense;
  const accountList: { currentBalance?: string | null; accountType?: string | null }[] = accounts ?? [];
  const cashAccounts = accountList.filter((a) => !isDebt(a.accountType));
  const balance = cashAccounts.reduce((a, acc) => a + Number(acc.currentBalance ?? 0), 0);
  const countOf = (type: string) => txs.filter((x) => x.type === type).length;

  // Where the money goes: biggest expense categories.
  const byCat = new Map<string, number>();
  for (const x of txs) if (x.type === "expense") byCat.set(x.category, (byCat.get(x.category) ?? 0) + Number(x.amount));
  const spending = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const items: Item[] = [];
  for (const b of budgets?.items ?? []) {
    if (b.status === "over") { const [a, c] = t.attention.over(labelOf(b.category, "expense"), fmt(Math.abs(b.remaining ?? 0))); items.push({ tone: "bad", icon: AlertTriangle, title: a, text: c, to: "/personal/budgets" }); }
    else if (b.status === "near") { const [a, c] = t.attention.near(labelOf(b.category, "expense"), b.percent ?? 0); items.push({ tone: "warn", icon: AlertTriangle, title: a, text: c, to: "/personal/budgets" }); }
  }
  items.push(...taxItems);
  if (canBudget && budgets && !budgets.items.some((b) => b.limit !== null) && spending.length > 0) {
    items.push({ tone: "info", icon: PiggyBank, title: t.attention.noBudgets[0], text: t.attention.noBudgets[1], to: "/personal/budgets" });
  }
  if (items.length === 0) items.push({ tone: "good", icon: CheckCircle2, title: t.attention.allGood[0], text: t.attention.allGood[1] });

  const goalList = ((goals ?? []) as Goal[]).filter((g) => g.isActive !== false).slice(0, 3);
  const recent = [...txs].sort((a, b) => new Date(b.transactionDate ?? 0).getTime() - new Date(a.transactionDate ?? 0).getTime()).slice(0, 6);

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        {header}

        <p className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
          {kept >= 0 ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
          <span>{txs.length > 0 ? t.status(when.monthName, fmt(income), fmt(expense), fmt(Math.abs(kept)), kept >= 0) : t.statusEmpty(when.monthName)}</span>
        </p>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={t.kpi.balance} value={fmt(balance)} sub={t.kpi.balanceSub(cashAccounts.length)} to="/personal/bank" icon={Wallet} />
          <Kpi label={t.kpi.income} value={fmt(income)} sub={t.kpi.count(countOf("income"))} to="/personal/transactions" icon={ArrowUpRight} tone="good" />
          <Kpi label={t.kpi.expense} value={fmt(expense)} sub={t.kpi.count(countOf("expense"))} to="/personal/transactions" icon={ArrowDownRight} />
          {kept >= 0
            ? <Kpi label={t.kpi.saved} value={fmt(kept)} sub={income > 0 ? t.kpi.savedSub(Math.round((kept / income) * 100)) : "—"} to="/personal/goals" icon={PiggyBank} tone="good" />
            : <Kpi label={t.kpi.overspent} value={fmt(-kept)} sub={t.kpi.overspentSub} to="/personal/transactions" icon={TrendingDown} tone="bad" />}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Attention items={items} t={t} />
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="ph-spend">
            <h2 id="ph-spend" className="font-semibold text-slate-900">{t.spending.title}</h2>
            {spending.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t.spending.none}</p> : (
              <ul className="mt-3 space-y-3">
                {spending.map(([cat, total]) => {
                  const pct = expense > 0 ? Math.round((total / expense) * 100) : 0;
                  const { icon: Icon, tone } = styleOf(cat, "expense");
                  return (
                    <li key={cat}>
                      <Link to={`/personal/category/${cat}?month=${when.month}&year=${when.year}`} className="group flex items-center gap-3 rounded-lg">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-slate-900 group-hover:underline">{labelOf(cat, "expense")}</span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{fmt(total)}</span>
                          </span>
                          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t.spending.of(pct)}>
                            <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, pct)}%` }} />
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-500">{t.spending.of(pct)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <Shortcuts t={t} lockBudgets={!!plan && !canBudget} />

        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="ph-goals">
            <div className="flex items-center justify-between">
              <h2 id="ph-goals" className="font-semibold text-slate-900">{t.goals.title}</h2>
              <Link to="/personal/goals" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">{t.goals.all}<ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            {goalList.length === 0 ? (
              <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <p>{t.goals.none}</p>
                <Link to="/personal/goals" className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"><Target className="h-4 w-4" />{t.goals.create}</Link>
              </div>
            ) : (
              <ul className="mt-3 space-y-4">
                {goalList.map((g) => {
                  const target = Number(g.targetAmount); const saved = Number(g.currentAmount);
                  const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
                  return (
                    <li key={g.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{g.name}</span>
                        <span className={`shrink-0 text-xs font-semibold ${pct >= 100 ? "text-emerald-700" : "text-slate-500"}`}>{pct >= 100 ? t.goals.done : `${pct}%`}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${Math.max(2, pct)}%` }} /></div>
                      <p className="mt-1 text-[11px] tabular-nums text-slate-500">{t.goals.progress(fmt(saved), fmt(target))}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="ph-recent">
            <div className="flex items-center justify-between">
              <h2 id="ph-recent" className="font-semibold text-slate-900">{t.recent.title}</h2>
              <Link to="/personal/transactions" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">{t.recent.all}<ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            {recent.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t.recent.none}</p> : (
              <ul className="mt-2 divide-y divide-slate-100">
                {recent.map((x, i) => {
                  const { icon: Icon, tone } = styleOf(x.category, x.type);
                  const isIn = x.type === "income";
                  return (
                    <li key={x.plaidTransactionId ?? x.id ?? i} className="flex items-center gap-3 py-2.5">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{x.description}</span>
                        <span className="block truncate text-xs text-slate-500">{txDay(x.transactionDate, locale)} · {labelOf(x.category, x.type)}</span>
                      </span>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${isIn ? "text-emerald-700" : "text-slate-900"}`}>{isIn ? "+" : "−"}{fmt(Number(x.amount), true).replace("−", "")}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AnimatedPage>
  );
}

function Kpi({ label, value, sub, to, icon: Icon, tone }: { label: string; value: string; sub: string; to: string; icon: LucideIcon; tone?: "good" | "bad" }) {
  return (
    <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900"}`}>{value}</p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{sub}</p>
    </Link>
  );
}

const TONES: Record<Tone, string> = { info: "bg-blue-50 text-blue-600", bad: "bg-red-50 text-red-600", warn: "bg-amber-50 text-amber-600", good: "bg-emerald-50 text-emerald-600" };

function Attention({ items, t }: { items: Item[]; t: PersonalHomeCopy }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="ph-attn">
      <h2 id="ph-attn" className="font-semibold text-slate-900">{t.attention.title}</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {items.map((it) => {
          const body = (
            <>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${TONES[it.tone]}`}><it.icon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{it.title}</span>
                <span className="block text-xs text-slate-500">{it.text}</span>
              </span>
              {it.to && <span className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">{t.attention.open}</span>}
            </>
          );
          return (
            <li key={it.title}>
              {it.to ? <Link to={it.to} className="flex items-center gap-3 rounded-lg py-3 hover:bg-slate-50">{body}</Link> : <div className="flex items-center gap-3 py-3">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Shortcuts({ t, lockBudgets }: { t: PersonalHomeCopy; lockBudgets: boolean }) {
  const list: [string, string, LucideIcon, boolean][] = [
    ["/personal/goals", t.shortcuts.goals, Target, false],
    ["/personal/budgets", t.shortcuts.budgets, PiggyBank, lockBudgets],
    ["/personal/subscriptions", t.shortcuts.subscriptions, Tv, false],
    ["/personal/assistant", t.shortcuts.assistant, Sparkles, false],
  ];
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {list.map(([to, label, Icon, locked]) => (
        <Link key={to} to={to} title={locked ? t.locked : undefined}
          className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 sm:px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1 leading-tight">{label}</span>
          {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-label={t.locked} />}
        </Link>
      ))}
    </section>
  );
}
