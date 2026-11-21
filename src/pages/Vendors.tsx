// Proveedores (the 2.0 prototype's "vendors" screen, business Pro and Negocio): what you owe in total, this week
// and overdue; your week of payments; the bills (to pay, overdue, paid) and the vendors, each with its own page
// (/vendors?v=<id>). Paying a bill records the expense (server: api/vendors-router.ts), which Gastos shows once.
// Team (api/lib/team.ts): employees don't reach this page; the accountant only reads.
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertCircle, Info, Lock, Upload } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { BillRow } from "@/components/vendors/BillRow";
import { BillFormDialog } from "@/components/vendors/BillFormDialog";
import { ConfirmDialog } from "@/components/vendors/ConfirmDialog";
import { PayBillDialog } from "@/components/vendors/PayBillDialog";
import { PaymentWeek } from "@/components/vendors/PaymentWeek";
import { VendorDetailView } from "@/components/vendors/VendorDetailView";
import { VendorFormDialog } from "@/components/vendors/VendorFormDialog";
import { errorText, localToday, type BillItem, type VendorItem } from "@/components/vendors/shared";
import { BILL_GRID, VEND_GRID } from "@/components/vendors/ui";
import { CARD, btn, fmt0, fmtMoney } from "@/components/expenses/ui";
import { Kpi, PageHead, SegTabs } from "@/components/expenses/proto";
import { paymentWeek } from "../../api/lib/expenses";

type Tab = "open" | "late" | "paid" | "vendors";
const PAID_PAGE = 50;
let formSeq = 0;
const nextFormKey = () => ++formSeq;

function ListSkeleton() {
  const c = useCopy(vendorsCopy);
  return <div className="grid gap-2 p-3" role="status" aria-label={c.loading}>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>;
}

export default function Vendors() {
  const c = useCopy(vendorsCopy);
  const p = c.proto;
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [today] = useState(localToday);
  const [tab, setTab] = useState<Tab>("open");
  const [paidLimit, setPaidLimit] = useState(PAID_PAGE);
  const [showArchived, setShowArchived] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewId = Number(searchParams.get("v")) || null;
  const openVendor = (id: number | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("v", String(id)); else next.delete("v");
      return next;
    });
    document.querySelector("main")?.scrollTo({ top: 0 });
  };

  // Dialogs
  const [billForm, setBillForm] = useState<{ bill?: BillItem; vendorId?: number; key: number } | null>(null);
  const [payBill, setPayBill] = useState<BillItem | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "unpay"; bill: BillItem } | null>(null);
  const [vendorForm, setVendorForm] = useState<{ vendor?: VendorItem } | null>(null);
  const [archiveAsk, setArchiveAsk] = useState<VendorItem | null>(null);

  const plan = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const planLacks = plan.data ? !plan.data.features.includes("vendors") : false;
  // The accountant reads the books but changes nothing (the server refuses it too).
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canChange = membership?.role !== "accountant";
  const opts = { enabled: !planLacks, staleTime: 60_000, retry: (n: number, err: { data?: { code?: string } | null }) => err.data?.code !== "FORBIDDEN" && n < 1 };

  const summary = trpc.vendors.bills.summary.useQuery({ today }, opts);
  const unpaid = trpc.vendors.bills.list.useQuery({ filter: "unpaid", today, limit: 500 }, { ...opts, placeholderData: keepPreviousData });
  const paid = trpc.vendors.bills.list.useQuery(
    { filter: "paid", today, limit: paidLimit },
    { ...opts, enabled: opts.enabled && tab === "paid", placeholderData: keepPreviousData },
  );
  const vendorList = trpc.vendors.list.useQuery({ today, includeArchived: showArchived || viewId !== null }, { ...opts, placeholderData: keepPreviousData });
  // "Subir factura" reads the bill when the server can (receipts.usage says so; Pro and Negocio include Recibos).
  const reading = trpc.receipts.usage.useQuery(undefined, { ...opts, enabled: opts.enabled && canChange, retry: false });
  const canRead = canChange && !!reading.data?.reading;
  const locked = planLacks || summary.error?.data?.code === "FORBIDDEN" || vendorList.error?.data?.code === "FORBIDDEN";

  const refresh = () => void utils.vendors.invalidate();
  const onError = (e: unknown) => toast.error(errorText(e, c.error));
  const delBill = trpc.vendors.bills.delete.useMutation({
    onSuccess: () => { toast.success(c.deleteBill.done); setConfirm(null); refresh(); },
    onError,
  });
  const unpay = trpc.vendors.bills.markUnpaid.useMutation({
    onSuccess: (r) => { toast.success(r.removedExpense ? c.unpay.done : c.unpay.doneNoExpense); setConfirm(null); refresh(); void utils.expenses.overview.invalidate(); },
    onError,
  });
  const archive = trpc.vendors.archive.useMutation({
    onSuccess: (r) => { toast.success(r.archived ? c.vendorDetail.archived : c.vendorDetail.unarchived); setArchiveAsk(null); refresh(); },
    onError,
  });
  const busy = delBill.isPending || unpay.isPending || archive.isPending;

  const open = useMemo(() => (unpaid.data?.items ?? []).filter((b) => (b.daysUntilDue ?? 0) >= 0), [unpaid.data]);
  const late = useMemo(() => (unpaid.data?.items ?? []).filter((b) => (b.daysUntilDue ?? 0) < 0), [unpaid.data]);
  const week = useMemo(() => paymentWeek(open, today), [open, today]);

  if (locked) {
    // The plan includes it but the server still says no: a team member whose role doesn't cover it.
    const teamBlocked = !!plan.data && !planLacks;
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <section className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Lock className="h-6 w-6" aria-hidden="true" /></span>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{teamBlocked ? c.noAccess.title : c.locked.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{teamBlocked ? c.noAccess.text : c.locked.text}</p>
          {!teamBlocked && <button type="button" className={btn("primary", "mt-6 w-full")} onClick={() => navigate("/settings?sec=plan")}>{c.locked.cta}</button>}
        </section>
      </AnimatedPage>
    );
  }

  const vendors = vendorList.data ?? [];
  const activeVendors = vendors.filter((v) => !v.archived);
  const listedVendors = showArchived ? vendors : activeVendors;
  const viewing = viewId !== null ? vendors.find((v) => v.id === viewId) ?? null : null;
  const s = summary.data;
  const uploadLabel = canRead ? p.uploadBill : p.newBill;

  const openNewBill = (vendorId?: number) => setBillForm({ vendorId, key: nextFormKey() });
  const billHandlers = {
    onPay: (b: BillItem) => setPayBill(b),
    onEdit: (b: BillItem) => setBillForm({ bill: b, key: nextFormKey() }),
    onDelete: (b: BillItem) => setConfirm({ kind: "delete", bill: b }),
    onUnpay: (b: BillItem) => setConfirm({ kind: "unpay", bill: b }),
  };
  const weekTotal = week.reduce((a, d) => a + d.totalCents, 0) / 100;
  const weekVendors = [...new Set(week.flatMap((d) => d.vendors))];

  const billTable = (list: readonly BillItem[] | undefined, loading: boolean, error: boolean, retry: () => void) => (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
      <div className={cn(BILL_GRID, "hidden bg-slate-100 px-4 py-[9px] text-xs font-semibold text-slate-500 md:grid")} aria-hidden="true">
        <span>{p.head.vendor}</span><span>{p.head.due}</span><span className="text-right">{p.head.amount}</span><span>{p.head.status}</span><span />
      </div>
      {loading ? <ListSkeleton /> : error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3 md:border-t">
          <p className="flex items-center gap-2 text-sm text-slate-700" role="alert"><AlertCircle className="h-4 w-4 text-red-600" aria-hidden="true" />{c.loadError}</p>
          <button type="button" className={btn("sm")} onClick={retry}>{c.retry}</button>
        </div>
      ) : !list || list.length === 0 ? (
        <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500 first:border-t-0 md:first:border-t">{p.nothing}</p>
      ) : (
        <ul>{list.map((b) => <BillRow key={b.id} bill={b} today={today} busy={busy} canChange={canChange} onVendor={(id) => openVendor(id)} {...billHandlers} />)}</ul>
      )}
    </div>
  );

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {viewId !== null ? (
          viewing ? (
            <VendorDetailView
              vendor={viewing} today={today} busy={busy} canChange={canChange} uploadLabel={p.detail.upload}
              onBack={() => openVendor(null)}
              onNewBill={(id) => openNewBill(id)}
              onEdit={(v) => setVendorForm({ vendor: v })}
              onArchive={(v) => setArchiveAsk(v)}
              onRestore={(v) => archive.mutate({ id: v.id, archived: false })}
              onPay={billHandlers.onPay} onEditBill={billHandlers.onEdit} onDeleteBill={billHandlers.onDelete} onUnpay={billHandlers.onUnpay}
            />
          ) : vendorList.isLoading ? (
            <div className="grid gap-3" role="status" aria-label={c.loading}><Skeleton className="h-10 w-64" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
          ) : (
            <section className={cn(CARD, "text-center")}>
              <p className="text-sm text-slate-600">{p.detail.notFound}</p>
              <button type="button" className={btn("sm", "mt-3")} onClick={() => openVendor(null)}>{p.back}</button>
            </section>
          )
        ) : (
          <>
            <PageHead
              title={c.title}
              sub={p.sub}
              right={canChange ? (
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <button type="button" className={btn()} onClick={() => setVendorForm({})}>{p.addVendor}</button>
                  <button type="button" className={btn("primary")} onClick={() => openNewBill()}>
                    <Upload className="h-4 w-4" aria-hidden="true" />{uploadLabel}
                  </button>
                </div>
              ) : null}
            />
            {!canChange && (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />{c.ui.readOnly}
              </p>
            )}

            {/* .three */}
            {summary.isError && !s ? (
              <section className={cn(CARD, "flex flex-wrap items-center justify-between gap-3 border-red-200")}>
                <p className="flex items-center gap-2 text-sm text-slate-900" role="alert"><AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />{c.loadError}</p>
                <button type="button" className={btn("sm")} onClick={() => void summary.refetch()}>{c.retry}</button>
              </section>
            ) : !s || unpaid.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="status" aria-label={c.loading}>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px] rounded-[14px]" />)}</div>
            ) : (
              <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={c.summary.label}>
                <Kpi label={p.kpi.owe} value={fmtMoney(s.unpaidTotal)} sub={p.kpi.oweSub(s.unpaidCount)} />
                <Kpi label={p.kpi.week} value={fmtMoney(weekTotal)} sub={weekVendors.length ? weekVendors.join(", ") : p.kpi.weekNone} />
                <Kpi label={p.kpi.late} value={fmtMoney(s.overdueTotal)} sub={s.overdueCount ? p.kpi.lateSub(s.overdueCount) : p.kpi.lateNone} tone={s.overdueCount ? "bad" : "good"} />
              </section>
            )}

            {unpaid.data && <PaymentWeek days={week} />}

            <SegTabs<Tab>
              label={c.tabs.label}
              value={tab}
              onChange={setTab}
              items={[
                { value: "open", label: p.tabs.open, count: unpaid.data ? open.length : null },
                { value: "late", label: p.tabs.late, count: unpaid.data ? late.length : null },
                { value: "paid", label: p.tabs.paid, count: s ? s.paidCount : null },
                { value: "vendors", label: p.tabs.vendors, count: vendorList.data ? activeVendors.length : null },
              ]}
              right={tab === "vendors" ? (
                <button type="button" className={btn("ghost", "sm", "mb-1.5 text-blue-700")} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? c.vendors.hideArchived : c.vendors.showArchived}
                </button>
              ) : undefined}
            />

            <div className="mt-2.5">
              {tab === "open" && billTable(open, unpaid.isLoading, unpaid.isError, () => void unpaid.refetch())}
              {tab === "late" && billTable(late, unpaid.isLoading, unpaid.isError, () => void unpaid.refetch())}
              {tab === "paid" && (
                <>
                  {billTable(paid.data?.items, paid.isLoading, paid.isError, () => void paid.refetch())}
                  {paid.data?.hasMore && (
                    <div className="mt-3 flex justify-center">
                      <button type="button" className={btn("w-full sm:w-auto")} disabled={paid.isFetching} onClick={() => setPaidLimit((n) => Math.min(n + PAID_PAGE, 500))}>{c.loadMore}</button>
                    </div>
                  )}
                </>
              )}
              {tab === "vendors" && (
                <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                  <div className={cn(VEND_GRID, "hidden bg-slate-100 px-4 py-[9px] text-xs font-semibold text-slate-500 md:grid")} aria-hidden="true">
                    <span>{p.head.vendor}</span><span className="text-right">{p.head.year}</span><span className="text-right">{p.head.owe}</span><span>{p.head.terms}</span>
                  </div>
                  {vendorList.isLoading ? <ListSkeleton /> : vendorList.isError ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <p className="text-sm text-slate-700" role="alert">{c.loadError}</p>
                      <button type="button" className={btn("sm")} onClick={() => void vendorList.refetch()}>{c.retry}</button>
                    </div>
                  ) : listedVendors.length === 0 ? (
                    <div className="border-t border-slate-200 px-4 py-6 text-center md:border-t">
                      <p className="font-semibold text-slate-900">{c.empty.vendorsTitle}</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{c.empty.vendorsText}</p>
                      {canChange && <button type="button" className={btn("primary", "mt-4")} onClick={() => setVendorForm({})}>{p.addVendor}</button>}
                    </div>
                  ) : (
                    <ul>
                      {listedVendors.map((v) => (
                        <li
                          key={v.id}
                          className={cn(VEND_GRID, "cursor-pointer items-center border-t border-slate-200 px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-slate-100 md:first:border-t")}
                          onClick={() => openVendor(v.id)}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <MerchantLogo name={v.name} size={32} />
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-baseline gap-1.5">
                                <button
                                  type="button" onClick={(e) => { e.stopPropagation(); openVendor(v.id); }}
                                  className="min-w-0 truncate rounded text-left font-[650] text-slate-900 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                  {v.name}
                                </button>
                                {v.contractor && <span className="whitespace-nowrap text-xs text-slate-500">· {p.contractor}</span>}
                                {v.archived && <span className="whitespace-nowrap text-xs text-slate-500">· {c.vendors.archivedBadge}</span>}
                              </div>
                              <span className="block truncate text-xs text-slate-500">{v.what || (v.lastBill ? v.lastBill.description : c.vendors.noBills)}</span>
                            </div>
                          </div>
                          <span className="hidden text-right tabular-nums md:block">{fmt0(v.yearPaidTotal)}</span>
                          <span className="text-right tabular-nums">{v.unpaidTotal > 0 ? <b className={v.overdueCount ? "text-red-600" : "text-slate-900"}>{fmtMoney(v.unpaidTotal)}</b> : <span className="text-slate-500">—</span>}</span>
                          <span className="hidden text-slate-500 md:block">{v.terms === null ? "—" : v.terms === 0 ? p.cash : p.days(v.terms)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Dialogs */}
      {billForm && (
        <BillFormDialog
          key={billForm.key} bill={billForm.bill} vendorId={billForm.vendorId} vendors={activeVendors} today={today} canRead={canRead}
          onClose={() => setBillForm(null)}
        />
      )}
      {payBill && <PayBillDialog key={payBill.id} bill={payBill} today={today} onClose={() => { setPayBill(null); void utils.expenses.overview.invalidate(); }} />}
      {vendorForm && <VendorFormDialog key={vendorForm.vendor?.id ?? "new"} vendor={vendorForm.vendor} onClose={() => setVendorForm(null)} />}
      {confirm?.kind === "delete" && (
        <ConfirmDialog
          title={c.deleteBill.title} text={c.deleteBill.text(confirm.bill.description)} confirm={c.deleteBill.confirm} cancel={c.deleteBill.cancel}
          destructive pending={delBill.isPending} onConfirm={() => delBill.mutate({ id: confirm.bill.id })} onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "unpay" && (
        <ConfirmDialog
          title={c.unpay.title} text={c.unpay.text} confirm={c.unpay.confirm} cancel={c.unpay.cancel}
          pending={unpay.isPending} onConfirm={() => unpay.mutate({ id: confirm.bill.id })} onClose={() => setConfirm(null)}
        />
      )}
      {archiveAsk && (
        <ConfirmDialog
          title={c.vendorDetail.archiveTitle} text={c.vendorDetail.archiveText} confirm={c.vendorDetail.archive} cancel={c.vendorDetail.archiveCancel}
          pending={archive.isPending} onConfirm={() => archive.mutate({ id: archiveAsk.id, archived: true })} onClose={() => setArchiveAsk(null)}
        />
      )}
    </AnimatedPage>
  );
}
