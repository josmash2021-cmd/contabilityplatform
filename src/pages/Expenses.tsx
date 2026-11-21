// Gastos (the 2.0 prototype's "expenses" screen): everything the business spends in one list — cash expenses,
// receipt photos, paid vendor bills and the business money that left the bank — each counted once (the rule is in
// api/lib/expenses.ts). Recibos lives here now: "Foto de recibo" (read by Claude on the server when it can),
// "Subir recibo" on any row, and /receipts redirects here with the photo flow open.
// Links: /expenses?new=1 opens "Gasto en efectivo", /expenses?photo=1 the receipt photo (the "+ Nuevo" menu).
// Team (api/lib/team.ts): employees see only the photo and the month's receipts; the accountant reads; the owner does the rest.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertCircle, Camera, Info, Landmark, Loader2, Lock, Wallet, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { expensesCopy, spendCategoryLabel } from "@/i18n/copy/expenses";
import { ReceiptViewer, type ReceiptItem } from "@/components/receipts/ReceiptViewer";
import { ReceiptFormDialog } from "@/components/receipts/ReceiptFormDialog";
import { CategoryCard, LimitsCard, ReadyCard } from "@/components/expenses/TopCards";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { ExpenseDetailDialog } from "@/components/expenses/ExpenseDetailDialog";
import { LimitsDialog } from "@/components/expenses/LimitsDialog";
import { StaffView } from "@/components/expenses/StaffView";
import { useExpenseFlows } from "@/components/expenses/useExpenseFlows";
import { CARD, btn, fmtMoney } from "@/components/expenses/ui";
import { MonthNav, Note, PageHead, SegTabs } from "@/components/expenses/proto";
import { localToday, monthName, serverText, upperFirst, type SpendRow } from "@/components/expenses/shared";
import { pctChange, type SpendCategory } from "../../api/lib/expenses";

type Tab = "all" | "norec" | "rec";
type YM = { year: number; month: number };

const sameMonth = (a: YM, b: YM) => a.year === b.year && a.month === b.month;
const shift = (m: YM, d: number): YM => {
  const i = m.year * 12 + m.month - 1 + d;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};
const forbidden = (e: { data?: { code?: string } | null } | null | undefined) => e?.data?.code === "FORBIDDEN";
const retry = (n: number, e: { data?: { code?: string } | null }) => !forbidden(e) && n < 1;

export default function Expenses() {
  const t = useCopy(expensesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();
  const [today] = useState(localToday);
  const thisMonth: YM = useMemo(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }), [today]);
  const [month, setMonth] = useState<YM>(thisMonth);
  const [tab, setTab] = useState<Tab>("all");
  const [cat, setCat] = useState<SpendCategory | null>(null);
  const [detail, setDetail] = useState<SpendRow | null>(null);
  const [viewing, setViewing] = useState<ReceiptItem | null>(null);
  const [editing, setEditing] = useState<ReceiptItem | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);

  // ── Who is looking (the server enforces it too) ──
  const membership = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const known = membership.isFetched;
  const role = membership.data?.role ?? null;
  const isStaff = role === "staff";
  const canChange = known && !role; // the owner; the accountant only reads

  const usage = trpc.receipts.usage.useQuery(undefined, { enabled: known, staleTime: 60_000, retry });
  const locked = forbidden(usage.error);
  const overview = trpc.expenses.overview.useQuery(
    { ...month, today },
    { enabled: known && !isStaff && !locked, placeholderData: keepPreviousData, retry },
  );
  const lockedAll = locked || forbidden(overview.error);

  const u = usage.data;
  const quota = u && u.cap !== null ? { used: Math.min(u.used, u.cap), cap: u.cap } : null;
  const canUpload = !!u?.canUpload && !role;
  const flows = useExpenseFlows({
    today,
    canRead: canChange && !!u?.reading,
    canAddPhoto: canUpload,
    photoBlocked: u && !u.canUpload ? t.form.photoCap : null,
    quota,
    onSaved: (date) => setMonth({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }),
  });

  // ── "+ Nuevo" links: ?new=1 (cash expense) and ?photo=1 (receipt photo); the param is cleared once opened ──
  const [searchParams, setSearchParams] = useSearchParams();
  const ask = searchParams.get("new") === "1" ? "new" : searchParams.get("photo") === "1" ? "photo" : null;
  const [handled, setHandled] = useState<string | null>(null);
  if (ask && handled !== ask && known && (isStaff || canChange || role === "accountant")) {
    setHandled(ask);
    if (ask === "new" && canChange) flows.openCash();
    else if (!role || isStaff) flows.askPhoto();
  }
  if (!ask && handled !== null) setHandled(null);
  useEffect(() => {
    if (!ask || handled !== ask) return;
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.delete("new");
      next.delete("photo");
      return next;
    }, { replace: true });
  }, [ask, handled, setSearchParams]);

  // ── Receipts: view, edit, delete (the owner) ──
  const update = trpc.receipts.update.useMutation({
    onSuccess: () => { toast.success(t.toasts.attached); setEditing(null); void utils.expenses.overview.invalidate(); void utils.receipts.invalidate(); },
    onError: (e) => toast.error(serverText(t, e)),
  });
  const remove = trpc.receipts.remove.useMutation({
    onSuccess: () => { setViewing(null); void utils.expenses.overview.invalidate(); void utils.receipts.invalidate(); },
    onError: (e) => toast.error(serverText(t, e)),
  });

  const ov = overview.data;
  const items = useMemo(() => ov?.items ?? [], [ov]);
  const filtered = useMemo(() => (cat ? items.filter((i) => i.category === cat) : items), [items, cat]);
  const noRec = filtered.filter((i) => !i.hasReceipt);
  const recur = filtered.filter((i) => i.nextCharge);
  const list = tab === "norec" ? noRec : tab === "rec" ? recur : filtered;
  const isCurrent = sameMonth(month, thisMonth);
  const upload = (i: SpendRow) => flows.startAttach({ key: i.key, ...(i.expenseId ? { expenseId: i.expenseId } : { bankTransactionId: i.bankTransactionId ?? undefined }) });
  const goMonth = (m: YM) => { setMonth(m); setCat(null); };

  if (lockedAll && !isStaff) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <section className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Lock className="h-6 w-6" aria-hidden="true" /></span>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{t.locked.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{t.locked.text}</p>
          {!role && <Link to="/settings?sec=plan" className={btn("primary", "mt-6 w-full")}>{t.locked.cta}</Link>}
        </section>
      </AnimatedPage>
    );
  }

  const monthLabel = monthName(month.year, month.month, locale);
  const prevLabel = monthName(shift(month, -1).year, shift(month, -1).month, locale);
  const pct = ov ? pctChange(ov.total, ov.previous.total) : null;
  const sub = !ov ? <Skeleton className="mt-1 h-4 w-72 max-w-full" /> : ov.count === 0 ? t.sub.none(monthLabel) : (() => {
    const [a, amount, b] = t.sub.spent(fmtMoney(ov.total), monthLabel);
    const cmp = pct === null ? "" : pct < 0 ? t.sub.less(-pct, prevLabel, ov.previous.partial) : pct > 0 ? t.sub.more(pct, prevLabel, ov.previous.partial) : t.sub.same(prevLabel, ov.previous.partial);
    return <>{a}<b className="font-semibold tabular-nums text-slate-900">{amount}</b>{b}{cmp}</>;
  })();

  const actions = canChange ? (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      {quota && <span className="w-full text-[13px] text-slate-500 sm:w-auto">{t.quota(quota.used, quota.cap)}</span>}
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <button type="button" className={btn()} onClick={flows.openCash}>
          <Wallet className="h-4 w-4" aria-hidden="true" />{t.actions.cash}
        </button>
        <button type="button" className={btn("primary")} onClick={flows.openPhoto} disabled={flows.busy || (u ? !u.canUpload : false)}>
          {flows.busy && !flows.attaching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}{t.actions.photo}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {isStaff ? (
          <StaffView
            month={month} thisMonth={thisMonth} locale={locale} usage={u} busy={flows.busy}
            onPhoto={flows.openPhoto} onMonth={setMonth}
          />
        ) : (
          <>
            <PageHead title={t.title} sub={sub} right={actions} />
            {role === "accountant" && (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />{t.readOnly}
              </p>
            )}

            {overview.isError && !ov ? (
              <section className={`${CARD} flex flex-wrap items-center justify-between gap-3 border-red-200`}>
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900" role="alert"><AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />{t.error}</p>
                <button type="button" className={btn("sm")} onClick={() => void overview.refetch()}>{t.retry}</button>
              </section>
            ) : !ov ? (
              <div className="grid gap-3.5" role="status" aria-label={t.loading}>
                <div className="grid items-start gap-3.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <Skeleton className="h-72 rounded-[14px]" />
                  <div className="grid gap-3"><Skeleton className="h-28 rounded-[14px]" /><Skeleton className="h-40 rounded-[14px]" /></div>
                </div>
                <Skeleton className="h-80 rounded-[14px]" />
              </div>
            ) : (
              <div className={overview.isPlaceholderData ? "opacity-60 transition-opacity" : undefined} aria-busy={overview.isFetching}>
                {/* .ex-top */}
                <div className="mb-1 grid items-start gap-3.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <CategoryCard rows={ov.byCategory} selected={cat} onSelect={(c) => { setCat(c); setTab("all"); }} />
                  <div className="grid gap-3">
                    <ReadyCard withReceipt={ov.withReceipt} count={ov.count} />
                    <LimitsCard limits={ov.limits} canChange={canChange} onEdit={() => setLimitsOpen(true)} />
                  </div>
                </div>

                <SegTabs<Tab>
                  label={t.tabs.label}
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: "all", label: t.tabs.all, count: filtered.length },
                    { value: "norec", label: t.tabs.norec, count: noRec.length },
                    { value: "rec", label: t.tabs.rec, count: recur.length },
                  ]}
                  right={(
                    <MonthNav
                      groupLabel={t.month.label} label={upperFirst(monthName(month.year, month.month, locale, true))}
                      prevLabel={t.month.prev} nextLabel={t.month.next} currentLabel={t.month.current}
                      canPrev={month.year > 2000} canNext={!isCurrent} isCurrent={isCurrent}
                      onPrev={() => goMonth(shift(month, -1))} onNext={() => goMonth(shift(month, 1))} onCurrent={() => goMonth(thisMonth)}
                    />
                  )}
                />

                {cat && (
                  <div className="mb-1 mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold text-slate-900">{t.filter.showing(spendCategoryLabel(t, cat))}</span>
                    <button type="button" className={btn("ghost", "sm", "text-blue-700")} onClick={() => setCat(null)}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" />{t.filter.clear}
                    </button>
                  </div>
                )}

                <div className="mt-2.5">
                  <ExpenseList
                    items={list}
                    locale={locale}
                    showNext={tab === "rec"}
                    emptyText={ov.count === 0 && !cat && tab === "all" ? t.empty.month : t.empty.tab}
                    canUpload={canUpload}
                    attaching={flows.attaching}
                    onOpen={setDetail}
                    onUpload={upload}
                  />
                </div>

                {!ov.bankConnected && canChange && (
                  <Note icon={Landmark} className="mt-3">
                    {t.empty.noBank}{" "}
                    <Link to="/bank" className="font-semibold text-blue-700 underline underline-offset-2">{t.empty.connect}</Link>
                  </Note>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {flows.elements}
      {detail && (
        <ExpenseDetailDialog
          key={detail.key} item={detail} locale={locale} canChange={canChange} canUpload={canUpload} hasVendors={!!ov?.hasVendors}
          onClose={() => setDetail(null)} onUpload={upload}
          onOpenReceipt={(r) => { setDetail(null); setViewing(r); }}
        />
      )}
      {limitsOpen && ov && <LimitsDialog overview={ov} onClose={() => setLimitsOpen(false)} />}
      {viewing && (
        <ReceiptViewer
          key={viewing.id} receipt={viewing} canChange={canChange} deleting={remove.isPending}
          onClose={() => setViewing(null)}
          onEdit={(r) => { setViewing(null); setEditing(r); }}
          onDelete={(r) => remove.mutate({ id: r.id })}
        />
      )}
      {editing && (
        <ReceiptFormDialog
          key={editing.id} mode="edit"
          initial={{ merchant: editing.merchant, amount: editing.amount, date: editing.date, category: editing.category, paymentMethod: editing.paymentMethod, notes: editing.notes }}
          maxDate={editing.date > today ? editing.date : today}
          saving={update.isPending}
          onSave={(v) => update.mutate({ id: editing.id, ...v, notes: v.notes || undefined })}
          onClose={() => setEditing(null)}
        />
      )}
    </AnimatedPage>
  );
}
