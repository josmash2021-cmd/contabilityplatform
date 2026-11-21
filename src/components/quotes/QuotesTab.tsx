import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertCircle, CalendarX2, ClipboardList, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { quotesCopy } from "@/i18n/copy/quotes";
import { QUOTE_STATUSES, localIsoDate, quoteExpired, type QuoteStatus } from "../../../api/lib/quotes";
import { Chip, QuoteStatusChip } from "./StatusChip";
import { QuoteBuilderDialog, type BuilderState } from "./QuoteBuilder";
import { QuoteDetailDialog } from "./QuoteDetailDialog";
import { formatDate, formatDay, type CompanyInfo, type CustomerOption, type QuoteListItem, type ServiceOption } from "./shared";
import { BTN, CARD } from "./ui";

type Filter = QuoteStatus | "all";

/** The "Cotizaciones" tab: status filter, the list, and the builder and detail dialogs (opened from here or the page header). */
export function QuotesTab({ services, customers, company, canChange, builder, onBuilder }: {
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
  company: CompanyInfo;
  /** False for a read-only team member (the accountant). */
  canChange: boolean;
  builder: BuilderState | null;
  onBuilder: (b: BuilderState | null) => void;
}) {
  const t = useCopy(quotesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const [today] = useState(() => localIsoDate(new Date()));
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const list = trpc.quotes.list.useQuery(filter === "all" ? undefined : { status: filter }, {
    placeholderData: keepPreviousData,
    retry: (count, err) => err.data?.code !== "FORBIDDEN" && count < 1,
  });

  const counts = list.data?.counts;
  const total = counts ? QUOTE_STATUSES.reduce((n, s) => n + counts[s], 0) : 0;
  const filters: Array<{ value: Filter; label: string; count: number | null }> = [
    { value: "all", label: t.quotes.all, count: counts ? total : null },
    ...QUOTE_STATUSES.map((s) => ({ value: s, label: t.status[s], count: counts ? counts[s] : null })),
  ];
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Phone: one scrolling row of chips; wider screens: they wrap. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap" role="group" aria-label={t.quotes.filterLabel}>
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9",
                filter === f.value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              {f.label}
              {f.count !== null && <span className={cn("tabular-nums", filter === f.value ? "text-blue-100" : "text-slate-400")}>{f.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" role="status" aria-label={t.loading}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : list.isError ? (
        <section className="rounded-2xl border border-red-200 bg-white p-5 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-red-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900" role="alert">{list.error.message || t.error}</p>
          <button type="button" className={cn(BTN.secondary, "mt-3")} onClick={() => void list.refetch()}>{t.retry}</button>
        </section>
      ) : items.length === 0 ? (
        <section className={cn(CARD, "px-5 py-10 text-center")}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600" aria-hidden="true">
            <ClipboardList className="h-7 w-7" />
          </span>
          {filter === "all" ? (
            <>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-slate-900">{t.quotes.emptyTitle}</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">{t.quotes.emptyText}</p>
              {canChange && (
                <button type="button" className={cn(BTN.primary, "mt-5")} onClick={() => onBuilder({ mode: "create" })}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> {t.quotes.new}
                </button>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-600">{t.quotes.emptyFiltered}</p>
          )}
        </section>
      ) : (
        <ul className={cn("grid grid-cols-1 gap-3 lg:grid-cols-2", list.isPlaceholderData && "opacity-60")} aria-busy={list.isFetching}>
          {items.map((q) => (
            <li key={q.id} className="min-w-0">
              <QuoteCard q={q} today={today} locale={locale} onOpen={() => setOpenId(q.id)} />
            </li>
          ))}
        </ul>
      )}

      <QuoteDetailDialog
        quoteId={openId}
        company={company}
        canChange={canChange}
        onClose={() => setOpenId(null)}
        onEdit={(id) => { setOpenId(null); onBuilder({ mode: "edit", id }); }}
      />
      <QuoteBuilderDialog
        state={builder}
        services={services}
        customers={customers}
        onClose={() => onBuilder(null)}
        onSaved={(id) => { onBuilder(null); setOpenId(id); }}
      />
    </div>
  );
}

function QuoteCard({ q, today, locale, onOpen }: { q: QuoteListItem; today: string; locale: string; onOpen: () => void }) {
  const t = useCopy(quotesCopy);
  const expired = quoteExpired(q.validUntil, q.status, today);
  const customer = q.customerName || t.quotes.noCustomer;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.quotes.openAria(q.number, customer, t.status[q.status])}
      className="block h-full w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{q.number}</p>
          <p className="truncate font-semibold text-slate-900">{customer}</p>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums tracking-tight text-slate-900">{formatCurrency(q.total)}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <QuoteStatusChip status={q.status} label={t.status[q.status]} />
        {expired && <Chip icon={CalendarX2} label={t.expired} className="bg-amber-50 text-amber-800 ring-1 ring-amber-200" />}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {t.quotes.createdOn(formatDate(q.createdAt, locale))} · {t.quotes.lines(q.itemCount)}
        {q.validUntil && q.status !== "converted" ? ` · ${t.quotes.validUntil(formatDay(q.validUntil, locale))}` : ""}
        {q.invoiceNumber ? ` · ${t.quotes.sale(q.invoiceNumber)}` : ""}
      </p>
    </button>
  );
}
