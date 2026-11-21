import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import type { DateRange } from "../../../api/lib/reportBooks";
import type { DrillTarget } from "./DrillDialog";
import { CARD, H3, TD, TH, money } from "./ui";

type Row = { key: string; name: string; total: number; count: number };

function SalesTable({ title, rows, total, loading, onPick, c }: { title: string; rows: Row[]; total: number; loading: boolean; onPick: (r: Row) => void; c: ReportesCopy }) {
  const B = c.byClient;
  return (
    <section className={CARD}>
      <h3 className={H3}>{title}</h3>
      {loading ? <div className="mt-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        : rows.length === 0 ? <p className="mt-3 text-sm text-slate-500">{B.empty}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr><th scope="col" className={TH}>{B.name}</th><th scope="col" className={cn(TH, "text-right")}>{B.sales}</th><th scope="col" className={cn(TH, "w-14 text-right")}>{B.pct}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className={cn(TD, "pr-3")}>
                      <button type="button" onClick={() => onPick(r)} className="min-h-11 text-left text-slate-900 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0">
                        {r.name}<span className="block text-xs text-slate-500">{B.count(r.count)}</span>
                      </button>
                    </td>
                    <td className={cn(TD, "text-right tabular-nums")}>{money(r.total)}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{total > 0 ? Math.round((r.total / total) * 100) : 0}%</td>
                  </tr>
                ))}
                <tr className="font-[750]"><td className={cn(TD, "border-b-0")}>{B.total}</td><td className={cn(TD, "border-b-0 text-right tabular-nums")}>{money(total)}</td><td className={cn(TD, "border-b-0 text-right")}>100%</td></tr>
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

/** "Por cliente" (Negocio): sales by client and by service for the period, each line opens its sales. */
export function ClientView({ range, tzOffsetHours, onDrill, c }: { range: DateRange; tzOffsetHours: number; onDrill: (t: DrillTarget) => void; c: ReportesCopy }) {
  const input = { ...range, tzOffsetHours };
  const clients = trpc.reports.byClient.useQuery(input, { staleTime: 30_000, placeholderData: (p) => p });
  const services = trpc.reports.byService.useQuery(input, { staleTime: 30_000, placeholderData: (p) => p });
  const cRows: Row[] = (clients.data?.rows ?? []).map((r) => ({ key: r.customerId === null ? "none" : String(r.customerId), name: r.name || c.whence.noClient, total: r.total, count: r.salesCount }))
    .sort((a, b) => b.total - a.total);
  const sRows: Row[] = (services.data?.rows ?? []).map((r) => ({ key: r.serviceId === null ? "none" : String(r.serviceId), name: r.name || c.whence.noService, total: r.revenue, count: r.salesCount }))
    .sort((a, b) => b.total - a.total);
  return (
    <div className="grid items-start gap-3.5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <SalesTable title={c.byClient.clients} rows={cRows} total={clients.data?.totals.total ?? 0} loading={clients.isLoading} c={c} onPick={(r) => onDrill({ kind: "client", key: r.key, label: r.name })} />
      <SalesTable title={c.byClient.services} rows={sRows} total={services.data?.totals.revenue ?? 0} loading={services.isLoading} c={c} onPick={(r) => onDrill({ kind: "service", key: r.key, label: r.name })} />
    </div>
  );
}
