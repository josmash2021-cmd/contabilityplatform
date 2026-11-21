// A vendor's own page (the prototype's vendorDetail): what you bought from them this year, what you owe and your
// terms; their bills; their details; the 1099 card for a contractor; and the history of bills and payments.
import { useMemo } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Upload } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { CARD, H3, btn, fmt0, fmtMoney } from "@/components/expenses/ui";
import { BackButton, Dst, Kpi, PageHead } from "@/components/expenses/proto";
import { BillRow } from "./BillRow";
import { errorText, formatDay, type BillItem, type VendorItem } from "./shared";

type Props = {
  vendor: VendorItem;
  today: string;
  busy: boolean;
  canChange: boolean;
  uploadLabel: string;
  onBack: () => void;
  onNewBill: (vendorId: number) => void;
  onEdit: (vendor: VendorItem) => void;
  onArchive: (vendor: VendorItem) => void;
  onRestore: (vendor: VendorItem) => void;
  onPay: (bill: BillItem) => void;
  onEditBill: (bill: BillItem) => void;
  onDeleteBill: (bill: BillItem) => void;
  onUnpay: (bill: BillItem) => void;
};

type Ev = { date: string; text: string; tone: "" | "good" | "bad"; order: number };

export function VendorDetailView({ vendor, today, busy, canChange, uploadLabel, onBack, onNewBill, onEdit, onArchive, onRestore, ...billActions }: Props) {
  const c = useCopy(vendorsCopy);
  const p = c.proto;
  const d = p.detail;
  const { lang } = useLang();
  const utils = trpc.useUtils();
  const bills = trpc.vendors.bills.list.useQuery({ filter: "all", vendorId: vendor.id, today, limit: 200 });
  const setW9 = trpc.vendors.setW9.useMutation({
    onSuccess: () => { toast.success(d.w9Saved); void utils.vendors.list.invalidate(); },
    onError: (e) => toast.error(errorText(e, c.error)),
  });
  const items = useMemo(() => bills.data?.items ?? [], [bills.data]);
  const unpaid = items.filter((b) => b.status === "unpaid");
  const terms = vendor.terms === null ? d.termsNone : vendor.terms === 0 ? p.cash : p.days(vendor.terms);

  // History: each bill recorded, paid, or gone overdue, newest first.
  const events = useMemo(() => {
    const out: Ev[] = [];
    for (const b of items) {
      const created = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      const createdDay = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
      out.push({ date: createdDay, text: d.ev.added(b.description, fmtMoney(b.amount)), tone: "", order: 0 });
      if (b.status === "paid" && b.paidAt) out.push({ date: b.paidAt, text: d.ev.paid(fmtMoney(b.amount), b.description, b.paymentMethod ? c.methods[b.paymentMethod] : ""), tone: "good", order: 2 });
      else if (b.timing === "overdue") out.push({ date: b.dueDate, text: d.ev.late(b.description), tone: "bad", order: 1 });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order).slice(0, 12);
  }, [items, d, c.methods]);

  const sub = [vendor.what, vendor.contractor ? d.subContractor : null].filter(Boolean).join(" · ");

  return (
    <>
      <BackButton label={p.back} onClick={onBack} />
      <PageHead
        title={<span className="flex items-center gap-2.5"><MerchantLogo name={vendor.name} size={32} /><span className="min-w-0 break-words">{vendor.name}</span></span>}
        sub={sub || undefined}
        right={canChange ? (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {!vendor.archived && (
              <button type="button" className={btn("primary", "flex-1 sm:flex-none")} onClick={() => onNewBill(vendor.id)}>
                <Upload className="h-4 w-4" aria-hidden="true" />{uploadLabel}
              </button>
            )}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" className={btn("icon", "w-11 sm:w-auto")} aria-label={d.menu} disabled={busy}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white">
                <DropdownMenuItem className="min-h-10" onSelect={() => onEdit(vendor)}><Pencil className="h-4 w-4" aria-hidden="true" />{d.edit}</DropdownMenuItem>
                {vendor.archived ? (
                  <DropdownMenuItem className="min-h-10" onSelect={() => onRestore(vendor)}><ArchiveRestore className="h-4 w-4" aria-hidden="true" />{d.unarchive}</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="min-h-10 text-red-600 focus:text-red-700" onSelect={() => onArchive(vendor)}><Archive className="h-4 w-4" aria-hidden="true" />{d.archive}</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      />
      {vendor.archived && <p className="mb-3 text-[13px] text-slate-500">{c.vendorDetail.archivedNote}</p>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label={d.bought} value={fmt0(vendor.yearPaidTotal)} sub={d.boughtSub(vendor.yearPaidCount)} />
        <Kpi label={d.owe} value={fmtMoney(vendor.unpaidTotal)} sub={vendor.unpaidCount ? d.oweSub(vendor.unpaidCount) : d.upToDate} tone={vendor.unpaidCount ? (vendor.overdueCount ? "bad" : undefined) : "good"} />
        <Kpi label={d.terms} value={terms} sub={d.termsSub} />
      </section>

      <div className="mt-3.5 grid items-start gap-3.5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className={CARD} aria-labelledby="vd-bills">
          <h2 id="vd-bills" className={H3}>{d.bills}</h2>
          <div className="-mx-4 -mb-4 mt-2.5 overflow-hidden rounded-b-[14px] border-t border-slate-200 bg-white">
            {bills.isLoading ? (
              <div className="grid gap-2 p-3" role="status" aria-label={c.loading}><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : bills.isError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <p className="text-sm text-slate-700" role="alert">{c.loadError}</p>
                <button type="button" className={btn("sm")} onClick={() => void bills.refetch()}>{c.retry}</button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">{d.noBills}</p>
            ) : (
              <ul>
                {[...unpaid, ...items.filter((b) => b.status === "paid")].map((b) => (
                  <BillRow
                    key={b.id} bill={b} today={today} busy={busy} canChange={canChange} compact
                    onPay={billActions.onPay} onEdit={billActions.onEditBill} onDelete={billActions.onDeleteBill} onUnpay={billActions.onUnpay}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="grid gap-3.5">
          <section className={CARD} aria-labelledby="vd-data">
            <h2 id="vd-data" className={H3}>{d.data}</h2>
            <dl className="mt-2.5 grid gap-2.5 text-sm">
              {([[d.what, vendor.what], [d.phone, vendor.phone], [d.email, vendor.email], [d.notes, vendor.notes]] as const).map(([k, v]) => (
                <div key={k} className="grid gap-px">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="whitespace-pre-line break-words text-slate-900">
                    {v && k === d.phone ? <a href={`tel:${v.replace(/[^\d+]/g, "")}`} className="hover:text-blue-700">{v}</a>
                      : v && k === d.email ? <a href={`mailto:${v}`} className="hover:text-blue-700">{v}</a>
                        : v || d.none}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {vendor.contractor && (
            <section className={CARD} aria-labelledby="vd-1099">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id="vd-1099" className={H3}>{d.c1099}</h2>
                <Dst label={vendor.w9 ? d.w9Yes : d.w9No} tone={vendor.w9 ? "good" : "warn"} />
              </div>
              <p className="text-[13px] text-slate-500">{d.c1099Text(fmt0(vendor.yearPaidTotal))}</p>
              {canChange && (
                <button type="button" className={btn("sm", "mt-2.5")} disabled={setW9.isPending} onClick={() => setW9.mutate({ id: vendor.id, w9: !vendor.w9 })}>
                  {vendor.w9 ? d.w9Unmark : d.w9Mark}
                </button>
              )}
            </section>
          )}

          <section className={CARD} aria-labelledby="vd-history">
            <h2 id="vd-history" className={H3}>{d.history}</h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{d.historyEmpty}</p>
            ) : (
              <ul className="mt-3">
                {events.map((e, i) => (
                  <li key={`${e.date}-${i}`} className="relative grid grid-cols-[78px_minmax(0,1fr)] gap-2.5 pb-3.5 text-[13px] last:pb-0">
                    <span
                      className={cn("absolute left-[88px] top-[5px] h-2 w-2 rounded-full", e.tone === "good" ? "bg-emerald-600" : e.tone === "bad" ? "bg-red-600" : "bg-blue-600")}
                      aria-hidden="true"
                    />
                    {i < events.length - 1 && <span className="absolute bottom-0 left-[91.5px] top-[15px] w-px bg-slate-200" aria-hidden="true" />}
                    <span className="text-xs text-slate-500">{formatDay(e.date, lang, today)}</span>
                    <span className="pl-[18px] text-slate-900">{e.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
