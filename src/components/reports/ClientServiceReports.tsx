// "Por cliente" / "Por servicio" (Negocio plan): reports by client and by service.
// Uses the page's period (Hoy / Semana / Mes / Año). The server counts only completed sales, like
// the income statement, and answers FORBIDDEN when the plan lacks "clientReports"; planInfo lets
// us show the lock without asking for the report first.
import { useId, type ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, DollarSign, Layers, Loader2, Lock, Package, Receipt, TrendingUp, Users, type LucideIcon,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { clientReportsCopy } from "@/i18n/copy/clientReports";
import { reportesCopy } from "@/i18n/copy/reportes";
import {
  sortRows, topBy,
  type ClientReport, type ClientReportRow, type DateRange, type ServiceReport, type ServiceReportRow, type SortState,
} from "../../../api/lib/clientReports";
import { CARD, money } from "./format";

export type ReportView = "client" | "service";
export type ClientSortKey = "name" | "salesCount" | "total" | "averageTicket" | "lastSaleAt" | "share";
export type ServiceSortKey = "name" | "quantity" | "revenue" | "salesCount" | "share" | "averagePrice";
type ReportFormat = { pct: (share: number) => string; count: (n: number) => string; day: (iso: string | null) => string };
type SortableColumn<R, K extends string> = {
  key: K;
  label: string;
  /** Right-aligned with tabular digits. */
  numeric?: boolean;
  /** Shown big on the right of each phone card. */
  primary?: boolean;
  cell: (row: R) => ReactNode;
  foot: ReactNode;
};

/** FORBIDDEN means the plan lacks the feature: show the lock right away instead of retrying. */
const retryUnlessForbidden = (failureCount: number, error: { data?: { code?: string } | null }) =>
  error.data?.code !== "FORBIDDEN" && failureCount < 1;

export function ClientServiceReports({
  view, range, tzOffsetHours, rangeLabel, clientSort, onClientSort, onClientFlip, serviceSort, onServiceSort, onServiceFlip,
}: {
  view: ReportView;
  range: DateRange;
  tzOffsetHours: number;
  rangeLabel: string;
  clientSort: SortState<ClientSortKey>;
  onClientSort: (key: ClientSortKey) => void;
  onClientFlip: () => void;
  serviceSort: SortState<ServiceSortKey>;
  onServiceSort: (key: ServiceSortKey) => void;
  onServiceFlip: () => void;
}) {
  const c = useCopy(clientReportsCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);

  const planQuery = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const lacksFeature = !!planQuery.data && !planQuery.data.features.includes("clientReports");
  const canQuery = !planQuery.isLoading && !lacksFeature;
  const input = { ...range, tzOffsetHours };
  const queryOpts = { retry: retryUnlessForbidden, placeholderData: keepPreviousData, staleTime: 0, refetchOnWindowFocus: true };
  const clientQuery = trpc.reports.byClient.useQuery(input, { ...queryOpts, enabled: canQuery && view === "client" });
  const serviceQuery = trpc.reports.byService.useQuery(input, { ...queryOpts, enabled: canQuery && view === "service" });
  const locked = lacksFeature
    || clientQuery.error?.data?.code === "FORBIDDEN"
    || serviceQuery.error?.data?.code === "FORBIDDEN";

  if (locked) return <LockedReport view={view} tier={planQuery.data?.tier ?? null} />;

  const fmt: ReportFormat = {
    pct: (share) => share.toLocaleString(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    count: (n) => n.toLocaleString(locale),
    day: (iso) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—"),
  };

  const active = view === "client"
    ? { hasData: !!clientQuery.data, empty: clientQuery.data?.rows.length === 0, error: clientQuery.error, refetch: () => void clientQuery.refetch(), stale: clientQuery.isPlaceholderData }
    : { hasData: !!serviceQuery.data, empty: serviceQuery.data?.rows.length === 0, error: serviceQuery.error, refetch: () => void serviceQuery.refetch(), stale: serviceQuery.isPlaceholderData };

  let body: ReactNode;
  if (active.hasData && active.empty) {
    body = (
      <div className={cn(CARD, "text-center")}>
        <div className="py-6">
          <Receipt className="mx-auto mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm text-slate-500">{c.empty}</p>
          <p className="mt-1 text-sm text-slate-500">{c.emptyPrefix}<Link to="/pos" className="font-semibold text-blue-600 hover:underline">{c.emptyLink}</Link>{c.emptySuffix}</p>
        </div>
      </div>
    );
  } else if (view === "client" && clientQuery.data) {
    body = <ClientReportView data={clientQuery.data} sort={clientSort} onSort={onClientSort} onFlip={onClientFlip} fmt={fmt} rangeLabel={rangeLabel} />;
  } else if (view === "service" && serviceQuery.data) {
    body = <ServiceReportView data={serviceQuery.data} sort={serviceSort} onSort={onServiceSort} onFlip={onServiceFlip} fmt={fmt} rangeLabel={rangeLabel} />;
  } else if (active.error) {
    body = (
      <div className={cn(CARD, "text-center")} role="alert">
        <div className="py-6">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" aria-hidden="true" />
          <p className="text-sm text-slate-900">{c.error}</p>
          <button type="button" onClick={active.refetch} className="mt-4 inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:h-10">{c.retry}</button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {c.loading}
      </div>
    );
  }

  return (
    <div className={cn("transition-opacity", active.stale && "opacity-60")} aria-busy={active.stale || undefined}>
      {body}
    </div>
  );
}

/** The plan doesn't include these reports: say what they'd show and how to get them. */
function LockedReport({ view, tier }: { view: ReportView; tier: string | null }) {
  const c = useCopy(clientReportsCopy);
  const t = useCopy(reportesCopy).locked;
  return (
    <section className={CARD} aria-labelledby="rep-locked-title">
      <div className="mx-auto max-w-lg py-4 text-center sm:py-6">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600"><Lock className="h-5 w-5" aria-hidden="true" /></span>
        <h2 id="rep-locked-title" className="mt-4 text-lg font-semibold text-slate-900">{c.locked.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{c.locked.text}</p>
        <ul className="mx-auto mt-4 max-w-sm space-y-2 text-left">
          {t.bullets[view].map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{b}
            </li>
          ))}
        </ul>
        {tier && <p className="mt-4 text-xs text-slate-500">{t.yourPlan(t.plans[tier] ?? tier)}</p>}
        <Link to="/settings" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-10 sm:w-auto">
          {c.locked.cta}
        </Link>
      </div>
    </section>
  );
}

function ariaSort<K extends string>(sort: SortState<K>, key: K): "ascending" | "descending" | "none" {
  return sort.key !== key ? "none" : sort.dir === "asc" ? "ascending" : "descending";
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  const cls = cn("h-3 w-3 shrink-0", active ? "text-slate-900" : "text-slate-300");
  if (!active) return <ArrowUpDown className={cls} aria-hidden="true" />;
  return asc ? <ArrowUp className={cls} aria-hidden="true" /> : <ArrowDown className={cls} aria-hidden="true" />;
}

function NameCell({ name, hint }: { name: string; hint?: string }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate" title={name}>{name}</span>
      {hint && <span className="block truncate text-xs font-normal text-slate-500">{hint}</span>}
    </span>
  );
}

function ShareCell({ share, label }: { share: number; label: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-1.5 w-12 rounded-full bg-blue-100" aria-hidden="true">
        <span className="block h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(share * 100, share > 0 ? 2 : 0))}%` }} />
      </span>
      <span>{label}</span>
    </span>
  );
}

function StatTiles({ items }: { items: Array<{ label: string; value: string; icon: LucideIcon }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><s.icon className="h-4 w-4" aria-hidden="true" /></span>
            <p className="min-w-0 truncate text-xs font-medium text-slate-500">{s.label}</p>
          </div>
          <p className="mt-2 truncate text-xl font-bold tabular-nums tracking-tight text-slate-900">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function TopList({ title, empty, items }: {
  title: string;
  empty: string;
  items: Array<{ key: string; name: string; amount: number; share: number; detail: string }>;
}) {
  return (
    <section className={CARD}>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ol className="mt-4 space-y-3.5">
          {items.map((it, i) => (
            <li key={it.key}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600" aria-hidden="true">{i + 1}</span>
                  <span className="truncate text-sm text-slate-800" title={it.name}>{it.name}</span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(it.amount)}</span>
              </div>
              <div className="flex items-center gap-2 pl-7">
                <div className="h-1.5 min-w-0 flex-1 rounded-full bg-blue-100" aria-hidden="true">
                  <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(it.share * 100, 2))}%` }} />
                </div>
                <span className="shrink-0 text-xs text-slate-500">{it.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Desktop: a table whose column headers sort it (aria-sort tells screen readers the order). */
function SortableTable<R extends { key: string }, K extends string>({ caption, columns, rows, sort, onSort }: {
  caption: string;
  columns: ReadonlyArray<SortableColumn<R, K>>;
  rows: readonly R[];
  sort: SortState<K>;
  onSort: (key: K) => void;
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-slate-200">
          {columns.map((col) => (
            <th key={col.key} scope="col" aria-sort={ariaSort(sort, col.key)} className={cn("py-2 text-xs font-medium", col.numeric ? "text-right" : "text-left")}>
              <button
                type="button"
                onClick={() => onSort(col.key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md py-1 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  col.numeric && "flex-row-reverse",
                  sort.key === col.key ? "text-slate-900" : "text-slate-500",
                )}
              >
                {col.label}
                <SortIcon active={sort.key === col.key} asc={sort.dir === "asc"} />
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => (
          <tr key={row.key} className="hover:bg-slate-50">
            {columns.map((col, i) =>
              i === 0 ? (
                <th key={col.key} scope="row" className="py-2.5 pr-3 text-left font-normal text-slate-900">
                  <div className="max-w-[14rem] lg:max-w-[20rem]">{col.cell(row)}</div>
                </th>
              ) : (
                <td key={col.key} className={cn("py-2.5 pl-3 text-slate-700", col.numeric && "text-right tabular-nums")}>{col.cell(row)}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-slate-200 bg-slate-50">
          {columns.map((col, i) =>
            i === 0 ? (
              <th key={col.key} scope="row" className="py-2.5 pl-2 text-left font-semibold text-slate-900">{col.foot}</th>
            ) : (
              <td key={col.key} className={cn("py-2.5 pl-3 font-semibold text-slate-900", col.numeric && "text-right tabular-nums")}>{col.foot}</td>
            ),
          )}
        </tr>
      </tfoot>
    </table>
  );
}

/** Phones: one card per row plus a totals card, with a sort picker instead of column headers. */
function SortableCards<R extends { key: string }, K extends string>({ caption, columns, rows, sort, onSort, onFlip, totalLabel }: {
  caption: string;
  columns: ReadonlyArray<SortableColumn<R, K>>;
  rows: readonly R[];
  sort: SortState<K>;
  onSort: (key: K) => void;
  onFlip: () => void;
  totalLabel: string;
}) {
  const c = useCopy(clientReportsCopy);
  const sortId = useId();
  const [title, ...others] = columns;
  const primary = others.find((col) => col.primary);
  const rest = others.filter((col) => !col.primary);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={sortId} className="mb-1.5 block text-xs font-medium text-slate-500">{c.sortBy}</label>
          <Select
            value={sort.key}
            onValueChange={(v) => {
              const col = columns.find((x) => x.key === v);
              if (col) onSort(col.key);
            }}
          >
            <SelectTrigger id={sortId} className="h-11 w-full rounded-[10px] border-slate-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (<SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={onFlip}
          aria-label={c.sortToggle(sort.dir === "asc")}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {sort.dir === "asc" ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <ul className="space-y-2" aria-label={caption}>
        {rows.map((row) => (
          <li key={row.key} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-sm font-medium text-slate-900">{title.cell(row)}</div>
              {primary && <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{primary.cell(row)}</p>}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {rest.map((col) => (
                <div key={col.key} className="min-w-0">
                  <dt className="truncate text-xs text-slate-500">{col.label}</dt>
                  <dd className="truncate text-sm tabular-nums text-slate-800">{col.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">{totalLabel}</p>
          {primary && <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{primary.foot}</p>}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {rest.filter((col) => col.foot !== "").map((col) => (
            <div key={col.key} className="min-w-0">
              <dt className="truncate text-xs text-slate-500">{col.label}</dt>
              <dd className="truncate text-sm font-medium tabular-nums text-slate-900">{col.foot}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** The detail card: table from md up, stacked cards below (no sideways scrolling on phones). */
function ReportDetail<R extends { key: string }, K extends string>(props: {
  caption: string;
  rangeLabel: string;
  columns: ReadonlyArray<SortableColumn<R, K>>;
  rows: readonly R[];
  sort: SortState<K>;
  onSort: (key: K) => void;
  onFlip: () => void;
  notes: string[];
}) {
  const c = useCopy(clientReportsCopy);
  return (
    <section className={CARD}>
      <h3 className="font-semibold text-slate-900">{props.caption}</h3>
      <p className="mt-0.5 text-sm text-slate-500">{props.rangeLabel}</p>
      <div className="mt-3 hidden md:block">
        <SortableTable caption={props.caption} columns={props.columns} rows={props.rows} sort={props.sort} onSort={props.onSort} />
      </div>
      <div className="mt-3 md:hidden">
        <SortableCards caption={props.caption} columns={props.columns} rows={props.rows} sort={props.sort} onSort={props.onSort} onFlip={props.onFlip} totalLabel={c.total} />
      </div>
      {props.notes.map((n) => (<p key={n} className="mt-3 text-xs text-slate-500">{n}</p>))}
    </section>
  );
}

function ClientReportView({ data, sort, onSort, onFlip, fmt, rangeLabel }: {
  data: ClientReport;
  sort: SortState<ClientSortKey>;
  onSort: (key: ClientSortKey) => void;
  onFlip: () => void;
  fmt: ReportFormat;
  rangeLabel: string;
}) {
  const c = useCopy(clientReportsCopy);
  const name = (r: ClientReportRow) => (r.customerId == null ? c.noCustomer : r.name ?? c.unnamedCustomer(r.customerId));
  const { totals } = data;
  const columns: Array<SortableColumn<ClientReportRow, ClientSortKey>> = [
    { key: "name", label: c.client.cols.name, cell: (r) => <NameCell name={name(r)} hint={r.customerId == null ? c.noCustomerHint : undefined} />, foot: c.total },
    { key: "salesCount", label: c.client.cols.salesCount, numeric: true, cell: (r) => fmt.count(r.salesCount), foot: fmt.count(totals.salesCount) },
    { key: "total", label: c.client.cols.total, numeric: true, primary: true, cell: (r) => money(r.total), foot: money(totals.total) },
    { key: "averageTicket", label: c.client.cols.averageTicket, numeric: true, cell: (r) => money(r.averageTicket), foot: money(totals.averageTicket) },
    { key: "lastSaleAt", label: c.client.cols.lastSaleAt, numeric: true, cell: (r) => fmt.day(r.lastSaleAt), foot: "" },
    { key: "share", label: c.client.cols.share, numeric: true, cell: (r) => <ShareCell share={r.share} label={fmt.pct(r.share)} />, foot: fmt.pct(totals.total > 0 ? 1 : 0) },
  ];
  const top = topBy(data.rows, "total", 5, (r) => r.customerId != null);
  return (
    <div className="space-y-4">
      <StatTiles items={[
        { label: c.client.stats.total, value: money(totals.total), icon: DollarSign },
        { label: c.client.stats.sales, value: fmt.count(totals.salesCount), icon: Receipt },
        { label: c.client.stats.average, value: money(totals.averageTicket), icon: TrendingUp },
        { label: c.client.stats.customers, value: fmt.count(totals.customers), icon: Users },
      ]} />
      <TopList
        title={c.client.top}
        empty={c.client.topEmpty}
        items={top.map((r) => ({ key: r.key, name: name(r), amount: r.total, share: r.share, detail: `${c.salesCount(r.salesCount)} · ${c.ofTotal(fmt.pct(r.share))}` }))}
      />
      <ReportDetail
        caption={c.client.caption}
        rangeLabel={rangeLabel}
        columns={columns}
        rows={sortRows(data.rows, sort.key, sort.dir)}
        sort={sort}
        onSort={onSort}
        onFlip={onFlip}
        notes={[c.onlyCompleted]}
      />
    </div>
  );
}

function ServiceReportView({ data, sort, onSort, onFlip, fmt, rangeLabel }: {
  data: ServiceReport & { discounts: number };
  sort: SortState<ServiceSortKey>;
  onSort: (key: ServiceSortKey) => void;
  onFlip: () => void;
  fmt: ReportFormat;
  rangeLabel: string;
}) {
  const c = useCopy(clientReportsCopy);
  // Custom charges are saved under one service with a Spanish name; show it in the UI language.
  const name = (r: ServiceReportRow) => (r.name === "Cargo personalizado" ? c.customCharge : r.name ?? c.unnamedService(r.serviceId ?? 0));
  const { totals } = data;
  const columns: Array<SortableColumn<ServiceReportRow, ServiceSortKey>> = [
    { key: "name", label: c.service.cols.name, cell: (r) => <NameCell name={name(r)} />, foot: c.total },
    { key: "quantity", label: c.service.cols.quantity, numeric: true, cell: (r) => fmt.count(r.quantity), foot: fmt.count(totals.quantity) },
    { key: "revenue", label: c.service.cols.revenue, numeric: true, primary: true, cell: (r) => money(r.revenue), foot: money(totals.revenue) },
    { key: "salesCount", label: c.service.cols.salesCount, numeric: true, cell: (r) => fmt.count(r.salesCount), foot: fmt.count(totals.salesCount) },
    { key: "share", label: c.service.cols.share, numeric: true, cell: (r) => <ShareCell share={r.share} label={fmt.pct(r.share)} />, foot: fmt.pct(totals.revenue > 0 ? 1 : 0) },
    { key: "averagePrice", label: c.service.cols.averagePrice, numeric: true, cell: (r) => money(r.averagePrice), foot: money(totals.averagePrice) },
  ];
  const top = topBy(data.rows, "revenue", 5);
  const notes = [c.onlyCompleted];
  if (data.discounts > 0) notes.push(c.service.discounts(money(data.discounts)));
  return (
    <div className="space-y-4">
      <StatTiles items={[
        { label: c.service.stats.revenue, value: money(totals.revenue), icon: DollarSign },
        { label: c.service.stats.quantity, value: fmt.count(totals.quantity), icon: Package },
        { label: c.service.stats.sales, value: fmt.count(totals.salesCount), icon: Receipt },
        { label: c.service.stats.services, value: fmt.count(totals.services), icon: Layers },
      ]} />
      <TopList
        title={c.service.top}
        empty={c.service.topEmpty}
        items={top.map((r) => ({ key: r.key, name: name(r), amount: r.revenue, share: r.share, detail: `${c.units(r.quantity)} · ${c.ofTotal(fmt.pct(r.share))}` }))}
      />
      <ReportDetail
        caption={c.service.caption}
        rangeLabel={rangeLabel}
        columns={columns}
        rows={sortRows(data.rows, sort.key, sort.dir)}
        sort={sort}
        onSort={onSort}
        onFlip={onFlip}
        notes={notes}
      />
    </div>
  );
}
