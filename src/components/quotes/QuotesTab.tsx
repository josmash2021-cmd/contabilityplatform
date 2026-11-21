import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { CalendarX2, ClipboardList, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type Filter = QuoteStatus | "all";

/** The "Cotizaciones" tab: status filter, the list, and the builder and detail dialogs. */
export function QuotesTab({ services, customers, company }: {
  services: readonly ServiceOption[];
  customers: readonly CustomerOption[];
  company: CompanyInfo;
}) {
  const t = useCopy(quotesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const [today] = useState(() => localIsoDate(new Date()));
  const [filter, setFilter] = useState<Filter>("all");
  const [builder, setBuilder] = useState<BuilderState | null>(null);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.quotes.filterLabel}>
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
                filter === f.value ? "border-black bg-black text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
              )}
            >
              {f.label}
              {f.count !== null && <span className={filter === f.value ? "text-neutral-300" : "text-neutral-400"}>{f.count}</span>}
            </button>
          ))}
        </div>
        <Button className="h-9 shrink-0 bg-black text-white hover:bg-neutral-800" onClick={() => setBuilder({ mode: "create" })}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t.quotes.new}
        </Button>
      </div>

      {list.isLoading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" role="status" aria-label={t.loading}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : list.isError ? (
        <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-neutral-600" role="alert">{list.error.message || t.error}</p>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>{t.retry}</Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-neutral-100" aria-hidden="true">
              <ClipboardList className="h-5 w-5 text-neutral-500" />
            </span>
            {filter === "all" ? (
              <>
                <h2 className="text-sm font-semibold text-black">{t.quotes.emptyTitle}</h2>
                <p className="max-w-sm text-xs text-neutral-500">{t.quotes.emptyText}</p>
                <Button className="mt-1 bg-black text-white hover:bg-neutral-800" onClick={() => setBuilder({ mode: "create" })}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t.quotes.new}
                </Button>
              </>
            ) : (
              <p className="text-sm text-neutral-600">{t.quotes.emptyFiltered}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
        onClose={() => setOpenId(null)}
        onEdit={(id) => { setOpenId(null); setBuilder({ mode: "edit", id }); }}
      />
      <QuoteBuilderDialog
        state={builder}
        services={services}
        customers={customers}
        onClose={() => setBuilder(null)}
        onSaved={(id) => { setBuilder(null); setOpenId(id); }}
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
      className="block h-full w-full rounded-xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-neutral-500">{q.number}</p>
          <p className="truncate text-sm font-medium text-black">{customer}</p>
        </div>
        <p className="shrink-0 text-base font-semibold text-black">{formatCurrency(q.total)}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <QuoteStatusChip status={q.status} label={t.status[q.status]} />
        {expired && <Chip icon={CalendarX2} label={t.expired} className="bg-amber-50 text-amber-800" />}
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        {t.quotes.createdOn(formatDate(q.createdAt, locale))} · {t.quotes.lines(q.itemCount)}
        {q.validUntil && q.status !== "converted" ? ` · ${t.quotes.validUntil(formatDay(q.validUntil, locale))}` : ""}
        {q.invoiceNumber ? ` · ${t.quotes.sale(q.invoiceNumber)}` : ""}
      </p>
    </button>
  );
}
