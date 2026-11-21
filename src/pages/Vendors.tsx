// Proveedores y facturas por pagar (business Pro and Negocio): what you owe, what's late,
// what's due this week. Paying a bill records the expense (server: api/vendors-router.ts).
// Team (api/lib/team.ts): staff never reach this page (AppLayout); the accountant only reads.
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, CalendarClock, ChevronRight, Info, Lock, Plus, Receipt, Truck, Wallet, type LucideIcon } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { BillCard } from "@/components/vendors/BillCard";
import { BillFormDialog } from "@/components/vendors/BillFormDialog";
import { ConfirmDialog } from "@/components/vendors/ConfirmDialog";
import { PayBillDialog } from "@/components/vendors/PayBillDialog";
import { VendorDetailDialog } from "@/components/vendors/VendorDetailDialog";
import { VendorFormDialog } from "@/components/vendors/VendorFormDialog";
import { errorText, localToday, type BillItem, type VendorItem } from "@/components/vendors/shared";
import { BTN, TABS } from "@/components/vendors/ui";

type Tab = "unpaid" | "paid" | "vendors";
type UnpaidFilter = "unpaid" | "overdue" | "week";
type Tone = "neutral" | "red" | "amber";

const PAID_PAGE = 50;
/** A fresh key each time the bill form opens, so it starts from that bill's values. */
let formSeq = 0;
const nextFormKey = () => ++formSeq;
const TONE: Record<Tone, { border: string; icon: string; amount: string; sub: string }> = {
  neutral: { border: "border-slate-200", icon: "bg-blue-50 text-blue-600", amount: "text-slate-900", sub: "text-slate-500" },
  red: { border: "border-red-200", icon: "bg-red-50 text-red-600", amount: "text-red-700", sub: "font-medium text-red-700" },
  amber: { border: "border-amber-200", icon: "bg-amber-50 text-amber-600", amount: "text-slate-900", sub: "font-medium text-amber-800" },
};

/** A total that also filters the list below (pressed = showing it). */
function SummaryCard({ label, amount, sub, icon: Icon, tone, active, loading, className, onClick }: {
  label: string; amount: number; sub: string; icon: LucideIcon; tone: Tone; active: boolean; loading: boolean; className?: string; onClick: () => void;
}) {
  const s = TONE[tone];
  return (
    <button
      type="button" aria-pressed={active} onClick={onClick}
      className={cn(
        "min-w-0 rounded-2xl border bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        s.border, active && "ring-2 ring-blue-600 ring-offset-1", className,
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", s.icon)} aria-hidden="true"><Icon className="h-4 w-4" /></span>
        <span className="truncate text-xs font-medium text-slate-500">{label}</span>
      </span>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <>
          <span className={cn("mt-2 block truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl", s.amount)}>{formatCurrency(amount)}</span>
          <span className={cn("mt-0.5 block truncate text-xs", s.sub)}>{sub}</span>
        </>
      )}
    </button>
  );
}

function ListSkeleton() {
  const c = useCopy(vendorsCopy);
  return (
    <div className="space-y-2" role="status" aria-label={c.loading}>
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const c = useCopy(vendorsCopy);
  return (
    <section className="rounded-2xl border border-red-200 bg-white p-5 text-center">
      <AlertCircle className="mx-auto h-6 w-6 text-red-600" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium text-slate-900" role="alert">{c.loadError}</p>
      <button type="button" className={cn(BTN.secondary, "mt-3")} onClick={onRetry}>{c.retry}</button>
    </section>
  );
}

function EmptyCard({ icon: Icon, title, text, action }: { icon: LucideIcon; title?: string; text: string; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600" aria-hidden="true"><Icon className="h-7 w-7" /></span>
      {title && <p className="mt-4 text-lg font-bold tracking-tight text-slate-900">{title}</p>}
      <p className={cn("mx-auto max-w-sm text-sm text-slate-500", title ? "mt-1.5" : "mt-4")}>{text}</p>
      {action}
    </section>
  );
}

export default function Vendors() {
  const c = useCopy(vendorsCopy);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [today] = useState(localToday);
  const [tab, setTab] = useState<Tab>("unpaid");
  const [filter, setFilter] = useState<UnpaidFilter>("unpaid");
  const [paidLimit, setPaidLimit] = useState(PAID_PAGE);
  const [showArchived, setShowArchived] = useState(false);

  // Dialogs
  const [billForm, setBillForm] = useState<{ bill?: BillItem; vendorId?: number; key: number } | null>(null);
  const [payBill, setPayBill] = useState<BillItem | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "unpay"; bill: BillItem } | null>(null);
  const [vendorForm, setVendorForm] = useState<{ vendor?: VendorItem } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [archiveAsk, setArchiveAsk] = useState<VendorItem | null>(null);

  const plan = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const planLacks = plan.data ? !plan.data.features.includes("vendors") : false;
  // The accountant reads the books but changes nothing (the server refuses it too).
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canChange = membership?.role !== "accountant";
  const opts = { enabled: !planLacks, staleTime: 60_000, retry: (n: number, err: { data?: { code?: string } | null }) => err.data?.code !== "FORBIDDEN" && n < 1 };

  const summary = trpc.vendors.bills.summary.useQuery({ today }, opts);
  const unpaid = trpc.vendors.bills.list.useQuery({ filter, today }, { ...opts, enabled: opts.enabled && tab === "unpaid", placeholderData: keepPreviousData });
  const paid = trpc.vendors.bills.list.useQuery(
    { filter: "paid", today, limit: paidLimit },
    { ...opts, enabled: opts.enabled && tab === "paid", placeholderData: keepPreviousData },
  );
  const vendorList = trpc.vendors.list.useQuery({ today, includeArchived: showArchived }, { ...opts, placeholderData: keepPreviousData });
  const locked = planLacks || summary.error?.data?.code === "FORBIDDEN" || vendorList.error?.data?.code === "FORBIDDEN";

  const refresh = () => void utils.vendors.invalidate();
  const onError = (e: unknown) => toast.error(errorText(e, c.error));
  const delBill = trpc.vendors.bills.delete.useMutation({
    onSuccess: () => { toast.success(c.deleteBill.done); setConfirm(null); refresh(); },
    onError,
  });
  const unpay = trpc.vendors.bills.markUnpaid.useMutation({
    onSuccess: (r) => { toast.success(r.removedExpense ? c.unpay.done : c.unpay.doneNoExpense); setConfirm(null); refresh(); },
    onError,
  });
  const archive = trpc.vendors.archive.useMutation({
    onSuccess: (r) => {
      toast.success(r.archived ? c.vendorDetail.archived : c.vendorDetail.unarchived);
      setArchiveAsk(null);
      if (r.archived && !showArchived) setDetailId(null);
      refresh();
    },
    onError,
  });
  const busy = delBill.isPending || unpay.isPending || archive.isPending;

  if (locked) {
    // The plan includes it but the server still says no: a team member whose role doesn't cover it.
    const teamBlocked = !!plan.data && !planLacks;
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <section className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Lock className="h-6 w-6" aria-hidden="true" /></span>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{teamBlocked ? c.noAccess.title : c.locked.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{teamBlocked ? c.noAccess.text : c.locked.text}</p>
          {!teamBlocked && (
            <button type="button" className={cn(BTN.primary, "mt-6 w-full")} onClick={() => navigate("/settings")}>{c.locked.cta}</button>
          )}
        </section>
      </AnimatedPage>
    );
  }

  const vendors = vendorList.data ?? [];
  const activeVendors = vendors.filter((v) => !v.archived);
  const detailVendor = detailId !== null ? vendors.find((v) => v.id === detailId) ?? null : null;
  const s = summary.data;

  const openNewBill = (vendorId?: number) => setBillForm({ vendorId, key: nextFormKey() });
  const billHandlers = {
    onPay: (b: BillItem) => setPayBill(b),
    onEdit: (b: BillItem) => setBillForm({ bill: b, key: nextFormKey() }),
    onDelete: (b: BillItem) => setConfirm({ kind: "delete", bill: b }),
    onUnpay: (b: BillItem) => setConfirm({ kind: "unpay", bill: b }),
  };
  const showUnpaid = (f: UnpaidFilter) => { setTab("unpaid"); setFilter(f); };

  const filterLabels: Record<UnpaidFilter, string> = { unpaid: c.filters.all, overdue: c.filters.overdue, week: c.filters.week };
  const emptyUnpaidText = filter === "overdue" ? c.empty.overdue : filter === "week" ? c.empty.week : c.empty.unpaidText;
  const overdueCount = s?.overdueCount ?? 0;
  const weekCount = s?.dueSoonCount ?? 0;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{c.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{c.subtitle}</p>
          </div>
          {canChange && (
            <button type="button" className={cn(BTN.primary, "w-full sm:w-auto")} onClick={() => openNewBill()}>
              <Plus className="h-4 w-4" aria-hidden="true" />{c.newBill}
            </button>
          )}
        </header>

        {!canChange && (
          <p className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />{c.ui.readOnly}
          </p>
        )}

        {summary.isError && !summary.data ? (
          <ErrorCard onRetry={() => void summary.refetch()} />
        ) : (
          <section aria-label={c.summary.label} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryCard
              className="col-span-2 sm:col-span-1" label={c.summary.unpaid} icon={Wallet} tone="neutral" loading={summary.isLoading}
              amount={s?.unpaidTotal ?? 0} sub={c.summary.unpaidSub(s?.unpaidCount ?? 0)}
              active={tab === "unpaid" && filter === "unpaid"} onClick={() => showUnpaid("unpaid")}
            />
            <SummaryCard
              label={c.summary.overdue} icon={AlertTriangle} tone={overdueCount > 0 ? "red" : "neutral"} loading={summary.isLoading}
              amount={s?.overdueTotal ?? 0} sub={c.summary.overdueSub(overdueCount)}
              active={tab === "unpaid" && filter === "overdue"} onClick={() => showUnpaid("overdue")}
            />
            <SummaryCard
              label={c.summary.week} icon={CalendarClock} tone={weekCount > 0 ? "amber" : "neutral"} loading={summary.isLoading}
              amount={s?.dueSoonTotal ?? 0} sub={c.summary.weekSub(weekCount)}
              active={tab === "unpaid" && filter === "week"} onClick={() => showUnpaid("week")}
            />
          </section>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
          <TabsList className={TABS.list} aria-label={c.tabs.label}>
            <TabsTrigger value="unpaid" className={TABS.trigger}>
              {c.tabs.unpaid}
              {s && s.unpaidCount > 0 && (
                <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold tabular-nums text-slate-700">{s.unpaidCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="paid" className={TABS.trigger}>{c.tabs.paid}</TabsTrigger>
            <TabsTrigger value="vendors" className={TABS.trigger}>{c.tabs.vendors}</TabsTrigger>
          </TabsList>

          {/* Por pagar */}
          <TabsContent value="unpaid" className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label={c.filters.label}>
              {(["unpaid", "overdue", "week"] as const).map((f) => (
                <button
                  key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9",
                    filter === f ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {filterLabels[f]}
                </button>
              ))}
            </div>
            {unpaid.isLoading ? <ListSkeleton /> : unpaid.isError ? <ErrorCard onRetry={() => void unpaid.refetch()} /> : (unpaid.data?.items.length ?? 0) === 0 ? (
              <EmptyCard
                icon={Receipt} title={filter === "unpaid" ? c.empty.unpaidTitle : undefined} text={emptyUnpaidText}
                action={filter === "unpaid" && canChange && (
                  <button type="button" className={cn(BTN.primary, "mt-5")} onClick={() => openNewBill()}>
                    <Plus className="h-4 w-4" aria-hidden="true" />{c.newBill}
                  </button>
                )}
              />
            ) : (
              <ul className={cn("grid grid-cols-1 gap-3 lg:grid-cols-2", unpaid.isPlaceholderData && "opacity-60")} aria-busy={unpaid.isFetching}>
                {unpaid.data?.items.map((b) => <BillCard key={b.id} bill={b} today={today} busy={busy} canChange={canChange} {...billHandlers} />)}
              </ul>
            )}
          </TabsContent>

          {/* Pagadas */}
          <TabsContent value="paid" className="space-y-3">
            {paid.isLoading ? <ListSkeleton /> : paid.isError ? <ErrorCard onRetry={() => void paid.refetch()} /> : (paid.data?.items.length ?? 0) === 0 ? (
              <EmptyCard icon={Receipt} text={c.empty.paid} />
            ) : (
              <>
                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-busy={paid.isFetching}>
                  {paid.data?.items.map((b) => <BillCard key={b.id} bill={b} today={today} busy={busy} canChange={canChange} {...billHandlers} />)}
                </ul>
                {paid.data?.hasMore && (
                  <div className="flex justify-center">
                    <button type="button" className={cn(BTN.secondary, "w-full sm:w-auto")} disabled={paid.isFetching} onClick={() => setPaidLimit((n) => Math.min(n + PAID_PAGE, 500))}>
                      {c.loadMore}
                    </button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Proveedores */}
          <TabsContent value="vendors" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {canChange ? (
                <button type="button" className={BTN.secondary} onClick={() => setVendorForm({})}>
                  <Plus className="h-4 w-4" aria-hidden="true" />{c.vendors.new}
                </button>
              ) : <span />}
              <button type="button" className={cn(BTN.ghost, "text-blue-700")} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? c.vendors.hideArchived : c.vendors.showArchived}
              </button>
            </div>
            {vendorList.isLoading ? <ListSkeleton /> : vendorList.isError ? <ErrorCard onRetry={() => void vendorList.refetch()} /> : vendors.length === 0 ? (
              <EmptyCard
                icon={Truck} title={c.empty.vendorsTitle} text={c.empty.vendorsText}
                action={canChange && (
                  <button type="button" className={cn(BTN.primary, "mt-5")} onClick={() => setVendorForm({})}>
                    <Plus className="h-4 w-4" aria-hidden="true" />{c.vendors.new}
                  </button>
                )}
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {vendors.map((v) => <VendorRow key={v.id} v={v} onOpen={() => setDetailId(v.id)} />)}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {detailVendor && (
        <VendorDetailDialog
          vendor={detailVendor} today={today} busy={busy} canChange={canChange}
          onClose={() => setDetailId(null)}
          onNewBill={(id) => openNewBill(id)}
          onEdit={(v) => setVendorForm({ vendor: v })}
          onArchive={(v) => setArchiveAsk(v)}
          onRestore={(v) => archive.mutate({ id: v.id, archived: false })}
          onPay={billHandlers.onPay} onEditBill={billHandlers.onEdit} onDeleteBill={billHandlers.onDelete} onUnpay={billHandlers.onUnpay}
        />
      )}
      {billForm && (
        <BillFormDialog
          key={billForm.key} bill={billForm.bill} vendorId={billForm.vendorId} vendors={activeVendors} today={today}
          onClose={() => setBillForm(null)}
        />
      )}
      {payBill && <PayBillDialog key={payBill.id} bill={payBill} today={today} onClose={() => setPayBill(null)} />}
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

/** A vendor in the list: what you owe them (overdue in words too) and their last bill. */
function VendorRow({ v, onOpen }: { v: VendorItem; onOpen: () => void }) {
  const c = useCopy(vendorsCopy);
  const overdue = v.overdueCount > 0;
  return (
    <li>
      <button
        type="button" onClick={onOpen}
        className={cn(
          "flex min-h-[64px] w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          overdue ? "border-red-200" : "border-slate-200",
        )}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700" aria-hidden="true">
          {v.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold text-slate-900">{v.name}</span>
            {v.archived && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{c.vendors.archivedBadge}</span>}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {v.lastBill ? c.vendors.lastBill(v.lastBill.description, formatCurrency(v.lastBill.amount)) : c.vendors.noBills}
          </span>
          {overdue && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{c.vendors.overdueCount(v.overdueCount)}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          {v.unpaidTotal > 0 ? (
            <>
              <span className="block text-[11px] text-slate-500">{c.vendorDetail.owes}</span>
              <span className={cn("block font-bold tabular-nums", overdue ? "text-red-700" : "text-slate-900")}>{formatCurrency(v.unpaidTotal)}</span>
            </>
          ) : (
            <span className="text-xs font-medium text-emerald-700">{c.vendors.upToDate}</span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </button>
    </li>
  );
}
