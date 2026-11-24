import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  AlertTriangle, ArrowRight, CheckCircle2, FileText, Inbox, Landmark, Lock, PiggyBank, ShieldCheck, Sparkles, Target, TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PlaidLinkOverlay } from "@/components/PlaidLinkOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { ReconnectBank } from "@/components/personal/ReconnectBank";
import { TxDetailSheet } from "@/components/personal/TxDetailSheet";
import { TxLogo } from "@/components/personal/TxLogo";
import {
  bankRow, institutionOf, isStreaming, listNames, makeDays, smBtn, useCatLabel, type Institution, type TxRow,
} from "@/components/personal/txKit";
import { localTodayKey, money, num, txDay, upperFirst, type Goal } from "@/components/personal/personalUtils";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalHomeCopy, type PersonalHomeCopy } from "@/i18n/copy/personalHome";
import { DRAFT_STEP } from "@contracts/taxRules";

/** Plaid's quiet sync answers with how many movements it added. */
const added = (d: unknown) => typeof d === "object" && d !== null && "added" in d && Number((d as { added?: unknown }).added) > 0;

type Tone = "bad" | "warn" | "info" | "good";
type Item = { key: string; tone: Tone; icon: LucideIcon; title: string; text: string; action?: { label: string; to?: string; onClick?: () => void } };
type Charge = { key: string; name: string; amount: number; day: string; date: Date; logoUrl: string | null };

const TONE: Record<Tone, string> = { info: "text-blue-600", bad: "text-red-600", warn: "text-amber-700", good: "text-emerald-600" };
const CARD = "rounded-[14px] border border-slate-200 bg-white p-4";

/**
 * 2.0 personal home, as the prototype's pHome: what's left to spend this month, the accounts, cards and month in three
 * numbers, what needs you today, the charges coming in the next two weeks, where the money went (by budget when the
 * plan has budgets), the goals and a tip; on phone, the latest movements. The bank refreshes quietly in the background.
 */
export default function PersonalDashboard() {
  const t = useCopy(personalHomeCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const catLabel = useCatLabel();
  const [connecting, setConnecting] = useState(false);
  const [allToday, setAllToday] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<{ itemId: string; name: string } | null>(null);

  // Today on this device: the month, how many days are left, two weeks ahead and the month's last day.
  const when = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const daysInMonth = new Date(y, m, 0).getDate();
    const clean = (s: string) => s.replace(/\./g, "");
    return {
      year: y,
      month: m,
      daysLeft: daysInMonth - d + 1,
      long: upperFirst(now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })),
      short: upperFirst(`${now.toLocaleDateString(locale, { weekday: "long" })} ${clean(now.toLocaleDateString(locale, { day: "numeric", month: "short" }))}`),
      monthName: now.toLocaleDateString(locale, { month: "long" }),
      end: clean(new Date(y, m - 1, daysInMonth).toLocaleDateString(locale, { day: "numeric", month: "short" })),
      days: makeDays(now),
      in14: localTodayKey(new Date(y, m - 1, d + 14)),
      monthEnd: localTodayKey(new Date(y, m - 1, daysInMonth)),
    };
  }, [locale]);

  const { data: bank } = trpc.bank.checkConnection.useQuery(undefined, { staleTime: 30_000 });
  const hasBank = bank?.hasBank === true;
  const { data: plan } = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const canBudget = plan?.features.includes("budgets") ?? false;
  const overviewQ = trpc.banks.overview.useQuery(undefined, { enabled: hasBank, staleTime: 60_000 });
  const monthQ = trpc.bank.getMonthData.useQuery({ year: when.year, month: when.month }, { enabled: hasBank, staleTime: 60_000, refetchInterval: 2 * 60_000 });
  const { data: budgets } = trpc.personal.listBudgets.useQuery({ year: when.year, month: when.month }, { enabled: hasBank && canBudget, staleTime: 5 * 60_000, retry: false });
  const { data: goals } = trpc.personal.listGoals.useQuery(undefined, { staleTime: 5 * 60_000 });
  const { data: tax } = trpc.tax.reminders.useQuery(undefined, { staleTime: 5 * 60_000 });
  const { data: review } = trpc.review.count.useQuery(undefined, { enabled: hasBank, staleTime: 60_000 });
  const { data: subsData } = trpc.subs.list.useQuery({ today: when.days.today }, { enabled: hasBank, staleTime: 5 * 60_000, retry: false });
  const { data: institutions } = trpc.brand.institutions.useQuery(undefined, { enabled: hasBank, staleTime: 5 * 60_000, retry: false });
  const insts = institutions as Institution[] | undefined;

  // ── Keep the bank fresh, quietly: new transactions and balances on arrival, then the month every 3 minutes ──
  const refreshMonth = () => { void utils.bank.getMonthData.invalidate(); void utils.review.count.invalidate(); };
  const { mutate: syncRecent } = trpc.bank.syncRecent.useMutation({ onSuccess: (d) => { if (added(d)) refreshMonth(); }, onError: () => {} });
  const { mutate: syncMonth } = trpc.bank.syncTransactions.useMutation({ onSuccess: (d) => { if (added(d)) refreshMonth(); }, onError: () => {} });
  const { mutate: refreshBalances } = trpc.bank.refreshAllBalances.useMutation({
    onSuccess: () => { void utils.bank.listAccounts.invalidate(); void utils.banks.overview.invalidate(); },
    onError: () => {},
  });
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
  const reconnect = (inst: Institution) => setReconnecting({ itemId: inst.itemId, name: inst.name });

  // ── Tax items show for everyone (both personal plans include the return) ──
  const taxItems: Item[] = [];
  const redo = tax?.redo ?? 0;
  if (redo > 0) {
    const [a, b] = t.today.taxRedo(redo);
    taxItems.push({ key: "tax-redo", tone: "bad", icon: FileText, title: a, text: b, action: { label: t.today.open, to: "/personal/taxes" } });
  } else if (tax?.allowed && (tax.step ?? DRAFT_STEP) === DRAFT_STEP && tax.needsDocs) {
    taxItems.push({ key: "tax-docs", tone: "info", icon: FileText, title: t.today.taxDocs[0], text: t.today.taxDocs[1], action: { label: t.today.open, to: "/personal/taxes" } });
  }
  const goalList = ((goals ?? []) as Goal[]).filter((g) => g.isActive !== false).slice(0, 3);

  const header = (
    <>
      <header className="mb-4 hidden md:block">
        <h1 className="text-[22px] font-bold tracking-tight text-slate-900">{t.hello(firstName)}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{when.long}</p>
      </header>
      {/* Phone: the prototype's compact greeting (search and the bell already sit in the app's top bar) */}
      <header className="mb-3.5 grid leading-tight md:hidden">
        <h1 className="truncate text-[19px] font-bold tracking-[-0.01em] text-slate-900">{t.hello(firstName)}</h1>
        <span className="text-[12.5px] text-slate-500">{when.short}</span>
      </header>
    </>
  );

  // ── No bank yet: one clear next step, plus the return and the goals ──
  if (bank && !hasBank) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl">
          {header}
          <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-[14px] bg-slate-900 p-6 text-white sm:p-8">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Landmark className="h-6 w-6" aria-hidden="true" /></span>
              <h2 className="mt-5 text-xl font-bold tracking-tight sm:text-2xl">{t.connect.title}</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">{t.connect.text}</p>
              <ul className="mt-5 space-y-2">
                {t.connect.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />{p}</li>
                ))}
              </ul>
              <button type="button" onClick={() => setConnecting(true)} className="mt-6 inline-flex h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                <Landmark className="h-4 w-4" aria-hidden="true" />{t.connect.button}
              </button>
            </section>
            <div className="space-y-3.5">
              <section className={CARD}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                <h2 className="mt-3 text-[15px] font-bold text-slate-900">{t.connect.taxTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.connect.taxText}</p>
                <Link to="/personal/taxes" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">{t.connect.taxButton}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </section>
              {taxItems.length > 0 && <TodayCard items={taxItems} title={t.today.title} more={t.today.more} all={allToday} onAll={() => setAllToday(true)} />}
              <GoalsCard goals={goalList} t={t} />
            </div>
          </div>
        </div>
        {connecting && <PlaidLinkOverlay onClose={() => setConnecting(false)} />}
      </AnimatedPage>
    );
  }

  // ── Connected ──
  const loading = !bank || (hasBank && (monthQ.isLoading || overviewQ.isLoading));
  const accounts = overviewQ.data?.accounts ?? [];
  const cashAccounts = accounts.filter((a) => a.kind === "cash");
  const debtAccounts = accounts.filter((a) => a.kind !== "cash");
  const cash = cashAccounts.reduce((s, a) => s + a.balance, 0);
  // Money for spending: the checking accounts (savings stay out), like the prototype's "Chase ••4410"; all of them if every one is savings.
  const checking = cashAccounts.filter((a) => !/sav|ahorro/i.test(a.name));
  const spendFrom = checking.length > 0 ? checking : cashAccounts;
  const spendable = spendFrom.reduce((s, a) => s + a.balance, 0);
  const owed = debtAccounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const rows: TxRow[] = ((monthQ.data?.transactions ?? []) as Parameters<typeof bankRow>[0][]).map(bankRow);
  // Paying a credit card moves money between your own accounts: neither money in nor spending (owner, 2026-11-24).
  const cardIn = rows.reduce((t, r) => t + (r.category === "card_payment" && r.isIn ? r.amount : 0), 0);
  const cardOut = rows.reduce((t, r) => t + (r.category === "card_payment" && !r.isIn ? r.amount : 0), 0);
  const income = Math.max(0, num(monthQ.data?.income) - cardIn);
  const expense = Math.max(0, num(monthQ.data?.expense) - cardOut);
  const kept = income - expense;

  // Charges that repeat: the same detector as Suscripciones (real weekly/monthly/yearly intervals, no gas stations),
  // only the active ones, each on its real next charge date.
  const charges: Charge[] = (subsData?.items ?? []).filter((s) => s.status === "on").flatMap((s) => {
    const day = s.next;
    if (!day || day < when.days.today) return [];
    return [{ key: `${s.key}-${day}`, name: s.name, amount: num(s.amount), day, date: new Date(`${day}T12:00:00`), logoUrl: s.logoUrl ?? null }];
  }).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : b.amount - a.amount));
  // "Te quedarían": what the accounts would hold after each charge, in order.
  const ahead = charges.filter((c) => c.day <= when.in14).map((c, i, list) => ({ ...c, after: spendable - list.slice(0, i + 1).reduce((s, x) => s + x.amount, 0) }));
  /** A charge's logo: Plaid's, from this month's movement with the same merchant (subscriptions don't carry one). */
  const logoOf = (name: string) => rows.find((r) => r.logoUrl && r.name.toLowerCase() === name.toLowerCase())?.logoUrl ?? null;
  const dueThisMonth = charges.filter((c) => c.day <= when.monthEnd);
  const dueSum = dueThisMonth.reduce((s, c) => s + c.amount, 0);

  // What's left to spend: by budget when there are budgets; otherwise what's in the accounts minus the fixed charges still to come.
  const budgetMode = canBudget && !!budgets && budgets.totals.count > 0;
  const budgetTotal = budgets?.totals.limit ?? 0;
  const budgetSpent = budgets?.totals.spent ?? 0;
  const left = budgetMode ? budgetTotal - budgetSpent : spendable - dueSum;
  const perDay = left > 0 ? money(left / Math.max(1, when.daysLeft)) : null;

  // ── Para hoy ──
  const items: Item[] = [];
  for (const inst of insts ?? []) {
    if (inst.status !== "needs_reconnect") continue;
    const [a, b] = t.today.reconnect(inst.name);
    items.push({ key: `rc-${inst.itemId}`, tone: "warn", icon: Landmark, title: a, text: b, action: { label: t.today.reconnectBtn, onClick: () => reconnect(inst) } });
  }
  if ((review?.count ?? 0) > 0) {
    const [a, b] = t.today.review(review?.count ?? 0);
    items.push({ key: "review", tone: "info", icon: Inbox, title: a, text: b, action: { label: t.today.reviewBtn, to: "/personal/transactions" } });
  }
  for (const b of budgets?.items ?? []) {
    if (b.limit === null) continue;
    const to = `/personal/transactions?cat=${encodeURIComponent(b.category)}`;
    if (b.status === "over") {
      const [a, c] = t.today.over(catLabel(b.category, "expense"), money(Math.abs(b.remaining ?? 0)), money(b.spent), money(b.limit));
      items.push({ key: `over-${b.category}`, tone: "bad", icon: TrendingUp, title: a, text: c, action: { label: t.today.see, to } });
    } else if (b.status === "near") {
      const [a, c] = t.today.near(catLabel(b.category, "expense"), b.percent ?? 0, money(b.spent), money(b.limit));
      items.push({ key: `near-${b.category}`, tone: "warn", icon: AlertTriangle, title: a, text: c, action: { label: t.today.see, to } });
    }
  }
  items.push(...taxItems);
  if (canBudget && budgets && budgets.totals.count === 0 && rows.some((r) => !r.isIn)) {
    items.push({ key: "nobudget", tone: "info", icon: PiggyBank, title: t.today.noBudgets[0], text: t.today.noBudgets[1], action: { label: t.today.open, to: "/personal/budgets" } });
  }
  if (items.length === 0) items.push({ key: "ok", tone: "good", icon: CheckCircle2, title: t.today.allGood[0], text: t.today.allGood[1] });

  // ── ¿En qué se fue? ──
  const spend: { cat: string; spent: number; limit: number | null }[] = budgetMode
    ? (budgets?.items ?? []).map((b) => ({ cat: b.category, spent: b.spent, limit: b.limit })).slice(0, 7)
    : (() => {
      const by = new Map<string, number>();
      for (const r of rows) if (!r.isIn && r.category !== "card_payment") by.set(r.category, (by.get(r.category) ?? 0) + r.amount);
      return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, spent]) => ({ cat, spent, limit: null }));
    })();
  const maxSpend = Math.max(1, ...spend.map((s) => s.spent));

  // ── Un consejo ──
  const overOne = budgetMode ? budgets?.items.find((b) => b.status === "over") : undefined;
  const streaming = (subsData?.items ?? []).filter((s) => s.status === "on" && (s.video || isStreaming(s.name)));
  let tip: { text: string; label: string; to: string };
  if (overOne && overOne.limit !== null) tip = { text: t.tip.over(catLabel(overOne.category, "expense"), money(Math.abs(overOne.remaining ?? 0)), when.daysLeft), label: t.tip.overBtn, to: "/personal/budgets" };
  else if (streaming.length > 1) {
    const monthly = streaming.reduce((s, x) => s + num(x.perMonth), 0);
    const yearly = Math.max(...streaming.map((x) => num(x.perMonth))) * 12;
    tip = { text: t.tip.streaming(listNames(streaming.map((s) => upperFirst(s.name)), t.and), money(monthly, true), money(yearly, true)), label: t.tip.streamingBtn, to: "/personal/subscriptions" };
  } else if (kept < 0) tip = { text: t.tip.negative(money(-kept, true)), label: t.tip.negativeBtn, to: "/personal/transactions" };
  else tip = { text: t.tip.good(when.end), label: t.tip.goodBtn, to: "/personal/goals" };

  const recent = [...rows].map((r, i) => ({ r, i })).sort((a, b) => (a.r.day === b.r.day ? a.i - b.i : a.r.day < b.r.day ? 1 : -1)).slice(0, 4).map((x) => x.r);
  const open = openKey ? rows.find((r) => r.key === openKey) ?? null : null;
  /** An account by its own name, its bank's, or the account's ("Discover ••2231"). */
  const acctShort = (a: { name: string; nickname: string | null; mask: string | null; id: number }) => {
    const inst = institutionOf(insts, a.id);
    const base = a.nickname || inst?.name || a.name;
    return a.mask ? `${base} ••${a.mask}` : base;
  };

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {header}

        {hasBank && monthQ.isError && (
          <p className="mb-3.5 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-red-50 px-3 py-2.5 text-[13px] text-red-700" role="alert">
            {t.loadError}
            <button type="button" onClick={() => void monthQ.refetch()} className={smBtn}>{t.retry}</button>
          </p>
        )}

        {/* Lo que te queda para gastar */}
        {loading ? <Skeleton className="h-[164px] rounded-[14px]" /> : (
          <section className={cn(CARD, "grid gap-1 p-4 md:gap-1.5 md:p-5")} aria-label={left < 0 && budgetMode ? t.hero.overLabel : t.hero.label}>
            <span className="text-[13px] text-slate-500">{left < 0 && budgetMode ? t.hero.overLabel : t.hero.label}</span>
            <p className={cn("text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums md:text-[40px]", left < 0 ? "text-red-600" : "text-slate-900")}>
              {money(budgetMode ? Math.abs(left) : left, true)}
            </p>
            {perDay && (
              <>
                <span className="hidden text-[13px] text-slate-500 md:block">
                  {t.hero.until(when.end)}<b className="text-slate-900">{t.hero.perDay(perDay)}</b>{budgetMode ? t.hero.budgetNote : t.hero.balanceNote(dueThisMonth.length, money(dueSum, true))}
                </span>
                <span className="text-[13px] text-slate-500 md:hidden">
                  {t.hero.approx}<b className="text-slate-900">{t.hero.perDay(perDay)}</b>{t.hero.daysLeft(when.daysLeft)}{budgetMode ? "" : t.hero.balanceNotePhone(dueThisMonth.length)}
                </span>
              </>
            )}
            {budgetMode ? (
              <>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t.hero.spentOf(money(budgetSpent), money(budgetTotal), when.monthName)}>
                  <div className={cn("h-full rounded-full", left < 0 ? "bg-red-600" : "bg-emerald-600")} style={{ width: `${Math.min(100, budgetTotal > 0 ? (budgetSpent / budgetTotal) * 100 : 0)}%` }} />
                </div>
                <span className="text-[13px] text-slate-500">{t.hero.spentOf(money(budgetSpent), money(budgetTotal), when.monthName)}</span>
              </>
            ) : (
              <span className="text-[13px] text-slate-500">
                {t.hero.monthFlow(when.monthName, money(income), money(expense))}
                {canBudget && <> · <Link to="/personal/budgets" className="font-semibold text-blue-600 hover:underline">{t.hero.setBudgets}</Link></>}
              </span>
            )}
          </section>
        )}

        {/* Tres números: cuentas, tarjetas y el mes */}
        <div className="-mx-4 mt-3.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1.5 md:mx-0 md:grid md:grid-cols-3 md:gap-3.5 md:overflow-visible md:px-0 md:pb-0"
          style={{ scrollbarWidth: "none" }}>
          <Kpi loading={loading} label={t.kpi.accounts} value={money(cash)} sub={t.kpi.accountsSub(cashAccounts.length)} />
          <Kpi loading={loading} label={t.kpi.cards} value={money(owed, true)}
            sub={debtAccounts.length === 0 ? t.kpi.cardsNone : owed === 0 ? t.kpi.cardsPaid : debtAccounts.length === 1 ? acctShort(debtAccounts[0]) : t.kpi.cardsMany(debtAccounts.length)}
            tone={debtAccounts.length === 0 ? undefined : owed > 0 ? "bad" : "good"} />
          {kept >= 0
            ? <Kpi loading={loading} label={t.kpi.kept(when.monthName)} value={money(kept)} sub={t.kpi.keptSub(money(income), money(expense))} />
            : <Kpi loading={loading} label={t.kpi.over(when.monthName)} value={money(-kept)} sub={t.kpi.overSub} tone="bad" />}
        </div>

        <div className="mt-3.5 grid items-start gap-3.5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <TodayCard items={items} title={t.today.title} more={t.today.more} all={allToday} onAll={() => setAllToday(true)} />

          {/* Phone: the latest movements */}
          <section className={cn(CARD, "md:hidden")} aria-labelledby="ph-recent">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 id="ph-recent" className="text-[15px] font-bold text-slate-900">{t.recent.title}</h2>
              <Link to="/personal/transactions" className={smBtn}>{t.recent.all}</Link>
            </div>
            {loading ? <Skeleton className="h-40 rounded-xl" /> : recent.length === 0 ? <p className="py-2 text-sm text-slate-500">{t.recent.none}</p> : (
              <ul>
                {recent.map((r) => (
                  <li key={r.key} className="border-t border-slate-200 first:border-t-0">
                    <button type="button" onClick={() => setOpenKey(r.key)} className="grid min-h-[52px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-[9px] text-left">
                      <TxLogo row={r} size={34} />
                      <span className="min-w-0">
                        <b className="block truncate text-sm font-semibold text-slate-900">{r.name}</b>
                        <small className="block truncate text-xs text-slate-500">{catLabel(r.category, r.type)} · {txDay(r.date, locale).replace(/\./g, "")}</small>
                      </span>
                      <span className={cn("text-sm font-bold tabular-nums", r.isIn ? "text-emerald-600" : "text-slate-900")}>{r.isIn ? "+" : "−"}{money(r.amount, true)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Lo que viene */}
          <section className={CARD} aria-labelledby="ph-ahead">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 id="ph-ahead" className="text-[15px] font-bold text-slate-900">{t.ahead.title}</h2>
              <span className="truncate text-xs text-slate-500">{spendFrom.length === 1 ? `${t.ahead.sub} · ${acctShort(spendFrom[0])}` : t.ahead.sub}</span>
            </div>
            {loading ? <Skeleton className="h-40 rounded-xl" /> : ahead.length === 0 ? <p className="py-2 text-sm text-slate-500">{t.ahead.none}</p> : (
              <ul>
                {ahead.map((c) => (
                  <li key={c.key} className="grid grid-cols-[48px_28px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-slate-200 py-[9px] text-sm first:border-t-0">
                    <span className="text-xs text-slate-500">{txDay(c.date, locale).replace(/\./g, "")}</span>
                    <TxLogo row={{ name: c.name, logoUrl: c.logoUrl ?? logoOf(c.name), category: "subscription", type: "expense" }} size={28} />
                    <span className="min-w-0">
                      <b className="block truncate font-semibold capitalize text-slate-900">{c.name}</b>
                      <small className="block truncate text-xs text-slate-500">{t.ahead.left(money(c.after))}</small>
                    </span>
                    <span className="font-bold tabular-nums text-slate-900">−{money(c.amount, true)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-3.5 grid items-start gap-3.5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* ¿En qué se fue? */}
          <section className={CARD} aria-labelledby="ph-spend">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <h2 id="ph-spend" className="text-[15px] font-bold text-slate-900">{t.spending.title}</h2>
              <span className="text-xs text-slate-500">{t.spending.hint}</span>
            </div>
            {loading ? <Skeleton className="h-40 rounded-xl" /> : spend.length === 0 ? <p className="py-2 text-sm text-slate-500">{t.spending.none}</p> : (
              <ul className="grid gap-0.5">
                {spend.map((s) => {
                  const over = s.limit !== null && s.spent > s.limit;
                  const pct = s.limit !== null ? (s.limit > 0 ? (s.spent / s.limit) * 100 : 0) : (s.spent / maxSpend) * 100;
                  return (
                    <li key={s.cat}>
                      <Link to={`/personal/transactions?cat=${encodeURIComponent(s.cat)}`}
                        className="grid grid-cols-[86px_minmax(0,1fr)_104px] items-center gap-2.5 rounded-lg px-1.5 py-[7px] text-[13px] hover:bg-slate-100 sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)_116px] sm:text-sm">
                        <span className="truncate text-slate-900">{catLabel(s.cat, "expense")}</span>
                        <span className="block h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                          <span className={cn("block h-full rounded-full", over ? "bg-red-600" : budgetMode && s.limit === null ? "bg-slate-300" : "bg-blue-600")} style={{ width: `${Math.min(100, Math.max(2, pct)).toFixed(1)}%` }} />
                        </span>
                        <span className={cn("text-right text-[13px] font-semibold tabular-nums", over ? "text-red-600" : "text-slate-900")}>
                          {money(s.spent)}{s.limit !== null && <span className="font-medium text-slate-500"> {t.spending.of(money(s.limit))}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {plan && !canBudget && (
              <Link to="/personal/budgets" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />{t.spending.locked}
              </Link>
            )}
          </section>

          <div className="grid gap-3.5">
            <GoalsCard goals={goalList} t={t} />
            <section className={CARD} aria-labelledby="ph-tip">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id="ph-tip" className="text-[15px] font-bold text-slate-900">{t.tip.title}</h2>
                <Sparkles className="h-[18px] w-[18px] text-slate-900" aria-hidden="true" />
              </div>
              {loading ? <Skeleton className="h-16 rounded-xl" /> : (
                <>
                  <p className="text-sm text-slate-800">{tip.text}</p>
                  <Link to={tip.to} className={cn(smBtn, "mt-3")}>{tip.label}</Link>
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      {open && (
        <TxDetailSheet key={open.key} row={open} onClose={() => setOpenKey(null)} monthRows={rows} accounts={accounts} institutions={insts}
          days={when.days} locale={locale} period={{ y: when.year, m: when.month }} />
      )}
      {reconnecting && <ReconnectBank itemId={reconnecting.itemId} name={reconnecting.name} onDone={() => setReconnecting(null)} />}
      {connecting && <PlaidLinkOverlay onClose={() => setConnecting(false)} />}
    </AnimatedPage>
  );
}

function Kpi({ label, value, sub, tone, loading }: { label: string; value: string; sub: string; tone?: "good" | "bad"; loading?: boolean }) {
  return (
    <div className="w-[64%] shrink-0 snap-start rounded-[14px] border border-slate-200 bg-white px-3.5 py-3 md:w-auto md:px-4 md:py-3.5">
      <p className="truncate text-[13px] text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-1.5 h-7 w-28 rounded-md" /> : <p className="mt-0.5 truncate text-xl font-bold tabular-nums tracking-tight text-slate-900 md:text-[23px]">{value}</p>}
      <p className={cn("mt-0.5 truncate text-xs", tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-500")}>{sub}</p>
    </div>
  );
}

/** "Para hoy": what needs you, each with its one action; on phone the first three, then "Ver N más". */
function TodayCard({ items, title, more, all, onAll }: { items: Item[]; title: string; more: (n: number) => string; all: boolean; onAll: () => void }) {
  return (
    <section className={CARD} aria-labelledby="ph-today">
      <h2 id="ph-today" className="text-[15px] font-bold text-slate-900">{title}</h2>
      <ul className="mt-2.5 grid gap-2">
        {items.map((it, i) => {
          let action: ReactNode = <span />;
          if (it.action?.to) action = <Link to={it.action.to} className={smBtn}>{it.action.label}</Link>;
          else if (it.action?.onClick) action = <button type="button" onClick={it.action.onClick} className={smBtn}>{it.action.label}</button>;
          return (
            <li key={it.key} className={cn("grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl bg-slate-100 px-3 py-2.5 md:gap-3 md:py-[11px]", i >= 3 && !all ? "hidden md:grid" : "grid")}>
              <it.icon className={cn("h-5 w-5", TONE[it.tone])} aria-hidden="true" />
              <div className="min-w-0">
                <b className="block text-sm font-semibold text-slate-900">{it.title}</b>
                <span className="block text-xs text-slate-500">{it.text}</span>
              </div>
              {action}
            </li>
          );
        })}
        {items.length > 3 && !all && (
          <li className="px-0.5 pt-1 md:hidden">
            <button type="button" onClick={onAll} className="min-h-10 text-sm font-semibold text-blue-600 hover:underline">{more(items.length - 3)}</button>
          </li>
        )}
      </ul>
    </section>
  );
}

function GoalsCard({ goals, t }: { goals: Goal[]; t: PersonalHomeCopy }) {
  return (
    <section className={CARD} aria-labelledby="ph-goals">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ph-goals" className="text-[15px] font-bold text-slate-900">{t.goals.title}</h2>
        <Link to="/personal/goals" className={smBtn}>{t.goals.all}</Link>
      </div>
      {goals.length === 0 ? (
        <div className="mt-3 rounded-xl bg-slate-100 p-3.5 text-sm text-slate-600">
          <p>{t.goals.none}</p>
          <Link to="/personal/goals" className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"><Target className="h-4 w-4" aria-hidden="true" />{t.goals.create}</Link>
        </div>
      ) : goals.map((g) => {
        const target = num(g.targetAmount);
        const saved = num(g.currentAmount);
        const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
        return (
          <div key={g.id} className="mt-2.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <b className="truncate font-semibold text-slate-900">{g.name}</b>
              <span className="shrink-0 tabular-nums text-slate-500">{t.goals.progress(money(saved), money(target))}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${pct}%`}>
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(1, pct)}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
