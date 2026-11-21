import { Lock } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import { buildTips, change, keptPerHundred, yearPace, type SeriesMonth } from "../../../api/lib/reportBooks";
import { MonthChart } from "./MonthChart";
import type { DrillTarget } from "./DrillDialog";
import { CARD, H3, SEG, SEG_BTN, money0 } from "./ui";

export type Overview = {
  current: { moneyIn: number; moneyOut: number; salesCount: number };
  previous: { moneyIn: number; moneyOut: number };
  series: SeriesMonth[];
  /** Everything spent (Gastos' computation), by Gastos' category. */
  categories: Array<{ category: string; total: number; prevTotal: number; count: number }>;
  /** The income statement's side: recorded expenses by category, and the bank charges no expense records yet. */
  statement: {
    booked: Array<{ category: string; total: number; prevTotal: number; count: number }>;
    unbookedBank: { total: number; prevTotal: number; count: number };
  };
  services: Array<{ key: string; name: string | null; total: number }>;
  prevServices: Array<{ name: string; total: number }>;
  clients: Array<{ key: string; name: string | null; total: number }> | null;
  clientsLocked: boolean;
};

/** One KPI card (.kpi): label, big number, the change line. */
export function Kpi({ label, value, line, good, accent }: { label: string; value: string; line: string; good: boolean | null; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-slate-200 bg-white px-4 py-3.5 max-sm:p-3">
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className={cn("mt-0.5 truncate text-[19px] font-[750] tabular-nums tracking-[-0.02em] sm:text-[23px]", accent ? "text-emerald-600" : "text-slate-900")}>{value}</div>
      <div className={cn("mt-[3px] text-xs", good === null ? "text-slate-500" : good ? "text-emerald-600" : "text-red-600")}>{line}</div>
    </div>
  );
}

/** The three numbers: Entró, Salió, Te quedó, each against the previous period (rpChg). */
export function KpiRow({ data, vs, c }: { data: Overview; vs: string; c: ReportesCopy }) {
  const cur = data.current;
  const prev = data.previous;
  const profit = Math.round((cur.moneyIn - cur.moneyOut) * 100) / 100;
  const prevProfit = Math.round((prev.moneyIn - prev.moneyOut) * 100) / 100;
  const line = (a: number, b: number, upGood: boolean) => {
    const ch = change(a, b, upGood);
    return ch.pct === null ? { line: c.kpi.noPrev(vs), good: null } : { line: c.kpi.vs(ch.pct, ch.dir, vs), good: ch.good };
  };
  const kept = line(profit, prevProfit, true);
  const per = keptPerHundred(cur.moneyIn, profit);
  return (
    <section className="grid gap-3 md:grid-cols-3" aria-label={c.title}>
      <Kpi label={c.kpi.in} value={money0(cur.moneyIn)} {...line(cur.moneyIn, prev.moneyIn, true)} />
      <Kpi label={c.kpi.out} value={money0(cur.moneyOut)} {...line(cur.moneyOut, prev.moneyOut, false)} />
      <Kpi
        label={profit < 0 ? c.kpi.lost : c.kpi.kept}
        value={money0(profit)}
        accent={profit >= 0}
        good={kept.good}
        line={per !== null && profit >= 0 ? `${kept.line} · ${c.kpi.per100(per)}` : kept.line}
      />
    </section>
  );
}

/** Bars you can tap (clickBars): label, bar, amount. */
export function ClickBars({ rows, onPick, label }: { rows: Array<{ key: string; name: string; total: number }>; onPick: (key: string, name: string) => void; label: string }) {
  const max = Math.max(...rows.map((r) => r.total), 0.01);
  return (
    <ul className="mt-3 grid gap-1" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onPick(r.key, r.name)}
            className="grid min-h-11 w-full grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-2.5 rounded-lg px-1.5 py-[5px] text-left text-[13px] text-slate-900 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0 sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_80px] sm:text-sm"
          >
            <span className="truncate">{r.name}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.max(0, (r.total / max) * 100).toFixed(1)}%` }} />
            </span>
            <span className="text-right tabular-nums">{money0(r.total)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SimpleView({ data, highlight, vs, today, source, onSource, canClients, onDrill, catLabel, c }: {
  data: Overview;
  highlight: string[];
  vs: string;
  today: string;
  source: "svc" | "cli";
  onSource: (s: "svc" | "cli") => void;
  canClients: boolean;
  onDrill: (t: DrillTarget) => void;
  /** A spending category in words. */
  catLabel: (category: string) => string;
  c: ReportesCopy;
}) {
  const cats = data.categories.filter((x) => x.total > 0).map((x) => ({ key: x.category, name: catLabel(x.category), total: x.total }));
  const useClients = source === "cli" && canClients && !!data.clients;
  const src = useClients
    ? (data.clients ?? []).filter((x) => x.total > 0).map((x) => ({ key: x.key, name: x.name || c.whence.noClient, total: x.total }))
    : data.services.filter((x) => x.total > 0).map((x) => ({ key: x.key, name: x.name || c.whence.noService, total: x.total }));
  const topCat = cats[0]?.name ?? null;
  const tips = buildTips({
    moneyIn: data.current.moneyIn, prevIn: data.previous.moneyIn, moneyOut: data.current.moneyOut, prevOut: data.previous.moneyOut,
    services: data.services.map((s) => ({ name: s.name ?? "", total: s.total })), prevServices: data.prevServices, topCategory: topCat,
    pace: yearPace(data.series, today),
  });

  return (
    <>
      <KpiRow data={data} vs={vs} c={c} />

      <section className={CARD} aria-labelledby="rp-chart-h">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id="rp-chart-h" className={H3}>{c.chart.title}</h3>
          <span className="text-xs text-slate-500">{c.chart.sub}</span>
        </div>
        <MonthChart months={data.series} highlight={highlight} c={c} />
      </section>

      <div className="grid items-start gap-3.5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className={CARD} aria-labelledby="rp-where-h">
          <div className="flex items-center justify-between gap-2">
            <h3 id="rp-where-h" className={H3}>{c.where.title}</h3>
            {cats.length > 0 && <span className="text-xs text-slate-500">{c.where.sub}</span>}
          </div>
          {cats.length === 0
            ? <p className="mt-3 text-sm text-slate-500">{c.where.empty}</p>
            : <ClickBars rows={cats} label={c.where.title} onPick={(key, name) => onDrill({ kind: "category", key, label: name })} />}
        </section>

        <section className={CARD} aria-labelledby="rp-whence-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="rp-whence-h" className={H3}>{c.whence.title}</h3>
            <div className={SEG} role="group" aria-label={c.whence.seg}>
              <button type="button" aria-pressed={!useClients} className={SEG_BTN} onClick={() => onSource("svc")}>{c.whence.service}</button>
              {canClients
                ? <button type="button" aria-pressed={useClients} className={SEG_BTN} onClick={() => onSource("cli")}>{c.whence.client}</button>
                : <Link to="/settings?sec=plan" title={c.whence.lockedClient} aria-label={`${c.whence.client} · ${c.whence.lockedClient}`} className={SEG_BTN}><Lock className="h-[13px] w-[13px]" aria-hidden="true" />{c.whence.client}</Link>}
            </div>
          </div>
          {src.length === 0
            ? <p className="mt-3 text-sm text-slate-500">{useClients ? c.whence.emptyClient : c.whence.emptyService}</p>
            : <ClickBars rows={src} label={c.whence.title} onPick={(key, name) => onDrill({ kind: useClients ? "client" : "service", key, label: name })} />}
          {tips.length > 0 && (
            <ul className="mt-3.5 grid list-disc gap-1.5 pl-[18px] text-sm text-slate-900">
              {tips.map((t, i) => (
                <li key={i}>
                  {t.kind === "sales" ? (t.dir === "up" ? c.tips.salesUp(t.pct, vs, t.driver) : c.tips.salesDown(t.pct, vs, t.driver))
                    : t.kind === "salesNew" ? c.tips.salesNew(vs)
                    : t.kind === "expenses" ? c.tips.expenses(t.dir, t.pct, t.top)
                    : c.tips.pace(t.year, money0(Math.abs(t.profit)), t.profit < 0)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
