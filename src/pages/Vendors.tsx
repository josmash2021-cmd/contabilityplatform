// Proveedores y facturas por pagar (business Pro and Negocio): what you owe, what's late,
// what's due this week. Paying a bill records the expense (server: api/vendors-router.ts).
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ChevronRight, Lock, Plus, Receipt, Truck, Wallet, type LucideIcon } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type Tab = "unpaid" | "paid" | "vendors";
type UnpaidFilter = "unpaid" | "overdue" | "week";
type Tone = "neutral" | "red" | "amber";

const PAID_PAGE = 50;
/** A fresh key each time the bill form opens, so it starts from that bill's values. */
let formSeq = 0;
const nextFormKey = () => ++formSeq;
const TONE: Record<Tone, { ring: string; icon: string; sub: string }> = {
  neutral: { ring: "border-neutral-200", icon: "bg-neutral-100 text-neutral-600", sub: "text-neutral-500" },
  red: { ring: "border-red-200", icon: "bg-red-50 text-red-700", sub: "text-red-700" },
  amber: { ring: "border-amber-200", icon: "bg-amber-50 text-amber-800", sub: "text-amber-800" },
};

function SummaryCard({ label, amount, sub, icon: Icon, tone, active, loading, className, onClick }: {
  label: string; amount: number; sub: string; icon: LucideIcon; tone: Tone; active: boolean; loading: boolean; className?: string; onClick: () => void;
}) {
  const s = TONE[tone];
  return (
    <button
      type="button" aria-pressed={active} onClick={onClick}
      className={cn(
        "min-w-0 rounded-xl border bg-white p-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 sm:p-4",
        s.ring, active && "ring-2 ring-black/80", className,
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", s.icon)} aria-hidden="true"><Icon className="h-3.5 w-3.5" /></span>
        <span className="truncate text-xs font-medium text-neutral-600">{label}</span>
      </span>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-24" />
      ) : (
        <>
          <span className="mt-2 block truncate text-lg font-semibold tabular-nums text-black sm:text-xl">{formatCurrency(amount)}</span>
          <span className={cn("block truncate text-[11px]", s.sub)}>{sub}</span>
        </>
      )}
    </button>
  );
}

function ListSkeleton() {
  const c = useCopy(vendorsCopy);
  return (
    <div className="space-y-2" role="status" aria-label={c.loading}>
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const c = useCopy(vendorsCopy);
  return (
    <Card className="rounded-xl border-neutral-200 shadow-none">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-neutral-600" role="alert">{c.loadError}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>{c.retry}</Button>
      </CardContent>
    </Card>
  );
}

function EmptyCard({ icon: Icon, title, text, action }: { icon: LucideIcon; title?: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100" aria-hidden="true"><Icon className="h-5 w-5 text-neutral-500" /></span>
      {title && <p className="text-sm font-semibold text-black">{title}</p>}
      <p className="max-w-sm text-xs text-neutral-500">{text}</p>
      {action}
    </div>
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
      <AnimatedPage className="p-4 lg:p-6">
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100"><Lock className="h-5 w-5 text-neutral-500" aria-hidden="true" /></span>
          <h1 className="mt-4 text-lg font-semibold text-black">{teamBlocked ? c.noAccess.title : c.locked.title}</h1>
          <p className="mt-2 text-sm text-neutral-600">{teamBlocked ? c.noAccess.text : c.locked.text}</p>
          {!teamBlocked && (
            <Button className="mt-5 w-full bg-black text-white hover:bg-neutral-800" onClick={() => navigate("/settings")}>{c.locked.cta}</Button>
          )}
        </div>
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

  return (
    <AnimatedPage className="p-4 lg:p-6">
      <div className="mx-auto w-full max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-black">{c.title}</h1>
            <p className="text-xs text-neutral-500">{c.subtitle}</p>
          </div>
          <Button className="w-full bg-black text-white hover:bg-neutral-800 sm:w-auto" onClick={() => openNewBill()}>
            <Plus className="h-4 w-4" aria-hidden="true" />{c.newBill}
          </Button>
        </div>

        {/* Summary */}
        <section aria-label={c.summary.label} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SummaryCard
            className="col-span-2 sm:col-span-1" label={c.summary.unpaid} icon={Wallet} tone="neutral" loading={summary.isLoading}
            amount={s?.unpaidTotal ?? 0} sub={c.summary.unpaidSub(s?.unpaidCount ?? 0)}
            active={tab === "unpaid" && filter === "unpaid"} onClick={() => showUnpaid("unpaid")}
          />
          <SummaryCard
            label={c.summary.overdue} icon={AlertTriangle} tone={(s?.overdueCount ?? 0) > 0 ? "red" : "neutral"} loading={summary.isLoading}
            amount={s?.overdueTotal ?? 0} sub={c.summary.overdueSub(s?.overdueCount ?? 0)}
            active={tab === "unpaid" && filter === "overdue"} onClick={() => showUnpaid("overdue")}
          />
          <SummaryCard
            label={c.summary.week} icon={CalendarClock} tone={(s?.dueSoonCount ?? 0) > 0 ? "amber" : "neutral"} loading={summary.isLoading}
            amount={s?.dueSoonTotal ?? 0} sub={c.summary.weekSub(s?.dueSoonCount ?? 0)}
            active={tab === "unpaid" && filter === "week"} onClick={() => showUnpaid("week")}
          />
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
          <TabsList className="w-full sm:w-auto" aria-label={c.tabs.label}>
            <TabsTrigger value="unpaid" className="px-2 text-xs sm:px-3 sm:text-sm">
              {c.tabs.unpaid}
              {s && s.unpaidCount > 0 && (
                <span className="rounded-full bg-neutral-200 px-1.5 text-[10px] font-semibold tabular-nums text-neutral-700">{s.unpaidCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="paid" className="px-2 text-xs sm:px-3 sm:text-sm">{c.tabs.paid}</TabsTrigger>
            <TabsTrigger value="vendors" className="px-2 text-xs sm:px-3 sm:text-sm">{c.tabs.vendors}</TabsTrigger>
          </TabsList>

          {/* Por pagar */}
          <TabsContent value="unpaid" className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label={c.filters.label}>
              {(["unpaid", "overdue", "week"] as const).map((f) => (
                <Button
                  key={f} size="sm" variant="outline" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className={cn("h-8 rounded-full border-neutral-200 text-xs", filter === f && "border-black bg-black text-white hover:bg-neutral-800 hover:text-white")}
                >
                  {filterLabels[f]}
                </Button>
              ))}
            </div>
            {unpaid.isLoading ? <ListSkeleton /> : unpaid.isError ? <ErrorCard onRetry={() => void unpaid.refetch()} /> : (unpaid.data?.items.length ?? 0) === 0 ? (
              <EmptyCard
                icon={Receipt} title={filter === "unpaid" ? c.empty.unpaidTitle : undefined} text={emptyUnpaidText}
                action={filter === "unpaid" && (
                  <Button size="sm" className="mt-2 bg-black text-white hover:bg-neutral-800" onClick={() => openNewBill()}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />{c.newBill}
                  </Button>
                )}
              />
            ) : (
              <ul className={cn("space-y-2", unpaid.isPlaceholderData && "opacity-60")} aria-busy={unpaid.isFetching}>
                {unpaid.data?.items.map((b) => <BillCard key={b.id} bill={b} today={today} busy={busy} {...billHandlers} />)}
              </ul>
            )}
          </TabsContent>

          {/* Pagadas */}
          <TabsContent value="paid" className="space-y-3">
            {paid.isLoading ? <ListSkeleton /> : paid.isError ? <ErrorCard onRetry={() => void paid.refetch()} /> : (paid.data?.items.length ?? 0) === 0 ? (
              <EmptyCard icon={Receipt} text={c.empty.paid} />
            ) : (
              <>
                <ul className="space-y-2" aria-busy={paid.isFetching}>
                  {paid.data?.items.map((b) => <BillCard key={b.id} bill={b} today={today} busy={busy} {...billHandlers} />)}
                </ul>
                {paid.data?.hasMore && (
                  <div className="flex justify-center">
                    <Button variant="outline" size="sm" className="border-neutral-200" disabled={paid.isFetching} onClick={() => setPaidLimit((n) => Math.min(n + PAID_PAGE, 500))}>
                      {c.loadMore}
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Proveedores */}
          <TabsContent value="vendors" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button size="sm" variant="outline" className="border-neutral-200" onClick={() => setVendorForm({})}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />{c.vendors.new}
              </Button>
              <Button size="sm" variant="ghost" className="text-xs text-neutral-600" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? c.vendors.hideArchived : c.vendors.showArchived}
              </Button>
            </div>
            {vendorList.isLoading ? <ListSkeleton /> : vendorList.isError ? <ErrorCard onRetry={() => void vendorList.refetch()} /> : vendors.length === 0 ? (
              <EmptyCard
                icon={Truck} title={c.empty.vendorsTitle} text={c.empty.vendorsText}
                action={<Button size="sm" className="mt-2 bg-black text-white hover:bg-neutral-800" onClick={() => setVendorForm({})}><Plus className="h-3.5 w-3.5" aria-hidden="true" />{c.vendors.new}</Button>}
              />
            ) : (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {vendors.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button" onClick={() => setDetailId(v.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 sm:p-4",
                        v.overdueCount > 0 ? "border-red-200" : "border-neutral-200",
                      )}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-600" aria-hidden="true">
                        {v.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-black">{v.name}</span>
                          {v.archived && <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{c.vendors.archivedBadge}</span>}
                        </span>
                        <span className="block truncate text-xs">
                          {v.unpaidTotal > 0 ? (
                            <span className="font-medium text-black">{c.vendors.owes(formatCurrency(v.unpaidTotal))}</span>
                          ) : (
                            <span className="text-neutral-500">{c.vendors.upToDate}</span>
                          )}
                          {v.overdueCount > 0 && <span className="font-medium text-red-700"> · {c.vendors.overdueCount(v.overdueCount)}</span>}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-400">
                          {v.lastBill ? c.vendors.lastBill(v.lastBill.description, formatCurrency(v.lastBill.amount)) : c.vendors.noBills}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {detailVendor && (
        <VendorDetailDialog
          vendor={detailVendor} today={today} busy={busy}
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
